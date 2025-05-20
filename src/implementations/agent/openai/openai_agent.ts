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

  constructor({ apiKey, system, greeting }: OpenAIAgentOptions) {

    this.emitter = new EventEmitter();
    this.openAI = new OpenAI({ "apiKey": apiKey });
    this.content = "";
    this.system = system;
    this.greeting = greeting;
    this.dispatches = new Set();
    this.secondsTimer = new SecondsTimer();
  }

  public onTranscript = (transcript: string): void => {
    void (async () => {
      try {
        this.secondsTimer.start();

        for (const uuid of this.dispatches) {
          this.emitter.emit("abort_transcript", uuid);
        }

        this.content = this.content ? this.content + " " + transcript : transcript;

        log.notice(`Transcript: ${this.content}`);

        const content = this.content.slice(0);

        const completion = await this.openAI.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{
            role: "system",
            content: this.system,
          },
          {
            role: "user",
            content: this.content,
          }],
          temperature: 0
        });

        const agentMessage = completion.choices[0].message.content;

        log.notice(`Agent Message: ${agentMessage ?? ""}`);

        if (this.secondsTimer.on) {
          log.notice(`Agent time: ${this.secondsTimer.stop()}`);
        }
        if (this.content !== content) {
          return;
        }

        const uuid = randomUUID();

        this.dispatches.add(uuid);
        if (agentMessage) {
          this.emitter.emit("transcript", uuid, agentMessage);
        }
        this.content = "";
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
    this.emitter.emit("transcript", randomUUID(), this.greeting);
  };
}