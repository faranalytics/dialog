# @farar/dialog

Dialog is a pluggable, event-driven library for building real-time voice agents on Node.js using Twilio Media Streams, Deepgram streaming STT, OpenAI chat completions, and Cartesia streaming TTS.

## Introduction

With **@farar/dialog**, you can assemble a full voice-agent pipeline that:
- Accepts and routes inbound calls via Twilio
- Streams audio into speech-to-text (STT) and handles voice activity events
- Feeds user transcripts into an OpenAI-powered conversational agent
- Streams agent replies to text-to-speech (TTS)
- Sends audio and control marks back over the Twilio media stream

This library exposes four core interfaces—**VoIP**, **STT**, **Agent**, and **TTS**—along with utility classes and a ready-made Twilio controller to tie them together.

## Features

- **TwilioController**: HTTP & WebSocket listener for Twilio call webhooks and media streams
- **TwilioVoIP**: VoIP implementation for streaming media, call control (hangup, transfer), recording, and callbacks
- **DeepgramSTT**: Streaming speech-to-text using Deepgram Live API
- **OpenAIAgent**: Base class for chat-driven agents using OpenAI Chat Completions
- **CartesiaTTS**: Streaming text-to-speech via Cartesia WebSocket API
- **StreamBuffer**: Writable stream buffer with size limits for webhook bodies
- **Built-in logging**: `log`, `formatter`, `consoleHandler`, and `SyslogLevel` powered by streams-logger
- **TypeScript types** for strong typing of events, messages, and metadata

## Table of Contents

