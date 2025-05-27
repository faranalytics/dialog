# Dialog

A modular `VoIP` ➞ `STT` ➞ `AI Agent` ➞ `TTS` ➞ `VoIP` implementation.

## Introduction

Dialog provides a framework and a set of interfaces for building VoIP Agent applications.

### Features

- An easy to understand and extensible modular framework
- Event driven architecture
- Facilities for multithreaded deployments
- Talk over interruption of agent
- Conversation history
- Agent-driven STT and TTS selection

**NB** Dialog is still undergoing active refactoring. Prior to 1.0.0, public interfaces may change on turns of the minor and commit messages will be minimal.

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

### Install Dialog into your package

#### Change directory into your package directory and install the package.

```bash
npm install <path-to-the-dialog-respository> --save
```

You should now be able to import Dialog artifacts into your package.

## Usage

[Example](https://github.com/faranalytics/dialog/tree/main/examples) applications are provided in the example subpackages.

### How it works

When a call is initiated, a `Controller` (e.g., a Twilio or Telnyx Controller) emits an `init` event. The `init` handler is called with a `VoIP` instance as its single argument. The `VoIP` instance handles the websocket connection that is set on it by the `Controller`. In the `init` handler, an instance of a Dialog application is constructed by passing a `VoIP`, `STT`, `Agent`, and `TTS` implementation into a `Dialog` constructor. The `Dialog` constructor connects the component interfaces that comprise the application.

An important characteristic of the architecture is that a _new_ instance of each component of a Dialog application - a `VoIP`, `STT`, `TTS`, and an `Agent` - is created on each call; this means each instance may maintain state relevant to its respective call.

Excerpted from `src/main.ts`.

```ts
controller.on("init", (voip: VoIP) => {
  const stt = new DeepgramSTT({ apiKey: DEEPGRAM_API_KEY });
  const tts = new CartesiaTTS({ apiKey: CARTESIA_API_KEY });
  const agent = new OpenAIAgent({
    apiKey: OPENAI_API_KEY,
    system: OPENAI_SYSTEM_MESSAGE,
    greeting: OPENAI_GREETING_MESSAGE,
    model: OPENAI_MODEL,
  });
  const dialog = new Dialog({ voip, stt, tts, agent });
});
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

Dialog provides `VoIP`, `STT`, `Agent`, and `TTS` example implementations. You can use a provided implementation _as-is_, subclass it, or implement your own. If you plan to implement your own `VoIP`, `STT`, `Agent`, or `TTS` component, [interfaces](https://github.com/faranalytics/dialog/tree/main/src/interfaces) are provided for each component of the VoIP application.

#### Custom Agents

A custom `Agent` implementation will allow you to manage conversation history, turn of speech, agent interruption, STT and TTS selection, and other nuances. Just implement the `Agent` interface and pass it into the `Dialog` implementation.

You can use the provided `openai_agent.ts` [implementation](https://github.com/faranalytics/dialog/blob/main/src/implementations/agent/openai/openai_agent.ts) as a guide.

#### A custom agent based on `openai_agent.ts`.

```ts
import { randomUUID } from "node:crypto";
import { log, Agent, OpenAIAgent } from "@farar/dialog";

export interface CustomAgentOptions {
  apiKey: string;
  system: string;
  greeting: string;
}

export class CustomAgent extends OpenAIAgent implements Agent {
  public onTranscript = (transcript: string): void => {
    this.mutex = (async () => {
      try {
        await this.mutex;
        this.uuid = randomUUID();
        log.notice(`User message: ${transcript}`);
        this.history.push({ role: "user", content: transcript });
        this.stream = await this.openAI.chat.completions.create({
          model: "gpt-4o",
          messages: this.history,
          temperature: 1,
          stream: true,
        });
        await this.consumeStream(this.uuid, this.stream);
      } catch (err) {
        console.log(err);
        log.error(err);
      }
    })();
  };

  public onStreaming = (): void => {
    this.history.push({ role: "assistant", content: this.greeting });
    this.emitter.emit("transcript", randomUUID(), this.greeting);
  };
}
```

## Support

If you have a feature request or run into any issues, feel free to submit an [issue](https://github.com/faranalytics/dialog/issues) or start a [discussion](https://github.com/faranalytics/dialog/discussions). You’re also welcome to reach out directly to one of the authors.

- [Adam Patterson](https://github.com/adamjpatterson)
