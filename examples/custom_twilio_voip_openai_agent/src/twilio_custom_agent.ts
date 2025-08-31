import { once } from "node:events";
import { randomUUID } from "node:crypto";
import {
  log,
  Message,
  OpenAIAgent,
  OpenAIAgentOptions,
  TwilioMetadata,
  TwilioVoIP,
  OpenAIConversationHistory
} from "@farar/dialog";

export interface TwilioCustomAgentOptions extends OpenAIAgentOptions<TwilioVoIP> {
  twilioAccountSid: string;
  twilioAuthToken: string;
  system?: string;
  greeting?: string;
}

export class TwilioCustomAgent extends OpenAIAgent<TwilioVoIP> {

  protected metadata?: TwilioMetadata;
  protected twilioAccountSid: string;
  protected twilioAuthToken: string;
  protected history: OpenAIConversationHistory;
  protected transcript: unknown[];
  protected system: string;
  protected greeting: string;

  constructor(options: TwilioCustomAgentOptions) {
    super(options);
    this.twilioAccountSid = options.twilioAccountSid;
    this.twilioAuthToken = options.twilioAuthToken;
    this.transcript = [];
    this.system = options.system ?? "";
    this.greeting = options.greeting ?? "";
    if (this.system) {
      this.history = [{
        role: "system",
        content: this.system,
      }];
    }
    else {
      this.history = [];
    }
  }

  public inference = async (message: Message): Promise<void> => {
    try {
      const content = `${new Date().toISOString()}\n${message.data}`;
      log.notice(`User message: ${content}`);
      this.history.push({ role: "user", content });
      const stream = await this.openAI.chat.completions.create({
        model: this.model,
        messages: this.history,
        temperature: 1,
        stream: true
      });
      const assistantMessage = await this.dispatchStream(message.uuid, stream);
      log.notice(`Assistant message: ${assistantMessage} `);
      this.history.push({ role: "assistant", content: assistantMessage });
    }
    catch (err) {
      this.dispose(err);
    }
  };

  public updateMetadata = (metadata: TwilioMetadata): void => {
    if (!this.metadata) {
      this.metadata = metadata;
    }
    else {
      this.metadata = { ...this.metadata, ...metadata };
    }
  };

  public activate = (): void => {
    super.activate();
    this.voip.on("streaming_started", this.dispatchInitialMessage);
    this.voip.on("streaming_started", this.startDisposal);
    this.voip.on("metadata", this.updateMetadata);
  };

  public deactivate = (): void => {
    super.deactivate();
    this.voip.off("streaming_started", this.dispatchInitialMessage);
    this.voip.off("streaming_started", this.startDisposal);
    this.voip.off("metadata", this.updateMetadata);
  };

  protected startDisposal = (): void => {
    void (async () => {
      try {
        await once(this.voip, "streaming_stopped");
        this.dispose();
      }
      catch (err) {
        log.error(err);
      }
    })();
  };

  public dispatchInitialMessage = (): void => {
    const uuid = randomUUID();
    this.activeMessages.add(uuid);
    this.history.push({ role: "assistant", content: this.greeting, });
    this.dispatchMessage({ uuid: uuid, data: this.greeting, done: true }, false).catch(this.dispose);
  };
}