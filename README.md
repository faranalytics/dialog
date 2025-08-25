
# @farar/dialog

**A modular framework for building real-time, voice-driven conversational agents in Node.js & TypeScript.**

Effortlessly combine telephony, speech-to-text, large language models, and text-to-speech cloud APIs into robust dialog pipelines. Whether you're automating customer service, building voicebots, or researching dialog systems, `@farar/dialog` delivers production-grade pipelines with maximum flexibility, extensibility, and strong type safety.

**Build advanced voice applications — without glue code:**
- Instantly connect calls from **Twilio** (or other telephony providers)
- Stream incoming audio to **Deepgram** for live transcription
- Pass transcriptions in real-time to **OpenAI (GPT, etc.)** for conversational AI
- Convert agent responses to natural audio with **Cartesia TTS**
- Orchestrate every stage using event-driven, composable modules

**Why choose `@farar/dialog`?**
- No glue code: Interconnect industry-leading APIs with simple pipelines
- Streaming-first: Real-time, low-latency dialog interaction
- Battle-tested interfaces: Clean error handling, backpressure, and resource lifecycles
- Built for extension: Swap out or customize every stage as needed

---

### Features

- **Complete modular dialog pipelines:** Compose VoIP, STT, TTS, and Agent modules to fit any workflow
- **Streaming and real-time:** Low-latency, event-driven architecture powered by Node.js EventEmitters
- **TypeScript-native:** Strong types, extensible interfaces, and auto-completion for safe custom integrations
- **Plug-and-play cloud support:** Built-in adapters for Twilio, Deepgram, OpenAI, and Cartesia—easily extend to your own APIs
- **Transparent context propagation:** Maintain full metadata and traceability throughout every call and response
- **Obsessively robust logging:** Integrate with streams-logger for diagnostics and auditing
- **Enterprise-grade reliability:** Handles the details of lifecycle, error boundaries, and service orchestration

---

## Table of Contents

