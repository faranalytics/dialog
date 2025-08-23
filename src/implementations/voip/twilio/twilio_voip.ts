import { EventEmitter } from "node:events";
import { VoIPEvents, VoIP, Metadata } from "../../../interfaces/voip.js";
import { Message } from "../../../interfaces/message.js";
import { log } from "../../../commons/logger.js";
import twilio from "twilio";
import { CallInstance } from "twilio/lib/rest/api/v2010/account/call.js";
import { TranscriptStatus } from "./types.js";
import { WebSocketListener } from "./twilio_controller.js";
const { twiml } = twilio;

export interface TwilioVoIPEvents extends VoIPEvents {
  "transcript": [TranscriptStatus];
}

export interface TwilioVoIPOptions {
  metadata: Metadata;
  accountSid: string;
  authToken: string;
  recordingStatusURL: URL;
  transcriptStatusURL: URL;
}

export class TwilioVoIP extends EventEmitter<TwilioVoIPEvents> implements VoIP<TwilioVoIPEvents> {

  protected metadata: Metadata;
  protected listener?: WebSocketListener;
  protected client: twilio.Twilio;
  protected recordingStatusURL: URL;
  protected transcriptStatusURL: URL;
  protected recordingId?: string;

  constructor({ metadata, accountSid, authToken, recordingStatusURL, transcriptStatusURL }: TwilioVoIPOptions) {
    super();
    this.metadata = metadata;
    this.recordingStatusURL = recordingStatusURL;
    this.transcriptStatusURL = transcriptStatusURL;
    this.client = twilio(accountSid, authToken);
  }

  public setWebSocketListener = (webSocketListener: WebSocketListener): void => {
    this.listener = webSocketListener;
  };

  public updateMetadata = (metadata: Metadata): void => {
    Object.assign(this.metadata, metadata);
  };

  public postAgentMediaMessage = (message: Message): void => {
    log.debug("TwilioVoIP.postAgentMessage");
    if (message.data != "") {
      const serialized = JSON.stringify({
        event: "media",
        streamSid: this.metadata.streamId,
        media: {
          payload: message.data,
        },
      });
      this.listener?.webSocket.send(serialized);
    }
    if (message.done) {
      log.debug("TwilioVoIP.postAgentMessage/done");
      const serialized = JSON.stringify({
        event: "mark",
        streamSid: this.metadata.streamId,
        mark: {
          name: message.uuid
        }
      });
      this.listener?.webSocket.send(serialized);
    }
  };

  public abortMedia = (): void => {
    log.info("TwilioVoIP.abortMedia");
    const message = JSON.stringify({
      event: "clear",
      streamSid: this.metadata.streamId,
    });
    this.listener?.webSocket.send(message);
  };

  public transfer = async (tel: string): Promise<CallInstance> => {
    const response = new twiml.VoiceResponse().dial(tel).toString() as string;
    if (!this.metadata.callId) {
      throw new Error("Missing callId.");
    }
    const call = await this.client.calls(this.metadata.callId).update({ twiml: response });
    log.info(call, "TwilioVoIP.transfer");
    return call;
  };

  public hangup = async (): Promise<CallInstance> => {
    const response = new twiml.VoiceResponse().hangup().toString() as string;
    if (!this.metadata.callId) {
      throw new Error("Missing callId.");
    }
    const call = await this.client.calls(this.metadata.callId).update({ twiml: response });
    log.info(call, "TwilioVoIP.hangup");
    return call;
  };

  public postTranscript = (transcriptStatus: TranscriptStatus): void => {
    this.emit("transcript", transcriptStatus);
  };

  public startTranscript = async (): Promise<void> => {
    if (this.metadata.callId) {
      await this.client.calls(this.metadata.callId).transcriptions.create({
        statusCallbackUrl: this.transcriptStatusURL.href,
        statusCallbackMethod: "POST",
        track: "both_tracks",
        transcriptionEngine: "deepgram",
      });
    }
  };

  public startRecording = async (): Promise<void> => {
    if (!this.metadata.callId) {
      throw new Error("Metadata.callId has not been set.");
    }
    const recordingResult = await this.client.calls(this.metadata.callId).recordings.create({
      recordingStatusCallback: this.recordingStatusURL.href,
      recordingStatusCallbackEvent: ["completed"],
      recordingChannels: "dual",
      recordingStatusCallbackMethod: "POST",
      recordingTrack: "both",
      trim: "do-not-trim",
    });
    this.recordingId = recordingResult.sid;
  };

  public stopRecording = async (): Promise<void> => {
    if (!this.recordingId) {
      throw new Error("RecodingId has not been set.");
    }
    if (!this.metadata.callId) {
      throw new Error("Metadata.callId has not been set.");
    }
    console.log(this.metadata.callId, this.recordingId);
    const recordingStatus = await this.client.calls(this.metadata.callId).recordings(this.recordingId).fetch();
    if (["in-progress", "completed", "paused"].includes(recordingStatus.status)) {
      await this.client.calls(this.metadata.callId).recordings(this.recordingId).update({ "status": "stopped" });
    }
  };

  public removeRecording = async (): Promise<void> => {
    if (!this.recordingId) {
      throw new Error("RecodingId has not been set.");
    }
    await this.client.recordings(this.recordingId).remove();
  };

  public dispose = (): void => {
    this.listener?.webSocket.close(1008);
    if (this.listener?.startMessage?.start.callSid) {
      this.listener.callSidToTwilioVoIP.delete(this.listener.startMessage.start.callSid);
    }
  };
}