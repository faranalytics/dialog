export interface Message {
  type: "SpeechStarted" |  "Results";
}

export interface SpeechStartedMessage extends Message {
  type: "SpeechStarted";
}

export interface ResultsMessage extends Message {
  type: "Results",
  channel: {
    alternatives: {
      transcript: string
    }[]
  },
  is_final: boolean,
  speech_final: boolean
}