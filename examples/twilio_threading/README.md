# Twilio VoIP (Worker Thread Bridge)

This example demonstrates running Twilio VoIP handling in a worker thread via `port_agent`, while the main thread hosts the HTTPS/WSS servers and Twilio Gateway.

## Prerequisites

- Node.js >= 20.9, npm >= 10.1 (same as the repo engines)
- Valid TLS certificate and private key files on your VPS
- Twilio account and credentials

## Setup

1) Build the Dialog package in the repo root

```bash
# From repository root
npm install && npm run clean:build
```

2) Configure environment

```bash
cd examples/twilio_threading
cp .env.template .env
# Edit .env and set your values
```

Environment variables used by this example are defined in `src/settings.ts` and must match your `.env` file. Do not commit real secrets.

3) TLS certificates

Set `KEY_FILE` and `CERT_FILE` in `.env` to absolute paths on your VPS. You can use self‑signed certs for testing.

4) Install and build the example

```bash
cd examples/twilio_threading
npm install && npm run clean:build
```

## Run

- Development (auto‑rebuild/restart):

```bash
npm run monitor
```

- One‑shot run (from the example directory):

```bash
node --env-file=.env .
```

You should see a log indicating the HTTPS server is listening.

## Configure Twilio

- In the Twilio Console, set the Voice webhook for your phone number to `WEBHOOK_URL` from `.env` (e.g., `https://your-host:3443/twiml`).
- This example validates Twilio signatures and negotiates a TwiML `<Connect><Stream>` session to the example's WebSocket server.

## Worker thread

The main thread constructs `TwilioGateway` and emits `voip` events for each call. Each `TwilioVoIP` instance is bridged into the worker via `TwilioVoIPAgent`. The worker receives VoIP events and can act on them without blocking the main server.
