import { EventEmitter } from "node:events";
import { TwilioMetadata } from "./types.js";
import { Session, SessionEvents } from "../../../interfaces/session.js";

export interface TwilioSessionEvents extends SessionEvents {
  "hangup": [];
  "transfer": [string];
  "transcript": [];
  "recording": [];
}

export interface TwilioSessionOptions {
  metadata: TwilioMetadata;
}

export class TwilioSession extends EventEmitter<TwilioSessionEvents> implements Session<TwilioMetadata, TwilioSessionEvents> {

  public metadata: TwilioMetadata;

  constructor({ metadata }: TwilioSessionOptions) {
    super();
    this.metadata = metadata;
  }
}