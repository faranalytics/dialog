import { log } from "../../../commons/logger.js";
import { once, EventEmitter } from "node:events";
import { createClient, DeepgramClient, ListenLiveClient, LiveSchema, LiveTranscriptionEvents } from "@deepgram/sdk";
import { STT, STTEvents } from "../../../interfaces/stt.js";
import { Message, ResultsMessage, SpeechStartedMessage, UtteranceEndMessage } from "./types.js";

export interface DeepgramSTTOptions {
  apiKey: string;
  transcriptionOptions?: LiveSchema;
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
  protected speechStarted: boolean;
  protected mutex: Promise<void> = Promise.resolve();
  protected transcriptionOptions: LiveSchema;

  constructor({ apiKey, transcriptionOptions, endpoint }: DeepgramSTTOptions) {
    this.transcript = "";
    this.queue = [];
    this.emitter = new EventEmitter();
    this.endpoint = endpoint;
    this.speechStarted = false;
    this.client = createClient(apiKey);
    this.transcriptionOptions = transcriptionOptions ?? {};

    this.listenLiveClient = this.client.listen.live({
      ...{
        model: "nova-3",
        language: "en-US",
        // punctuate: true,
        // smart_format: true,
        channels: 1,
        encoding: "mulaw",
        sample_rate: 8000,
        endpointing: 500,
        interim_results: true,
        utterance_end_ms: 2500,
        vad_events: true
      }, ...this.transcriptionOptions
    });

    this.listenLiveClient.on(LiveTranscriptionEvents.Open, this.onClientOpen);
    this.listenLiveClient.on(LiveTranscriptionEvents.Close, this.onClientClose);
    this.listenLiveClient.on(LiveTranscriptionEvents.Transcript, this.onClientMessage);
    this.listenLiveClient.on(LiveTranscriptionEvents.SpeechStarted, this.onClientMessage);
    this.listenLiveClient.on(LiveTranscriptionEvents.UtteranceEnd, this.onClientMessage);
    this.listenLiveClient.on(LiveTranscriptionEvents.Metadata, this.onClientMetaData);
    this.listenLiveClient.on(LiveTranscriptionEvents.Error, this.onClientError);
    this.listenLiveClient.on(LiveTranscriptionEvents.Unhandled, this.onClientUnhandled);
  }

  protected onClientMessage = (message: Message): void => {
    this.mutex = (async () => {
      try {
        await this.mutex;
        log.debug(message, "DeepgramSTT.onClientMessage");
        if (this.isSpeechStartedMessage(message)) {
          this.speechStarted = true;
        }
        else if (this.isResultsMessage(message)) {
          if (!message.is_final) {
            return;
          }
          const transcript = message.channel.alternatives[0].transcript.trim();
          if (transcript == "") {
            return;
          }
          if (this.speechStarted) {
            this.emitter.emit("vad");
            this.speechStarted = false;
          }
          this.transcript = this.transcript == "" ? transcript : this.transcript + " " + transcript;
          if (this.endpoint) {
            if (await this.endpoint(this.transcript) && message.speech_final) {
              log.info("Using contextual endpoint and speech_final.");
              this.emitter.emit("transcript", this.transcript);
              this.transcript = "";
            }
          }
          else if (message.speech_final) {
            log.info("Using speech_final.");
            this.emitter.emit("transcript", this.transcript);
            this.transcript = "";
          }
        }
        else if (this.isUtteranceEndMessage(message)) {
          if (this.transcript != "") {
            console.log("Using UtteranceEndMessage.");
            this.emitter.emit("transcript", this.transcript);
            this.transcript = "";
          }
        }
      }
      catch (err) {
        log.error(err);
      }
    })();
  };

  protected onClientUnhandled = (err: unknown): void => {
    log.debug(err);
  };

  protected onClientError = (err: unknown): void => {
    log.debug(err);
  };

  protected onClientMetaData = (data: unknown): void => {
    log.debug(data);
  };

  protected onClientClose = (data: unknown): void => {
    log.debug(data);
  };

  protected onClientOpen = (data: unknown): void => {
    log.debug(data);
  };

  public onMedia = (media: string): void => {
    try {
      const buffer = Buffer.from(media, "base64");
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

  public isResultsMessage = (message: Message): message is ResultsMessage => {
    return message.type == "Results";
  };

  public isSpeechStartedMessage = (message: Message): message is SpeechStartedMessage => {
    return message.type == "SpeechStarted";
  };

  public isUtteranceEndMessage = (message: Message): message is UtteranceEndMessage => {
    return message.type == "UtteranceEnd";
  };
}