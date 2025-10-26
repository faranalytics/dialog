import { EventEmitter } from "node:events";
import { VoIPEvents, VoIP } from "../../../interfaces/voip/voip.js";
import { Message } from "../../../interfaces/message/message.js";
import { log } from "../../../commons/logger.js";
import twilio from "twilio";
import { TranscriptStatus, TwilioMetadata } from "./types.js";
import { WebSocketListener } from "./twilio_gateway.js";
import { UUID } from "node:crypto";
const { twiml } = twilio;

export interface TwilioVoIPOptions {
  metadata: TwilioMetadata;
  accountSid: string;
  authToken: string;
  recordingStatusURL: URL;
  transcriptStatusURL: URL;
}

export class TwilioVoIP
  extends EventEmitter<VoIPEvents<TwilioMetadata, TranscriptStatus>>
  implements VoIP<TwilioMetadata, TranscriptStatus, VoIPEvents<TwilioMetadata, TranscriptStatus>>
{
  protected metadata: TwilioMetadata;
  protected listener?: WebSocketListener;
  protected client: twilio.Twilio;
  protected recordingStatusURL: URL;
  protected transcriptStatusURL: URL;
  protected recordingId?: string;
  protected activeMessages: Set<UUID>;

  constructor({ metadata, accountSid, authToken, recordingStatusURL, transcriptStatusURL }: TwilioVoIPOptions) {
    super();
    this.activeMessages = new Set();
    this.metadata = metadata;
    this.recordingStatusURL = recordingStatusURL;
    this.transcriptStatusURL = transcriptStatusURL;
    this.client = twilio(accountSid, authToken);
    this.on("message_dispatched", this.deleteActiveMessage);
    this.on("metadata", this.updateMetadata);
  }

  public setWebSocketListener = (webSocketListener: WebSocketListener): void => {
    this.listener = webSocketListener;
  };

  protected updateMetadata = (metadata: TwilioMetadata): void => {
    this.metadata = { ...this.metadata, ...metadata };
  };

  public post = (message: Message): void => {
    this.activeMessages.add(message.uuid);
    log.debug("TwilioVoIP.postAgentMessage");
    if (message.data != "") {
      const serialized = JSON.stringify({
        event: "media",
        streamSid: this.metadata.streamSid,
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
        streamSid: this.metadata.streamSid,
        mark: {
          name: message.uuid,
        },
      });
      this.listener?.webSocket.send(serialized);
    }
  };

  public abort = (uuid: UUID): void => {
    log.notice(uuid, "TwilioVoIP.abort");
    if (this.activeMessages.has(uuid)) {
      this.activeMessages.delete(uuid);
      const serialized = JSON.stringify({
        event: "mark",
        streamSid: this.metadata.streamSid,
        mark: {
          name: uuid,
        },
      });
      this.listener?.webSocket.send(serialized);
    }
    if (this.activeMessages.size == 0) {
      const message = JSON.stringify({
        event: "clear",
        streamSid: this.metadata.streamSid,
      });
      this.listener?.webSocket.send(message);
    }
  };

  protected deleteActiveMessage = (uuid: UUID): void => {
    this.activeMessages.delete(uuid);
  };

  public transferTo = (tel: string): void => {
    log.info(tel, "TwilioVoIP.transferTo");
    void (async () => {
      try {
        const response = new twiml.VoiceResponse().dial(tel).toString();
        if (!this.metadata.CallSid) {
          throw new Error("Missing call identifer.");
        }
        const call = await this.client.calls(this.metadata.CallSid).update({ twiml: response });
        log.info(call, "TwilioVoIP.transfer");
      } catch (err) {
        this.emit("error", err);
      }
    })();
  };

  public hangup = (): void => {
    log.info("", "TwilioVoIP.hangup");
    void (async () => {
      try {
        const response = new twiml.VoiceResponse().hangup().toString();
        if (!this.metadata.CallSid) {
          throw new Error("Missing call identifer.");
        }
        const call = await this.client.calls(this.metadata.CallSid).update({ twiml: response });
        log.info(call, "TwilioVoIP.hangup");
      } catch (err) {
        this.emit("error", err);
      }
    })();
  };

  public startTranscript = async (): Promise<void> => {
    log.info("", "TwilioVoIP.startTranscript");
    if (this.metadata.CallSid) {
      await this.client.calls(this.metadata.CallSid).transcriptions.create({
        statusCallbackUrl: this.transcriptStatusURL.href,
        statusCallbackMethod: "POST",
        track: "both_tracks",
        transcriptionEngine: "deepgram",
      });
    }
  };

  public startRecording = async (): Promise<void> => {
    log.info("", "TwilioVoIP.startRecording");
    if (!this.metadata.CallSid) {
      throw new Error("Missing call identifer.");
    }
    const recordingResult = await this.client.calls(this.metadata.CallSid).recordings.create({
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
    log.info("", "TwilioVoIP.stopRecording");
    if (!this.recordingId) {
      throw new Error("The recording identifier has not been set.");
    }
    if (!this.metadata.CallSid) {
      throw new Error("Metadata.callId has not been set.");
    }
    const recordingStatus = await this.client.calls(this.metadata.CallSid).recordings(this.recordingId).fetch();
    if (["in-progress", "paused"].includes(recordingStatus.status)) {
      await this.client.calls(this.metadata.CallSid).recordings(this.recordingId).update({ status: "stopped" });
    }
  };

  public removeRecording = async (): Promise<void> => {
    log.info("", "TwilioVoIP.removeRecording");
    if (!this.recordingId) {
      throw new Error("The recording identifier has not been set.");
    }
    await this.client.recordings(this.recordingId).remove();
  };

  public dispose = (): void => {
    log.notice("", "TwilioVoIP.dispose");
    this.listener?.webSocket.close(1000);
    if (this.listener?.startMessage?.start.callSid) {
      this.listener.callSidToTwilioVoIP.delete(this.listener.startMessage.start.callSid);
    }
  };
}
