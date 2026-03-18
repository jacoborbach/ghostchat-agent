'use strict';

require('dotenv').config();
const express = require('express');
const fs = require('fs');

const GC_API = 'https://api.ghostchat.dev';

// Parse ghostchat.md — extracts config block and full text as system prompt
function parseGhostchatMd() {
  const raw = fs.readFileSync('ghostchat.md', 'utf8');

  const config = {};
  const siteIdMatch = raw.match(/^site_id:\s*(.+)$/m);
  const portMatch = raw.match(/^webhook_port:\s*(.+)$/m);

  if (siteIdMatch) config.siteId = siteIdMatch[1].trim();
  config.port = portMatch ? parseInt(portMatch[1].trim(), 10) : 3000;

  // Full file becomes system prompt (LLM reads it as-is)
  config.systemPrompt = raw;

  return config;
}

// Call LLM based on provider
async function callLLM(systemPrompt, conversationHistory, newMessage) {
  const provider = process.env.LLM_PROVIDER || 'ollama';
  const model = process.env.LLM_MODEL || 'llama3';

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: newMessage },
  ];

  if (provider === 'ollama') {
    const baseUrl = process.env.LLM_BASE_URL || 'http://localhost:11434';
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
    const data = await res.json();
    return data.message?.content || '';
  }

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.LLM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, max_tokens: 300 }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (provider === 'anthropic') {
    const system = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role !== 'system');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.LLM_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, system, messages: userMessages, max_tokens: 300 }),
    });
    if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
    const data = await res.json();
    return data.content?.[0]?.text || '';
  }

  throw new Error(`Unknown LLM provider: ${provider}`);
}

// Send reply back to visitor via GhostChat API
async function sendReply(sessionId, content) {
  const apiKey = process.env.GHOSTCHAT_API_KEY;
  const res = await fetch(`${GC_API}/messages/owner`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionId, content }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GhostChat API error ${res.status}: ${body}`);
  }
}

// Fetch recent conversation history for context
async function getHistory(sessionId) {
  const apiKey = process.env.GHOSTCHAT_API_KEY;
  try {
    const res = await fetch(`${GC_API}/messages/${sessionId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const messages = await res.json();
    // Convert to LLM message format, last 10 messages for context
    return messages.slice(-10).map(m => ({
      role: m.sender === 'VISITOR' ? 'user' : 'assistant',
      content: m.content,
    }));
  } catch {
    return [];
  }
}

module.exports = async function startAgent() {
  if (!fs.existsSync('ghostchat.md')) {
    console.error('❌ ghostchat.md not found. Run with --setup first.');
    process.exit(1);
  }

  const apiKey = process.env.GHOSTCHAT_API_KEY;
  if (!apiKey || !apiKey.startsWith('gc_bot_')) {
    console.error('❌ GHOSTCHAT_API_KEY not set or invalid. Check your .env file.');
    process.exit(1);
  }

  const config = parseGhostchatMd();
  const provider = process.env.LLM_PROVIDER || 'ollama';
  const model = process.env.LLM_MODEL || 'llama3';

  const app = express();
  app.use(express.json());

  app.post('/webhook', async (req, res) => {
    // Acknowledge immediately — GhostChat doesn't wait for a response
    res.sendStatus(200);

    const { sessionId, content, siteName } = req.body;
    if (!sessionId || !content) return;

    const timestamp = new Date().toLocaleTimeString();
    console.log(`\n[${timestamp}] New message on ${siteName || 'your site'}`);
    console.log(`  Visitor: "${content}"`);

    try {
      // Get conversation history for context
      const history = await getHistory(sessionId);

      // Call LLM
      const reply = await callLLM(config.systemPrompt, history, content);

      if (!reply) {
        console.log('  ⚠ LLM returned empty response — skipping reply');
        return;
      }

      // Check if bot is flagging for human
      const flagged = reply.toLowerCase().includes("i'll have someone follow up") ||
                      reply.toLowerCase().includes("someone will follow up");

      // Send reply to visitor
      await sendReply(sessionId, reply);
      console.log(`  Bot: "${reply.substring(0, 80)}${reply.length > 80 ? '...' : ''}"`);

      if (flagged) {
        console.log('  ⚑ Flagged for human review — check your dashboard');
      }
    } catch (err) {
      console.error(`  ❌ Error: ${err.message}`);
    }
  });

  // Health check
  app.get('/health', (req, res) => res.json({ status: 'ok', provider, model }));

  app.listen(config.port, () => {
    console.log(`\nGhostChat Bot Agent`);
    console.log('───────────────────');
    console.log(`✓ Running on port ${config.port}`);
    console.log(`✓ LLM: ${provider} / ${model}`);
    console.log(`✓ Waiting for visitor messages...`);
    console.log(`\nAll conversations: https://app.ghostchat.dev`);
    console.log('Press Ctrl+C to stop.\n');
  });
};
