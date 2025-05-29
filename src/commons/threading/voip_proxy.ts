import { UUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { VoIP, VoIPEvents } from "../../interfaces/voip.js";
import { Agent } from "port_agent";
import { log } from "../logger.js";
import { Metadata } from "../metadata.js";

export interface VoIPProxyOptions {
  uuid: UUID;
  agent: Agent;
}

export class VoIPProxy implements VoIP {

  public emitter: EventEmitter<VoIPEvents>;

  protected uuid: UUID;
  protected agent: Agent;

  constructor({ uuid, agent }: VoIPProxyOptions) {
    this.uuid = uuid;
    this.emitter = new EventEmitter();
    this.agent = agent;
    this.agent.register(this.uuid, this.processEvent);
  }

  protected processEvent = (event: "media_in" | "metadata" | "streaming" | "dispose", data: unknown): void => {
    if (event == "media_in") {
      this.emitter.emit("media", data as string);
    }
    else if (event == "streaming") {
      this.emitter.emit("streaming");
    }
    else if (event == "dispose") {
      this.emitter.emit("dispose");
      setTimeout(() => {
        process.exit();
      }, 4);
    }
    else {
      this.emitter.emit("metadata", data as Metadata);
    }
  };

  public onAbortMedia = (): void => {
    this.agent.call(this.uuid, "abort_media").catch(log.error);
  };

  public onMedia = (uuid: UUID, data: string): void => {
    this.agent.call(this.uuid, "media", uuid, data).catch(log.error);
  };

  public onDispose = (): void => {
    this.agent.deregister(this.uuid);
  };
}