export type Body = Record<string, string | string[] | undefined>;

export interface CallMetadata extends Body {
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

export const isCallMetadata = (message: Body): message is CallMetadata => {
  return (typeof message.CallSid == "string" && typeof message.To == "string" && typeof message.From == "string");
};

export interface RecordingStatus extends Body {
  "RecordingSource": string;
  "RecordingTrack": string;
  "RecordingSid": string;
  "RecordingUrl": string;
  "RecordingStatus": string;
  "RecordingChannels": string;
  "ErrorCode": string;
  "CallSid": string;
  "RecordingStartTime": string;
  "AccountSid": string;
  "RecordingDuration": string;
}

export const isRecordingStatus = (message: Body): message is RecordingStatus => {
  return (typeof message.CallSid == "string" && typeof message.RecordingStatus == "string" && typeof message.RecordingSid == "string");
};


export interface TranscriptStatus {
  "LanguageCode": string;
  "TranscriptionSid": string;
  "TranscriptionEvent": string;
  "CallSid": string;
  "TranscriptionData": string;
  "Timestamp": string;
  "Final": string;
  "AccountSid": string;
  "Track": string;
  "SequenceId": string;
}

export interface WebSocketMessage {
  event: "start" | "media" | "stop" | "mark",
};

export interface StartWebSocketMessage extends WebSocketMessage {
  event: "start",
  start: {
    accountSid: string,
    streamSid: string,
    callSid: string,
    tracks: string[],
    mediaFormat: {
      channels: number,
      encoding: string,
      sampleRate: number
    },
    customParameters: unknown
  },
  streamSid: string,
}

export const isStartWebSocketMessage = (message: WebSocketMessage): message is StartWebSocketMessage => {
  return message.event == "start";
};

export interface MediaWebSocketMessage extends WebSocketMessage {
  event: "media",
  media: {
    track: string,
    chunk: string,
    timestamp: string,
    payload: string
  },
  streamSid: string
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

export interface MarkWebSocketMessage extends WebSocketMessage {
  event: "mark";
  sequenceNumber: string;
  streamSid: string;
  mark: { "name": string }
}

export const isMarkWebSocketMessage = (message: WebSocketMessage): message is MarkWebSocketMessage => {
  return message.event == "mark";
};