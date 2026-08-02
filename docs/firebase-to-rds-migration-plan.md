# Firebase → AWS RDS Migration Plan

Target end-state: **PostgreSQL (RDS) as the single source of truth**, S3 for blobs, Cognito for identity, SES for email, Bedrock for AI. Zero Firebase dependencies (Firestore, Firebase Auth, Firebase Storage, firebase-admin, Firebase Hosting).

---

## 1. Current-State Analysis (verified in code, Aug 2026)

### 1.1 Firebase surface area

**Firestore collections (24)** — usage status:

| Collection | Used by (client) | Status |
|---|---|---|
| `users` | `Profile.tsx`, `AdminProfile.tsx` | ⚠️ client still reads/writes |
| `profiles` | `Profile.tsx` | ⚠️ client still reads/writes |
| `notifications` | `NotificationCenter.tsx`, `services/notificationService.ts` | ⚠️ client still reads/writes |
| `interviews` | `ActiveJobs.tsx`, `CandidateInterviews.tsx`, `InvitedCandidates.tsx`, `AdminStats.tsx`, `CreateTest.tsx`, `TakeTest.tsx`, `InterviewReport.tsx`, `InterviewVoiceInterview.tsx` | ⚠️ partial (writes moved to RDS) |
| `interviews/{id}/attempts` (subcollection) | `AdminStats.tsx`, `InvitedCandidates.tsx`, `InterviewReportModal.tsx` | ⚠️ reads only |
| `jobs` | `CareerHub.tsx` | ⚠️ reads only |
| `tests` | `CreateTest.tsx`, `RecruiterTests.tsx`, `TakeTest.tsx`, `TestAccess.tsx`, `TestResults.tsx` | ⚠️ partial |
| `testSubmissions` | `RecruiterTests.tsx`, `TestResults.tsx` | ⚠️ reads only |
| `interviewAccessTokens` | `TakeTest.tsx` (create), `Interview.tsx` (validate/consume) | ⚠️ |
| `blogs` | `AdminBlogs.tsx`, `Blogs.tsx`, `BlogDetail.tsx`, `Status.tsx` | ⚠️ full CRUD still Firestore |
| `reviews` | `Reviews.tsx`, `SubmitReview.tsx`, `UserReviews.tsx` | ⚠️ |
| `contactSubmissions` | `ContactUs.tsx`, `OurJourney.tsx`, `ActiveJobs.tsx` | ⚠️ writes |
| `bugReports` | `ReportBug.tsx` | ⚠️ writes |
| `supportTickets` | `SupportCenter.tsx` | ⚠️ writes — **no RDS table exists** |
| `settings` | `AdminProfile.tsx` (pricing) | ⚠️ reads via onSnapshot |
| `recruiterRequests` | rules only (client uses RDS) | ✅ already on RDS |
| `auditLogs` | rules only (client uses RDS) | ✅ already on RDS |
| `candidateConsents` | rules only (client uses RDS) | ✅ already on RDS |
| `resumeDumpCandidates` | rules only (client uses RDS) | ✅ already on RDS |
| `transactions` | rules only (client uses RDS) | ✅ already on RDS |
| `rateLimits` | rules only (client uses RDS) | ✅ already on RDS |
| `chatSessions` | rules only | 🟢 **no client usage — drop** |
| `interviewRequests` | rules only | 🟢 **no client usage — drop** |
| `api_keys` | comment in server.js only, never implemented | 🟢 **drop** (use env) |

**Firebase Auth (client SDK)** — `auth.currentUser` / `onAuthStateChanged` still referenced in:
`Profile.tsx`, `AdminProfile.tsx`, `AdminBlogs.tsx`, `CreateTest.tsx`, `NotificationCenter.tsx`, `RecruiterTests.tsx`.
⚠️ Legacy: login is Cognito-only now, so `auth.currentUser` is null in production. Replace with `useAuth()` from `context/AuthContext.tsx`.

**Firebase Storage** — exported in `services/firebase.ts:20`, **never imported anywhere**. S3 already replaced it. 🟢 drop.

