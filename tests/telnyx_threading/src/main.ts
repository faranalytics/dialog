import * as https from "node:https";
import * as fs from "node:fs";
import * as ws from "ws";
import { once } from "node:events";
import { TelnyxController, WorkerPool, log, SyslogLevel } from "@farar/dialog";

log.setLevel(SyslogLevel.INFO);

const {
  TELNYX_API_KEY = "",
  KEY_FILE = "",
  CERT_FILE = "",
  PORT = 3443,
  HOST_NAME = "0.0.0.0",
  STREAM_URL = "wss://example.com:3443/"
} = process.env;

log.notice(new Date().toLocaleString());

const httpServer = https.createServer({
  key: fs.readFileSync(KEY_FILE),
  cert: fs.readFileSync(CERT_FILE),
});

httpServer.listen(parseInt(PORT.toString()), HOST_NAME);

await once(httpServer, "listening");

log.info(`httpServer is listening on ${PORT.toString()}, ${HOST_NAME}`);

const webSocketServer = new ws.WebSocketServer({ noServer: true });

const controller = new TelnyxController({
  apiKey: TELNYX_API_KEY,
  httpServer,
  webSocketServer,
  streamURL: STREAM_URL
});

new WorkerPool({ controller, workerURL: "file:///home/farar/workspace/repos/phone-thing/dialog/test/dist/worker.js" });
