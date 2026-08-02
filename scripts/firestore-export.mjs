/**
 * Export Firestore collections to NDJSON for migration into RDS.
 *
 * Requires:
 *   - api-server/serviceAccountKey.json (or FIREBASE_SERVICE_ACCOUNT_KEY)
 *
 * Usage:
 *   node scripts/firestore-export.mjs                          # all collections
 *   node scripts/firestore-export.mjs --collections blogs,tests
 *   node scripts/firestore-export.mjs --out ./firestore-export
 *
 * Output: one .ndjson file per collection in the --out directory.
 * Attempts (a subcollection of interviews) are written as "attempts.ndjson"
 * with a parentId field pointing at the parent interview id.
 */
import { createRequire } from 'module';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile();

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

// Dependency-ordered; excludes dead collections (chatSessions, interviewRequests).
const COLLECTIONS = [
  'users',
  'profiles',
  'recruiterRequests',
  'jobs',
  'interviews',
  'attempts', // subcollection of interviews
  'tests',
  'testSubmissions',
  'interviewAccessTokens',
  'blogs',
  'reviews',
  'notifications',
  'contactSubmissions',
  'bugReports',
  'supportTickets',
  'candidateConsents',
  'resumeDumpCandidates',
  'transactions',
  'auditLogs',
  'settings',
  'rateLimits',
];

const outDir = arg('out', resolve(process.cwd(), 'firestore-export'));
const PAGE_SIZE = Number(arg('page-size', 500));
const selected = (arg('collections') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function toPlain(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (typeof value === 'object' && typeof value.toMillis === 'function') {
    return new Date(value.toMillis()).toISOString();
  }
  if (typeof value === 'object' && typeof value.isEqual === 'function' && 'path' in value) {
    return value.path;
  }
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

async function fetchCollection(ref, file, parentId = null) {
  let count = 0;
  let lastDoc = null;
  const lines = [];
  for (;;) {
    let q = ref.orderBy('__name__').limit(PAGE_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      const record = {
        id: doc.id,
        ...(parentId !== null ? { parentId } : {}),
        data: toPlain(doc.data()),
      };
      lines.push(JSON.stringify(record));
      count++;
      lastDoc = doc;
    }
    if (snap.docs.length < PAGE_SIZE) break;
  }
  writeFileSync(file, lines.join('\n') + (lines.length ? '\n' : ''));
  return count;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const report = {};
  const wanted = selected.length ? selected : COLLECTIONS;
  for (const name of wanted) {
    if (!COLLECTIONS.includes(name) && name !== 'attempts') {
      console.warn(`Unknown collection "${name}" — skipping.`);
      continue;
    }
    if (name === 'attempts') {
      // Iterate every interview, then read its attempts subcollection.
      let interviewCount = 0;
      let lastInterview = null;
      let attemptCount = 0;
      const lines = [];
      for (;;) {
        let q = db.collection('interviews').orderBy('__name__').limit(100);
        if (lastInterview) q = q.startAfter(lastInterview);
        const snap = await q.get();
        if (snap.empty) break;
        for (const interview of snap.docs) {
          interviewCount++;
          lastInterview = interview;
          const subRef = db.collection('interviews').doc(interview.id).collection('attempts');
          let lastAttempt = null;
          for (;;) {
            let aq = subRef.orderBy('__name__').limit(PAGE_SIZE);
            if (lastAttempt) aq = aq.startAfter(lastAttempt);
            const aSnap = await aq.get();
            if (aSnap.empty) break;
            for (const doc of aSnap.docs) {
              lines.push(
                JSON.stringify({ id: doc.id, parentId: interview.id, data: toPlain(doc.data()) })
              );
              attemptCount++;
              lastAttempt = doc;
            }
            if (aSnap.docs.length < PAGE_SIZE) break;
          }
        }
        if (snap.docs.length < 100) break;
      }
      const file = join(outDir, 'attempts.ndjson');
      writeFileSync(file, lines.join('\n') + (lines.length ? '\n' : ''));
      report[name] = { attempts: attemptCount, interviewsTraversed: interviewCount };
      console.log(`attempts: ${attemptCount} rows (${interviewCount} interviews traversed)`);
      continue;
    }
    const count = await fetchCollection(db.collection(name), join(outDir, `${name}.ndjson`));
    report[name] = count;
    console.log(`${name}: ${count} rows`);
  }

  const reportPath = join(outDir, 'export-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
