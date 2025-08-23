/* eslint-disable @typescript-eslint/no-unused-vars */
import { EventEmitter } from "node:events";
import { VoIP, VoIPEvents } from "../../../interfaces/voip.js";
import { Metadata } from "../../../interfaces/metadata.js";
import { Agent } from "port_agent";
import { Message } from "../../../interfaces/message.js";
import { TranscriptStatus } from "./types.js";

export class TwilioVoIPAgent extends EventEmitter<VoIPEvents<Metadata, TranscriptStatus>> implements VoIP<Metadata, TranscriptStatus> {
  protected agent?: Agent;
  protected propagateEvent = (event: keyof VoIPEvents<Metadata, TranscriptStatus>, value: unknown[]): void => {
    this.emit(event, value);
  };
  public updateMetadata = (metadata: Metadata): void => {

  };
  public postAgentMediaMessage = (message: Message): void => {

  };
  public abortMedia = (): void => {

  };
  public hangup = (): void => {

  };
  public transferTo = (tel: string): void => {

  };
  public startRecording = async (): Promise<void> => {

  };
  public stopRecording = async (): Promise<void> => {

  };
  public dispose = (): void => {

  };
}
