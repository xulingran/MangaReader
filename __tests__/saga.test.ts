import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { runSaga, stdChannel, type Saga } from 'redux-saga';
import { Plugin, PluginMap } from '~/plugins';
import Base from '~/plugins/base';
import { action } from '~/redux/slice';
import {
  catchErrorWorker,
  batchUpdateWorker,
  createSaveDataWorker,
  createSaveProgressWorker,
  loadChapterListWorker,
  loadMangaWorker,
  preloadChapter,
  saveFavoritesWorker,
} from '~/redux/saga';
import { Storage } from '~/utils/storage';
import { AsyncStatus } from '~/utils';

const mangaHash = `${Plugin.MBZ}&favorite`;
const chapterHash = `${mangaHash}&chapter-1`;

const state = {
  favorites: [{ mangaHash, isTrend: false, enableBatch: true }],
  dict: {
    manga: {
      [mangaHash]: {
        title: '收藏漫画',
        chapters: [{ hash: chapterHash }],
      },
    },
    chapter: {
      [chapterHash]: { hash: chapterHash, images: [{ uri: '1.jpg' }] },
    },
    record: {},
    lastWatch: {},
  },
  task: { list: [], job: { list: [] } },
} as unknown as RootState;

const runSaveWorker = (dispatch = jest.fn()) =>
  runSaga(
    { dispatch, getState: () => state },
    createSaveDataWorker(0) as unknown as Saga,
    action.addFavorites({ mangaHash })
  ).toPromise();

const flushTasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const waitForCondition = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (condition()) {
      return;
    }
    await flushTasks();
  }
  throw new Error('等待 saga 状态变化超时');
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('saveDataWorker', () => {
  it('收藏变更只 flush 一次，且不会在同批次重复写同一个 manga key', async () => {
    const multiSet = jest.spyOn(Storage, 'multiSet').mockResolvedValue(undefined);

    await runSaveWorker();

    expect(multiSet).toHaveBeenCalledTimes(1);
    const keys = multiSet.mock.calls.flatMap(([pairs]) => pairs.map(([key]) => key));
    expect(keys.filter((key) => key.endsWith(`:manga:${mangaHash}`))).toHaveLength(1);
  });

  it('首次写入失败会保留 dirty 并自动重试，成功后不弹失败提示', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const multiSet = jest
      .spyOn(Storage, 'multiSet')
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce(undefined);
    const dispatch = jest.fn();

    await runSaveWorker(dispatch);

    expect(multiSet).toHaveBeenCalledTimes(2);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('连续写入失败时给出准确的稍后重试提示', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(Storage, 'multiSet').mockRejectedValue(new Error('disk full'));
    const dispatch = jest.fn();

    await runSaveWorker(dispatch);

    expect(dispatch).toHaveBeenCalledWith(
      action.toastMessage('本地数据保存失败，将在下次数据变更时重试')
    );
  });

  it('写盘期间到达的新 dirty action 会由同一 worker 持续排空', async () => {
    const pendingWrites: Array<() => void> = [];
    const multiSet = jest.spyOn(Storage, 'multiSet').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          pendingWrites.push(resolve);
        })
    );
    const worker = createSaveDataWorker(0) as unknown as Saga;
    const options = { dispatch: jest.fn(), getState: () => state };

    const firstTask = runSaga(options, worker, action.addFavorites({ mangaHash }));
    try {
      await waitForCondition(() => multiSet.mock.calls.length === 1);

      await runSaga(options, worker, action.removeFavorites(mangaHash)).toPromise();
      for (let expected = 2; expected <= 2; expected++) {
        pendingWrites.shift()?.();
        await waitForCondition(() => multiSet.mock.calls.length === expected);
      }
      pendingWrites.shift()?.();
      await firstTask.toPromise();
      expect(multiSet).toHaveBeenCalledTimes(2);
    } finally {
      pendingWrites.splice(0).forEach((resolve) => resolve());
      if (firstTask.isRunning()) {
        firstTask.cancel();
        await firstTask.toPromise();
      }
    }
  });
});

