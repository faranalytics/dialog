import { randomUUID, UUID } from "node:crypto";
import { log } from "../../../commons/logger.js";
import { OpenAI } from "openai";
import { Stream } from "openai/streaming.mjs";
import { Message } from "../../../interfaces/message.js";
import { DeepgramSTT } from "../../stt/deepgram/deepgram_stt.js";
import { CartesiaTTS } from "../../tts/cartesia/cartesia_tts.js";
import { Agent } from "../../../interfaces/agent.js";
import { OpenAIConversationHistory } from "./types.js";
import { VoIPSession, VoIPSessionMetadata } from "../../../interfaces/voip_session.js";

export interface OpenAIAgentOptions {
  session: VoIPSession;
  stt: DeepgramSTT;
  tts: CartesiaTTS;
  apiKey: string;
  system?: string;
  greeting?: string;
  model: string;
}

export class OpenAIAgent implements Agent {

  protected session: VoIPSession;
  protected metadata?: VoIPSessionMetadata;
  protected stt: DeepgramSTT;
  protected tts: CartesiaTTS;
  protected openAI: OpenAI;
  protected system: string;
  protected greeting: string;
  protected model: string;
  protected history: OpenAIConversationHistory;
  protected stream?: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>;
  protected mutex: Promise<void>;

  constructor({ apiKey, system, greeting, model, session, stt, tts }: OpenAIAgentOptions) {
    this.session = session;
    this.session.on("transcript", () => { });
    this.tts = tts;
    this.stt = stt;
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

    this.stt.on("error", log.error);
    this.tts.on("error", log.error);
  }

  public postUserTranscriptMessage = (message: Message): void => {
    this.mutex = (async () => {
      try {
        await this.mutex;

        const transcript = message.data;
        if (transcript == "") {
          return;
        }

        log.notice(`User message: ${transcript}`);
        this.history.push({ role: "user", content: transcript });
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

  protected async dispatchMessage(uuid: UUID, stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>): Promise<UUID> {
    const dispatched = new Promise<UUID>((r) => {
      const fn = (_uuid: UUID) => {
        if (_uuid == uuid) {
          this.session.off("agent_message_dispatched", fn);
          r(uuid);
        }
      };
      this.session.on("agent_message_dispatched", fn);
    });

    let assistantMessage = "";
    for await (const chunk of stream) {
      const content = chunk.choices[0].delta.content;
      if (content) {
        assistantMessage = assistantMessage + content;
        if (chunk.choices[0].finish_reason) {
          this.tts.postAgentMessage({ uuid: uuid, data: content, done: true });
          break;
        }
        this.tts.postAgentMessage({ uuid: uuid, data: content, done: false });
      }
    }
    log.notice(`Assistant message: ${assistantMessage}`);
    this.history.push({ role: "assistant", content: assistantMessage });

    return dispatched;
  }

  protected postAgentMediaMessage = (message: Message): void => {
    log.debug(message, "OpenAIAgent.postAgentMediaMessage");
    this.session.emit("agent_message", message);
  };

  public updateMetadata = (metadata: VoIPSessionMetadata): void => {
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
    this.session.emit("agent_abort_media");
  };

  public dispose(): void {
    log.info("", "OpenAIAgent.dispose");
    if (this.stream) {
      this.stream.controller.abort();
    }
    this.tts.dispose();
    this.stt.dispose();
  };

  public activate(): void {
    this.session.on("user_message", this.stt.postUserMessage);
    this.session.on("started", this.sendGreeting);
    this.session.on("session_metadata", this.updateMetadata);
    this.stt.on("user_message", this.postUserTranscriptMessage);
    this.stt.on("vad", this.interruptAgent);
    this.tts.on("agent_message", this.postAgentMediaMessage);
  }

  public deactivate(): void {
    this.session.off("user_message", this.stt.postUserMessage);
    this.session.off("started", this.sendGreeting);
    this.session.off("session_metadata", this.updateMetadata);
    this.stt.off("user_message", this.postUserTranscriptMessage);
    this.stt.off("vad", this.interruptAgent);
    this.tts.off("agent_message", this.postAgentMediaMessage);
  }
}