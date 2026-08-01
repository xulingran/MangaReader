import { describe, expect, it } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';
import { action, initialState, reducer } from '~/redux/slice';
import { AsyncStatus, TaskType } from '~/utils';
import { Plugin } from '~/plugins';

// 整树用 initialState 深拷贝作底，再覆盖单个 slice 的局部字段，
// 这样 reducer 仍是真实装配，且类型上仍是完整的 RootState。
const cloneInitialState = (): RootState => JSON.parse(JSON.stringify(initialState));

const createStore = (overrides: Partial<RootState> = {}) => {
  const state = cloneInitialState();
  Object.assign(state, overrides);
  // configureStore 的 preloadedState 接受完整的 RootState；reducer 是已 combineReducers 的根
  return configureStore({ reducer, preloadedState: state });
};

// ---- batch.outStack：栈内任务结算的三分支状态机 ----
describe('batch.outStack', () => {
  it('成功时从 stack 移除并并入 success', () => {
    const store = createStore({
      batch: { loadStatus: AsyncStatus.Pending, stack: ['h1'], queue: [], success: [], fail: [] },
    });
    store.dispatch(
      action.outStack({ isSuccess: true, isTrend: false, hash: 'h1', isRetry: false })
    );
    const batch = store.getState().batch;
    expect(batch.stack).toEqual([]);
    expect(batch.success).toEqual(['h1']);
    expect(batch.fail).toEqual([]);
    expect(batch.queue).toEqual([]);
  });

  it('失败且可重试：并入 queue 等待重试，不进 fail', () => {
    const store = createStore({
      batch: { loadStatus: AsyncStatus.Pending, stack: ['h1'], queue: [], success: [], fail: [] },
    });
    store.dispatch(
      action.outStack({ isSuccess: false, isTrend: false, hash: 'h1', isRetry: true })
    );
    const batch = store.getState().batch;
    expect(batch.queue).toEqual(['h1']);
    expect(batch.fail).toEqual([]);
    expect(batch.stack).toEqual([]);
  });

  it('失败且不可重试：进 fail', () => {
    const store = createStore({
      batch: { loadStatus: AsyncStatus.Pending, stack: ['h1'], queue: [], success: [], fail: [] },
    });
    store.dispatch(
      action.outStack({ isSuccess: false, isTrend: false, hash: 'h1', isRetry: false })
    );
    const batch = store.getState().batch;
    expect(batch.fail).toEqual(['h1']);
    expect(batch.queue).toEqual([]);
  });
});

// ---- 分页 completion 通用模式：去重、page+1、isEnd 判定（以 search 为代表）----
describe('search.loadSearchCompletion', () => {
  const buildManga = (hash: string) => ({
    hash,
    href: '',
    source: Plugin.MBZ,
    sourceName: 'MBZ',
    mangaId: hash,
    title: hash,
  });

  it('error 时只置 Rejected，不动 list/page', () => {
    const store = createStore({
      search: {
        filter: {},
        keyword: 'x',
        page: 1,
        isEnd: false,
        loadStatus: AsyncStatus.Pending,
        list: ['a'],
      },
    });
    store.dispatch(
      action.loadSearchCompletion({ error: new Error('网络错误'), data: undefined as any })
    );
    const search = store.getState().search;
    expect(search.loadStatus).toBe(AsyncStatus.Rejected);
    expect(search.list).toEqual(['a']);
    expect(search.page).toBe(1);
    expect(search.isEnd).toBe(false);
  });

  it('新数据追加并去重，page 自增', () => {
    const store = createStore({
      search: {
        filter: {},
        keyword: 'x',
        page: 1,
        isEnd: false,
        loadStatus: AsyncStatus.Pending,
        list: ['a', 'b'],
      },
    });
    store.dispatch(
      action.loadSearchCompletion({ data: [buildManga('b'), buildManga('c')] })
    );
    const search = store.getState().search;
    expect(search.list).toEqual(['a', 'b', 'c']); // 'b' 去重
    expect(search.page).toBe(2);
    expect(search.loadStatus).toBe(AsyncStatus.Fulfilled);
    expect(search.isEnd).toBe(false);
  });

  it('返回数据与现有完全重复时判定 isEnd', () => {
    const store = createStore({
      search: {
        filter: {},
        keyword: 'x',
        page: 2,
        isEnd: false,
        loadStatus: AsyncStatus.Pending,
        list: ['a', 'b'],
      },
    });
    // 全部重复 → 去重后 list 长度不变 → 触发 isEnd
    store.dispatch(action.loadSearchCompletion({ data: [buildManga('a'), buildManga('b')] }));
    const search = store.getState().search;
    expect(search.list).toEqual(['a', 'b']);
    expect(search.isEnd).toBe(true);
  });
});

