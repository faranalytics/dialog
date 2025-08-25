import { Message } from "./message.js";

export interface Agent {
  inference: (message: Message) => void;
  activate(): void;
  deactivate(): void;
}