'use strict';

const readline = require('readline');
const fs = require('fs');

const GC_API = 'https://api.ghostchat.dev';

function ask(rl, question, defaultValue) {
  return new Promise(resolve => {
    const prompt = defaultValue ? `${question} (${defaultValue}): ` : `${question}: `;
    rl.question(prompt, answer => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

async function validateApiKey(apiKey) {
  const res = await fetch(`${GC_API}/sites`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function getSites(apiKey) {
  const res = await fetch(`${GC_API}/sites`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) return [];
  const sites = await res.json();
  return sites.filter(s => !s.deletedAt);
}

async function configureSite(apiKey, siteId, config) {
  const res = await fetch(`${GC_API}/sites/${siteId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  return res.ok;
}

function generateGhostchatMd(config) {
  const faqs = config.faqs.length > 0
    ? config.faqs.map(f => `Q: ${f.q}\nA: ${f.a}`).join('\n\n')
    : 'Q: How can I contact support?\nA: Just send a message here and we\'ll get back to you.';

  return `# GhostChat Bot Config

## Site
site_id: ${config.siteId}
webhook_port: ${config.port}

## Widget
color: "${config.color}"
position: ${config.position}
welcome_message: "${config.welcomeMessage}"
away_message: "We'll be right back soon."

## Business
name: ${config.businessName}
url: ${config.siteUrl}

## System Prompt
You are a helpful assistant for ${config.businessName}.

${config.businessDescription}

Answer visitor questions helpfully and concisely.
Keep responses short — 1-3 sentences unless more detail is needed.
If you genuinely don't know something, say "I'll have someone follow up with you shortly" — never make things up.

## FAQs
${faqs}

## Behavior
on_unknown: flag_for_human
collect_email: ask_if_unresolved
`;
}

module.exports = async function setup() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\nGhostChat Bot Setup');
  console.log('───────────────────');

  // Step 1: API key
  let apiKey = process.env.GHOSTCHAT_API_KEY || '';
  if (!apiKey) {
    apiKey = await ask(rl, '? Your gc_bot_ API key');
  }

  if (!apiKey.startsWith('gc_bot_')) {
    console.error('\n❌ Invalid key — must start with gc_bot_');
    rl.close();
    process.exit(1);
  }

  process.stdout.write('  Validating API key... ');
  const sites = await getSites(apiKey).catch(() => null);
  if (sites === null) {
    console.log('❌');
    console.error('Could not connect to GhostChat API. Check your key and try again.');
    rl.close();
    process.exit(1);
  }
  console.log('✓');

  // Step 2: Pick a site
  let siteId;
  let siteUrl = '';

  if (sites.length === 0) {
    console.log('\n  No sites found. Create one at app.ghostchat.dev/sites first, then re-run setup.');
    rl.close();
    process.exit(1);
  } else if (sites.length === 1) {
    siteId = sites[0].id;
    siteUrl = sites[0].domain || '';
    console.log(`\n  Using site: ${sites[0].name}${siteUrl ? ` (${siteUrl})` : ''}`);
  } else {
    console.log('\n  Your sites:');
    sites.forEach((s, i) => console.log(`  ${i + 1}. ${s.name}${s.domain ? ` — ${s.domain}` : ''}`));
    const choice = await ask(rl, `? Which site? (1-${sites.length})`, '1');
    const idx = parseInt(choice, 10) - 1;
    if (idx < 0 || idx >= sites.length) {
      console.error('Invalid choice.');
      rl.close();
      process.exit(1);
    }
    siteId = sites[idx].id;
    siteUrl = sites[idx].domain || '';
  }

  // Step 3: Business info
  console.log('\n  Tell us about your business:\n');
  const businessName = await ask(rl, '? Business name');
  const businessDescription = await ask(rl, '? What do you sell or do? (1-2 sentences)');

  // Step 4: FAQs
  console.log('\n  Add common visitor questions (press Enter with no input to stop):\n');
  const faqs = [];
  for (let i = 0; i < 5; i++) {
    const q = await ask(rl, `? Question ${i + 1}`);
    if (!q) break;
    const a = await ask(rl, `  Answer`);
    if (a) faqs.push({ q, a });
  }

  // Step 5: Widget config
  console.log('\n  Widget settings:\n');
  const welcomeMessage = await ask(rl, '? Welcome message visitors see', 'Hi! How can I help you?');
  const color = await ask(rl, '? Brand color (hex)', '#2563eb');
  const position = await ask(rl, '? Widget position (bottom-right / bottom-left)', 'bottom-right');
  const port = await ask(rl, '? Port to run bot on', '3000');

  // Step 6: LLM config
  console.log('\n  LLM setup:\n');
  console.log('  Providers: ollama (local) | openai | anthropic');
  const provider = await ask(rl, '? LLM provider', 'ollama');
  let model = 'llama3';
  let llmApiKey = '';

  if (provider === 'ollama') {
    model = await ask(rl, '? Ollama model', 'llama3');
  } else if (provider === 'openai') {
    model = await ask(rl, '? OpenAI model', 'gpt-4o-mini');
    llmApiKey = await ask(rl, '? OpenAI API key');
  } else if (provider === 'anthropic') {
    model = await ask(rl, '? Claude model', 'claude-haiku-4-5-20251001');
    llmApiKey = await ask(rl, '? Anthropic API key');
  }

  rl.close();

  // Write files
  console.log('\n  Setting up...\n');

  // Configure widget + webhook URL
  const webhookUrl = `http://localhost:${port}/webhook`;
  process.stdout.write('  Configuring widget on GhostChat... ');
  const configured = await configureSite(apiKey, siteId, {
    color,
    position,
    welcomeMessage,
    webhookUrl,
  });
  console.log(configured ? '✓' : '⚠ (could not update widget — you can update it manually)');

  // Write ghostchat.md
  process.stdout.write('  Writing ghostchat.md... ');
  const md = generateGhostchatMd({ siteId, port, color, position, welcomeMessage, businessName, businessDescription, siteUrl, faqs });
  fs.writeFileSync('ghostchat.md', md);
  console.log('✓');

  // Write .env
  process.stdout.write('  Writing .env... ');
  let envContent = `GHOSTCHAT_API_KEY=${apiKey}\nLLM_PROVIDER=${provider}\nLLM_MODEL=${model}\n`;
  if (provider === 'ollama') envContent += `LLM_BASE_URL=http://localhost:11434\n`;
  if (llmApiKey) envContent += `LLM_API_KEY=${llmApiKey}\n`;
  fs.writeFileSync('.env', envContent);
  console.log('✓');

  console.log(`
✓ Setup complete!

Your bot is configured but needs a public URL to receive webhooks.
Expose port ${port} using one of:

  npx cloudflared tunnel --url http://localhost:${port}
  npx ngrok http ${port}

Copy the HTTPS URL you get, add /webhook at the end, and paste it
into the Webhook URL field on app.ghostchat.dev/bot-agent.

Then start your bot:

  node index.js

All conversations will appear at app.ghostchat.dev
`);
};