describe('saveFavoritesWorker', () => {
  it('批量更新完成后把有更新标记写入快照 manifest', async () => {
    const trendState = {
      ...state,
      favorites: [{ mangaHash, isTrend: true, enableBatch: true }],
    } as RootState;
    jest.spyOn(Storage, 'getItem').mockResolvedValue(null);
    jest.spyOn(Storage, 'multiSet').mockResolvedValue(undefined);
    const setItem = jest.spyOn(Storage, 'setItem').mockResolvedValue(undefined);

    await runSaga(
      { dispatch: jest.fn(), getState: () => trendState },
      saveFavoritesWorker as unknown as Saga
    ).toPromise();

    const manifestCall = setItem.mock.calls.find(([key]) => key === '@snapshotManifest');
    expect(manifestCall).toBeDefined();
    expect(JSON.parse(manifestCall![1]).favorites).toEqual(trendState.favorites);
  });
});

describe('saveProgressWorker', () => {
  it('进度写入失败会恢复 dirty 快照并重试', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const multiSet = jest
      .spyOn(Storage, 'multiSet')
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce(undefined);

    await runSaga(
      { dispatch: jest.fn(), getState: () => state },
      createSaveProgressWorker(0) as unknown as Saga,
      action.viewPage({ mangaHash, page: 1 })
    ).toPromise();

    expect(multiSet).toHaveBeenCalledTimes(2);
    expect(multiSet.mock.calls[1][0][0][0]).toMatch(new RegExp(`:manga:${mangaHash}$`));
  });

  it('单个 job 完成后立即把成功断点纳入节流快照', async () => {
    const taskState = {
      ...state,
      task: {
        list: [
          {
            taskId: 'task-1',
            chapterHash,
            title: '第一话',
            type: 'download',
            status: 'pending',
            downloadPath: '/tmp',
            queue: [
              { index: 0, jobId: 'done', source: 'https://example.test/1.jpg' },
              { index: 1, jobId: 'todo', source: 'https://example.test/2.jpg' },
            ],
            pending: [],
            success: ['done'],
            fail: [],
          },
        ],
        job: {
          max: 1,
          thread: [],
          list: [
            {
              taskId: 'task-1',
              jobId: 'todo',
              chapterHash,
              type: 'download',
              status: 'default',
              source: 'https://example.test/2.jpg',
              index: 1,
            },
          ],
        },
      },
    } as unknown as RootState;
    const multiSet = jest.spyOn(Storage, 'multiSet').mockResolvedValue(undefined);

    await runSaga(
      { dispatch: jest.fn(), getState: () => taskState },
      createSaveDataWorker(0) as unknown as Saga,
      action.endJob({ taskId: 'task-1', jobId: 'done', status: AsyncStatus.Fulfilled })
    ).toPromise();

    const pairs = multiSet.mock.calls.flatMap(([items]) => items);
    const persistedTask = pairs.find(([key]) => key.includes(':task:task-1'));
    expect(persistedTask).toBeDefined();
    expect(JSON.parse(persistedTask![1]).success).toEqual(['done']);
  });

  it('章节刷新失败不会把旧离线章节标记为待删除快照', async () => {
    const multiSet = jest.spyOn(Storage, 'multiSet').mockResolvedValue(undefined);

    await runSaga(
      { dispatch: jest.fn(), getState: () => state },
      createSaveProgressWorker(0) as unknown as Saga,
      action.loadChapterCompletion({ error: new Error('offline'), actionId: chapterHash })
    ).toPromise();

    expect(multiSet).not.toHaveBeenCalled();
  });
});

