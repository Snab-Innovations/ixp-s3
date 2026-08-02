/**
 * Bedrock Mantle smoke test — Chat Completions (MiniMax / GLM).
 * Run: node scripts/test-bedrock.mjs
 */
import OpenAI from 'openai';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  try {
    const raw = readFileSync(resolve('.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    console.warn('No .env found; using process env only.');
  }
}

loadEnv();

const apiKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;
const chatBase =
  process.env.VITE_BEDROCK_CHAT_BASE_URL ||
  'https://bedrock-mantle.ap-south-1.api.aws/v1';
const workspace =
  process.env.ANTHROPIC_WORKSPACE_ID ||
  process.env.VITE_ANTHROPIC_WORKSPACE_ID ||
  'default';

if (!apiKey) {
  console.error('Missing ANTHROPIC_API_KEY');
  process.exit(1);
}

const client = new OpenAI({
  apiKey,
  baseURL: chatBase,
  defaultHeaders: { 'OpenAI-Project': workspace },
});

const models = [
  ['questions', process.env.VITE_BEDROCK_MODEL_QUESTIONS || 'minimax.minimax-m2.1'],
  ['report', process.env.VITE_BEDROCK_MODEL_REPORT || 'minimax.minimax-m2.5'],
  ['default', process.env.VITE_BEDROCK_MODEL_DEFAULT || 'zai.glm-4.7-flash'],
];

for (const [label, model] of models) {
  process.stdout.write(`\n▶ Testing ${label}: ${model} ... `);
  try {
    const msg = await client.chat.completions.create({
      model,
      max_tokens: 64,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    });
    const text = (msg.choices?.[0]?.message?.content || '').trim();
    console.log(`OK → ${JSON.stringify(text).slice(0, 120)}`);
  } catch (err) {
    console.log('FAIL');
    console.error(err?.message || err);
    if (err?.error) console.error(JSON.stringify(err.error, null, 2));
    process.exitCode = 1;
  }
}
