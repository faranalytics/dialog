import { UUID } from "node:crypto";

export interface Message<DataT = string> {
  id: UUID;
  data: DataT;
}