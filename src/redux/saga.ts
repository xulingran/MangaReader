import {
  all,
  put,
  take,
  fork,
  call,
  select,
  takeEvery,
  takeLatest,
  takeLeading,
  delay,
  race,
} from 'redux-saga/effects';
import {
  storageKey,
  fetchData,
  haveError,
  validate,
  validateSampled,
  migrateSetting,
  getLatestRelease,
  pairsToDict,
  trycatch,
  nonNullable,
  statusToLabel,
  ErrorMessage,
  AsyncStatus,
  TaskType,
  TemplateKey,
} from '~/utils';
import { PermissionsAndroid, Platform } from 'react-native';
import { splitHash, combineHash, Plugin, PluginMap } from '~/plugins';
import { nanoid, Action, PayloadAction } from '@reduxjs/toolkit';
import { action, initialState } from './slice';
import { Dirs, FileSystem } from 'react-native-file-access';
import { CacheManager } from '@georstat/react-native-image-cache';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { pick, type DocumentPickerResponse } from '@react-native-documents/picker';
import Cache from '~/utils/cache';
import { Storage, KeyValuePair } from '~/utils/storage';
import dayjs from 'dayjs';
import Share from 'react-native-share';
import {
  buildChapterIndex,
  buildMangaIndex,
  garbageCollectSnapshots,
  readPersistedSnapshot,
  stripPluginCredentials,
  writeFullSnapshot,
  writeSnapshotMetadata,
  writeSnapshotProgress,
  writeSnapshotTasks,
  type PersistedSnapshot,
} from './persistence';
import { SecureToken } from '~/utils/secureToken';
import { Buffer } from 'buffer';
import { normalizeTaskForRestart } from './task';

import dictSchema from '~/schema/dict.json';
import taskSchema from '~/schema/task.json';
import pluginSchema from '~/schema/plugin.json';
import settingSchema from '~/schema/setting.json';
import favoritesSchema from '~/schema/favorites.json';

const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
const MAX_BACKUP_ENTITIES = 50_000;

const jsonStringByteLength = (value: string): number => {
  let bytes = 2; // opening/closing quotes
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (
      code === 0x22 ||
      code === 0x5c ||
      code === 0x08 ||
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0c ||
      code === 0x0d
    ) {
      bytes += 2;
    } else if (code <= 0x1f) {
      bytes += 6;
    } else if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 6;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      bytes += 6;
    } else {
      bytes += 3;
    }
  }
  return bytes;
};

/** 在创建整份 JSON 字符串前完成精确上限检查，避免超大备份先耗尽 JS 堆。 */
export const assertJsonSizeWithinLimit = (value: unknown, limit: number): number => {
  const visiting = new Set<object>();
  const add = (current: number, amount: number) => {
    const next = current + amount;
    if (next > limit) {
      // 上限固定为 64MB（见 MAX_BACKUP_BYTES），文案保持稳定以便测试与用户认知一致
      throw new Error('备份数据超过 64MB 限制，请先清理非收藏缓存');
    }
    return next;
  };

  const measure = (item: unknown): number => {
    if (item === null) return 4;
    if (typeof item === 'string') return jsonStringByteLength(item);
    if (typeof item === 'boolean') return item ? 4 : 5;
    if (typeof item === 'number') return JSON.stringify(item).length;
    if (typeof item !== 'object') return 0;
    if (visiting.has(item)) throw new Error('备份数据包含循环引用');
    visiting.add(item);
    let bytes = 2;
    if (Array.isArray(item)) {
      for (let index = 0; index < item.length; index++) {
        const entry = item[index];
        if (index > 0) bytes = add(bytes, 1);
        bytes = add(bytes, entry === undefined ? 4 : measure(entry));
      }
    } else {
      let count = 0;
      Object.entries(item).forEach(([key, entry]) => {
        if (entry === undefined || typeof entry === 'function' || typeof entry === 'symbol') return;
        if (count > 0) bytes = add(bytes, 1);
        bytes = add(bytes, jsonStringByteLength(key));
        bytes = add(bytes, 1);
        bytes = add(bytes, measure(entry));
        count += 1;
      });
    }
    visiting.delete(item);
    return bytes;
  };

  return measure(value);
};

const tryPrepare = <T>(factory: () => T): { error?: Error; request?: T } => {
  try {
    return { request: factory() };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(ErrorMessage.Unknown),
    };
  }
};

export function* persistFullState(state: RootState) {
  yield call(writeFullSnapshot, state);
}

function* garbageCollectStorage() {
  yield call(garbageCollectSnapshots);
}

interface BackupPayload {
  schemaVersion: 1;
  favorites: RootState['favorites'];
  dict: RootState['dict'];
  plugin: RootState['plugin'];
  setting: RootState['setting'];
  task: RootState['task'];
}

export const createBackupPayload = (state: RootState): BackupPayload => {
  const mangaIndex = buildMangaIndex(state);
  const chapterIndex = buildChapterIndex(state);
  if (mangaIndex.length + chapterIndex.length > MAX_BACKUP_ENTITIES) {
    throw new Error('备份条目过多，请先减少收藏内容');
  }
  const manga = Object.fromEntries(
    mangaIndex.flatMap((key) => (state.dict.manga[key] ? [[key, state.dict.manga[key]]] : []))
  );
  const lastWatch = Object.fromEntries(
    mangaIndex.flatMap((key) =>
      state.dict.lastWatch[key] ? [[key, state.dict.lastWatch[key]]] : []
    )
  );
  const chapter = Object.fromEntries(
    chapterIndex.flatMap((key) => (state.dict.chapter[key] ? [[key, state.dict.chapter[key]]] : []))
  );
  const record = Object.fromEntries(
    chapterIndex.flatMap((key) => {
      const value = state.dict.record[key];
      return value ? [[key, { ...value, progress: 0, imagesLoaded: [] }]] : [];
    })
  );
  return {
    schemaVersion: 1,
    favorites: state.favorites,
    dict: { manga, chapter, record, lastWatch },
    plugin: stripPluginCredentials(state.plugin),
    setting: state.setting,
    task: state.task,
  };
};

const decodeBackupText = (source: string): unknown => {
  const tryParse = (candidate: string): unknown | undefined => {
    try {
      return JSON.parse(candidate);
    } catch {
      return undefined;
    }
  };

  const direct = tryParse(source);
  if (direct !== undefined) {
    return direct;
  }

  try {
    if (source.includes('%')) {
      const decodedUri = tryParse(decodeURIComponent(source));
      if (decodedUri !== undefined) {
        return decodedUri;
      }
    }
  } catch {}

  const base64Value = source.replace(/^data:text\/plain;base64,/, '').trim();
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(base64Value)) {
    try {
      const decoded = Buffer.from(base64Value, 'base64').toString('utf8');
      const decodedBase64 = tryParse(decoded);
      if (decodedBase64 !== undefined) {
        return decodedBase64;
      }
      if (decoded.includes('%')) {
        const decodedLegacy = tryParse(decodeURIComponent(decoded));
        if (decodedLegacy !== undefined) {
          return decodedLegacy;
        }
      }
    } catch {}
  }
  throw new Error('无法解析备份文件');
};

export const normalizeBackup = (source: string): BackupPayload => {
  const raw = decodeBackupText(source) as Partial<BackupPayload> & Partial<RootState>;
  if (!Array.isArray(raw.favorites) || !raw.dict || !raw.plugin || !raw.setting || !raw.task) {
    throw new Error('数据格式错误');
  }
  const data: BackupPayload = {
    schemaVersion: 1,
    favorites: raw.favorites as RootState['favorites'],
    dict: raw.dict as RootState['dict'],
    plugin: raw.plugin as RootState['plugin'],
    setting: migrateSetting(raw.setting),
    task: raw.task as RootState['task'],
  };
  return data;
};

