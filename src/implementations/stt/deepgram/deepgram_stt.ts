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
        model: "nova-2",
        language: "multi",
        channels: 1,
        encoding: "mulaw",
        sample_rate: 8000,
        endpointing: 500,
        interim_results: true,
        utterance_end_ms: 1000,
        vad_events: true
      }, ...this.liveSchema
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

  protected onClientMessage = (message: LiveClientMessage): void => {
    try {
      log.debug(message, "DeepgramSTT.onClientMessage");
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
          this.emit("vad");
          log.notice("Using speech_final.", "DeepgramSTT.onClientMessage");
          this.emit("user_message", { uuid: randomUUID(), data: this.transcript, done: true });
          this.transcript = "";
        }
      }
      else if (isUtteranceEndMessage(message) && this.transcript != "") {
        this.emit("vad");
        log.notice("Using UtteranceEndMessage", "DeepgramSTT.onClientMessage");
        this.emit("user_message", { uuid: randomUUID(), data: this.transcript, done: true });
        this.transcript = "";
      }
    }
    catch (err) {
      log.error(err, "DeepgramSTT.onClientMessage");
    }
  };

  protected onClientUnhandled = (...args: unknown[]): void => {
    try {
      log.warn(args, "DeepgramSTT.onClientUnhandled");
    }
    catch (err) {
      log.error(err, "DeepgramSTT.onClientUnhandled");
    }
  };

  protected onClientError = (err: unknown): void => {
    try {
      log.error(err, "DeepgramSTT.onClientError");
    }
    catch (err) {
      log.error(err, "DeepgramSTT.onClientError");
    }
  };

  protected onClientMetaData = (...args: unknown[]): void => {
    try {
      log.notice(args, "DeepgramSTT.onClientMetaData");
    }
    catch (err) {
      log.error(err, "DeepgramSTT.onClientMetaData");
    }
  };

  protected onClientClose = (...args: unknown[]): void => {
    try {
      log.info(args, "DeepgramSTT.onClientClose");
    }
    catch (err) {
      log.error(err, "DeepgramSTT.onClientClose");
    }
  };

  protected onClientOpen = (...args: unknown[]): void => {
    try {
      log.info(args, "DeepgramSTT.onClientOpen");
    }
    catch (err) {
      log.error(err, "DeepgramSTT.onClientOpen");
    }
  };

  public postUserMediaMessage = (message: Message): void => {
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
      log.error(err, "DeepgramSTT.postUserMediaMessage");
    }
  };

  public dispose(): void {
    if (this.listenLiveClient.isConnected()) {
      this.listenLiveClient.conn?.close();
    }
    this.removeAllListeners();
  };
}