import { LiveSchema } from "@deepgram/sdk";

export const CARTESIA_SPEECH_OPTIONS = {
  language: "en",
  model_id: "sonic-2",
  voice: {
    mode: "id",
    id: "694f9389-aac1-45b6-b726-9d9369183238",
  },
  add_timestamps: true,
  output_format: {
    container: "raw",
    encoding: "pcm_mulaw",
    sample_rate: 8000,
  },
  continue: true,
  max_buffer_delay_ms: 1000,
  endpointing: 500,
};

export const DEEPGRAM_LIVE_SCHEMA: LiveSchema = {
  model: "nova-2",
  language: "multi",
  channels: 1,
  encoding: "mulaw",
  sample_rate: 8000,
  endpointing: 500,
  interim_results: true,
  utterance_end_ms: 1000,
  vad_events: true
};