const {
  // app
  launch,
  launchCompletion,
  toastMessage,
  // datasync
  syncData,
  syncDataCompletion,
  backup,
  backupCompletion,
  restore,
  restoreCompletion,
  clearCache,
  clearCacheCompletion,
  // release
  loadLatestRelease,
  loadLatestReleaseCompletion,
  // setting
  setMode,
  setThemeMode,
  setPageKeys,
  setDirection,
  setSequence,
  setSeat,
  setTimer,
  setTimerGap,
  setAndroidDownloadPath,
  syncSetting,
  // plugin
  setSource,
  setCredential,
  loginPlugin,
  sortPlugin,
  disablePlugin,
  syncPlugin,
  // batch
  batchUpdate,
  startBatchUpdate,
  endBatchUpdate,
  inStack,
  outStack,
  // search
  loadSearch,
  loadSearchCompletion,
  // discovery
  loadDiscovery,
  loadDiscoveryCompletion,
  // favorites
  addFavorites,
  removeFavorites,
  enabledBatch,
  disabledBatch,
  viewFavorites,
  syncFavorites,
  // manga
  loadManga,
  loadMangaCompletion,
  loadMangaInfo,
  loadMangaInfoCompletion,
  loadChapterList,
  loadChapterListCompletion,
  // chapter
  loadChapter,
  loadChapterCompletion,
  downloadChapter,
  exportChapter,
  saveImage,
  // task
  restartTask,
  retryTask,
  pushTask,
  removeTask,
  finishTask,
  startJob,
  endJob,
  finishJob,
  syncTask,
  // dict
  viewChapter,
  viewPage,
  viewImage,
  syncDict,
  saveManga,
} = action;

function isRegisteredHash(hash: unknown): hash is string {
  if (typeof hash !== 'string') {
    return false;
  }
  const [source] = splitHash(hash);
  return PluginMap.has(source);
}

function filterPluginRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([hash]) => isRegisteredHash(hash)));
}

export const isCurrentMangaRequest = (
  state: RootState,
  mangaHash: string,
  actionId: string
): boolean => state.manga.loadByHash[mangaHash]?.actionId === actionId;

type LegacyPluginState = RootState['plugin'] & { extra?: Record<string, unknown> };

function migratePluginState(pluginState: LegacyPluginState): RootState['plugin'] {
  const disabled = new Map(pluginState.list.map((item) => [item.value, item.disabled]));
  const order = pluginState.list
    .map((item) => item.value)
    .filter((source, index, list) => PluginMap.has(source) && list.indexOf(source) === index);

  PluginMap.forEach((_plugin, source) => {
    if (!order.includes(source)) {
      order.push(source);
    }
  });

  const list = order.flatMap<RootState['plugin']['list'][number]>((source) => {
    const plugin = PluginMap.get(source);
    if (!plugin) {
      return [];
    }
    return [
      {
        name: plugin.name,
        label: plugin.shortName,
        value: plugin.id,
        score: plugin.score,
        href: plugin.href,
        userAgent: plugin.userAgent,
        description: plugin.description,
        injectedJavaScript: plugin.injectedJavaScript,
        disabled: disabled.get(source) ?? plugin.disabled,
      },
    ];
  });

  return {
    source: PluginMap.has(pluginState.source)
      ? pluginState.source
      : list[0]?.value || initialState.plugin.source,
    list,
  };
}

const getLegacyBikaToken = (pluginState: LegacyPluginState): string | undefined => {
  const token = pluginState.extra?.bikaToken || pluginState.extra?.picaToken;
  return typeof token === 'string' && token.trim() ? token.trim() : undefined;
};

export function syncPluginExtraData(extra: Record<string, unknown>): void {
  PluginMap.forEach((plugin) => plugin.syncExtraData(extra));
}

function migratePluginDict(dict: RootState['dict']): RootState['dict'] {
  return {
    manga: filterPluginRecord(dict.manga),
    chapter: filterPluginRecord(dict.chapter),
    record: filterPluginRecord(dict.record),
    lastWatch: filterPluginRecord(dict.lastWatch),
  };
}

function migratePluginTask(task: RootState['task']): RootState['task'] {
  const list = task.list.filter((item) => isRegisteredHash(item.chapterHash));
  const taskIds = new Set(list.map((item) => item.taskId));
  const jobs = task.job.list.filter(
    (item) => taskIds.has(item.taskId) && isRegisteredHash(item.chapterHash)
  );
  const jobIds = new Set(jobs.map((item) => item.jobId));

  return {
    list,
    job: {
      ...task.job,
      max: Math.min(Math.max(Number(task.job.max) || initialState.task.job.max, 1), 2),
      list: jobs,
      thread: task.job.thread.filter((item) => taskIds.has(item.taskId) && jobIds.has(item.jobId)),
    },
  };
}

export function migrateDeletedPluginData<
  T extends Pick<RootState, 'dict' | 'favorites' | 'plugin' | 'task'>
>(data: T): T {
  data.dict = migratePluginDict(data.dict);
  data.favorites = data.favorites.filter((item) => isRegisteredHash(item.mangaHash));
  data.plugin = migratePluginState(data.plugin);
  data.task = migratePluginTask(data.task);
  return data;
}

function* initSaga() {
  yield put(launch());
}
function* launchSaga() {
  yield takeLatestSuspense(launch.type, function* () {
    yield put(syncData());
    const { payload }: ReturnType<typeof syncDataCompletion> = yield take(syncDataCompletion.type);
    if (payload.error) {
      yield put(toastMessage(payload.error.message));
      yield put(launchCompletion({ error: payload.error }));
      return;
    }
    yield put(restartTask());
    yield put(loadLatestRelease());

    yield put(launchCompletion({ error: undefined }));
  });
}

function* pluginSyncDataSaga() {
  yield takeLeadingSuspense(
    setCredential.type,
    function* ({ payload: { source } }: ReturnType<typeof setCredential>) {
      const plugin = PluginMap.get(source);

      if (!plugin || source !== Plugin.BIKA) {
        yield put(toastMessage(ErrorMessage.PluginMissing));
        return;
      }
      const token: string | null = yield call(SecureToken.getBikaToken);
      const normalizedToken = token?.trim() || '';
      if (!normalizedToken || normalizedToken.length > 8192) {
        yield put(toastMessage('Bika Token 格式无效'));
        return;
      }

      const message = plugin.syncExtraData({ bikaToken: normalizedToken });
      if (typeof message === 'string') {
        yield put(toastMessage(message));
      }
    }
  );
}

function* loginPluginSaga() {
  yield takeLeadingSuspense(
    loginPlugin.type,
    function* ({ payload: { source, username, password } }: ReturnType<typeof loginPlugin>) {
      const plugin = PluginMap.get(source);

      if (!plugin || !plugin.prepareLoginFetch || !plugin.handleLogin) {
        yield put(toastMessage(ErrorMessage.PluginMissing));
        return;
      }

      const account = username.trim();
      if (!account || !password) {
        yield put(toastMessage('请输入账户名和密码'));
        return;
      }

      const { error: prepareError, request } = tryPrepare(() =>
        (plugin.prepareLoginFetch as NonNullable<typeof plugin.prepareLoginFetch>)(
          account,
          password
        )
      );
      if (prepareError || !request) {
        yield put(toastMessage((prepareError || new Error(ErrorMessage.Unknown)).message));
        return;
      }

      const { error: fetchError, data } = yield call(fetchData, request);
      if (fetchError) {
        yield put(toastMessage(fetchError.message));
        return;
      }

      const { error: loginError, token } = (
        plugin.handleLogin as NonNullable<typeof plugin.handleLogin>
      )(data);
      if (loginError || !token) {
        yield put(toastMessage((loginError || new Error(ErrorMessage.Unknown)).message));
        return;
      }

      if (source === Plugin.BIKA) {
        try {
          yield call(SecureToken.setBikaToken, token);
        } catch (error) {
          yield put(
            toastMessage(
              error instanceof Error ? error.message : '安全保存 Bika Token 失败'
            )
          );
          return;
        }
      }

      const message = plugin.syncExtraData({ bikaToken: token });
      yield put(toastMessage(typeof message === 'string' ? message : '登录成功'));
    }
  );
}

