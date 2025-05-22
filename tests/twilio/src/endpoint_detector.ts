import OpenAI from "openai";

export interface EndpointDetectorOptions {
  apiKey: string;
}

export class EndpointDetector {

  protected openAI: OpenAI;

  constructor({ apiKey }: EndpointDetectorOptions) {
    this.openAI = new OpenAI({ "apiKey": apiKey });
  }

  public isEndpoint = async (transcript: string): Promise<boolean> => {
    const prompt = this.endpointPrompt(transcript);

    const completion = await this.openAI.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: prompt,
        }],
      temperature: 0
    });

    const agentMessage = completion.choices[0].message.content;
    if (agentMessage == "Complete" || agentMessage == "Unclassifiable") {
      return true;
    }
    return false;
  };

  public endpointPrompt = (transcript: string): string => {
    return `You will be given a text input that represents a possible human utterance. Classify the utterance as one of the following:

Complete – The utterance expresses a self-contained idea or thought, with no evident missing parts.

Incomplete – The utterance appears to trail off, lacks closure, or seems interrupted or fragmentary.

For each input, respond only with the classification ("Complete", "Incomplete"). If needed, use grammatical, semantic, and pragmatic cues to make your judgment.  If you are not sure, then respond with "Complete".

Here is the input:
"{{${transcript}}}"`;
  };
}