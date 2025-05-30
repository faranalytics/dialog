import OpenAI from "openai";
import { log, OpenAIConversationHistory } from "@farar/dialog";

export interface ContextualUtteranceOptions {
  apiKey: string;
  system: string;
}

export class ContextualUtterance {

  protected openAI: OpenAI;
  protected system: string;

  constructor({ apiKey, system }: ContextualUtteranceOptions) {
    this.openAI = new OpenAI({ "apiKey": apiKey });
    this.system = system;
  }

  public isContextualUtterance = async (transcript: string, history: OpenAIConversationHistory): Promise<boolean> => {

    const assistantMessage = history.pop();

    if (!assistantMessage) {
      return false;
    }

    const completion = await this.openAI.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: this.system }, assistantMessage, { role: "user", content: transcript }],
      temperature: 0
    });

    const agentMessage = completion.choices[0].message.content ?? "NULL";
    log.info(`Answer classification: ${agentMessage}`);
    if (agentMessage == "Complete Answer") {
      return true;
    }
    return false;
  };
}