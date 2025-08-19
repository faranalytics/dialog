import { log } from "../../../commons/logger.js";
import EventEmitter, { once } from "node:events";
import { createClient, ListenLiveClient, LiveSchema, LiveTranscriptionEvents } from "@deepgram/sdk";
import { isResultsMessage, isSpeechStartedMessage, isUtteranceEndMessage, LiveClientMessage } from "./types.js";
import { randomUUID } from "node:crypto";
import { Message } from "../../../interfaces/message.js";
import { STT, STTEvents } from "../../../interfaces/stt.js";
import { Queue } from "../../../commons/queue.js";

export interface DeepgramSTTOptions {
  apiKey: string;
  liveSchema: LiveSchema;
}

export class DeepgramSTT extends EventEmitter<STTEvents> implements STT {

  protected listenLiveClient: ListenLiveClient;
  protected transcript: string;
  protected queue: Queue<Message>;
  protected speechStarted: boolean;
  protected liveSchema: LiveSchema;
  protected apiKey: string;
  constructor({ apiKey, liveSchema }: DeepgramSTTOptions) {
    super();
    this.apiKey = apiKey;
    this.queue = new Queue();
    this.transcript = "";
    this.speechStarted = false;
    this.liveSchema = liveSchema;

    this.listenLiveClient = this.createConnection();
  }

  protected createConnection(): ListenLiveClient {
    const client = createClient(this.apiKey);
    const listenLiveClient = client.listen.live(this.liveSchema);
    listenLiveClient.on(LiveTranscriptionEvents.Open, this.onClientOpen);
    listenLiveClient.on(LiveTranscriptionEvents.Close, this.onClientClose);
    listenLiveClient.on(LiveTranscriptionEvents.Transcript, this.onClientMessage);
    listenLiveClient.on(LiveTranscriptionEvents.SpeechStarted, this.onClientMessage);
    listenLiveClient.on(LiveTranscriptionEvents.UtteranceEnd, this.onClientMessage);
    listenLiveClient.on(LiveTranscriptionEvents.Metadata, this.onClientMetaData);
    listenLiveClient.on(LiveTranscriptionEvents.Error, this.onClientError);
    listenLiveClient.on(LiveTranscriptionEvents.Unhandled, this.onClientUnhandled);
    return listenLiveClient;
  }

  protected onClientMessage = (message: LiveClientMessage): void => {
    try {
      log.notice(message, "DeepgramSTT.onClientMessage");
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
      if (this.listenLiveClient.conn?.readyState == 1) {
        const buffer = Buffer.from(message.data, "base64");
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        this.listenLiveClient.send(arrayBuffer);
        return;
      }

      this.queue.enqueue(message);
      if (this.queue.sentry) {
        return;
      }
      this.queue.sentry = true;

      void (async () => {
        try {
          if (this.listenLiveClient.conn?.readyState == 2 || this.listenLiveClient.conn?.readyState == 3) {
            this.listenLiveClient = this.createConnection();
          }
          await once(this.listenLiveClient, LiveTranscriptionEvents.Open);
          while (this.queue.size()) {
            const message = this.queue.dequeue();
            const buffer = Buffer.from(message.data, "base64");
            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            this.listenLiveClient.send(arrayBuffer);
          }
        }
        catch (err) {
          log.error(err, "DeepgramSTT.postUserMediaMessage");
        }
        finally {
          this.queue.sentry = false;
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