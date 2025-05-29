import { UUID } from "node:crypto";
import { EventEmitter } from "node:events";

export interface TTSEvents {
  "media": [UUID, string];
  "transcript_dispatched": [UUID];
  "dispose": [];
}

export interface TTS {
  emitter: EventEmitter<TTSEvents>;
  onAbortMedia: () => void;
  onAbortTranscript: (uuid: UUID) => void;
  onTranscript: (uuid: UUID, transcript: string) => void;
  onDispose: () => void;
}