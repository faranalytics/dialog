import { TwilioMetadata, TranscriptStatus } from "../../implementations/voip/twilio/types.js";
import { VoIP } from "./voip.js";

export interface TwilioVoIP extends VoIP<TwilioMetadata, TranscriptStatus> {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  startTranscript: () => Promise<void>;
}
