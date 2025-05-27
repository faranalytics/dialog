import { randomUUID } from "node:crypto";
import { log, Agent, OpenAIAgent } from "@farar/dialog";

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
        this.stream = await this.openAI.chat.completions.create({
          model: "gpt-4o-mini",
          messages: this.history,
          temperature: 1,
          stream: true
        });
        await this.consumeStream(this.uuid, this.stream);
      }
      catch (err) {
        console.log(err);
        log.error(err);
      }
    })();
  };

  public onStreaming = (): void => {
    this.history.push({ role: "assistant", content: this.greeting });
    this.emitter.emit("transcript", randomUUID(), this.greeting);
  };
}