// ---- onlineFavorites 切源重置：避免串源 ----
describe('onlineFavorites.loadOnlineFavorites', () => {
  it('切换来源（source 不等）时重置列表并记录新 source', () => {
    const store = createStore({
      onlineFavorites: {
        source: Plugin.MBZ,
        page: 3,
        isEnd: true,
        loadStatus: AsyncStatus.Fulfilled,
        list: ['old1', 'old2'],
      },
    });
    store.dispatch(action.loadOnlineFavorites({ source: Plugin.BIKA }));
    const fav = store.getState().onlineFavorites;
    expect(fav.source).toBe(Plugin.BIKA);
    expect(fav.list).toEqual([]);
    expect(fav.page).toBe(1);
    expect(fav.isEnd).toBe(false);
    expect(fav.loadStatus).toBe(AsyncStatus.Pending);
  });

  it('同源加载不重置列表（保留分页）', () => {
    const store = createStore({
      onlineFavorites: {
        source: Plugin.MBZ,
        page: 2,
        isEnd: false,
        loadStatus: AsyncStatus.Fulfilled,
        list: ['h1'],
      },
    });
    store.dispatch(action.loadOnlineFavorites({ source: Plugin.MBZ }));
    const fav = store.getState().onlineFavorites;
    expect(fav.list).toEqual(['h1']);
    expect(fav.page).toBe(2);
    expect(fav.isEnd).toBe(false);
    expect(fav.loadStatus).toBe(AsyncStatus.Pending);
  });

  it('isReset 即使同源也强制重置', () => {
    const store = createStore({
      onlineFavorites: {
        source: Plugin.MBZ,
        page: 5,
        isEnd: true,
        loadStatus: AsyncStatus.Fulfilled,
        list: ['h1', 'h2'],
      },
    });
    store.dispatch(action.loadOnlineFavorites({ source: Plugin.MBZ, isReset: true }));
    const fav = store.getState().onlineFavorites;
    expect(fav.list).toEqual([]);
    expect(fav.page).toBe(1);
    expect(fav.isEnd).toBe(false);
  });
});

// ---- task.endJob：job 调度状态机 ----
const buildTask = (taskId: string, jobIds: string[]): RootState['task']['list'][number] => ({
  taskId,
  chapterHash: `${taskId}&chapter`,
  title: taskId,
  type: TaskType.Download,
  status: AsyncStatus.Default,
  downloadPath: '/tmp',
  queue: jobIds.map((jobId, index) => ({ index, source: `https://x/${jobId}.jpg`, jobId })),
  pending: [],
  success: [],
  fail: [],
});

describe('task.endJob', () => {
  it('单个 job 成功：从 pending 移到 success，task 仍 Pending（未全部完成）', () => {
    const task = buildTask('t1', ['j1', 'j2']);
    task.pending = ['j1'];
    const store = createStore({
      task: {
        list: [task],
        job: {
          max: 2,
          list: [],
          thread: [{ taskId: 't1', jobId: 'j1' }],
        },
      },
    });
    store.dispatch(action.endJob({ taskId: 't1', jobId: 'j1', status: AsyncStatus.Fulfilled }));
    const t = store.getState().task.list[0];
    expect(t.pending).toEqual([]);
    expect(t.success).toEqual(['j1']);
    expect(t.status).toBe(AsyncStatus.Pending);
    expect(store.getState().task.job.thread).toEqual([]);
  });

  it('全部 job 成功（无 fail）：task 置 Fulfilled 并从 list 移除', () => {
    const task = buildTask('t1', ['j1', 'j2']);
    task.success = ['j1'];
    task.pending = ['j2'];
    const store = createStore({
      task: {
        list: [task],
        job: { max: 2, list: [], thread: [{ taskId: 't1', jobId: 'j2' }] },
      },
    });
    store.dispatch(action.endJob({ taskId: 't1', jobId: 'j2', status: AsyncStatus.Fulfilled }));
    expect(store.getState().task.list).toEqual([]); // 已移除
  });

  it('有 fail 的任务全部结算后置 Rejected，不移除（便于重试）', () => {
    const task = buildTask('t1', ['j1', 'j2']);
    task.success = ['j1'];
    task.fail = ['j2'];
    // j2 已失败、再结算一个失败 job 使 success+fail 达到 queue 长度
    const store = createStore({
      task: {
        list: [task],
        job: { max: 2, list: [], thread: [] },
      },
    });
    // 当前 success+fail=2 已 >= queue.length(2)，再 endJob 一个已计入的 fail 触发终态判定
    store.dispatch(action.endJob({ taskId: 't1', jobId: 'j2', status: AsyncStatus.Rejected }));
    const t = store.getState().task.list[0];
    expect(t.status).toBe(AsyncStatus.Rejected);
    expect(store.getState().task.list).toHaveLength(1); // 仍在列表
  });

  it('success/fail 去重：重复结算同一 job 不重复 push', () => {
    const task = buildTask('t1', ['j1', 'j2']);
    task.success = ['j1'];
    const store = createStore({
      task: { list: [task], job: { max: 2, list: [], thread: [] } },
    });
    store.dispatch(action.endJob({ taskId: 't1', jobId: 'j1', status: AsyncStatus.Fulfilled }));
    expect(store.getState().task.list[0].success).toEqual(['j1']); // 没有变成 ['j1','j1']
  });
});

