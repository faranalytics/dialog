import * as https from "node:https";
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
  isCallMetadata,
  isRecordingStatus,
  isTranscriptStatus,
} from "./types.js";
import * as qs from "node:querystring";
import twilio from "twilio";
import { randomUUID, UUID } from "node:crypto";
import { TwilioVoIP } from "./twilio_voip.js";

const { twiml } = twilio;

export interface TwilioControllerEvents {
  "voip": [TwilioVoIP];
}

export interface TwilioControllerOptions {
  httpServer: http.Server;
  webSocketServer: ws.Server;
  webhookURL: URL;
  accountSid: string;
  authToken: string;
  recordingStatusURL?: URL;
  transcriptStatusURL?: URL;
}

export class TwilioController extends EventEmitter<TwilioControllerEvents> {

  protected httpServer: http.Server;
  protected webSocketServer: ws.Server;
  protected webSocketURL: URL;
  protected callSidToTwilioVoIP: Map<string, TwilioVoIP>;
  protected webhookURL: URL;
  protected accountSid: string;
  protected authToken: string;
  protected recordingStatusURL: URL;
  protected transcriptStatusURL: URL;

  constructor({ httpServer, webSocketServer, webhookURL, accountSid, authToken, transcriptStatusURL, recordingStatusURL }: TwilioControllerOptions) {
    super();
    const suffix = httpServer instanceof https.Server ? "s" : "";
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.httpServer = httpServer;
    this.webSocketServer = webSocketServer;
    this.webhookURL = webhookURL;
    this.recordingStatusURL = recordingStatusURL ?? new URL(randomUUID(), `http${suffix}://${this.webhookURL.host}`);
    this.transcriptStatusURL = transcriptStatusURL ?? new URL(randomUUID(), `http${suffix}://${this.webhookURL.host}`);
    this.webSocketURL = new URL(randomUUID(), `ws${suffix}://${this.webhookURL.host}`);
    this.callSidToTwilioVoIP = new Map();
    this.httpServer.on("upgrade", this.onUpgrade);
    this.httpServer.on("request", this.onRequest);
    this.webSocketServer.on("connection", this.onConnection);
  }

  protected processWebhook = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    try {
      const streamBuffer = new StreamBuffer();
      req.pipe(streamBuffer);
      await once(req, "end");
      const body = { ...qs.parse(streamBuffer.buffer.toString("utf-8")) };
      if (!isCallMetadata(body)) {
        throw new Error("Unhandled webhook body.");
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
        metadata: body,
        accountSid: this.accountSid,
        authToken: this.authToken,
        recordingStatusURL: this.recordingStatusURL,
        transcriptStatusURL: this.transcriptStatusURL
      });
      this.callSidToTwilioVoIP.set(body.CallSid, voip);
      this.emit("voip", voip);
      voip.emit("metadata", body);
    }
    catch (err) {
      log.error(err, "TwilioController.processWebhook");
    }
  };

  protected processRecordingStatus = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const streamBuffer = new StreamBuffer();
    req.pipe(streamBuffer);
    await once(req, "end");
    const body = { ...qs.parse(streamBuffer.buffer.toString("utf-8")) };
    if (!isRecordingStatus(body)) {
      throw new Error("Unhandled recording status body.");
    }
    if (body.RecordingStatus == "completed") {
      const voip = this.callSidToTwilioVoIP.get(body.CallSid);
      voip?.emit("recording_url", body.RecordingUrl);
    }
    res.writeHead(200).end();
  };

  protected processTranscriptStatus = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const streamBuffer = new StreamBuffer();
    req.pipe(streamBuffer);
    await once(req, "end");
    const body = { ...qs.parse(streamBuffer.buffer.toString("utf-8")) };
    if (!isTranscriptStatus(body)) {
      throw new Error("Unhandled Body.");
    }
    const voip = this.callSidToTwilioVoIP.get(body.CallSid);
    if (voip) {
      voip.emit("transcript", body);
    }
    res.writeHead(200).end();
  };

  protected onRequest = (req: http.IncomingMessage, res: http.ServerResponse): void => {
    void (async () => {
      try {
        req.on("error", log.error);
        res.on("error", log.error);
        if (req.method != "POST" && req.method != "GET") {
          res.writeHead(405).end();
          return;
        }
        if (!req.url) {
          res.writeHead(404).end();
          return;
        }

        if (req.url == this.webhookURL.pathname) {
          await this.processWebhook(req, res);
          return;
        }
        else if (req.url == this.recordingStatusURL.pathname) {
          await this.processRecordingStatus(req, res);
          return;
        }
        else if (req.url == this.transcriptStatusURL.pathname) {
          await this.processTranscriptStatus(req, res);
          return;
        }

        res.writeHead(404).end();
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
      this.webSocketServer.handleUpgrade(req, socket, head, (webSocket: ws.WebSocket, req: http.IncomingMessage) => {
        this.webSocketServer.emit("connection", webSocket, req);
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
  public callSidToTwilioVoIP: Map<string, TwilioVoIP>;
  public voip?: TwilioVoIP;
  public twilioController: TwilioController;

  constructor({ webSocket, twilioController, callSidToTwilioVoIP }: WebSocketListenerOptions) {
    this.webSocket = webSocket;
    this.twilioController = twilioController;
    this.callSidToTwilioVoIP = callSidToTwilioVoIP;
    this.webSocket.on("message", this.onWebSocketMessage);
    this.webSocket.on("error", this.onWebSocketError);
  }

  protected onWebSocketError = (err: Error) => {
    this.voip?.emit("error", err);
  };

  protected onWebSocketMessage = (data: ws.RawData) => {
    try {
      if (!(data instanceof Buffer)) {
        throw new Error("Unhandled RawData type.");
      }
      const message = JSON.parse(data.toString("utf-8")) as WebSocketMessage;
      if (isMediaWebSocketMessage(message)) {
        log.debug(message, "WebSocketListener.postMessage/media");
        this.voip?.emit("message", { uuid: randomUUID(), data: message.media.payload, done: false });
      }
      else if (isMarkWebSocketMessage(message)) {
        log.info(message, "WebSocketListener.postMessage/mark");
        const uuid = message.mark.name as UUID;
        this.voip?.emit("message_dispatched", uuid);
      }
      else if (isStartWebSocketMessage(message)) {
        log.info(message, "WebSocketListener.postMessage/start");
        this.startMessage = message;
        this.voip = this.callSidToTwilioVoIP.get(this.startMessage.start.callSid);
        this.voip?.setWebSocketListener(this);
        this.voip?.updateMetadata({ streamSid: message.streamSid });
        this.voip?.emit("streaming_started");
      }
      else if (isStopWebSocketMessage(message)) {
        this.voip?.emit("streaming_stopped");
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