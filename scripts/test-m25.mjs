import OpenAI from 'openai';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
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
}
loadEnv();

const client = new OpenAI({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.VITE_BEDROCK_CHAT_BASE_URL,
});

const msg = await client.chat.completions.create({
  model: 'minimax.minimax-m2.5',
  max_tokens: 256,
  messages: [
    { role: 'system', content: 'Return valid JSON only.' },
    { role: 'user', content: 'Return {"status":"ok","model":"m2.5"}' },
  ],
  response_format: { type: 'json_object' },
});

console.log(JSON.stringify(msg, null, 2));