function* syncDataSaga() {
  yield takeLatestSuspense(syncData.type, function* () {
    try {
      const snapshot: PersistedSnapshot | undefined = yield call(readPersistedSnapshot);
      if (snapshot) {
        const original = JSON.stringify(snapshot);
        migrateDeletedPluginData(snapshot);
        snapshot.setting = migrateSetting(snapshot.setting);
        snapshot.task = normalizeTaskForRestart(snapshot.task);
        // dict / favorites 在大库下可达上千条，全量 Draft07 校验会显著阻塞低端设备启动。
        // 这里采样前 8 条做结构防御；plugin/setting/task 条目少且结构关键，保持全量校验。
        // syncDataSaga 整段在 try/catch 内，采样漏过的脏数据走 catch 兜底；运行期 reducer
        // 也会对单条访问做容错（异常条目显示为空，不崩）。
        if (
          !validateSampled(snapshot.favorites, 8, favoritesSchema) ||
          !validateSampled(snapshot.dict, 8, dictSchema) ||
          !validate(snapshot.plugin, pluginSchema) ||
          !validate(snapshot.setting, settingSchema, initialState.setting) ||
          !validate(snapshot.task, taskSchema)
        ) {
          throw new Error('本地快照数据格式错误');
        }

        yield put(syncFavorites(snapshot.favorites));
        yield put(syncDict(snapshot.dict));
        yield put(syncPlugin(snapshot.plugin));
        yield put(syncSetting(snapshot.setting));
        yield put(syncTask(snapshot.task));
        if (original !== JSON.stringify(snapshot)) {
          const migratedState = ((state: RootState) => state)(yield select());
          yield call(persistFullState, migratedState);
        }
        const bikaToken: string | null = yield call(SecureToken.getBikaToken);
        syncPluginExtraData(bikaToken ? { bikaToken } : {});
        yield call(garbageCollectStorage);
        yield put(syncDataCompletion({ error: undefined }));
        return;
      }

      let legacyToken: string | undefined;
      const [
        [, mangaIndexData],
        [, chapterIndexData],
        [, taskIndexData],
        [, jobIndexData],
        [, favoritesData],
        [, pluginData],
        [, settingData],
        [, dictData],
      ]: KeyValuePair[] = yield call(Storage.multiGet, [
        storageKey.mangaIndex,
        storageKey.chapterIndex,
        storageKey.taskIndex,
        storageKey.jobIndex,
        storageKey.favorites,
        storageKey.plugin,
        storageKey.setting,
        storageKey.dict,
      ]);
      const task: RootState['task'] = {
        list: [],
        job: { max: initialState.task.job.max, list: [], thread: [] },
      };

      if (!dictData) {
        const dict: RootState['dict'] = { manga: {}, chapter: {}, lastWatch: {}, record: {} };
        if (mangaIndexData) {
          const mangaIndex: string[] = JSON.parse(mangaIndexData);
          const mangaPairs: KeyValuePair[] = yield call(Storage.multiGet, mangaIndex);
          const mangaDict = pairsToDict(mangaPairs);
          for (const key in mangaDict) {
            dict.manga[key] = mangaDict[key].manga;
            dict.lastWatch[key] = mangaDict[key].lastWatch;
          }
        }
        if (chapterIndexData) {
          const chapterIndex: string[] = JSON.parse(chapterIndexData);
          const chapterPairs: KeyValuePair[] = yield call(Storage.multiGet, chapterIndex);
          const chapterDict = pairsToDict(chapterPairs);
          for (const key in chapterDict) {
            dict.chapter[key] = chapterDict[key].chapter;
            dict.record[key] = chapterDict[key].record;
          }
        }

        const migratedDict = migratePluginDict(dict);
        if (validate(migratedDict, dictSchema)) {
          yield put(syncDict(migratedDict));
        } else {
          throw new Error('同步字典数据失败：格式错误');
        }
      } else {
        const dict: RootState['dict'] = JSON.parse(dictData);
        const migratedDict = migratePluginDict(dict);
        if (validate(migratedDict, dictSchema)) {
          yield put(syncDict(migratedDict));
        } else {
          throw new Error('同步字典数据失败：格式错误');
        }
      }

      if (taskIndexData) {
        const taskIndex: string[] = JSON.parse(taskIndexData);
        const taskPairs: KeyValuePair[] = yield call(Storage.multiGet, taskIndex);
        const taskDict = pairsToDict(taskPairs);
        task.list = taskIndex.map((item) => taskDict[item]);
      }
      if (jobIndexData) {
        const jobIndex: string[] = JSON.parse(jobIndexData);
        const jobPairs: KeyValuePair[] = yield call(Storage.multiGet, jobIndex);
        const jobDict = pairsToDict(jobPairs);
        task.job.list = jobIndex.map((item) => jobDict[item]);
      }
      const migratedTask = normalizeTaskForRestart(migratePluginTask(task));
      if (validate(migratedTask, taskSchema)) {
        yield put(syncTask(migratedTask));
      } else {
        throw new Error('同步任务数据失败：格式错误');
      }

      if (favoritesData) {
        const rawFavorites: RootState['favorites'] = JSON.parse(favoritesData);
        const favorites = rawFavorites.filter((item: RootState['favorites'][number]) =>
          isRegisteredHash(item.mangaHash)
        );
        if (validate(favorites, favoritesSchema)) {
          yield put(syncFavorites(favorites));
        } else {
          throw new Error('同步收藏数据失败：格式错误');
        }
      }

      if (pluginData) {
        const rawPlugin: LegacyPluginState = JSON.parse(pluginData);
        legacyToken = getLegacyBikaToken(rawPlugin);
        if (legacyToken) {
          yield call(SecureToken.setBikaToken, legacyToken);
        }
        const plugin = migratePluginState(rawPlugin);
        if (validate(plugin, pluginSchema)) {
          yield put(syncPlugin(plugin));
        } else {
          throw new Error('同步插件数据失败：格式错误');
        }
      }
      if (settingData) {
        const rawSetting = JSON.parse(settingData);
        const setting = migrateSetting(rawSetting);
        if (validate(setting, settingSchema, initialState.setting)) {
          yield put(syncSetting(setting));
        } else {
          throw new Error('同步设置失败：格式错误');
        }
      }

      const bikaToken: string | null = yield call(SecureToken.getBikaToken);
      syncPluginExtraData(bikaToken ? { bikaToken } : {});

      const migratedState = ((state: RootState) => state)(yield select());
      // 旧版多 key 布局无论是否发生字段迁移，都一次性提交为 generation 快照。
      yield call(persistFullState, migratedState);
      yield call(garbageCollectStorage);

      yield put(syncDataCompletion({ error: undefined }));
    } catch (error) {
      yield put(
        syncDataCompletion({
          error: new Error(
            `同步本地数据失败：${error instanceof Error ? error.message : ErrorMessage.Unknown}`
          ),
        })
      );
    }
  });
}
function* backupSaga() {
  yield takeLeadingSuspense(backup.type, function* () {
    try {
      const rootState = ((state: RootState) => state)(yield select());

      // 序列化前等待一次空闲回调，并用短超时兜底，避免无限等待繁忙交互。
      yield call(waitForIdle);

      const backupPayload = createBackupPayload(rootState);
      assertJsonSizeWithinLimit(backupPayload, MAX_BACKUP_BYTES);
      const payload = JSON.stringify(backupPayload);
      const filename = 'MangaReader备份数据' + dayjs().format('YYYY-MM-DD');
      const path = `${Dirs.CacheDir}/${filename}.txt`;

      yield call(FileSystem.writeFile, path, payload, 'utf8');
      yield call(Share.open, {
        filename,
        type: 'text/plain',
        url: path.startsWith('file://') ? path : `file://${path}`,
        showAppsToView: true,
      });
      yield put(toastMessage('备份完成'));
      yield put(backupCompletion({ error: undefined }));
    } catch (error) {
      yield put(
        backupCompletion({
          error: new Error(
            '备份失败: ' + (error instanceof Error ? error.message : ErrorMessage.Unknown)
          ),
        })
      );
    }
  });
}
function* restoreSaga() {
  yield takeLatestSuspense(restore.type, function* () {
    try {
      const [res]: [DocumentPickerResponse, ...DocumentPickerResponse[]] = yield call(pick);
      const stat: { size: number } = yield call(FileSystem.stat, res.uri);
      if (Number(stat.size) > MAX_BACKUP_BYTES) {
        throw new Error('备份文件超过 64MB 限制');
      }
      const source: string = yield call(FileSystem.readFile, res.uri, 'utf8');
      const data = normalizeBackup(source);
      migrateDeletedPluginData(data);
      // 备份不恢复凭据；旧备份中的 token 也只丢弃，避免文件恢复覆盖设备 Keystore。
      data.task = normalizeTaskForRestart(data.task);
      if (
        !validate(data.favorites, favoritesSchema) ||
        !validate(data.dict, dictSchema) ||
        !validate(data.plugin, pluginSchema) ||
        !validate(data.setting, settingSchema, initialState.setting) ||
        !validate(data.task, taskSchema)
      ) {
        throw new Error('数据格式错误');
      }

      // 先将完整恢复快照落盘，避免写入失败时 Redux 已切换到一份未持久化的数据。
      const currentState = ((state: RootState) => state)(yield select());
      const restoredState: RootState = {
        ...currentState,
        favorites: data.favorites,
        plugin: data.plugin,
        setting: data.setting,
        task: data.task,
        dict: data.dict,
      };
      yield call(persistFullState, restoredState);

      yield put(syncFavorites(data.favorites));
      yield put(syncPlugin(data.plugin));
      yield put(syncSetting(data.setting));
      yield put(syncTask(data.task));
      yield put(syncDict(data.dict));
      // 既重建 reducer 队列，也触发 taskManagerSaga 继续未完成任务。
      yield put(restartTask());
      yield put(restoreCompletion({ error: undefined }));
      yield put(toastMessage('恢复完成'));
    } catch (error) {
      yield put(
        restoreCompletion({
          error: new Error(
            '恢复失败: ' + (error instanceof Error ? error.message : ErrorMessage.Unknown)
          ),
        })
      );
    }
  });
}

