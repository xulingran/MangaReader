import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { InteractionManager } from 'react-native';
import { runSaga, stdChannel, type Saga } from 'redux-saga';
import { Plugin } from '~/plugins';
import { action } from '~/redux/slice';
import { catchErrorWorker, createSaveDataWorker, preloadChapter } from '~/redux/saga';
import { Storage } from '~/utils/storage';

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
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(((
      callback: () => void
    ) => {
      callback();
      return { cancel: jest.fn() };
    }) as unknown as typeof InteractionManager.runAfterInteractions);
    const multiSet = jest.spyOn(Storage, 'multiSet').mockResolvedValue(undefined);

    await runSaveWorker();

    expect(multiSet).toHaveBeenCalledTimes(1);
    const keys = multiSet.mock.calls[0][0].map(([key]) => key);
    expect(keys.filter((key) => key === mangaHash)).toHaveLength(1);
  });

  it('首次写入失败会保留 dirty 并自动重试，成功后不弹失败提示', async () => {
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(((
      callback: () => void
    ) => {
      callback();
      return { cancel: jest.fn() };
    }) as unknown as typeof InteractionManager.runAfterInteractions);
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
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(((
      callback: () => void
    ) => {
      callback();
      return { cancel: jest.fn() };
    }) as unknown as typeof InteractionManager.runAfterInteractions);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(Storage, 'multiSet').mockRejectedValue(new Error('disk full'));
    const dispatch = jest.fn();

    await runSaveWorker(dispatch);

    expect(dispatch).toHaveBeenCalledWith(
      action.toastMessage('本地数据保存失败，将在下次数据变更时重试')
    );
  });

  it('写盘期间到达的新 dirty action 会由同一 worker 持续排空', async () => {
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(((
      callback: () => void
    ) => {
      callback();
      return { cancel: jest.fn() };
    }) as unknown as typeof InteractionManager.runAfterInteractions);
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
      pendingWrites.shift()?.();
      await waitForCondition(() => multiSet.mock.calls.length === 2);

      await runSaga(options, worker, action.addFavorites({ mangaHash })).toPromise();
      pendingWrites.shift()?.();
      await waitForCondition(() => multiSet.mock.calls.length === 3);

      pendingWrites.shift()?.();
      await firstTask.toPromise();
      expect(multiSet).toHaveBeenCalledTimes(3);
    } finally {
      pendingWrites.splice(0).forEach((resolve) => resolve());
      if (firstTask.isRunning()) {
        firstTask.cancel();
        await firstTask.toPromise();
      }
    }
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

describe('catchErrorWorker', () => {
  it('无 payload/error 的高频 action 直接返回', async () => {
    const dispatch = jest.fn();

    await runSaga({ dispatch }, catchErrorWorker, { type: 'view/page' } as any).toPromise();

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('普通错误仍转为 toast action', async () => {
    const dispatch = jest.fn();
    const error = new Error('加载失败');

    await runSaga({ dispatch }, catchErrorWorker, {
      type: 'chapter/fail',
      payload: { error },
    } as any).toPromise();

    expect(dispatch).toHaveBeenCalledWith(action.toastMessage(error.message));
  });
});
