import { EventEmitter } from "node:events";
import { Message } from "./message.js";
import { UUID } from "node:crypto";

export interface TTSEvents {
  "agent_media_message": [Message];
  "error": [unknown]
}

export interface TTS<T extends Record<keyof T, unknown[]> = TTSEvents> extends EventEmitter<T & TTSEvents> {
  postAgentMessage: (message: Message) => void;
  abortMessage: (uuid: UUID) => void;
  dispose: () => void;
}