/**
 * 增量持久化 worker：触发 saveDataSaga 的 action 大多是收藏/任务增删，
 * 不必每次都全量序列化整个 dict。这里维护 dirty 集合，只序列化真正变化的部分；
 * 清空缓存后走全量重建（full rebuild）。
 */
export const createSaveDataWorker = (retryDelay = 1000) => {
  const mangaDirty = new Set<string>();
  const chapterDirty = new Set<string>();
  let favoritesDirty = false;
  let taskDirty = false;
  let fullRebuild = false;
  let isPending = false;

  function* flush() {
    yield call(waitForIdle);
    const state = ((root: RootState) => root)(yield select());

    // 先把本次要消费的 dirty 状态做成快照，写入成功后再清理；
    // 写失败时把快照合并回 dirty 集合，让下一次 flush 重试，避免静默丢失待写数据。
    const snapshot = {
      manga: new Set(mangaDirty),
      chapter: new Set(chapterDirty),
      favorites: favoritesDirty,
      task: taskDirty,
      fullRebuild,
    };

    const needsFullSnapshot = snapshot.fullRebuild || snapshot.favorites;
    // 写入前从全局 dirty 中移除本次快照包含的项；
    // flush 期间新到达的 action 仍会向 dirty 集合添加项，这些项不会被本次消费。
    snapshot.manga.forEach((hash) => mangaDirty.delete(hash));
    snapshot.chapter.forEach((hash) => chapterDirty.delete(hash));
    if (snapshot.favorites) {
      favoritesDirty = false;
    }
    if (snapshot.task) {
      taskDirty = false;
    }
    if (snapshot.fullRebuild) {
      fullRebuild = false;
    }

    try {
      if (needsFullSnapshot) {
        yield call(persistFullState, state);
      } else {
        if (snapshot.task) {
          yield call(writeSnapshotTasks, state);
        }
        if (snapshot.manga.size > 0 || snapshot.chapter.size > 0) {
          yield call(
            writeSnapshotProgress,
            state,
            Array.from(snapshot.manga),
            Array.from(snapshot.chapter),
            false
          );
        }
      }
    } catch (error) {
      // 写入失败：把本次快照合并回 dirty 集合，等待下一次 flush 重试。
      // 注意：如果 fullRebuild 失败，重新置位即可（它本身覆盖所有数据）；
      // 如果新 action 在 flush 期间又把 fullRebuild 置 true，这里保留 true。
      snapshot.manga.forEach((hash) => mangaDirty.add(hash));
      snapshot.chapter.forEach((hash) => chapterDirty.add(hash));
      if (snapshot.favorites) {
        favoritesDirty = true;
      }
      if (snapshot.task) {
        taskDirty = true;
      }
      if (snapshot.fullRebuild) {
        fullRebuild = true;
      }
      console.warn('本地数据持久化失败，等待重试', error);
      return false;
    }

    return true;
  }

  return function* ({ type, payload }: PayloadAction<any>) {
    if (type === clearCacheCompletion.type) {
      fullRebuild = true;
    } else if (type === addFavorites.type) {
      favoritesDirty = true;
      if (payload?.mangaHash) {
        mangaDirty.add(payload.mangaHash);
      }
    } else if (type === removeFavorites.type) {
      favoritesDirty = true;
      // 移除的收藏对应 manga/chapter 会从 buildIndex 中消失，索引重建即可覆盖
    } else if (
      type === pushTask.type ||
      type === removeTask.type ||
      type === finishTask.type ||
      type === endJob.type
    ) {
      taskDirty = true;
    }

    if (isPending) {
      return;
    }
    isPending = true;
    try {
      let consecutiveFailures = 0;
      while (true) {
        const succeeded: boolean = yield call(flush);
        consecutiveFailures = succeeded ? 0 : consecutiveFailures + 1;
        if (consecutiveFailures >= 2) {
          yield put(toastMessage('本地数据保存失败，将在下次数据变更时重试'));
          break;
        }

        // 至少保留一个节流窗口；期间到达的新 action 只标 dirty，由当前 worker 继续排空。
        yield delay(retryDelay);
        if (
          mangaDirty.size === 0 &&
          chapterDirty.size === 0 &&
          !favoritesDirty &&
          !taskDirty &&
          !fullRebuild
        ) {
          break;
        }
      }
    } finally {
      isPending = false;
    }
  };
};

const saveDataWorker = createSaveDataWorker();

const waitForIdle = () =>
  new Promise<void>((resolve) => {
    let completed = false;
    const finish = () => {
      if (!completed) {
        completed = true;
        clearTimeout(timeout);
        resolve();
      }
    };
    const timeout = setTimeout(finish, 50);
    const requestIdle = (
      globalThis as typeof globalThis & {
        requestIdleCallback?: (callback: () => void) => number;
      }
    ).requestIdleCallback;
    if (requestIdle) {
      requestIdle(finish);
    } else {
      setTimeout(finish, 0);
    }
  });

export const createSaveProgressWorker = (retryDelay = 250) => {
  const mangaHashes = new Set<string>();
  const chapterHashes = new Set<string>();
  let rebuildIndexes = false;
  let isPending = false;

  return function* ({ type, payload }: PayloadAction<any>) {
    if (type === viewChapter.type || type === viewPage.type) {
      mangaHashes.add(payload.mangaHash);
    } else if (type === viewImage.type) {
      chapterHashes.add(payload.chapterHash);
    } else if (type === loadSearchCompletion.type || type === loadDiscoveryCompletion.type) {
      if (!haveError(payload)) {
        payload.data.forEach((manga: IncreaseManga) => mangaHashes.add(manga.hash));
      }
    } else if (type === loadMangaCompletion.type) {
      const isCurrent: boolean = yield select(
        isCurrentMangaRequest,
        payload.mangaHash,
        payload.actionId
      );
      if (!isCurrent) {
        return;
      }
      if (!haveError(payload)) {
        mangaHashes.add(payload.data.hash);
        rebuildIndexes = true;
      }
    } else if (type === loadChapterCompletion.type) {
      if (!haveError(payload) && payload.data?.hash) {
        chapterHashes.add(payload.data.hash);
        rebuildIndexes = true;
      }
    }

    if (isPending || (mangaHashes.size === 0 && chapterHashes.size === 0)) {
      return;
    }

    isPending = true;
    try {
      let consecutiveFailures = 0;
      yield delay(retryDelay);
      while (mangaHashes.size > 0 || chapterHashes.size > 0) {
        const dirtyManga = Array.from(mangaHashes);
        const dirtyChapter = Array.from(chapterHashes);
        const shouldRebuildIndexes = rebuildIndexes;
        mangaHashes.clear();
        chapterHashes.clear();
        rebuildIndexes = false;

        yield call(waitForIdle);
        const state = ((root: RootState) => root)(yield select());
        try {
          yield call(writeSnapshotProgress, state, dirtyManga, dirtyChapter, shouldRebuildIndexes);
          consecutiveFailures = 0;
        } catch (error) {
          dirtyManga.forEach((hash) => mangaHashes.add(hash));
          dirtyChapter.forEach((hash) => chapterHashes.add(hash));
          rebuildIndexes ||= shouldRebuildIndexes;
          consecutiveFailures += 1;
          console.warn('阅读进度持久化失败，等待重试', error);
          if (consecutiveFailures >= 2) {
            yield put(toastMessage('阅读进度保存失败，将在下次进度变化时重试'));
            break;
          }
        }

        if (mangaHashes.size > 0 || chapterHashes.size > 0) {
          yield delay(retryDelay);
        }
      }
    } finally {
      isPending = false;
    }
  };
};

