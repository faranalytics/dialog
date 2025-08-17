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
  speechOptions?: Record<string, unknown>;
  url?: string;
  headers?: Record<string, string>;
}

export class CartesiaTTS extends EventEmitter<TTSEvents> implements TTS {
  protected apiKey: string;
  protected webSocket: ws.WebSocket;
  protected speechOptions: Record<string, unknown>;
  protected url: string;
  protected headers: Record<string, string>;
  protected contextId?: UUID;
  protected mutex: Promise<void>;

  constructor({ apiKey, speechOptions, url, headers }: CartesiaTTSOptions) {
    super();
    this.mutex = Promise.resolve();
    this.apiKey = apiKey;
    this.url = url ?? `wss://api.cartesia.ai/tts/websocket`;
    this.headers = { ...{ "Cartesia-Version": "2024-11-13", "X-API-Key": this.apiKey }, ...headers };
    this.webSocket = new ws.WebSocket(this.url, { headers: this.headers });
    this.speechOptions = {
      ...{
        language: "en",
        model_id: "sonic-2",
        voice: {
          mode: "id",
          id: "694f9389-aac1-45b6-b726-9d9369183238",
        },
        add_timestamps: true,
        output_format: {
          container: "raw",
          encoding: "pcm_mulaw",
          sample_rate: 8000,
        },
        continue: true,
        max_buffer_delay_ms: 1000
      }, ...speechOptions
    };

    this.webSocket.on("message", this.postWebSocketMessage);
    this.webSocket.on("error", log.error);
  }

  public postAgentMessage = (message: Message): void => {
    log.debug("CartesiaTTs.postAgentMessage");
    this.mutex = (async () => {
      try {
        await this.mutex;
        if (!(this.webSocket.readyState == this.webSocket.OPEN)) {
          await once(this.webSocket, "open");
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
          this.webSocket.send(serialized);
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
        log.error(err);
      }
    })();
  };

  protected postWebSocketMessage = (data: ws.RawData): void => {
    try {
      log.debug(data, "CartesiaTTS.postWebSocketMessage");
      if (!(data instanceof Buffer)) {
        throw new Error("Unhandled data type");
      }
      const webSocketMessage = JSON.parse(data.toString("utf-8")) as WebSocketMessage;
      if (isChunkWebSocketMessage(webSocketMessage)) {
        this.emit("agent_message", { uuid: webSocketMessage.context_id, data: webSocketMessage.data, done: false });
      }
      else if (isDoneWebSocketMessage(webSocketMessage)) {
        this.emit("agent_message", { uuid: webSocketMessage.context_id, data: "", done: true });
      }
      else if (isTimestampsWebSocketMessage(webSocketMessage)) {
        log.debug(webSocketMessage);
      }
      else if (isErrorWebSocketMessage(webSocketMessage)) {
        this.emit("error", webSocketMessage);
      }
      else {
        log.warn(webSocketMessage);
      }
    }
    catch (err) {
      this.emit("error", err);
    }
  };

  public dispose(): void {
    this.webSocket.close();
    this.removeAllListeners();
  };
}