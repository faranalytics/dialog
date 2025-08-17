import { once } from "node:events";
import { UUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { log } from "../../../commons/logger.js";
import { TTS, TTSEvents } from "../../../interfaces/tts.js";
import * as ws from "ws";
import { isChunkWebsocketMessage, isDoneWebsocketMessage, WebsocketMessage } from "./types.js";
import { Message } from "../../../interfaces/message.js";

export interface CartesiaTTSOptions {
  apiKey: string;
  speechOptions?: Record<string, unknown>;
  url?: string;
  headers?: Record<string, string>;
}

export class CartesiaTTS extends EventEmitter<TTSEvents> implements TTS {

  public emitter: EventEmitter<TTSEvents>;

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
    this.emitter = new EventEmitter();
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

    this.webSocket.on("message", this.postWebsocketMessage);
    this.webSocket.on("error", log.error);
  }

  public postAgentMessage = (message: Message): void => {
    log.notice("CartesiaTTs.postAgentMessage");
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
              transcript: "",
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

  protected postWebsocketMessage = (data: ws.RawData): void => {
    log.notice(data, "CartesiaTTS.postWebsocketMessage");
    if (!(data instanceof Buffer)) {
      throw new Error("Unhandled data type");
    }
    const webSocketMessage = JSON.parse(data.toString("utf-8")) as WebSocketMessage;
    const message = JSON.parse(data) as WebsocketMessage;
    if (isChunkWebsocketMessage(message)) {
      this.emit("agent_message", { uuid: message.context_id, data: message.data, done: false });
    }
    else if (isDoneWebsocketMessage(message)) {
      this.emit("agent_message", { uuid: message.context_id, data: "", done: true });
    }
    else {
      log.debug(message);
    }
  };

  public dispose(): void {
    this.webSocket.close();
    this.emitter.removeAllListeners();
  };
}