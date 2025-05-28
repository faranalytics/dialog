import { EventEmitter } from "node:events";
import { UUID } from "node:crypto";
import { VoIP, VoIPEvents } from "../../../interfaces/voip.js";
import * as ws from "ws";
import { log } from "../../../commons/logger.js";
import { isMediaWebSocketMessage, isStartWebSocketMessage, isStopWebSocketMessage, WebSocketMessage } from "./types.js";
import { Metadata } from "../../../commons/metadata.js";

export class TwilioVoIP implements VoIP {

  public emitter: import("events") <VoIPEvents>;
  protected webSocket?: ws.WebSocket;
  protected metadata: Metadata;

  constructor() {
    this.emitter = new EventEmitter();
    this.metadata = new Metadata();
  }

  public setWebSocket(webScoket: ws.WebSocket) {
    this.webSocket = webScoket;
    this.webSocket.on("message", this.onWebSocketMessage);
    this.emitter.emit("streaming");
  }

  public updateMetadata(metadata: Metadata) {
    Object.assign(this.metadata, metadata);
    this.emitter.emit("metadata", this.metadata);
  }

  public onAgentAbortMedia = (): void => {
    if (this.webSocket) {
      const message = JSON.stringify({
        event: "clear",
        streamSid: this.metadata.streamSid,
      });
      log.info("TwilioVoIP.onAbortMedia");
      this.webSocket.send(message);
    }
  };

  public onTTSMedia = (uuid: UUID, data: string): void => {
    if (this.webSocket) {
      const message = JSON.stringify({
        event: "media",
        streamSid: this.metadata.streamSid,
        media: {
          payload: data,
        },
      });
      this.webSocket.send(message);
    }
  };

  protected onWebSocketMessage = (data: ws.WebSocket.RawData): void => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const message = JSON.parse(data.toString()) as WebSocketMessage;
      if (isMediaWebSocketMessage(message)) {
        log.debug(message, "TwilioVoIP.onWebSocketMessage/event/media");
        this.emitter.emit("media", message.media.payload);
      }
      else if (isStartWebSocketMessage(message)) {
        throw new Error("An unexpected `start` event message was emitted by the WebSocket.");
      }
      else if (isStopWebSocketMessage(message)) {
        if (this.webSocket) {
          this.webSocket.close();
          this.webSocket.off("message", this.onWebSocketMessage);
        }
        this.emitter.emit("dispose");
        this.emitter.removeAllListeners();
      }
      else {
        log.info(message);
      }
    }
    catch (err) {
      log.error(err);
      this.webSocket?.off("message", this.onWebSocketMessage);
    }
  };

  public onDispose = (): void => {
    this.webSocket?.close();
  };
}