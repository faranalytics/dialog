import { log } from "../../../commons/logger.js";
import { Worker } from "node:worker_threads";
import { Agent } from "port_agent";
import { TwilioVoIP } from "./twilio_voip.js";

export interface TwilioVoIPWorkerOptions {
  worker: Worker;
  voip: TwilioVoIP;
}

export class TwilioVoIPWorker extends Agent {
  protected voip: TwilioVoIP;

  constructor({ worker, voip }: TwilioVoIPWorkerOptions) {
    super(worker);
    this.voip = voip;
    this.voip.on("metadata", (...args) => {
      this.call("propagate", "metadata", ...args).catch((err: unknown) => {
        log.error(err);
      });
    });
    this.voip.on("message", (...args) => {
      this.call("propagate", "message", ...args).catch((err: unknown) => {
        log.error(err);
      });
    });
    this.voip.on("message_dispatched", (...args) => {
      this.call("propagate", "message_dispatched", ...args).catch((err: unknown) => {
        log.error(err);
      });
    });
    this.voip.on("transcript", (...args) => {
      this.call("propagate", "transcript", ...args).catch((err: unknown) => {
        log.error(err);
      });
    });
    this.voip.on("recording_url", (...args) => {
      this.call("propagate", "recording_url", ...args).catch((err: unknown) => {
        log.error(err);
      });
    });
    this.voip.on("streaming_started", (...args) => {
      this.call("propagate", "streaming_started", ...args).catch((err: unknown) => {
        log.error(err);
      });
    });
    this.voip.on("streaming_stopped", (...args) => {
      this.call("propagate", "streaming_stopped", ...args).catch((err: unknown) => {
        log.error(err);
      });
    });
    this.voip.on("error", (...args) => {
      this.call("propagate", "error", ...args).catch((err: unknown) => {
        log.error(err);
      });
    });
    this.register("post", this.voip.post);
    this.register("abort", this.voip.abort);
    this.register("hangup", this.voip.hangup);
    this.register("transferTo", this.voip.transferTo);
    this.register("startRecording", this.voip.startRecording);
    this.register("stopRecording", this.voip.stopRecording);
    this.register("removeRecording", this.voip.removeRecording);
    this.register("startTranscript", this.voip.startTranscript);
    this.register("dispose", this.voip.dispose);
  }
}
