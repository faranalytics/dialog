export interface Webhook extends Record<string, string | string[] | undefined> {
  Called: string,
  ToState: string,
  CallerCountry: string,
  Direction: string,
  CallerState: string,
  ToZip: string,
  CallSid: string,
  To: string,
  CallerZip: string,
  ToCountry: string,
  CallToken: string,
  CalledZip: string,
  ApiVersion: string,
  CalledCity: string,
  CallStatus: string,
  From: string,
  AccountSid: string,
  CalledCountry: string,
  CallerCity: string,
  ToCity: string,
  FromCountry: string,
  Caller: string,
  FromCity: string,
  CalledState: string,
  FromZip: string,
  FromState: string

}

export const isWebhook = (message:Record<string, string | string[] | undefined>): message is Webhook => {
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