export interface WebSocketMessage {
  event: string,
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
};