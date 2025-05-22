import * as https from "node:https";
import * as fs from "node:fs";
import { once } from "node:events";
import * as ws from "ws";
import { TwilioController, DeepgramSTT, CartesiaTTS, OpenAIAgent, Dialog, log, SyslogLevel, VoIP } from "@farar/dialog";
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
  const prompt = `You will be given a text input that represents a possible human utterance. Classify the utterance as one of the following:

Complete – The utterance expresses a self-contained idea or thought, with no evident missing parts.

Incomplete – The utterance appears to trail off, lacks closure, or seems interrupted or fragmentary.

For each input, respond only with the classification ("Complete", "Incomplete"). If needed, use grammatical, semantic, and pragmatic cues to make your judgment.  If you are not sure, then respond with "Complete".

Here is the input:
"{{${transcript}}}"`;

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
