import { Message } from "./message.js";

export interface Agent {
  inference: (message: Message) => Promise<void>;
  activate(): void;
  deactivate(): void;
}