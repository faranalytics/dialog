# Dialog

A modular framework for building VoIP-Agent applications.

## Introduction

Dialog is an orchestration layer for VoIP-Agent applications. Two _common_ VoIP-Agent models exist today: the Speech-to-Speech (S2S) model and the Speech-to-Text with Text-to-Speech (STT–TTS) model.

The S2S model converts spoken input into spoken output, while the STT–TTS model first converts speech into text, which is processed by an Agent; the Agent’s textual response is then converted back into speech. Both approaches involve tradeoffs.

Dialog adopts the STT–TTS model. It orchestrates communication between the VoIP, STT, TTS, and Agent modules. The framework provides concrete implementations of VoIP, STT, and TTS modules, along with abstract Agent classes designed for subclassing.

### Features

- Simple, extensible, modular framework
- Concrete implementations for VoIP, STT, and TTS, plus abstract Agent classes for extension
- Multithreaded deployments
- Event-driven architecture
- Isolated state — modules exchange objects but never share references

**NB** Dialog is a well architected and production-grade implementation; however, it is still undergoing active refactoring. Prior to 1.0.0, public interfaces may change on turns of the minor and commit messages will be minimal.

## Table of contents

- [Installation](#installation)
- [Usage](#usage)
- [Examples](#examples)
- [Architecture](#architecture)
- [Implementations](#implementations)
- [Custom Implementations](#custom-implementations)
- [Multithreading](#multithreading)
- [API](#api)
- [Troubleshooting](#troubleshooting)
- [Alternatives](#alternatives)
- [Support](#support)

## Installation

### Development Installation

These instructions describe how to clone the Dialog repository and build the package.

#### Clone the repository.

```bash
git clone https://github.com/faranalytics/dialog.git
```

#### Change directory into the Dialog repository.

```bash
cd dialog
```

#### Install the package dependencies.

```bash
npm install && npm update
```

#### Build the Dialog package.

You can use the `clean:build` script in order to do a clean build.

```bash
npm run clean:build
```

Alternatively, you can use the `watch` script in order to watch and build the package. This will build the package each time you make a change to a file in `./src`. If you use the `watch` script, you will need to open a new terminal in order to build and run your application.

```bash
npm run watch
```

### Install Dialog into your package

#### Change directory into your package directory and install the package.

```bash
npm install <path-to-the-dialog-respository> --save
```

You should now be able to import Dialog artifacts into your package.

## Usage

### How it works

When a call is initiated, a `Gateway` (e.g., a Twilio Gateway) emits a `voip` event. The `voip` handler is called with a `VoIP` instance as its single argument. The `VoIP` instance handles the web socket connection that is set on it by the `Gateway`. In the `voip` handler, an instance of an `Agent` is constructed by passing a `VoIP`, `STT`, and `TTS` implementation into its constructor. The agent is started by calling its `activate` method. The `activate` method of the `Agent` instance connects the interfaces that comprise the application.

An important characteristic of the architecture is that a _new_ instance of each participant in a Dialog application — `VoIP`, `STT`, `TTS`, and `Agent` — is created for every call. This allows each instance to maintain state specific to its call.

Excerpted from `src/main.ts`.

```ts
...
const gateway = new TwilioGateway({
  httpServer,
  webSocketServer,
  webhookURL: new URL(WEBHOOK_URL),
  authToken: TWILIO_AUTH_TOKEN,
  accountSid: TWILIO_ACCOUNT_SID
});

gateway.on("voip", (voip: TwilioVoIP) => {
  const agent = new TwilioVoIPOpenAIAgent({
    voip: voip,
    stt: new DeepgramSTT({ apiKey: DEEPGRAM_API_KEY, liveSchema: DEEPGRAM_LIVE_SCHEMA }),
    tts: new CartesiaTTS({ apiKey: CARTESIA_API_KEY, speechOptions: CARTESIA_SPEECH_OPTIONS }),
    apiKey: OPENAI_API_KEY,
    system: OPENAI_SYSTEM_MESSAGE,
    greeting: OPENAI_GREETING_MESSAGE,
    model: OPENAI_MODEL,
    twilioAccountSid: TWILIO_ACCOUNT_SID,
    twilioAuthToken: TWILIO_AUTH_TOKEN
  });

  agent.activate();
});
...
```

## Examples

Example implementations are provided in the [examples](https://github.com/faranalytics/dialog/tree/main/examples/) subpackages.

### _Custom Twilio VoIP + OpenAI Agent_

In the [Custom Twilio VoIP + OpenAI Agent](https://github.com/faranalytics/dialog/tree/main/examples/custom_twilio_voip_openai_agent) example you will create a simple hypothetical Agent that prepends its messages with a timestamp and manages its conversation history.

### _Twilio VoIP (Worker Thread Bridge)_

In the [Twilio VoIP (Worker Thread Bridge)](https://github.com/faranalytics/dialog/tree/main/examples/twilio_threading) example you will use a worker thread bridge in order to run each call session and Agent instance in a worker thread.

### _Twilio VoIP + OpenAI Agent (Deepgram STT + Cartesia TTS)_

In the minimal [Twilio VoIP + OpenAI Agent (Deepgram STT + Cartesia TTS)](https://github.com/faranalytics/dialog/tree/main/examples/twilio_voip_openai_agent) example you will subclass the provided abstract Agent implementation and implement the abstract `Agent.inference` method.

### Environment setup

The following instructions apply to all the examples.

#### Environment variables

Each example includes a `.env.template` file with the variables required to contruct the respective participant:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `DEEPGRAM_API_KEY`
- `ELEVEN_LABS_API_KEY`
- `CARTESIA_API_KEY`
- `OPENAI_API_KEY`
- `KEY_FILE`
- `CERT_FILE`
- `HOST_NAME`
- `PORT`
- `WEBHOOK_URL`

Copy the template to `.env` and fill in your own values. Do not commit real secrets.

#### TLS certificates

The examples use simple HTTPS and WSS servers. Set `KEY_FILE` and `CERT_FILE` to the absolute paths of your TLS private key and certificate files on your system.

## Architecture

### Concepts

#### Participants

Each component of a Dialog orchestration, including the **User**(s), the **Agent** and its LLM(s), the **STT** model, the **TTS** model, and the **VoIP** implementation, is a _participant_.

##### User

The **User** participant is typically the human(s) who initiated an incoming call or answered an outgoing call. A **User** may also be another **Agent**.

##### Agent

The **Agent** participant is essential to assembling the external LLM, the **VoIP**, **STT**, and **TTS** implementations into a working whole. Dialog, as the _orchestration layer_, does not provide a concrete **Agent** implementation. Instead you are provided with an interface and abstract class that you can implement or subclass with your custom special tool calling logic. For example, an **Agent** will decide when to transfer a call; if the LLM determines the **User** intent is to be transferred, the **Agent** can carry out this intent by calling the `VoIP.transferTo` method — or it could circumvent the provided call transfer facilities entirely and make a direct call to the VoIP provider (e.g., Twilio, Telnyx, etc.) API. The point here is that very little architectural constraints should be imposed on the Agent; this ensures the extensibility of the architecture.

##### STT

The **STT** participant transcribes the **User** speech into text. The **STT** emits utterance and VAD events that may be consumed by the **Agent**.

##### TTS

The **TTS** participant synthesizes the text received from the **Agent** and/or LLM. The **TTS** emits message events that may be consumed by the **Agent**.

##### VoIP

The **VoIP** participant handles the incoming call, transcriptions, recordings, and streams audio into the **STT**.

### Overview

Dialog favors simplicity and accessibility over feature richness. Its architecture should meet all the requirements of a typical VoIP-Agent application where many Users interact with a set of Agents. Although Dialog doesn't presently support concepts like "rooms", the simplicity and extensibility of its architecture should lend to even more advanced implementations.

#### State

Each participant in a Dialog orchestration must not directly mutate the state of another participant. Participants may emit messages and consume the messages of other participants and they may hold references to each other; however the mutation of an object held by one participant should _never_ directly mutate the state of an object held by another participant. This is an important characteristic of Dialog participants — they exhibit isolated state — modules exchange objects but never share references. For example, a VoIP participant may emit a `Metadata` object that contains information about a given incoming call that is consumed by other participants; however, _a subsequent mutation in the VoIP's `Metadata` must not mutate the `Metadata` in another participant._

This strict separation of concerns ensures that participant state remains predictable and easy for a _human_ to reason about. **Likewise, the architecture is expected to be easy for LLMs to consume, as the LLM's attention can be focused on the pattern that is exhibited by the relevant participant.**

#### Data flow

```
+-------------+   audio (base64)   +------------+     transcripts      +----------+   text   +-------------+
|  Twilio     | ------------------>|    STT     | -------------------> |  Agent   | -------> |    TTS      |
|   VoIP      | --metadata/events--| (Deepgram  | --metadata/events--> | (OpenAI) |          | (11Labs or  |
| (WS in/out) |                    | or OpenAI) |                      |          |          |  Cartesia)  |
+-------------+                    +------------+                      +----------+          +-------------+
     ^                                                                                              v
     +----------------------------------------------------------------------------------------------+
                                         audio (base64)
```

## Implementations

Dialog provides example [implementations](https://github.com/faranalytics/dialog/tree/main/src/implementations) for each of the artifacts that comprise a VoIP-Agent application. You can use a packaged implementation as-is, subclass it, or implement your own. If you choose to implement a custom participant, you can use one of the provided participant [interfaces](https://github.com/faranalytics/dialog/tree/main/src/interfaces).

### VoIP

#### [Twilio](https://github.com/faranalytics/dialog/tree/main/src/implementations/voip/twilio) <sup><sup>[↗](https://twilio.com/)</sup></sup>

- Twilio request validation
- Recording status
- Transcript status
- Speech interruption

#### [Telnyx](https://github.com/faranalytics/dialog/tree/main/src/implementations/voip/telnyx) <sup><sup>[↗](https://telnyx.com/) </sup></sup>(coming soon)

An implementation similar to Twilio is planned. A placeholder exists under `src/implementations/voip/telnyx/`.

### Speech to text (STT)

#### [Deepgram](https://github.com/faranalytics/dialog/tree/main/src/implementations/stt/deepgram) <sup><sup>[↗](https://deepgram.com/)</sup></sup>

- Voice activity detection (VAD) events

#### [OpenAI](https://github.com/faranalytics/dialog/tree/main/src/implementations/stt/openai) <sup><sup>[↗](https://openai.com/)</sup></sup>

- Voice activity detection (VAD) events
- Semantic VAD

### Text to speech (TTS)

#### [Cartesia](https://github.com/faranalytics/dialog/tree/main/src/implementations/tts/cartesia) <sup><sup>[↗](https://cartesia.ai/)

</sup></sup>

- Configurable voice

#### [ElevenLabs](https://github.com/faranalytics/dialog/tree/main/src/implementations/tts/elevenlabs) <sup><sup>[↗](https://elevenlabs.io/)</sup></sup>

- Configurable voice

### Agent <sup><sup>(abstract)</sup></sup>

#### [OpenAI](https://github.com/faranalytics/dialog/tree/main/src/implementations/agent/abstract/openai) <sup><sup>[↗](https://openai.com/)</sup></sup>

- An abstract [Agent implementation](https://github.com/faranalytics/dialog/blob/main/src/implementations/agent/abstract/openai/openai_agent.ts) is provided that uses the [OpenAI](https://platform.openai.com/docs/overview) API.

## Custom Implementations

Dialog provides concrete `VoIP`, `STT`, and `TTS` implementations and an abstract `Agent` implementation. You can use a provided implementation _as-is_, subclass it, or choose an interface and implement your own. If you plan to implement your own `VoIP`, `STT`, `Agent`, or `TTS`, [interfaces](https://github.com/faranalytics/dialog/tree/main/src/interfaces) are provided for each participant of the application.

### Custom Agents

A custom `Agent` implementation will allow you to facilitate tool calling, conversation history, and other nuances.

You can extend the provided `OpenAIAgent` class, as in the example below, or just implement the `Agent` interface. The straight-forward `openai_agent.ts` [implementation](https://github.com/faranalytics/dialog/blob/main/src/implementations/agent/abstract/openai/openai_agent.ts) can be used as a guide.

#### A custom `Agent` based on `openai_agent.ts`.

This hypothetical custom `Agent` implementation adds a timestamp to each user message and maintains conversation history.

```ts
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import {
  log,
  Message,
  OpenAIAgent,
  OpenAIAgentOptions,
  TwilioMetadata,
  TwilioVoIP,
  OpenAIConversationHistory,
} from "@farar/dialog";

export interface TwilioCustomAgentOptions
  extends OpenAIAgentOptions<TwilioVoIP> {
  twilioAccountSid: string;
  twilioAuthToken: string;
  system?: string;
  greeting?: string;
}

export class TwilioCustomAgent extends OpenAIAgent<TwilioVoIP> {
  protected metadata?: TwilioMetadata;
  protected twilioAccountSid: string;
  protected twilioAuthToken: string;
  protected history: OpenAIConversationHistory;
  protected transcript: unknown[];
  protected system: string;
  protected greeting: string;

  constructor(options: TwilioCustomAgentOptions) {
    super(options);
    this.twilioAccountSid = options.twilioAccountSid;
    this.twilioAuthToken = options.twilioAuthToken;
    this.transcript = [];
    this.system = options.system ?? "";
    this.greeting = options.greeting ?? "";
    if (this.system) {
      this.history = [
        {
          role: "system",
          content: this.system,
        },
      ];
    } else {
      this.history = [];
    }
  }

  public inference = async (message: Message): Promise<void> => {
    try {
      const content = `${new Date().toISOString()}\n${message.data}`;
      log.notice(`User message: ${content}`);
      this.history.push({ role: "user", content });
      const stream = await this.openAI.chat.completions.create({
        model: this.model,
        messages: this.history,
        temperature: 1,
        stream: true,
      });
      const assistantMessage = await this.dispatchStream(message.uuid, stream);
      log.notice(`Assistant message: ${assistantMessage} `);
      this.history.push({ role: "assistant", content: assistantMessage });
    } catch (err) {
      this.dispose(err);
    }
  };

  public updateMetadata = (metadata: TwilioMetadata): void => {
    if (!this.metadata) {
      this.metadata = metadata;
    } else {
      this.metadata = { ...this.metadata, ...metadata };
    }
  };

  public activate = (): void => {
    super.activate();
    this.voip.on("streaming_started", this.dispatchInitialMessage);
    this.voip.on("streaming_started", this.startDisposal);
    this.voip.on("metadata", this.updateMetadata);
  };

  public deactivate = (): void => {
    super.deactivate();
    this.voip.off("streaming_started", this.dispatchInitialMessage);
    this.voip.off("streaming_started", this.startDisposal);
    this.voip.off("metadata", this.updateMetadata);
  };

  public dispatchInitialMessage = (): void => {
    const uuid = randomUUID();
    this.activeMessages.add(uuid);
    this.history.push({ role: "assistant", content: this.greeting });
    this.dispatchMessage(
      { uuid: uuid, data: this.greeting, done: true },
      false
    ).catch(this.dispose);
  };

  protected startDisposal = (): void => {
    void (async () => {
      try {
        await once(this.voip, "streaming_stopped");
        this.dispose();
      } catch (err) {
        log.error(err);
      }
    })();
  };
}
```

## Multithreading

Dialog provides a simple multithreading implementation you can use. An [example](https://github.com/faranalytics/dialog/tree/main/examples/twilio_threading) is provided that demonstrates a multithreaded deployment.

A `Worker` is spun up for each call. VoIP events are propagated over a `MessageChannel` using the [Port Agent](https://github.com/faranalytics/port_agent) RPC-like facility. This approach ensures that any peculiarity that takes place in handling one call will not interfer with other concurrent calls. Another notable aspect of this approach is that it permits hot changes to the Agent (and the STT and TTS) code without interrupting calls that are already underway — new calls will pick up changes each time a `Worker` is spun up.

In the excerpt below, a `TwilioVoIPWorker` is instantiated on each call.

Excerpted from `./src/main.ts`.

```ts
const gateway = new TwilioGateway({
  httpServer,
  webSocketServer,
  webhookURL: new URL(WEBHOOK_URL),
  authToken: TWILIO_AUTH_TOKEN,
  accountSid: TWILIO_ACCOUNT_SID,
  requestSizeLimit: 1e6,
});

gateway.on("voip", (voip: TwilioVoIP) => {
  new TwilioVoIPWorker({ voip, worker: new Worker("./dist/worker.js") });
});
```

Over in `worker.js` the Agent is instantiated, as usual, except using a `TwilioVoIPProxy` instance that implements the `VoIP` interface.

Excerpted from `./src/worker.ts`.

```ts
const voip = new TwilioVoIPProxy();

const agent = new Agent({
  voip: voip,
  stt: new DeepgramSTT({
    apiKey: DEEPGRAM_API_KEY,
    liveSchema: DEEPGRAM_LIVE_SCHEMA,
  }),
  tts: new CartesiaTTS({
    apiKey: CARTESIA_API_KEY,
    speechOptions: CARTESIA_SPEECH_OPTIONS,
  }),
  apiKey: OPENAI_API_KEY,
  system: OPENAI_SYSTEM_MESSAGE,
  greeting: OPENAI_GREETING_MESSAGE,
  model: OPENAI_MODEL,
  twilioAccountSid: TWILIO_ACCOUNT_SID,
  twilioAuthToken: TWILIO_AUTH_TOKEN,
});

agent.activate();
```

## API

Dialog provides building blocks to create real‑time, voice‑driven agents that integrate telephony (VoIP), speech‑to‑text (STT), text‑to‑speech (TTS), and LLM agents. It includes interfaces, utility classes, and concrete implementations for Twilio VoIP, Deepgram STT, OpenAI Realtime STT, ElevenLabs TTS, Cartesia TTS, and an OpenAI‑based agent.

The API is organized by component. You can mix and match implementations by wiring them through the provided interfaces.

### Common logging utilities

The logging utilities are thin wrappers around `streams-logger` for structured, backpressure‑aware logging.

#### log, formatter, consoleHandler, SyslogLevel

- log `<Logger>` An initialized Logger pipeline emitting to the console via the included `formatter` and `consoleHandler`.
- formatter `<Formatter<unknown, string>>` Formats log records into human‑readable strings.
- consoleHandler `<ConsoleHandler<string>>` A console sink with level set to DEBUG.
- SyslogLevel `<enum>` The syslog‑style levels exported from `streams-logger`.

Use these exports in order to emit structured logs across the library. See `streams-logger` for details on usage and configuration.

### The StreamBuffer class

#### new StreamBuffer(options, writableOptions)

- options `<StreamBufferOptions>`
  - bufferSizeLimit `<number>` Optionally specify a maximum buffer size in bytes. **Default: `1e6`**
- writableOptions `<stream.WritableOptions>` Optional Node.js stream options; use to customize highWaterMark, etc.

Use a `StreamBuffer` in order to buffer incoming stream chunks into a single in‑memory `Buffer` with an upper bound. If the buffer exceeds the limit, an error is emitted.

_public_ **streamBuffer.buffer**

- `<Buffer>`

The accumulated buffer contents.

### The RequestBuffer class

#### new RequestBuffer(options)

- options `<RequestBufferOptions>`
  - req `<http.IncomingMessage>` The HTTP request to read from.
  - bufferSizeLimit `<number>` Optionally specify a maximum body size in bytes. **Default: `1e6`**

Use a `RequestBuffer` in order to read and bound the body of an `IncomingMessage` into a string.

_public_ **requestBuffer.body()**

Returns: `<Promise<string>>`

Read, buffer, and return the entire request body as a UTF‑8 string. Emits `error` if the size limit is exceeded or the underlying stream errors.

### The Mutex class

#### new Mutex()

- options `<MutexOptions>`
  - queueSizeLimit `<number>` A hard limit imposed on all mark queues. `mutex.call` will throw if this limit is exceeded.

Use a `Mutex` in order to serialize asynchronous calls by key.

_public_ **mutex.call(mark, fn, ...args)**

- mark `<string>` A key identifying the critical section.
- fn `<(...args: unknown[]) => Promise<unknown>>` An async function to execute exclusively per key.
- ...args `<unknown[]>` Arguments forwarded to `fn`.

Returns: `<Promise<unknown>>`

Acquire the mutex for `mark`, invoke `fn`, and release the mutex, even on error.

_public_ **mutex.acquire(mark)**

- mark `<string>` A key identifying the critical section.

Returns: `<Promise<void>>`

Wait until the mutex for `mark` is available and acquire it.

_public_ **mutex.release(mark)**

- mark `<string>` A key identifying the critical section.

Returns: `<void>`

Release a previously acquired mutex for `mark`. Throws if called without a corresponding acquire.

### Core interfaces

These interfaces define the contracts between VoIP, STT, TTS, and Agent components.

#### interface Message\<DataT = string\>

- uuid `<UUID>` A unique identifier for correlation across components.
- data `<DataT>` The payload: audio (base64) or text, depending on the context.
- done `<boolean>` Whether the message is complete (end of stream/utterance).

#### interface Agent

- inference `(message: Message) => Promise<void>` Implement the main inference loop for a message.
- activate `() => void` Begin wiring events between components.
- deactivate `() => void` Remove event wiring.

#### interface STT

Extends: `EventEmitter<STTEvents>`

Events (STTEvents):

- `"message"`: `[Message]` Emitted when a finalized transcription is available.
- `"vad"`: `[]` Emitted on voice activity boundary events (start/stop cues).
- `"error"`: `[unknown]` Emitted on errors.

Methods:

- post `(media: Message) => void` Post audio media into the recognizer (typically base64 payloads).
- dispose `() => void` Dispose resources and listeners.

#### interface TTS

Extends: `EventEmitter<TTSEvents>`

Events (TTSEvents):

- `"message"`: `[Message]` Emitted with encoded audio output chunks, and a terminal chunk with `done: true`.
- `"error"`: `[unknown]` Emitted on errors.

Methods:

- post `(message: Message) => void` Post text to synthesize. When `done` is `true`, the provider should flush and emit the terminal chunk.
- abort `(uuid: UUID) => void` Cancel a previously posted message stream.
- dispose `() => void` Dispose resources and listeners.

#### interface VoIP\<MetadataT, TranscriptT\>

Extends: `EventEmitter<VoIPEvents<MetadataT, TranscriptT>>`

Events (VoIPEvents):

- `"metadata"`: `[MetadataT]` Emitted for call/session metadata updates.
- `"message"`: `[Message]` Emitted for inbound audio media frames (base64 payloads).
- `"message_dispatched"`: `[UUID]` Emitted when a downstream consumer has finished dispatching a message identified by the UUID.
- `"transcript"`: `[TranscriptT]` Emitted for transcription webhook updates, when supported.
- `"recording_url"`: `[string]` Emitted with a URL for completed recordings, when supported.
- `"streaming_started"`: `[]` Emitted when the media stream starts.
- `"streaming_stopped"`: `[]` Emitted when the media stream ends.
- `"error"`: `[unknown]` Emitted on errors.

Methods:

- post `(message: Message) => void` Post synthesized audio back to the call/session.
- abort `(uuid: UUID) => void` Cancel an in‑flight TTS dispatch and clear provider state if needed.
- hangup `() => void` Terminate the call/session, when supported by the provider.
- transferTo `(tel: string) => void` Transfer the call to the specified telephone number, when supported.
- dispose `() => void` Dispose resources and listeners.

### Twilio VoIP

Twilio implementations provide inbound call handling, WebSocket media streaming, call control, recording, and transcription via Twilio.

#### new TwilioGateway(options)

- options `<TwilioGatewayOptions>`
  - httpServer `<http.Server>` An HTTP/HTTPS server for Twilio webhooks.
  - webSocketServer `<ws.Server>` A WebSocket server to receive Twilio Media Streams.
  - webhookURL `<URL>` The public webhook URL path for the voice webhook (full origin and path).
  - accountSid `<string>` Twilio Account SID.
  - authToken `<string>` Twilio Auth Token.
  - recordingStatusURL `<URL>` Optional recording status callback URL. If omitted, a unique URL on the same origin is generated.
  - transcriptStatusURL `<URL>` Optional transcription status callback URL. If omitted, a unique URL on the same origin is generated.
  - requestSizeLimit `<number>` Optional limit (bytes) for inbound webhook bodies. **Default: `1e6`**

Use a `TwilioGateway` in order to accept Twilio voice webhooks, validate signatures, respond with a TwiML `Connect <Stream>` response, and manage the associated WebSocket connection and callbacks. On each new call, a `TwilioVoIP` instance is created and emitted.

Events:

- `"voip"`: `[TwilioVoIP]` Emitted when a new call is established and its `TwilioVoIP` instance is ready.

#### new WebSocketListener(options)

- options `<{ webSocket: ws.WebSocket, twilioGateway: TwilioGateway, callSidToTwilioVoIP: Map<string, TwilioVoIP> }>`

Use a `WebSocketListener` in order to translate Twilio Media Stream messages into `VoIP` events for the associated `TwilioVoIP` instance. This class is managed by `TwilioGateway` and not typically constructed directly.

_public_ **webSocketListener.webSocket**

- `<ws.WebSocket>` The underlying WebSocket connection.

_public_ **webSocketListener.startMessage**

- `<StartWebSocketMessage | undefined>` The initial "start" message, when received.

#### new TwilioVoIP(options)

- options `<TwilioVoIPOptions>`
  - metadata `<TwilioMetadata>` Initial call/stream metadata.
  - accountSid `<string>` Twilio Account SID.
  - authToken `<string>` Twilio Auth Token.
  - recordingStatusURL `<URL>` Recording status callback URL.
  - transcriptStatusURL `<URL>` Transcription status callback URL.

Use a `TwilioVoIP` in order to send synthesized audio back to Twilio, emit inbound media frames, and control the call (transfer, hangup, recording, and transcription).

_public_ **twilioVoIP.post(message)**

- message `<Message>` Post base64‑encoded audio media back to Twilio over the Media Stream. When `done` is `true`, a marker is sent to allow downstream dispatch tracking.

Returns: `<void>`

_public_ **twilioVoIP.abort(uuid)**

- uuid `<UUID>` A message UUID to cancel. Sends a cancel marker and clears state; when no active messages remain, a `clear` control message is sent.

Returns: `<void>`

_public_ **twilioVoIP.transferTo(tel)**

- tel `<string>` A destination telephone number in E.164 format.

Returns: `<void>`

Transfer the active call to `tel` using TwiML.

_public_ **twilioVoIP.hangup()**

Returns: `<void>`

End the active call using TwiML.

_public_ **twilioVoIP.startTranscript()**

Returns: `<Promise<void>>`

Start Twilio call transcription (Deepgram engine) with `both_tracks`.

_public_ **twilioVoIP.startRecording()**

Returns: `<Promise<void>>`

Begin dual‑channel call recording with status callbacks.

_public_ **twilioVoIP.stopRecording()**

Returns: `<Promise<void>>`

Stop the in‑progress recording when applicable.

_public_ **twilioVoIP.removeRecording()**

Returns: `<Promise<void>>`

Remove the last recording via the Twilio API.

_public_ **twilioVoIP.dispose()**

Returns: `<void>`

Close the media WebSocket and clean up listener maps.

### Twilio types

Helper types and type guards for Twilio webhook and Media Stream payloads.

- **Body** `<Record<string, string | string[] | undefined>>` A generic Twilio form‑encoded body map.
- **CallMetadata** Extends `Body` with required Twilio voice webhook fields.
- **isCallMetadata(message)** Returns: `<message is CallMetadata>`
- **RecordingStatus** Extends `Body` with Twilio recording status fields.
- **isRecordingStatus(message)** Returns: `<message is RecordingStatus>`
- **TranscriptStatus** Extends `Body` with Twilio transcription status fields.
- **isTranscriptStatus(message)** Returns: `<message is TranscriptStatus>`
- **WebSocketMessage** `{ event: "start" | "media" | "stop" | "mark" }`
- **StartWebSocketMessage, MediaWebSocketMessage, StopWebSocketMessage, MarkWebSocketMessage** Specific Twilio Media Stream messages.
- **isStartWebSocketMessage / isMediaWebSocketMessage / isStopWebSocketMessage / isMarkWebSocketMessage** Type guards for the above.
- **TwilioMetadata** `Partial<StartWebSocketMessage> & Partial<CallMetadata>` A merged, partial metadata shape for convenience.

### Agent abstractions

#### new OpenAIAgent\<VoIPT extends VoIP\<never, never\>\>(options)

- options `<OpenAIAgentOptions<VoIPT>>`
  - voip `<VoIPT>` The telephony transport.
  - stt `<STT>` The speech‑to‑text provider.
  - tts `<TTS>` The text‑to‑speech provider.
  - apiKey `<string>` OpenAI API key.
  - model `<string>` OpenAI Chat Completions model identifier.
  - queueSizeLimit `<number>` A queueSizeLimit to be passed to the implementation's `Mutex` constructor.

Use an `OpenAIAgent` as a base class in order to build streaming, interruptible LLM agents that connect STT input, TTS output, and a VoIP transport. Subclasses implement `inference` to call OpenAI APIs and stream back responses.

_public (abstract)_ **openAIAgent.inference(message)**

- message `<Message>` A transcribed user message to process.

Returns: `<Promise<void>>`

Implement this to call OpenAI and generate/stream the assistant’s reply.

_public_ **openAIAgent.post(message)**

- message `<Message>` Push a user message into the agent. Ignored if `message.data` is empty. The message UUID is tracked for cancellation.

Returns: `<void>`

_public_ **openAIAgent.dispatchStream(uuid, stream, allowInterrupt?)**

- uuid `<UUID>` The message correlation identifier.
- stream `<Stream<OpenAI.Chat.Completions.ChatCompletionChunk>>` The OpenAI streaming iterator.
- allowInterrupt `<boolean>` Whether to allow VAD‑driven interruption. **Default: `true`**

Returns: `<Promise<string>>`

Stream assistant tokens to TTS. When `allowInterrupt` is `false`, waits for a downstream `"message_dispatched"` before returning.

_public_ **openAIAgent.dispatchMessage(message, allowInterrupt?)**

- message `<Message>` A pre‑composed assistant message to play via TTS.
- allowInterrupt `<boolean>` Whether to allow VAD‑driven interruption. **Default: `true`**

Returns: `<Promise<string>>`

Dispatch a complete assistant message to TTS with optional interruption handling.

_public_ **openAIAgent.abort()**

Returns: `<void>`

Abort all active messages that are not currently being dispatched; cancels TTS and instructs the VoIP transport to clear state.

_public_ **openAIAgent.dispose(err?)**

- err `<unknown>` Optional error to log.

Returns: `<void>`

Abort any in‑flight OpenAI stream and dispose TTS, STT, and VoIP transports.

_public_ **openAIAgent.setTTS(tts)**

- tts `<TTS>` Replacement TTS implementation.

Returns: `<void>`

Swap the current TTS implementation, updating event wiring.

_public_ **openAIAgent.setSTT(stt)**

- stt `<STT>` Replacement STT implementation.

Returns: `<void>`

Swap the current STT implementation, updating event wiring.

_public_ **openAIAgent.activate()**

Returns: `<void>`

Wire up `voip` → `stt` (media), `stt` → `agent` (messages, vad), and `tts` → `voip` (audio). Also subscribes to error and dispatch events.

_public_ **openAIAgent.deactivate()**

Returns: `<void>`

Remove event wiring.

### The TwilioVoIPOpenAIAgent class

#### new TwilioVoIPOpenAIAgent(options)

- options `<TwilioVoIPOpenAIAgentOptions>` Extends `OpenAIAgentOptions<TwilioVoIP>`
  - twilioAccountSid `<string>` Twilio Account SID used for authenticated media fetch.
  - twilioAuthToken `<string>` Twilio Auth Token used for authenticated media fetch.
  - system `<string>` Optional system prompt for conversation history. **Default: `""`**
  - greeting `<string>` Optional initial assistant greeting. **Default: `""`**

Use a `TwilioVoIPOpenAIAgent` in order to run an OpenAI‑driven assistant over a Twilio call. It records the call, starts transcription, streams a greeting on connect, collects conversation history, and disposes once recording and transcription are complete.

_public_ **twilioVoIPOpenAIAgent.updateMetadata(metadata)**

- metadata `<TwilioMetadata>` Merge updated Twilio metadata.

Returns: `<void>`

_public_ **twilioVoIPOpenAIAgent.activate()**

Returns: `<void>`

Extends `OpenAIAgent.activate()` by wiring Twilio‑specific events (stream start/stop, recording, transcript) and dispatching the initial greeting.

_public_ **twilioVoIPOpenAIAgent.deactivate()**

Returns: `<void>`

Remove Twilio‑specific wiring in addition to base wiring.

### Speech‑to‑Text implementations

#### new DeepgramSTT(options)

- options `<DeepgramSTTOptions>`
  - apiKey `<string>` Deepgram API key.
  - liveSchema `<LiveSchema>` Deepgram live connection options.
  - queueSizeLimit `<number>` A queueSizeLimit to be passed to the implementation's `Mutex` constructor.

Use a `DeepgramSTT` in order to stream audio to Deepgram Live and emit final transcripts. Emits `vad` on speech boundary messages. Automatically reconnects when needed.

_public_ **deepgramSTT.post(message)**

- message `<Message>` Base64‑encoded (PCM/Telephony) audio chunk.

Returns: `<void>`

_public_ **deepgramSTT.dispose()**

Returns: `<void>`

Close the underlying connection and remove listeners.

#### new OpenAISTT(options)

- options `<OpenAISTTOptions>`
  - apiKey `<string>` OpenAI API key.
  - session `<Session>` Realtime transcription session configuration.
  - queueSizeLimit `<number>` A queueSizeLimit to be passed to the implementation's `Mutex` constructor.

Use an `OpenAISTT` in order to stream audio to OpenAI Realtime STT and emit `message` on completed transcriptions and `vad` on speech boundary events.

_public_ **openaiSTT.post(message)**

- message `<Message>` Base64‑encoded audio chunk.

Returns: `<void>`

_public_ **openaiSTT.dispose()**

Returns: `<void>`

Close the WebSocket and remove listeners.

### Text‑to‑Speech implementations

#### new ElevenlabsTTS(options)

- options `<ElevenlabsTTSOptions>`
  - voiceId `<string>` Optional voice identifier. **Default: `"JBFqnCBsd6RMkjVDRZzb"`**
  - apiKey `<string>` ElevenLabs API key.
  - headers `<Record<string, string>>` Optional additional headers.
  - url `<string>` Optional override URL for the WebSocket endpoint.
  - queryParameters `<Record<string, string>>` Optional query parameters appended to the endpoint.
  - timeout `<number>` Optional timeout in milliseconds to wait for finalization when `done` is set. If the timeout elapses, a terminal empty chunk is emitted. **Default: `undefined`**
  - queueSizeLimit `<number>` A queueSizeLimit to be passed to the implementation's `Mutex` constructor.

Use an `ElevenlabsTTS` in order to stream synthesized audio back as it’s generated. Supports message contexts (UUIDs), incremental text updates, flushing on `done`, and cancellation.

_public_ **elevenlabsTTS.post(message)**

- message `<Message>` Assistant text to synthesize. When `done` is `true`, the current context is closed and finalization is awaited (with optional timeout).

Returns: `<void>`

_public_ **elevenlabsTTS.abort(uuid)**

- uuid `<UUID>` The context to cancel; sends a flush and close if initialized.

Returns: `<void>`

_public_ **elevenlabsTTS.dispose()**

Returns: `<void>`

Close the WebSocket.

#### new CartesiaTTS(options)

- options `<CartesiaTTSOptions>`
  - apiKey `<string>` Cartesia API key.
  - speechOptions `<Record<string, unknown>>` Provider options merged into each request.
  - url `<string>` Optional override URL for the WebSocket endpoint. **Default: `"wss://api.cartesia.ai/tts/websocket"`**
  - headers `<Record<string, string>>` Optional additional headers merged with required headers.
  - timeout `<number>` Optional timeout in milliseconds to wait for finalization when `done` is set. If the timeout elapses, a terminal empty chunk is emitted. **Default: `undefined`**
  - queueSizeLimit `<number>` A queueSizeLimit to be passed to the implementation's `Mutex` constructor.

Use a `CartesiaTTS` in order to stream synthesized audio chunks for a given context UUID. Supports cancellation and optional finalization timeouts.

_public_ **cartesiaTTS.post(message)**

- message `<Message>` Assistant text to synthesize; when `done` is `true`, the provider is instructed to flush and complete the context.

Returns: `<void>`

_public_ **cartesiaTTS.abort(uuid)**

- uuid `<UUID>` The context to cancel.

Returns: `<void>`

_public_ **cartesiaTTS.dispose()**

Returns: `<void>`

Close the WebSocket and remove listeners.

### Twilio VoIP worker adapter

The following classes enable running VoIP handling in a worker thread using the `port_agent` library.

#### new TwilioVoIPWorker(options)

- options `<TwilioVoIPWorkerOptions>`
  - worker `<Worker>` The target worker thread to communicate with.
  - voip `<TwilioVoIP>` The local `TwilioVoIP` instance whose events and methods will be bridged.

Use a `TwilioVoIPWorker` in order to expose `TwilioVoIP` events and actions to a worker thread. It forwards VoIP events to the worker and registers callables that invoke the corresponding `TwilioVoIP` methods.

#### new TwilioVoIPProxy()

Use a `TwilioVoIPProxy` in order to consume VoIP events and call VoIP methods from inside a worker thread. It mirrors the `VoIP` interface and delegates the work to a host `TwilioVoIP` via the `port_agent` channel.

_public_ **twilioVoIPProxy.post(message)**

- message `<Message>` Post synthesized audio.

Returns: `<void>`

_public_ **twilioVoIPProxy.abort(uuid)**

- uuid `<UUID>` The context to cancel.

Returns: `<void>`

_public_ **twilioVoIPProxy.hangup()**

Returns: `<void>`

_public_ **twilioVoIPProxy.transferTo(tel)**

- tel `<string>` A destination telephone number in E.164 format.

Returns: `<void>`

_public_ **twilioVoIPProxy.startRecording()**

Returns: `<Promise<void>>`

_public_ **twilioVoIPProxy.stopRecording()**

Returns: `<Promise<void>>`

_public_ **twilioVoIPProxy.startTranscript()**

Returns: `<Promise<void>>`

_public_ **twilioVoIPProxy.dispose()**

Returns: `<void>`

### OpenAI STT session and message types

Helper types for configuring OpenAI Realtime STT sessions and message discrimination.

_public_ **Session**

- `<object>`
  - input_audio_format `<"pcm16" | "g711_ulaw" | "g711_alaw">`
  - input_audio_noise_reduction `{ type: "near_field" | "far_field" }` Optional noise reduction.
  - input_audio_transcription `{ model: "gpt-4o-transcribe" | "gpt-4o-mini-transcribe", prompt?: string, language?: string }`
  - turn_detection `{ type: "semantic_vad" | "server_vad", threshold?: number, prefix_padding_ms?: number, silence_duration_ms?: number, eagerness?: "low" | "medium" | "high" | "auto" }`

Discriminated unions for WebSocket messages are also provided with type guards:

- `WebSocketMessage` and `isCompletedWebSocketMessage`, `isSpeechStartedWebSocketMessage`, `isConversationItemCreatedWebSocketMessage`.

### OpenAI agent types

_public_ **OpenAIConversationHistory**

- `<{ role: "system" | "assistant" | "user" | "developer", content: string }[]>`

A conversation history array suitable for OpenAI chat APIs.

## Alternatives

There are a lot of great VoIP-Agent orchestration implementations out there. This is a selection of implementations that I have experience with.

- [LiveKit](https://livekit.io/)
- [Vapi](https://vapi.ai/)
- [Retell](https://www.retellai.com/)
- [Pipecat](https://www.pipecat.ai/)

## Support

If you have a feature request or run into any issues, feel free to submit an [issue](https://github.com/faranalytics/dialog/issues) or start a [discussion](https://github.com/faranalytics/dialog/discussions). You’re also welcome to reach out directly to one of the authors.

- [Adam Patterson](https://github.com/adamjpatterson)
