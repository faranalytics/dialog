import { UUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { Message } from "./message.js";

export interface SessionEvents<MetadataT> {
  "user_message": [Message];
  "agent_message": [Message];
  "agent_message_dispatched": [UUID];
  "started": [];
  "stopped": [];
  "metadata": [MetadataT];
}

export type Session<MetadataT, EventsT extends Record<keyof EventsT, unknown[]>> = EventEmitter<SessionEvents<MetadataT> & EventsT>;