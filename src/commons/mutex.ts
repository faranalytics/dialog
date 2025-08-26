type Resolve = ((value: void | PromiseLike<void>) => void);

export class Mutex {
  private queues: Map<string, Resolve[]>;
  constructor() {
    this.queues = new Map();
  }

  public call = async<T>(mark: string, fn: () => Promise<T>): Promise<T> => {
    await this.acquire(mark);
    try {
      return await fn();
    }
    finally {
      this.release(mark);
    }
  };

  public acquire = async (mark: string): Promise<void> => {
    const queue = this.queues.get(mark);
    if (!queue) {
      this.queues.set(mark, []);
      return;
    }

    return new Promise<void>((r) => {
      queue.push(r);
    });
  };

  public release = (mark: string): void => {
    const queue = this.queues.get(mark);
    if (!queue) {
      throw new Error(`Release for ${mark} attempted prior to acquire.`);
    }
    const r = queue.shift();
    if (r) {
      r();
    }
    if (queue.length == 0) {
      this.queues.delete(mark);
    }
  };
}