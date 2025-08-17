import { UUID } from "node:crypto";

export interface WebSocketMessage {
  type: "chunk" | "timestamps" | "done" | "error";
  context_id: string;
}

export interface TimestampsWebSocketMessage extends WebSocketMessage {
  type: "timestamps";
  context_id: UUID;
  status_code: number;
  done: boolean;
  word_timestamps: { words: string[], start: number[], end: number[] }
}

export const isTimestampsWebSocketMessage = (message: WebSocketMessage): message is TimestampsWebSocketMessage => {
  return message.type == "timestamps";
};

export interface ChunkWebSocketMessage extends WebSocketMessage {
  type: "chunk",
  context_id: UUID;
  status_code: number;
  done: false;
  data: string;
  step_time: number;
  flush_id: number;
}

export const isChunkWebSocketMessage = (message: WebSocketMessage): message is ChunkWebSocketMessage => {
  return message.type == "chunk";
};

export interface DoneWebSocketMessage extends WebSocketMessage {
  type: "done";
  context_id: UUID;
}

export const isDoneWebSocketMessage = (message: WebSocketMessage): message is DoneWebSocketMessage => {
  return message.type == "done";
};

export interface ErrorWebSocketMessage extends WebSocketMessage {
  type: "error";
}

export const isErrorWebSocketMessage = (message: WebSocketMessage): message is ErrorWebSocketMessage => {
  return message.type == "error";
};