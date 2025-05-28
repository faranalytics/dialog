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
  "set_agent": [Agent],
  "dispose": [];
}

export interface Agent {
  emitter: EventEmitter<AgentEvents>;
  onSTTTranscript: (transcript: string) => void;
  onVoIPUpdateMetadata: (metadata: Metadata) => void;
  onTTSTranscriptDispatched: (uuid: UUID) => void;
  onVoIPStreaming: () => void;
  onSTTVAD: () => void;
  onDispose: () => void;
}