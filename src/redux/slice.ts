import {
  AsyncStatus,
  MangaStatus,
  Sequence,
  LayoutMode,
  ThemeMode,
  ReaderDirection,
  MultipleSeat,
  PageKeys,
  Timer,
} from '~/utils';
import { createSlice, combineReducers, nanoid, PayloadAction } from '@reduxjs/toolkit';
import { Plugin, defaultPlugin, defaultPluginList } from '~/plugins';
import { Dirs } from 'react-native-file-access';
import { normalizeTaskForRestart, buildJob } from './task';

/** 默认漫画导出目录；抽成常量避免展示组件直接依赖 initialState（放大 bootstrap 求值顺序的脆弱面） */
export const DEFAULT_ANDROID_DOWNLOAD_PATH = Dirs.SDCardDir + '/DCIM/{{CHAPTER_NAME}}';

export const initialState: RootState = {
  app: {
    launchStatus: AsyncStatus.Default,
    message: [],
  },
  datasync: {
    syncStatus: AsyncStatus.Default,
    clearStatus: AsyncStatus.Default,
    backupStatus: AsyncStatus.Default,
    restoreStatus: AsyncStatus.Default,
  },
  release: {
    loadStatus: AsyncStatus.Default,
    name: process.env.NAME,
    version: process.env.VERSION,
    publishTime: process.env.PUBLISH_TIME,
  },
  setting: {
    mode: LayoutMode.Horizontal,
    themeMode: ThemeMode.System,
    direction: ReaderDirection.Right,
    sequence: Sequence.Desc,
    seat: MultipleSeat.AToB,
    pageKeys: PageKeys.Enable,
    timer: Timer.Disabled,
    timerGap: 5000,
    androidDownloadPath: DEFAULT_ANDROID_DOWNLOAD_PATH,
  },
  plugin: {
    source: defaultPlugin,
    list: defaultPluginList,
  },
  batch: {
    loadStatus: AsyncStatus.Default,
    stack: [],
    queue: [],
    success: [],
    fail: [],
  },
  search: {
    filter: {},
    keyword: '',
    page: 1,
    isEnd: false,
    loadStatus: AsyncStatus.Default,
    list: [],
  },
  discovery: {
    filter: {},
    page: 1,
    isEnd: false,
    loadStatus: AsyncStatus.Default,
    list: [],
  },
  favorites: [],
  manga: {
    loadByHash: {},
  },
  chapter: {
    loadByHash: {},
    openDrawer: false,
    showDrawer: false,
  },
  task: {
    list: [],
    job: {
      // 1GB 电子墨水设备：限制并发下载，避免多张大图同时占用网络与解码内存。
      max: 2,
      list: [],
      thread: [],
    },
  },
  dict: {
    manga: {},
    chapter: {},
    record: {},
    lastWatch: {},
  },
};
const defaultIncreaseManga = {
  latest: '',
  updateTime: '',
  bookCover: '',
  infoCover: '',
  author: [],
  tag: [],
  status: MangaStatus.Unknown,
  chapters: [],
};

const appSlice = createSlice({
  name: 'app',
  initialState: initialState.app,
  reducers: {
    launch(state) {
      state.launchStatus = AsyncStatus.Pending;
    },
    launchCompletion(state, action: FetchResponseAction) {
      if (action.payload.error) {
        state.launchStatus = AsyncStatus.Rejected;
        return;
      }
      state.launchStatus = AsyncStatus.Fulfilled;
    },
    toastMessage(state, action: PayloadAction<string>) {
      state.message.push(action.payload);
    },
    throwMessage(state) {
      state.message = [];
    },
  },
});

