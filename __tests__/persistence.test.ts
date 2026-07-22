import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Plugin } from '~/plugins';
import {
  buildChapterIndex,
  buildMangaIndex,
  buildProgressPairs,
  readPersistedSnapshot,
  writeFullSnapshot,
  writeSnapshotProgress,
  writeSnapshotTasks,
} from '~/redux/persistence';
import { initialState } from '~/redux/slice';
import { normalizeTaskForRestart } from '~/redux/task';
import { AsyncStatus, MangaStatus, TaskType } from '~/utils';
import { Storage } from '~/utils/storage';

const favoriteMangaHash = `${Plugin.MBZ}&favorite`;
const favoriteChapterHash = `${favoriteMangaHash}&chapter-1`;
const transientMangaHash = `${Plugin.MBZ}&transient`;
const transientChapterHash = `${transientMangaHash}&chapter-1`;

const state = {
  favorites: [{ mangaHash: favoriteMangaHash, isTrend: false, enableBatch: true }],
  dict: {
    manga: {
      [favoriteMangaHash]: {
        title: '收藏漫画',
        chapters: [{ hash: favoriteChapterHash }],
      },
      [transientMangaHash]: {
        title: '临时搜索结果',
        chapters: [{ hash: transientChapterHash }],
      },
    },
    chapter: {
      [favoriteChapterHash]: { hash: favoriteChapterHash, images: [{ uri: '1.jpg' }] },
      [transientChapterHash]: { hash: transientChapterHash, images: [{ uri: '2.jpg' }] },
    },
    record: {
      [favoriteChapterHash]: {
        total: 1,
        progress: 100,
        imagesLoaded: [1],
        isVisited: true,
      },
    },
    lastWatch: {
      [favoriteMangaHash]: { chapter: favoriteChapterHash, page: 1 },
    },
  },
} as unknown as RootState;

describe('增量持久化', () => {
  it('索引只包含收藏漫画及其已加载章节', () => {
    expect(buildMangaIndex(state)).toEqual([favoriteMangaHash]);
    expect(buildChapterIndex(state)).toEqual([favoriteChapterHash]);
  });

  it('翻页仅序列化发生变化的收藏条目', () => {
    const pairs = buildProgressPairs(
      state,
      [favoriteMangaHash, transientMangaHash],
      [favoriteChapterHash, transientChapterHash]
    );

    expect(pairs.map(([key]) => key)).toEqual([favoriteMangaHash, favoriteChapterHash]);
    expect(JSON.parse(pairs[0][1])).toEqual({
      manga: state.dict.manga[favoriteMangaHash],
      lastWatch: state.dict.lastWatch[favoriteMangaHash],
    });
    expect(JSON.parse(pairs[1][1])).toEqual({
      chapter: state.dict.chapter[favoriteChapterHash],
      record: state.dict.record[favoriteChapterHash],
    });
  });
});

