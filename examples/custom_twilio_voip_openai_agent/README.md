# Custom Twilio VoIP + OpenAI Agent

This example shows how to subclass the provided OpenAI agent to add custom behavior (e.g., history handling), while running an HTTPS/WSS server on a VPS and integrating Twilio, Deepgram (STT), and Cartesia (TTS).

## Prerequisites

- Node.js >= 20.9, npm >= 10.1 (same as the repo engines)
- Valid TLS certificate and private key files on your VPS
- Accounts/keys: Twilio, Deepgram, OpenAI, Cartesia

## Setup

1. Build the Dialog package in the repo root

```bash
# From repository root
npm install && npm run clean:build
```

2. Configure environment for this example

```bash
cd examples/custom_twilio_voip_openai_agent
cp .env.template .env
# Edit .env and set your values
```

Environment variables used by this example are defined in `src/settings.ts` and must match your `.env` file. Do not commit real secrets.

3. TLS certificates

Set `KEY_FILE` and `CERT_FILE` in `.env` to absolute paths on your VPS. You can use self‑signed certs for testing.

4. Install and build the example

```bash
npm install && npm run clean:build
```

## Run

- Development (auto‑rebuild/restart):

```bash
npm run monitor
```

- One‑shot run:

```bash
node --env-file=.env .
```

You should see a log indicating the HTTPS server is listening.

## Configure Twilio

- In the Twilio Console, set the Voice webhook for your phone number to `WEBHOOK_URL` from `.env` (e.g., `https://your-host:3443/twiml`).
- This example validates Twilio signatures and negotiates a TwiML `<Connect><Stream>` session to the example's WebSocket server.

## Providers and defaults

- STT: Deepgram Live (config in `src/settings.ts` → `DEEPGRAM_LIVE_SCHEMA`)
- TTS: Cartesia (config in `src/settings.ts` → `CARTESIA_SPEECH_OPTIONS`)
- Custom Agent: see `src/twilio_custom_agent.ts` for subclassing `OpenAIAgent`.
