# Dialog

A modular framework for building `VoIP` ➞ `STT` ➞ `Agent (LLM)` ➞ `TTS` ➞ `VoIP` applications.

## Introduction

Dialog is an orchestration layer for VoIP-Agent applications. Two common VoIP Agent models exist today: the Speech-to-Speech (S2S) model and the Speech-to-Text with Text-to-Speech (STT–TTS) model.

The S2S model directly converts spoken input into spoken output, while the STT–TTS model first converts speech into text, which is processed by an Agent; the Agent’s textual response is then converted back into speech. Both approaches involve tradeoffs.

Dialog adopts the STT–TTS model. It orchestrates communication between the VoIP, STT, TTS, and Agent modules. The framework provides concrete implementations of VoIP, STT, and TTS modules, along with abstract Agent classes designed for subclassing.

### Features

- Simple, extensible, modular framework
- Concrete implementations for VoIP, STT, and TTS, plus abstract Agent classes for extension
- Multithreaded deployments
- Event-driven architecture
- Isolated state — modules exchange objects but never share references

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

[Example](https://github.com/faranalytics/dialog/tree/main/examples/) applications are provided in the examples subpackages.

### How it works

When a call is initiated, a `Controller` (e.g., a Twilio Controller) emits a `voip` event. The `voip` handler is called with a `VoIP` instance as its single argument. The `VoIP` instance handles the web socket connection that is set on it by the `Controller`. In the `voip` handler, an instance of an `Agent` is constructed by passing a `VoIP`, `STT`, and `TTS` implementation into its constructor. The agent is started by calling its `activate` method. The `activate` method of the `Agent` instance connects the interfaces that comprise the application.

An important characteristic of the architecture is that a _new_ instance of each participant in a Dialog application — `VoIP`, `STT`, `TTS`, and `Agent` — is created for every call. This allows each instance to maintain state specific to its call.

Excerpted from `src/main.ts`.

```ts
...
const controller = new TwilioController({
  httpServer,
  webSocketServer,
  webhookURL: new URL(WEBHOOK_URL),
  authToken: TWILIO_AUTH_TOKEN,
  accountSid: TWILIO_ACCOUNT_SID
});

controller.on("voip", (voip: TwilioVoIP) => {
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

## Implementations

Dialog provides example [implementations](https://github.com/faranalytics/dialog/tree/main/src/implementations) for each of the artifacts that comprise a VoIP Agent application.

### VoIP

#### [Twilio](https://twilio.com/)

- Twilio request validation
- Recording status
- Transcript status
- Speech interruption

### Speech to text (STT)

#### [Deepgram](https://deepgram.com/)

- Voice activity detection (VAD) events

#### [OpenAI](https://openai.com/)

- Voice activity detection (VAD) events
- Semantic VAD

### Text to speech (TTS)

#### [Cartesia](https://cartesia.ai/)

- Configurable voice

#### [ElevenLabs](https://elevenlabs.io/)

- Configurable voice

### AI agent

#### [OpenAI](https://openai.com/)

- An abstract [Agent implementation](https://github.com/faranalytics/dialog/blob/main/src/implementations/agent/abstract/openai/openai_agent.ts) is provided that uses the [OpenAI](https://platform.openai.com/docs/overview) API.

## Custom Implementations

Dialog provides concrete `VoIP`, `STT`, and `TTS` implementations and an abstract `Agent` implementation. You can use a provided implementation _as-is_, subclass it, or choose an interface and implement your own. If you plan to implement your own `VoIP`, `STT`, `Agent`, or `TTS`, [interfaces](https://github.com/faranalytics/dialog/tree/main/src/interfaces) are provided for each participant of the VoIP application.

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
  TwilioVoIPOpenAIAgentOptions,
  OpenAIConversationHistory,
} from "@farar/dialog";

export interface CustomAgentOptions extends OpenAIAgentOptions<TwilioVoIP> {
  twilioAccountSid: string;
  twilioAuthToken: string;
  system?: string;
  greeting?: string;
}

export class CustomAgent extends OpenAIAgent<TwilioVoIP> {
  protected metadata?: TwilioMetadata;
  protected twilioAccountSid: string;
  protected twilioAuthToken: string;
  protected history: OpenAIConversationHistory;
  protected transcript: unknown[];
  protected system: string;
  protected greeting: string;

  constructor(options: TwilioVoIPOpenAIAgentOptions) {
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

  public dispatchInitialMessage = (): void => {
    const uuid = randomUUID();
    this.activeMessages.add(uuid);
    this.history.push({ role: "assistant", content: this.greeting });
    this.dispatchMessage(
      { uuid: uuid, data: this.greeting, done: true },
      false
    ).catch(this.dispose);
  };
}
```

## Support

If you have a feature request or run into any issues, feel free to submit an [issue](https://github.com/faranalytics/dialog/issues) or start a [discussion](https://github.com/faranalytics/dialog/discussions). You’re also welcome to reach out directly to one of the authors.

- [Adam Patterson](https://github.com/adamjpatterson)
