import { EventEmitter } from "node:events";
import * as worker_threads from "node:worker_threads";
import { Agent } from "port_agent";
import { randomUUID, UUID } from "node:crypto";
import { VoIP } from "../../interfaces/voip.js";
import { VoIPControllerEvents } from "../../interfaces/voip.js";
import { log } from "../logger.js";

export interface WorkerPoolOptions {
  controller: EventEmitter<VoIPControllerEvents>;
  workerURL: string | URL;
}
export class WorkerPool {

  protected controller: EventEmitter<VoIPControllerEvents>;
  protected workerURL: string | URL;

  constructor({ controller, workerURL }: WorkerPoolOptions) {
    this.controller = controller;
    this.workerURL = workerURL;
    this.controller.on("init", this.onInit);

    // TODO: Implement a worker pool.  The current implementation instantiates a thread for each incoming call.
  }

  protected onInit = (voip: VoIP): void => {
    try {
      const worker = new worker_threads.Worker(new URL(`${this.workerURL}?${Date.now().toString()}`));
      worker.on("error", log.error);
      const agent = new Agent(worker);
      const uuid = randomUUID();
      voip.emitter.on("media_in", (data: string) => {
        agent.call(uuid, "media_in", data).catch(log.error);
      });
      voip.emitter.on("streaming", () => {
        agent.call(uuid, "streaming").catch(log.error);
      });
      voip.emitter.on("metadata", () => {
        agent.call(uuid, "metadata").catch(log.error);
      });
      voip.emitter.on("dispose", () => {
        agent.call(uuid, "dispose").catch(log.error);
        agent.deregister(uuid);
      });
      agent.register(uuid, (event: string, uuid: UUID, data: string) => {
        if (event == "media_out") {
          voip.onMediaOut(uuid, data);
        }
        else if (event == "abort_media") {
          voip.onAbortMedia();
        }
      });
      agent.call("init", uuid).catch(log.error);
    }
    catch (err) {
      log.error(err);
    }
  };
}