import OpenAI from "openai";
import { ConversationHistory } from "../../../dist/implementations/agent/openai/openai_agent.js";

export interface EndpointDetectorOptions {
  apiKey: string;
  system: string;
}

export class EndpointDetector {

  protected openAI: OpenAI;
  protected system: string;

  constructor({ apiKey, system }: EndpointDetectorOptions) {
    this.openAI = new OpenAI({ "apiKey": apiKey });
    this.system = system;
    console.log(system);
  }

  public isEndpoint = async (transcript: string, history: ConversationHistory): Promise<boolean> => {

    history = [...history];

    const last = history.pop();

    if (!last) {
      return false;
    }

    const completion = await this.openAI.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: this.system }, last, { role: "user", content: transcript }],
      temperature: 0
    });

    const agentMessage = completion.choices[0].message.content;
    console.log(agentMessage);
    if (agentMessage == "Complete Utterance") {
      return true;
    }
    return false;
  };
}