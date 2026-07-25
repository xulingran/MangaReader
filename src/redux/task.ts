import { AsyncStatus } from '~/utils';

/** 由任务与队列项构造调度用的 Job（pushTask/retryTask/重启恢复共用）。 */
export const buildJob = (task: Task, item: Task['queue'][number]): Job => ({
  taskId: task.taskId,
  jobId: item.jobId,
  chapterHash: task.chapterHash,
  type: task.type,
  status: AsyncStatus.Default,
  source: item.source,
  index: item.index,
  headers: task.headers,
});

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
          .map((job) => buildJob(item, job))
      ),
    },
  };
};
