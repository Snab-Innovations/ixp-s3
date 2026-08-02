import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(resolve(__dirname, '../.env'));
loadEnvFile(resolve(__dirname, '.env'));

if (!process.env.AWS_REGION) {
  process.env.AWS_REGION =
    process.env.COGNITO_REGION ||
    process.env.VITE_COGNITO_REGION ||
    process.env.VITE_AWS_S3_REGION ||
    'ap-south-1';
}

/**
 * Cognito configuration for the InterviewXpert auth bridge.
 *
 * Credentials (in order):
 * 1. COGNITO_AWS_ACCESS_KEY_ID / COGNITO_AWS_SECRET_ACCESS_KEY
 * 2. AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
 * 3. Default AWS credential chain (shared config / IAM role / CLI profile)
 *
 * Do NOT silently reuse VITE_AWS_* S3 keys — they may belong to a different account
 * than the Cognito user pool.
 */
const accessKeyId =
  process.env.COGNITO_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || undefined;
const secretAccessKey =
  process.env.COGNITO_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || undefined;

export const cognitoConfig = {
  region: process.env.COGNITO_REGION || process.env.AWS_REGION || 'ap-south-1',
  userPoolId: process.env.COGNITO_USER_POOL_ID || process.env.VITE_COGNITO_USER_POOL_ID || 'ap-south-1_RPHo5WjDk',
  clientId: process.env.COGNITO_CLIENT_ID || process.env.VITE_COGNITO_CLIENT_ID || '74i9tr52i2v3c1v3pceq3as6e3',
  accessKeyId,
  secretAccessKey,
};

export const issuer = `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/${cognitoConfig.userPoolId}`;