describe('preloadChapter', () => {
  it('忽略其他章节的 completion，只等待目标 actionId', async () => {
    const channel = stdChannel();
    const dispatch = jest.fn();
    let chapters: RootState['dict']['chapter'] = {};
    const task = runSaga(
      {
        channel,
        dispatch,
        getState: () => ({ dict: { chapter: chapters } } as RootState),
      },
      preloadChapter as unknown as Saga,
      chapterHash
    );

    expect(dispatch).toHaveBeenCalledWith(action.loadChapter({ chapterHash }));
    channel.put(
      action.loadChapterCompletion({ error: new Error('other'), actionId: 'other-chapter' })
    );
    expect(task.isRunning()).toBe(true);

    const chapter: Chapter = {
      hash: chapterHash,
      mangaId: 'favorite',
      chapterId: 'chapter-1',
      title: '第一话',
      images: [],
    };
    chapters = { [chapterHash]: chapter };
    channel.put(action.loadChapterCompletion({ error: new Error('done'), actionId: chapterHash }));

    await expect(task.toPromise()).resolves.toBe(chapter);
  });
});

describe('loadMangaWorker', () => {
  it('同一漫画的过期成功响应不会派发 saveManga', async () => {
    const channel = stdChannel();
    const dispatch = jest.fn();
    const staleAction = action.loadManga({ mangaHash, actionId: 'stale' });
    const requestState = {
      manga: {
        loadByHash: {
          [mangaHash]: { status: 'pending', actionId: 'current' },
        },
      },
    } as unknown as RootState;
    const task = runSaga(
      { channel, dispatch, getState: () => requestState },
      loadMangaWorker as unknown as Saga,
      staleAction
    );
    const manga = {
      hash: mangaHash,
      mangaId: 'favorite',
      title: '过期详情',
      chapters: [],
    } as unknown as IncreaseManga;

    channel.put(
      action.loadMangaInfoCompletion({ data: manga, actionId: staleAction.payload.actionId })
    );
    await waitForCondition(() =>
      dispatch.mock.calls.some(
        ([item]) => (item as { type: string }).type === action.loadChapterList.type
      )
    );
    channel.put(
      action.loadChapterListCompletion({
        data: { mangaHash, page: 1, list: [] },
        actionId: staleAction.payload.actionId,
      })
    );
    await task.toPromise();

    expect(
      dispatch.mock.calls.some(
        ([item]) => (item as { type: string }).type === action.saveManga.type
      )
    ).toBe(false);
    expect(dispatch).toHaveBeenCalledWith(
      action.loadMangaCompletion({
        data: manga,
        actionId: staleAction.payload.actionId,
        mangaHash,
      })
    );
  });

  it('章节列表失败时拒绝详情且不派发 saveManga', async () => {
    const channel = stdChannel();
    const dispatch = jest.fn();
    const request = action.loadManga({ mangaHash, actionId: 'request' });
    const task = runSaga(
      {
        channel,
        dispatch,
        getState: () =>
          ({
            manga: { loadByHash: { [mangaHash]: { actionId: 'request' } } },
          } as unknown as RootState),
      },
      loadMangaWorker as unknown as Saga,
      request
    );
    const manga = {
      hash: mangaHash,
      mangaId: 'favorite',
      title: '详情',
      chapters: [],
    } as unknown as IncreaseManga;
    channel.put(action.loadMangaInfoCompletion({ data: manga, actionId: 'request' }));
    await waitForCondition(() =>
      dispatch.mock.calls.some(
        ([item]) => (item as { type: string }).type === action.loadChapterList.type
      )
    );
    const pageError = new Error('第二页失败');
    channel.put(
      action.loadChapterListCompletion({
        error: pageError,
        data: { mangaHash, page: 1, list: [] },
        actionId: 'request',
      })
    );
    await task.toPromise();

    expect(
      dispatch.mock.calls.some(
        ([item]) => (item as { type: string }).type === action.saveManga.type
      )
    ).toBe(false);
    expect(dispatch).toHaveBeenCalledWith(
      action.loadMangaCompletion({ error: pageError, actionId: 'request', mangaHash })
    );
  });
});

