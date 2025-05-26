import { once } from "node:events";
import { UUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { log } from "../../../commons/logger.js";
import { TTS, TTSEvents } from "../../../interfaces/tts.js";
import { SecondsTimer } from "../../../commons/seconds_timer.js";
import * as ws from "ws";
import { CartesiaChunk, CartesiaMessage } from "./types.js";

export interface CartesiaTTSOptions {
  apiKey: string;
  options?: Record<string, unknown>;
}

export class CartesiaTTS implements TTS {

  public emitter: EventEmitter<TTSEvents>;

  protected aborts: Set<UUID>;
  protected apiKey: string;
  protected webSocket: ws.WebSocket;
  protected uuid?: UUID;
  protected secondsTimer: SecondsTimer;
  protected options: Record<string, unknown>;

  constructor({ apiKey, options }: CartesiaTTSOptions) {
    this.aborts = new Set();
    this.apiKey = apiKey;
    this.webSocket = new ws.WebSocket(`wss://api.cartesia.ai/tts/websocket?cartesia_version=2024-11-13&api_key=${this.apiKey}`);
    this.emitter = new EventEmitter();
    this.secondsTimer = new SecondsTimer();
    this.options = {
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
        continue: true
      }, ...options
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

        this.options.uuid = uuid;

        const message = JSON.stringify({ ...this.options, ...{ transcript } });
        this.webSocket.send(message);
      }
      catch (err) {
        log.error(err);
      }
    })();
  };

  protected onMessage = (data: string): void => {

    const message = JSON.parse(data) as CartesiaMessage;

    if (message.type == "chunk") {
      const uuid = (message as CartesiaChunk).context_id as UUID;
      if (!this.aborts.has(uuid)) {
        this.emitter.emit("media_out", uuid, (message as CartesiaChunk).data);
      }
    }
    else if (message.type == "done") {
      log.debug(message);
      const uuid = (message as CartesiaChunk).context_id as UUID;
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