const saveProgressWorker = createSaveProgressWorker();

function* saveProgressSaga() {
  yield takeEverySuspense(
    [
      viewChapter.type,
      viewPage.type,
      viewImage.type,
      loadSearchCompletion.type,
      loadDiscoveryCompletion.type,
      loadMangaCompletion.type,
      loadChapterCompletion.type,
    ],
    saveProgressWorker
  );
}

function* saveSettingSaga() {
  yield takeLatestSuspense(
    [
      setMode.type,
      setThemeMode.type,
      setPageKeys.type,
      setDirection.type,
      setSequence.type,
      setSeat.type,
      setTimer.type,
      setTimerGap.type,
      setAndroidDownloadPath.type,
    ],
    function* () {
      yield call(waitForIdle);
      const state = ((root: RootState) => root)(yield select());
      yield call(writeSnapshotMetadata, state, ['setting']);
    }
  );
}

function* savePluginSaga() {
  yield takeLatestSuspense([setSource.type, sortPlugin.type, disablePlugin.type], function* () {
    yield call(waitForIdle);
    const state = ((root: RootState) => root)(yield select());
    yield call(writeSnapshotMetadata, state, ['plugin']);
  });
}

export function* saveFavoritesWorker() {
  yield call(waitForIdle);
  const state = ((root: RootState) => root)(yield select());
  yield call(writeSnapshotMetadata, state, ['favorites']);
}

function* saveFavoritesSaga() {
  yield takeLatestSuspense(
    [viewFavorites.type, enabledBatch.type, disabledBatch.type, endBatchUpdate.type],
    saveFavoritesWorker
  );
}
function* saveDataSaga() {
  // worker 内部处理预期内的存储失败；通用包装仍兜底其它未预期异常，避免 watcher 退出。
  yield takeEverySuspense(
    [
      clearCacheCompletion.type,
      addFavorites.type,
      removeFavorites.type,
      pushTask.type,
      removeTask.type,
      finishTask.type,
      endJob.type,
    ],
    saveDataWorker
  );
}
function* clearCacheSaga() {
  yield takeLatestSuspense(clearCache.type, function* () {
    try {
      yield call(Storage.clear);
    } catch (error) {
      yield put(
        clearCacheCompletion({
          error: new Error(
            '清空缓存失败：' + (error instanceof Error ? error.message : ErrorMessage.Unknown)
          ),
        })
      );
      return;
    }

    let credentialError: Error | undefined;
    try {
      yield call(SecureToken.clearBikaToken);
    } catch (error) {
      credentialError = new Error(
        '清空安全凭据失败：' + (error instanceof Error ? error.message : ErrorMessage.Unknown)
      );
    }
    // 清掉 DocumentDir/@cache/ 下持久化的图片尺寸缓存，否则它会无限累积
    try {
      yield call([Cache, Cache.clearCache]);
    } catch (error) {
      credentialError =
        credentialError ||
        new Error(
          '清空尺寸缓存失败：' + (error instanceof Error ? error.message : ErrorMessage.Unknown)
        );
    }
    syncPluginExtraData({});
    yield put(syncData());
    const { payload }: ReturnType<typeof syncDataCompletion> = yield take(syncDataCompletion.type);
    yield put(clearCacheCompletion({ error: payload.error || credentialError }));
  });
}

function* loadLatestReleaseSaga() {
  yield takeLatestSuspense(loadLatestRelease.type, function* () {
    const { error: fetchError, data } = yield call(fetchData, {
      url: 'https://api.github.com/repos/xulingran/MangaReader/releases',
    });
    const { error: DataError, release } = getLatestRelease(data);

    yield put(loadLatestReleaseCompletion({ error: fetchError || DataError, data: release }));
  });
}

export function* batchUpdateWorker({ payload: defaultList }: ReturnType<typeof batchUpdate>) {
  const favorites = ((state: RootState) => state.favorites)(yield select());
  const fail = ((state: RootState) => state.batch.fail)(yield select());
  const batchList =
    defaultList ||
    (fail.length > 0
      ? fail
      : favorites.filter((item) => item.enableBatch).map((item) => item.mangaHash));
  const queue = [...batchList].map((hash) => ({ hash, retry: 0 }));

  const loadMangaEffect = function* ({ hash = '', retry = 0 }) {
    const [source] = splitHash(hash);
    const actionId = nanoid();
    const plugin = PluginMap.get(source);
    const dict = ((state: RootState) => state.dict)(yield select());

    yield put(inStack(hash));
    if (!plugin) {
      yield put(outStack({ isSuccess: false, isTrend: false, hash, isRetry: false }));
      return;
    }
    yield put(loadManga({ mangaHash: hash, actionId }));

    const {
      payload: { error: fetchError, data },
    }: ReturnType<typeof loadMangaCompletion> = yield take((takeAction: Action<string>) => {
      const { type, payload } = takeAction as ReturnType<typeof loadMangaCompletion>;
      return type === loadMangaCompletion.type && payload.actionId === actionId;
    });

    if (fetchError) {
      const [, seconds] = fetchError.message.match(/([0-9]+) ?s/) || [];
      const timeout = Math.min(Number(seconds), 60) * 1000;

      if (retry < 3) {
        queue.push({ hash, retry: retry + 1 });
      }

      yield put(outStack({ isSuccess: false, isTrend: false, hash, isRetry: retry < 3 }));
      yield delay(timeout || plugin.batchDelay);
    } else {
      const prev = dict.manga[hash]?.chapters;
      const curr = data?.chapters;

      yield put(
        outStack({
          isSuccess: true,
          isTrend: nonNullable(prev) && nonNullable(curr) && curr.length > prev.length,
          hash,
          isRetry: false,
        })
      );
    }
  };

  yield put(startBatchUpdate(batchList));
  while (true) {
    const head = queue.shift();

    if (!head) {
      break;
    }

    yield loadMangaEffect(head);
  }
  yield put(endBatchUpdate());
}

function* batchUpdateSaga() {
  yield takeLeadingSuspense(batchUpdate.type, batchUpdateWorker);
}

function* loadDiscoverySaga() {
  yield takeLatestSuspense(
    loadDiscovery.type,
    function* ({ payload: { source } }: ReturnType<typeof loadDiscovery>) {
      const plugin = PluginMap.get(source);
      const { page, isEnd, filter } = ((state: RootState) => state.discovery)(yield select());

      if (!plugin) {
        yield put(loadDiscoveryCompletion({ error: new Error(ErrorMessage.PluginMissing) }));
        return;
      }
      if (isEnd) {
        yield put(loadDiscoveryCompletion({ error: new Error(ErrorMessage.NoMore) }));
        return;
      }

      const filterWithDefault = plugin.option.discovery.reduce<Record<string, string>>(
        (dict, item) => {
          dict[item.name] = dict[item.name] || item.defaultValue;
          return dict;
        },
        { ...filter }
      );

      const { error: prepareError, request } = tryPrepare(() =>
        plugin.prepareDiscoveryFetch(page, filterWithDefault)
      );
      if (prepareError || !request) {
        yield put(
          loadDiscoveryCompletion({ error: prepareError || new Error(ErrorMessage.Unknown) })
        );
        return;
      }
      const { error: fetchError, data } = yield call(fetchData, request);
      const { error: pluginError, discovery } = trycatch(
        () => plugin.handleDiscovery(data),
        '漫画数据解析错误：'
      );

      yield put(loadDiscoveryCompletion({ error: fetchError || pluginError, data: discovery }));
    }
  );
}

