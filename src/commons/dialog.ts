import { EventEmitter } from "node:events";
import { Agent } from "../interfaces/agent.js";
import { STT } from "../interfaces/stt.js";
import { TTS } from "../interfaces/tts.js";
import { VoIP } from "../interfaces/voip.js";
import { log } from "./logger.js";
import { randomUUID, UUID } from "node:crypto";

export interface DialogEvents {
  "dispose": [];
}

export interface DialogOptions {
  voip: VoIP;
  stt: STT;
  tts: TTS;
  agent: Agent;
}

export class Dialog {

  public voip: VoIP;
  public stt: STT;
  public tts: TTS;
  public agent: Agent;

  protected uuid: UUID;
  protected emitter: EventEmitter<DialogEvents>;

  constructor({ voip, stt, tts, agent }: DialogOptions) {
    this.voip = voip;
    this.stt = stt;
    this.tts = tts;
    this.agent = agent;
    this.emitter = new EventEmitter();
    this.uuid = randomUUID();
  }

  public start(): void {
    this.connectGraph();
    log.notice(`Dialog instance ${this.uuid} started.`);
  }

  protected connectVoip(): void {
    this.voip.emitter.on("media", this.stt.onMedia);
    this.voip.emitter.on("streaming", this.agent.onStreaming);
    this.voip.emitter.on("metadata", this.agent.onUpdateMetadata);
    this.voip.emitter.on("dispose", this.onDispose);
  }

  protected connectSTT(): void {
    this.stt.emitter.on("transcript", this.agent.onTranscript);
    this.stt.emitter.on("vad", this.agent.onVAD);
    this.stt.emitter.on("dispose", this.onDispose);
  }

  protected connectTTS(): void {
    this.tts.emitter.on("media", this.voip.onMedia);
    this.tts.emitter.on("transcript_dispatched", this.agent.onTranscriptDispatched);
    this.tts.emitter.on("dispose", this.onDispose);
  }

  protected connectAgent(): void {
    this.agent.emitter.on("transcript", this.tts.onTranscript);
    this.agent.emitter.on("abort_transcript", this.tts.onAbortTranscript);
    this.agent.emitter.on("abort_media", this.voip.onAbortMedia);
    this.agent.emitter.on("dispose", this.onDispose);
    this.agent.emitter.on("set_stt", this.onSetSTT);
    this.agent.emitter.on("set_tts", this.onSetTTS);
    this.agent.emitter.on("set_agent", this.onSetAgent);
  }

  protected connectDialog(): void {
    this.emitter.on("dispose", this.voip.onDispose);
    this.emitter.on("dispose", this.stt.onDispose);
    this.emitter.on("dispose", this.tts.onDispose);
    this.emitter.on("dispose", this.agent.onDispose);
  }

  protected connectGraph(): void {
    this.connectVoip();
    this.connectSTT();
    this.connectAgent();
    this.connectTTS();
    this.connectDialog();
  }

  protected disconnectGraph(): void {
    this.voip.emitter.removeAllListeners();
    this.stt.emitter.removeAllListeners();
    this.agent.emitter.removeAllListeners();
    this.tts.emitter.removeAllListeners();
    this.emitter.removeAllListeners();
  }

  public onSetSTT = (stt: STT): void => {
    this.disconnectGraph();
    this.stt = stt;
    this.connectGraph();
  };

  public onSetTTS = (tts: TTS): void => {
    this.disconnectGraph();
    this.tts = tts;
    this.connectGraph();
  };

  public onSetAgent = (agent: Agent): void => {
    this.disconnectGraph();
    this.agent = agent;
    this.connectGraph();
  };

  public onDispose = (): void => {
    try {
      this.emitter.emit("dispose");
    }
    catch (err) {
      log.error(err);
    }
  };
}