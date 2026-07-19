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
  migrateSetting,
  getLatestRelease,
  dictToPairs,
  pairsToDict,
  trycatch,
  nonNullable,
  statusToLabel,
  ErrorMessage,
  AsyncStatus,
  TaskType,
  TemplateKey,
} from '~/utils';
import { InteractionManager, PermissionsAndroid, Platform } from 'react-native';
import { splitHash, combineHash, PluginMap } from '~/plugins';
import { nanoid, Action, PayloadAction } from '@reduxjs/toolkit';
import { action, initialState } from './slice';
import { Dirs, FileSystem } from 'react-native-file-access';
import { CacheManager } from '@georstat/react-native-image-cache';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { pick, type DocumentPickerResponse } from '@react-native-documents/picker';
import { Storage, KeyValuePair } from '~/utils/storage';
import base64 from 'base-64';
import dayjs from 'dayjs';
import Share from 'react-native-share';
import { buildChapterIndex, buildMangaIndex, buildProgressPairs } from './persistence';

import rootSchema from '~/schema/root.json';
import dictSchema from '~/schema/dict.json';
import taskSchema from '~/schema/task.json';
import pluginSchema from '~/schema/plugin.json';
import settingSchema from '~/schema/setting.json';
import favoritesSchema from '~/schema/favorites.json';

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
  setExtra,
  sortPlugin,
  disablePlugin,
  syncPlugin,
  // batch
  batchUpdate,
  startBatchUpdate,
  endBatchUpdate,
  inStack,
  outStack,
  cancelLoadManga,
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

function migratePluginState(pluginState: RootState['plugin']): RootState['plugin'] {
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

  const legacyBikaToken = pluginState.extra.bikaToken || pluginState.extra.picaToken;

  return {
    source: PluginMap.has(pluginState.source)
      ? pluginState.source
      : list[0]?.value || initialState.plugin.source,
    list,
    // Bika 继续使用本地 Token；兼容旧 PICA 插件的 picaToken 字段。
    extra:
      typeof legacyBikaToken === 'string' && legacyBikaToken ? { bikaToken: legacyBikaToken } : {},
  };
}

export function syncPluginExtraData(extra: RootState['plugin']['extra']): void {
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
    yield take(syncDataCompletion.type);
    yield put(restartTask());
    yield put(loadLatestRelease());

    yield put(launchCompletion({ error: undefined }));
  });
}

function* pluginSyncDataSaga() {
  yield takeLatestSuspense(
    setExtra.type,
    function* ({ payload: { source } }: ReturnType<typeof setExtra>) {
      const extra = ((state: RootState) => state.plugin.extra)(yield select());
      const plugin = PluginMap.get(source);

      if (!plugin) {
        yield put(toastMessage(ErrorMessage.PluginMissing));
        return;
      }

      const message = plugin.syncExtraData(extra);
      if (typeof message === 'string') {
        yield put(toastMessage(message));
      }
    }
  );
}

