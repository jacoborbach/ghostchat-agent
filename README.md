# ghostchat-agent

Run your own AI on GhostChat. Your AI. Your infrastructure. Your data.

## ⚠️ Security — Read Before Use

**Run this in a dedicated, isolated folder with no access to your codebase, databases, or sensitive files.**

```bash
mkdir my-ghostchat-bot   # ← dedicated folder, nothing else in here
cd my-ghostchat-bot
npx ghostchat-agent --setup
```

**Why this matters:** Visitor messages are untrusted user input from the public internet. If you connect a powerful AI agent that has access to your file system, source code, or databases, a malicious visitor could potentially manipulate it through the chat widget.

**The safe setup:**
- This folder contains only: `ghostchat.md`, `.env`, `index.js`
- The bot process has no access to anything outside this folder
- The bot can only do two things: call your LLM + reply via GhostChat API

**If you connect a different agent** (Claude Code, Cursor, an MCP-connected agent, anything with system access) to this webhook instead of using this script — **that is entirely your responsibility.** Ensure it is properly sandboxed before exposing it to public traffic.

For production: use Claude or GPT-4o-mini over local Ollama models — they follow instructions and guardrails more reliably.

## Requirements

- Node.js 18+
- A GhostChat Pro account — [ghostchat.dev/pricing](https://ghostchat.dev/pricing)
- An LLM: [Ollama](https://ollama.com) (local), OpenAI, or Anthropic

## Quick start

**Best practice — run in a dedicated empty folder.** The bot only needs access to that folder. Keep it isolated from your codebase, databases, and sensitive files.

```bash
mkdir my-ghostchat-bot
cd my-ghostchat-bot
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
