/* eslint-disable @stylistic/ts/indent */
import { EventEmitter } from "node:events";

export type ExtractMetadataT<SessionT> = (
  SessionT extends EventEmitter<infer EventsT> ?
  (
    EventsT extends { metadata: infer ArgsT } ?
    (
      ArgsT extends unknown[] ? ArgsT[0] : never)
    : never
  )
  : never
);