function* syncDataSaga() {
  yield takeLatestSuspense(syncData.type, function* () {
    try {
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
          yield put(toastMessage('同步字典数据失败：格式错误'));
        }
      } else {
        const dict: RootState['dict'] = JSON.parse(dictData);
        const migratedDict = migratePluginDict(dict);
        if (validate(migratedDict, dictSchema)) {
          yield put(syncDict(migratedDict));
        } else {
          yield put(toastMessage('同步字典数据失败：格式错误'));
        }
        yield call(Storage.removeItem, storageKey.dict);
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
      const migratedTask = migratePluginTask(task);
      if (validate(migratedTask, taskSchema)) {
        yield put(syncTask(migratedTask));
      } else {
        yield put(toastMessage('同步任务数据失败：格式错误'));
      }

      if (favoritesData) {
        const favorites: RootState['favorites'] = JSON.parse(favoritesData).filter(
          (item: RootState['favorites'][number]) => isRegisteredHash(item.mangaHash)
        );
        if (validate(favorites, favoritesSchema)) {
          yield put(syncFavorites(favorites));
        } else {
          yield put(toastMessage('同步收藏数据失败：格式错误'));
        }
      }

      if (pluginData) {
        const plugin = migratePluginState(JSON.parse(pluginData));
        if (validate(plugin, pluginSchema)) {
          syncPluginExtraData(plugin.extra);
          yield put(syncPlugin(plugin));
        } else {
          yield put(toastMessage('同步插件数据失败：格式错误'));
        }
      }
      if (settingData) {
        const setting = migrateSetting(JSON.parse(settingData));
        if (validate(setting, settingSchema, initialState.setting)) {
          yield put(syncSetting(setting));
        } else {
          yield put(toastMessage('同步设置失败：格式错误'));
        }
      }

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
      const record: RootState['dict']['record'] = {};

      for (const key in rootState.dict.record) {
        record[key] = { ...rootState.dict.record[key], progress: 0, imagesLoaded: [] };
      }

      const data = base64.encode(
        encodeURIComponent(JSON.stringify({ ...rootState, dict: { ...rootState.dict, record } }))
      );
      const filename = 'MangaReader备份数据' + dayjs().format('YYYY-MM-DD');
      const path = `${Dirs.CacheDir}/${filename}.txt`;

      yield call(FileSystem.writeFile, path, data, 'base64');
      yield call(Share.open, {
        filename,
        type: 'text/plain',
        url: Platform.OS === 'ios' ? path : 'data:text/plain;base64,' + data,
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
      const source: string = yield call(FileSystem.readFile, res.uri, 'base64');
      const data = JSON.parse(
        decodeURIComponent(base64.decode(source.replace('datatext/plainbase64', '')))
      );
      data.setting = migrateSetting(data.setting);
      migrateDeletedPluginData(data);

      if (!validate(data, rootSchema, initialState)) {
        throw new Error('数据格式错误');
      }

      yield put(syncFavorites(data.favorites));
      syncPluginExtraData(data.plugin.extra);
      yield put(syncPlugin(data.plugin));
      yield put(syncSetting(data.setting));
      yield put(syncTask(data.task));
      yield put(syncDict(data.dict));
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

function* saveData() {
  yield call(waitForInteractions);
  const rootState = ((state: RootState) => state)(yield select());

  const fn = () => {
    const { favorites, dict, plugin, setting, task } = rootState;
    const mangaIndex = buildMangaIndex(rootState);
    const chapterIndex = buildChapterIndex(rootState);
    const taskIndex: string[] = [];
    const jobIndex: string[] = [];
    const mangaDict: Record<string, any> = {};
    const chapterDict: Record<string, any> = {};
    const taskDict: Record<string, any> = {};
    const jobDict: Record<string, any> = {};

    mangaIndex.forEach((mangaHash) => {
      const manga = dict.manga[mangaHash];
      const lastWatch = dict.lastWatch[mangaHash];
      mangaDict[mangaHash] = { manga, lastWatch };
    });
    chapterIndex.forEach((chapterHash) => {
      chapterDict[chapterHash] = {
        chapter: dict.chapter[chapterHash],
        record: dict.record[chapterHash],
      };
    });
    task.list.forEach((item) => {
      taskDict[item.taskId] = item;
      taskIndex.push(item.taskId);
    });
    task.job.list.forEach((item) => {
      jobDict[item.jobId] = item;
      jobIndex.push(item.jobId);
    });

    const keyValuePairs: [string, string][] = [
      ...dictToPairs(mangaDict),
      ...dictToPairs(chapterDict),
      ...dictToPairs(taskDict),
      ...dictToPairs(jobDict),
      [storageKey.mangaIndex, JSON.stringify(mangaIndex)],
      [storageKey.chapterIndex, JSON.stringify(chapterIndex)],
      [storageKey.taskIndex, JSON.stringify(taskIndex)],
      [storageKey.jobIndex, JSON.stringify(jobIndex)],
      [storageKey.favorites, JSON.stringify(favorites)],
      [storageKey.plugin, JSON.stringify(plugin)],
      [storageKey.setting, JSON.stringify(setting)],
    ];

    return new Promise((res, rej) => {
      Storage.multiSet(keyValuePairs).then(res).catch(rej);
    });
  };

  yield call(fn);
}

const waitForInteractions = () =>
  new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });

const saveProgressWorker = (function () {
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
      if (!haveError(payload)) {
        mangaHashes.add(payload.data.hash);
        rebuildIndexes = true;
      }
    } else if (type === loadChapterCompletion.type) {
      const chapterHash = payload.data?.hash || payload.actionId;
      if (chapterHash) {
        chapterHashes.add(chapterHash);
        rebuildIndexes = true;
      }
    }

    if (isPending || (mangaHashes.size === 0 && chapterHashes.size === 0)) {
      return;
    }

    isPending = true;
    try {
      yield delay(250);
      while (mangaHashes.size > 0 || chapterHashes.size > 0) {
        const dirtyManga = Array.from(mangaHashes);
        const dirtyChapter = Array.from(chapterHashes);
        const shouldRebuildIndexes = rebuildIndexes;
        mangaHashes.clear();
        chapterHashes.clear();
        rebuildIndexes = false;

        yield call(waitForInteractions);
        const state = ((root: RootState) => root)(yield select());
        const pairs = buildProgressPairs(state, dirtyManga, dirtyChapter);
        if (shouldRebuildIndexes) {
          pairs.push(
            [storageKey.mangaIndex, JSON.stringify(buildMangaIndex(state))],
            [storageKey.chapterIndex, JSON.stringify(buildChapterIndex(state))]
          );
        }
        if (pairs.length > 0) {
          yield call(Storage.multiSet, pairs);
        }

        if (mangaHashes.size > 0 || chapterHashes.size > 0) {
          yield delay(250);
        }
      }
    } finally {
      isPending = false;
    }
  };
})();

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
      setPageKeys.type,
      setDirection.type,
      setSequence.type,
      setSeat.type,
      setTimer.type,
      setTimerGap.type,
      setAndroidDownloadPath.type,
    ],
    function* () {
      yield call(waitForInteractions);
      const setting = ((state: RootState) => state.setting)(yield select());
      yield call(Storage.setItem, storageKey.setting, JSON.stringify(setting));
    }
  );
}

