import { randomUUID, UUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { log } from "../../../commons/logger.js";
import { OpenAI } from "openai";
import { Metadata } from "../../../commons/metadata.js";
import { Agent, AgentEvents } from "../../../interfaces/agent.js";
import { SecondsTimer } from "../../../commons/seconds_timer.js";

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

        const uuid = this.uuid;

        log.notice(`User message: ${transcript}`);

        this.history.push({ role: "user", content: transcript });

        const data = {
          model: "gpt-4o-mini",
          messages: this.history,
          temperature: 1,
          stream: true
        } as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;

        const stream = await this.openAI.chat.completions.create(data);

        let assistantMessage = "";
        for await (const chunk of stream) {
          const content = chunk.choices[0].delta.content;
          if (content) {
            this.emitter.emit("transcript", uuid, content);
            assistantMessage = assistantMessage + content;
          }
          if (uuid !== this.uuid) {
            this.emitter.emit("abort_transcript", uuid);
            log.info("Assistant message aborted.");
            break;
          }
        }
        log.notice(`Assistant message: ${assistantMessage}`);
        this.history.push({ role: "assistant", content: assistantMessage });
        this.dispatches.add(uuid);
      }
      catch (err) {
        log.error(err);
      }
    })();
  };

  public onTranscriptDispatched = (uuid: UUID): void => {
    this.dispatches.delete(uuid);
  };

  public onMetadata = (metadata: Metadata): void => {
    this.metadata = metadata;
  };

  public onDispose = (): void => {
    this.emitter.removeAllListeners();
  };

  public onStreaming = (): void => {
    this.history.push({ role: "assistant", content: this.greeting });
    this.emitter.emit("transcript", randomUUID(), this.greeting);
  };

  public onVAD = (): void => {
    this.emitter.emit("abort_media");
    if (this.uuid) {
      this.emitter.emit("abort_transcript", this.uuid);
    }
  };
}