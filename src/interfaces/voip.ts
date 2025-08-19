import { UUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { Message } from "./message.js";

export interface Metadata {
  to: string;
  from: string;
  callId: string;
  streamId?: string
}

export interface VoIPEvents {
  "metadata": [Metadata];
  "user_media_message": [Message];
  "agent_message_dispatched": [UUID];
  "transcript": [];
  "recording": [];
  "started": [];
  "stopped": [];
  "error": [unknown];
}

export interface VoIP<EventsT extends Record<keyof EventsT, unknown[]> = VoIPEvents> extends EventEmitter<VoIPEvents & EventsT> {
  postAgentMediaMessage(message: Message): void;
  abortMedia(): void;
  hangup(): void;
  transfer(): void;
  dispose(): void;
};