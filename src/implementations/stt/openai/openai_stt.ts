
import * as ws from "ws";
import { log } from "../../../commons/logger.js";
import { EventEmitter, once } from "node:events";
import {
  isCompletedWebSocketMessage,
  isConversationItemCreatedWebSocketMessage,
  isSpeechStartedWebSocketMessage,
  Session,
  WebSocketMessage
} from "./types.js";
import { STT, STTEvents } from "../../../interfaces/stt/stt.js";
import { Mutex } from "../../../commons/mutex.js";
import { randomUUID } from "node:crypto";
import { Message } from "../../../interfaces/message/message.js";

export interface OpenAISTTOptions {
  apiKey: string;
  session: Session;
  queueSizeLimit?: number;
}

export class OpenAISTT extends EventEmitter<STTEvents> implements STT {

  protected webSocket: ws.WebSocket;
  protected apiKey: string;
  protected mutex: Mutex;
  protected transcript: string;
  protected session: Session;

  constructor({ apiKey, session, queueSizeLimit }: OpenAISTTOptions) {
    super();
    this.apiKey = apiKey;
    this.session = session;
    this.transcript = "";
    this.mutex = new Mutex({ queueSizeLimit });
    this.webSocket = this.createWebSocketConnection();
  }

  protected createWebSocketConnection = (): ws.WebSocket => {
    if (this.webSocket) {
      this.webSocket.off("message", this.onWebSocketMessage);
      this.webSocket.off("close", this.onWebSocketClose);
      this.webSocket.off("error", this.onWebSocketError);
      this.webSocket.off("open", this.onWebSocketOpen);
    }
    const webSocket = new ws.WebSocket(
      "wss://api.openai.com/v1/realtime?intent=transcription",
      { headers: { "Authorization": `Bearer ${this.apiKey}`, "OpenAI-Beta": "realtime=v1", } });
    webSocket.on("message", this.onWebSocketMessage);
    webSocket.once("close", this.onWebSocketClose);
    webSocket.on("error", this.onWebSocketError);
    webSocket.on("open", this.onWebSocketOpen);
    return webSocket;
  };

  public post = (message: Message): void => {
    if (this.webSocket.readyState == ws.WebSocket.OPEN) {
      this.webSocket.send(JSON.stringify({ "type": "input_audio_buffer.append", "audio": message.data }));
      return;
    }
    this.mutex.call("post", async () => {
      if (this.webSocket.readyState == ws.WebSocket.CLOSING || this.webSocket.readyState == ws.WebSocket.CLOSED) {
        this.webSocket = this.createWebSocketConnection();
      }
      if (this.webSocket.readyState != ws.WebSocket.OPEN) {
        await once(this.webSocket, "open");
      }
      this.webSocket.send(JSON.stringify({ "type": "input_audio_buffer.append", "audio": message.data }));
    }).catch((err: unknown) => this.emit("error", err));
  };

  protected onWebSocketMessage = (data: unknown): void => {
    try {
      if (!(data instanceof Buffer)) {
        throw new Error("Unhandled data type");
      }
      const webSocketMessage = JSON.parse(data.toString("utf-8")) as WebSocketMessage;
      log.info(webSocketMessage, "OpenAISTT.onWebSocketMessage");
      if (isCompletedWebSocketMessage(webSocketMessage)) {
        this.emit("message", { uuid: randomUUID(), data: webSocketMessage.transcript, done: true });
      } else if (isSpeechStartedWebSocketMessage(webSocketMessage)) {
        log.info(webSocketMessage, "OpenAISTT.onWebSocketMessage/isSpeechStartedWebSocketMessage");
        this.emit("vad");
      }
      else if (isConversationItemCreatedWebSocketMessage(webSocketMessage)) {
        log.info(webSocketMessage, "OpenAISTT.onWebSocketMessage/isConversationItemCreatedWebSocketMessage");
        this.emit("vad");
      }
      else {
        log.info(webSocketMessage, "OpenAISTT.onWebSocketMessage/unhandled");
      }
    }
    catch (err) {
      log.error(err);
    }
  };

  protected onWebSocketOpen = (): void => {
    try {
      log.notice("", "OpenAISTT.onWebSocketOpen");
      this.webSocket.send(JSON.stringify({
        "type": "transcription_session.update",
        "session": this.session
      }
      ));
    }
    catch (err) {
      log.error(err);
    }
  };

  protected onWebSocketClose = (code: number, reason: Buffer): void => {
    try {
      log.notice(`${code.toString()} ${reason.toString()}`, "OpenAISTT.onWebSocketClose");
    }
    catch (err) {
      log.error(err, "OpenAISTT.onWebSocketClose");
    }
  };

  protected onWebSocketError = (err: Error): void => {
    try {
      this.emit("error", err);
    }
    catch (err) {
      log.error(err, "OpenAISTT.onWebSocketError");
    }
  };

  public dispose = (): void => {
    log.notice("", "OpenAISTT.dispose");
    if (this.webSocket.readyState != ws.WebSocket.CLOSED) {
      this.webSocket.close();
    }
    this.removeAllListeners();
  };
}

