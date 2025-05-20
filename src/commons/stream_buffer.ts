import { log } from "./logger.js";
import { Writable, WritableOptions } from "node:stream";

export interface StreamBufferOptions {
  bufferSizeLimit?: number;
}

export class StreamBuffer extends Writable {

  public buffer: Buffer = Buffer.allocUnsafe(0);
  protected bufferSizeLimit: number;

  constructor({ bufferSizeLimit = 1e6 }: StreamBufferOptions = {}, writableOptions?: WritableOptions) {
    super(writableOptions);
    this.bufferSizeLimit = bufferSizeLimit;
  }

  public _write(chunk: string | Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    try {
      if (typeof chunk == "string") {
        chunk = Buffer.from(chunk, "utf8");
      }
      this.buffer = Buffer.concat([this.buffer, chunk]);
      if (this.buffer.length > this.bufferSizeLimit) {
        callback(new Error("Buffer size limit exceeded."));
        return;
      }
      callback();
    }
    catch (err) {
      log.error(err);
    }
  }
}