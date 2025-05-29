import { randomUUID, UUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { log } from "../../../commons/logger.js";
import { OpenAI } from "openai";
import { Metadata } from "../../../commons/metadata.js";
import { Agent, AgentEvents } from "../../../interfaces/agent.js";
import { Stream } from "openai/streaming.mjs";
import { Dialog } from "../../../commons/dialog.js";

export interface OpenAIAgentOptions {
  apiKey: string;
  system?: string;
  greeting?: string;
  dialog?: Dialog;
  model: string;
}

export class OpenAIAgent implements Agent {

  public emitter: EventEmitter<AgentEvents>;

  protected openAI: OpenAI;
  protected system: string;
  protected greeting: string;
  protected model: string;
  protected metadata?: Metadata;
  protected dispatches: Set<UUID>;
  protected uuid?: UUID;
  protected history: { role: "system" | "assistant" | "user", content: string }[];
  protected mutex: Promise<void>;
  protected stream?: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>;

  constructor({ apiKey, system, greeting, model }: OpenAIAgentOptions) {
    this.emitter = new EventEmitter();
    this.openAI = new OpenAI({ "apiKey": apiKey });
    this.system = system ?? "";
    this.greeting = greeting ?? "";
    this.model = model;
    this.dispatches = new Set();
    if (this.system) {
      this.history = [{
        role: "system",
        content: this.system,
      }];
    }
    else {
      this.history = [];
    }
    this.mutex = Promise.resolve();
  }

  public onTranscript = (transcript: string): void => {
    this.mutex = (async () => {
      try {
        await this.mutex;
        this.uuid = randomUUID();
        log.notice(`User message: ${transcript}`);
        this.history.push({ role: "user", content: transcript });
        this.stream = await this.openAI.chat.completions.create({
          model: this.model,
          messages: this.history,
          temperature: 1,
          stream: true
        });
        await this.dispatchStream(this.uuid, this.stream);
      }
      catch (err) {
        console.log(err);
        log.error(err);
      }
    })();
  };

  protected async dispatchStream(uuid: UUID, stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>): Promise<void> {
    let assistantMessage = "";
    let chunkCount = 0;
    for await (const chunk of stream) {
      const content = chunk.choices[0].delta.content;
      if (content) {
        chunkCount = chunkCount + 1;
        if (chunkCount < 4) { // Accumulate 4 chunks for prosody.
          assistantMessage = assistantMessage + content;
        }
        else if (chunkCount == 4) {
          assistantMessage = assistantMessage + content;
          this.emitter.emit("transcript", uuid, assistantMessage);
        }
        else {
          assistantMessage = assistantMessage + content;
          this.emitter.emit("transcript", uuid, content);
        }
      }
    }

    if (chunkCount < 4) {
      this.emitter.emit("transcript", uuid, assistantMessage);
    }

    log.notice(`Assistant message: ${assistantMessage}`);
    this.history.push({ role: "assistant", content: assistantMessage });
    this.dispatches.add(uuid);
  };

  public onTranscriptDispatched = (uuid: UUID): void => {
    this.dispatches.delete(uuid);
  };

  public onUpdateMetadata = (metadata: Metadata): void => {
    if (this.metadata) {
      Object.assign(this.metadata, metadata);
    } else {
      this.metadata = metadata;
    }
    log.info(this.metadata);
  };

  public onStreaming = (): void => {
    if (this.greeting) {
      this.history.push({ role: "assistant", content: this.greeting });
      this.emitter.emit("transcript", randomUUID(), this.greeting);
    }
  };

  public onVAD = (): void => {
    if (this.uuid) {
      this.emitter.emit("abort_media");
      this.emitter.emit("abort_transcript", this.uuid);
    }
    if (this.stream) {
      this.stream.controller.abort();
    }
  };

  public onDispose = (): void => {
    if (this.stream) {
      this.stream.controller.abort();
    }
    this.emitter.removeAllListeners();
  };
}