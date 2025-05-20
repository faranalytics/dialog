export interface DeepgramMessage {
  channel: {
    alternatives: {
      transcript: string
    }[]
  },
  is_final: boolean,
  speech_final: boolean
}