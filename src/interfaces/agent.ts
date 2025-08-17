export interface Agent {
  activate(): void;
  deactivate(): void;
  dispose(): void;
}