// ---- task.retryTask：从 fail 重建 job ----
describe('task.retryTask', () => {
  it('仅重建 fail 的 job，清空 thread/list 中该 task 的旧 job，重置 fail 与 status', () => {
    const task = buildTask('t1', ['j1', 'j2', 'j3']);
    task.success = ['j1'];
    task.fail = ['j2', 'j3'];
    task.status = AsyncStatus.Rejected;
    const store = createStore({
      task: {
        list: [task],
        job: {
          max: 2,
          list: [{ taskId: 't1', jobId: 'j2', chapterHash: 'c', type: TaskType.Download, status: AsyncStatus.Default, source: 's', index: 1 }],
          thread: [{ taskId: 't1', jobId: 'j2' }],
        },
      },
    });
    store.dispatch(action.retryTask(['t1']));
    const state = store.getState().task;
    const t = state.list[0];
    expect(t.fail).toEqual([]);
    expect(t.status).toBe(AsyncStatus.Default);
    // 重建的 job 只对应 fail 的 j2、j3
    expect(state.job.list.map((j) => j.jobId).sort()).toEqual(['j2', 'j3']);
    expect(state.job.thread).toEqual([]);
  });

  it('无 fail 的 task 不受影响', () => {
    const task = buildTask('t1', ['j1']);
    task.success = ['j1'];
    const store = createStore({
      task: { list: [task], job: { max: 2, list: [], thread: [] } },
    });
    store.dispatch(action.retryTask(['t1']));
    const t = store.getState().task.list[0];
    expect(t.fail).toEqual([]);
    expect(t.success).toEqual(['j1']);
  });
});

// ---- dict.viewImage：阅读进度统计 ----
describe('dict.viewImage', () => {
  const setupChapter = (chapterHash: string, imageCount: number): RootState => {
    const state = cloneInitialState();
    state.dict.chapter[chapterHash] = {
      hash: chapterHash,
      mangaId: 'm1',
      chapterId: chapterHash,
      title: 'c1',
      images: Array.from({ length: imageCount }, (_, i) => ({ uri: `https://x/${i}.jpg` })),
    };
    return state;
  };

  it('首次访问惰性创建 record 并计入单张进度', () => {
    const store = configureStore({ reducer, preloadedState: setupChapter('c1', 4) });
    store.dispatch(action.viewImage({ chapterHash: 'c1', index: 0 }));
    const record = store.getState().dict.record.c1;
    expect(record).toBeDefined();
    expect(record.imagesLoaded).toEqual([0]);
    expect(record.total).toBe(4);
    expect(record.progress).toBe(25); // floor(1*100/4)
    expect(record.isVisited).toBe(true);
  });

  it('imagesLoaded 去重：重复上报同一 index 不重复计入', () => {
    const store = configureStore({ reducer, preloadedState: setupChapter('c1', 4) });
    store.dispatch(action.viewImage({ chapterHash: 'c1', index: 1 }));
    store.dispatch(action.viewImage({ chapterHash: 'c1', index: 1 })); // 重复
    const record = store.getState().dict.record.c1;
    expect(record.imagesLoaded).toEqual([1]); // 仍只有一张
    expect(record.progress).toBe(25);
  });

  it('progress 只增不减：再加载更多图不回退已有进度', () => {
    const store = configureStore({ reducer, preloadedState: setupChapter('c1', 4) });
    // 先加载 3 张 → 75%
    store.dispatch(action.viewImage({ chapterHash: 'c1', index: 0 }));
    store.dispatch(action.viewImage({ chapterHash: 'c1', index: 1 }));
    store.dispatch(action.viewImage({ chapterHash: 'c1', index: 2 }));
    expect(store.getState().dict.record.c1.progress).toBe(75);
    // 再补一张（已加载过）不应让进度变小
    store.dispatch(action.viewImage({ chapterHash: 'c1', index: 0 }));
    expect(store.getState().dict.record.c1.progress).toBe(75);
  });

  it('isVisited 置位后不因后续 isVisited=false 回退', () => {
    const store = configureStore({ reducer, preloadedState: setupChapter('c1', 2) });
    store.dispatch(action.viewImage({ chapterHash: 'c1', index: 0, isVisited: true }));
    expect(store.getState().dict.record.c1.isVisited).toBe(true);
    store.dispatch(action.viewImage({ chapterHash: 'c1', index: 1, isVisited: false }));
    expect(store.getState().dict.record.c1.isVisited).toBe(true); // 保持已访问
  });

  it('未加载过的章节直接 viewImage 不创建空 record（避免脏数据）', () => {
    const store = createStore();
    store.dispatch(action.viewImage({ chapterHash: 'nope', index: 0 }));
    expect(store.getState().dict.record.nope).toBeUndefined();
  });
});
