export interface Body extends Record<string, string>{
  CallSid: string;
  To: string;
  From: string;
}

export const isBody = (message: Record<string, string>): message is Body => {
  return (typeof message.CallSid == "string" && typeof message.To == "string" && typeof message.From == "string");
};

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

export const isStartWebSocketMessage = (message: WebSocketMessage): message is StartWebSocketMessage => {
  return message.event == "start";
};

export interface MediaWebSocketMessage extends WebSocketMessage {
  event: "media",
  media: { payload: string }
}

export const isMediaWebSocketMessage = (message: WebSocketMessage): message is MediaWebSocketMessage => {
  return message.event == "media";
};

export interface StopWebSocketMessage extends WebSocketMessage {
  event: "stop"
}

export const isStopWebSocketMessage = (message: WebSocketMessage): message is StopWebSocketMessage => {
  return message.event == "stop";
};