import * as https from "node:https";
import * as fs from "node:fs";
import { once } from "node:events";
import * as ws from "ws";
import {
  TwilioController,
  // DeepgramSTT,
  OpenAISTT,
  // CartesiaTTS,
  log,
  SyslogLevel,
  TwilioVoIP,
  ElevenlabsTTS,
} from "@farar/dialog";

import {
  // CARTESIA_SPEECH_OPTIONS,
  // DEEPGRAM_LIVE_SCHEMA,
  PORT,
  HOST_NAME,
  KEY_FILE,
  CERT_FILE,
  WEBHOOK_URL,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  // DEEPGRAM_API_KEY,
  // CARTESIA_API_KEY,
  ELEVEN_LABS_API_KEY,
  OPENAI_API_KEY,
  OPENAI_GREETING_MESSAGE,
  OPENAI_SYSTEM_MESSAGE,
  OPENAI_MODEL,
  OPENAI_SESSION
} from "./settings.js";
import { TwilioVoIPOpenAIAgent } from "./twilio_voip_openai_agent.js";

log.setLevel(SyslogLevel.NOTICE);

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

log.notice(`httpServer is listening on ${PORT.toString()}, ${HOST_NAME}, pid ${process.pid.toString()}`);

const webSocketServer = new ws.WebSocketServer({ noServer: true });

const controller = new TwilioController({
  httpServer,
  webSocketServer,
  webhookURL: new URL(WEBHOOK_URL),
  authToken: TWILIO_AUTH_TOKEN,
  accountSid: TWILIO_ACCOUNT_SID
});


controller.on("voip", (voip: TwilioVoIP) => {
  // new DeepgramSTT({ apiKey: DEEPGRAM_API_KEY, liveSchema: DEEPGRAM_LIVE_SCHEMA })
  //new CartesiaTTS({ apiKey: CARTESIA_API_KEY, speechOptions: CARTESIA_SPEECH_OPTIONS }),
  const agent = new TwilioVoIPOpenAIAgent({
    voip: voip,
    stt: new OpenAISTT({ apiKey: OPENAI_API_KEY, session: OPENAI_SESSION }),
    tts: new ElevenlabsTTS({ apiKey: ELEVEN_LABS_API_KEY }),
    apiKey: OPENAI_API_KEY,
    system: OPENAI_SYSTEM_MESSAGE,
    greeting: OPENAI_GREETING_MESSAGE,
    model: OPENAI_MODEL,
  });

  agent.activate();
});
