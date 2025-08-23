import { log, Message, OpenAIAgent } from "@farar/dialog";

export class Agent extends OpenAIAgent {
  public postUserTranscriptMessage = (message: Message): void => {
    try {
      if (message.data == "") {
        return;
      }
      this.activeMessages.add(message.uuid);
      this.mutex = (async () => {
        try {
          await this.mutex;
          if (!this.activeMessages.has(message.uuid)) {
            return;
          }
          log.notice(`User message: ${message.data}`);
          this.history.push({ role: "user", content: message.data });
          const stream = await this.openAI.chat.completions.create({
            model: this.model,
            messages: this.history,
            temperature: 0,
            stream: true
          });
          await this.dispatchAgentStream(message.uuid, stream);
          // await this.postAgentStreamToTTS(message.uuid, stream);
        }
        catch (err) {
          log.error(err);
        }
      })();
    }
    catch (err) {
      log.error(err, "OpenAIAgent.postUserTranscriptMessage");
    }
  };
}