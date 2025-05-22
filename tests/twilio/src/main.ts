import * as https from "node:https";
import * as fs from "node:fs";
import { once } from "node:events";
import * as ws from "ws";
import { TwilioController, DeepgramSTT, CartesiaTTS, OpenAIAgent, Dialog, log, SyslogLevel, VoIP } from "@farar/dialog";
import { endpoint } from "./prompts.js";
import OpenAI from "openai";

log.setLevel(SyslogLevel.INFO);

const {
  DEEPGRAM_API_KEY = "",
  CARTESIA_API_KEY = "",
  OPENAI_API_KEY = "",
  OPENAI_SYSTEM_MESSAGE = "",
  OPENAI_GREETING_MESSAGE = "",
  KEY_FILE = "",
  CERT_FILE = "",
  PORT = 3443,
  HOST_NAME = "0.0.0.0",
  STREAM_URL = "wss://example.com:3443/"
} = process.env;

const openAI = new OpenAI({ "apiKey": OPENAI_API_KEY });

async function isEndpoint(transcript: string): Promise<boolean> {
  const prompt = endpoint(transcript);

  const completion = await openAI.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: prompt,
      }],
    temperature: 0
  });

  const agentMessage = completion.choices[0].message.content;
  if (agentMessage == "Complete" || agentMessage == "Unclassifiable") {
    return true;
  }
  return false;
}

log.info(new Date().toLocaleString());

const httpServer = https.createServer({
  key: fs.readFileSync(KEY_FILE),
  cert: fs.readFileSync(CERT_FILE),
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
  const stt = new DeepgramSTT({ apiKey: DEEPGRAM_API_KEY, endpoint: isEndpoint });
  const tts = new CartesiaTTS({ apiKey: CARTESIA_API_KEY });
  const agent = new OpenAIAgent({ apiKey: OPENAI_API_KEY, system: OPENAI_SYSTEM_MESSAGE, greeting: OPENAI_GREETING_MESSAGE });
  const dialog = new Dialog({ voip, stt, tts, agent });
  dialog.start();
});
