export interface Message {
  type: "SpeechStarted" | "Results" | "UtteranceEnd";
}

export interface SpeechStartedMessage extends Message {
  type: "SpeechStarted";
}


export interface UtteranceEndMessage extends Message {
  type: "UtteranceEnd";
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