-- InterviewXpert PostgreSQL schema (AWS RDS)
-- Replaces Firestore collections while keeping S3 for media blobs.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Identity ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,                 -- Cognito sub (or legacy Firebase UID)
  cognito_sub       TEXT UNIQUE,
  email             TEXT NOT NULL,
  email_lower       TEXT GENERATED ALWAYS AS (lower(email)) STORED,
  role              TEXT NOT NULL CHECK (role IN ('admin', 'recruiter', 'candidate')),
  fullname          TEXT,
  display_name      TEXT,
  phone             TEXT,
  company           TEXT,
  experience        NUMERIC,
  photo_url         TEXT,
  account_status    TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'disabled')),
  admin_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  parent_recruiter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  team_id           TEXT,
  is_secondary      BOOLEAN NOT NULL DEFAULT FALSE,
  designation       TEXT,
  whatsapp_session_id TEXT,
  whatsapp_session_passcode TEXT,
  auth_provider     TEXT DEFAULT 'cognito',
  profile           JSONB NOT NULL DEFAULT '{}'::jsonb, -- overflow / legacy profile fields
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(email_lower);
CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS recruiter_requests (
  id            TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(12), 'hex'),
  email         TEXT NOT NULL,
  fullname      TEXT,
  experience    NUMERIC DEFAULT 0,
  role          TEXT NOT NULL DEFAULT 'recruiter',
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Jobs / Interviews ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jobs (
  id                TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(12), 'hex'),
  recruiter_uid     TEXT REFERENCES users(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  company_name      TEXT,
  description       TEXT,
  qualifications    TEXT,
  skills            TEXT,
  category          TEXT,
  num_questions     INT,
  difficulty        TEXT,
  apply_deadline    TEXT,
  interview_permission TEXT,
  interview_link    TEXT,
  access_code       TEXT,
  custom_fields     JSONB NOT NULL DEFAULT '[]'::jsonb,
  recruiter_name    TEXT,
  recruiter_email   TEXT,
  is_mock           BOOLEAN NOT NULL DEFAULT FALSE,
  raw               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_recruiter ON jobs(recruiter_uid);

CREATE TABLE IF NOT EXISTS interviews (
  id                TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(12), 'hex'),
  recruiter_uid     TEXT REFERENCES users(id) ON DELETE SET NULL,
  team_id           TEXT,
  title             TEXT NOT NULL,
  description       TEXT,
  department        TEXT,
  employment_type   TEXT,
  min_experience    NUMERIC,
  max_experience    NUMERIC,
  experience        NUMERIC,
  skills            TEXT,
  education         TEXT,
  location          TEXT,
  salary_range      TEXT,
  gender_requirement TEXT,
  deadline          TEXT,
  num_questions     INT,
  difficulty        TEXT,
  strictness        TEXT,
  manual_questions  JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_fields     JSONB NOT NULL DEFAULT '[]'::jsonb,
  candidate_emails  JSONB NOT NULL DEFAULT '[]'::jsonb,
  candidate_data    JSONB NOT NULL DEFAULT '[]'::jsonb,
  interview_link    TEXT,
  access_code       TEXT,
  created_by        JSONB,
  is_mock           BOOLEAN NOT NULL DEFAULT FALSE,
  raw               JSONB NOT NULL DEFAULT '{}'::jsonb,
  job_number        TEXT,
  detailed_jd_url   TEXT,
  about_company     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE interviews ADD COLUMN IF NOT EXISTS job_number TEXT;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS detailed_jd_url TEXT;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS about_company TEXT;

CREATE INDEX IF NOT EXISTS idx_interviews_recruiter ON interviews(recruiter_uid);
CREATE INDEX IF NOT EXISTS idx_interviews_team ON interviews(team_id);
CREATE INDEX IF NOT EXISTS idx_interviews_access_code ON interviews(access_code);

CREATE TABLE IF NOT EXISTS interview_attempts (
  id                    TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(12), 'hex'),
  interview_id          TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  recruiter_uid         TEXT,
  candidate_uid         TEXT,
  job_id                TEXT,
  job_title             TEXT,
  job_description       TEXT,
  status                TEXT NOT NULL DEFAULT 'Completed',
  score                 TEXT,
  resume_score          NUMERIC,
  qna_score             NUMERIC,
  feedback              TEXT,
  language              TEXT,
  is_mock               BOOLEAN NOT NULL DEFAULT FALSE,
  terminated            BOOLEAN NOT NULL DEFAULT FALSE,
  allow_reattempt       BOOLEAN NOT NULL DEFAULT FALSE,
  client_access_expires_at TIMESTAMPTZ,
  questions             JSONB NOT NULL DEFAULT '[]'::jsonb,
  answers               JSONB NOT NULL DEFAULT '[]'::jsonb,
  video_urls            JSONB NOT NULL DEFAULT '[]'::jsonb,
  transcript_ids        JSONB NOT NULL DEFAULT '[]'::jsonb,
  transcript_texts      JSONB NOT NULL DEFAULT '[]'::jsonb,
  candidate_info        JSONB NOT NULL DEFAULT '{}'::jsonb,
  visibility_settings   JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  candidate_resume_url  TEXT,
  candidate_resume_mime_type TEXT,
  candidate_resume_text TEXT,
  raw                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attempts_interview ON interview_attempts(interview_id);
CREATE INDEX IF NOT EXISTS idx_attempts_recruiter ON interview_attempts(recruiter_uid);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON interview_attempts(status);
CREATE INDEX IF NOT EXISTS idx_attempts_candidate_email ON interview_attempts ((candidate_info->>'email'));

-- ─── Assessments ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tests (
  id                    TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(12), 'hex'),
  recruiter_uid         TEXT REFERENCES users(id) ON DELETE SET NULL,
  team_id               TEXT,
  title                 TEXT NOT NULL,
  type                  TEXT NOT NULL CHECK (type IN ('aptitude', 'coding')),
  duration              INT,
  questions             JSONB NOT NULL DEFAULT '[]'::jsonb,
  access_code           TEXT,
  passing_score         NUMERIC,
  next_interview_id     TEXT REFERENCES interviews(id) ON DELETE SET NULL,
  external_interview_link TEXT,
  external_access_code  TEXT,
  raw                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tests_recruiter ON tests(recruiter_uid);

CREATE TABLE IF NOT EXISTS test_submissions (
  id                TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(12), 'hex'),
  test_id           TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  recruiter_uid     TEXT,
  candidate_uid     TEXT,
  candidate_name    TEXT,
  candidate_email   TEXT,
  answers           JSONB NOT NULL DEFAULT '{}'::jsonb,
  score             NUMERIC,
  feedback          TEXT,
  status            TEXT,
  type              TEXT,
  tab_switch_count  INT DEFAULT 0,
  email_sent        BOOLEAN DEFAULT FALSE,
  email_error       TEXT,
  raw               JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_submissions_test ON test_submissions(test_id);

CREATE TABLE IF NOT EXISTS interview_access_tokens (
  id                TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(12), 'hex'),
  test_id           TEXT,
  next_interview_id TEXT,
  candidate_email   TEXT,
  candidate_name    TEXT,
  is_used           BOOLEAN NOT NULL DEFAULT FALSE,
  used_at           TIMESTAMPTZ,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Resume dump / consent ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS resume_dump_candidates (
  id                    TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(12), 'hex'),
  recruiter_uid         TEXT,
  team_id               TEXT,
  created_by            TEXT,
  name                  TEXT,
  email                 TEXT,
  phone                 TEXT,
  location              TEXT,
  current_title         TEXT,
  summary               TEXT,
  total_experience_years NUMERIC,
  skills                JSONB NOT NULL DEFAULT '[]'::jsonb,
  experience            JSONB NOT NULL DEFAULT '[]'::jsonb,
  education             JSONB NOT NULL DEFAULT '[]'::jsonb,
  certifications        JSONB NOT NULL DEFAULT '[]'::jsonb,
  languages             JSONB NOT NULL DEFAULT '[]'::jsonb,
  keywords              JSONB NOT NULL DEFAULT '[]'::jsonb,
  linkedin_url          TEXT,
  portfolio_url         TEXT,
  parsing_method        TEXT,
  parser_version        TEXT,
  resume_url            TEXT,
  resume_file_name      TEXT,
  resume_mime_type      TEXT,
  resume_size           BIGINT,
  resume_text           TEXT,
  source                TEXT,
  source_interview_id   TEXT,
  source_job_title      TEXT,
  is_hired              BOOLEAN DEFAULT FALSE,
  do_not_suggest        BOOLEAN DEFAULT FALSE,
  raw                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resume_dump_recruiter ON resume_dump_candidates(recruiter_uid);
CREATE INDEX IF NOT EXISTS idx_resume_dump_email ON resume_dump_candidates (lower(email));

CREATE TABLE IF NOT EXISTS candidate_consents (
  id                TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(12), 'hex'),
  interview_id      TEXT NOT NULL,
  interview_title   TEXT,
  candidate_name    TEXT NOT NULL,
  candidate_email   TEXT NOT NULL,
  ip_address        TEXT,
  accepted_item_ids JSONB NOT NULL,
  accepted_all      BOOLEAN NOT NULL DEFAULT TRUE,
  consent_version   TEXT NOT NULL,
  consent_method    TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'accepted',
  accepted_at       TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Platform / ops ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS company_rate_limits (
  id                TEXT PRIMARY KEY DEFAULT 'company',
  scope             TEXT NOT NULL DEFAULT 'company',
  interviews        INT NOT NULL DEFAULT 2500,
  assessments       INT NOT NULL DEFAULT 5,
  coding_assessments INT NOT NULL DEFAULT 2,
  usage             JSONB NOT NULL DEFAULT '{"interviews":0,"assessments":0,"codingAssessments":0}'::jsonb,
  top_ups           JSONB NOT NULL DEFAULT '{"interviews":0,"assessments":0,"codingAssessments":0}'::jsonb,
  usage_baseline    JSONB NOT NULL DEFAULT '{"interviews":0,"assessments":0,"codingAssessments":0}'::jsonb,
  last_candidate_submission_at TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        TEXT
);

INSERT INTO company_rate_limits (id) VALUES ('company') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS settings (
  id                TEXT PRIMARY KEY,
  data              JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (id, data) VALUES ('pricing', '{"perInterviewPrice":150}'::jsonb)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS notifications (
  id            TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(12), 'hex'),
  user_id       TEXT NOT NULL,
  message       TEXT NOT NULL,
  type          TEXT,
  read          BOOLEAN NOT NULL DEFAULT FALSE,
  sender_id     TEXT,
  sender_name   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(12), 'hex'),
  team_id       TEXT NOT NULL,
  action        TEXT NOT NULL,
  details       TEXT,
  performed_by  JSONB,
  iso_timestamp TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_team ON audit_logs(team_id, created_at DESC);

CREATE TABLE IF NOT EXISTS blogs (
  id            TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(12), 'hex'),
  title         TEXT NOT NULL,
  excerpt       TEXT,
  content       TEXT,
  image_url     TEXT,
  tags          JSONB NOT NULL DEFAULT '[]'::jsonb,
  read_time     TEXT,
  author        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_submissions (
  id            TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(12), 'hex'),
  name          TEXT,
  email         TEXT,
  phone         TEXT,
  subject       TEXT,
  message       TEXT,
  status        TEXT DEFAULT 'new',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bug_reports (
  id            TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(12), 'hex'),
  name          TEXT,
  email         TEXT,
  feature       TEXT,
  description   TEXT,
  steps         TEXT,
  severity      TEXT,
  type          TEXT,
  status        TEXT DEFAULT 'new',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reviews (
  id            TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(12), 'hex'),
  name          TEXT NOT NULL,
  email         TEXT,
  contact       TEXT,
  review        TEXT NOT NULL,
  rating        NUMERIC NOT NULL CHECK (rating >= 1 AND rating <= 5),
  user_type     TEXT,
  approved      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id            TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(12), 'hex'),
  user_id       TEXT,
  user_name     TEXT,
  amount        NUMERIC,
  payment_id    TEXT,
  raw           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id            TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(12), 'hex'),
  user_id       TEXT,
  email         TEXT,
  subject       TEXT,
  message       TEXT,
  status        TEXT DEFAULT 'open',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rich per-user profile (replaces Firestore `profiles/{uid}` docs).
-- Mirrors the structure written by pages/Profile.tsx: the full document is
-- stored as JSONB plus a few indexed columns used for lookups.
CREATE TABLE IF NOT EXISTS profiles (
  id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data          JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
