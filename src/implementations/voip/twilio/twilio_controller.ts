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
  isMediaWebSocketMessage,
  isStartWebSocketMessage,
  isStopWebSocketMessage,
  isWebhook,
} from "./types.js";
import * as qs from "node:querystring";
import twilio from "twilio";
import { randomUUID } from "node:crypto";
import { Message } from "../../../interfaces/message.js";
import { VoIPSession } from "../../../interfaces/voip_session.js";

const { twiml } = twilio;

export interface TwilioControllerEvents {
  "session": [VoIPSession];
}

export interface TwilioControllerOptions {
  httpServer: http.Server;
  webSocketServer: ws.Server;
  webhookURL: URL;
}

export class TwilioController extends EventEmitter<TwilioControllerEvents> {

  protected httpServer: http.Server;
  protected webSocketServer: ws.WebSocketServer;
  protected webSocketURL: URL;
  protected callSidToVoIPSession: Map<string, VoIPSession>;
  protected webhookURL: URL;

  constructor({ httpServer, webSocketServer, webhookURL }: TwilioControllerOptions) {
    super();
    this.httpServer = httpServer;
    this.webSocketServer = webSocketServer;
    this.webhookURL = webhookURL;
    this.webSocketURL = new URL(randomUUID(), `wss://${this.webhookURL.host}`);
    this.callSidToVoIPSession = new Map();

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
        log.notice(serialized, "TwilioController.onRequest");
        const session = new VoIPSession();
        this.callSidToVoIPSession.set(body.CallSid, session);
        this.emit("session", session);
        session.emit("session_metadata", {
          to: body.To,
          from: body.From,
          callId: body.CallSid
        });
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
      void new WebSocketListener({ webSocket, twilioController: this, callSidToVoIPSession: this.callSidToVoIPSession });
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
  callSidToVoIPSession: Map<string, VoIPSession>;
}

class WebSocketListener {
  protected webSocket: ws.WebSocket;
  protected callSidToVoIPSession: Map<string, VoIPSession>;
  protected session?: VoIPSession;
  protected startMessage?: StartWebSocketMessage;
  protected twilioController: TwilioController;

  constructor({ webSocket, twilioController, callSidToVoIPSession }: WebSocketListenerOptions) {
    this.webSocket = webSocket;
    this.twilioController = twilioController;
    this.callSidToVoIPSession = callSidToVoIPSession;
    this.webSocket.on("message", this.postMessage);
  }

  protected postMessage = (data: ws.WebSocket.RawData) => {
    try {
      if (!(data instanceof Buffer)) {
        throw new Error("Unhandled RawData type.");
      }
      const message = JSON.parse(data.toString("utf-8")) as WebSocketMessage;
      if (isMediaWebSocketMessage(message)) {
        log.debug(message, "WebSocketListener.onMessage/media");
        if (!this.session) {
          throw new Error("The TwilioSession is not set.");
        }
        this.session.emit("user_message", { uuid: randomUUID(), data: message.media.payload, done: false });
      }
      else if (isStartWebSocketMessage(message)) {
        log.info(message, "WebSocketListener.onMessage/start");
        this.startMessage = message;
        this.session = this.callSidToVoIPSession.get(this.startMessage.start.callSid);
        if (!this.session) {
          throw new Error("The callSid is not recognized.");
        }
        this.session.on("agent_message", this.postAgentMessage);
        this.session.on("agent_hangup", this.postHangup);
        this.session.on("agent_transfer", this.postTransfer);
        this.session.on("agent_abort_media", this.postAbortMedia);
        this.session.emit("started");
      }
      else if (isStopWebSocketMessage(message)) {
        if (!this.session) {
          throw new Error("The TwilioSession is not set.");
        }
        this.session.emit("stopped");
      }
    }
    catch (err) {
      log.error(err, "WebSocketListener.postMessage");
      this.webSocket.close(1008);
    }
  };

  public postAgentMessage = (message: Message): void => {
    try {
      log.debug("WebSocketListener.postAgentMessage");
      if (!this.startMessage?.streamSid) {
        return;
      }
      const serialized = JSON.stringify({
        event: "media",
        streamSid: this.startMessage.streamSid,
        media: {
          payload: message.data,
        },
      });
      this.webSocket.send(serialized);
      if (message.done) {
        this.session?.emit("agent_message_dispatched", message.uuid);
      }
    }
    catch (err) {
      log.error(err, "WebSocketListener.postAgentMessage");
      this.webSocket.close(1008);
    }
  };

  public postAbortMedia = (): void => {
    try {
      log.info("WebSocketListener.postAbortMedia");
      const message = JSON.stringify({
        event: "clear",
        streamSid: this.startMessage?.streamSid,
      });
      this.webSocket.send(message);
    }
    catch (err) {
      log.error(err, "WebSocketListener.postAbortMedia");
      this.webSocket.close(1008);
    }
  };

  public postHangup = (): void => {
    try {

    }
    catch (err) {
      log.error(err, "WebSocketListener.postHangup");
      this.webSocket.close(1008);
    }
  };

  public postTransfer = (): void => {
    try {

    }
    catch (err) {
      log.error(err, "WebSocketListener.postTransfer");
      this.webSocket.close(1008);
    }
  };
}