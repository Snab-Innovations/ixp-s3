/**
 * Bootstrap the first Cognito admin (chicken-and-egg for /auth/create-user).
 *
 * Usage:
 *   node scripts/bootstrap-cognito-admin.mjs --email admin@example.com --password 'Password123!' --name 'Admin'
 *
 * Optional:
 *   --firebase-uid <existingFirestoreUid>  Keep existing Firestore users/{uid}
 *   --create-firestore                 Also write users/{uid} via Firebase Admin (needs service account)
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
import { readFileSync, existsSync } from 'fs';
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

const email = arg('email');
const password = arg('password');
const name = arg('name', 'Admin');
const legacyUid = arg('firebase-uid');
const createFirestore = process.argv.includes('--create-firestore');

if (!email || !password) {
  console.error('Required: --email and --password');
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

async function main() {
  const existing = await client.send(
    new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${email.replace(/"/g, '')}"`,
      Limit: 1,
    })
  );

  let username = email;
  let sub;

  if (existing.Users?.length) {
    username = existing.Users[0].Username;
    sub = existing.Users[0].Attributes?.find((a) => a.Name === 'sub')?.Value;
    console.log(`Cognito user already exists: ${username} (sub=${sub})`);
  } else {
    const created = await client.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        TemporaryPassword: password,
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: name },
          { Name: 'custom:role', Value: 'admin' },
          ...(legacyUid
            ? [{ Name: 'custom:legacyFirebaseUid', Value: legacyUid }]
            : []),
        ],
      })
    );
    username = created.User.Username;
    sub = created.User.Attributes?.find((a) => a.Name === 'sub')?.Value;
    console.log(`Created Cognito user ${username} (sub=${sub})`);
  }

  await client.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: username,
      Password: password,
      Permanent: true,
    })
  );

  try {
    await client.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: username,
        GroupName: 'admin',
      })
    );
  } catch (err) {
    if (err.name !== 'InvalidParameterException') throw err;
  }

  if (legacyUid) {
    await client.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: username,
        UserAttributes: [
          { Name: 'custom:legacyFirebaseUid', Value: legacyUid },
          { Name: 'custom:role', Value: 'admin' },
        ],
      })
    );
  }

  const firebaseUid = legacyUid || sub;

  if (createFirestore) {
    const admin = require('firebase-admin');
    const serviceAccountPath =
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
      resolve(process.cwd(), 'api-server/serviceAccountKey.json');
    if (!existsSync(serviceAccountPath)) {
      throw new Error(`Missing Firebase service account at ${serviceAccountPath}`);
    }
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });
    }

    try {
      await admin.auth().getUser(firebaseUid);
    } catch {
      await admin.auth().createUser({
        uid: firebaseUid,
        email,
        emailVerified: true,
        displayName: name,
      });
    }

    await admin.firestore().collection('users').doc(firebaseUid).set(
      {
        uid: firebaseUid,
        email,
        fullname: name,
        name,
        role: 'admin',
        adminVerified: true,
        accountStatus: 'active',
        cognitoSub: sub,
        authProvider: 'cognito',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    console.log(`Firestore users/${firebaseUid} upserted as admin`);
  }

  console.log('\nDone.');
  console.log(`  Cognito sub : ${sub}`);
  console.log(`  Firebase UID: ${firebaseUid}`);
  console.log(`  Email       : ${email}`);
  console.log('Sign in via the portal once the auth API is running.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
