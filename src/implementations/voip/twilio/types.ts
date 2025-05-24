export interface WebSocketMessage {
  event: string,
};

export interface StartWebSocketMessage extends WebSocketMessage {
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
  media: { payload: string }
}

export interface Body {
  CallSid: string;
  To: string;
  From: string;
}