import { EventEmitter } from "node:events";
import { AgentMediaMessage, AgentTranscriptMessage, UserMediaMessage, UserTranscriptMessage } from "../../commons/types.js";
import { UUID } from "node:crypto";

export interface SessionEvents<MetadataT> {
  "user_media_message": [UserMediaMessage];
  "agent_media_message": [AgentMediaMessage];
  "user_transcript_message": [UserTranscriptMessage];
  "agent_transcript_message": [AgentTranscriptMessage];
  "vad": [];
  "update_metadata": [MetadataT];
  "streaming_start": [];
  "streaming_stop": [];
  "abort_media": [];
  "abort_agent_message": [UUID];
  "message_dispatched": [UUID];
}

export class Session<MetadataT> extends EventEmitter<SessionEvents<MetadataT>> { }