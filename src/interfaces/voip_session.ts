import { UUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { Message } from "./message.js";

export interface VoIPSessionMetadata {
  to: string;
  from: string;
  callId: string;
  streamId?: string
}

export interface VoIPSessionEvents {
  "session_metadata": [VoIPSessionMetadata];
  "user_message": [Message];
  "agent_message": [Message];
  "agent_message_dispatched": [UUID];
  "agent_hangup": [];
  "agent_transfer": [string];
  "agent_abort_media": [];
  "transcript": [];
  "recording": [];
  "started": [];
  "stopped": [];
}

export class VoIPSession extends EventEmitter<VoIPSessionEvents> { };