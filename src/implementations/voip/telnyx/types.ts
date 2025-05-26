export interface WebSocketMessage {
  event: "start",
};

export interface StartWebSocketMessage extends WebSocketMessage {
  event: "start",
  media: { payload: string },
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