function* savePluginSaga() {
  yield takeLatestSuspense(
    [setSource.type, setExtra.type, sortPlugin.type, disablePlugin.type],
    function* () {
      yield call(waitForInteractions);
      const plugin = ((state: RootState) => state.plugin)(yield select());
      yield call(Storage.setItem, storageKey.plugin, JSON.stringify(plugin));
    }
  );
}

function* saveFavoritesSaga() {
  yield takeLatestSuspense(
    [viewFavorites.type, enabledBatch.type, disabledBatch.type],
    function* () {
      yield call(waitForInteractions);
      const favorites = ((state: RootState) => state.favorites)(yield select());
      yield call(Storage.setItem, storageKey.favorites, JSON.stringify(favorites));
    }
  );
}
const saveDataWorker = (function () {
  let count = 0;
  let isPending = false;
  return function* () {
    count++;
    if (isPending) {
      return;
    }

    isPending = true;
    while (count > 0) {
      count = 0;
      yield call(saveData);
      yield delay(1000);
    }
    isPending = false;
  };
})();
function* saveDataSaga() {
  yield takeEverySuspense(
    [
      clearCacheCompletion.type,
      restoreCompletion.type,
      addFavorites.type,
      removeFavorites.type,
      pushTask.type,
      removeTask.type,
      finishTask.type,
    ],
    saveDataWorker
  );
}
function* clearCacheSaga() {
  yield takeLatestSuspense(clearCache.type, function* () {
    yield call(Storage.clear);
    syncPluginExtraData({});
    yield put(syncData());
    yield take(syncDataCompletion.type);
    yield put(clearCacheCompletion({}));
  });
}

