import { once } from "node:events";
import { UUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { log } from "../../../commons/logger.js";
import { TTS, TTSEvents } from "../../../interfaces/tts.js";
import { SecondsTimer } from "../../../commons/seconds_timer.js";
import * as ws from "ws";
import { CartesiaChunk, CartesiaMessage } from "./types.js";

export interface CartesiaTTSEvents {
  "done": [UUID];
}

export interface CartesiaTTSOptions {
  apiKey: string;
}

export class CartesiaTTS extends EventEmitter<CartesiaTTSEvents> implements TTS {

  public emitter: EventEmitter<TTSEvents>;

  protected aborts: Set<UUID>;
  protected outputFormat: { container: string, encoding: string, sample_rate: number };
  protected apiKey: string;
  protected cartesiaURL: string;
  protected webSocket: ws.WebSocket;
  protected uuid?: UUID;
  protected secondsTimer: SecondsTimer;

  constructor({ apiKey }: CartesiaTTSOptions) {
    super();
    this.aborts = new Set();
    this.apiKey = apiKey;
    this.cartesiaURL = `wss://api.cartesia.ai/tts/websocket?cartesia_version=2024-11-13&api_key=${this.apiKey}`;
    this.webSocket = new ws.WebSocket(this.cartesiaURL);
    this.emitter = new EventEmitter();
    this.secondsTimer = new SecondsTimer();
    this.outputFormat = {
      container: "raw",
      encoding: "pcm_mulaw",
      sample_rate: 8000,
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

        const options = {
          context_id: uuid,
          language: "en",
          model_id: "sonic-2",
          voice: {
            mode: "id",
            id: "694f9389-aac1-45b6-b726-9d9369183238",
          },
          add_timestamps: true,
          output_format: this.outputFormat,
          continue: true
        };

        const message = JSON.stringify({ ...options, ...{ transcript } });
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