**firebase-admin (server)** — `api-server/server.js:12-44`, `api-server/authRoutes.js:2`:
- `ensureFirebaseAuthUser()` (auth mirror) + `mintFirebaseCustomToken()` — legacy custom-token bridge
- `POST /auth/migrate-user` writes `users/{uid}` doc to Firestore (line 628)
- `scripts/migrate-users-to-cognito.mjs`, `scripts/bootstrap-cognito-admin.mjs` — one-off migration tooling

**Config/deploy:** `firestore.rules` (456 lines of business logic to port), `firestore.indexes.json` (1 index: attempts `recruiterUID+status` — already covered by RDS index), `firebase.json`, `.firebaserc` (no Hosting config), `VITE_FIREBASE_*` env vars.

**Realtime listeners (`onSnapshot`) that need replacement → `poll()` (already exists in `rdsApi.ts:161`):**
`NotificationCenter.tsx`, `ActiveJobs.tsx`, `AdminBlogs.tsx`, `AdminProfile.tsx` (×2: user, pricing), `AdminStats.tsx`, `InterviewVoiceInterview.tsx`.

### 1.2 RDS surface area (already built)

- `api-server/db/schema.sql` — 20 tables (users, recruiter_requests, jobs, interviews, interview_attempts, tests, test_submissions, interview_access_tokens, resume_dump_candidates, candidate_consents, company_rate_limits, settings, notifications, audit_logs, blogs, contact_submissions, bug_reports, reviews, transactions, support_tickets ❌ missing)
- `api-server/routes/dataRoutes.js` — 55 endpoints under `/api/db`
- `services/rdsApi.ts` — typed client + `poll()` helper

---

## 2. Target Architecture

```
Browser (React)  ──►  Cognito (auth) ──►  api-server (/auth, /api/db)  ──►  RDS Postgres
       │                        │
       └── S3 (resumes, videos, media blobs)
       └── SES (emails)   └── Bedrock (AI)   └── Razorpay (payments)
```

- **Data access:** exclusively through `api-server` (`/api/db/*`). No direct DB SDK in the browser.
- **Realtime:** replace `onSnapshot` with `poll()` (interval-based; pattern already used in `AdminDashboard`).
- **Timestamps:** Firestore `Timestamp` → ISO strings. Server returns `TIMESTAMPTZ` as `Date` → JSON ISO. Client `createdAt.toDate()` calls need the ISO-string shim (already used in `AdminDashboard.tsx:15`).
- **Business rules:** every invariant currently enforced by `firestore.rules` must be re-implemented server-side (see §4.3).

---

## 3. Phase Plan

### Phase 0 — Baseline & safety (1 day)
1. Snapshot Firestore: export every collection via `gcloud firestore export` or `firebase-admin` script to a **read-only backup** (S3 + local).
2. Record row counts per collection and `users`, `interviews`, `tests` doc-id formats (verify the `legacyFirebaseUid` mapping is complete in Cognito).
3. Verify RDS connectivity + run `api-server/db/migrate.js`.
4. Freeze on new Firestore-only features.

### Phase 1 — Schema & API completion (2–3 days)
Fill the RDS gaps identified in §1.2. All work in `api-server` only:

| # | Gap | Work |
|---|---|---|
| 1 | `support_tickets` table missing | Add table to `schema.sql` + `migrate.js`; add `POST /api/db/support-tickets` (public), admin `GET/PATCH` |
| 2 | `profiles` (rich per-user profile) | New table `profiles(id TEXT PK REFERENCES users, data JSONB, updated_at)`; `GET/PUT /api/db/profiles/:id` (owner/admin) |
| 3 | blogs: read-only | Add `POST/PUT/DELETE /api/db/blogs` (admin) |
| 4 | notifications: list/create only | Add `PATCH /api/db/notifications/:id` (mark read, owner) |
| 5 | access tokens: no GET | Add `GET /api/db/interview-access-tokens/:tokenId` (public) — token = table id (keeps `?token=` flow) |
| 6 | jobs: no endpoints | Add public `GET /api/db/jobs` (CareerHub) + admin CRUD; decide single source vs. `interviews` table |
| 7 | public career listings | `GET /interviews` currently requires auth; add public open-positions query (ActiveJobs) |
| 8 | tests: no update | Add `PATCH /api/db/tests/:id` if edit UI exists |
| 9 | AdminStats N+1 | Add aggregate `GET /api/db/admin/stats` (interviews + attempt counts) to make polling cheap |
| 10 | review listing | Ensure public `GET /reviews` filters `approved=true`; admin sees all |

