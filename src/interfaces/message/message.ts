import { UUID } from "node:crypto";

export interface Message<DataT = string> {
  uuid: UUID;
  data: DataT;
  done: boolean;
}
