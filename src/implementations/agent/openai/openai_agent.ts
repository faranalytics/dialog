import { randomUUID, UUID } from "node:crypto";
import { log } from "../../../commons/logger.js";
import { OpenAI } from "openai";
import { Stream } from "openai/streaming.mjs";
import { TwilioSession } from "../../session/twilio_session.js";
import { UserTranscriptMessage } from "../../../commons/types.js";

export type OpenAIConversationHistory = { role: "system" | "assistant" | "user" | "developer", content: string }[];

export interface OpenAIAgentOptions {
  apiKey: string;
  system?: string;
  greeting?: string;
  session: TwilioSession;
  model: string;
}

export class OpenAIAgent {

  protected openAI: OpenAI;
  protected system: string;
  protected greeting: string;
  protected model: string;
  protected turnUUIDs: Set<UUID>;
  protected uuid?: UUID;
  protected history: OpenAIConversationHistory;
  protected stream?: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>;
  protected session: TwilioSession;
  protected mutex: Promise<void>;

  constructor({ apiKey, system, greeting, model, session }: OpenAIAgentOptions) {
    this.openAI = new OpenAI({ "apiKey": apiKey });
    this.session = session;
    this.system = system ?? "";
    this.greeting = greeting ?? "";
    this.model = model;
    this.turnUUIDs = new Set();
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

    this.session.on("user_transcript_message", this.onUserTranscriptMessage);
  }

  public onUserTranscriptMessage = (message: UserTranscriptMessage): void => {
    this.mutex = (async () => {

      await this.mutex;

      const transcript = message.data;

      if (transcript == "") {
        return;
      }

      this.turnUUIDs.add(message.id);

      const stream = await this.openAI.chat.completions.create({
        model: this.model,
        messages: this.history,
        temperature: 0,
        stream: true
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0].delta.content;
        if (content) {
          if (chunk.choices[0].finish_reason) {
            this.session.emit("agent_transcript_message", { id: message.id, data: content, finished: true });
            return;
          }
          this.session.emit("agent_transcript_message", { id: message.id, data: content, finished: false });
        }
      }
    })();

  };

  public onMessageDispatched = (uuid: UUID): void => {
    this.turnUUIDs.delete(uuid);
  };

  // public onUpdateMetadata = (metadata: Metadata): void => {
  //   if (this.metadata) {
  //     Object.assign(this.metadata, metadata);
  //   } else {
  //     this.metadata = metadata;
  //   }
  //   log.info(this.metadata);
  // };

  public onStreaming = (): void => {
    if (this.greeting) {
      log.notice(`Assistant message: ${this.greeting}`);
      this.history.push({ role: "assistant", content: this.greeting });
      this.session.emit("agent_transcript_message", { id: randomUUID(), data: this.greeting, finished: true });
    }
  };

  public onVAD = (): void => {

  };

  public onDispose = (): void => {
    if (this.stream) {
      this.stream.controller.abort();
    }
  };
}