import * as https from "node:https";
import * as http from "node:http";
import * as fs from "node:fs";
import { once } from "node:events";
import { log, Message, OpenAIAgent } from "@farar/dialog";

export class Agent extends OpenAIAgent {
  public process = (message: Message): void => {
    this.mutex = (async () => {
      try {
        await this.mutex;
        log.notice(`User message: ${message.data}`);
        this.history.push({ role: "user", content: message.data });
        const stream = await this.openAI.chat.completions.create({
          model: this.model,
          messages: this.history,
          temperature: 0,
          stream: true
        });
        const assistantMessage = await this.dispatchStream(message.uuid, stream);
        log.notice(`Assistant message: ${assistantMessage} `);
        this.history.push({ role: "assistant", content: assistantMessage });
      }
      catch (err) {
        this.dispose(err);
      }
    })();
  };

  protected fetchRecording = (recordingURL: string): void => {
    void (async () => {
      try {
        const response = await new Promise<http.IncomingMessage>((r, e) => https.request(recordingURL, { method: "POST" }, r).on("error", e).end());
        const writeStream = fs.createWriteStream("./recording.wav");
        response.pipe(writeStream);
        await once(response, "end");
      }
      catch (err) {
        log.error(err);
      }
      finally {
        this.internal.emit("recording_fetched");
      }
    })();
  };

  public activate = (): void => {
    super.activate();
    this.voip.on("recording_url", this.fetchRecording);
  };

  public deactivate = (): void => {
    super.deactivate();
    this.voip.off("recording_url", this.fetchRecording);
  };
}