describe('generation 快照原子性', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createState = (title: string): RootState => {
    const next: RootState = JSON.parse(JSON.stringify(initialState));
    next.favorites = [{ mangaHash: favoriteMangaHash, isTrend: false, enableBatch: true }];
    next.dict.manga[favoriteMangaHash] = {
      href: 'https://example.test/manga',
      hash: favoriteMangaHash,
      source: Plugin.MBZ,
      sourceName: '漫画BZ',
      mangaId: 'favorite',
      bookCover: '',
      infoCover: '',
      title,
      latest: '',
      updateTime: '',
      author: [],
      tag: [],
      status: MangaStatus.Unknown,
      chapters: [],
    };
    return next;
  };

  const mockStorage = () => {
    const values = new Map<string, string>();
    jest.spyOn(Storage, 'getItem').mockImplementation(async (key) => values.get(key) ?? null);
    jest.spyOn(Storage, 'setItem').mockImplementation(async (key, value) => {
      values.set(key, value);
    });
    jest
      .spyOn(Storage, 'multiGet')
      .mockImplementation(async (keys) =>
        keys.map((key): [string, string | null] => [key, values.get(key) ?? null])
      );
    jest.spyOn(Storage, 'multiSet').mockImplementation(async (pairs) => {
      pairs.forEach(([key, value]) => values.set(key, value));
    });
    jest.spyOn(Storage, 'multiRemove').mockImplementation(async (keys) => {
      keys.forEach((key) => values.delete(key));
    });
    jest.spyOn(Storage, 'getAllKeys').mockImplementation(async () => Array.from(values.keys()));
    return values;
  };

  it('实体写入中途失败时仍读取上一代完整快照', async () => {
    const values = mockStorage();
    await writeFullSnapshot(createState('旧标题'));
    const committedManifest = values.get('@snapshotManifest');

    jest.spyOn(Storage, 'multiSet').mockImplementationOnce(async (pairs) => {
      values.set(pairs[0][0], pairs[0][1]);
      throw new Error('故障注入：磁盘已满');
    });
    await expect(writeFullSnapshot(createState('新标题'))).rejects.toThrow('磁盘已满');

    expect(values.get('@snapshotManifest')).toBe(committedManifest);
    const restored = await readPersistedSnapshot();
    expect(restored?.dict.manga[favoriteMangaHash]?.title).toBe('旧标题');
  });

  it('manifest 提交失败只留下不可见实体，不会切换快照', async () => {
    const values = mockStorage();
    await writeFullSnapshot(createState('旧标题'));
    const committedManifest = values.get('@snapshotManifest');
    jest.spyOn(Storage, 'setItem').mockRejectedValueOnce(new Error('故障注入：提交失败'));

    await expect(writeFullSnapshot(createState('新标题'))).rejects.toThrow('提交失败');
    expect(values.get('@snapshotManifest')).toBe(committedManifest);
    expect((await readPersistedSnapshot())?.dict.manga[favoriteMangaHash]?.title).toBe('旧标题');
  });

  it('全量写失败后重建索引会先补齐新增实体，不提交悬空引用', async () => {
    const values = mockStorage();
    await writeFullSnapshot(createState('旧标题'));

    const expanded = createState('旧标题');
    expanded.favorites.push({
      mangaHash: transientMangaHash,
      isTrend: false,
      enableBatch: true,
    });
    const favoriteManga = expanded.dict.manga[favoriteMangaHash];
    if (!favoriteManga) {
      throw new Error('测试数据缺少基础漫画');
    }
    expanded.dict.manga[transientMangaHash] = {
      ...favoriteManga,
      hash: transientMangaHash,
      mangaId: 'transient',
      title: '新增收藏',
      chapters: [
        {
          hash: transientChapterHash,
          mangaId: 'transient',
          chapterId: 'chapter-1',
          title: '第一话',
          href: '/chapter-1',
        },
      ],
    };
    expanded.dict.chapter[transientChapterHash] = {
      hash: transientChapterHash,
      mangaId: 'transient',
      chapterId: 'chapter-1',
      title: '第一话',
      images: [{ uri: 'https://example.test/1.jpg' }],
      headers: {},
    };

    jest.spyOn(Storage, 'multiSet').mockImplementationOnce(async (pairs) => {
      values.set(pairs[0][0], pairs[0][1]);
      throw new Error('故障注入：全量实体中途失败');
    });
    await expect(writeFullSnapshot(expanded)).rejects.toThrow('全量实体中途失败');

    await writeSnapshotProgress(expanded, [transientMangaHash], [], true);
    const restored = await readPersistedSnapshot();
    expect(restored?.dict.manga[transientMangaHash]?.title).toBe('新增收藏');
    expect(restored?.dict.chapter[transientChapterHash]?.title).toBe('第一话');
  });

  it('任务断点独立换代，不重写漫画实体且重启只排队未完成 job', async () => {
    const values = mockStorage();
    const before = createState('收藏漫画');
    before.task.list = [
      {
        taskId: 'task-1',
        chapterHash: favoriteChapterHash,
        title: '第一话',
        type: TaskType.Download,
        status: AsyncStatus.Pending,
        downloadPath: '/tmp',
        queue: [
          { index: 0, jobId: 'done', source: 'https://example.test/1.jpg' },
          { index: 1, jobId: 'todo', source: 'https://example.test/2.jpg' },
        ],
        pending: ['done'],
        success: [],
        fail: [],
      },
    ];
    before.task.job.list = before.task.list[0].queue.map((item) => ({
      ...item,
      taskId: 'task-1',
      chapterHash: favoriteChapterHash,
      type: TaskType.Download,
      status: AsyncStatus.Default,
    }));
    await writeFullSnapshot(before);
    const firstManifest = JSON.parse(values.get('@snapshotManifest')!);

    const after: RootState = JSON.parse(JSON.stringify(before));
    after.task.list[0].pending = [];
    after.task.list[0].success = ['done'];
    after.task.job.list = after.task.job.list.filter(({ jobId }) => jobId === 'todo');
    const multiSet = jest.mocked(Storage.multiSet);
    multiSet.mockClear();

    await writeSnapshotTasks(after);

    const writtenKeys = multiSet.mock.calls.flatMap(([pairs]) => pairs.map(([key]) => key));
    expect(writtenKeys.some((key) => key.includes(':manga:'))).toBe(false);
    expect(writtenKeys.some((key) => key.includes(':chapter:'))).toBe(false);
    expect(writtenKeys.some((key) => key.includes(':task:task-1'))).toBe(true);
    const secondManifest = JSON.parse(values.get('@snapshotManifest')!);
    expect(secondManifest.generation).toBe(firstManifest.generation);
    expect(secondManifest.taskGeneration).not.toBe(firstManifest.taskGeneration);

    const restored = await readPersistedSnapshot();
    expect(restored?.task.list[0].success).toEqual(['done']);
    expect(normalizeTaskForRestart(restored!.task).job.list.map(({ jobId }) => jobId)).toEqual([
      'todo',
    ]);
  });

  it('全量快照拒绝重复 task/job 标识，避免实体键互相覆盖', async () => {
    const invalid = createState('收藏漫画');
    invalid.task.list = [
      {
        taskId: 'task-1',
        chapterHash: favoriteChapterHash,
        title: '第一话',
        type: TaskType.Download,
        status: AsyncStatus.Default,
        downloadPath: '/tmp',
        queue: [
          { index: 0, jobId: 'duplicate', source: 'https://example.test/1.jpg' },
          { index: 1, jobId: 'duplicate', source: 'https://example.test/2.jpg' },
        ],
        pending: [],
        success: [],
        fail: [],
      },
    ];

    await expect(writeFullSnapshot(invalid)).rejects.toThrow('任务标识发生冲突');
  });
});
