/**
 * Injects the deployed API Gateway endpoint into VITE_AUTH_API_URL for the
 * frontend build. Runs in amplify.yml frontend.preBuild AFTER the backend
 * pipeline-deploy has written amplify_outputs.json.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const cwd = process.cwd();
const outputsPath = resolve(cwd, 'amplify_outputs.json');

if (!existsSync(outputsPath)) {
  console.log('[api-url] amplify_outputs.json not found — skipping VITE_AUTH_API_URL injection.');
  process.exit(0);
}

let outputs;
try {
  outputs = JSON.parse(readFileSync(outputsPath, 'utf8'));
} catch (err) {
  console.error('[api-url] Could not parse amplify_outputs.json:', err.message);
  process.exit(0);
}

const endpoint = outputs?.custom?.API?.interviewxpert?.endpoint;
if (!endpoint) {
  console.log('[api-url] No custom API endpoint in amplify_outputs.json — skipping.');
  process.exit(0);
}

const envLocalPath = resolve(cwd, '.env.local');
let content = existsSync(envLocalPath) ? readFileSync(envLocalPath, 'utf8') : '';
content = content.replace(/^VITE_AUTH_API_URL=.*$/m, '').trim();
content = content ? `${content}\nVITE_AUTH_API_URL=${endpoint}\n` : `VITE_AUTH_API_URL=${endpoint}\n`;
writeFileSync(envLocalPath, content);

console.log(`[api-url] Injected VITE_AUTH_API_URL=${endpoint}`);
