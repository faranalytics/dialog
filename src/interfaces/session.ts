import { UUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { Message } from "./message.js";

export interface SessionEvents {
  "user_message": [Message];
  "agent_message": [Message];
  "agent_message_dispatched": [UUID];
  "started": [];
  "stopped": [];
}

export interface Session<MetadataT, EventsT extends Record<keyof EventsT, unknown[]>> extends EventEmitter<SessionEvents & EventsT> {
  metadata: MetadataT;
}