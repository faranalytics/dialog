import { randomUUID, UUID } from "node:crypto";
import { log, Metadata, Agent, OpenAIAgent } from "@farar/dialog";
import { OpenAI } from "openai";

export interface CustomAgentOptions {
  apiKey: string;
  system: string;
  greeting: string;
}

export class CustomAgent extends OpenAIAgent implements Agent {

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
        await this.consumeStream(this.uuid, this.stream);
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

  public onUpdateMetadata = (metadata: Metadata): void => {
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