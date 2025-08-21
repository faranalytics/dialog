import { log } from "../../../commons/logger.js";
import { EventEmitter } from "node:events";
import { Duplex } from "node:stream";
import * as http from "node:http";
import { once } from "node:events";
import { StreamBuffer } from "../../../commons/stream_buffer.js";
import * as ws from "ws";
import {
  StartWebSocketMessage,
  WebSocketMessage,
  isMarkWebSocketMessage,
  isMediaWebSocketMessage,
  isStartWebSocketMessage,
  isStopWebSocketMessage,
  isWebhook,
} from "./types.js";
import * as qs from "node:querystring";
import twilio from "twilio";
import { randomUUID, UUID } from "node:crypto";
import { TwilioVoIP } from "./twilio_voip.js";
import { VoIP } from "../../../interfaces/voip.js";

const { twiml } = twilio;

export interface TwilioControllerEvents {
  "voip": [VoIP];
}

export interface TwilioControllerOptions {
  httpServer: http.Server;
  webSocketServer: ws.Server;
  webhookURL: URL;
  accountSid: string;
  authToken: string;
}

export class TwilioController extends EventEmitter<TwilioControllerEvents> {

  protected httpServer: http.Server;
  protected webSocketServer: ws.WebSocketServer;
  protected webSocketURL: URL;
  protected callSidToTwilioVoIP: Map<string, TwilioVoIP>;
  protected webhookURL: URL;
  protected accountSid: string;
  protected authToken: string;
  constructor({ httpServer, webSocketServer, webhookURL, accountSid, authToken }: TwilioControllerOptions) {
    super();
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.httpServer = httpServer;
    this.webSocketServer = webSocketServer;
    this.webhookURL = webhookURL;
    this.webSocketURL = new URL(randomUUID(), `wss://${this.webhookURL.host}`);
    this.callSidToTwilioVoIP = new Map();

    this.httpServer.on("upgrade", this.onUpgrade);
    this.httpServer.on("request", this.onRequest);
    this.webSocketServer.on("connection", this.onConnection);
  }

  protected onRequest = (req: http.IncomingMessage, res: http.ServerResponse): void => {
    void (async () => {
      try {
        req.on("error", log.error);
        res.on("error", log.error);

        if (req.method != "POST") {
          res.writeHead(405).end();
          return;
        }

        if (req.url != this.webhookURL.pathname) {
          res.writeHead(404).end();
          return;
        }

        const streamBuffer = new StreamBuffer();
        req.pipe(streamBuffer);
        await once(req, "end");

        const body = { ...qs.parse(streamBuffer.buffer.toString("utf-8")) };

        if (!isWebhook(body)) {
          throw new Error("Unhandled Webhook.");
        }

        const response = new twiml.VoiceResponse();
        const connect = response.connect();
        connect.stream({ url: this.webSocketURL.toString() });
        const serialized = response.toString() as string;
        res.writeHead(200, {
          "Content-Type": "text/xml",
          "Content-Length": Buffer.byteLength(serialized)
        });
        res.end(serialized);
        log.info(serialized, "TwilioController.onRequest");
        const voip = new TwilioVoIP({
          metadata: {
            to: body.To,
            from: body.From,
            callId: body.CallSid
          },
          accountSid: this.accountSid,
          authToken: this.authToken,
        });
        this.callSidToTwilioVoIP.set(body.CallSid, voip);
        this.emit("voip", voip);
      }
      catch (err) {
        log.error(err, "TwilioController.onRequest");
        res.writeHead(500).end();
      }
    })();
  };

  protected onConnection = (webSocket: ws.WebSocket, req: http.IncomingMessage): void => {
    try {
      log.info("TwilioController.onConnection");
      if (req.url != this.webSocketURL.pathname) {
        webSocket.close(404);
        return;
      }
      void new WebSocketListener({ webSocket, twilioController: this, callSidToTwilioVoIP: this.callSidToTwilioVoIP });
    }
    catch (err) {
      log.error(err);
    }
  };

  protected onUpgrade = (req: http.IncomingMessage, socket: Duplex, head: Buffer): void => {
    try {
      log.notice("TwilioController.onUpgrade");
      socket.on("error", log.error);
      this.webSocketServer.handleUpgrade(req, socket, head, (client: ws.WebSocket, request: http.IncomingMessage) => {
        this.webSocketServer.emit("connection", client, request);
      });
    }
    catch (err) {
      log.error(err);
    }
  };
}

interface WebSocketListenerOptions {
  webSocket: ws.WebSocket;
  twilioController: TwilioController;
  callSidToTwilioVoIP: Map<string, TwilioVoIP>;
}

export class WebSocketListener {

  public webSocket: ws.WebSocket;
  public startMessage?: StartWebSocketMessage;

  protected callSidToTwilioVoIP: Map<string, TwilioVoIP>;
  protected voip?: TwilioVoIP;
  protected twilioController: TwilioController;

  constructor({ webSocket, twilioController, callSidToTwilioVoIP }: WebSocketListenerOptions) {
    this.webSocket = webSocket;
    this.twilioController = twilioController;
    this.callSidToTwilioVoIP = callSidToTwilioVoIP;
    this.webSocket.on("message", this.onWebSocketMessage);
  }

  protected onWebSocketMessage = (data: ws.WebSocket.RawData) => {
    try {
      if (!(data instanceof Buffer)) {
        throw new Error("Unhandled RawData type.");
      }
      const message = JSON.parse(data.toString("utf-8")) as WebSocketMessage;
      if (isMediaWebSocketMessage(message)) {
        log.debug(message, "WebSocketListener.postMessage/media");
        this.voip?.emit("user_media_message", { uuid: randomUUID(), data: message.media.payload, done: false });
      }
      else if (isMarkWebSocketMessage(message)) {
        log.info(message, "WebSocketListener.postMessage/mark");
        const uuid = message.mark.name as UUID;
        this.voip?.emit("agent_message_dispatched", uuid);
      }
      else if (isStartWebSocketMessage(message)) {
        log.info(message, "WebSocketListener.postMessage/start");
        this.startMessage = message;
        this.voip = this.callSidToTwilioVoIP.get(this.startMessage.start.callSid);
        // this.voip?.setWebSocketListener(this);
        this.voip?.emit("started");
        this.voip?.updateMetadata({ streamId: message.streamSid });
      }
      else if (isStopWebSocketMessage(message)) {
        this.voip?.emit("stopped");
      }
      else {
        log.info(message, "WebSocketListener.postMessage/unhandled");
      }
    }
    catch (err) {
      log.error(err, "WebSocketListener.postMessage");
      this.webSocket.close(1008);
      this.voip?.emit("error", err);
    }
  };
}