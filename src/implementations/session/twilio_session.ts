import { EventEmitter } from "node:events";
import { TwilioMetadata } from "../voip/twilio/types.js";
import { AgentMediaMessage, AgentTranscriptMessage, UserMediaMessage, UserTranscriptMessage } from "../../commons/types.js";
import { UUID } from "node:crypto";

export interface TwilioSessionEvents {
  "user_media_message": [UserMediaMessage];
  "agent_media_message": [AgentMediaMessage];
  "user_transcript_message": [UserTranscriptMessage];
  "agent_transcript_message": [AgentTranscriptMessage];
  "vad": [];
  "update_metadata": [TwilioMetadata];
  "streaming_start": [];
  "streaming_stop": [];
  "abort_media": [];
  "abort_agent_message": [UUID];
  "message_dispatched": [UUID];
}

export class TwilioSession extends EventEmitter<TwilioSessionEvents> { }