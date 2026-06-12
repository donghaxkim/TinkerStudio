export type JobQueueOptions = {
  maxPendingJobs: number;
  runJob: (id: string) => Promise<void>;
};

export function createJobQueue(options: JobQueueOptions) {
  const pending: string[] = [];
  let running = false;

  async function drain() {
    if (running) return;

    const nextId = pending.shift();
    if (nextId === undefined) return;

    running = true;
    try {
      await options.runJob(nextId);
    } finally {
      running = false;
      queueMicrotask(() => void drain());
    }
  }

  return {
    enqueue(id: string) {
      if (pending.length >= options.maxPendingJobs) {
        return false;
      }

      pending.push(id);
      void drain();
      return true;
    },

    pendingCount() {
      return pending.length;
    },

    hasCapacity() {
      return pending.length < options.maxPendingJobs;
    },

    isRunning() {
      return running;
    },
  };
}