- [Installation](#installation)
- [Concepts](#concepts)
- [Usage](#usage)
- [Examples](#examples)
- [API](#api)
- [Formatting & Logging](#formatting--logging)
- [Advanced Topics](#advanced-topics)
- [Versioning](#versioning)
- [Test](#test)
- [Support](#support)

---


## Quick Start

Get a real voice pipeline running in minutes—no glue code needed.

```bash
npm install @farar/dialog
```

```ts
import { 
  TwilioController, DeepgramSTT, CartesiaTTS, OpenAIAgent, log, SyslogLevel 
} from "@farar/dialog";

class MyAgent extends OpenAIAgent {
  public process = async (msg) => {
    this.history.push({ role: "user", content: msg.data });
    const stream = await this.openAI.chat.completions.create({
      model: this.model, messages: this.history, temperature: 0.6, stream: true,
    });
    const response = await this.dispatchStream(msg.uuid, stream);
    this.history.push({ role: "assistant", content: response });
  }
}

const controller = new TwilioController({
  httpServer: /* HTTPS server instance */,
  webSocketServer: /* ws.Server instance */,
  webhookURL: new URL("https://your-public-url/webhook"),
  accountSid: process.env.TWILIO_SID,
  authToken: process.env.TWILIO_AUTH,
});

controller.on("voip", (voip) => {
  const stt = new DeepgramSTT({ apiKey: process.env.DEEPGRAM_KEY, liveSchema: {/*...*/}});
  const tts = new CartesiaTTS({ apiKey: process.env.CARTESIA_KEY, speechOptions: {/*...*/}});
  const agent = new MyAgent({
    voip, stt, tts,
    apiKey: process.env.OPENAI_KEY,
    model: "gpt-4",
    system: "You are a helpful assistant.",
  });

  voip.on("message", stt.post);
  stt.on("message", agent.process);
  agent.on("message", tts.post);
  tts.on("message", voip.post);

  // Basic error logging for all modules
  [voip, stt, agent, tts].forEach(mod => mod.on("error", err => log.error(err)));
});
```

> **Tip:** Use [ngrok](https://ngrok.com/) to expose your local HTTPS webhook for Twilio and develop/test easily.

---

## Concepts

Building a voice agent or dialog system typically means chaining together telephony (for calls), STT (speech-to-text), an agent (AI), and TTS (text-to-speech). `@farar/dialog` makes this process modular: every major service is an isolated TypeScript interface with EventEmitter APIs and standard message objects.


### System Architecture

Below is a high-level flow of how data streams between core modules:

```
┌───────┐   audio    ┌─────┐    transcript     ┌─────┐    response      ┌─────┐   audio   ┌───────┐
│ VoIP  ├──────────► │ STT │ ────────────────► │Agent│ ───────────────► │ TTS │ ────────► │ VoIP  │
└───────┘            └─────┘                  └─────┘                 └─────┘           └───────┘
│ Telephony          │Speech-to-text           │Conversational         │Text-to-speech    │Send response
│ (e.g. Twilio)      │(e.g. Deepgram)          │AI (e.g. OpenAI)       │(e.g. Cartesia)   │audio back
```

#### Core Modules Overview

| Module      | Role in Pipeline                 | Example Implementations       | Extends / Base Interface     | Key Events / Methods                                     |
|-------------|----------------------------------|------------------------------|------------------------------|----------------------------------------------------------|
| **[VoIP](#twiliovoip-class)**    | Entry/exit point. Receives and sends call audio, DTMF, and call metadata. | `TwilioVoIP`, `TelnyxVoIP`  | `VoIP` (EventEmitter)         | `post`, `abort`, `updateMetadata`, `hangup`, `transferTo`<br>`message`, `metadata`, `transcript`, `recording_url`, `error` |
| **[STT](#deepgramstt-class)**     | Converts incoming audio to text; emits transcript events as user speaks.   | `DeepgramSTT`                | `STT` (EventEmitter)          | `post`, `dispose`<br>`message`, `vad`, `error`           |
| **[Agent](#openaia-agent-class)**   | Receives transcripts; manages AI dialog state; generates text response.    | `OpenAIAgent` (subclass for your app) | `Agent` (EventEmitter)        | `process`, `dispatchStream`, `activate`, `deactivate`, `dispose`<br>`message`, `error`                |
| **[TTS](#cartesiatts-class)**     | Converts agent response text back to speech audio; emits audio for playback. | `CartesiaTTS`                | `TTS` (EventEmitter)           | `post`, `abort`, `dispose`<br>`message`, `error`         |
| **[Controller](#twiliocontroller-class)** | Orchestrates resource creation/lifecycle, manages webhooks and sockets. | `TwilioController`           | `EventEmitter`                 | Constructor, `on("voip", ...)`, HTTP/WebSocket handlers  |

**All core modules are composable via events and strongly-typed interfaces.**


#### Message Flow Explained
1. **[VoIP](#twiliovoip-class)** receives call audio
2. **[STT](#deepgramstt-class)** emits transcript event as the user speaks
3. **[Agent](#openaia-agent-class)** receives text, generates an LLM response stream
4. **[TTS](#cartesiatts-class)** synthesizes agent response to speech audio
5. **[VoIP](#twiliovoip-class)** sends back audio (or triggers next state)

---

## Detailed Example

For a more advanced and annotated pipeline—showing subclassing, error handling, and complete setup—see the following:

```ts
import { TwilioController, DeepgramSTT, CartesiaTTS, log, SyslogLevel } from "@farar/dialog";
import { MyAgent } from "./agent";
import * as https from "https";
import * as ws from "ws";

// Replace with your credentials and certs
const twilioVoipOptions = { accountSid: "...", authToken: "...", /* ... */ };
const sttOptions = { apiKey: "your-deepgram-key", liveSchema: {/*...*/} };
const ttsOptions = { apiKey: "your-cartesia-key", speechOptions: {/*...*/} };
const agentOptions = { apiKey: "your-openai-key", model: "gpt-4", system: "You are helpful." };

const httpServer = https.createServer({
  key: /* fs.readFileSync(...) */, 
  cert: /* fs.readFileSync(...) */
});
const wsServer = new ws.Server({ server: httpServer });

const controller = new TwilioController({
  httpServer,
  webSocketServer: wsServer,
  webhookURL: new URL("https://your-server.example.com/webhook"),
  ...twilioVoipOptions,
});

controller.on("voip", (voip) => {
  const stt = new DeepgramSTT(sttOptions);
  const tts = new CartesiaTTS(ttsOptions);
  const agent = new MyAgent({ voip, stt, tts, ...agentOptions });

  voip.on("message", (msg) => stt.post(msg));
  stt.on("message", (msg) => agent.process(msg));
  agent.on("message", (msg) => tts.post(msg));
  tts.on("message", (msg) => voip.post(msg));

  // One-line full pipeline error logging
  [voip, stt, agent, tts].forEach(m => m.on("error", err => log.error(err)));
});

httpServer.listen(8443, () => {
  log.notice("Server started on https://localhost:8443");
});
```

---

## Examples

See `tests/twilio` for a full-featured example including all integration, event routing, and custom agent logic.

---

## Formatting & Logging

`@farar/dialog` uses a composable, pluggable logger (via [streams-logger](https://www.npmjs.com/package/streams-logger)). You can control the verbosity and direct logs to files or custom sinks.

```ts
import { log, SyslogLevel } from "@farar/dialog";
log.setLevel(SyslogLevel.DEBUG);
log.info("Your voice agent pipeline started!");
```

---

## API

### Overview

Explore each exported class, interface, and type, with all methods, events, and configuration:

| Class/Interface           | Description                      |
|---------------------------|----------------------------------|
| [TwilioController](#twiliocontroller-class)   | Manages HTTP/websocket channels for Twilio voice call Events.  |
| [TwilioVoIP](#twiliovoip-class)              | VoIP interface for Twilio; emits/receives call events/audio.   |
| [DeepgramSTT](#deepgramstt-class)            | Deepgram-powered speech-to-text module, emits transcriptions.  |
| [CartesiaTTS](#cartesiatts-class)            | Cartesia-powered text-to-speech, emits audio buffers.          |
| [OpenAIAgent](#openaia-agent-class)          | Abstract conversational agent for OpenAI Chat models.          |
| [Message](#message-type)                     | Standard message object (with uuid, data, done).                |
| [Metadata](#metadata-type)                   | Call or message metadata container.                             |
| [StreamBuffer](#streambuffer-class)          | Writable buffer for streaming data.                             |
| [Agent, STT, TTS, VoIP](#interfaces)         | Core interfaces for customizing/extending modules.              |

---

### `TwilioController` Class

Manages Twilio webhook/wss lifecycle and emits new call (VoIP) objects for orchestration.

| Option          | Type            | Description                                 |
|-----------------|-----------------|---------------------------------------------|
| httpServer      | http.Server     | Node.js HTTP or HTTPS server                |
| webSocketServer | ws.Server       | Node.js WebSocket server instance           |
| webhookURL      | URL             | Registered webhook with Twilio              |
| accountSid      | string          | Twilio account SID                          |
| authToken       | string          | Twilio auth token                           |
| [recordingStatusURL] | URL         | Recording status callback URL               |
| [transcriptStatusURL]| URL         | Transcript status callback URL              |

#### Events

| Event  | Arguments            | Description               |
|--------|----------------------|---------------------------|
| voip   | TwilioVoIP           | Fires on new inbound call |

---

### `TwilioVoIP` Class

Implements [VoIP](#voip-interface); handles call I/O, emits/receives audio and metadata.

#### Key Methods

| Method            | Arguments                 | Description                              |
|-------------------|--------------------------|------------------------------------------|
| post              | message: Message         | Send audio/message to call               |
| abort             | uuid: UUID               | Cancel audio/message                     |
| updateMetadata    | metadata: Metadata       | Update VoIP call metadata                |
| hangup            |                          | Disconnect the call                      |
| transferTo        | tel: string              | Transfer call to another number          |
| dispose           |                          | Clean up and release resources           |

#### Key Events

| Event               | Arguments             | Description                |
|---------------------|----------------------|----------------------------|
| message             | Message              | Audio message from call    |
| metadata            | Metadata             | Metadata for current call  |
| transcript          | TranscriptStatus     | External transcript event  |
| recording_url       | string               | Recording URL received     |
| streaming_started   |                      | Call audio streaming began |
| streaming_stopped   |                      | Streaming stopped          |
| error               | unknown              | Error event                |

---

### `DeepgramSTT` Class

Speech-to-text conversion via Deepgram’s cloud service.

| Option      | Type        | Description                   |
|-------------|-------------|-------------------------------|
| apiKey      | string      | Deepgram API Key              |
| liveSchema  | object      | Deepgram LiveSchema object    |

#### Events

| Event      | Arguments         | Description                                  |
|------------|------------------|----------------------------------------------|
| message    | Message          | New transcription message                    |
| vad        |                  | Voice activity detected                      |
| error      | unknown          | Error from Deepgram or connector             |

---

### `CartesiaTTS` Class

Text-to-speech generation using Cartesia.

| Option         | Type                            | Description                  |
|----------------|---------------------------------|------------------------------|
| apiKey         | string                          | Cartesia API Key             |
| speechOptions  | object                          | Cartesia voice parameters    |
| url            | string (opt)                    | Override API endpoint        |
| headers        | Record<string, string> (opt)    | Extra HTTP headers           |

#### Events

| Event      | Arguments         | Description                       |
|------------|------------------|-----------------------------------|
| message    | Message          | Synthesized audio response        |
| error      | unknown          | TTS error or connection failure   |

---

### `OpenAIAgent` Class

**Abstract class** for implementing ChatML-based dialog agents (e.g., via OpenAI GPT models).

| Option      | Type              | Description                      |
|-------------|-------------------|----------------------------------|
| apiKey      | string            | OpenAI API key                   |
| model       | string            | Model name (e.g., "gpt-4")       |
| system      | string            | System/prompts message           |
| greeting    | string            | Greeting message (opt.)          |
| voip        | TwilioVoIP        | Associated VoIP module           |
| stt         | STT               | Associated STT module            |
| tts         | TTS               | Associated TTS module            |

**To customize dialog logic, extend this class and override methods such as `process(message: Message)`**

---

### Message Type

| Property | Type   | Description                  |
|----------|--------|-----------------------------|
| uuid     | UUID   | Message unique identifier   |
| data     | any    | Message payload (string/buffer/etc.) |
| done     | bool   | True if stream is complete   |

---

### Metadata Type

| Property | Type    | Description             |
|----------|---------|------------------------|
| to       | string  | Destination phone/user |
| from     | string  | Origin phone/user      |
| callId   | string  | Unique call/session id |
| streamId | string  | Active stream id       |

---

### StreamBuffer

Writable buffer for streaming request/response bodies and backpressure management.

---

### Core Interfaces

| Name      | Description                                     |
|-----------|-------------------------------------------------|
| Agent     | Required: `activate()`, `deactivate()`          |
| STT       | .post(message), .dispose(), EventEmitter<STTEvents> |
| TTS       | .post(message), .abort(uuid), .dispose(), EventEmitter<TTSEvents> |
| VoIP      | .post, .abort, .updateMetadata, .hangup, ...    |

---

## Advanced Topics

- **Extending Agents:** Subclass OpenAIAgent to inject custom intent/routing/business logic in `.process(message)`.
- **Custom Pipelines:** Compose other providers or middlewares using interfaces/events.
- **Error Handling:** Listen for `"error"` on every pipeline object.
- **Performance:** Designed for low-latency audio and message passing.

---

## Versioning

This project uses [Semantic Versioning 2.0.0](https://semver.org/):

- MAJOR for breaking changes
- MINOR for backwards-compatible features
- PATCH for bug fixes

---

## Test

Clone and run the live example:

```bash
git clone https://github.com/faranalytics/dialog.git
cd dialog/tests/twilio
npm install
npm run build
node dist/main.js
```

---

## Support

For questions, issues, or feature requests, please open a [GitHub issue](https://github.com/faranalytics/dialog/issues) or reach out to the authors:

- [Adam Patterson](https://github.com/adamjpatterson)
