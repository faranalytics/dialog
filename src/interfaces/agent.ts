import { EventEmitter } from "node:events";
import { UUID } from "node:crypto";
import { Metadata } from "../commons/metadata.js";
import { TTS } from "./tts.js";
import { STT } from "./stt.js";

export interface AgentEvents {
  "abort_media": [];
  "abort_transcript": [UUID];
  "transcript": [UUID, string];
  "set_tts": [TTS],
  "set_stt": [STT],
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