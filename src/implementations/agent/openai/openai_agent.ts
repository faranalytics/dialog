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
  protected content: string;
  protected system: string;
  protected greeting: string;
  protected metadata?: Metadata;
  protected dispatches: Set<UUID>;
  protected secondsTimer: SecondsTimer;
  protected uuid?: UUID;
  protected history: { role: "system" | "assistant" | "user", content: string }[];

  constructor({ apiKey, system, greeting }: OpenAIAgentOptions) {

    this.emitter = new EventEmitter();
    this.openAI = new OpenAI({ "apiKey": apiKey });
    this.content = "";
    this.system = system;
    this.greeting = greeting;
    this.dispatches = new Set();
    this.secondsTimer = new SecondsTimer();
    this.history = [{
      role: "system",
      content: this.system,
    }];
  }

  public onTranscript = (transcript: string): void => {

    void (async () => {
      try {

        this.uuid = randomUUID();

        this.history.push({ role: "user", content: transcript });

        const data = {
          model: "gpt-4o-mini",
          messages: this.history,
          temperature: 1,
          stream: true
        } as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;

        const uuid = this.uuid;

        const stream = await this.openAI.chat.completions.create(data);

        let assistant = "";
        for await (const chunk of stream) {
          const content = chunk.choices[0].delta.content;
          if (content) {
            this.emitter.emit("transcript", uuid, content);
            assistant = assistant + content;
          }
          if (uuid !== this.uuid) {
            this.emitter.emit("abort_transcript", uuid);
            break;
          }
        }
        this.history.push({ role: "assistant", content: assistant });
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
}