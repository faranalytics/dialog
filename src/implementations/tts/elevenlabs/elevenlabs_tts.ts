import { EventEmitter, once } from "node:events";
import * as qs from "node:querystring";
import * as ws from "ws";
import { log } from "../../../commons/logger.js";
import { WebSocketMessage, isAudioOutputWebSocketMessage, isFinalOutputWebSocketMessage } from "./types.js";
import { setTimeout } from "node:timers/promises";
import { TTS, TTSEvents } from "../../../interfaces/tts.js";
import { Mutex } from "../../../commons/mutex.js";
import { UUID } from "node:crypto";
import { Message } from "../../../interfaces/message.js";

export interface ElevenlabsTTSOptions {
  voiceId?: string;
  apiKey: string;
  headers?: Record<string, string>; // TODO: Define type.
  url?: string;
  queryParameters?: Record<string, string>;
  timeout?: number;
}

export class ElevenlabsTTS extends EventEmitter<TTSEvents> implements TTS {

  protected internal: EventEmitter;
  protected mutex: Mutex;
  protected url: string;
  protected headers?: Record<string, string>; // TODO: Define type.
  protected webSocket: ws.WebSocket;
  protected activeMessages: Map<UUID, boolean>;
  protected timeout: number;

  constructor({ apiKey, url, voiceId, headers, queryParameters, timeout }: ElevenlabsTTSOptions) {
    super();
    this.timeout = timeout ?? 10000;
    this.internal = new EventEmitter();
    this.activeMessages = new Map();
    this.mutex = new Mutex();
    this.url = url ?? `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId ?? "JBFqnCBsd6RMkjVDRZzb"}/multi-stream-input?${qs.stringify({ ...{ model_id: "eleven_flash_v2_5", output_format: "ulaw_8000" }, ...queryParameters })}`;
    this.headers = { ...{ "xi-api-key": apiKey }, ...headers ?? {} };
    log.info({ url: this.url, headers: this.headers });
    this.webSocket = this.createWebSocketConnection();
  }

  public post(message: Message): void {
    log.debug("", "ElevenlabsTTS.post");
    if (!this.activeMessages.has(message.uuid)) {
      this.activeMessages.set(message.uuid, false);
    }
    this.mutex.call("post", async () => {
      if (this.webSocket.readyState == ws.WebSocket.CLOSING || this.webSocket.readyState == ws.WebSocket.CLOSED) {
        this.webSocket = this.createWebSocketConnection();
      }
      if (this.webSocket.readyState != ws.WebSocket.OPEN) {
        await once(this.webSocket, "open");
      }
      if (!this.activeMessages.has(message.uuid)) {
        log.info(`${message.uuid} is not a valid message.`);
        return;
      }
      const isInitialized = this.activeMessages.get(message.uuid);
      if (!isInitialized) {
        log.info(`Initialize ${message.uuid}`, "ElevenlabsTTS.post");
        const serialized = JSON.stringify({
          text: " ",
          context_id: message.uuid
        });
        this.webSocket.send(serialized);
        this.activeMessages.set(message.uuid, true);
      }
      const serialized = JSON.stringify({
        text: message.data.endsWith(" ") ? message.data : message.data + " ",
        flush: message.done,
        context_id: message.uuid
      });
      this.webSocket.send(serialized);
      if (message.done) {
        log.info(`Done: ${message.uuid}`, "ElevenlabsTTS.post");
        const serialized = JSON.stringify({
          close_context: true,
          context_id: message.uuid
        });
        const ac = new AbortController();
        const finished = once(this.internal, `finished:${message.uuid}`, { signal: ac.signal }).catch(() => undefined);
        const timeout = setTimeout(this.timeout, "timeout", { signal: ac.signal }).catch(() => undefined);
        this.webSocket.send(serialized);
        log.info(`Awaiting: ${message.uuid}`, "ElevenlabsTTS.post");
        const result = await Promise.race([finished, timeout]);
        log.info(`Awaited: ${message.uuid}`, "ElevenlabsTTS.post");
        ac.abort();
        if (result == "timeout") {
          log.warn(`Timeout for: ${message.uuid}`, "ElevenlabsTTS.post");
          if (this.activeMessages.has(message.uuid)) {
            this.emit("message", {
              uuid: message.uuid,
              data: "",
              done: true
            });
            this.activeMessages.delete(message.uuid);
          }
        }
        return;
      }
    }).catch((err: unknown) => this.emit("error", err));
  };

