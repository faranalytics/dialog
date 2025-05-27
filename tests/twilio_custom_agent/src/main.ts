import * as https from "node:https";
import * as fs from "node:fs";
import { once } from "node:events";
import * as ws from "ws";
import { TwilioController, DeepgramSTT, CartesiaTTS, Dialog, log, SyslogLevel, VoIP } from "@farar/dialog";
import { systemPrompt, endpointPrompt } from "./prompts.js";
import { EndpointDetector } from "./endpoint_detector.js";
import { CustomAgent } from "./custom_agent.js";

log.setLevel(SyslogLevel.INFO);

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
  STREAM_URL = "wss://example.com:3443/"
} = process.env;

const endpointDetector = new EndpointDetector({ apiKey: OPENAI_API_KEY, endpointPrompt });

log.info(new Date().toLocaleString());

const httpServer = https.createServer({
  key: fs.readFileSync(KEY_FILE),
  cert: fs.readFileSync(CERT_FILE),
});

process.on("SIGUSR2", () => {
  console.log("SIGUSR2");
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
  streamURL: STREAM_URL
});

controller.on("init", (voip: VoIP) => {
  const stt = new DeepgramSTT({ apiKey: DEEPGRAM_API_KEY, endpoint: endpointDetector.isEndpoint });
  const tts = new CartesiaTTS({ apiKey: CARTESIA_API_KEY });
  const agent = new CustomAgent({ apiKey: OPENAI_API_KEY, system: OPENAI_SYSTEM_MESSAGE, greeting: OPENAI_GREETING_MESSAGE, model: OPENAI_MODEL });
  new Dialog({ voip, stt, tts, agent });
});
