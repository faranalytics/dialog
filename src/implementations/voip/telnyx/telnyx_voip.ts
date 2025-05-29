import { EventEmitter } from "node:events";
import { UUID } from "node:crypto";
import { VoIP, VoIPEvents } from "../../../interfaces/voip.js";
import * as ws from "ws";
import { Metadata } from "../../../commons/metadata.js";
import { log } from "../../../commons/logger.js";
import { WebSocketMessage, isMediaWebSocketMessage, isStartWebSocketMessage, isStopWebSocketMessage } from "./types.js";

export class TelnyxVoIP implements VoIP {

  public emitter: import("events") <VoIPEvents>;
  protected webSocket?: ws.WebSocket;
  protected metadata?: Metadata;
  protected callControlId?: string;

  constructor() {
    this.emitter = new EventEmitter();
  }

  public setWebSocket(webScoket: ws.WebSocket) {
    this.webSocket = webScoket;
    this.webSocket.on("message", this.onWebSocketMessage);
    this.emitter.emit("streaming");
  }

  public setMetadata(metadata: Metadata) {
    this.metadata = metadata;
    this.emitter.emit("metadata", this.metadata);
  }

  public onAbortMedia = (): void => {
    if (this.webSocket) {
      const message = JSON.stringify({
        event: "clear",
      });
      this.webSocket.send(message);
    }
  };

  public onMedia = (uuid: UUID, data: string): void => {
    if (this.webSocket) {
      this.webSocket.send(JSON.stringify({
        event: "media",
        media: {
          payload: data,
        },
      }));
    }
  };

  protected onWebSocketMessage = (data: ws.WebSocket.RawData): void => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const message = JSON.parse(data.toString()) as WebSocketMessage;
      if (isMediaWebSocketMessage(message)) {
        log.debug(message);
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
      log.error(err, "TelnyxVoIP/onWebSocketMessage");
      this.webSocket?.off("message", this.onWebSocketMessage);
    }
  };

  public onDispose = (): void => {
    this.webSocket?.close();
  };
}