describe('loadChapterListWorker', () => {
  it('后续分页失败时向第一页调用方传播错误，不返回截断成功列表', async () => {
    const original = PluginMap.get(Plugin.MBZ);
    const plugin = {
      prepareChapterListFetch: () => ({ url: 'https://example.test/chapters' }),
      handleChapterList: () => ({ chapterList: [], canLoadMore: true }),
    } as unknown as Base;
    PluginMap.set(Plugin.MBZ, plugin);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({}),
    } as unknown as Response);
    const channel = stdChannel();
    const dispatch = jest.fn();
    const request = action.loadChapterList({ mangaHash, page: 1, actionId: 'request' });
    const task = runSaga({ channel, dispatch }, loadChapterListWorker as unknown as Saga, request);

    try {
      await waitForCondition(() =>
        dispatch.mock.calls.some(
          ([item]) =>
            (item as ReturnType<typeof action.loadChapterList>).type ===
              action.loadChapterList.type &&
            (item as ReturnType<typeof action.loadChapterList>).payload.page === 2
        )
      );
      const pageError = new Error('第二页失败');
      channel.put(
        action.loadChapterListCompletion({
          error: pageError,
          data: { mangaHash, page: 2, list: [] },
          actionId: 'request',
        })
      );
      await task.toPromise();

      const completion = dispatch.mock.calls
        .map(([item]) => item as ReturnType<typeof action.loadChapterListCompletion>)
        .filter(({ type }) => type === action.loadChapterListCompletion.type)
        .at(-1);
      expect(completion?.payload.error).toBe(pageError);
      expect(completion?.payload.data?.list).toEqual([]);
    } finally {
      if (original) {
        PluginMap.set(Plugin.MBZ, original);
      }
    }
  });
});

describe('batchUpdateWorker', () => {
  it('来源已移除时仍把条目从批量栈移出并记录失败', async () => {
    const dispatch = jest.fn();
    await runSaga(
      {
        dispatch,
        getState: () => ({ favorites: [], batch: { fail: [] } } as unknown as RootState),
      },
      batchUpdateWorker as unknown as Saga,
      action.batchUpdate(['REMOVED&manga'])
    ).toPromise();

    expect(dispatch).toHaveBeenCalledWith(
      action.outStack({
        isSuccess: false,
        isTrend: false,
        hash: 'REMOVED&manga',
        isRetry: false,
      })
    );
  });
});

describe('catchErrorWorker', () => {
  it('无 payload/error 的高频 action 直接返回', async () => {
    const dispatch = jest.fn();

    await runSaga(
      { dispatch },
      catchErrorWorker as unknown as Saga,
      { type: 'view/page' } as any
    ).toPromise();

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('普通错误仍转为 toast action', async () => {
    const dispatch = jest.fn();
    const error = new Error('加载失败');

    await runSaga(
      { dispatch },
      catchErrorWorker as unknown as Saga,
      {
        type: 'chapter/fail',
        payload: { error },
      } as any
    ).toPromise();

    expect(dispatch).toHaveBeenCalledWith(action.toastMessage(error.message));
  });

  it('同一漫画的过期请求错误不会弹出误导提示', async () => {
    const dispatch = jest.fn();
    const currentActionId = 'current';
    const requestState = {
      manga: {
        loadByHash: {
          [mangaHash]: { status: 'pending', actionId: currentActionId },
        },
      },
    } as unknown as RootState;

    await runSaga(
      { dispatch, getState: () => requestState },
      catchErrorWorker as unknown as Saga,
      {
        type: action.loadMangaCompletion.type,
        payload: {
          error: new Error('旧请求失败'),
          mangaHash,
          actionId: 'stale',
        },
      } as any
    ).toPromise();

    expect(dispatch).not.toHaveBeenCalled();
  });
});