- [Installation](#installation)
- [Concepts](#concepts)
- [Quick Start](#quick-start)
- [Examples](#examples)
- [API Reference](#api-reference)
- [How‑Tos](#how-tos)
- [Configuration & Tuning](#configuration--tuning)
- [Testing](#testing)
- [License](#license)

## Installation

```bash
npm install @farar/dialog
```

## Concepts

The library is structured around four extensible interfaces:

- **VoIP**: manages call lifecycle, media streaming events, DTMF, and call controls
- **STT**: ingests audio chunks and emits transcription messages and VAD events
- **Agent**: orchestrates conversation logic (transcript→model→response) and dispatches messages
- **TTS**: converts textual messages into audio chunks and signals completion

Each component is an `EventEmitter` that emits typed events (e.g. `message`, `metadata`, `error`, etc.). You wire them together in your application to form a real-time voice pipeline.

## Quick Start

Below is a minimal Twilio-powered voice agent. For full example code, see the [tests/twilio](tests/twilio) folder.

```ts
import * as https from 'node:https';
import * as fs from 'node:fs';
import { once } from 'node:events';
import * as ws from 'ws';
import {
  TwilioController,
  DeepgramSTT,
  CartesiaTTS,
  OpenAIAgent,
  log,
  SyslogLevel
} from '@farar/dialog';
import {
  DEEPGRAM_API_KEY,
  DEEPGRAM_LIVE_SCHEMA,
  CARTESIA_API_KEY,
  CARTESIA_SPEECH_OPTIONS,
  OPENAI_API_KEY,
  OPENAI_SYSTEM_MESSAGE,
  OPENAI_GREETING_MESSAGE,
  OPENAI_MODEL,
  PORT,
  HOST_NAME,
  KEY_FILE,
  CERT_FILE,
  WEBHOOK_URL,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN
} from './settings';

// Set log verbosity
log.setLevel(SyslogLevel.NOTICE);

// Create HTTPS & WebSocket servers for Twilio
const httpServer = https.createServer({
  key: fs.readFileSync(KEY_FILE),
  cert: fs.readFileSync(CERT_FILE)
});
const webSocketServer = new ws.WebSocketServer({ noServer: true });

httpServer.listen(PORT, HOST_NAME);
await once(httpServer, 'listening');

// Wire up the Twilio media stream controller
const controller = new TwilioController({
  httpServer,
  webSocketServer,
  webhookURL: new URL(WEBHOOK_URL),
  accountSid: TWILIO_ACCOUNT_SID,
  authToken: TWILIO_AUTH_TOKEN
});

// On each inbound call, spin up a new agent
controller.on('voip', (voip) => {
  const agent = new OpenAIAgent({
    voip,
    stt: new DeepgramSTT({ apiKey: DEEPGRAM_API_KEY, liveSchema: DEEPGRAM_LIVE_SCHEMA }),
    tts: new CartesiaTTS({ apiKey: CARTESIA_API_KEY, speechOptions: CARTESIA_SPEECH_OPTIONS }),
    apiKey: OPENAI_API_KEY,
    system: OPENAI_SYSTEM_MESSAGE,
    greeting: OPENAI_GREETING_MESSAGE,
    model: OPENAI_MODEL
  });
  agent.activate();
});
```

## Examples

See the complete Twilio voice agent example (with prompts and settings) in [tests/twilio](tests/twilio).

## API Reference

### TwilioController
```ts
new TwilioController(options: TwilioControllerOptions)
```
Starts HTTP and WebSocket listeners to handle inbound call webhooks and Twilio Media Streams.

| Option               | Type                            | Description                                                          |
| -------------------- | ------------------------------- | -------------------------------------------------------------------- |
| `httpServer`         | `http.Server`                   | HTTPS server to receive Twilio webhooks (upgrade to WSS).           |
| `webSocketServer`    | `ws.WebSocketServer`            | WebSocket server to handle Media Stream connections.                |
| `webhookURL`         | `URL`                           | Public URL path for Twilio to POST call webhook events.             |
| `accountSid`         | `string`                        | Twilio Account SID for authenticated API operations.                |
| `authToken`          | `string`                        | Twilio Auth Token for webhook validation and REST calls.            |
| `recordingStatusURL` | `URL` _(optional)_              | Callback URL for recording status events (default generated).       |
| `transcriptStatusURL`| `URL` _(optional)_              | Callback URL for transcription status events (default generated).   |

Emits:
- `voip` → `(voip: TwilioVoIP)` when a new call stream is established.

### TwilioVoIP
```ts
new TwilioVoIP(options: TwilioVoIPOptions)
```
VoIP implementation for streaming media frames, call control (hangup/transfer), recordings, and callbacks.

| Option               | Type            | Description                                          |
| -------------------- | --------------- | ---------------------------------------------------- |
| `metadata`           | `Metadata`      | Initial call metadata (to, from, callId).           |
| `accountSid`         | `string`        | Twilio Account SID for REST API operations.          |
| `authToken`          | `string`        | Twilio Auth Token for REST API operations.           |
| `recordingStatusURL` | `URL`           | Callback URL for recording status updates.           |
| `transcriptStatusURL`| `URL`           | Callback URL for transcription status updates.       |

Events:

| Event                 | Payload                             | Description                                                               |
| --------------------- | ----------------------------------- | ------------------------------------------------------------------------- |
| `metadata`            | `Metadata`                          | Emitted when call starts, contains initial or updated metadata.           |
| `streaming_started`   | `void`                              | Media Stream has begun.                                                   |
| `message`             | `Message`                           | Incoming speech chunk or agent audio payload.                              |
| `message_dispatched`  | `UUID`                              | Marker event signaling end of agent TTS dispatch.                         |
| `vad`                 | `void`                              | Voice activity detection (silence/speech) event from STT.                |
| `recording_url`       | `string`                            | URL to fetch recorded call audio.                                          |
| `streaming_stopped`   | `void`                              | Media Stream has ended.                                                   |
| `transcript`          | `any`                               | Raw transcript status payload from Twilio transcription engine.           |
| `error`               | `unknown`                           | Error during call media or REST operations.                               |

### DeepgramSTT
```ts
new DeepgramSTT(options: DeepgramSTTOptions)
```
Streams base64-encoded audio into Deepgram's Live API, handles interim/final transcripts and VAD.

| Option      | Type        | Description                             |
| ----------- | ----------- | --------------------------------------- |
| `apiKey`    | `string`    | Deepgram API key for Live transcription.
| `liveSchema`| `LiveSchema`| Deepgram LiveSchema configuration (model, language, etc.).

Emits:
- `message` → `(msg: Message)` when a final transcript chunk is ready.
- `vad` → `()` on voice activity detection.
- `error` → `(err: unknown)` on error.

### CartesiaTTS
```ts
new CartesiaTTS(options: CartesiaTTSOptions)
```
Streams textual input to Cartesia WebSocket TTS, emitting audio chunks and completion events.

| Option         | Type                      | Description                                               |
| -------------- | ------------------------- | --------------------------------------------------------- |
| `apiKey`       | `string`                  | Cartesia API key for authentication.                      |
| `speechOptions`| `Record<string,unknown>`  | Cartesia speech synthesis parameters (voice, format, etc.).|
| `url`          | `string` _(optional)_     | Custom WebSocket URL (defaults to Cartesia endpoint).      |
| `headers`      | `Record<string,string>`   | Additional HTTP headers for WebSocket handshake.           |

Emits:
- `message` → `(msg: Message)` streaming audio chunk events.
- `error` → `(err: unknown)` on synthesis or connection error.

### OpenAIAgent
```ts
abstract class OpenAIAgent implements Agent
```
Base class for chat-driven agents powered by OpenAI Chat Completions.

| Option    | Type                | Description                                                 |
| --------- | ------------------- | ----------------------------------------------------------- |
| `voip`    | `TwilioVoIP`        | Active VoIP session handling media and call controls.       |
| `stt`     | `STT`               | STT component for ingesting speech audio.                   |
| `tts`     | `TTS`               | TTS component for emitting synthesized speech.              |
| `apiKey`  | `string`            | OpenAI API key for chat completions.                        |
| `system`  | `string` _(optional)_| Initial system prompt or context message.                  |
| `greeting`| `string` _(optional)_| Agent greeting message upon call start.                    |
| `model`   | `string`            | OpenAI model identifier (e.g. `gpt-4o-mini`).               |

Methods:
- `activate()` / `deactivate()` to start/stop media and model event handlers.
- Inherited: `post(message: Message)`, `abort()`, `updateMetadata()`, `dispose()`, and more.

### StreamBuffer
```ts
new StreamBuffer(options?: StreamBufferOptions, writableOptions?: WritableOptions)
```
Writable stream that buffers incoming chunks up to a size limit.

| Option            | Type      | Description                                   |
| ----------------- | --------- | --------------------------------------------- |
| `bufferSizeLimit` | `number`  | Maximum total buffer size in bytes (default 1e6).|

Properties:
- `buffer: Buffer` holds concatenated data up to the limit.

### Logging Utilities
- `log`: preconfigured `Logger` instance
- `formatter`, `consoleHandler`: streams-logger components
- `SyslogLevel`: log-level enum

### Interfaces & Types
- `STT`, `STTEvents`
- `TTS`, `TTSEvents`
- `VoIP`, `VoIPEvents`
- `Agent`
- `Message<DataT>`
- `Metadata`

## How‑Tos

- Implement a custom STT or TTS provider by extending the `STT` or `TTS` interfaces.
- Subclass `OpenAIAgent` to customize conversation logic (see [tests/twilio/src/agent.ts](tests/twilio/src/agent.ts)).

## Configuration & Tuning

- Control log level via `log.setLevel(...)`.
- Adjust buffer sizes with `StreamBufferOptions.bufferSizeLimit`.

## Testing

Run the Twilio example locally:
```bash
cd tests/twilio
npm install
npm run build
npm start
```

## License

MIT © FAR Analytics & Research
