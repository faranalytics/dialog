# Dialog

A modular `VoIP` ➞ `STT` ➞ `AI Agent` ➞ `TTS` ➞ `VoIP` implementation.

## Introduction

Dialog provides a framework and a set of interfaces for building VoIP Agent applications.

> NB Diaglog is sitll under active development and public interfaces may change on turns of the minor.

### Features

- An easy to understand modular framework
- Event driven architecture
- Facilities for multithreaded deployments
- Talk over interruption of agent
- Conversation history

## Table of contents

- [Installation](#installation)
- [Usage](#usage)
- [Implementations](#implementations)
- [Custom Implementations](#custom-implementations)
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

### Install your package

#### Change directory into your package directory and install the package.

```bash
npm install <path-to-the-dialog-respository> --save
```

You should now be able to import Dialog artifacts into your package.

## Usage

[Example](https://github.com/faranalytics/dialog/tree/main/examples) applications are provided in the example subpackages.

### How it works

When a call is initiated, a `Controller` (e.g., Twilio, Telnyx) emits an `init` event. An instance of a Dialog application is constructed by passing a `VoIP`, `STT`, `Agent`, and `TTS` implementation into a `Dialog` implementation and calling its `start` method. The `start` method connects the component interfaces that comprise the application. An instance of each component of a Dialog application, a `VoIP`, `STT`, `TTS`, and `Agent`, is created on each call.

Excerpted from `src/main.ts`.

```ts
controller.on("init", (voip: VoIP) => {
  const stt = new DeepgramSTT({ apiKey: DEEPGRAM_API_KEY });
  const tts = new CartesiaTTS({ apiKey: CARTESIA_API_KEY });
  const agent = new OpenAIAgent({
    apiKey: OPENAI_API_KEY,
    system: OPENAI_SYSTEM_MESSAGE,
    greeting: OPENAI_GREETING_MESSAGE,
  });
  const dialog = new Dialog({ voip, stt, tts, agent });
  dialog.start();
});
```

### Configuration

You can create a `.env` file in order to provide configuration settings for your application.

`.env`

```ini
TELNYX_API_KEY = "";
DEEPGRAM_API_KEY = "";
CARTESIA_API_KEY = "";
OPENAI_API_KEY = "";
OPENAI_SYSTEM_MESSAGE = "You are handling a phone call.  You have personal preferences and you are very opinionated.  Respond with one concise sentence."
OPENAI_GREETING_MESSAGE = "I'm ready."
KEY_FILE = ""
CERT_FILE = ""
PORT = 3443
HOST_NAME = "0.0.0.0"
STREAM_URL = "wss://example.com:3443/"
```

## Implementations

Dialog provides example [implementations](https://github.com/faranalytics/dialog/tree/main/src/implementations) for each of the artifacts that comprise a VoIP Agent application.

#### VoIP

A [VoIP implementation](https://github.com/faranalytics/dialog/tree/main/src/implementations/voip/twilio) is provided that uses the [Twilio](https://twilio.com/) API.

A [VoIP implementation](https://github.com/faranalytics/dialog/tree/main/src/implementations/voip/telnyx) is provided that uses the [Telnyx](https://telnyx.com/) API.

#### Speech to text (STT)

An [STT implementation](https://github.com/faranalytics/dialog/blob/main/src/implementations/stt/deepgram/deepgram_stt.ts) is provided that uses the [Deepgram](https://deepgram.com/) API.

#### Text to speech (TTS)

A [TTS implementation](https://github.com/faranalytics/dialog/blob/main/src/implementations/tts/cartesia/cartesia_tts.ts) is provided that uses the [Cartesia](https://cartesia.ai/) API.

#### AI agent

An [Agent implementation](https://github.com/faranalytics/dialog/blob/main/src/implementations/agent/openai/openai_agent.ts) is provided that uses the [OpenAI](https://platform.openai.com/docs/overview) API.

## Custom Implementations

You can use provided implementation _as-is_, subclass it, or implement your own. If you plan to implement your own `VoIP`, `STT`, `Agent`, or `TTS` component, [interfaces](https://github.com/faranalytics/dialog/tree/main/src/interfaces) are provided for each component of the VoIP application.

#### Custom Agents

A custom agent implementation will allow you to manage conversation history and turn of speech in order to meet your specific needs. Just implement the `Agent` interface and pass it into the `Dialog` implementation.

You can use the provided implementation as a guide.

`openai_agent.ts`

```ts
import { randomUUID, UUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { log } from "../../../commons/logger.js";
import { OpenAI } from "openai";
import { Metadata } from "../../../commons/metadata.js";
import { Agent, AgentEvents } from "../../../interfaces/agent.js";
import { SecondsTimer } from "../../../commons/seconds_timer.js";
import { Stream } from "openai/streaming.mjs";

export interface OpenAIAgentOptions {
  apiKey: string;
  system: string;
  greeting: string;
}

export class OpenAIAgent implements Agent {
  public emitter: EventEmitter<AgentEvents>;

  protected openAI: OpenAI;
  protected system: string;
  protected greeting: string;
  protected metadata?: Metadata;
  protected dispatches: Set<UUID>;
  protected secondsTimer: SecondsTimer;
  protected uuid?: UUID;
  protected history: {
    role: "system" | "assistant" | "user";
    content: string;
  }[];
  protected mutex: Promise<void>;
  protected stream?: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>;

  constructor({ apiKey, system, greeting }: OpenAIAgentOptions) {
    this.emitter = new EventEmitter();
    this.openAI = new OpenAI({ apiKey: apiKey });
    this.system = system;
    this.greeting = greeting;
    this.dispatches = new Set();
    this.secondsTimer = new SecondsTimer();
    this.history = [
      {
        role: "system",
        content: this.system,
      },
    ];
    this.mutex = Promise.resolve();
  }

  public onTranscript = (transcript: string): void => {
    this.mutex = (async () => {
      try {
        await this.mutex;

        this.uuid = randomUUID();

        log.notice(`User message: ${transcript}`);

        this.history.push({ role: "user", content: transcript });

        const data = {
          model: "gpt-4o-mini",
          messages: this.history,
          temperature: 1,
          stream: true,
        } as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;

        this.stream = await this.openAI.chat.completions.create(data);
        let assistantMessage = "";
        let chunkCount = 0;
        for await (const chunk of this.stream) {
          const content = chunk.choices[0].delta.content;
          if (content) {
            chunkCount = chunkCount + 1;
            if (chunkCount < 5) {
              assistantMessage = assistantMessage + content;
            } else if (chunkCount == 5) {
              assistantMessage = assistantMessage + content;
              this.emitter.emit("transcript", this.uuid, assistantMessage);
            } else {
              assistantMessage = assistantMessage + content;
              this.emitter.emit("transcript", this.uuid, content);
            }
          }
        }

        if (chunkCount < 5) {
          this.emitter.emit("transcript", this.uuid, assistantMessage);
        }

        log.notice(`Assistant message: ${assistantMessage}`);
        this.history.push({ role: "assistant", content: assistantMessage });
        this.dispatches.add(this.uuid);
      } catch (err) {
        console.log(err);
        log.error(err);
      }
    })();
  };

  public onTranscriptDispatched = (uuid: UUID): void => {
    this.dispatches.delete(uuid);
  };

  public onUpdateMetadata = (metadata: Metadata): void => {
    if (this.metadata) {
      Object.assign(this.metadata, metadata);
    } else {
      this.metadata = metadata;
    }
    log.info(this.metadata);
  };

  public onStreaming = (): void => {
    this.history.push({ role: "assistant", content: this.greeting });
    this.emitter.emit("transcript", randomUUID(), this.greeting);
  };

  public onVAD = (): void => {
    if (this.uuid) {
      this.emitter.emit("abort_media");
      this.emitter.emit("abort_transcript", this.uuid);
    }
    if (this.stream) {
      this.stream.controller.abort();
    }
  };

  public onDispose = (): void => {
    if (this.stream) {
      this.stream.controller.abort();
    }
    this.emitter.removeAllListeners();
  };
}
```

## Support

If you have a feature request or run into any issues, feel free to submit an [issue](https://github.com/faranalytics/dialog/issues) or start a [discussion](https://github.com/faranalytics/dialog/discussions). You’re also welcome to reach out directly to one of the authors.

- [Adam Patterson](https://github.com/adamjpatterson)
