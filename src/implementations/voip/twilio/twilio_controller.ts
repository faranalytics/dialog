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
import { TwilioSession } from "./twilio_session.js";

const { twiml } = twilio;

export interface HTTPRequestBody {
  data: {
    event_type: string,
    payload: {
      call_control_id: string
    }
  }
};

export interface TwilioControllerEvents {
  "session": [TwilioSession];
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
  protected callSidToTwilioSession: Map<string, TwilioSession>;
  protected webhookURL: URL;

  constructor({ httpServer, webSocketServer, webhookURL }: TwilioControllerOptions) {
    super();
    this.httpServer = httpServer;
    this.webSocketServer = webSocketServer;
    this.webhookURL = webhookURL;
    this.webSocketURL = new URL(randomUUID(), `wss://${this.webhookURL.host}`);
    this.callSidToTwilioSession = new Map();

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
        const session = new TwilioSession({ metadata: { call: body } });
        this.callSidToTwilioSession.set(body.CallSid, session);
        this.emit("session", session);
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
      void new WebSocketListener({ webSocket, twilioController: this, callSidToTwilioSession: this.callSidToTwilioSession });
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
  callSidToTwilioSession: Map<string, TwilioSession>;
}

class WebSocketListener {
  protected webSocket: ws.WebSocket;
  protected callSidToTwilioSession: Map<string, TwilioSession>;
  protected session?: TwilioSession;
  protected startMessage?: StartWebSocketMessage;
  protected twilioController: TwilioController;

  constructor({ webSocket, twilioController, callSidToTwilioSession }: WebSocketListenerOptions) {
    this.webSocket = webSocket;
    this.twilioController = twilioController;
    this.callSidToTwilioSession = callSidToTwilioSession;
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
        this.session = this.callSidToTwilioSession.get(this.startMessage.start.callSid);
        if (!this.session) {
          throw new Error("The callSid is not recognized.");
        }
        this.session.on("agent_message", this.postAgentMessage);
        this.session.on("hangup", this.postHangup);
        this.session.on("transfer", this.postTransfer);
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
      log.notice("WebSocketListener.postAgentMessage");
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