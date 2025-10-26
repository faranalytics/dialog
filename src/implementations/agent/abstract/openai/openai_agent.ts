import { UUID } from "node:crypto";
import { log } from "../../../../commons/logger.js";
import { OpenAI } from "openai";
import { Stream } from "openai/streaming.mjs";
import { Message } from "../../../../interfaces/message/message.js";
import { Agent } from "../../../../interfaces/agent/agent.js";
import { STT } from "../../../../interfaces/stt/stt.js";
import { TTS } from "../../../../interfaces/tts/tts.js";
import { Mutex } from "../../../../commons/mutex.js";
import { VoIP, VoIPEvents } from "../../../../interfaces/voip/voip.js";

export interface OpenAIAgentOptions<VoIPT extends VoIP<never, never, VoIPEvents<never, never>>> {
  voip: VoIPT;
  stt: STT;
  tts: TTS;
  apiKey: string;
  model: string;
  queueSizeLimit?: number;
}

export abstract class OpenAIAgent<VoIPT extends VoIP<never, never, VoIPEvents<never, never>>> implements Agent {
  protected voip: VoIPT;
  protected stt: STT;
  protected tts: TTS;
  protected openAI: OpenAI;
  protected model: string;
  protected stream?: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>;
  protected activeMessages: Set<UUID>;
  protected dispatches: Set<UUID>;
  protected mutex: Mutex;

  constructor({ apiKey, model, voip, stt, tts, queueSizeLimit }: OpenAIAgentOptions<VoIPT>) {
    this.mutex = new Mutex({ queueSizeLimit });
    this.dispatches = new Set();
    this.voip = voip;
    this.tts = tts;
    this.stt = stt;
    this.activeMessages = new Set();
    this.openAI = new OpenAI({ apiKey: apiKey });
    this.model = model;
  }

  public abstract inference: (message: Message) => Promise<void>;

  public post = (message: Message): void => {
    if (message.data == "") {
      return;
    }
    this.activeMessages.add(message.uuid);
    this.mutex.call("inference", (message) => this.inference(message), message).catch(this.dispose);
  };

  protected dispatchStream = async (
    uuid: UUID,
    stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>,
    allowInterrupt = true
  ): Promise<string> => {
    try {
      let assistantMessage = "";
      if (!allowInterrupt) {
        this.dispatches.add(uuid);
        const dispatch = this.createDispatch(uuid);
        assistantMessage = await this.postStream(uuid, stream);
        log.notice(`Awaiting dispatch for ${uuid}.`);
        await dispatch;
      } else {
        assistantMessage = await this.postStream(uuid, stream);
      }
      return assistantMessage;
    } finally {
      if (!allowInterrupt) {
        this.dispatches.delete(uuid);
      }
    }
  };

  protected dispatchMessage = async (message: Message, allowInterrupt = true): Promise<string> => {
    try {
      if (!allowInterrupt) {
        this.dispatches.add(message.uuid);
        const dispatch = this.createDispatch(message.uuid);
        this.tts.post(message);
        log.notice(`Awaiting dispatch for ${message.uuid}.`);
        await dispatch;
      } else {
        this.tts.post(message);
      }
      return message.data;
    } finally {
      if (!allowInterrupt) {
        this.dispatches.delete(message.uuid);
      }
    }
  };

  protected postStream = async (
    uuid: UUID,
    stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>
  ): Promise<string> => {
    let assistantMessage = "";
    for await (const chunk of stream) {
      if (!this.activeMessages.has(uuid)) {
        stream.controller.abort();
        return assistantMessage;
      }
      const content = chunk.choices[0].delta.content ?? "";
      assistantMessage = assistantMessage + content;
      if (chunk.choices[0].finish_reason) {
        this.tts.post({ uuid: uuid, data: content, done: true });
        break;
      }
      if (content) {
        this.tts.post({ uuid: uuid, data: content, done: false });
      }
    }
    return assistantMessage;
  };

  protected createDispatch = (uuid: UUID): Promise<UUID> => {
    const dispatch = new Promise<UUID>((r) => {
      const dispatched = (_uuid: UUID) => {
        if (_uuid == uuid) {
          this.voip.off("message_dispatched", dispatched);
          r(uuid);
        }
      };
      this.voip.on("message_dispatched", dispatched);
    });
    return dispatch;
  };

  public abort = (): void => {
    log.notice("", "OpenAIAgent.abort");
    for (const uuid of Array.from(this.activeMessages.values())) {
      if (!this.dispatches.has(uuid)) {
        this.tts.abort(uuid);
        this.voip.abort(uuid);
        this.activeMessages.delete(uuid);
      }
    }
  };

  protected deleteActiveMessage = (uuid: UUID): void => {
    this.activeMessages.delete(uuid);
  };

  public dispose = (err?: unknown): void => {
    try {
      if (err) {
        log.error(err, "OpenAIAgent.dispose");
      }
      this.deactivate();
      if (this.stream) {
        this.stream.controller.abort();
      }
      this.tts.dispose();
      this.stt.dispose();
      this.voip.dispose();
    } catch (err) {
      log.error(err);
    }
  };

  public setTTS = (tts: TTS): void => {
    this.tts.off("message", this.voip.post);
    this.tts.off("error", this.dispose);
    this.tts.dispose();
    this.tts = tts;
    this.tts.on("message", this.voip.post);
    this.tts.on("error", this.dispose);
  };

  public setSTT = (stt: STT): void => {
    this.stt.off("message", this.post);
    this.stt.off("vad", this.abort);
    this.stt.off("error", this.dispose);
    this.stt.dispose();
    this.stt = stt;
    this.stt.on("message", this.post);
    this.stt.on("vad", this.abort);
    this.stt.on("error", this.dispose);
  };

  public activate(): void {
    this.voip.on("error", this.dispose);
    this.voip.on("message", this.stt.post);
    this.voip.on("message_dispatched", this.deleteActiveMessage);
    this.stt.on("message", this.post);
    this.stt.on("vad", this.abort);
    this.stt.on("error", this.dispose);
    this.tts.on("message", this.voip.post);
    this.tts.on("error", this.dispose);
  }

  public deactivate(): void {
    this.voip.off("error", this.dispose);
    this.voip.off("message", this.stt.post);
    this.voip.off("message_dispatched", this.deleteActiveMessage);
    this.stt.off("message", this.post);
    this.stt.off("vad", this.abort);
    this.stt.off("error", this.dispose);
    this.tts.off("message", this.voip.post);
    this.tts.off("error", this.dispose);
  }
}
