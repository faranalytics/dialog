import * as https from "node:https";
import * as fs from "node:fs";
import { once } from "node:events";
import * as ws from "ws";
import { TwilioGateway, log, SyslogLevel, TwilioVoIP, TwilioVoIPWorker } from "@farar/dialog";
import { Worker } from "node:worker_threads";
import {
  PORT,
  HOST_NAME,
  KEY_FILE,
  CERT_FILE,
  WEBHOOK_URL,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
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
  requestSizeLimit: 1e6,
});

gateway.on("voip", (voip: TwilioVoIP) => {
  new TwilioVoIPWorker({ voip, worker: new Worker("./dist/worker.js") });
});
