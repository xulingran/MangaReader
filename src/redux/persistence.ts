import { combineHash, splitHash } from '~/plugins';
import { storageKey } from '~/utils';
import { Storage } from '~/utils/storage';
import { nanoid } from '@reduxjs/toolkit';

export type PersistencePair = [string, string];

const SNAPSHOT_SCHEMA_VERSION = 1;
const SNAPSHOT_PREFIX = '@snapshot:';

type SnapshotEntity = 'manga' | 'chapter' | 'task' | 'job';

export interface SnapshotManifest {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  generation: string;
  /** 任务独立换代，避免每个下载进度都复制漫画/章节实体。 */
  taskGeneration: string;
  favorites: RootState['favorites'];
  plugin: RootState['plugin'];
  setting: RootState['setting'];
  mangaIndex: string[];
  chapterIndex: string[];
  taskIndex: string[];
  jobIndex: string[];
  jobMax: number;
}

export type PersistedSnapshot = Pick<
  RootState,
  'favorites' | 'plugin' | 'setting' | 'dict' | 'task'
>;

let persistenceTail: Promise<void> = Promise.resolve();

/**
 * MMKV 的批量写仍是逐 key 提交。所有持久化操作经同一队列串行化，实体先写到
 * 新 generation，最后用单个 manifest key 切换可见快照，避免读到混合版本。
 */
const withPersistenceLock = <T>(operation: () => Promise<T>): Promise<T> => {
  const result = persistenceTail.then(operation, operation);
  persistenceTail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
};

const snapshotEntityKey = (generation: string, entity: SnapshotEntity, id: string) =>
  `${SNAPSHOT_PREFIX}${generation}:${entity}:${id}`;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const isUniqueStringArray = (value: unknown): value is string[] =>
  isStringArray(value) && new Set(value).size === value.length;

const assertUniqueTaskIdentifiers = (task: RootState['task']) => {
  const taskIds = task.list.map(({ taskId }) => taskId);
  const queuedJobIds = task.list.flatMap(({ queue }) => queue.map(({ jobId }) => jobId));
  const activeJobIds = task.job.list.map(({ jobId }) => jobId);
  if (
    new Set(taskIds).size !== taskIds.length ||
    new Set(queuedJobIds).size !== queuedJobIds.length ||
    new Set(activeJobIds).size !== activeJobIds.length
  ) {
    throw new Error('任务标识发生冲突，拒绝写入不完整快照');
  }
};

export const parseSnapshotManifest = (source: string | null): SnapshotManifest | undefined => {
  if (!source) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(source);
  const m = parsed as Partial<SnapshotManifest>;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    m.schemaVersion !== SNAPSHOT_SCHEMA_VERSION ||
    typeof m.generation !== 'string' ||
    !Array.isArray(m.favorites) ||
    !m.plugin ||
    !m.setting ||
    !isStringArray(m.mangaIndex) ||
    !isStringArray(m.chapterIndex) ||
    !isUniqueStringArray(m.taskIndex) ||
    !isUniqueStringArray(m.jobIndex) ||
    !Number.isInteger(m.jobMax)
  ) {
    throw new Error('本地快照清单格式错误');
  }
  const manifest = parsed as SnapshotManifest;
  if (manifest.taskGeneration !== undefined && typeof manifest.taskGeneration !== 'string') {
    throw new Error('本地快照任务清单格式错误');
  }
  return {
    ...manifest,
    // 兼容 taskGeneration 引入前的 generation=任务 generation 快照。
    taskGeneration: manifest.taskGeneration || manifest.generation,
  };
};

const favoriteHashSet = (state: RootState) =>
  new Set(state.favorites.map(({ mangaHash }) => mangaHash));

export const buildMangaIndex = (state: RootState): string[] => {
  return state.favorites.flatMap(({ mangaHash }) => {
    const manga = state.dict.manga[mangaHash];
    const lastWatch = state.dict.lastWatch[mangaHash];
    return manga !== undefined || lastWatch !== undefined ? [mangaHash] : [];
  });
};

