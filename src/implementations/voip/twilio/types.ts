export interface Body {
  CallSid: string;
  To: string;
  From: string;
}

export interface WebSocketMessage {
  event: "start" | "media" | "stop",
};

export interface StartWebSocketMessage extends WebSocketMessage {
  event: "start",
  start: {
    streamSid: string,
    callSid: string,
    mediaFormat: {
      channels: number,
      encoding: string,
      sampleRate: number
    }
  }
}

export interface MediaWebSocketMessage extends WebSocketMessage {
  event: "media",
  media: { payload: string }
}

export interface StopWebSocketMessage extends WebSocketMessage {
  event: "stop"
}

export const isStartWebSocketMessage = (message: WebSocketMessage): message is StartWebSocketMessage => {
  return message.event == "start";
};

export const isMediaWebSocketMessage = (message: WebSocketMessage): message is MediaWebSocketMessage => {
  return message.event == "media";
};

export const isStopWebSocketMessage = (message: WebSocketMessage): message is StopWebSocketMessage => {
  return message.event == "stop";
};