### Phase 2 — Data migration (2–3 days)
**Export** (`scripts/firestore-export.mjs`, new — uses `firebase-admin`):
- Read collections in dependency order: `users, profiles, recruiterRequests, jobs, interviews, interviews/{id}/attempts, tests, testSubmissions, interviewAccessTokens, blogs, reviews, notifications, contactSubmissions, bugReports, supportTickets, candidateConsents, resumeDumpCandidates, transactions, auditLogs, settings, rateLimits/company`.
- Output NDJSON with `{ id, parentId?, data, createdAt, updatedAt }`, camelCase keys preserved, `Timestamp` → ISO string.
- Exclude `chatSessions`, `interviewRequests` (dead).

**Import** (`scripts/rds-import.mjs`, new):
- Idempotent upserts: `INSERT ... ON CONFLICT (id) DO UPDATE`.
- **Preserve Firestore doc IDs** as TEXT PKs (schema already TEXT; `gen_random_bytes` default only applies to new rows).
- Map camelCase → snake_case; arrays/objects → `JSONB`; ISO strings → `TIMESTAMPTZ`; numeric strings → `NUMERIC`.
- `attempts`: set `interview_id = parentId` (FK), `recruiter_uid` backfill from interview row.
- Run in **dry-run mode first**; print per-table row counts.

**Verify:** compare per-table counts vs Firestore export; spot-check 5% of `interviews`, `attempts`, `tests` by id.

### Phase 3 — Client migration (in waves, 1–2 days each)
Swap page-by-page from `firebase/firestore` to `rdsApi`. `onSnapshot → poll()`, `auth.currentUser → useAuth().user`, `Timestamp.toDate() → ISO shim`.

**Wave A — public/read pages** (no auth dependency, lowest risk):
- `Blogs.tsx`, `BlogDetail.tsx`, `Status.tsx`, `CareerHub.tsx`, `ActiveJobs.tsx`, `Reviews.tsx`, `UserReviews.tsx`

**Wave B — forms/writes (public):**
- `ContactUs.tsx`, `OurJourney.tsx`, `ReportBug.tsx`, `SupportCenter.tsx`, `SubmitReview.tsx`

**Wave C — identity & notifications:**
- `Profile.tsx` (profiles + users → `/api/db/profiles`, `/api/db/users/me`), `AdminProfile.tsx` (users + settings), `NotificationCenter.tsx` + `notificationService.ts` (poll 5–8s), remove `auth.currentUser`

**Wave D — assessments:**
- `CreateTest.tsx` (already lists interviews from RDS), `RecruiterTests.tsx`, `TakeTest.tsx`, `TestAccess.tsx`, `TestResults.tsx` (incl. `interviewAccessTokens` create/get/consume flow)

**Wave E — interview/attempt reads:**
- `CandidateInterviews.tsx`, `InvitedCandidates.tsx`, `AdminStats.tsx`, `InterviewReport.tsx`, `InterviewReportModal.tsx`, `InterviewVoiceInterview.tsx`

**Acceptance per wave:** page works with RDS data in staging; counts match Firestore; then remove the Firestore code path for that page.

