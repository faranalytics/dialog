import { EventEmitter } from "node:events";

export interface STTEvents {
  "transcript": [string];
  "vad": [];
  "dispose": [];
}

export interface STT {
  emitter: EventEmitter<STTEvents>;
  onDispose: () => void;
  onMedia: (media: string) => void;
}