export const buildChapterIndex = (state: RootState): string[] => {
  const result = new Set<string>();

  state.favorites.forEach(({ mangaHash }) => {
    state.dict.manga[mangaHash]?.chapters.forEach(({ hash: chapterHash }) => {
      if (
        state.dict.chapter[chapterHash] !== undefined ||
        state.dict.record[chapterHash] !== undefined
      ) {
        result.add(chapterHash);
      }
    });
  });

  return Array.from(result);
};

/** 只序列化发生变化的收藏漫画/章节，避免翻页时复制整份离线库。 */
export const buildProgressPairs = (
  state: RootState,
  mangaHashes: Iterable<string>,
  chapterHashes: Iterable<string>
): PersistencePair[] => {
  const favorites = favoriteHashSet(state);
  const pairs: PersistencePair[] = [];

  new Set(mangaHashes).forEach((mangaHash) => {
    if (!favorites.has(mangaHash)) {
      return;
    }
    const manga = state.dict.manga[mangaHash];
    const lastWatch = state.dict.lastWatch[mangaHash];
    if (manga !== undefined || lastWatch !== undefined) {
      pairs.push([mangaHash, JSON.stringify({ manga, lastWatch })]);
    }
  });

  new Set(chapterHashes).forEach((chapterHash) => {
    const [source, mangaId] = splitHash(chapterHash);
    if (!favorites.has(combineHash(source, mangaId))) {
      return;
    }
    const chapter = state.dict.chapter[chapterHash];
    const record = state.dict.record[chapterHash];
    if (chapter !== undefined || record !== undefined) {
      pairs.push([chapterHash, JSON.stringify({ chapter, record })]);
    }
  });

  return pairs;
};

export const stripPluginCredentials = (plugin: RootState['plugin']): RootState['plugin'] => {
  const safe = { ...plugin } as RootState['plugin'] & {
    extra?: Record<string, unknown>;
  };
  delete safe.extra;
  return safe;
};

export const buildSnapshotManifest = (state: RootState, generation: string): SnapshotManifest => ({
  schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  generation,
  taskGeneration: generation,
  favorites: state.favorites,
  plugin: stripPluginCredentials(state.plugin),
  setting: state.setting,
  mangaIndex: buildMangaIndex(state),
  chapterIndex: buildChapterIndex(state),
  taskIndex: state.task.list.map(({ taskId }) => taskId),
  jobIndex: state.task.job.list.map(({ jobId }) => jobId),
  jobMax: state.task.job.max,
});

const buildSnapshotDataPairs = (
  state: RootState,
  manifest: SnapshotManifest
): PersistencePair[] => {
  const pairs: PersistencePair[] = [];
  manifest.mangaIndex.forEach((mangaHash) => {
    pairs.push([
      snapshotEntityKey(manifest.generation, 'manga', mangaHash),
      JSON.stringify({
        manga: state.dict.manga[mangaHash],
        lastWatch: state.dict.lastWatch[mangaHash],
      }),
    ]);
  });
  manifest.chapterIndex.forEach((chapterHash) => {
    pairs.push([
      snapshotEntityKey(manifest.generation, 'chapter', chapterHash),
      JSON.stringify({
        chapter: state.dict.chapter[chapterHash],
        record: state.dict.record[chapterHash],
      }),
    ]);
  });
  state.task.list.forEach((item) =>
    pairs.push([
      snapshotEntityKey(manifest.taskGeneration, 'task', item.taskId),
      JSON.stringify(item),
    ])
  );
  state.task.job.list.forEach((item) =>
    pairs.push([
      snapshotEntityKey(manifest.taskGeneration, 'job', item.jobId),
      JSON.stringify(item),
    ])
  );
  return pairs;
};

const liveSnapshotKeys = (manifest: SnapshotManifest) =>
  new Set([
    ...manifest.mangaIndex.map((id) => snapshotEntityKey(manifest.generation, 'manga', id)),
    ...manifest.chapterIndex.map((id) => snapshotEntityKey(manifest.generation, 'chapter', id)),
    ...manifest.taskIndex.map((id) => snapshotEntityKey(manifest.taskGeneration, 'task', id)),
    ...manifest.jobIndex.map((id) => snapshotEntityKey(manifest.taskGeneration, 'job', id)),
    storageKey.snapshotManifest,
  ]);

