import { randomUUID, UUID } from "node:crypto";
import { EventEmitter, once } from "node:events";
import { log } from "../../../commons/logger.js";
import { OpenAI } from "openai";
import { Metadata } from "../../../commons/metadata.js";
import { Agent, AgentEvents } from "../../../interfaces/agent.js";
import { Stream } from "openai/streaming.mjs";
import { Dialog } from "../../../commons/dialog.js";
import { nextTick } from "node:process";

export type OpenAIConversationHistory = { role: "system" | "assistant" | "user" | "developer", content: string }[];

export interface OpenAIAgentOptions {
  apiKey: string;
  system?: string;
  greeting?: string;
  dialog?: Dialog;
  model: string;
  utteranceWait?: number;
  evaluateUtterance?: (transcript: string, history: OpenAIConversationHistory) => Promise<boolean>;
}

export class OpenAIAgent extends EventEmitter implements Agent {

  public emitter: EventEmitter<AgentEvents>;

  protected openAI: OpenAI;
  protected system: string;
  protected greeting: string;
  protected model: string;
  protected metadata?: Metadata;
  protected dispatches: Set<UUID>;
  protected uuid?: UUID;
  protected history: OpenAIConversationHistory;
  protected mutex: Promise<void>;
  protected stream?: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>;
  protected evaluateUtterance?: (transcript: string, history: OpenAIConversationHistory) => Promise<boolean>;
  protected transcript: string;
  protected utteranceWait: number;
  protected queue: string[];
  constructor({ apiKey, system, greeting, model, utteranceWait, evaluateUtterance }: OpenAIAgentOptions) {
    super();
    this.emitter = new EventEmitter();
    this.openAI = new OpenAI({ "apiKey": apiKey });
    this.system = system ?? "";
    this.greeting = greeting ?? "";
    this.model = model;
    this.evaluateUtterance = evaluateUtterance;
    this.utteranceWait = utteranceWait ?? 5000;
    this.transcript = "";
    this.dispatches = new Set();
    this.queue = [];
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

    this.once("transcript", this.processTranscript);
  }

  public onTranscript = (transcript: string): void => {
    if (transcript == "") {
      return;
    }
    this.transcript = this.transcript == "" ? transcript : this.transcript + " " + transcript;
    this.emit("transcript");
  };

  protected processTranscript = (): void => {
    void (async () => {
      const transcript = this.transcript;
      log.notice(`User message: ${transcript}`);

      if (this.evaluateUtterance) {
        const isUtteranceComplete = await this.evaluateUtterance(transcript, this.history);
        if (transcript != this.transcript) {
          nextTick(this.processTranscript);
          return;
        }
        if (!isUtteranceComplete) {
          let timeout;
          const ac = new AbortController();
          await Promise.race([once(this, "transcript", { signal: ac.signal }), new Promise((r) => timeout = setTimeout(r, 5000))]);
          clearTimeout(timeout);
          ac.abort();
          if (transcript != this.transcript) {
            nextTick(this.processTranscript);
            return;
          }
        }
      }

      this.uuid = randomUUID();
      this.history.push({ role: "user", content: transcript });
      this.transcript = "";
      this.stream = await this.openAI.chat.completions.create({
        model: this.model,
        messages: this.history,
        temperature: 0,
        stream: true
      });
      this.dispatchStream(this.uuid, this.stream).catch(log.error);
      if (this.transcript != "") {
        nextTick(this.processTranscript);
      }
      else {
        this.once("transcript", this.processTranscript);
      }
    })();
  };

  protected async dispatchStream(uuid: UUID, stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>): Promise<void> {
    let assistantMessage = "";
    let chunkCount = 0;
    for await (const chunk of stream) {
      const content = chunk.choices[0].delta.content; //?.replace(/[\u{0080}-\u{FFFF}]/gu, "");
      if (content) {
        chunkCount = chunkCount + 1;
        if (chunkCount < 6) { // Accumulate 4 chunks for prosody.
          assistantMessage = assistantMessage + content;
        }
        else if (chunkCount == 6) {
          assistantMessage = assistantMessage + content;
          this.emitter.emit("transcript", uuid, assistantMessage);
        }
        else {
          assistantMessage = assistantMessage + content;
          this.emitter.emit("transcript", uuid, content);
        }
      }
    }

    if (chunkCount < 6) {
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