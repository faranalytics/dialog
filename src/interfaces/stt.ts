import { EventEmitter } from "node:events";
import { Message } from "./message.js";

export interface STTEvents {
  "message": [Message];
  "vad": [];
  "error": [unknown];
}

export interface STT<T extends Record<keyof T, unknown[]> = STTEvents> extends EventEmitter<T & STTEvents> {
  post: (media: Message) => void;
  dispose: () => void;
}