const datasyncSlice = createSlice({
  name: 'datasync',
  initialState: initialState.datasync,
  reducers: {
    syncData(state) {
      state.syncStatus = AsyncStatus.Pending;
    },
    syncDataCompletion(state, action: FetchResponseAction) {
      if (action.payload.error) {
        state.syncStatus = AsyncStatus.Rejected;
        return;
      }
      state.syncStatus = AsyncStatus.Fulfilled;
    },
    backup(state) {
      state.backupStatus = AsyncStatus.Pending;
    },
    backupCompletion(state, action: FetchResponseAction) {
      if (action.payload.error) {
        state.backupStatus = AsyncStatus.Rejected;
        return;
      }
      state.backupStatus = AsyncStatus.Fulfilled;
    },
    restore(state) {
      state.restoreStatus = AsyncStatus.Pending;
    },
    restoreCompletion(state, action: FetchResponseAction) {
      if (action.payload.error) {
        state.restoreStatus = AsyncStatus.Rejected;
        return;
      }
      state.restoreStatus = AsyncStatus.Fulfilled;
    },
    clearCache(state) {
      state.clearStatus = AsyncStatus.Pending;
    },
    clearCacheCompletion(state, action: FetchResponseAction) {
      if (action.payload.error) {
        state.clearStatus = AsyncStatus.Rejected;
        return;
      }
      state.clearStatus = AsyncStatus.Fulfilled;
    },
  },
});

const releaseSlice = createSlice({
  name: 'release',
  initialState: initialState.release,
  reducers: {
    loadLatestRelease(state) {
      state.loadStatus = AsyncStatus.Pending;
      state.latest = undefined;
    },
    loadLatestReleaseCompletion(state, action: FetchResponseAction<LatestRelease>) {
      const { error, data } = action.payload;

      if (error) {
        state.loadStatus = AsyncStatus.Rejected;
        return;
      }

      state.loadStatus = AsyncStatus.Fulfilled;
      state.latest = data;
    },
  },
});

