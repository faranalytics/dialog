import { EventEmitter } from "node:events";
import { UUID } from "node:crypto";
import { Metadata } from "../commons/metadata.js";

export interface AgentEvents {
  "abort_media": [];
  "abort_transcript": [UUID];
  "transcript": [UUID, string];
  "dispose": [];
}

export interface Agent {
  emitter: EventEmitter<AgentEvents>;
  onTranscript: (transcript: string) => void;
  onUpdateMetadata: (metadata: Metadata) => void;
  onTranscriptDispatched: (uuid: UUID) => void;
  onStreaming: () => void;
  onVAD: () => void;
  onDispose: () => void;
}