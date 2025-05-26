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

export const isResultsMessage = (message: Message): message is ResultsMessage => {
  return message.type == "Results";
};

export const isSpeechStartedMessage = (message: Message): message is SpeechStartedMessage => {
  return message.type == "SpeechStarted";
};

export const isUtteranceEndMessage = (message: Message): message is UtteranceEndMessage => {
  return message.type == "UtteranceEnd";
};