import { CartesiaTTS, ElevenlabsTTS, log, Message, TwilioVoIPOpenAIAgent } from "@farar/dialog";
import { CARTESIA_API_KEY, CARTESIA_SPEECH_OPTIONS, ELEVEN_LABS_API_KEY } from "./settings.js";

export class Agent extends TwilioVoIPOpenAIAgent {
  public inference = async (message: Message): Promise<void> => {
    try {
      if (message.data.includes("agent")) {
        if (this.tts instanceof CartesiaTTS) {
          this.setTTS(new ElevenlabsTTS({ apiKey: ELEVEN_LABS_API_KEY }));
        } else if (this.tts instanceof ElevenlabsTTS) {
          this.setTTS(new CartesiaTTS({ apiKey: CARTESIA_API_KEY, speechOptions: CARTESIA_SPEECH_OPTIONS }));
        } else {
          throw new Error("Unhandled setTTS.");
        }
      }
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
