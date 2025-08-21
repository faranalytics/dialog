/* eslint-disable @typescript-eslint/no-unused-vars */
import { EventEmitter } from "node:events";
import { Metadata, VoIP, VoIPEvents } from "../../../interfaces/voip.js";
import { Agent } from "port_agent";
import { Message } from "../../../interfaces/message.js";

export class TwilioVoIPAgent extends EventEmitter<VoIPEvents> implements VoIP {
  protected agent?: Agent;
  protected propagateEvent = (event: keyof VoIPEvents, value: unknown[]): void => {
    this.emit(event, value);
  };
  public updateMetadata = (metadata: Metadata): void => {

  };
  public postAgentMediaMessage = (message: Message): void => {

  };
  public abortMedia = (): void => {

  };
  public hangup = async (): Promise<void> => {

  };
  public transfer = async (): Promise<void> => {

  };
  public dispose = (): void => {

  };
}
