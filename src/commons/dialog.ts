import { Agent } from "../interfaces/agent.js";
import { STT } from "../interfaces/stt.js";
import { TTS } from "../interfaces/tts.js";
import { VoIP } from "../interfaces/voip.js";

export interface DialogOptions {
  voip: VoIP;
  stt: STT;
  tts: TTS;
  agent: Agent;
}

export class Dialog {

  protected voip: VoIP;
  protected stt: STT;
  protected tts: TTS;
  protected agent: Agent;

  constructor({ voip, stt, tts, agent }: DialogOptions) {
    this.voip = voip;
    this.stt = stt;
    this.tts = tts;
    this.agent = agent;
  }

  public start() {
    this.voip.emitter.on("media_in", this.stt.onAudio);
    this.voip.emitter.on("streaming", this.agent.onStreaming);
    this.voip.emitter.on("metadata", this.agent.onMetadata);
    this.voip.emitter.on("dispose", this.stt.onDispose);
    this.voip.emitter.on("dispose", this.tts.onDispose);
    this.voip.emitter.on("dispose", this.agent.onDispose);

    this.stt.emitter.on("transcript", this.agent.onTranscript);
    this.stt.emitter.on("abort_media", this.tts.onAbortMedia);
    this.stt.emitter.on("abort_media", this.voip.onAbortMedia);

    this.tts.emitter.on("media_out", this.voip.onMediaOut);
    this.tts.emitter.on("transcript_dispatched", this.agent.onTranscriptDispatched);

    this.agent.emitter.on("transcript", this.tts.onTranscript);
    this.agent.emitter.on("abort_transcript", this.tts.onAbortTranscript);
  }
}