const settingSlice = createSlice({
  name: 'setting',
  initialState: initialState.setting,
  reducers: {
    setMode(state, action: PayloadAction<LayoutMode>) {
      state.mode = action.payload;
    },
    setThemeMode(state, action: PayloadAction<ThemeMode>) {
      state.themeMode = action.payload;
    },
    setDirection(state, action: PayloadAction<ReaderDirection>) {
      state.direction = action.payload;
    },
    setSequence(state, action: PayloadAction<Sequence>) {
      state.sequence = action.payload;
    },
    setSeat(state, action: PayloadAction<MultipleSeat>) {
      state.seat = action.payload;
    },
    setPageKeys(state, action: PayloadAction<PageKeys>) {
      state.pageKeys = action.payload;
    },
    setTimer(state, action: PayloadAction<Timer>) {
      state.timer = action.payload;
    },
    setTimerGap(state, action: PayloadAction<number>) {
      state.timerGap = action.payload;
    },
    setAndroidDownloadPath(state, action: PayloadAction<string>) {
      state.androidDownloadPath = action.payload;
    },
    syncSetting(_state, action: PayloadAction<RootState['setting']>) {
      return action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(datasyncAction.clearCache, () => {
      return initialState.setting;
    });
  },
});

const pluginSlice = createSlice({
  name: 'plugin',
  initialState: initialState.plugin,
  reducers: {
    setSource(state, action: PayloadAction<Plugin>) {
      state.source = action.payload;
    },
    setCredential(_state, _action: PayloadAction<{ source: Plugin }>) {},
    loginPlugin(
      _state,
      _action: PayloadAction<{ source: Plugin; username: string; password: string }>
    ) {},
    disablePlugin(state, action: PayloadAction<Plugin>) {
      const index = state.list.findIndex((item) => item.value === action.payload);

      if (index !== -1) {
        state.list[index].disabled = !state.list[index].disabled;
      }
    },
    sortPlugin(state, action: PayloadAction<RootState['plugin']['list']>) {
      state.list = action.payload;
    },
    syncPlugin(_state, action: PayloadAction<RootState['plugin']>) {
      return action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(datasyncAction.clearCache, () => {
      return initialState.plugin;
    });
  },
});

const batchSlice = createSlice({
  name: 'batch',
  initialState: initialState.batch,
  reducers: {
    batchUpdate(_state, _action: PayloadAction<string[] | undefined>) {},
    startBatchUpdate(state, action: PayloadAction<string[]>) {
      state.loadStatus = AsyncStatus.Pending;
      state.queue = action.payload;
      state.success = [];
      state.fail = [];
    },
    endBatchUpdate(state) {
      state.loadStatus = AsyncStatus.Fulfilled;
    },
    inStack(state, action: PayloadAction<string>) {
      state.stack.push(action.payload);
      state.queue = state.queue.filter((item) => item !== action.payload);
    },
    outStack(
      state,
      action: PayloadAction<{
        isSuccess: boolean;
        isTrend: boolean;
        hash: string;
        isRetry: boolean;
      }>
    ) {
      const { isSuccess, hash, isRetry } = action.payload;
      state.stack = state.stack.filter((item) => item !== hash);
      if (isSuccess) {
        state.success.push(hash);
      } else {
        isRetry ? state.queue.push(hash) : state.fail.push(hash);
      }
    },
  },
});

const searchSlice = createSlice({
  name: 'search',
  initialState: initialState.search,
  reducers: {
    setSearchFilter(state, action: PayloadAction<Record<string, string>>) {
      state.filter = {
        ...state.filter,
        ...action.payload,
      };
    },
    resetSearchFilter(state) {
      state.filter = {};
    },
    loadSearch(
      state,
      action: PayloadAction<{ keyword: string; isReset?: boolean; source: Plugin }>
    ) {
      const { keyword, isReset = false } = action.payload;
      if (isReset) {
        state.page = 1;
        state.list = [];
        state.isEnd = false;
      }

      state.keyword = keyword;
      state.loadStatus = AsyncStatus.Pending;
    },
    loadSearchCompletion(state, action: FetchResponseAction<IncreaseManga[]>) {
      const { error, data = [] } = action.payload;
      if (error) {
        state.loadStatus = AsyncStatus.Rejected;
        return;
      }

      const list = Array.from(new Set(state.list.concat(data.map((item) => item.hash))));
      state.page += 1;
      state.loadStatus = AsyncStatus.Fulfilled;
      state.isEnd = list.length === state.list.length;
      state.list = list;
    },
  },
});

const discoverySlice = createSlice({
  name: 'discovery',
  initialState: initialState.discovery,
  reducers: {
    setDiscoveryFilter(state, action: PayloadAction<Record<string, string>>) {
      state.filter = {
        ...state.filter,
        ...action.payload,
      };
    },
    loadDiscovery(state, action: PayloadAction<{ isReset?: boolean; source: Plugin }>) {
      const isReset = action.payload.isReset || false;
      if (isReset) {
        state.page = 1;
        state.list = [];
        state.isEnd = false;
      }

      state.loadStatus = AsyncStatus.Pending;
    },
    loadDiscoveryCompletion(state, action: FetchResponseAction<IncreaseManga[]>) {
      const { error, data = [] } = action.payload;
      if (error) {
        state.loadStatus = AsyncStatus.Rejected;
        return;
      }

      const list = Array.from(new Set(state.list.concat(data.map((item) => item.hash))));
      state.page += 1;
      state.loadStatus = AsyncStatus.Fulfilled;
      state.isEnd = list.length === state.list.length;
      state.list = list;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(pluginAction.setSource, (state) => {
      state.filter = {};
      state.loadStatus = AsyncStatus.Default;
    });
  },
});

const favoritesSlice = createSlice({
  name: 'favorites',
  initialState: initialState.favorites,
  reducers: {
    addFavorites(state, action: PayloadAction<{ mangaHash: string; enableBatch?: boolean }>) {
      const { mangaHash, enableBatch = true } = action.payload;
      state.unshift({ mangaHash, isTrend: false, enableBatch });
    },
    removeFavorites(state, action: PayloadAction<string | string[]>) {
      if (Array.isArray(action.payload)) {
        return state.filter((item) => !action.payload.includes(item.mangaHash));
      }
      return state.filter((item) => item.mangaHash !== action.payload);
    },
    enabledBatch(state, action: PayloadAction<string>) {
      return state.map((item) => {
        if (item.mangaHash === action.payload) {
          return {
            ...item,
            enableBatch: true,
          };
        }
        return item;
      });
    },
    disabledBatch(state, action: PayloadAction<string>) {
      return state.map((item) => {
        if (item.mangaHash === action.payload) {
          return {
            ...item,
            enableBatch: false,
          };
        }
        return item;
      });
    },
    viewFavorites(state, action: PayloadAction<string>) {
      return state.reduce<RootState['favorites']>((dict, item) => {
        if (item.mangaHash === action.payload) {
          return [{ ...item, isTrend: false }, ...dict];
        }
        return [...dict, item];
      }, []);
    },
    syncFavorites(_state, action: PayloadAction<RootState['favorites']>) {
      return action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(batchAction.outStack, (state, action) => {
        const { isSuccess, isTrend, hash } = action.payload;
        if (isSuccess && isTrend) {
          return state.reduce<RootState['favorites']>((dict, item) => {
            if (item.mangaHash === hash) {
              return [{ ...item, isTrend: true }, ...dict];
            }
            return [...dict, item];
          }, []);
        }
      })
      .addCase(datasyncAction.clearCache, () => {
        return initialState.favorites;
      });
  },
});

const mangaSlice = createSlice({
  name: 'manga',
  initialState: initialState.manga,
  reducers: {
    loadManga: {
      reducer(state, action: PayloadAction<{ mangaHash: string; actionId: string }>) {
        state.loadByHash[action.payload.mangaHash] = {
          status: AsyncStatus.Pending,
          actionId: action.payload.actionId,
        };
      },
      prepare(payload: { mangaHash: string; actionId?: string }) {
        return { payload: { ...payload, actionId: payload.actionId || nanoid() } };
      },
    },
    loadMangaCompletion(
      state,
      action: PayloadAction<
        | {
            error: Error;
            data?: IncreaseManga;
            actionId: string;
            mangaHash: string;
          }
        | {
            error?: undefined;
            data: IncreaseManga;
            actionId: string;
            mangaHash: string;
          }
      >
    ) {
      const { error } = action.payload;
      const request = state.loadByHash[action.payload.mangaHash];
      if (!request || request.actionId !== action.payload.actionId) {
        return;
      }
      if (error) {
        request.status = AsyncStatus.Rejected;
        return;
      }
      request.status = AsyncStatus.Fulfilled;
    },
    loadMangaInfo(_state, _action: PayloadAction<{ mangaHash: string; actionId: string }>) {},
    loadMangaInfoCompletion(_state, _action: FetchResponseAction<IncreaseManga>) {},
    loadChapterList(
      _state,
      _action: PayloadAction<{ mangaHash: string; page: number; actionId: string }>
    ) {},
    loadChapterListCompletion(
      _state,
      _action: FetchResponseAction<{ mangaHash: string; page: number; list: Manga['chapters'] }>
    ) {},
  },
});

const chapterSlice = createSlice({
  name: 'chapter',
  initialState: initialState.chapter,
  reducers: {
    loadChapter(state, action: PayloadAction<{ chapterHash: string }>) {
      state.loadByHash[action.payload.chapterHash] = AsyncStatus.Pending;
    },
    loadChapterCompletion(state, action: FetchResponseAction<Chapter>) {
      const { error } = action.payload;
      const chapterHash = action.payload.actionId;
      if (!chapterHash || state.loadByHash[chapterHash] !== AsyncStatus.Pending) {
        return;
      }
      if (error) {
        state.loadByHash[chapterHash] = AsyncStatus.Rejected;
        return;
      }
      state.loadByHash[chapterHash] = AsyncStatus.Fulfilled;
    },

    downloadChapter: (_state, _action: PayloadAction<string[]>) => {},
    exportChapter: (_state, _action: PayloadAction<string[]>) => {},
    saveImage: (
      _state,
      _action: PayloadAction<{ source: string; headers?: Record<string, string> }>
    ) => {},

    setPrehandleLogStatus(state, action: PayloadAction<boolean>) {
      state.openDrawer = action.payload && state.showDrawer;
    },
    setPrehandleLogVisible(state, action: PayloadAction<boolean>) {
      state.showDrawer = action.payload;
    },
  },
});

const missionSlice = createSlice({
  name: 'task',
  initialState: initialState.task,
  reducers: {
    restartTask(state) {
      return normalizeTaskForRestart(state as RootState['task']);
    },
    pushTask(state, action: FetchResponseAction<Task>) {
      const { error, data: task } = action.payload;
      if (error) {
        return;
      }

      state.list.push(task);
      state.job.list.push(...task.queue.map((item) => buildJob(task, item)));
    },
    retryTask(state, action: PayloadAction<string[]>) {
      action.payload.forEach((taskId) => {
        const task = state.list.find((item) => item.taskId === taskId);
        if (task && task.fail.length > 0) {
          state.job.list = state.job.list.filter((item) => item.taskId !== taskId);
          state.job.thread = state.job.thread.filter((item) => item.taskId !== taskId);
          state.job.list.push(
            ...task.queue
              .filter((item) => task.fail.includes(item.jobId))
              .map((item) => buildJob(task, item))
          );
          task.fail = [];
          task.status = AsyncStatus.Default;
        }
      });
    },
    removeTask(state, action: PayloadAction<string>) {
      state.list = state.list.filter((item) => item.taskId !== action.payload);
      state.job.list = state.job.list.filter((item) => item.taskId !== action.payload);
      state.job.thread = state.job.thread.filter((item) => item.taskId !== action.payload);
    },
    finishTask() {},
    startJob(state, action: PayloadAction<{ taskId: string; jobId: string }>) {
      const { taskId, jobId } = action.payload;
      const task = state.list.find((item) => item.taskId === taskId);
      const job = state.job.list.find((item) => item.taskId === taskId && item.jobId === jobId);

      if (task && job) {
        task.pending.push(jobId);
        task.status = AsyncStatus.Pending;
        job.status = AsyncStatus.Pending;
        state.job.thread.push({ taskId, jobId });
      }
    },
    endJob(state, action: PayloadAction<{ taskId: string; jobId: string; status: AsyncStatus }>) {
      const { taskId, jobId, status } = action.payload;
      const task = state.list.find((item) => item.taskId === taskId);

      if (task) {
        task.pending = task.pending.filter((item) => item !== jobId);
        state.job.thread = state.job.thread.filter(
          (item) => item.taskId !== taskId || item.jobId !== jobId
        );
        state.job.list = state.job.list.filter(
          (item) => item.taskId !== taskId || item.jobId !== jobId
        );
        if (status === AsyncStatus.Fulfilled) {
          if (!task.success.includes(jobId)) {
            task.success.push(jobId);
          }
        }
        if (status === AsyncStatus.Rejected) {
          if (!task.fail.includes(jobId)) {
            task.fail.push(jobId);
          }
        }
        if (task.success.length + task.fail.length >= task.queue.length) {
          if (task.fail.length <= 0) {
            task.status = AsyncStatus.Fulfilled;
            state.list = state.list.filter((item) => item.taskId !== taskId);
          } else {
            task.status = AsyncStatus.Rejected;
          }
        } else {
          task.status = AsyncStatus.Pending;
        }
      }
    },
    finishJob() {},
    syncTask(_state, action: PayloadAction<RootState['task']>) {
      return action.payload;
    },
  },
});

const dictSlice = createSlice({
  name: 'dict',
  initialState: initialState.dict,
  reducers: {
    syncDict(_state, action: PayloadAction<RootState['dict']>) {
      return action.payload;
    },
    saveManga(state, action: PayloadAction<IncreaseManga>) {
      const data = action.payload;
      state.manga[data.hash] = {
        ...defaultIncreaseManga,
        ...state.manga[data.hash],
        ...data,
      };
    },
    viewChapter(
      state,
      action: PayloadAction<{ mangaHash: string; chapterHash: string; chapterTitle: string }>
    ) {
      const { mangaHash, chapterHash, chapterTitle } = action.payload;
      if (!state.lastWatch[mangaHash]) {
        state.lastWatch[mangaHash] = {};
      }
      state.lastWatch[mangaHash].chapter = chapterHash;
      state.lastWatch[mangaHash].title = chapterTitle;
    },
    viewPage(state, action: PayloadAction<{ mangaHash: string; page: number }>) {
      const { mangaHash, page } = action.payload;
      if (!state.lastWatch[mangaHash]) {
        state.lastWatch[mangaHash] = {};
      }
      state.lastWatch[mangaHash].page = page;
    },
    viewImage(
      state,
      action: PayloadAction<{ chapterHash: string; index: number; isVisited?: boolean }>
    ) {
      const { chapterHash, index, isVisited = true } = action.payload;
      const chapter = state.chapter[chapterHash];

      if (chapter) {
        if (!state.record[chapterHash]) {
          state.record[chapterHash] = {
            total: 0,
            progress: 0,
            imagesLoaded: [],
            isVisited: false,
          };
        }

        const prev = state.record[chapterHash];
        const imagesLoaded = Array.from(new Set([...prev.imagesLoaded, index]));

        state.record[chapterHash] = {
          total: chapter.images.length,
          progress: Math.max(
            prev.progress,
            Math.floor((imagesLoaded.length * 100) / chapter.images.length)
          ),
          imagesLoaded,
          isVisited: isVisited ? true : prev.isVisited,
        };
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(searchAction.loadSearchCompletion, (state, action) => {
        const { error, data } = action.payload;
        if (error) {
          return;
        }

        data.forEach((item) => {
          state.manga[item.hash] = {
            ...defaultIncreaseManga,
            ...state.manga[item.hash],
            ...item,
          };
        });
      })
      .addCase(discoveryAction.loadDiscoveryCompletion, (state, action) => {
        const { error, data } = action.payload;
        if (error) {
          return;
        }

        data.forEach((item) => {
          state.manga[item.hash] = {
            ...defaultIncreaseManga,
            ...state.manga[item.hash],
            ...item,
          };
        });
      })
      .addCase(chapterAction.loadChapterCompletion, (state, action) => {
        const { error, data } = action.payload;
        if (error) {
          return;
        }

        state.chapter[data.hash] = { ...state.chapter[data.hash], ...data };
      })
      .addCase(datasyncAction.clearCache, () => {
        return initialState.dict;
      });
  },
});

const appAction = appSlice.actions;
const datasyncAction = datasyncSlice.actions;
const releaseAction = releaseSlice.actions;
const settingAction = settingSlice.actions;
const pluginAction = pluginSlice.actions;
const batchAction = batchSlice.actions;
const searchAction = searchSlice.actions;
const discoveryAction = discoverySlice.actions;
const favoritesAction = favoritesSlice.actions;
const mangaAction = mangaSlice.actions;
const chapterAction = chapterSlice.actions;
const missionAction = missionSlice.actions;
const dictAction = dictSlice.actions;

const appReducer = appSlice.reducer;
const datasyncReducer = datasyncSlice.reducer;
const releaseReducer = releaseSlice.reducer;
const settingReducer = settingSlice.reducer;
const pluginReducer = pluginSlice.reducer;
const batchReducer = batchSlice.reducer;
const searchReducer = searchSlice.reducer;
const discoveryReducer = discoverySlice.reducer;
const favoritesReducer = favoritesSlice.reducer;
const mangaReducer = mangaSlice.reducer;
const chapterReducer = chapterSlice.reducer;
const missionReducer = missionSlice.reducer;
const dictReducer = dictSlice.reducer;

export const action = {
  ...appAction,
  ...datasyncAction,
  ...releaseAction,
  ...settingAction,
  ...pluginAction,
  ...batchAction,
  ...searchAction,
  ...discoveryAction,
  ...favoritesAction,
  ...mangaAction,
  ...chapterAction,
  ...missionAction,
  ...dictAction,
};
export const reducer = combineReducers<RootState>({
  app: appReducer,
  datasync: datasyncReducer,
  release: releaseReducer,
  setting: settingReducer,
  plugin: pluginReducer,
  batch: batchReducer,
  search: searchReducer,
  discovery: discoveryReducer,
  favorites: favoritesReducer,
  manga: mangaReducer,
  chapter: chapterReducer,
  task: missionReducer,
  dict: dictReducer,
});
