import { UUID } from "node:crypto";

export interface UserMediaMessage {
  data: string;
}

export interface AgentMediaMessage {
  id: UUID;
  data: string;
}

export interface UserTranscriptMessage {
  id: UUID;
  data: string;
}

export interface AgentTranscriptMessage {
  id: UUID;
  data: string;
  finished: boolean;
}