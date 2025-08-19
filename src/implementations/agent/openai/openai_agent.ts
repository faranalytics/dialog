import { randomUUID, UUID } from "node:crypto";
import { log } from "../../../commons/logger.js";
import { OpenAI } from "openai";
import { Stream } from "openai/streaming.mjs";
import { Message } from "../../../interfaces/message.js";
import { Agent } from "../../../interfaces/agent.js";
import { OpenAIConversationHistory } from "./types.js";
import { VoIP, Metadata } from "../../../interfaces/voip.js";
import { STT } from "../../../interfaces/stt.js";
import { TTS } from "../../../interfaces/tts.js";

export interface OpenAIAgentOptions {
  voip: VoIP;
  stt: STT;
  tts: TTS;
  apiKey: string;
  system?: string;
  greeting?: string;
  model: string;
}

export class OpenAIAgent implements Agent {

  protected voip: VoIP;
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

  constructor({ apiKey, system, greeting, model, voip, stt, tts }: OpenAIAgentOptions) {
    this.voip = voip;
    this.tts = tts;
    this.stt = stt;
    this.activeMessages = new Set();
    this.openAI = new OpenAI({ "apiKey": apiKey });
    this.system = system ?? "";
    this.greeting = greeting ?? "";
    this.model = model;
    this.mutex = Promise.resolve();
    if (this.system) {
      this.history = [{
        role: "system",
        content: this.system,
      }];
    }
    else {
      this.history = [];
    }

    this.voip.on("error", log.error);
    this.stt.on("error", log.error);
    this.tts.on("error", log.error);
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

        await this.dispatchMessage(message.uuid, stream);
      }
      catch (err) {
        log.error(err, "OpenAIAgent.postUserTranscriptMessage");
      }
    })();
  };

  protected async dispatchMessage(uuid: UUID, stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>, awaitDispatch = false): Promise<UUID> {
    if (!this.activeMessages.has(uuid)) {
      return uuid;
    }
    
    if (awaitDispatch) {
      const dispatched = new Promise<UUID>((r) => {
        const dispatched = (_uuid: UUID) => {
          if (_uuid == uuid) {
            this.voip.off("agent_message_dispatched", dispatched);
            r(uuid);
          }
        };
        this.voip.on("agent_message_dispatched", dispatched);
      });

      await this.processStream(uuid, stream);

      return dispatched;
    }
    
    await this.processStream(uuid, stream);
    return uuid;
  }

  protected async processStream(uuid: UUID, stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>): Promise<void> {
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
  }

  protected postAgentMediaMessage = (message: Message): void => {
    log.debug(message, "OpenAIAgent.postAgentMediaMessage");
    this.voip.postAgentMediaMessage(message);
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

  public sendGreeting = (): void => {
    log.notice("", "OpenAIAgent.sendGreeting");
    if (this.greeting) {
      log.notice(`Assistant message: ${this.greeting}`);
      this.history.push({ role: "assistant", content: this.greeting });
      this.tts.postAgentMessage({ uuid: randomUUID(), data: this.greeting, done: true });
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

  public dispose(): void {
    log.info("", "OpenAIAgent.dispose");
    if (this.stream) {
      this.stream.controller.abort();
    }
    this.tts.dispose();
    this.stt.dispose();
    this.voip.dispose();
  }

  public activate(): void {
    this.voip.on("user_media_message", this.stt.postUserMediaMessage);
    this.voip.on("started", this.sendGreeting);
    this.voip.on("metadata", this.updateMetadata);
    this.stt.on("user_message", this.postUserTranscriptMessage);
    this.stt.on("vad", this.interruptAgent);
    this.tts.on("agent_media_message", this.postAgentMediaMessage);
  }

  public deactivate(): void {
    this.voip.off("user_media_message", this.stt.postUserMediaMessage);
    this.voip.off("started", this.sendGreeting);
    this.voip.off("metadata", this.updateMetadata);
    this.stt.off("user_message", this.postUserTranscriptMessage);
    this.stt.off("vad", this.interruptAgent);
    this.tts.off("agent_media_message", this.postAgentMediaMessage);
  }
}