const removeInactiveStorage = async (manifest: SnapshotManifest) => {
  const keys = await Storage.getAllKeys();
  const liveKeys = liveSnapshotKeys(manifest);
  const staleKeys = keys.filter((key) => !liveKeys.has(key));
  if (staleKeys.length > 0) {
    await Storage.multiRemove(staleKeys);
  }
};

const writeFullSnapshotUnlocked = async (state: RootState): Promise<SnapshotManifest> => {
  assertUniqueTaskIdentifiers(state.task);
  const manifest = buildSnapshotManifest(state, nanoid());
  const dataPairs = buildSnapshotDataPairs(state, manifest);
  if (dataPairs.length > 0) {
    await Storage.multiSet(dataPairs);
  }
  // 唯一提交点：此前失败不会改变当前可见 generation。
  await Storage.setItem(storageKey.snapshotManifest, JSON.stringify(manifest));
  try {
    await removeInactiveStorage(manifest);
  } catch (error) {
    // 清理失败只留下不可见的旧 generation，不能把已经成功的提交报告为失败。
    console.warn('清理旧本地快照失败，将在下次启动重试', error);
  }
  return manifest;
};

export const writeFullSnapshot = (state: RootState) =>
  withPersistenceLock(() => writeFullSnapshotUnlocked(state));

type SnapshotMetadataField = 'favorites' | 'plugin' | 'setting';

export const writeSnapshotMetadata = (state: RootState, fields: SnapshotMetadataField[]) =>
  withPersistenceLock(async () => {
    const current = parseSnapshotManifest(await Storage.getItem(storageKey.snapshotManifest));
    if (!current) {
      await writeFullSnapshotUnlocked(state);
      return;
    }
    const manifest: SnapshotManifest = { ...current };
    if (fields.includes('favorites')) {
      const committedFavorites = new Set(current.favorites.map(({ mangaHash }) => mangaHash));
      // 收藏增删由全量 generation 提交；这里只更新已经提交条目的浏览/批量开关元数据。
      manifest.favorites = state.favorites.filter(({ mangaHash }) =>
        committedFavorites.has(mangaHash)
      );
    }
    if (fields.includes('plugin')) manifest.plugin = stripPluginCredentials(state.plugin);
    if (fields.includes('setting')) manifest.setting = state.setting;
    await Storage.setItem(storageKey.snapshotManifest, JSON.stringify(manifest));
  });

export const writeSnapshotTasks = (state: RootState) =>
  withPersistenceLock(async () => {
    const current = parseSnapshotManifest(await Storage.getItem(storageKey.snapshotManifest));
    if (!current) {
      await writeFullSnapshotUnlocked(state);
      return;
    }
    const taskGeneration = nanoid();
    assertUniqueTaskIdentifiers(state.task);
    const taskIndex = state.task.list.map(({ taskId }) => taskId);
    const jobIndex = state.task.job.list.map(({ jobId }) => jobId);
    const pairs: PersistencePair[] = [
      ...state.task.list.map(
        (item): PersistencePair => [
          snapshotEntityKey(taskGeneration, 'task', item.taskId),
          JSON.stringify(item),
        ]
      ),
      ...state.task.job.list.map(
        (item): PersistencePair => [
          snapshotEntityKey(taskGeneration, 'job', item.jobId),
          JSON.stringify(item),
        ]
      ),
    ];
    if (pairs.length > 0) {
      await Storage.multiSet(pairs);
    }
    const manifest: SnapshotManifest = {
      ...current,
      taskGeneration,
      taskIndex,
      jobIndex,
      jobMax: state.task.job.max,
    };
    await Storage.setItem(storageKey.snapshotManifest, JSON.stringify(manifest));
    try {
      await removeInactiveStorage(manifest);
    } catch (error) {
      console.warn('清理旧任务快照失败，将在下次启动重试', error);
    }
  });

