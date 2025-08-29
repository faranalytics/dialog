import * as https from "node:https";
import * as http from "node:http";
import * as fs from "node:fs";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { log } from "../../../commons/logger.js";
import { TwilioVoIP } from "../../voip/twilio/twilio_voip.js";
import { OpenAIAgent, OpenAIAgentOptions } from "../openai/openai_agent.js";
import { Message } from "../../../interfaces/message.js";
import { TranscriptStatus } from "../../voip/twilio/types.js";
import { TwilioMetadata } from "../../voip/twilio/types.js";
import { OpenAIConversationHistory } from "../openai/types.js";

export interface TwilioVoIPOpenAIAgentOptions extends OpenAIAgentOptions<TwilioVoIP> {
  twilioAccountSid: string;
  twilioAuthToken: string;
  system?: string;
  greeting?: string;
}

export class TwilioVoIPOpenAIAgent extends OpenAIAgent<TwilioVoIP> {

  protected metadata?: TwilioMetadata;
  protected twilioAccountSid: string;
  protected twilioAuthToken: string;
  protected history: OpenAIConversationHistory;
  protected transcript: unknown[];
  protected system: string;
  protected greeting: string;

  constructor(options: TwilioVoIPOpenAIAgentOptions) {
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
      log.notice(`User message: ${message.data}`);
      this.history.push({ role: "user", content: message.data });
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
    log.info(metadata, "TwilioVoIPOpenAIAgent.updateMetadata");
    if (!this.metadata) {
      this.metadata = metadata;
    }
    else {
      Object.assign(this.metadata, metadata);
    }
  };

  public activate = (): void => {
    super.activate();
    this.voip.on("streaming_started", this.dispatchInitialMessage);
    this.voip.on("streaming_started", this.startDisposal);
    this.voip.on("metadata", this.updateMetadata);
    this.voip.on("streaming_started", this.startRecording);
    this.voip.on("streaming_started", this.startTranscript);
    this.voip.on("recording_url", this.fetchRecording);
    this.voip.on("streaming_stopped", this.stopRecording);
    this.voip.on("transcript", this.appendTranscript);
  };

  public deactivate = (): void => {
    super.deactivate();
    this.voip.off("streaming_started", this.dispatchInitialMessage);
    this.voip.off("streaming_started", this.startDisposal);
    this.voip.off("metadata", this.updateMetadata);
    this.voip.off("recording_url", this.fetchRecording);
    this.voip.off("streaming_started", this.startRecording);
    this.voip.off("streaming_started", this.startTranscript);
    this.voip.off("streaming_stopped", this.stopRecording);
    this.voip.off("transcript", this.appendTranscript);
  };

  protected fetchRecording = (recordingURL: string): void => {
    void (async () => {
      try {
        const options = { auth: `${this.twilioAccountSid}:${this.twilioAuthToken}` };
        const res = await new Promise<http.IncomingMessage>((r, e) => https.request(recordingURL, options, r).on("error", e).end());
        const writeStream = fs.createWriteStream("./recording.wav");
        res.pipe(writeStream);
        await once(res, "end");
      }
      catch (err) {
        log.error(err);
      }
      finally {
        this.internal.emit("recording_fetched");
      }
    })();
  };

  protected startTranscript = (): void => {
    this.voip.startTranscript().catch(this.dispose);
  };

  protected appendTranscript = (transcriptStatus: TranscriptStatus): void => {
    this.transcript.push(transcriptStatus);
    if (transcriptStatus.TranscriptionEvent == "transcription-stopped") {
      this.internal.emit("transcription_stopped");
    }
  };

  protected startRecording = (): void => {
    this.voip.startRecording().catch(this.dispose);
  };

  protected stopRecording = (): void => {
    this.voip.stopRecording().catch(this.dispose);
  };

  protected startDisposal = (): void => {
    void (async () => {
      try {
        await Promise.allSettled([once(this.internal, "recording_fetched"), once(this.internal, "transcription_stopped")]);
        this.dispose();
        log.notice("TwilioVoIPOpenAIAgent disposed.");
      }
      catch (err) {
        log.error(err);
      }
    })();
  };

  public dispatchInitialMessage = (): void => {
    log.notice("", "OpenAIAgent.dispatchInitialMessage");
    const uuid = randomUUID();
    this.activeMessages.add(uuid);
    this.history.push({ role: "assistant", content: this.greeting, });
    this.dispatchMessage({ uuid: uuid, data: this.greeting, done: true }, false).catch(this.dispose);
  };
}