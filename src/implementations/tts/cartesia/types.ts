export interface CartesiaMessage {
  type: string;
  context_id: string;
}

export interface CartesiaTimestamp {
  type: "timestamps";
  context_id: string;
  status_code: number;
  done: boolean;
  word_timestamps: { words: string[], start: number[], end: number[] }
}

export interface CartesiaChunk {
  type: "chunk",
  context_id: string;
  status_code: number;
  done: false;
  data: string;
  step_time: number;
  flush_id: number;
}
