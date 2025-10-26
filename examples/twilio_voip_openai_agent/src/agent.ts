import { log, Message, TwilioVoIPOpenAIAgent } from "@farar/dialog";

export class Agent extends TwilioVoIPOpenAIAgent {
  public inference = async (message: Message): Promise<void> => {
    try {
      log.notice(`User message: ${message.data}`);
      this.history.push({ role: "user", content: message.data });
      const stream = await this.openAI.chat.completions.create({
        model: this.model,
        messages: this.history,
        temperature: 1,
        stream: true,
      });
      const assistantMessage = await this.dispatchStream(message.uuid, stream);
      log.notice(`Assistant message: ${assistantMessage} `);
      this.history.push({ role: "assistant", content: assistantMessage });
    } catch (err) {
      this.dispose(err);
    }
  };
}
