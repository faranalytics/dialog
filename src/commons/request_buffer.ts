import { EventEmitter, once } from "node:events";
import { IncomingMessage } from "node:http";
import { StreamBuffer } from "./stream_buffer.js";

export interface RequestBufferOptions {
  bufferSizeLimit?: number;
  req: IncomingMessage;
}

export class RequestBuffer extends EventEmitter {
  protected streamBuffer: StreamBuffer;
  protected req: IncomingMessage;
  constructor({ bufferSizeLimit, req }: RequestBufferOptions) {
    super();
    this.streamBuffer = new StreamBuffer({ bufferSizeLimit });
    this.req = req;
  }

  public body = async(): Promise<string> => {
    this.req.pipe(this.streamBuffer);
    await once(this.req, "end");
    return this.streamBuffer.buffer.toString("utf-8");
  };
}