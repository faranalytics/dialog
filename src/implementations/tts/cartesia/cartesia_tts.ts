import { once } from "node:events";
import { UUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { log } from "../../../commons/logger.js";
import { TTS, TTSEvents } from "../../../interfaces/tts.js";
import * as ws from "ws";
import { isChunkMessage, isDoneMessage, Message } from "./types.js";

export interface CartesiaTTSOptions {
  apiKey: string;
  speechOptions?: Record<string, unknown>;
  url?: string;
  headers?: Record<string, string>;
}

export class CartesiaTTS implements TTS {

  public emitter: EventEmitter<TTSEvents>;

  protected aborts: Set<UUID>;
  protected apiKey: string;
  protected webSocket: ws.WebSocket;
  protected uuid?: UUID;
  protected speechOptions: Record<string, unknown>;
  protected url: string;
  protected headers: Record<string, string>;
  protected contextId?: UUID;

  constructor({ apiKey, speechOptions, url, headers }: CartesiaTTSOptions) {
    this.aborts = new Set();
    this.apiKey = apiKey;
    this.emitter = new EventEmitter();
    this.url = url ?? `wss://api.cartesia.ai/tts/websocket`;
    this.headers = { ...{ "Cartesia-Version": "2024-11-13", "X-API-Key": this.apiKey }, ...headers };
    this.webSocket = new ws.WebSocket(this.url, { headers: this.headers });
    this.speechOptions = {
      ...{
        context_id: this.uuid,
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

    this.webSocket.on("message", this.onMessage);
    this.webSocket.on("error", log.error);
    this.emitter.once("dispose", this.onDispose);
  }

  public onAbortMedia = (): void => {
    try {
      if (this.uuid) {
        this.aborts.add(this.uuid);
      }
    }
    catch (err) {
      log.error(err);
    }
  };

  public onAbortTranscript = (uuid: UUID): void => {
    try {
      this.aborts.add(uuid);
    }
    catch (err) {
      log.error(err);
    }
  };

  public onTranscript = (uuid: UUID, transcript: string): void => {
    log.debug("CartesiaTTs/onTranscript");
    void (async () => {
      try {
        if (!(this.webSocket.readyState == this.webSocket.OPEN)) {
          await once(this.webSocket, "open");
        }
        if (this.uuid && this.uuid != uuid) {
          const message = JSON.stringify({ ...this.speechOptions, ...{ transcript: "", continue: false, context_id: this.uuid } });
          this.webSocket.send(message);
        }
        this.uuid = uuid;
        const message = JSON.stringify({ ...this.speechOptions, ...{ transcript, continue: true, context_id: this.uuid } });
        this.webSocket.send(message);
      }
      catch (err) {
        log.error(err);
      }
    })();
  };

  protected onMessage = (data: string): void => {

    const message = JSON.parse(data) as Message;

    if (isChunkMessage(message)) {
      const uuid = message.context_id;
      if (!this.aborts.has(uuid)) {
        this.emitter.emit("media", uuid, message.data);
      }
    }
    else if (isDoneMessage(message)) {
      log.debug(message);
      const uuid = message.context_id;
      this.aborts.delete(uuid);
      this.emitter.emit("transcript_dispatched", uuid);
    }
    else {
      log.debug(message);
    }
  };

  public onDispose = (): void => {
    this.webSocket.close();
    this.emitter.removeAllListeners();
  };
}