function* loadLatestReleaseSaga() {
  yield takeLatestSuspense(loadLatestRelease.type, function* () {
    const { error: fetchError, data } = yield call(fetchData, {
      url: 'https://api.github.com/repos/youniaogu/MangaReader/releases',
    });
    const { error: DataError, release } = getLatestRelease(data);

    yield put(loadLatestReleaseCompletion({ error: fetchError || DataError, data: release }));
  });
}

function* batchUpdateSaga() {
  yield takeLeadingSuspense(
    batchUpdate.type,
    function* ({ payload: defaultList }: ReturnType<typeof batchUpdate>) {
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
          outStack({ isSuccess: false, isTrend: false, hash, isRetry: false });
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
  );
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

      const { error: fetchError, data } = yield call(
        fetchData,
        plugin.prepareDiscoveryFetch(page, filterWithDefault)
      );
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

      const { error: fetchError, data } = yield call(
        fetchData,
        plugin.prepareSearchFetch(keyword, page, filterWithDefault)
      );
      const { error: pluginError, search } = trycatch(
        () => plugin.handleSearch(data),
        '漫画数据解析错误：'
      );

      yield put(loadSearchCompletion({ error: fetchError || pluginError, data: search }));
    }
  );
}

function* loadMangaSaga() {
  yield takeEverySuspense(
    loadManga.type,
    function* ({ payload: { mangaHash, actionId } }: ReturnType<typeof loadManga>) {
      function* loadMangaEffect() {
        yield put(loadMangaInfo({ mangaHash, actionId }));
        const {
          payload: { error: loadMangaInfoError, data: mangaInfo },
        }: ReturnType<typeof loadMangaInfoCompletion> = yield take((takeAction: Action<string>) => {
          const { type, payload } = takeAction as ReturnType<typeof loadMangaInfoCompletion>;
          return type === loadMangaInfoCompletion.type && payload.actionId === actionId;
        });

        yield put(loadChapterList({ mangaHash, page: 1 }));
        const {
          payload: { error: loadChapterListError, data: chapterInfo },
        }: ReturnType<typeof loadChapterListCompletion> = yield take(
          (takeAction: Action<string>) => {
            const { type, payload } = takeAction as ReturnType<typeof loadChapterListCompletion>;
            return (
              type === loadChapterListCompletion.type &&
              payload.data !== undefined &&
              payload.data.mangaHash === mangaHash &&
              payload.data.page === 1
            );
          }
        );

        if (loadMangaInfoError) {
          yield put(loadMangaCompletion({ error: loadMangaInfoError, actionId }));
          return;
        }
        if (loadChapterListError) {
          yield put(loadMangaCompletion({ error: loadChapterListError, actionId }));
          return;
        }
        if (!nonNullable(mangaInfo) || !nonNullable(chapterInfo)) {
          yield put(
            loadMangaCompletion({ error: new Error(ErrorMessage.WrongDataType), actionId })
          );
          return;
        }

        yield put(
          loadMangaCompletion({
            data: {
              ...mangaInfo,
              chapters: (mangaInfo.chapters || []).concat(chapterInfo.list),
            },
            actionId,
          })
        );
      }

      yield race({
        task: call(loadMangaEffect),
        cancel: take(cancelLoadManga.type),
      });
    }
  );
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

      const { error: fetchError, data } = yield call(
        fetchData,
        plugin.prepareMangaInfoFetch(mangaId, cachedManga)
      );
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

function* loadChapterListSaga() {
  yield takeEverySuspense(
    loadChapterList.type,
    function* ({ payload: { mangaHash, page } }: ReturnType<typeof loadChapterList>) {
      const [source, mangaId] = splitHash(mangaHash);
      const plugin = PluginMap.get(source);

      if (!plugin) {
        yield put(loadChapterListCompletion({ error: new Error(ErrorMessage.PluginMissing) }));
        return;
      }

      const body = plugin.prepareChapterListFetch(mangaId, page);
      if (!body) {
        yield put(loadChapterListCompletion({ data: { mangaHash, page, list: [] } }));
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
          })
        );
        return;
      }

      if (canLoadMore) {
        yield put(loadChapterList({ mangaHash, page: page + 1 }));
        const {
          payload: { error: loadMoreError, data: extraData },
        }: ReturnType<typeof loadChapterListCompletion> = yield take(
          (takeAction: Action<string>) => {
            const { type, payload } = takeAction as ReturnType<typeof loadChapterListCompletion>;
            return (
              type === loadChapterListCompletion.type &&
              payload.data !== undefined &&
              payload.data.mangaHash === mangaHash &&
              payload.data.page === page + 1
            );
          }
        );

        if (!loadMoreError && extraData) {
          chapterList.push(...extraData.list);
        }
      }

      yield put(
        loadChapterListCompletion({
          error: fetchError || pluginError,
          data: { mangaHash, page, list: chapterList },
        })
      );
    }
  );
}

