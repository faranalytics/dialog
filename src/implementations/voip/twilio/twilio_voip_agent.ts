import { log } from "../../../commons/logger.js";
import { Worker } from "node:worker_threads";
import { Agent } from "port_agent";
import { TwilioVoIP } from "./twilio_voip.js";

export interface TwilioVoIPAgentOptions {
  worker: Worker;
  voip: TwilioVoIP;
}

export class TwilioVoIPAgent extends Agent {
  
  protected voip: TwilioVoIP;

  constructor({ worker, voip }: TwilioVoIPAgentOptions) {
    super(worker);
    this.voip = voip;
    for (const eventName of this.voip.eventNames()) {
      this.voip.on(eventName, (...args: unknown[]) => {
        this.call("propagateEvent", ...args).catch((err: unknown) => { log.error(err); });
      });
    }
    this.register("post", this.voip.post);
    this.register("abort", this.voip.abort);
    this.register("hangup", this.voip.hangup);
    this.register("tansferTo", this.voip.transferTo);
    this.register("startRecording", this.voip.startRecording);
    this.register("stopRecording", this.voip.stopRecording);
    this.register("removeRecording", this.voip.removeRecording);
    this.register("startTranscript", this.voip.startTranscript);
    this.register("dipose", this.voip.dispose);
  }
}