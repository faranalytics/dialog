export interface Message {
  event: "start" | "media" | "stop",
};

export interface StartMessage extends Message {
  event: "start",
  start: {
    call_control_id: string,
    to: string,
    from: string,
    media_format: {
      channels: number,
      encoding: string,
      sample_rate: number
    }
  }
}

export interface MediaMessage extends Message {
  event: "media",
  media: { payload: string },
}

export interface StopMessage extends Message {
  event: "stop",
}