function* loadSearchSaga() {
  yield takeLatestSuspense(
    loadSearch.type,
    function* ({ payload: { keyword, source } }: ReturnType<typeof loadSearch>) {
      const plugin = PluginMap.get(source);
      const { page, isEnd, filter } = ((state: RootState) => state.search)(yield select());

      if (!plugin) {
        yield put(loadSearchCompletion({ error: new Error(ErrorMessage.PluginMissing) }));
        return;
      }
      if (isEnd) {
        yield put(loadSearchCompletion({ error: new Error(ErrorMessage.NoMore) }));
        return;
      }

      const filterWithDefault = plugin.option.search.reduce<Record<string, string>>(
        (dict, item) => {
          dict[item.name] = dict[item.name] || item.defaultValue;
          return dict;
        },
        { ...filter }
      );

      const { error: prepareError, request } = tryPrepare(() =>
        plugin.prepareSearchFetch(keyword, page, filterWithDefault)
      );
      if (prepareError || !request) {
        yield put(loadSearchCompletion({ error: prepareError || new Error(ErrorMessage.Unknown) }));
        return;
      }
      const { error: fetchError, data } = yield call(fetchData, request);
      const { error: pluginError, search } = trycatch(
        () => plugin.handleSearch(data),
        '漫画数据解析错误：'
      );

      yield put(loadSearchCompletion({ error: fetchError || pluginError, data: search }));
    }
  );
}

export function* loadMangaWorker({
  payload: { mangaHash, actionId },
}: ReturnType<typeof loadManga>) {
  yield put(loadMangaInfo({ mangaHash, actionId }));
  const {
    payload: { error: loadMangaInfoError, data: mangaInfo },
  }: ReturnType<typeof loadMangaInfoCompletion> = yield take((takeAction: Action<string>) => {
    const { type, payload } = takeAction as ReturnType<typeof loadMangaInfoCompletion>;
    return type === loadMangaInfoCompletion.type && payload.actionId === actionId;
  });

  if (loadMangaInfoError) {
    yield put(loadMangaCompletion({ error: loadMangaInfoError, actionId, mangaHash }));
    return;
  }

  yield put(loadChapterList({ mangaHash, page: 1, actionId }));
  const {
    payload: { error: loadChapterListError, data: chapterInfo },
  }: ReturnType<typeof loadChapterListCompletion> = yield take((takeAction: Action<string>) => {
    const { type, payload } = takeAction as ReturnType<typeof loadChapterListCompletion>;
    return (
      type === loadChapterListCompletion.type &&
      payload.actionId === actionId &&
      payload.data !== undefined &&
      payload.data.mangaHash === mangaHash &&
      payload.data.page === 1
    );
  });

  if (loadChapterListError) {
    yield put(loadMangaCompletion({ error: loadChapterListError, actionId, mangaHash }));
    return;
  }
  if (!nonNullable(mangaInfo) || !nonNullable(chapterInfo)) {
    yield put(
      loadMangaCompletion({
        error: new Error(ErrorMessage.WrongDataType),
        actionId,
        mangaHash,
      })
    );
    return;
  }

  const manga = {
    ...mangaInfo,
    chapters: (mangaInfo.chapters || []).concat(chapterInfo.list),
  };
  const isCurrent: boolean = yield select(isCurrentMangaRequest, mangaHash, actionId);
  if (isCurrent) {
    yield put(saveManga(manga));
  }
  yield put(
    loadMangaCompletion({
      data: manga,
      actionId,
      mangaHash,
    })
  );
}

function* loadMangaSaga() {
  yield takeEverySuspense(loadManga.type, loadMangaWorker);
}

function* loadMangaInfoSaga() {
  yield takeEverySuspense(
    loadMangaInfo.type,
    function* ({ payload: { mangaHash, actionId } }: ReturnType<typeof loadMangaInfo>) {
      const [source, mangaId] = splitHash(mangaHash);
      const plugin = PluginMap.get(source);

      if (!plugin) {
        yield put(
          loadMangaInfoCompletion({ error: new Error(ErrorMessage.PluginMissing), actionId })
        );
        return;
      }

      const cachedManga = ((state: RootState) => state.dict.manga[mangaHash])(yield select());

      const { error: prepareError, request } = tryPrepare(() =>
        plugin.prepareMangaInfoFetch(mangaId, cachedManga)
      );
      if (prepareError || !request) {
        yield put(
          loadMangaInfoCompletion({
            error: prepareError || new Error(ErrorMessage.Unknown),
            actionId,
          })
        );
        return;
      }
      const { error: fetchError, data } = yield call(fetchData, request);
      const { error: pluginError, manga } = trycatch(
        () => plugin.handleMangaInfo(data, mangaId),
        '漫画详情解析错误：'
      );

      yield put(
        loadMangaInfoCompletion({ error: fetchError || pluginError, data: manga, actionId })
      );
    }
  );
}

export function* loadChapterListWorker({
  payload: { mangaHash, page, actionId },
}: ReturnType<typeof loadChapterList>) {
  const [source, mangaId] = splitHash(mangaHash);
  const plugin = PluginMap.get(source);

  if (!plugin) {
    yield put(
      loadChapterListCompletion({
        error: new Error(ErrorMessage.PluginMissing),
        data: { mangaHash, page, list: [] },
        actionId,
      })
    );
    return;
  }

  const { error: prepareError, request: body } = tryPrepare(() =>
    plugin.prepareChapterListFetch(mangaId, page)
  );
  if (prepareError) {
    yield put(
      loadChapterListCompletion({
        error: prepareError,
        data: { mangaHash, page, list: [] },
        actionId,
      })
    );
    return;
  }
  if (!body) {
    yield put(loadChapterListCompletion({ data: { mangaHash, page, list: [] }, actionId }));
    return;
  }

  const { error: fetchError, data } = yield call(fetchData, body);
  const {
    error: pluginError,
    chapterList = [],
    canLoadMore,
  } = trycatch(() => plugin.handleChapterList(data, mangaId), '章节列表解析错误：');

  if (pluginError || fetchError) {
    yield put(
      loadChapterListCompletion({
        error: pluginError || fetchError,
        data: { mangaHash, page, list: [] },
        actionId,
      })
    );
    return;
  }

  if (canLoadMore) {
    yield put(loadChapterList({ mangaHash, page: page + 1, actionId }));
    const {
      payload: { error: loadMoreError, data: extraData },
    }: ReturnType<typeof loadChapterListCompletion> = yield take((takeAction: Action<string>) => {
      const { type, payload } = takeAction as ReturnType<typeof loadChapterListCompletion>;
      return (
        type === loadChapterListCompletion.type &&
        payload.actionId === actionId &&
        payload.data !== undefined &&
        payload.data.mangaHash === mangaHash &&
        payload.data.page === page + 1
      );
    });

    if (loadMoreError) {
      yield put(
        loadChapterListCompletion({
          error: loadMoreError,
          data: { mangaHash, page, list: [] },
          actionId,
        })
      );
      return;
    }
    if (extraData) {
      chapterList.push(...extraData.list);
    }
  }

  yield put(
    loadChapterListCompletion({
      error: fetchError || pluginError,
      data: { mangaHash, page, list: chapterList },
      actionId,
    })
  );
}

function* loadChapterListSaga() {
  yield takeEverySuspense(loadChapterList.type, loadChapterListWorker);
}

// 阅读页连续翻页/切章节时 loadChapter 可能在数百毫秒内被重复触发；
// 用 inflight 集合去重，相同 chapterHash 进行中的请求直接跳过，避免重复抓取。
const loadChapterInflight = new Set<string>();
function* loadChapterSaga() {
  yield takeEverySuspense(
    loadChapter.type,
    function* ({ payload: { chapterHash } }: ReturnType<typeof loadChapter>) {
      if (loadChapterInflight.has(chapterHash)) {
        return;
      }
      loadChapterInflight.add(chapterHash);
      try {
        yield* loadChapterWorker(chapterHash);
      } finally {
        loadChapterInflight.delete(chapterHash);
      }
    }
  );
}
function* loadChapterWorker(chapterHash: string) {
  const [source, mangaId, chapterId] = splitHash(chapterHash);
  const plugin = PluginMap.get(source);

  if (!plugin) {
    yield put(
      loadChapterCompletion({
        error: new Error(ErrorMessage.PluginMissing),
        actionId: chapterHash,
      })
    );
    return;
  }

  let page = 1;
  let extra: Record<string, any> = {};
  let error: Error | undefined;
  let chapter: Chapter | undefined;
  const cachedData = ((state: RootState) => ({
    manga: state.dict.manga[combineHash(source, mangaId)],
    chapter: state.dict.manga[combineHash(source, mangaId)]?.chapters.find(
      (item) => item.hash === chapterHash
    ),
  }))(yield select());
  while (true) {
    const { error: prepareError, request } = tryPrepare(() =>
      plugin.prepareChapterFetch(mangaId, chapterId, page, extra, cachedData)
    );
    if (prepareError || !request) {
      error = prepareError || new Error(ErrorMessage.MissingChapterInfo);
      break;
    }
    const { error: fetchError, data } = yield call(fetchData, request);
    const {
      error: pluginError,
      chapter: nextChapter,
      canLoadMore,
      nextPage = page + 1,
      nextExtra = extra,
    } = trycatch(() => plugin.handleChapter(data, mangaId, chapterId, page), '章节数据解析错误：');

    if (fetchError || pluginError) {
      error = fetchError || pluginError;
      break;
    } else {
      chapter = {
        ...chapter,
        ...nextChapter,
        title: nextChapter.title || chapter?.title || '',
        images: [...(chapter?.images || []), ...nextChapter.images],
      };
    }
    if (!canLoadMore) {
      break;
    }
    extra = nextExtra;
    page = nextPage;
  }

  if (error) {
    yield put(loadChapterCompletion({ error, actionId: chapterHash }));
    return;
  }
  if (!chapter) {
    yield put(
      loadChapterCompletion({
        error: new Error(ErrorMessage.MissingChapterInfo),
        actionId: chapterHash,
      })
    );
    return;
  }

  yield put(loadChapterCompletion({ error, data: chapter, actionId: chapterHash }));
}

