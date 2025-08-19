export class Queue<T> {

  private queue: T[];
  public sentry: boolean;
  
  constructor() {
    this.queue = [];
    this.sentry = false;
  }

  public enqueue(item: T) {
    this.queue.push(item);
  }

  public dequeue(): T {
    const item = this.queue.shift();
    if (item == undefined) {
      throw new Error("Enpty Queue.");
    }
    return item;
  }

  public size(): number {
    return this.queue.length;
  }
}