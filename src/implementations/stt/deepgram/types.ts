export interface LiveClientMessage {
  type: "SpeechStarted" | "Results" | "UtteranceEnd";
}

export interface LiveClientSpeechStartedMessage extends LiveClientMessage {
  type: "SpeechStarted";
}

export interface LiveClientUtteranceEndMessage extends LiveClientMessage {
  type: "UtteranceEnd";
}

export interface LiveClientResultsMessage extends LiveClientMessage {
  type: "Results";
  channel: {
    alternatives: {
      transcript: string;
    }[];
  };
  is_final: boolean;
  speech_final: boolean;
}

export const isResultsMessage = (message: LiveClientMessage): message is LiveClientResultsMessage => {
  return message.type == "Results";
};

export const isSpeechStartedMessage = (message: LiveClientMessage): message is LiveClientSpeechStartedMessage => {
  return message.type == "SpeechStarted";
};

export const isUtteranceEndMessage = (message: LiveClientMessage): message is LiveClientUtteranceEndMessage => {
  return message.type == "UtteranceEnd";
};
