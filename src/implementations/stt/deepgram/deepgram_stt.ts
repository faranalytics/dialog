import { log } from "../../../commons/logger.js";
import EventEmitter, { once } from "node:events";
import { createClient, DeepgramClient, ListenLiveClient, LiveSchema, LiveTranscriptionEvents } from "@deepgram/sdk";
import { isResultsMessage, isSpeechStartedMessage, isUtteranceEndMessage, LiveClientMessage } from "./types.js";
import { randomUUID } from "node:crypto";
import { Message } from "../../../interfaces/message.js";
import { STT, STTEvents } from "../../../interfaces/stt.js";

export interface DeepgramSTTOptions {
  apiKey: string;
  liveSchema?: LiveSchema;
}

export class DeepgramSTT extends EventEmitter<STTEvents> implements STT {

  protected listenLiveClient: ListenLiveClient;
  protected transcript: string;
  protected client: DeepgramClient;
  protected queue: ArrayBuffer[];
  protected speechStarted: boolean;
  protected liveSchema: LiveSchema;

  constructor({ apiKey, liveSchema }: DeepgramSTTOptions) {
    super();
    this.transcript = "";
    this.queue = [];
    this.speechStarted = false;
    this.client = createClient(apiKey);
    this.liveSchema = liveSchema ?? {};

    this.listenLiveClient = this.client.listen.live({
      ...{
        model: "nova-3",
        language: "en-US",
        channels: 1,
        encoding: "mulaw",
        sample_rate: 8000,
        endpointing: 500,
        interim_results: true,
        utterance_end_ms: 1000,
        vad_events: true
      }, ...this.liveSchema
    });

    this.listenLiveClient.on(LiveTranscriptionEvents.Open, this.postClientOpen);
    this.listenLiveClient.on(LiveTranscriptionEvents.Close, this.postClientClose);
    this.listenLiveClient.on(LiveTranscriptionEvents.Transcript, this.postClientMessage);
    this.listenLiveClient.on(LiveTranscriptionEvents.SpeechStarted, this.postClientMessage);
    this.listenLiveClient.on(LiveTranscriptionEvents.UtteranceEnd, this.postClientMessage);
    this.listenLiveClient.on(LiveTranscriptionEvents.Metadata, this.postClientMetaData);
    this.listenLiveClient.on(LiveTranscriptionEvents.Error, this.postClientError);
    this.listenLiveClient.on(LiveTranscriptionEvents.Unhandled, this.postClientUnhandled);
  }

  protected postClientMessage = (message: LiveClientMessage): void => {
    try {
      log.debug(message, "DeepgramSTT.postClientMessage");
      if (isSpeechStartedMessage(message)) {
        this.speechStarted = true;
      }
      else if (isResultsMessage(message)) {
        const transcript = message.channel.alternatives[0].transcript.trim();
        if (transcript == "") {
          return;
        }
        if (this.speechStarted) {
          this.emit("vad");
          this.speechStarted = false;
        }
        if (!message.is_final) {
          return;
        }
        this.transcript = this.transcript == "" ? transcript : this.transcript + " " + transcript;
        if (message.speech_final) {
          log.notice("Using speech_final.");
          this.emit("user_message", { uuid: randomUUID(), data: this.transcript, done:true });
          this.transcript = "";
        }
      }
      else if (isUtteranceEndMessage(message)) {
        if (this.transcript != "") {
          log.notice("Using UtteranceEndMessage.");
          this.emit("user_message", { uuid: randomUUID(), data: this.transcript, done:true});
          this.transcript = "";
        }
      }
    }
    catch (err) {
      log.error(err);
    }
  };

  protected postClientUnhandled = (...args: unknown[]): void => {
    log.warn(args, "DeepgramSTT.postClientUnhandled");
  };

  protected postClientError = (err: unknown): void => {
    log.error(err, "DeepgramSTT.postClientError");
    this.emit("error", err);
  };

  protected postClientMetaData = (...args: unknown[]): void => {
    log.notice(args, "DeepgramSTT.postClientMetaData");
  };

  protected postClientClose = (...args: unknown[]): void => {
    log.info(args, "DeepgramSTT.postClientClose");
  };

  protected postClientOpen = (...args: unknown[]): void => {
    log.info(args, "DeepgramSTT.postClientOpen");
  };

  public postUserMessage = (message: Message): void => {
    try {
      const buffer = Buffer.from(message.data, "base64");
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
        }
      })();
    }
    catch (err) {
      log.error(err);
    }
  };

  public dispose(): void {
    if (this.listenLiveClient.isConnected()) {
      this.listenLiveClient.conn?.close();
    }
  };
}