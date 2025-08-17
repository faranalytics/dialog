import { randomUUID } from "node:crypto";
import { log } from "../../../commons/logger.js";
import { OpenAI } from "openai";
import { Stream } from "openai/streaming.mjs";
import { Message } from "../../../interfaces/message.js";
import { TwilioSession } from "../../voip/twilio/twilio_session.js";
import { DeepgramSTT } from "../../stt/deepgram/deepgram_stt.js";
import { CartesiaTTS } from "../../tts/cartesia/cartesia_tts.js";

export type OpenAIConversationHistory = { role: "system" | "assistant" | "user" | "developer", content: string }[];

export interface OpenAIAgentOptions {
  session: TwilioSession;
  stt: DeepgramSTT;
  tts: CartesiaTTS;
  apiKey: string;
  system?: string;
  greeting?: string;
  model: string;
}

export class OpenAIAgent {

  protected session: TwilioSession;
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

    this.session.on("user_message", this.stt.postUserMessage);
    this.session.on("started", this.postStarted);
    this.stt.on("user_message", this.postUserTranscriptMessage);
    this.stt.on("error", log.error);
    this.tts.on("agent_message", this.postAgentMediaMessage);
    this.tts.on("error", log.error);
  }

  public postUserTranscriptMessage = (message: Message): void => {
    this.mutex = (async () => {
      await this.mutex;

      const transcript = message.data;

      if (transcript == "") {
        return;
      }



      this.history.push({ role: "user", content: transcript });
      log.notice(`User message: ${transcript}`);
      const stream = await this.openAI.chat.completions.create({
        model: this.model,
        messages: this.history,
        temperature: 0,
        stream: true
      });

      let assistantMessage = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0].delta.content;
        if (content) {
          assistantMessage = assistantMessage + content;
          if (chunk.choices[0].finish_reason) {
            this.tts.postAgentMessage({ uuid: message.uuid, data: content, done: true });
            return;
          }
          this.tts.postAgentMessage({ uuid: message.uuid, data: content, done: false });
        }
      }

      this.history.push({ role: "assistant", content: assistantMessage });
      log.notice(`Assistant message: ${assistantMessage}`);
    })();

  };

  protected postAgentMediaMessage = (message: Message): void => {
    log.debug(message, "OpenAIAgent.postAgentMediaMessage");
    this.session.emit("agent_message", message);
  };

  public postUpdateMetadata = (metadata: unknown): void => {
    log.notice(metadata, "OpenAIAgent.postUpdateMetadata");
    Object.assign(this.session.metadata, metadata);
  };

  public postStarted = (): void => {
    log.notice("", "OpenAIAgent.postStarted");
    if (this.greeting) {
      log.notice(`Assistant message: ${this.greeting}`);
      this.history.push({ role: "assistant", content: this.greeting });
      this.tts.postAgentMessage({ uuid: randomUUID(), data: this.greeting, done: true });
    }
  };

  public postVAD = (): void => {
    log.notice("", "OpenAIAgent.postVAD");
  };

  public dispose = (): void => {
    log.info("", "OpenAIAgent.dispose");
    if (this.stream) {
      this.stream.controller.abort();
    }
  };
}