import { UUID } from "node:crypto";

export interface WebSocketMessage {
  isFinal: boolean | null;
  contextId: UUID;
}

export interface AudioOutputWebSocketMessage extends WebSocketMessage {
  isFinal: null;
  audio: string;
}

export const isAudioOutputWebSocketMessage = (message: WebSocketMessage): message is AudioOutputWebSocketMessage => {
  return message.isFinal == null;
};

export interface FinalOutputWebSocketMessage extends WebSocketMessage {
  isFinal: true;
}

export const isFinalOutputWebSocketMessage = (message: WebSocketMessage): message is FinalOutputWebSocketMessage => {
  return message.isFinal == true;
};