/* eslint-disable @typescript-eslint/no-unused-vars */
import * as https from "node:https";
import * as fs from "node:fs";
import { once } from "node:events";
import * as ws from "ws";
import {
  TwilioGateway,
  DeepgramSTT,
  OpenAISTT,
  CartesiaTTS,
  log,
  SyslogLevel,
  TwilioVoIP,
  ElevenlabsTTS,
  TwilioVoIPOpenAIAgent
} from "@farar/dialog";
import { Agent } from "./agent.js";
import {
  CARTESIA_SPEECH_OPTIONS,
  DEEPGRAM_LIVE_SCHEMA,
  PORT,
  HOST_NAME,
  KEY_FILE,
  CERT_FILE,
  WEBHOOK_URL,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  DEEPGRAM_API_KEY,
  CARTESIA_API_KEY,
  ELEVEN_LABS_API_KEY,
  OPENAI_API_KEY,
  OPENAI_GREETING_MESSAGE,
  OPENAI_SYSTEM_MESSAGE,
  OPENAI_MODEL,
  OPENAI_SESSION
} from "./settings.js";

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

const webSocketServer = new ws.WebSocketServer({ noServer: true, maxPayload: 1e6 });

const gateway = new TwilioGateway({
  httpServer,
  webSocketServer,
  webhookURL: new URL(WEBHOOK_URL),
  authToken: TWILIO_AUTH_TOKEN,
  accountSid: TWILIO_ACCOUNT_SID,
  requestSizeLimit: 1e6
});

gateway.on("voip", (voip: TwilioVoIP) => {
  // new ElevenlabsTTS({ apiKey: ELEVEN_LABS_API_KEY }),
  // new CartesiaTTS({ apiKey: CARTESIA_API_KEY, speechOptions: CARTESIA_SPEECH_OPTIONS }),
  // new OpenAISTT({ apiKey: OPENAI_API_KEY, session: OPENAI_SESSION }),
  // new DeepgramSTT({ apiKey: DEEPGRAM_API_KEY, liveSchema: DEEPGRAM_LIVE_SCHEMA }),
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
});
