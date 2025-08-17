import { EventEmitter } from "node:events";
import { Message } from "./message.js";

export interface TTSEvents {
  "agent_message": [Message];
}

export interface TTS {
  emitter: EventEmitter<TTSEvents>;
  postAgentMessage: (message: Message) => void;
  dispose(): void;
}