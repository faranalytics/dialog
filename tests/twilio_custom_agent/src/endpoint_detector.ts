import OpenAI from "openai";

export interface EndpointDetectorOptions {
  apiKey: string;
  endpointPrompt: (transcript: string) => string;
}

export class EndpointDetector {

  protected openAI: OpenAI;
  protected endpointPrompt: (transcript: string) => string;

  constructor({ apiKey, endpointPrompt }: EndpointDetectorOptions) {
    this.openAI = new OpenAI({ "apiKey": apiKey });
    this.endpointPrompt = endpointPrompt;
  }

  public isEndpoint = async (transcript: string): Promise<boolean> => {
    const prompt = this.endpointPrompt(transcript);

    const completion = await this.openAI.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: prompt,
        }],
      temperature: 0
    });

    const agentMessage = completion.choices[0].message.content;
    if (agentMessage == "CompleteUtterance") {
      return true;
    }
    return false;
  };
}