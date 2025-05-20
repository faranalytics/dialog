import { EventEmitter } from "node:events";
import { UUID } from "node:crypto";
import { Metadata } from "../commons/metadata.js";
import * as ws from "ws";

export interface VoIPEvents {
  "media_in": [string];
  "metadata": [Metadata];
  "streaming": [];
  "dispose": [];
}

export interface VoIP {
  emitter: EventEmitter<VoIPEvents>;
  onMediaOut: (uuid: UUID, data: string) => void;
  setMetadata?: (metadata: Metadata) => void;
  setWebSocket?: (webScoket: ws.WebSocket) => void;
}

export interface VoIPControllerEvents {
  "init": [VoIP]
}