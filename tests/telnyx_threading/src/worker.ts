import { DeepgramSTT, CartesiaTTS, OpenAIAgent, Dialog, ControllerProxy, VoIP, log, SyslogLevel } from "@farar/dialog";

log.setLevel(SyslogLevel.INFO);

const {
  DEEPGRAM_API_KEY = "",
  CARTESIA_API_KEY = "",
  OPENAI_API_KEY = "",
  OPENAI_SYSTEM_MESSAGE = "",
  OPENAI_GREETING_MESSAGE = "",
  OPENAI_MODEL = "gpt-4o-mini",
} = process.env;

const controller = new ControllerProxy();

controller.on("init", (voip: VoIP) => {
  const stt = new DeepgramSTT({ apiKey: DEEPGRAM_API_KEY });
  const tts = new CartesiaTTS({ apiKey: CARTESIA_API_KEY });
  const agent = new OpenAIAgent({ apiKey: OPENAI_API_KEY, system: OPENAI_SYSTEM_MESSAGE, greeting: OPENAI_GREETING_MESSAGE, model: OPENAI_MODEL });
  const dialog = new Dialog({ voip, stt, tts, agent });
  dialog.start();
});