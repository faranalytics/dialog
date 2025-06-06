import { randomUUID } from "node:crypto";
import { log, Agent, OpenAIAgent } from "@farar/dialog";

export class CustomAgent extends OpenAIAgent implements Agent {
  public onTranscript = (transcript: string): void => {
    this.mutex = (async () => {
      try {
        await this.mutex;
        this.uuid = randomUUID();
        log.notice(`User message: ${transcript}`);
        this.history.push({ role: "user", content: `${new Date().toISOString()}\n${transcript}` });
        this.stream = await this.openAI.chat.completions.create({
          model: "gpt-4o-mini",
          messages: this.history,
          temperature: 1,
          stream: true
        });
        await this.dispatchStream(this.uuid, this.stream);
      }
      catch (err) {
        log.error(err);
      }
    })();
  };
}