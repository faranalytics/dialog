import { EventEmitter } from "node:events";
import { once } from "node:events";
import { randomUUID, UUID } from "node:crypto";
import { log } from "../../../commons/logger.js";
import { OpenAI } from "openai";
import { Stream } from "openai/streaming.mjs";
import { Message } from "../../../interfaces/message.js";
import { Agent } from "../../../interfaces/agent.js";
import { OpenAIConversationHistory } from "./types.js";
import { Metadata } from "../../../interfaces/metadata.js";
import { STT } from "../../../interfaces/stt.js";
import { TTS } from "../../../interfaces/tts.js";
import { TwilioVoIP } from "../../voip/twilio/twilio_voip.js";
import { TranscriptStatus } from "../../voip/twilio/types.js";
import { Mutex } from "../../../commons/mutex.js";

export interface OpenAIAgentOptions {
  voip: TwilioVoIP;
  stt: STT;
  tts: TTS;
  apiKey: string;
  system?: string;
  greeting?: string;
  model: string;
}

export abstract class OpenAIAgent implements Agent {
  protected internal: EventEmitter<{ "recording_fetched": [], "transcription_stopped": [] }>;
  protected voip: TwilioVoIP;
  protected metadata?: Metadata;
  protected stt: STT;
  protected tts: TTS;
  protected openAI: OpenAI;
  protected system: string;
  protected greeting: string;
  protected model: string;
  protected history: OpenAIConversationHistory;
  protected stream?: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>;
  protected activeMessages: Set<UUID>;
  protected transcript: unknown[];
  protected dispatches: Set<UUID>;
  protected mutex: Mutex;

  constructor({ apiKey, system, greeting, model, voip, stt, tts }: OpenAIAgentOptions) {
    this.mutex = new Mutex();
    this.dispatches = new Set();
    this.internal = new EventEmitter();
    this.voip = voip;
    this.tts = tts;
    this.stt = stt;
    this.activeMessages = new Set();
    this.openAI = new OpenAI({ "apiKey": apiKey });
    this.system = system ?? "";
    this.greeting = greeting ?? "";
    this.model = model;
    this.transcript = [];
    if (this.system) {
      this.history = [{
        role: "system",
        content: this.system,
      }];
    }
    else {
      this.history = [];
    }
  }

  public abstract inference: (message: Message) => Promise<void>;

  public post = (message: Message): void => {
    if (message.data == "") {
      return;
    }
    this.activeMessages.add(message.uuid);
    this.mutex.call("inference", this.inference, message).catch(this.dispose);
  };

  protected dispatchStream = async (uuid: UUID, stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>, allowInterrupt = true): Promise<string> => {
    try {
      let assistantMessage = "";
      if (!allowInterrupt) {
        this.dispatches.add(uuid);
        const dispatch = this.createDispatch(uuid);
        assistantMessage = await this.postStream(uuid, stream);
        log.notice(`Awaiting dispatch for ${uuid}.`);
        await dispatch;
      }
      else {
        assistantMessage = await this.postStream(uuid, stream);
      }
      return assistantMessage;
    }
    finally {
      if (!allowInterrupt) {
        this.dispatches.delete(uuid);
      }
    }
  };

  protected dispatchMessage = async (message: Message, allowInterrupt = true): Promise<string> => {
    try {
      if (!allowInterrupt) {
        this.dispatches.add(message.uuid);
        const dispatch = this.createDispatch(message.uuid);
        this.tts.post(message);
        log.notice(`Awaiting dispatch for ${message.uuid}.`);
        await dispatch;
      }
      else {
        this.tts.post(message);
      }
      return message.data;
    }
    finally {
      if (!allowInterrupt) {
        this.dispatches.delete(message.uuid);
      }
    }
  };


  protected postStream = async (uuid: UUID, stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>): Promise<string> => {
    let assistantMessage = "";
    for await (const chunk of stream) {
      if (!this.activeMessages.has(uuid)) {
        stream.controller.abort();
        return assistantMessage;
      }
      const content = chunk.choices[0].delta.content ?? "";
      assistantMessage = assistantMessage + content;
      if (chunk.choices[0].finish_reason) {
        this.tts.post({ uuid: uuid, data: content, done: true });
        break;
      }
      if (content) {
        this.tts.post({ uuid: uuid, data: content, done: false });
      }
    }
    return assistantMessage;
  };

