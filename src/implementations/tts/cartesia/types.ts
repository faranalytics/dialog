import { UUID } from "node:crypto";

export interface WebsocketMessage {
  type: "chunk" | "timestamp" | "done";
  context_id: string;
}

export interface TimestampMessage extends WebsocketMessage {
  type: "timestamp";
  context_id: UUID;
  status_code: number;
  done: boolean;
  word_timestamps: { words: string[], start: number[], end: number[] }
}

export interface ChunkMessage extends WebsocketMessage {
  type: "chunk",
  context_id: UUID;
  status_code: number;
  done: false;
  data: string;
  step_time: number;
  flush_id: number;
}

export interface DoneMessage extends WebsocketMessage {
  type: "done";
  context_id: UUID;
}

export const isChunkMessage = (message: WebsocketMessage): message is ChunkMessage => {
  return message.type == "chunk";
};

export const isDoneMessage = (message: WebsocketMessage): message is DoneMessage => {
  return message.type == "done";
};