export const writeSnapshotProgress = (
  state: RootState,
  mangaHashes: Iterable<string>,
  chapterHashes: Iterable<string>,
  rebuildIndexes: boolean
) =>
  withPersistenceLock(async () => {
    const current = parseSnapshotManifest(await Storage.getItem(storageKey.snapshotManifest));
    if (!current) {
      await writeFullSnapshotUnlocked(state);
      return;
    }

    const manga = new Set(mangaHashes);
    const chapter = new Set(chapterHashes);
    let mangaIndex = current.mangaIndex;
    let chapterIndex = current.chapterIndex;
    if (rebuildIndexes) {
      mangaIndex = buildMangaIndex(state);
      chapterIndex = buildChapterIndex(state);
      // manifest 只能在其引用的全部实体已存在后提交。此前若一次 full snapshot
      // 在实体阶段失败，Redux 可能比旧 manifest 多出整组收藏数据；把所有新增索引
      // 对应实体并入本次写入，不能只写触发当前 action 的 dirty 项。
      const committedManga = new Set(current.mangaIndex);
      const committedChapter = new Set(current.chapterIndex);
      mangaIndex.forEach((id) => !committedManga.has(id) && manga.add(id));
      chapterIndex.forEach((id) => !committedChapter.has(id) && chapter.add(id));
    }
    const pairs = buildProgressPairs(state, manga, chapter).map(
      ([id, value]): PersistencePair => [
        snapshotEntityKey(current.generation, chapter.has(id) ? 'chapter' : 'manga', id),
        value,
      ]
    );
    if (pairs.length > 0) {
      await Storage.multiSet(pairs);
    }
    if (rebuildIndexes) {
      const manifest: SnapshotManifest = {
        ...current,
        mangaIndex,
        chapterIndex,
      };
      await Storage.setItem(storageKey.snapshotManifest, JSON.stringify(manifest));
    }
  });

const readEntities = async <T>(
  generation: string,
  entity: SnapshotEntity,
  ids: string[]
): Promise<Record<string, T>> => {
  const pairs = await Storage.multiGet(ids.map((id) => snapshotEntityKey(generation, entity, id)));
  const result: Record<string, T> = {};
  pairs.forEach(([, value], index) => {
    if (value === null) {
      throw new Error(`本地快照缺少 ${entity} 数据`);
    }
    result[ids[index]] = JSON.parse(value) as T;
  });
  return result;
};

export const readPersistedSnapshot = (): Promise<PersistedSnapshot | undefined> =>
  withPersistenceLock(async () => {
    const manifest = parseSnapshotManifest(await Storage.getItem(storageKey.snapshotManifest));
    if (!manifest) {
      return undefined;
    }
    const [manga, chapter, tasks, jobs] = await Promise.all([
      readEntities<{
        manga?: Manga;
        lastWatch?: RootState['dict']['lastWatch'][string];
      }>(manifest.generation, 'manga', manifest.mangaIndex),
      readEntities<{
        chapter?: Chapter;
        record?: RootState['dict']['record'][string];
      }>(manifest.generation, 'chapter', manifest.chapterIndex),
      readEntities<Task>(manifest.taskGeneration, 'task', manifest.taskIndex),
      readEntities<Job>(manifest.taskGeneration, 'job', manifest.jobIndex),
    ]);
    const dict: RootState['dict'] = { manga: {}, chapter: {}, lastWatch: {}, record: {} };
    manifest.mangaIndex.forEach((id) => {
      const { manga: mangaValue, lastWatch } = manga[id];
      if (mangaValue !== undefined) dict.manga[id] = mangaValue;
      if (lastWatch !== undefined) dict.lastWatch[id] = lastWatch;
    });
    manifest.chapterIndex.forEach((id) => {
      const { chapter: chapterValue, record } = chapter[id];
      if (chapterValue !== undefined) dict.chapter[id] = chapterValue;
      if (record !== undefined) dict.record[id] = record;
    });
    return {
      favorites: manifest.favorites,
      plugin: manifest.plugin,
      setting: manifest.setting,
      dict,
      task: {
        list: manifest.taskIndex.map((id) => tasks[id]),
        job: {
          max: manifest.jobMax,
          list: manifest.jobIndex.map((id) => jobs[id]),
          thread: [],
        },
      },
    };
  });

export const garbageCollectSnapshots = () =>
  withPersistenceLock(async () => {
    const manifest = parseSnapshotManifest(await Storage.getItem(storageKey.snapshotManifest));
    if (manifest) {
      try {
        await removeInactiveStorage(manifest);
      } catch (error) {
        console.warn('清理无效本地快照失败，将在下次启动重试', error);
      }
    }
  });
