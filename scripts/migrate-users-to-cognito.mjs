/**
 * Migrate existing Firestore recruiter/admin users into Cognito.
 *
 * Requires:
 *   - AWS credentials with Cognito admin access
 *   - api-server/serviceAccountKey.json (or FIREBASE_SERVICE_ACCOUNT_KEY)
 *
 * Usage:
 *   node scripts/migrate-users-to-cognito.mjs --default-password 'TempPass123!'
 *   node scripts/migrate-users-to-cognito.mjs --email only@one.com --default-password 'TempPass123!'
 *
 * Each migrated user gets custom:legacyFirebaseUid = existing Firestore doc id so
 * Firestore rules and ownership fields keep working after Cognito login.
 */
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  AdminUpdateUserAttributesCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { createRequire } from 'module';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const require = createRequire(import.meta.url);

function arg(name, fallback = undefined) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function loadEnvFile() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
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

loadEnvFile();

const defaultPassword = arg('default-password');
const onlyEmail = arg('email');
const dryRun = process.argv.includes('--dry-run');

if (!defaultPassword) {
  console.error('Required: --default-password');
  process.exit(1);
}

const region = process.env.COGNITO_REGION || process.env.VITE_AWS_S3_REGION || 'ap-south-1';
const userPoolId = process.env.COGNITO_USER_POOL_ID || process.env.VITE_COGNITO_USER_POOL_ID || 'ap-south-1_RPHo5WjDk';

const client = new CognitoIdentityProviderClient({
  region,
  ...(process.env.COGNITO_AWS_ACCESS_KEY_ID && process.env.COGNITO_AWS_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: process.env.COGNITO_AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.COGNITO_AWS_SECRET_ACCESS_KEY,
        },
      }
    : process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          },
        }
      : {}),
});

const admin = require('firebase-admin');
const serviceAccountPath =
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
  resolve(process.cwd(), 'api-server/serviceAccountKey.json');

if (!existsSync(serviceAccountPath)) {
  console.error(`Missing Firebase service account: ${serviceAccountPath}`);
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });
const db = admin.firestore();

async function cognitoExists(email) {
  const listed = await client.send(
    new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${email.replace(/"/g, '')}"`,
      Limit: 1,
    })
  );
  return listed.Users?.[0] || null;
}

async function migrateOne(doc) {
  const data = doc.data();
  const email = String(data.email || '').trim();
  const role = data.role;
  if (!email || !['admin', 'recruiter'].includes(role)) {
    return { skipped: true, reason: 'missing email or unsupported role' };
  }
  if (onlyEmail && email.toLowerCase() !== onlyEmail.toLowerCase()) {
    return { skipped: true, reason: 'filtered out' };
  }

  const name = data.fullname || data.name || data.displayName || email;
  const existing = await cognitoExists(email);

  if (dryRun) {
    return {
      dryRun: true,
      email,
      firebaseUid: doc.id,
      role,
      existsInCognito: Boolean(existing),
    };
  }

  let sub;
  if (existing) {
    sub = existing.Attributes?.find((a) => a.Name === 'sub')?.Value;
    await client.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: existing.Username,
        UserAttributes: [
          { Name: 'custom:legacyFirebaseUid', Value: doc.id },
          { Name: 'custom:role', Value: role },
          ...(data.parentRecruiterId
            ? [{ Name: 'custom:parentRecruiterId', Value: data.parentRecruiterId }]
            : []),
          ...(data.teamId ? [{ Name: 'custom:teamId', Value: data.teamId }] : []),
        ],
      })
    );
    await client.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: existing.Username,
        Password: defaultPassword,
        Permanent: true,
      })
    );
  } else {
    const created = await client.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        TemporaryPassword: defaultPassword,
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: name },
          { Name: 'custom:role', Value: role },
          { Name: 'custom:legacyFirebaseUid', Value: doc.id },
          ...(data.parentRecruiterId
            ? [{ Name: 'custom:parentRecruiterId', Value: data.parentRecruiterId }]
            : []),
          ...(data.teamId ? [{ Name: 'custom:teamId', Value: data.teamId }] : []),
        ],
      })
    );
    sub = created.User.Attributes?.find((a) => a.Name === 'sub')?.Value;
    await client.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: email,
        Password: defaultPassword,
        Permanent: true,
      })
    );
  }

  try {
    await client.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: email,
        GroupName: role,
      })
    );
  } catch (_) {
    // already in group
  }

  await db.collection('users').doc(doc.id).set(
    {
      cognitoSub: sub,
      authProvider: 'cognito',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { email, firebaseUid: doc.id, cognitoSub: sub, role, updated: Boolean(existing) };
}

async function main() {
  const snap = await db.collection('users').get();
  const results = [];
  for (const doc of snap.docs) {
    try {
      const result = await migrateOne(doc);
      results.push(result);
      console.log(result);
    } catch (err) {
      const failure = { email: doc.data()?.email, firebaseUid: doc.id, error: err.message };
      results.push(failure);
      console.error(failure);
    }
  }

  const out = resolve(process.cwd(), 'scripts/cognito-migration-report.json');
  writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
