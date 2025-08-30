import { LiveSchema } from "@deepgram/sdk";
import { systemPrompt } from "./prompts.js";
import { Session } from "@farar/dialog";

export const {
  DEEPGRAM_API_KEY = "",
  CARTESIA_API_KEY = "",
  ELEVEN_LABS_API_KEY = "",
  OPENAI_API_KEY = "",
  TWILIO_AUTH_TOKEN = "",
  TWILIO_ACCOUNT_SID = "",
  KEY_FILE = "",
  CERT_FILE = "",
  PORT = 3443,
  HOST_NAME = "0.0.0.0",
  WEBHOOK_URL = "https://example.com:443/twiml"
} = process.env;

// OpenAI
export const OPENAI_MODEL = "gpt-4.1-nano-2025-04-14";
export const OPENAI_SYSTEM_MESSAGE = systemPrompt();
export const OPENAI_GREETING_MESSAGE = "Hi, my name is Alex.  What can I help you with today?";
export const OPENAI_SESSION: Session = {
  "input_audio_format": "g711_ulaw",
  "input_audio_transcription": {
    "model": "gpt-4o-transcribe",
    "language": "en"
  },
  "turn_detection": {
    "type": "semantic_vad",
    "eagerness": "high"
  }
};


// Cartesia
export const CARTESIA_SPEECH_OPTIONS = {
  language: "en",
  model_id: "sonic-2",
  voice: {
    mode: "id",
    id: "694f9389-aac1-45b6-b726-9d9369183238",
  },
  output_format: {
    container: "raw",
    encoding: "pcm_mulaw",
    sample_rate: 8000,
  },
  continue: true,
  max_buffer_delay_ms: 100,
};

// Deepgram
export const DEEPGRAM_LIVE_SCHEMA: LiveSchema = {
  model: "nova-2",
  language: "multi",
  channels: 1,
  encoding: "mulaw",
  sample_rate: 8000,
  endpointing: 350,
  interim_results: true,
  utterance_end_ms: 1000,
  vad_events: true
};