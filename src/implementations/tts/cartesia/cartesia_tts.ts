import { once } from "node:events";
import { UUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { log } from "../../../commons/logger.js";
import { TTS, TTSEvents } from "../../../interfaces/tts.js";
import * as ws from "ws";
import { isChunkWebSocketMessage, isDoneWebSocketMessage, isErrorWebSocketMessage, isTimestampsWebSocketMessage, WebSocketMessage } from "./types.js";
import { Message } from "../../../interfaces/message.js";

export interface CartesiaTTSOptions {
  apiKey: string;
  speechOptions: Record<string, unknown>;
  url?: string;
  headers?: Record<string, string>;
}

export class CartesiaTTS extends EventEmitter<TTSEvents> implements TTS {
  protected internal: EventEmitter;
  protected apiKey: string;
  protected webSocket: ws.WebSocket;
  protected speechOptions: Record<string, unknown>;
  protected url: string;
  protected headers: Record<string, string>;
  protected activeMessages: Set<UUID>;
  protected mutex: Promise<void>;

  constructor({ apiKey, speechOptions, url, headers }: CartesiaTTSOptions) {
    super();
    this.internal = new EventEmitter();
    this.activeMessages = new Set();
    this.mutex = Promise.resolve();
    this.apiKey = apiKey;
    this.url = url ?? `wss://api.cartesia.ai/tts/websocket`;
    this.headers = { ...{ "Cartesia-Version": "2024-11-13", "X-API-Key": this.apiKey }, ...headers };
    this.webSocket = new ws.WebSocket(this.url, { headers: this.headers });
    this.speechOptions = speechOptions;
    this.webSocket.on("message", this.onWebSocketMessage);
    this.webSocket.on("error", log.error);
  }

  public post = (message: Message): void => {
    log.debug("CartesiaTTs.postAgentMessage");
    this.activeMessages.add(message.uuid);
    this.mutex = (async () => {
      try {
        await this.mutex;
        if (this.webSocket.readyState != ws.WebSocket.OPEN) {
          await once(this.webSocket, "open");
        }
        if (!this.activeMessages.has(message.uuid)) {
          return;
        }

        if (message.done) {
          const serialized = JSON.stringify({
            ...this.speechOptions,
            ...{
              transcript: message.data,
              continue: false,
              context_id: message.uuid
            }
          });
          const finished = once(this.internal, `finished:${message.uuid}`);
          this.webSocket.send(serialized);
          await finished;
          return;
        }

        const serialized = JSON.stringify({
          ...this.speechOptions,
          ...{
            transcript: message.data,
            continue: true,
            context_id: message.uuid,
          }
        });
        this.webSocket.send(serialized);
      }
      catch (err) {
        this.emit("error", err);
      }
    })();
  };

  protected onWebSocketMessage = (data: ws.RawData): void => {
    try {
      log.debug(data, "CartesiaTTS.onWebSocketMessage");
      if (!(data instanceof Buffer)) {
        throw new Error("Unhandled data type");
      }
      const webSocketMessage = JSON.parse(data.toString("utf-8")) as WebSocketMessage;
      if (isChunkWebSocketMessage(webSocketMessage)) {
        if (this.activeMessages.has(webSocketMessage.context_id)) {
          this.emit("message", {
            uuid: webSocketMessage.context_id,
            data: webSocketMessage.data,
            done: false
          });
        }
      }
      else if (isDoneWebSocketMessage(webSocketMessage)) {
        log.info(webSocketMessage, "CartesiaTTS.onWebSocketMessage/isDoneWebSocketMessage");
        if (this.activeMessages.has(webSocketMessage.context_id)) {
          this.emit("message", {
            uuid: webSocketMessage.context_id,
            data: "",
            done: true
          });
          this.activeMessages.delete(webSocketMessage.context_id);
        }
        this.internal.emit(`finished:${webSocketMessage.context_id}`);
      }
      else if (isTimestampsWebSocketMessage(webSocketMessage)) {
        log.debug(webSocketMessage, "CartesiaTTS.onWebSocketMessage/isTimestampsWebSocketMessage");
      }
      else if (isErrorWebSocketMessage(webSocketMessage)) {
        log.error(webSocketMessage, "CartesiaTTS.onWebSocketMessage");
      }
      else {
        log.warn(webSocketMessage, "CartesiaTTS.onWebSocketMessage");
      }
    }
    catch (err) {
      this.emit("error", err);
    }
  };

  public abort = (uuid: UUID): void => {
    if (this.activeMessages.has(uuid)) {
      this.activeMessages.delete(uuid);
      const serialized = JSON.stringify({
        ...this.speechOptions,
        ...{
          cancel: true,
          context_id: uuid
        }
      });
      this.webSocket.send(serialized);
    }
  };

  public dispose = (): void => {
    this.webSocket.close();
    this.removeAllListeners();
    this.internal.removeAllListeners();
  };
}