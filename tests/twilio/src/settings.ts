import { LiveSchema } from "@deepgram/sdk";
import { systemPrompt } from "./prompts.js";

export const {
  DEEPGRAM_API_KEY = "",
  CARTESIA_API_KEY = "",
  OPENAI_API_KEY = "",
  TWILIO_AUTH_TOKEN = "",
  TWILIO_ACCOUNT_SID = "",
  OPENAI_SYSTEM_MESSAGE = systemPrompt(),
  OPENAI_GREETING_MESSAGE = "",
  OPENAI_MODEL = "gpt-4o-mini",
  KEY_FILE = "",
  CERT_FILE = "",
  PORT = 3443,
  HOST_NAME = "0.0.0.0",
  WEBHOOK_URL = "https://example.com:443/twiml"
} = process.env;


export const CARTESIA_SPEECH_OPTIONS = {
  language: "en",
  model_id: "sonic-2",
  voice: {
    mode: "id",
    id: "694f9389-aac1-45b6-b726-9d9369183238",
  },
  // add_timestamps: true,
  output_format: {
    container: "raw",
    encoding: "pcm_mulaw",
    sample_rate: 8000,
  },
  continue: true,
  max_buffer_delay_ms: 250,
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