export const sanitizeFileName = (value: unknown): string => {
  const withoutControlCharacters = Array.from(String(value), (character) =>
    character.charCodeAt(0) < 32 ? '_' : character
  ).join('');
  const normalized = withoutControlCharacters
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 100);
  if (!normalized || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(normalized)) {
    return 'unknown';
  }
  return normalized;
};

function* replaceDownloadPath(
  path: string,
  chapterHash?: string,
  options?: { hash?: string; timestamp?: number }
) {
  if (chapterHash) {
    const [source, mangaId, chapterId] = splitHash(chapterHash);
    const mangaHash = combineHash(source, mangaId);
    const dict = ((state: RootState) => state.dict)(yield select());
    const manga = dict.manga[mangaHash];
    const chapter = dict.chapter[chapterHash];

    if (!nonNullable(manga) || !nonNullable(chapter)) {
      return path;
    }

    const PATTERN_TEMPLATE = /{{([^{}|]+\|?[^{}|]*)}}/g;
    const { sourceName, title: mangaTitle = 'unknown', author, tag, status } = manga;
    const { title: chapterTitle } = chapter;
    const templateMap: Record<TemplateKey, string | number | string[]> = {
      [TemplateKey.MANGA_ID]: mangaId,
      [TemplateKey.MANGA_NAME]: mangaTitle,
      [TemplateKey.CHAPTER_ID]: chapterId,
      [TemplateKey.CHAPTER_NAME]: chapterTitle,
      [TemplateKey.AUTHOR]: author.length > 0 ? author : ['未知'],
      [TemplateKey.SOURCE_ID]: source,
      [TemplateKey.SOURCE_NAME]: sourceName,
      [TemplateKey.TAG]: tag.length > 0 ? tag : ['未知'],
      [TemplateKey.STATUS]: statusToLabel(status),
      [TemplateKey.HASH]: options?.hash || nanoid(5),
      [TemplateKey.TIME]: options?.timestamp || dayjs().valueOf(),
    };

    return path.replace(PATTERN_TEMPLATE, (_match, p1 = '') => {
      const [template, parameter] = p1.split('|');
      const data = templateMap[template as TemplateKey] || template;

      switch (template) {
        case TemplateKey.TIME: {
          return sanitizeFileName(dayjs(data).format(parameter || 'X'));
        }
        case TemplateKey.AUTHOR:
        case TemplateKey.TAG: {
          return sanitizeFileName(data.join(parameter || '、'));
        }
        default: {
          return sanitizeFileName(data);
        }
      }
    });
  }
  return path;
}
export function* fileDownload({
  source,
  headers,
}: {
  source: string;
  headers?: Record<string, string>;
}) {
  const cacheEntry = CacheManager.get(source, { headers });
  const path: string | undefined = yield call(cacheEntry.getPath.bind(cacheEntry));
  if (!path) {
    throw new Error('图片加载失败');
  }
  return path;
}
function* checkAndroidPermission() {
  // https://stackoverflow.com/questions/76116840/write-external-storage-permission-is-always-blocked-in-react-native-android-plat
  // Android 9（API 28）仍需传统写入权限；API 29 起该权限不再授予给 target 36 应用。
  if (Platform.OS === 'android' && Platform.Version <= 28) {
    const writePermission = PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;
    const hasPermission: boolean = yield call(PermissionsAndroid.check, writePermission);
    if (!hasPermission) {
      const status: 'granted' | 'denied' | 'never_ask_again' = yield call(
        PermissionsAndroid.request,
        writePermission
      );
      if (status !== 'granted') {
        throw new Error(`${ErrorMessage.WithoutPermission}: ${status}`);
      }
    }
  }
}
function* checkAndroidPath(path: string) {
  if (Platform.OS === 'android' && Platform.Version <= 28) {
    const isExisted: boolean = yield call(FileSystem.exists, path);
    if (!isExisted) {
      yield call(FileSystem.mkdir, path);
    }
  }
}
function* fileExport({
  path,
  chapterHash,
  downloadPath,
  filename,
}: {
  path: string;
  chapterHash: string;
  downloadPath: string;
  filename?: string;
}) {
  if (Platform.OS === 'ios') {
    const [pluginId, mangaId] = splitHash(chapterHash);
    const mangaHash = combineHash(pluginId, mangaId);
    const dict = ((state: RootState) => state.dict)(yield select());
    const manga = dict.manga[mangaHash];
    const chapter = dict.chapter[chapterHash];

    yield call(CameraRoll.save, `file://${path}`, {
      album: `${manga?.title}-${chapter?.title}`,
    });
  } else {
    const [, name, suffix] = path.match(/.*\/(.*)\.(.*)$/) || [];
    if (Number(Platform.Version) >= 29) {
      const album = sanitizeFileName(downloadPath.split(/[\\/]/).at(-1));
      const targetName = sanitizeFileName(`${album}-${filename || name}.${suffix || 'jpg'}`);
      yield call(FileSystem.cpExternal, path, targetName, 'images');
    } else {
      const targetName = sanitizeFileName(`${filename || name}.${suffix || 'jpg'}`);
      yield call(FileSystem.cp, `file://${path}`, `${downloadPath}/${targetName}`);
    }
  }
}
function* thread() {
  try {
    while (true) {
      const queue = ((state: RootState) =>
        state.task.job.list.filter((item) => item.status === AsyncStatus.Default))(
        yield select()
      );
      const job = queue.shift();

      if (!nonNullable(job)) {
        yield delay(100);
        break;
      }

      const { taskId, jobId, chapterHash, type, source, headers, index } = job;
      yield put(startJob({ taskId, jobId }));
      try {
        const task = ((state: RootState) =>
          state.task.list.find((item) => item.taskId === taskId))(yield select());
        if (!nonNullable(task)) {
          throw new Error(ErrorMessage.ExecutionJobFail);
        }

        const { cachedPath, timeout } = yield race({
          cachedPath: call(fileDownload, { source, headers }),
          timeout: delay(10000),
        });
        if (timeout) {
          throw new Error(ErrorMessage.Timeout);
        }

        yield put(viewImage({ chapterHash, index, isVisited: false }));
        if (type === TaskType.Export) {
          yield call(fileExport, {
            path: cachedPath,
            filename: String(index),
            chapterHash,
            downloadPath: task.downloadPath,
          });
        }
        yield put(endJob({ taskId, jobId, status: AsyncStatus.Fulfilled }));
      } catch (e) {
        yield put(endJob({ taskId, jobId, status: AsyncStatus.Rejected }));
      }
    }
  } finally {
    // 线程无论正常退出、被取消还是抛异常都必须上报 finishJob，
    // 否则 taskManagerSaga 的 take(finishJob) 计数永远凑不齐 max，管理器会永久挂起。
    yield put(finishJob());
  }
}
export function* preloadChapter(chapterHash: string) {
  const prevDict = ((state: RootState) => state.dict.chapter)(yield select());
  const prevData = prevDict[chapterHash];

  if (!nonNullable(prevData)) {
    yield put(loadChapter({ chapterHash }));
    yield take(
      (candidate: Action) =>
        candidate.type === loadChapterCompletion.type &&
        (candidate as ReturnType<typeof loadChapterCompletion>).payload.actionId === chapterHash
    );
  }
  const currDict = ((state: RootState) => state.dict.chapter)(yield select());
  const currData = currDict[chapterHash];

  return currData;
}
function* pushChapterTask({
  chapterHash,
  taskType,
  actionId,
}: {
  chapterHash: string;
  taskType: TaskType;
  actionId: string;
}) {
  const chapter: Chapter | undefined = yield call(preloadChapter, chapterHash);
  const androidDownloadPath = ((state: RootState) => state.setting.androidDownloadPath)(
    yield select()
  );
  if (!nonNullable(chapter)) {
    yield put(pushTask({ error: new Error(ErrorMessage.PushTaskFail), actionId }));
    return;
  }

  const { title, headers, images } = chapter;
  if (images.length === 0) {
    yield put(pushTask({ error: new Error(ErrorMessage.PushTaskFail), actionId }));
    return;
  }
  const taskId = nanoid();
  const downloadPath: string = yield call(replaceDownloadPath, androidDownloadPath, chapterHash, {
    hash: taskId,
    timestamp: dayjs().valueOf(),
  });
  if (taskType === TaskType.Export) {
    yield call(checkAndroidPermission);
    yield call(checkAndroidPath, downloadPath);
  }

  yield put(
    pushTask({
      actionId,
      data: {
        taskId,
        chapterHash,
        title,
        type: taskType,
        status: AsyncStatus.Default,
        downloadPath,
        headers,
        queue: images.map((item, index) => ({ index, jobId: nanoid(), source: item.uri })),
        pending: [],
        success: [],
        fail: [],
      },
    })
  );
}
function* downloadAndExportChapterSaga() {
  yield takeEverySuspense(
    [downloadChapter.type, exportChapter.type],
    function* ({
      type,
      payload: chapterHashList,
    }: ReturnType<typeof downloadChapter | typeof exportChapter>) {
      const { type: taskType, message } = {
        [downloadChapter.type]: { type: TaskType.Download, message: '下载中...' },
        [exportChapter.type]: { type: TaskType.Export, message: '导出中...' },
      }[type];
      yield put(toastMessage(message));

      while (true) {
        const actionId = nanoid();
        const chapterHash = chapterHashList.shift();
        if (!chapterHash) {
          break;
        }

        yield fork(pushChapterTask, { chapterHash, taskType, actionId });
        yield take((takeAction: Action<string>) => {
          const { type: takeActionType, payload } = takeAction as ReturnType<typeof pushTask>;
          return takeActionType === pushTask.type && payload.actionId === actionId;
        });
      }
    }
  );
}
function* saveImageSaga() {
  yield takeEverySuspense(
    saveImage.type,
    function* ({ payload: { source, headers } }: ReturnType<typeof saveImage>) {
      yield call(checkAndroidPermission);

      let path: string;
      if (/^file:\/\/.+/.test(source)) {
        // 本地临时文件（解密图/base64 图的处理结果），直接存入相册
        yield call(CameraRoll.save, source);
        yield put(toastMessage('保存成功'));
        return;
      } else {
        path = yield call(fileDownload, { source, headers });
      }

      // https://storage-b.picacomic.com/static/36ec684d-82e8-4c0d-b164-745ce93070e6.png
      // The operation couldn’t be completed. (PHPhotosErrorDomain error 3302.)
      yield call(CameraRoll.save, `file://${path}`);
      yield put(toastMessage('保存成功'));
    }
  );
}
function* taskManagerSaga() {
  yield takeLeadingSuspense([restartTask.type, pushTask.type, retryTask.type], function* () {
    while (true) {
      const max = ((state: RootState) => state.task.job.max)(yield select());
      const queue = ((state: RootState) =>
        state.task.job.list.filter((item) => item.status === AsyncStatus.Default))(yield select());

      if (queue.length <= 0) {
        break;
      }

      for (let i = 0; i < max; i++) {
        yield fork(thread);
        if (i < max - 1) {
          yield delay(0);
        }
      }
      for (let i = 0; i < max; i++) {
        yield take(finishJob.type);
      }
    }
    yield put(finishTask());
  });
}

