import * as http from "node:http";
import * as https from "node:https";
import * as fs from "node:fs";
import { EventEmitter } from "node:events";
import { once } from "node:events";
import { randomUUID, UUID } from "node:crypto";
import { log } from "../../../commons/logger.js";
import { OpenAI } from "openai";
import { Stream } from "openai/streaming.mjs";
import { Message } from "../../../interfaces/message.js";
import { Agent } from "../../../interfaces/agent.js";
import { OpenAIConversationHistory } from "./types.js";
import { Metadata } from "../../../interfaces/voip.js";
import { STT } from "../../../interfaces/stt.js";
import { TTS } from "../../../interfaces/tts.js";
import { TwilioVoIP } from "../../voip/twilio/twilio_voip.js";
import { TranscriptStatus } from "../../voip/twilio/types.js";

export interface OpenAIAgentOptions {
  voip: TwilioVoIP;
  stt: STT;
  tts: TTS;
  apiKey: string;
  system?: string;
  greeting?: string;
  model: string;
}

export class OpenAIAgent implements Agent {
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
  protected mutex: Promise<void>;
  protected transcript: unknown[];

  constructor({ apiKey, system, greeting, model, voip, stt, tts }: OpenAIAgentOptions) {
    this.internal = new EventEmitter();
    this.voip = voip;
    this.tts = tts;
    this.stt = stt;
    this.activeMessages = new Set();
    this.openAI = new OpenAI({ "apiKey": apiKey });
    this.system = system ?? "";
    this.greeting = greeting ?? "";
    this.model = model;
    this.mutex = Promise.resolve();
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

  public postUserTranscriptMessage = (message: Message): void => {
    if (message.data == "") {
      return;
    }
    this.activeMessages.add(message.uuid);
    this.mutex = (async () => {
      try {
        await this.mutex;

        log.notice(`User message: ${message.data}`);

        this.history.push({ role: "user", content: message.data });

        if (!this.activeMessages.has(message.uuid)) {
          return;
        }

        const stream = await this.openAI.chat.completions.create({
          model: this.model,
          messages: this.history,
          temperature: 0,
          stream: true
        });

        await this.postAgentStreamToTTS(message.uuid, stream);
      }
      catch (err) {
        log.error(err, "OpenAIAgent.postUserTranscriptMessage");
      }
    })();
  };

  protected dispatchAgentStream = async (uuid: UUID, stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>, allowInterrupt = true): Promise<UUID> => {
    if (!this.activeMessages.has(uuid)) {
      return uuid;
    }
    if (!allowInterrupt) {
      this.stt.off("vad", this.interruptAgent);
    }
    const dispatch = this.createDispatchForUUID(uuid);
    await this.postAgentStreamToTTS(uuid, stream);
    const _uuid = await dispatch;
    if (!allowInterrupt) {
      this.stt.on("vad", this.interruptAgent);
    }
    return _uuid;
  };

  protected dispatchAgentMessage = async (message: Message, allowInterrupt = true): Promise<UUID> => {
    if (!allowInterrupt) {
      this.stt.off("vad", this.interruptAgent);
    }
    const dispatch = this.createDispatchForUUID(message.uuid);
    log.notice(`Assistant message: ${this.greeting}`);
    this.history.push({ role: "assistant", content: message.data });
    this.tts.postAgentMessage(message);
    const uuid = await dispatch;
    if (!allowInterrupt) {
      this.stt.on("vad", this.interruptAgent);
    }
    return uuid;
  };

  protected postAgentStreamToTTS = async (uuid: UUID, stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>): Promise<void> => {
    let assistantMessage = "";
    for await (const chunk of stream) {
      const content = chunk.choices[0].delta.content;
      if (content) {
        assistantMessage = assistantMessage + content;
        if (chunk.choices[0].finish_reason) {
          if (this.activeMessages.has(uuid)) {
            this.tts.postAgentMessage({ uuid: uuid, data: content, done: true });
          }
          break;
        }
        if (this.activeMessages.has(uuid)) {
          this.tts.postAgentMessage({ uuid: uuid, data: content, done: false });
        }
      }
    }
    log.notice(`Assistant message: ${assistantMessage}`);
    this.history.push({ role: "assistant", content: assistantMessage });
  };

  protected createDispatchForUUID = (uuid: UUID): Promise<UUID> => {
    const dispatch = new Promise<UUID>((r) => {
      const dispatched = (_uuid: UUID) => {
        if (_uuid == uuid) {
          this.voip.off("agent_message_dispatched", dispatched);
          r(uuid);
        }
      };
      this.voip.on("agent_message_dispatched", dispatched);
    });
    return dispatch;
  };

  public updateMetadata = (metadata: Metadata): void => {
    log.notice(metadata, "OpenAIAgent.postUpdateMetadata");
    if (!this.metadata) {
      this.metadata = metadata;
    }
    else {
      Object.assign(this.metadata, metadata);
    }
  };

  public interruptAgent = (): void => {
    log.notice("", "OpenAIAgent.postVAD");
    for (const uuid of Array.from(this.activeMessages.values())) {
      this.tts.abortMessage(uuid);
      this.activeMessages.delete(uuid);
    }
    this.voip.abortMedia();
  };

  public dispatchInitialMessage = (): void => {
    void (async () => {
      try {
        await this.dispatchAgentMessage({ uuid: randomUUID(), data: this.greeting, done: true });
      } catch (err) {
        log.error(err);
      }
    })();
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

  protected fetchRecording = (recordingURL: string): void => {
    void (async () => {
      try {
        const response = await new Promise<http.IncomingMessage>((r, e) => https.request(recordingURL, { method: "POST" }, r).on("error", e).end());
        const writeStream = fs.createWriteStream("./recording.wav");
        response.pipe(writeStream);
      }
      catch (err) {
        log.error(err);
      }
    })();
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
        console.log(this.transcript);
      }
      catch (err) {
        log.error(err);
      }
    })();
  };

  public activate = (): void => {
    this.voip.on("error", this.dispose);
    this.voip.on("user_media_message", this.stt.postUserMediaMessage);
    this.voip.on("started", this.startRecording);
    this.voip.on("started", this.startTranscript);
    this.voip.on("started", this.dispatchInitialMessage);
    this.voip.on("started", this.startDisposal);
    this.voip.on("stopped", this.stopRecording);
    this.voip.on("recording", this.fetchRecording);
    this.voip.on("transcript", this.appendTranscript);
    this.voip.on("metadata", this.updateMetadata);
    this.voip.on("agent_message_dispatched", this.deleteActiveMessage);
    this.stt.on("user_transcript_message", this.postUserTranscriptMessage);
    this.stt.on("vad", this.interruptAgent);
    this.stt.on("error", this.dispose);
    this.tts.on("agent_media_message", this.voip.postAgentMediaMessage);
    this.tts.on("error", this.dispose);
  };

  public deactivate = (): void => {
    this.voip.off("error", this.dispose);
    this.voip.off("user_media_message", this.stt.postUserMediaMessage);
    this.voip.off("started", this.startRecording);
    this.voip.off("started", this.startTranscript);
    this.voip.off("started", this.dispatchInitialMessage);
    this.voip.off("stopped", this.stopRecording);
    this.voip.off("recording", this.fetchRecording);
    this.voip.off("transcript", this.appendTranscript);
    this.voip.off("metadata", this.updateMetadata);
    this.voip.off("agent_message_dispatched", this.deleteActiveMessage);
    this.stt.off("user_transcript_message", this.postUserTranscriptMessage);
    this.stt.off("vad", this.interruptAgent);
    this.stt.off("error", this.dispose);
    this.tts.off("agent_media_message", this.voip.postAgentMediaMessage);
    this.tts.off("error", this.dispose);
  };
}