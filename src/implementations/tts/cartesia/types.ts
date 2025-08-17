import { UUID } from "node:crypto";

export interface WebsocketMessage {
  type: "chunk" | "timestamp" | "done";
  context_id: string;
}

export interface TimestampWebsocketMessage extends WebsocketMessage {
  type: "timestamp";
  context_id: UUID;
  status_code: number;
  done: boolean;
  word_timestamps: { words: string[], start: number[], end: number[] }
}

export interface ChunkWebsocketMessage extends WebsocketMessage {
  type: "chunk",
  context_id: UUID;
  status_code: number;
  done: false;
  data: string;
  step_time: number;
  flush_id: number;
}

export interface DoneWebsocketMessage extends WebsocketMessage {
  type: "done";
  context_id: UUID;
}

export const isChunkWebsocketMessage = (message: WebsocketMessage): message is ChunkWebsocketMessage => {
  return message.type == "chunk";
};

export const isDoneWebsocketMessage = (message: WebsocketMessage): message is DoneWebsocketMessage => {
  return message.type == "done";
};