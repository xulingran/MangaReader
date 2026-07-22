import { AsyncStatus } from '~/utils';

/** 将中断的持久化任务恢复成可重新调度的确定状态。 */
export const normalizeTaskForRestart = (task: RootState['task']): RootState['task'] => {
  const list = task.list.map((item) => ({
    ...item,
    status: item.success.length >= item.queue.length ? AsyncStatus.Fulfilled : AsyncStatus.Default,
    pending: [],
    fail: [],
  }));

  return {
    list,
    job: {
      max: task.job.max,
      thread: [],
      list: list.flatMap((item) =>
        item.queue
          .filter((job) => !item.success.includes(job.jobId))
          .map((job) => ({
            taskId: item.taskId,
            jobId: job.jobId,
            chapterHash: item.chapterHash,
            type: item.type,
            status: AsyncStatus.Default,
            source: job.source,
            index: job.index,
            headers: item.headers,
          }))
      ),
    },
  };
};
