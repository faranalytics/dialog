import { EventEmitter } from "node:events";
import { VoIP, VoIPEvents } from "../../../interfaces/voip/voip.js";
import { Agent } from "port_agent";
import { Message } from "../../../interfaces/message/message.js";
import { TranscriptStatus, TwilioMetadata } from "./types.js";
import { UUID } from "node:crypto";
import { parentPort } from "node:worker_threads";

export class TwilioVoIPProxy extends EventEmitter<VoIPEvents<TwilioMetadata, TranscriptStatus>> implements VoIP<TwilioMetadata, TranscriptStatus> {
  protected agent?: Agent;
  constructor() {
    super();
    if (parentPort) {
      this.agent = new Agent(parentPort);
      this.agent.register("propagateEvent", this.propagateEvent);
    }
  }

  protected propagateEvent = (event: keyof VoIPEvents<TwilioMetadata, TranscriptStatus>, ...args: VoIPEvents<TwilioMetadata, TranscriptStatus>[keyof VoIPEvents<TwilioMetadata, TranscriptStatus>]): void => {
    this.emit(event, ...args);
  };

  public post = (message: Message): void => {
    void this.agent?.call("post", message).catch((err: unknown) => this.emit("error", err));
  };

  public abort = (uuid: UUID): void => {
    void this.agent?.call("abort", uuid).catch((err: unknown) => this.emit("error", err));
  };

  public hangup = (): void => {
    void this.agent?.call("hangup").catch((err: unknown) => this.emit("error", err));
  };

  public transferTo = (tel: string): void => {
    void this.agent?.call("transferTo", tel).catch((err: unknown) => this.emit("error", err));
  };

  public startRecording = async (): Promise<void> => {
    await this.agent?.call("startRecording").catch((err: unknown) => this.emit("error", err));
  };

  public stopRecording = async (): Promise<void> => {
    await this.agent?.call("stopRecording").catch((err: unknown) => this.emit("error", err));
  };

  public startTranscript = async (): Promise<void> => {
    await this.agent?.call("startTranscript").catch((err: unknown) => this.emit("error", err));
  };

  public dispose = (): void => {
    void this.agent?.call("dispose").catch((err: unknown) => this.emit("error", err));
  };
}