  protected createDispatch = (uuid: UUID): Promise<UUID> => {
    const dispatch = new Promise<UUID>((r) => {
      const dispatched = (_uuid: UUID) => {
        if (_uuid == uuid) {
          this.voip.off("message_dispatched", dispatched);
          r(uuid);
        }
      };
      this.voip.on("message_dispatched", dispatched);
    });
    return dispatch;
  };

  public updateMetadata = (metadata: Metadata): void => {
    log.notice(metadata, "OpenAIAgent.updateMetadata");
    if (!this.metadata) {
      this.metadata = metadata;
    }
    else {
      Object.assign(this.metadata, metadata);
    }
  };

  public abort = (): void => {
    log.notice("", "OpenAIAgent.abort");
    for (const uuid of Array.from(this.activeMessages.values())) {
      if (!this.dispatches.has(uuid)) {
        this.tts.abort(uuid);
        this.voip.abort(uuid);
        this.activeMessages.delete(uuid);
      }
    }
  };

  public dispatchInitialMessage = (): void => {
    log.notice("", "OpenAIAgent.dispatchInitialMessage");
    const uuid = randomUUID();
    this.activeMessages.add(uuid);
    this.history.push({ role: "assistant", content: this.greeting, });
    this.dispatchMessage({ uuid: uuid, data: this.greeting, done: true }, false).catch(this.dispose);
  };

  protected deleteActiveMessage = (uuid: UUID): void => {
    this.activeMessages.delete(uuid);
  };

  protected startTranscript = (): void => {
    this.voip.startTranscript().catch(this.dispose);
  };

  protected appendTranscript = (transcriptStatus: TranscriptStatus): void => {
    this.transcript.push(transcriptStatus);
    if (transcriptStatus.TranscriptionEvent == "transcription-stopped") {
      this.internal.emit("transcription_stopped");
    }
  };

  protected startRecording = (): void => {
    this.voip.startRecording().catch(this.dispose);
  };

  protected stopRecording = (): void => {
    this.voip.stopRecording().catch(this.dispose);
  };


  public dispose = (err?: unknown): void => {
    if (err) {
      log.error(err, "OpenAIAgent.dispose");
    }
    if (this.stream) {
      this.stream.controller.abort();
    }
    this.tts.dispose();
    this.stt.dispose();
    this.voip.dispose();
  };

  protected startDisposal = (): void => {
    void (async () => {
      try {
        await Promise.allSettled([once(this.internal, "recording_fetched"), once(this.internal, "transcription_stopped")]);
        this.dispose();
        log.notice("OpenAIAgent disposed.");
      }
      catch (err) {
        log.error(err);
      }
    })();
  };

  public activate(): void {
    this.voip.on("error", this.dispose);
    this.voip.on("message", this.stt.post);
    this.voip.on("streaming_started", this.startRecording);
    this.voip.on("streaming_started", this.startTranscript);
    this.voip.on("streaming_started", this.dispatchInitialMessage);
    this.voip.on("streaming_started", this.startDisposal);
    this.voip.on("streaming_stopped", this.stopRecording);
    this.voip.on("transcript", this.appendTranscript);
    this.voip.on("metadata", this.updateMetadata);
    this.voip.on("message_dispatched", this.deleteActiveMessage);
    this.stt.on("message", this.post);
    this.stt.on("vad", this.abort);
    this.stt.on("error", this.dispose);
    this.tts.on("message", this.voip.post);
    this.tts.on("error", this.dispose);
  };

  public deactivate(): void {
    this.voip.off("error", this.dispose);
    this.voip.off("message", this.stt.post);
    this.voip.off("streaming_started", this.startRecording);
    this.voip.off("streaming_started", this.startTranscript);
    this.voip.off("streaming_started", this.dispatchInitialMessage);
    this.voip.off("streaming_started", this.startDisposal);
    this.voip.off("streaming_stopped", this.stopRecording);
    this.voip.off("transcript", this.appendTranscript);
    this.voip.off("metadata", this.updateMetadata);
    this.voip.off("message_dispatched", this.deleteActiveMessage);
    this.stt.off("message", this.post);
    this.stt.off("vad", this.abort);
    this.stt.off("error", this.dispose);
    this.tts.off("message", this.voip.post);
    this.tts.off("error", this.dispose);
  };
}
