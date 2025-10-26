type Resolve = (value?: void | PromiseLike<void>) => void;

export interface MutexOptions {
  queueSizeLimit?: number;
}

export class Mutex {
  protected queues: Map<string, Resolve[]>;
  protected queueSizeLimit?: number;

  constructor({ queueSizeLimit }: MutexOptions = {}) {
    this.queues = new Map();
    this.queueSizeLimit = queueSizeLimit;
  }

  public call = async <Args extends unknown[], Result>(
    mark: string,
    fn: (...args: Args) => Promise<Result>,
    ...args: Args
  ): Promise<Result> => {
    await this.acquire(mark);
    try {
      return await fn(...args);
    } finally {
      this.release(mark);
    }
  };

  public acquire = async (mark: string): Promise<void> => {
    const queue = this.queues.get(mark);
    if (!queue) {
      this.queues.set(mark, []);
      return;
    }
    return new Promise<void>((r, e) => {
      if (this.queueSizeLimit && queue.length >= this.queueSizeLimit) {
        e(new Error(`Queue size limit exceeded for ${mark}`));
        return;
      }
      queue.push(r);
    });
  };

  public release = (mark: string): void => {
    const queue = this.queues.get(mark);
    if (!queue) {
      throw new Error(`Release for ${mark} attempted prior to acquire`);
    }
    const r = queue.shift();
    if (r) {
      r();
      return;
    }
    this.queues.delete(mark);
  };
}
