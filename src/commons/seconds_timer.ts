export class SecondsTimer {
  public on: boolean;
  public timestamp?: number;
  constructor() {
    this.on = false;
  }
  start(): void {
    this.timestamp = Date.now();
    this.on = true;
  }
  stop(): string {
    if (!this.timestamp) {
      throw new Error("Timestamp is not set.");
    }
    this.on = false;
    return `${((Date.now() - this.timestamp) / 1e3).toString()}s`;
  }
  check(): string {
    if (!this.timestamp) {
      throw new Error("Timestamp is not set.");
    }
    return `${((Date.now() - this.timestamp) / 1e3).toString()}s`;
  }
}