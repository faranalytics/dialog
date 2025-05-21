import { EventEmitter } from "node:events";

export interface STTEvents {
  "transcript": [string];
  "abort_media": [];
  "dispose": [];
}

export interface STT {
  emitter: EventEmitter<STTEvents>;
  onDispose: () => void;
  onAudio: (audio: string) => void;
}