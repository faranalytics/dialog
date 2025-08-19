import { EventEmitter } from "node:events";
import { VoIPEvents, VoIP } from "../../../interfaces/voip.js";
import { Message } from "../../../interfaces/message.js";
import { WebSocketListener } from "./twilio_controller.js";
import * as ws from "ws";
import { log } from "../../../commons/logger.js";

export class TwilioVoIP extends EventEmitter<VoIPEvents> implements VoIP {
  protected webSocketListener?: WebSocketListener;
  protected webSocket?: ws.WebSocket;
  protected streamSid?: string;
  protected callSid?: string;

  public setWebSocketListener(webSocketListener: WebSocketListener) {
    this.webSocketListener = webSocketListener;
    this.webSocket = webSocketListener.webSocket;
    this.streamSid = webSocketListener.startMessage?.streamSid;
    this.callSid = webSocketListener.startMessage?.start.callSid;
  }

  public postAgentMessage(message: Message): void {
    try {
      log.debug("TwilioVoIP.postAgentMessage");
      if (message.data != "") {
        const serialized = JSON.stringify({
          event: "media",
          streamSid: this.streamSid,
          media: {
            payload: message.data,
          },
        });
        this.webSocket?.send(serialized);
      }
      if (message.done) {
        log.debug("TwilioVoIP.postAgentMessage/done");
        const serialized = JSON.stringify({
          event: "mark",
          streamSid: this.streamSid,
          mark: {
            name: message.uuid
          }
        });
        this.webSocket?.send(serialized);
      }
    }
    catch (err) {
      log.error(err, "TwilioVoIP.postAgentMessage");
      this.webSocketListener?.webSocket.close(1008);
    }
  }

  public abortMedia(): void {
    try {
      log.info("TwilioVoIP.abortMedia");
      const message = JSON.stringify({
        event: "clear",
        streamSid: this.streamSid,
      });
      this.webSocket?.send(message);
    }
    catch (err) {
      log.error(err, "TwilioVoIP.abortMedia");
      this.webSocket?.close(1008);
    }
  }

  public transfer(): void {
    try {

    }
    catch (err) {
      log.error(err, "WebSocketListener.postHangup");
      this.webSocket?.close(1008);
    }
  }

  public hangup(): void {
    try {

    }
    catch (err) {
      log.error(err, "WebSocketListener.postHangup");
      this.webSocket?.close(1008);
    }
  }
}