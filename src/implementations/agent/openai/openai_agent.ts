import { randomUUID, UUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { log } from "../../../commons/logger.js";
import { OpenAI } from "openai";
import { Metadata } from "../../../commons/metadata.js";
import { Agent, AgentEvents } from "../../../interfaces/agent.js";
import { SecondsTimer } from "../../../commons/seconds_timer.js";
import { Stream } from "openai/streaming.mjs";

export interface OpenAIAgentOptions {
  apiKey: string;
  system: string;
  greeting: string;
}

export class OpenAIAgent implements Agent {

  public emitter: EventEmitter<AgentEvents>;

  protected openAI: OpenAI;
  protected system: string;
  protected greeting: string;
  protected metadata?: Metadata;
  protected dispatches: Set<UUID>;
  protected secondsTimer: SecondsTimer;
  protected uuid?: UUID;
  protected history: { role: "system" | "assistant" | "user", content: string }[];
  protected mutex: Promise<void>;
  protected stream?: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>;

  constructor({ apiKey, system, greeting }: OpenAIAgentOptions) {

    this.emitter = new EventEmitter();
    this.openAI = new OpenAI({ "apiKey": apiKey });
    this.system = system;
    this.greeting = greeting;
    this.dispatches = new Set();
    this.secondsTimer = new SecondsTimer();
    this.history = [{
      role: "system",
      content: this.system,
    }];
    this.mutex = Promise.resolve();
  }

  public onTranscript = (transcript: string): void => {

    this.mutex = (async () => {
      try {
        await this.mutex;

        this.uuid = randomUUID();

        log.notice(`User message: ${transcript}`);

        this.history.push({ role: "user", content: transcript });

        const data = {
          model: "gpt-4o-mini",
          messages: this.history,
          temperature: 1,
          stream: true
        } as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;

        this.stream = await this.openAI.chat.completions.create(data);
        let assistantMessage = "";
        let chunkCount = 0;
        for await (const chunk of this.stream) {
          const content = chunk.choices[0].delta.content;
          if (content) {
            chunkCount = chunkCount + 1;
            if (chunkCount < 5) {
              assistantMessage = assistantMessage + content;
            }
            else if (chunkCount == 5) {
              assistantMessage = assistantMessage + content;
              this.emitter.emit("transcript", this.uuid, assistantMessage);
            }
            else {
              assistantMessage = assistantMessage + content;
              this.emitter.emit("transcript", this.uuid, content);
            }
          }
        }

        if (chunkCount < 5) {
          this.emitter.emit("transcript", this.uuid, assistantMessage);
        }

        log.notice(`Assistant message: ${assistantMessage}`);
        this.history.push({ role: "assistant", content: assistantMessage });
        this.dispatches.add(this.uuid);
      }
      catch (err) {
        console.log(err);
        log.error(err);
      }
    })();
  };

  public onTranscriptDispatched = (uuid: UUID): void => {
    this.dispatches.delete(uuid);
  };

  public onMetadata = (metadata: Metadata): void => {
    if (this.metadata) {
      Object.assign(this.metadata, metadata);
    } else {
      this.metadata = metadata;
    }
    log.info(this.metadata);
  };

  public onStreaming = (): void => {
    this.history.push({ role: "assistant", content: this.greeting });
    this.emitter.emit("transcript", randomUUID(), this.greeting);
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