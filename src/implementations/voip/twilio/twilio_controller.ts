import { log } from "../../../commons/logger.js";
import { EventEmitter } from "node:events";
import { Duplex } from "node:stream";
import * as http from "node:http";
import { once } from "node:events";
import { StreamBuffer } from "../../../commons/stream_buffer.js";
import * as ws from "ws";
import { VoIPControllerEvents } from "../../../interfaces/voip.js";
import { TwilioVoIP } from "./twilio_voip.js";
import { isStartWebSocketMessage, WebSocketMessage, Body } from "./types.js";
import * as qs from "node:querystring";
import { createResponse } from "./templates.js";

export interface HTTPRequestBody {
  data: {
    event_type: string,
    payload: {
      call_control_id: string
    }
  }
};

export interface TwilioControllerOptions {
  httpServer: http.Server;
  webSocketServer: ws.Server;
  streamURL: string;
}

export class TwilioController extends EventEmitter<VoIPControllerEvents> {

  protected httpServer: http.Server;
  protected webSocketServer: ws.WebSocketServer;
  protected streamURL: string;
  protected registrar: Map<string, TwilioVoIP>;

  constructor({ httpServer, webSocketServer, streamURL }: TwilioControllerOptions) {
    super();
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
        const url = new URL(`https://farar.net:3443${req.url ?? ""}`);;
        if (!(url.pathname == "/twiml" && req.method == "POST")) {
          res.writeHead(404);
          res.end();
          return;
        }

        const streamBuffer = new StreamBuffer();
        req.pipe(streamBuffer);
        await once(req, "end");

        const body = qs.parse(streamBuffer.buffer.toString("utf-8")) as unknown as Body;
        const voip = new TwilioVoIP();
        this.registrar.set(body.CallSid, voip);
        const response = createResponse(this.streamURL);
        res.writeHead(200, {
          "Content-Type": "text/xml",
          "Content-Length": Buffer.byteLength(response)
        });
        res.end(response);
        this.emit("init", voip);
        voip.updateMetadata({ to: body.To, from: body.From });
      }
      catch (err) {
        log.error(err);
      }
    })();
  };

  protected onConnection = (webSocket: ws.WebSocket): void => {
    void (async () => {
      try {
        log.info("TwilioController.onConnection");
        webSocket.on("error", log.error);
        while (webSocket.readyState == webSocket.OPEN) {
          const data = await once(webSocket, "message");
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          const message = JSON.parse((data[0] as ws.RawData).toString()) as WebSocketMessage;
          if (isStartWebSocketMessage(message)) {
            log.debug(message, "TwilioController.onConnection/event/start");
            const callSid = message.start.callSid;
            const voip = this.registrar.get(callSid);
            if (voip) {
              voip.setWebSocket(webSocket);
              voip.updateMetadata({
                callSid: callSid,
                streamSid: message.start.streamSid,
                channels: message.start.mediaFormat.channels,
                encoding: message.start.mediaFormat.encoding,
                sampleRate: message.start.mediaFormat.sampleRate,
              });
            }
            break;
          }
        }
      }
      catch (err) {
        log.error(err);
      }
    })();
  };

  protected onUpgrade = (req: http.IncomingMessage, socket: Duplex, head: Buffer): void => {
    try {
      log.info("TwilioController.onUpgrade");
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