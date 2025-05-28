import { EventEmitter } from "node:events";
import { Agent } from "../interfaces/agent.js";
import { STT } from "../interfaces/stt.js";
import { TTS } from "../interfaces/tts.js";
import { VoIP } from "../interfaces/voip.js";
import { log } from "./logger.js";

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
  protected emitter: EventEmitter<DialogEvents>;

  constructor({ voip, stt, tts, agent }: DialogOptions) {
    this.voip = voip;
    this.stt = stt;
    this.tts = tts;
    this.agent = agent;
    this.emitter = new EventEmitter();
  }

  public start(): void {
    this.connect();
  }

  protected connectVoip(): void {
    this.voip.emitter.on("media", this.stt.onVoIPMedia);
    this.voip.emitter.on("streaming", this.agent.onVoIPStreaming);
    this.voip.emitter.on("metadata", this.agent.onVoIPUpdateMetadata);
    this.voip.emitter.on("dispose", this.onDispose);
  }

  protected connectSTT(): void {
    this.stt.emitter.on("transcript", this.agent.onSTTTranscript);
    this.stt.emitter.on("vad", this.agent.onSTTVAD);
    this.stt.emitter.on("dispose", this.onDispose);
  }

  protected connectTTS(): void {
    this.tts.emitter.on("media", this.voip.onTTSMedia);
    this.tts.emitter.on("transcript_dispatched", this.agent.onTTSTranscriptDispatched);
    this.tts.emitter.on("dispose", this.onDispose);
  }

  protected connectAgent(): void {
    this.agent.emitter.on("transcript", this.tts.onAgentTranscript);
    this.agent.emitter.on("abort_transcript", this.tts.onAgentAbortTranscript);
    this.agent.emitter.on("abort_media", this.voip.onAgentAbortMedia);
    this.agent.emitter.on("dispose", this.onDispose);
    this.agent.emitter.on("set_stt", this.onSetSTT);
    this.agent.emitter.on("set_tts", this.onSetTTS);
    this.agent.emitter.on("set_agent", this.onSetAgent);
  }

  protected connectThis(): void {
    this.emitter.on("dispose", this.voip.onDispose);
    this.emitter.on("dispose", this.stt.onDispose);
    this.emitter.on("dispose", this.tts.onDispose);
    this.emitter.on("dispose", this.agent.onDispose);
  }

  protected connect(): void {
    this.connectVoip();
    this.connectSTT();
    this.connectAgent();
    this.connectTTS();
    this.connectThis();
  }

  protected disconnect(): void {
    this.voip.emitter.removeAllListeners();
    this.stt.emitter.removeAllListeners();
    this.agent.emitter.removeAllListeners();
    this.tts.emitter.removeAllListeners();
    this.emitter.removeAllListeners();
  }

  public onSetSTT = (stt: STT): void => {
    this.disconnect();
    this.stt = stt;
    this.connect();
  };

  public onSetTTS = (tts: TTS): void => {
    this.disconnect();
    this.tts = tts;
    this.connect();
  };

  public onSetAgent = (agent: Agent): void => {
    this.disconnect();
    this.agent = agent;
    this.connect();
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