import { UUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { Message } from "./message.js";
import { Metadata } from "./metadata.js";

export interface VoIPEvents<MetadataT, TranscriptT> {
  "metadata": [MetadataT];
  "message": [Message];
  "message_dispatched": [UUID];
  "transcript": [TranscriptT];
  "recording_url": [string];
  "streaming_started": [];
  "streaming_stopped": [];
  "error": [unknown];
}

export interface VoIP<MetadataT, TranscriptT, EventsT extends Record<keyof EventsT, unknown[]> = VoIPEvents<MetadataT, TranscriptT>> extends EventEmitter<VoIPEvents<MetadataT, TranscriptT> & EventsT> {
  post: (message: Message) => void;
  abort: (uuid: UUID) => void;
  updateMetadata: (metadata: Metadata) => void;
  hangup: () => void;
  transferTo: (tel: string) => void;
  dispose: () => void;
};