function* loadChapterSaga() {
  yield takeEverySuspense(
    loadChapter.type,
    function* ({ payload: { chapterHash } }: ReturnType<typeof loadChapter>) {
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
      while (true) {
        const { error: fetchError, data } = yield call(
          fetchData,
          plugin.prepareChapterFetch(mangaId, chapterId, page, extra)
        );
        const {
          error: pluginError,
          chapter: nextChapter,
          canLoadMore,
          nextPage = page + 1,
          nextExtra = extra,
        } = trycatch(
          () => plugin.handleChapter(data, mangaId, chapterId, page),
          '章节数据解析错误：'
        );

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
  );
}

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
          return dayjs(data).format(parameter || 'X');
        }
        case TemplateKey.AUTHOR:
        case TemplateKey.TAG: {
          return data.join(parameter || '、');
        }
        default: {
          return data;
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
  if (Platform.OS === 'android') {
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
    yield call(FileSystem.cp, `file://${path}`, `${downloadPath}/${filename || name}.${suffix}`);
  }
}
function* thread() {
  while (true) {
    const queue = ((state: RootState) =>
      state.task.job.list.filter((item) => item.status === AsyncStatus.Default))(yield select());
    const job = queue.shift();

    if (!nonNullable(job)) {
      yield delay(100);
      yield put(finishJob());
      break;
    }

    const { taskId, jobId, chapterHash, type, source, headers, index } = job;
    yield put(startJob({ taskId, jobId }));
    try {
      const task = ((state: RootState) => state.task.list.find((item) => item.taskId === taskId))(
        yield select()
      );
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
}
function* preloadChapter(chapterHash: string) {
  const prevDict = ((state: RootState) => state.dict.chapter)(yield select());
  const prevData = prevDict[chapterHash];

  if (!nonNullable(prevData)) {
    yield put(loadChapter({ chapterHash }));
    yield take(loadChapterCompletion.type);
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
  const taskId = nanoid(5);
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
        queue: images.map((item, index) => ({ index, jobId: nanoid(5), source: item.uri })),
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
      } else if (/^data:image\/png;base64,.+/.test(source)) {
        path = CacheManager.config.baseDir + nanoid() + '.png';
        yield call(
          FileSystem.writeFile,
          path,
          source.replace('data:image/png;base64,', ''),
          'base64'
        );
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

function* catchErrorSaga() {
  yield takeEverySuspense('*', function* ({ type, payload }: PayloadAction<any>) {
    if (
      !haveError(payload) ||
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
