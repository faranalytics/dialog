import { EventEmitter } from "node:events";
import { VoIPEvents, VoIP, Metadata } from "../../../interfaces/voip.js";
import { Message } from "../../../interfaces/message.js";
import * as ws from "ws";
import { log } from "../../../commons/logger.js";
import twilio from "twilio";
import { CallInstance } from "twilio/lib/rest/api/v2010/account/call.js";
const { twiml } = twilio;


export interface TwilioVoIPOptions {
  metadata: Metadata;
  accountSid: string;
  authToken: string;
  recordingStatusURL: URL;
  transcriptStatusURL: URL;
}

export class TwilioVoIP extends EventEmitter<VoIPEvents> implements VoIP {

  protected metadata: Metadata;
  protected webSocket?: ws.WebSocket;
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

  public setWebSocket(webSocket: ws.WebSocket) {
    this.webSocket = webSocket;
  }

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
      this.webSocket?.send(serialized);
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
      this.webSocket?.send(serialized);
    }
  };

  public abortMedia = (): void => {
    log.info("TwilioVoIP.abortMedia");
    const message = JSON.stringify({
      event: "clear",
      streamSid: this.metadata.streamId,
    });
    this.webSocket?.send(message);
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

  public startRecording = async (): Promise<void> => {
    if (!this.metadata.callId) {
      throw new Error("Metadata.callId has not been set.");
    }
    const recordingResult = await this.client.calls(this.metadata.callId).recordings.create({
      recordingStatusCallback: this.recordingStatusURL.href,
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

    await this.client.calls(this.metadata.callId).recordings(this.recordingId).update({ "status": "stopped" });
  };

  public dispose = (): void => {
    this.webSocket?.close(1008);
  };
}