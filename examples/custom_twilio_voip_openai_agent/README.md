# Custom Twilio VoIP, Deepgram STT, Cartesia TTS, and OpenAI Agent

In this example you will subclass an `OpenAIAgent` to add custom behavior (e.g., history handling). You will run a `TwilioGateway`. Your agent will be configured with a `DeepgramSTT` component and a `CartesiaTTS` component.

## Requirements

- Valid TLS certificate and private key files
- API Keys: Twilio, Deepgram, OpenAI, Cartesia

## Implementation

This implementation binds a HTTPS server to a public interface - you may need to improvise if you are using a tunneling service such as Ngrok.

### Clone the repository

```bash
git clone https://github.com/faranalytics/dialog.git
```

### Install and build the Dialog package

Prior to configuring and running the example you will install the Dialog package.

Change directory into the dialog repository.

```bash
cd dialog
```

Install the package dependencies.

```bash
npm install && npm upgrade
```

Build the package.

```bash
npm run clean:build
```

### Configure your environment

Change directory into the example directory.

```bash
cd examples/custom_twilio_voip_openai_agent
```

Create your `.env` configuration file.

```bash
cp .env.template .env
```

Provide each of the required values.

```ini
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
DEEPGRAM_API_KEY=
CARTESIA_API_KEY=
OPENAI_API_KEY=
KEY_FILE=
CERT_FILE=
HOST_NAME=0.0.0.0
PORT=3443
WEBHOOK_URL=
```

You can configure the Deepgram and Cartesia components, OpenAI system message, and other configuration settings in the `settings.ts` file.

### Configure Twilio

In the Twilio Console, set the Voice webhook for your phone number to `WEBHOOK_URL` from `.env` (e.g., `https://your-host:3443/twiml`).

### Install and run the example

Make sure you are in the root directory of the example.

```bash
cd examples/custom_twilio_voip_openai_agent
```

Install the example.

```bash
npm install && npm upgrade
```

Run the example.

```bash
npm run monitor
```

## Usage

The HTTPS server will bind to a public interface and the TwilioGateway will wait for a Twilio webhook request. You can use your Twilio phone number to call and speak with the assistant.

## Support

If you need help, please reference the [Support](https://github.com/faranalytics/dialog/tree/main?tab=readme-ov-file#support) section in the main README.md.
