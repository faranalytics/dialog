
import { EventEmitter } from "node:events";
import { TwilioMetadata } from "./types.js";
import { SessionEvents } from "../../../interfaces/session.js";

export interface TwilioSessionEvents extends SessionEvents<TwilioMetadata> {
  "hangup": [];
  "transfer": [string];
  "transcript": [];
  "recording": [];
}

export type TwilioSession = EventEmitter<TwilioSessionEvents>;