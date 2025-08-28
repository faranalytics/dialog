import * as https from "node:https";
import * as http from "node:http";
import * as fs from "node:fs";
import { once } from "node:events";
import {
  log,
  TwilioMetadata,
  Message,
  OpenAIAgent,
  TwilioVoIP,
  TranscriptStatus
} from "@farar/dialog";

export class TwilioVoIPOpenAIAgent extends OpenAIAgent<TwilioVoIP> {

  protected metadata?: TwilioMetadata;

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

  public updateMetadata = (metadata: TwilioMetadata): void => {
    log.info(metadata, "TwilioVoIPOpenAIAgent.updateMetadata");
    if (!this.metadata) {
      this.metadata = metadata;
    }
    else {
      Object.assign(this.metadata, metadata);
    }
  };

  protected startDisposal = (): void => {
    // TODO:  Disposal criteria should be configurable.
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

  public activate = (): void => {
    super.activate();
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
    this.voip.off("streaming_started", this.startDisposal);
    this.voip.off("metadata", this.updateMetadata);
    this.voip.off("recording_url", this.fetchRecording);
    this.voip.off("streaming_started", this.startRecording);
    this.voip.off("streaming_started", this.startTranscript);
    this.voip.off("streaming_stopped", this.stopRecording);
    this.voip.off("transcript", this.appendTranscript);
  };
}