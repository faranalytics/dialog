import * as https from "node:https";
import * as fs from "node:fs";
import { once } from "node:events";
import * as ws from "ws";
import { TwilioController, DeepgramSTT, CartesiaTTS, OpenAIAgent, log, SyslogLevel, TwilioSession } from "@farar/dialog";
import { systemPrompt } from "./prompts.js";

log.setLevel(SyslogLevel.NOTICE);

const {
  DEEPGRAM_API_KEY = "",
  CARTESIA_API_KEY = "",
  OPENAI_API_KEY = "",
  OPENAI_SYSTEM_MESSAGE = systemPrompt(),
  OPENAI_GREETING_MESSAGE = "",
  OPENAI_MODEL = "gpt-4o-mini",
  KEY_FILE = "",
  CERT_FILE = "",
  PORT = 3443,
  HOST_NAME = "0.0.0.0",
  WEBHOOK_URL = "https://example.com:443/twiml"
} = process.env;

log.notice(new Date().toLocaleString());

const httpServer = https.createServer({
  key: fs.readFileSync(KEY_FILE),
  cert: fs.readFileSync(CERT_FILE),
});

process.on("SIGUSR2", () => {
  httpServer.closeAllConnections();
  httpServer.close();
  setTimeout(() => {
    process.exit();
  });
});

httpServer.listen(parseInt(PORT.toString()), HOST_NAME);

await once(httpServer, "listening");

log.notice(`httpServer is listening on ${PORT.toString()}, ${HOST_NAME}`);

const webSocketServer = new ws.WebSocketServer({ noServer: true });

const controller = new TwilioController({
  httpServer,
  webSocketServer,
  webhookURL: new URL(WEBHOOK_URL)
});

controller.on("session", (session: TwilioSession) => {
  const stt = new DeepgramSTT({ apiKey: DEEPGRAM_API_KEY, liveSchema: { endpointing: 1000 } });
  const tts = new CartesiaTTS({ apiKey: CARTESIA_API_KEY });
  new OpenAIAgent({
    session: session,
    stt: stt,
    tts: tts,
    apiKey: OPENAI_API_KEY,
    system: OPENAI_SYSTEM_MESSAGE,
    greeting: OPENAI_GREETING_MESSAGE,
    model: OPENAI_MODEL,
  });
});
