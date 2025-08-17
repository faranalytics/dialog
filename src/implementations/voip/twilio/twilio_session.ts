import { EventEmitter } from "node:events";
import { TwilioMetadata } from "./types.js";
import { Session, SessionEvents } from "../../../interfaces/session.js";

export interface TwilioSessionEvents extends SessionEvents<TwilioMetadata> {
  "hangup": [];
  "transfer": [string];
  "transcript": [];
  "recording": [];
}

export class TwilioSession extends EventEmitter<TwilioSessionEvents> implements Session<TwilioMetadata, TwilioSessionEvents> { }