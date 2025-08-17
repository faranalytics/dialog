import { EventEmitter } from "node:events";
import { Message } from "./message.js";

export interface STTEvents {
  "user_transcript_message": [Message];
  "vad": [];
}

export interface STT<T extends Record<keyof T, unknown[]> = STTEvents> extends EventEmitter<T & STTEvents> {
  postUserMessage: (media: Message) => void;
  dispose(): void;
}