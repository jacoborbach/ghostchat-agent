# ghostchat-agent

Run your own AI on GhostChat. Your AI. Your infrastructure. Your data.

## Requirements

- Node.js 18+
- A GhostChat Pro account — [ghostchat.dev/pricing](https://ghostchat.dev/pricing)
- An LLM: [Ollama](https://ollama.com) (local), OpenAI, or Anthropic

## Quick start

```bash
npx ghostchat-agent --setup
```

The wizard will:
1. Validate your `gc_bot_` API key
2. Configure your widget (color, position, welcome message)
3. Ask about your business and generate `ghostchat.md`
4. Write your `.env` with LLM credentials

Then expose port 3000 to the internet:

```bash
# Option A — Cloudflare Tunnel (free, no account)
npx cloudflared tunnel --url http://localhost:3000

# Option B — ngrok
npx ngrok http 3000
```

Copy the HTTPS URL, add `/webhook` at the end, and paste it into the Webhook URL field at [app.ghostchat.dev/bot-agent](https://app.ghostchat.dev/bot-agent).

Then start your bot:

```bash
node index.js
```

## ghostchat.md

This is your bot's brain. Edit it anytime to update what your bot knows.
The bot uses the full file as its system prompt on every LLM call.

Run `node index.js --setup` to regenerate it from scratch.

## Supported LLMs

| Provider | Example models |
|----------|---------------|
| Ollama (local) | llama3, mistral, phi3 |
| OpenAI | gpt-4o-mini, gpt-4o |
| Anthropic | claude-haiku-4-5-20251001, claude-sonnet-4-6 |

## How it works

```
Visitor sends message
       ↓
GhostChat fires webhook → your bot
       ↓
Bot reads ghostchat.md + conversation history
       ↓
Bot calls your LLM
       ↓
Bot replies via GhostChat API
       ↓
Reply appears in visitor's widget
```

All conversations appear in your GhostChat dashboard. Jump in manually anytime — your bot will stay quiet for that session once a human replies.
