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

/** 将中断的持久化任务恢复成可重新调度的确定状态。已是重启态时原样返回传入引用。 */
export const normalizeTaskForRestart = (task: RootState['task']): RootState['task'] => {
  if (task.list.length === 0 && task.job.list.length === 0) {
    return task;
  }
  const list = task.list.map((item) => ({
    ...item,
    status: item.success.length >= item.queue.length ? AsyncStatus.Fulfilled : AsyncStatus.Default,
    pending: [],
    fail: [],
  }));
  const jobList = list.flatMap((item) =>
    item.queue
      .filter((job) => !item.success.includes(job.jobId))
      .map((job) => buildJob(item, job))
  );

  // 上次启动 normalize 并回写后，本次输入已是重启态：返回原引用，
  // 避免启动路径每次都判脏触发全量快照回写
  const isAlreadyNormalized =
    task.job.thread.length === 0 &&
    task.list.every(
      (item, index) =>
        item.status === list[index].status && item.pending.length === 0 && item.fail.length === 0
    ) &&
    task.job.list.length === jobList.length &&
    task.job.list.every(
      (job, index) =>
        job.jobId === jobList[index].jobId &&
        job.taskId === jobList[index].taskId &&
        job.status === jobList[index].status
    );
  if (isAlreadyNormalized) {
    return task;
  }

  return {
    list,
    job: {
      max: task.job.max,
      thread: [],
      list: jobList,
    },
  };
};
