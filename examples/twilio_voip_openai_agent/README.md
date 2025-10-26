# Twilio VoIP + OpenAI Agent (Deepgram STT + Cartesia TTS)

A minimal, production‑style example that runs an HTTPS/WSS server on a VPS, accepts Twilio Voice webhooks, streams media over WebSocket, transcribes with Deepgram, generates with OpenAI, and synthesizes audio with Cartesia.

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
cd examples/twilio_voip_openai_agent
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
- OpenAI: Chat Completions model and messages configured in `src/settings.ts`

You can switch STT/TTS by editing `src/main.ts` (uncomment the desired implementations) and updating `.env` accordingly.
