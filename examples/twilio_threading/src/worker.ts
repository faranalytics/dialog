import { Agent } from "./agent.js";
import { CartesiaTTS, DeepgramSTT, TwilioVoIPProxy } from "@farar/dialog";
import {
  DEEPGRAM_API_KEY,
  DEEPGRAM_LIVE_SCHEMA,
  CARTESIA_API_KEY,
  CARTESIA_SPEECH_OPTIONS,
  OPENAI_API_KEY,
  OPENAI_SYSTEM_MESSAGE,
  OPENAI_GREETING_MESSAGE,
  OPENAI_MODEL,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
} from "./settings.js";

const voip = new TwilioVoIPProxy();

const agent = new Agent({
  voip: voip,
  stt: new DeepgramSTT({ apiKey: DEEPGRAM_API_KEY, liveSchema: DEEPGRAM_LIVE_SCHEMA }),
  tts: new CartesiaTTS({ apiKey: CARTESIA_API_KEY, speechOptions: CARTESIA_SPEECH_OPTIONS }),
  apiKey: OPENAI_API_KEY,
  system: OPENAI_SYSTEM_MESSAGE,
  greeting: OPENAI_GREETING_MESSAGE,
  model: OPENAI_MODEL,
  twilioAccountSid: TWILIO_ACCOUNT_SID,
  twilioAuthToken: TWILIO_AUTH_TOKEN,
});

agent.activate();
