import { once } from "node:events";
import { IncomingMessage } from "node:http";
import { StreamBuffer } from "./stream_buffer.js";

export interface RequestBufferOptions {
  bufferSizeLimit?: number;
  req: IncomingMessage;
}

export class RequestBuffer {
  
  protected streamBuffer: StreamBuffer;
  protected req: IncomingMessage;

  constructor({ bufferSizeLimit, req }: RequestBufferOptions) {
    this.streamBuffer = new StreamBuffer({ bufferSizeLimit });
    this.req = req;
  }

  public body = async (): Promise<string> => {
    this.req.pipe(this.streamBuffer);
    await once(this.streamBuffer, "finish");
    return this.streamBuffer.buffer.toString("utf-8");
  };
}