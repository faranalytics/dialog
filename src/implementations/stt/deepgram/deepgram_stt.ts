import { log } from "../../../commons/logger.js";
import { once, EventEmitter } from "node:events";
import { createClient, DeepgramClient, ListenLiveClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { STT, STTEvents } from "../../../interfaces/stt.js";
import { DeepgramMessage } from "./types.js";

export interface DeepgramSTTOptions {
  apiKey: string;
  endpoint?: (transcript: string) => Promise<boolean>;
}

export class DeepgramSTT implements STT {

  public emitter: EventEmitter<STTEvents>;

  protected listenLiveClient: ListenLiveClient;
  protected transcript: string;
  protected client: DeepgramClient;
  protected queue: ArrayBuffer[];
  protected timeoutID?: NodeJS.Timeout;
  protected endpoint?: (transcript: string) => Promise<boolean>;
  protected mutex: Promise<void>;

  constructor({ apiKey, endpoint }: DeepgramSTTOptions) {
    this.transcript = "";
    this.queue = [];
    this.emitter = new EventEmitter();
    this.endpoint = endpoint;
    this.mutex = Promise.resolve();

    this.client = createClient(apiKey);

    this.listenLiveClient = this.client.listen.live({
      model: "nova-2",
      language: "en-US",
      // punctuate: true,
      // smart_format: true,
      channels: 1,
      encoding: "mulaw",
      sample_rate: 8000,
      endpointing: 300,
      interim_results: false,
      // utterance_end_ms:1000,
      // vad_events:true
    });

    this.listenLiveClient.on(LiveTranscriptionEvents.Open, this.onClientOpen);
    this.listenLiveClient.on(LiveTranscriptionEvents.Close, this.onClientClose);
    this.listenLiveClient.on(LiveTranscriptionEvents.Transcript, this.onClientTranscript);
    this.listenLiveClient.on(LiveTranscriptionEvents.Metadata, this.onClientMetaData);
    this.listenLiveClient.on(LiveTranscriptionEvents.Error, this.onClientError);
    this.listenLiveClient.on(LiveTranscriptionEvents.Unhandled, this.onClientUnhandled);
    this.emitter.once("dispose", this.onDispose);
  }

  protected onClientTranscript = (data: DeepgramMessage): void => {
    this.mutex = (async () => {
      try {
        clearTimeout(this.timeoutID);
        await this.mutex;
        log.debug(`deepgram_stt/onTranscript: ${JSON.stringify(data, null, 2)}`);
        const transcript = data.channel.alternatives[0].transcript;
        if (transcript !== "") {
          this.emitter.emit("abort_media");
          if (data.is_final) {
            this.transcript = this.transcript === "" ? transcript : this.transcript + " " + transcript;
            if (this.endpoint) {
              const isEndpoint = await this.endpoint(this.transcript);
              log.notice(`\nUtterance: ${this.transcript}\nEndpoint:${isEndpoint.toString()}`);
              if (isEndpoint) {
                this.emitter.emit("transcript", this.transcript);
                this.transcript = "";
              }
              else {
                this.timeoutID = setTimeout(() => {
                  this.emitter.emit("transcript", this.transcript);
                  this.transcript = "";
                }, 3000);
              }
            }
            else {
              if (data.speech_final) {
                this.emitter.emit("transcript", this.transcript);
                this.transcript = "";
              }
              else {
                this.timeoutID = setTimeout(() => {
                  this.emitter.emit("transcript", this.transcript);
                  this.transcript = "";
                }, 500);
              }
            }
          }
        }
      }
      catch (err) {
        log.error(err);
      }
    })();
  };

  protected onClientUnhandled = (err: unknown): void => {
    log.info(`deepgram_stt/onUnhandled: ${JSON.stringify(err, null, 2)}`);
  };

  protected onClientError = (err: unknown): void => {
    log.info(`deepgram_stt/onDispose: ${JSON.stringify(err, null, 2)}`);
  };

  protected onClientMetaData = (data: unknown): void => {
    log.info(`deepgram_stt/onMetadata: ${JSON.stringify(data, null, 2)}`);
  };

  protected onClientClose = (data: unknown): void => {
    log.info(`deepgram_stt/onClose: ${JSON.stringify(data, null, 2)}`);
  };

  protected onClientOpen = (data: unknown): void => {
    log.info(`deepgram_stt/onOpen: ${JSON.stringify(data, null, 2)}`);
  };

  public onAudio = (audio: string): void => {
    try {
      const buffer = Buffer.from(audio, "base64");
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      if (this.listenLiveClient.isConnected()) {
        this.listenLiveClient.send(arrayBuffer);
        return;
      }
      void (async () => {
        try {
          if (this.queue.length != 0) {
            this.queue.push(arrayBuffer);
            return;
          }
          this.queue.push(arrayBuffer);
          await once(this.listenLiveClient, LiveTranscriptionEvents.Open);
          for (const arrayBuffer of this.queue) {
            this.listenLiveClient.send(arrayBuffer);
          }
          this.queue = [];
        }
        catch (err) {
          log.error(err);
          this.queue = [];
          this.emitter.emit("dispose");
        }
      })();
    }
    catch (err) {
      log.error(err);
      this.emitter.emit("dispose");
    }
  };

  public onDispose = (): void => {
    try {
      if (this.listenLiveClient.isConnected()) {
        this.listenLiveClient.conn?.close();
      }
    }
    catch (err) {
      log.error(err);
    }
    finally {
      this.emitter.removeAllListeners();
    }
  };
}