export function* catchErrorWorker({ type, payload }: PayloadAction<any>) {
  if (!payload || !payload.error) {
    return;
  }
  if (loadMangaCompletion.type === type) {
    const isCurrent: boolean = yield select(
      isCurrentMangaRequest,
      payload.mangaHash,
      payload.actionId
    );
    if (!isCurrent) {
      return;
    }
  }
  if (
    loadMangaInfoCompletion.type === type ||
    loadChapterListCompletion.type === type ||
    payload.error.message === ErrorMessage.NoMore
  ) {
    return;
  }

  const error = payload.error;
  if (error.message === 'Aborted') {
    yield put(toastMessage(ErrorMessage.RequestTimeout));
  } else {
    yield put(toastMessage(error.message));
  }
}

// 已知无 error 语义的高频 action 白名单：阅读时每张图 / 每次翻页都会 dispatch，
// 它们的 payload 不携带 error 字段。通配监听若为每条都 fork 一个 generator（即便 worker
// 第一步 early-return），generator 创建/销毁本身在低端 CPU 上仍有开销。这里在 spawner
// 层就短路掉这类 action，只对剩余 action 调用 worker。带 error 的高频 action 仍会进入。
// 用 action creator 的 .type 取值，slice 重命名时自动同步。
const HIGH_FREQUENCY_NO_ERROR_ACTIONS = new Set<string>([
  action.viewImage.type,
  action.viewPage.type,
]);

function* catchErrorSaga() {
  // 通配监听会为每条 action fork 一个 generator。viewImage/viewPage 是阅读热路径的高频
  // action（每张图 / 每次翻页都会 dispatch），payload 不携带 error 字段；这里在 spawner
  // 层直接 return，避免无谓地调用 catchErrorWorker（即便 worker 第一步 early-return，
  // generator 创建/销毁本身在低端 CPU 上也有开销）。带 error 的 action 仍进入 worker
  // 正常处理；其余低频 action 也照常交给 worker。
  yield takeEvery('*', function* (dispatchedAction: PayloadAction<any>) {
    if (
      HIGH_FREQUENCY_NO_ERROR_ACTIONS.has(dispatchedAction.type) &&
      (!dispatchedAction.payload || !dispatchedAction.payload.error)
    ) {
      return;
    }
    yield call(catchErrorWorker, dispatchedAction);
  });
}

function* takeEverySuspense(pattern: string | string[], worker: (...args: any[]) => any) {
  yield takeEvery(pattern, tryCatchWorker(worker));
}
function* takeLatestSuspense(pattern: string | string[], worker: (...args: any[]) => any) {
  yield takeLatest(pattern, tryCatchWorker(worker));
}
function* takeLeadingSuspense(pattern: string | string[], worker: (...args: any[]) => any) {
  yield takeLeading(pattern, tryCatchWorker(worker));
}
function tryCatchWorker(fn: (...args: any[]) => any): (...args: any[]) => any {
  // https://www.typescriptlang.org/docs/handbook/2/functions.html#declaring-this-in-a-function
  return function* (this: any) {
    try {
      yield fn.apply(this, Array.from(arguments));
    } catch (error) {
      if (error instanceof Error) {
        yield put(toastMessage(error.message));
        return;
      }
      yield put(toastMessage(ErrorMessage.Unknown));
    }
  };
}

export default function* rootSaga() {
  // all effect look like promise.all
  // if fork effect throw any error, all effect with shut down
  // so catch any error to keep saga running
  yield all([
    fork(initSaga),

    fork(launchSaga),
    fork(pluginSyncDataSaga),
    fork(loginPluginSaga),
    fork(syncDataSaga),
    fork(backupSaga),
    fork(restoreSaga),
    fork(saveDataSaga),
    fork(saveProgressSaga),
    fork(saveSettingSaga),
    fork(savePluginSaga),
    fork(saveFavoritesSaga),
    fork(clearCacheSaga),
    fork(loadLatestReleaseSaga),
    fork(batchUpdateSaga),
    fork(loadDiscoverySaga),
    fork(loadSearchSaga),
    fork(loadMangaSaga),
    fork(loadMangaInfoSaga),
    fork(loadChapterListSaga),
    fork(loadChapterSaga),
    fork(saveImageSaga),
    fork(downloadAndExportChapterSaga),
    fork(taskManagerSaga),

    fork(catchErrorSaga),
  ]);
}
