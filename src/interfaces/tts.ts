import { EventEmitter } from "node:events";
import { Message } from "./message.js";

export interface TTSEvents {
  "agent_message": [Message];
}

export interface TTS<T extends Record<keyof T, unknown[]> = TTSEvents> extends EventEmitter<T & TTSEvents>  {
  postAgentMessage: (message: Message) => void;
  dispose(): void;
}