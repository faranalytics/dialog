import { EventEmitter } from "node:events";
import { Message } from "./message.js";
import { UUID } from "node:crypto";

export interface TTSEvents {
  "message": [Message];
  "error": [unknown];
}

export interface TTS<T extends Record<keyof T, unknown[]> = TTSEvents> extends EventEmitter<T & TTSEvents> {
  post: (message: Message) => void;
  abort: (uuid: UUID) => void;
  dispose: () => void;
}