  public abort = (uuid: UUID): void => {
    if (this.activeMessages.has(uuid)) {
      const isInitialized = this.activeMessages.get(uuid);
      this.activeMessages.delete(uuid);
      if (isInitialized) {
        this.webSocket.send(JSON.stringify({
          text: "",
          flush: true,
          context_id: uuid
        }));
        this.webSocket.send(JSON.stringify({
          close_context: true,
          context_id: uuid
        }));
      }
      this.internal.emit(`finished:${uuid}`);
    }
  };

  public dispose = (): void => {
    log.notice(this.webSocket.readyState, "ElevenlabsTTS.dispose");
    if (this.webSocket.readyState != ws.WebSocket.CLOSED) {
      this.webSocket.close();
    }
  };

  protected onWebSocketMessage = (data: Buffer): void => {
    try {
      log.debug("", "ElevenlabsTTS.onWebsocketMessage");
      if (!(data instanceof Buffer)) {
        throw new Error("Unhandled data type");
      }
      const webSocketMessage = JSON.parse(data.toString("utf-8")) as WebSocketMessage;
      log.debug(webSocketMessage, "ElevenlabsTTS.onWebSocketMessage/webSocketMessage");
      const uuid = webSocketMessage.contextId;
      if (isAudioOutputWebSocketMessage(webSocketMessage)) {
        log.debug(webSocketMessage, "ElevenlabsTTS.onWebSocketMessage/isAudioOutputWebSocketMessage");
        if (this.activeMessages.has(uuid)) {
          const message = {
            uuid: uuid,
            data: webSocketMessage.audio,
            done: false,
          };
          this.emit("message", message);
        }
      }
      else if (isFinalOutputWebSocketMessage(webSocketMessage)) {
        log.info(webSocketMessage, "ElevenlabsTTS.onWebSocketMessage/isFinalOutputWebSocketMessage");
        if (this.activeMessages.has(uuid)) {
          const message = {
            uuid: uuid,
            data: "",
            done: true,
          };
          this.emit("message", message);
        }
        this.internal.emit(`finished:${uuid}`);
      }
      else {
        log.notice(webSocketMessage, "ElevenlabsTTS.onWebsocketMessage");
      }
    }
    catch (err) {
      log.error(err, "ElevenlabsTTS.onWebSocketMessage");
    }
  };

  protected onWebSocketClose = (code: number, reason: Buffer): void => {
    try {
      log.notice(`${code.toString()} ${reason.toString()}`, "ElevenlabsTTS.onWebSocketClose");
    }
    catch (err) {
      log.error(err, "ElevenlabsTTS.onWebSocketClose");
    }
  };

  protected onWebSocketOpen = (): void => {
    try {
      log.info("", "ElevenlabsTTS.onWebSocketOpen");
    }
    catch (err) {
      log.error(err, "ElevenlabsTTS.onWebSocketError");
    }
  };

  protected onWebSocketError = (err: Error): void => {
    try {
      log.error(err, "ElevenlabsTTS.onWebSocketError");
      this.emit("error", err);
    }
    catch (err) {
      log.error(err, "ElevenlabsTTS.onWebSocketError");
    }
  };

  protected createWebSocketConnection = (): ws.WebSocket => {
    const webSocket = new ws.WebSocket(this.url, { headers: this.headers });
    webSocket.on("message", this.onWebSocketMessage);
    webSocket.once("close", this.onWebSocketClose);
    webSocket.on("error", this.onWebSocketError);
    webSocket.on("open", this.onWebSocketOpen);
    return webSocket;
  };
}