### Phase 4 — Remove the Firebase bridge (1 day)
1. `api-server/authRoutes.js`: delete `ensureFirebaseAuthUser`, `mintFirebaseCustomToken`, Firestore write in `/migrate-user`; stop returning `firebaseToken`.
2. `api-server/server.js`: remove firebase-admin init.
3. Delete `services/firebase.ts`; uninstall `firebase`, `firebase-admin` from `package.json`.
4. Delete `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `.firebaserc`, `serviceAccountKey.json` (after backup), `VITE_FIREBASE_*` env vars.
5. Delete `scripts/migrate-users-to-cognito.mjs`/`bootstrap-cognito-admin.mjs` (done) — keep only if Phase 2 reruns needed.

### Phase 5 — Cutover & decommission
1. Final incremental sync (Phase 2 rerun; idempotent).
2. Set Firestore rules to **deny all**; watch for 7 days of client errors (any missed Firestore call surfaces immediately).
3. Confirm zero Firestore traffic; delete Firestore project / disable billing for it.
4. Keep the Phase 0 backup for 30 days, then delete.

---

## 4. Design Decisions & Constraints

### 4.1 ID strategy
Preserve Firestore doc IDs as PKs. `users.id` already = Cognito sub or legacy Firebase UID (`custom:legacyFirebaseUid`) — this mapping is the critical join key and is already enforced in `resolveAppUid()` (authRoutes.js:102).

### 4.2 Realtime semantics
Firestore `onSnapshot` is instant; `poll()` is up to `intervalMs` stale. Acceptable per feature: notifications 5s, dashboard 8s, admin stats 15–30s. Do **not** add websockets/SSE in this migration (scope control).

### 4.3 Port Firestore rules → server validation (do NOT skip)
- `reviews` create: name/review/rating 1–5/`userType` enum/`approved==false` → validate in `POST /reviews`.
- `candidateConsents`: full field schema + `exists(interviews/{id})` check → already largely in dataRoutes.js:969.
- `rateLimits/company`: single-slot atomic increment → already server-side (dataRoutes.js:906).
- `interviews` update: recruiter/team ownership (rules: `recruiterUID == auth.uid || teamId match`) → enforce in `PATCH /interviews` (currently `requireAuth` only — add owner check).
- `users`: self/team-parent access on update.
- `notifications`: only own `userId` read/update.
- `interviewAccessTokens`: update only `isUsed` + `usedAt`.

### 4.4 Split-brain guard
Some flows already write to RDS while Firestore pages read Firestore (e.g., `CreateInterview` → RDS, but `CandidateInterviews` → Firestore). During Phase 3 each wave must be **converted as read+write together** so no page reads the stale store.

### 4.5 Feature flags / rollback
Keep the Firestore code path import-able behind a module-level flag per wave until the wave passes acceptance; rollback = flip flag. Remove flags at end of Phase 4.

---

## 5. Risk Register

| Risk | Mitigation |
|---|---|
| Missed Firestore call after cutover | Phase 5 deny-all rules + 7-day error monitoring |
| ID drift between Cognito sub / legacy UID | Phase 0 verify `custom:legacyFirebaseUid` coverage; import keyed on Firestore id |
| Timestamp type bugs (`.toDate()`) | ISO-string shim; centralize in `rdsApi` response interceptor |
| Realtime → polling UX regression | Interval tuning per feature; document in PR |
| `jobs` collection vs `jobs` table confusion | Decide source of truth in Phase 1 (recommend: migrate collection data → table, add endpoints) |
| Firestore rules business logic lost | §4.3 checklist — every rule block mapped to a server handler |
| Large collections time out | Export in batched pages (`pageSize=500`), import in transactions/batches; run offline |

---

## 6. Definition of Done (Firebase fully removed)
- [ ] Zero imports of `firebase/*` or `firebase-admin` in repo
- [ ] All 26 client files read/write through `rdsApi`
- [ ] All 6 `auth.currentUser` references removed
- [ ] `firestore.rules`/indexes/`firebase.json`/`.firebaserc` deleted
- [ ] No `VITE_FIREBASE_*` in `.env` / docs
- [ ] RDS tables match Firestore collection inventory (minus dead ones)
- [ ] 7-day staging soak: feature parity + no Firestore traffic in logs
