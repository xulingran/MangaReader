import { afterEach, describe, it, jest } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';
import { runSaga, stdChannel, type Saga } from 'redux-saga';
import { SAGA_ACTION } from '@redux-saga/symbols';
import { action, reducer } from '~/redux/slice';
import { taskManagerSaga } from '~/redux/saga';
import { AsyncStatus, TaskType } from '~/utils';

const chapterHash = 'MBZ&favorite&chapter-1';

const buildTask = (taskId: string, jobId: string) =>
  action.pushTask({
    actionId: `action-${taskId}`,
    data: {
      taskId,
      chapterHash,
      title: '第一话',
      type: TaskType.Download,
      status: AsyncStatus.Default,
      downloadPath: '/tmp',
      headers: {},
      queue: [{ index: 0, jobId, source: 'https://example.test/1.jpg' }],
      pending: [],
      success: [],
      fail: [],
    },
  } as any);

// thread 正常退出前有 delay(100)，轮询间隔不能太短
const waitForCondition = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (condition()) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('等待 saga 状态变化超时');
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('taskManagerSaga', () => {
  it('判空到 flush 之间入队的任务不会被闲置，管理器随后仍能响应新触发', async () => {
    const store = configureStore({ reducer });
    const channel = stdChannel();
    // finishTask 意味着管理器已完成「判空 break」、下一个 effect 就是 flush。
    // 此刻同步入队 task-2：reducer 已接收 job，但触发动作必然被 flush 丢弃，
    // 精确复现丢失唤醒窗口。管理器必须靠 flush 后的复查直接续跑 task-2。
    let injected = false;
    const dispatch = ((dispatched: { type: string }) => {
      const result = store.dispatch(dispatched as any);
      // stdChannel.put 对未标记 SAGA_ACTION 的输入会经 asap 延迟转发，
      // 那样触发动作会错过 flush、无法复现窗口；生产环境 sagaMiddleware 的
      // dispatch 会标记 SAGA_ACTION 同步转发，这里对齐该行为。
      channel.put({ ...(dispatched as object), [SAGA_ACTION]: true } as any);
      if (dispatched.type === action.finishTask.type && !injected) {
        injected = true;
        dispatch(buildTask('task-2', 'job-2'));
      }
      return result;
    }) as typeof store.dispatch;

    const manager = runSaga(
      { channel, dispatch, getState: store.getState },
      taskManagerSaga as unknown as Saga
    );

    try {
      dispatch(buildTask('task-1', 'job-1'));

      // task-2 的触发动作已被 flush 丢弃，若管理器没有 flush 后的队列复查，
      // job-2 会一直留在队列里，这里必然等到超时。
      await waitForCondition(
        () =>
          injected &&
          store.getState().task.job.list.length === 0 &&
          store.getState().task.list.length === 0
      );

      // 管理器应回到监听状态：新触发仍能正常调度，不会被卡死或空转。
      dispatch(buildTask('task-3', 'job-3'));
      await waitForCondition(
        () =>
          store.getState().task.job.list.length === 0 &&
          store.getState().task.list.length === 0
      );
    } finally {
      if (manager.isRunning()) {
        manager.cancel();
        await manager.toPromise();
      }
    }
  });
});
