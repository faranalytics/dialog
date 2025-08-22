import { UUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { Message } from "./message.js";

export interface Metadata {
  to?: string;
  from?: string;
  callId?: string;
  streamId?: string
}

export interface VoIPEvents {
  "metadata": [Metadata];
  "user_media_message": [Message];
  "agent_message_dispatched": [UUID];
  "transcript": [unknown];
  "recording": [string];
  "started": [];
  "stopped": [];
  "error": [unknown];
}

export interface VoIP<EventsT extends Record<keyof EventsT, unknown[]> = VoIPEvents> extends EventEmitter<VoIPEvents & EventsT> {
  postAgentMediaMessage: (message: Message) => void;
  updateMetadata: (metadata: Metadata) => void;
  abortMedia: () => void;
  hangup: () => Promise<unknown>;
  transfer: (tel: string) => Promise<unknown>;
  dispose: () => void;
};