export interface Session {
  input_audio_format: "pcm16" | "g711_ulaw" | "g711_alaw";
  input_audio_noise_reduction?: { type: "near_field" | "far_field" };
  input_audio_transcription: {
    model: "gpt-4o-transcribe" | "gpt-4o-mini-transcribe";
    prompt?: string;
    language?: string;
  };
  turn_detection: {
    type: "semantic_vad" | "server_vad";
    threshold?: number;
    prefix_padding_ms?: number;
    silence_duration_ms?: number;
    eagerness?: "low" | "medium" | "high" | "auto";
  };
}

export interface WebSocketMessage {
  type:
    | "transcription_session.created"
    | "conversation.item.created"
    | "conversation.item.input_audio_transcription.delta"
    | "transcription_session.update"
    | "input_audio_buffer.speech_started"
    | "conversation.item.input_audio_transcription.completed"
    | "input_audio_buffer.committed"
    | "input_audio_buffer.speech_stopped";
}

export interface CompletedWebSocketMessage extends WebSocketMessage {
  type: "conversation.item.input_audio_transcription.completed";
  transcript: string;
}

export const isCompletedWebSocketMessage = (message: WebSocketMessage): message is CompletedWebSocketMessage => {
  return message.type == "conversation.item.input_audio_transcription.completed";
};

export interface SpeechStartedWebSocketMessage extends WebSocketMessage {
  type: "input_audio_buffer.speech_started";
  transcript: string;
}

export const isSpeechStartedWebSocketMessage = (
  message: WebSocketMessage
): message is SpeechStartedWebSocketMessage => {
  return message.type == "input_audio_buffer.speech_started";
};

export interface InputAudioTranscriptionDeltaWebSocketMessage extends WebSocketMessage {
  type: "conversation.item.input_audio_transcription.delta";
  delta: string;
}

export const isInputAudioTranscriptionDeltaWebSocketMessage = (
  message: WebSocketMessage
): message is InputAudioTranscriptionDeltaWebSocketMessage => {
  return message.type == "conversation.item.input_audio_transcription.delta";
};

export interface ConversationItemCreatedWebSocketMessage extends WebSocketMessage {
  type: "conversation.item.created";
}

export const isConversationItemCreatedWebSocketMessage = (
  message: WebSocketMessage
): message is ConversationItemCreatedWebSocketMessage => {
  return message.type == "conversation.item.created";
};
