import { log } from "../../../commons/logger.js";
import { EventEmitter } from "node:events";
import { Duplex } from "node:stream";
import * as http from "node:http";
import { once } from "node:events";
import { Telnyx } from "telnyx";
import { StreamBuffer } from "../../../commons/stream_buffer.js";
import * as ws from "ws";
import { VoIPControllerEvents } from "../../../interfaces/voip.js";
import { TelnyxVoIP } from "./telnyx_voip.js";
import { isStartWebSocketMessage, WebSocketMessage } from "./types.js";
import { Metadata } from "../../../commons/metadata.js";

export interface HTTPRequestBody {
  data: {
    event_type: string,
    payload: {
      call_control_id: string
    }
  }
};

export interface TelnyxControllerOptions {
  apiKey: string;
  httpServer: http.Server;
  webSocketServer: ws.Server;
  streamURL: string;
}

export class TelnyxController extends EventEmitter<VoIPControllerEvents> {

  protected client: Telnyx;
  protected httpServer: http.Server;
  protected webSocketServer: ws.WebSocketServer;
  protected streamURL: string;
  protected registrar: Map<string, TelnyxVoIP>;

  constructor({ apiKey, httpServer, webSocketServer, streamURL }: TelnyxControllerOptions) {
    super();

    this.client = new Telnyx(apiKey);
    this.httpServer = httpServer;
    this.webSocketServer = webSocketServer;
    this.streamURL = streamURL;
    this.registrar = new Map();

    this.httpServer.on("upgrade", this.onUpgrade);
    this.httpServer.on("request", this.onRequest);
    this.webSocketServer.on("connection", this.onConnection);
  }

  protected onRequest = (req: http.IncomingMessage, res: http.ServerResponse): void => {
    void (async () => {
      try {
        req.on("error", log.error);
        res.on("error", log.error);
        const streamBuffer = new StreamBuffer();
        req.pipe(streamBuffer);
        await once(req, "end");
        const body = JSON.parse(streamBuffer.buffer.toString("utf-8")) as HTTPRequestBody;
        log.info(body, "TelnyxController.onRequest");
        const callControlId = body.data.payload.call_control_id;
        if (body.data.event_type == "call.initiated") {
          log.info(body, "TelnyxController.onRequest/call.initiated");
          const voip = new TelnyxVoIP();
          this.registrar.set(callControlId, voip);
          this.emit("init", voip);
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          //@ts-ignore
          await this.client.calls.answer(callControlId, {
            stream_track: "inbound_track",
            send_silence_when_idle: true,
            webhook_url_method: "POST",
            transcription: false,
            stream_bidirectional_mode: "rtp",
            stream_bidirectional_codec: "PCMU",
          });
        }
        else if (body.data.event_type == "call.answered") {
          log.info(body, "TelnyxController.onRequest/call.answered");
          await this.client.calls.streamingStart(callControlId, {
            stream_track: "inbound_track",
            enable_dialogflow: false,
            stream_url: this.streamURL,
            stream_bidirectional_mode: "rtp",
            stream_bidirectional_target_legs: "self",
            stream_bidirectional_codec: "PCMU"
          });
        }
        else if (body.data.event_type == "call.hangup") {
          log.info(body, "TelnyxController.onRequest/call.hangup");
          const registrant = this.registrar.get(callControlId);
          if (registrant) {
            registrant.emitter.emit("dispose");
            this.registrar.delete(callControlId);
            registrant.emitter.removeAllListeners();
          }
        }
        else if (body.data.event_type == "streaming.started") {
          log.info(body, "TelnyxController.onRequest/streaming.started");
        }
        else if (body.data.event_type == "streaming.stopped") {
          log.info(body, "TelnyxController.onRequest/streaming.stopped");
        }
        else {
          log.info(body, "TelnyxController.onRequest");
        }
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end();
      }
      catch (err) {
        log.error(err);
      }
    })();
  };

  protected onConnection = (webSocket: ws.WebSocket): void => {
    void (async () => {
      try {
        log.notice("TelnyxController.onConnection");
        webSocket.on("error", log.error);
        while (webSocket.readyState == webSocket.OPEN) {
          const data = await once(webSocket, "message");
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          const message = JSON.parse((data[0] as ws.RawData).toString()) as WebSocketMessage;
          if (isStartWebSocketMessage(message)) {
            log.info(message, "TelnyxController.onConnection/event/start");
            const callControlId = message.start.call_control_id;
            const voip = this.registrar.get(callControlId);
            if (voip) {
              const metadata = new Metadata({
                to: message.start.to,
                from: message.start.from,
                channels: message.start.media_format.channels,
                encoding: message.start.media_format.encoding,
                sampleRate: message.start.media_format.sample_rate,
                serverCallStartTime: (new Date()).toISOString()
              });
              voip.setWebSocket(webSocket);
              voip.setMetadata(metadata);
            }
            break;
          }
        }
      }
      catch (err) {
        log.error(err, "TelnyxController.onConnection");
        log.error(err);
      }
    })();
  };

  protected onUpgrade = (req: http.IncomingMessage, socket: Duplex, head: Buffer): void => {
    try {
      log.notice("TelnyxController.onUpgrade");
      socket.on("error", log.error);
      this.webSocketServer.handleUpgrade(req, socket, head, (client: ws.WebSocket, request: http.IncomingMessage) => {
        this.webSocketServer.emit("connection", client, request);
      });
    }
    catch (err) {
      log.error(err);
    }
  };
}