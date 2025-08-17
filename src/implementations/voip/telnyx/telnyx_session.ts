
import { EventEmitter } from "node:events";
import { TelnyxMetadata } from "./types.js";
import { SessionEvents } from "../../../interfaces/session.js";

export interface TelnyxSessionEvents extends SessionEvents<TelnyxMetadata> {
  "hangup": [];
  "transfer": [string];
  "transcript": [];
  "recording": [];
}

export type TelnyxSession = EventEmitter<TelnyxSessionEvents>;