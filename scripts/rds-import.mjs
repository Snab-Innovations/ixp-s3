/**
 * Import Firestore NDJSON exports into RDS (PostgreSQL).
 *
 * Requires RDS_* env vars (same as api-server). Idempotent: rows are upserted
 * by primary key, so re-running after an incremental export is safe.
 *
 * Usage:
 *   node scripts/rds-import.mjs --dry-run                 # count only
 *   node scripts/rds-import.mjs                           # full import
 *   node scripts/rds-import.mjs --dir ./firestore-export
 *   node scripts/rds-import.mjs --tables users,blogs
 *
 * Field notes:
 *   - Firestore doc ids are preserved as TEXT primary keys.
 *   - Timestamps arrive as ISO strings and are cast to timestamptz.
 *   - Known fields map camelCase → snake_case; every unmapped field is stored
 *     in the `raw` JSONB column (existing map*() helpers merge it back out).
 *   - `attempts` NDJSON carries parentId → interview_id.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

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

import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  host: process.env.RDS_HOST || process.env.PGHOST,
  port: Number(process.env.RDS_PORT || process.env.PGPORT || 5432),
  database: process.env.RDS_DATABASE || process.env.PGDATABASE || 'interviewxpert',
  user: process.env.RDS_USER || process.env.PGUSER || 'ixpadmin',
  password: process.env.RDS_PASSWORD || process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 10,
  connectionTimeoutMillis: 15000,
});

const dryRun = process.argv.includes('--dry-run');
const inDir = arg('dir', resolve(process.cwd(), 'firestore-export'));
const selected = (arg('tables') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const ISO = (v) => (v == null || v === '' ? null : new Date(v).toISOString());

/**
 * Table definitions.
 * type: text | number | bool | json | iso
 * raw: store every unmapped field of `data` in this JSONB column (nullable).
 */
const TABLES = {
  users: {
    table: 'users',
    fields: [
      { src: 'email', dst: 'email', type: 'text' },
      { src: 'role', dst: 'role', type: 'text' },
      { src: 'fullname', dst: 'fullname', type: 'text' },
      { src: 'name', dst: 'display_name', type: 'text' },
      { src: 'displayName', dst: 'display_name', type: 'text' },
      { src: 'phone', dst: 'phone', type: 'text' },
      { src: 'phoneNumber', dst: 'phone', type: 'text' },
      { src: 'company', dst: 'company', type: 'text' },
      { src: 'experience', dst: 'experience', type: 'number' },
      { src: 'profilePhotoURL', dst: 'photo_url', type: 'text' },
      { src: 'photoURL', dst: 'photo_url', type: 'text' },
      { src: 'accountStatus', dst: 'account_status', type: 'text' },
      { src: 'adminVerified', dst: 'admin_verified', type: 'bool' },
      { src: 'parentRecruiterId', dst: 'parent_recruiter_id', type: 'text' },
      { src: 'teamId', dst: 'team_id', type: 'text' },
      { src: 'isSecondary', dst: 'is_secondary', type: 'bool' },
      { src: 'designation', dst: 'designation', type: 'text' },
      { src: 'whatsappSessionId', dst: 'whatsapp_session_id', type: 'text' },
      { src: 'whatsappSessionPasscode', dst: 'whatsapp_session_passcode', type: 'text' },
      { src: 'authProvider', dst: 'auth_provider', type: 'text' },
      { src: 'createdAt', dst: 'created_at', type: 'iso' },
      { src: 'updatedAt', dst: 'updated_at', type: 'iso' },
    ],
    raw: 'profile',
    columns: {
      email: 'email', role: 'role', fullname: 'fullname', display_name: 'display_name',
      phone: 'phone', company: 'company', experience: 'experience', photo_url: 'photo_url',
      account_status: 'account_status', admin_verified: 'admin_verified',
      parent_recruiter_id: 'parent_recruiter_id', team_id: 'team_id',
      is_secondary: 'is_secondary', designation: 'designation',
      whatsapp_session_id: 'whatsapp_session_id', whatsapp_session_passcode: 'whatsapp_session_passcode',
      auth_provider: 'auth_provider', created_at: 'created_at', updated_at: 'updated_at', profile: 'profile',
    },
    conflictUpdate: [
      'email', 'fullname', 'display_name', 'phone', 'company', 'experience', 'photo_url',
      'account_status', 'admin_verified', 'parent_recruiter_id', 'team_id', 'is_secondary',
      'designation', 'whatsapp_session_id', 'whatsapp_session_passcode', 'profile',
      'created_at', 'updated_at',
    ],
  },
  profiles: {
    table: 'profiles',
    // Whole doc stored as JSONB `data`; only id + updatedAt are reserved.
    special: 'jsonb-doc',
    columns: { data: 'data', updated_at: 'updated_at' },
    conflictUpdate: ['data', 'updated_at'],
    timestampsInDoc: ['updatedAt'],
  },
  recruiterRequests: {
    table: 'recruiter_requests',
    fields: [
      { src: 'email', dst: 'email', type: 'text' },
      { src: 'fullname', dst: 'fullname', type: 'text' },
      { src: 'experience', dst: 'experience', type: 'number' },
      { src: 'role', dst: 'role', type: 'text' },
      { src: 'status', dst: 'status', type: 'text' },
      { src: 'createdAt', dst: 'created_at', type: 'iso' },
    ],
    columns: { email: 'email', fullname: 'fullname', experience: 'experience', role: 'role', status: 'status', created_at: 'created_at' },
    conflictUpdate: ['email', 'fullname', 'experience', 'role', 'status', 'created_at'],
  },
  jobs: {
    table: 'jobs',
    fields: [
      { src: 'recruiterUID', dst: 'recruiter_uid', type: 'text' },
      { src: 'title', dst: 'title', type: 'text' },
      { src: 'companyName', dst: 'company_name', type: 'text' },
      { src: 'description', dst: 'description', type: 'text' },
      { src: 'qualifications', dst: 'qualifications', type: 'text' },
      { src: 'skills', dst: 'skills', type: 'text' },
      { src: 'category', dst: 'category', type: 'text' },
      { src: 'numQuestions', dst: 'num_questions', type: 'number' },
      { src: 'difficulty', dst: 'difficulty', type: 'text' },
      { src: 'applyDeadline', dst: 'apply_deadline', type: 'text' },
      { src: 'interviewPermission', dst: 'interview_permission', type: 'text' },
      { src: 'interviewLink', dst: 'interview_link', type: 'text' },
      { src: 'accessCode', dst: 'access_code', type: 'text' },
      { src: 'customFields', dst: 'custom_fields', type: 'json' },
      { src: 'recruiterName', dst: 'recruiter_name', type: 'text' },
      { src: 'recruiterEmail', dst: 'recruiter_email', type: 'text' },
      { src: 'isMock', dst: 'is_mock', type: 'bool' },
      { src: 'createdAt', dst: 'created_at', type: 'iso' },
      { src: 'updatedAt', dst: 'updated_at', type: 'iso' },
    ],
    raw: 'raw',
    columns: {
      recruiter_uid: 'recruiter_uid', title: 'title', company_name: 'company_name',
      description: 'description', qualifications: 'qualifications', skills: 'skills',
      category: 'category', num_questions: 'num_questions', difficulty: 'difficulty',
      apply_deadline: 'apply_deadline', interview_permission: 'interview_permission',
      interview_link: 'interview_link', access_code: 'access_code',
      custom_fields: 'custom_fields', recruiter_name: 'recruiter_name',
      recruiter_email: 'recruiter_email', is_mock: 'is_mock',
      created_at: 'created_at', updated_at: 'updated_at', raw: 'raw',
    },
    conflictUpdate: [
      'recruiter_uid', 'title', 'company_name', 'description', 'qualifications', 'skills',
      'category', 'num_questions', 'difficulty', 'apply_deadline', 'interview_permission',
      'interview_link', 'access_code', 'custom_fields', 'recruiter_name', 'recruiter_email',
      'is_mock', 'created_at', 'updated_at', 'raw',
    ],
  },
  interviews: {
    table: 'interviews',
    fields: [
      { src: 'recruiterUID', dst: 'recruiter_uid', type: 'text' },
      { src: 'teamId', dst: 'team_id', type: 'text' },
      { src: 'title', dst: 'title', type: 'text' },
      { src: 'description', dst: 'description', type: 'text' },
      { src: 'department', dst: 'department', type: 'text' },
      { src: 'employmentType', dst: 'employment_type', type: 'text' },
      { src: 'minExperience', dst: 'min_experience', type: 'number' },
      { src: 'maxExperience', dst: 'max_experience', type: 'number' },
      { src: 'experience', dst: 'experience', type: 'number' },
      { src: 'skills', dst: 'skills', type: 'text' },
      { src: 'education', dst: 'education', type: 'text' },
      { src: 'location', dst: 'location', type: 'text' },
      { src: 'salaryRange', dst: 'salary_range', type: 'text' },
      { src: 'genderRequirement', dst: 'gender_requirement', type: 'text' },
      { src: 'deadline', dst: 'deadline', type: 'text' },
      { src: 'numQuestions', dst: 'num_questions', type: 'number' },
      { src: 'difficulty', dst: 'difficulty', type: 'text' },
      { src: 'strictness', dst: 'strictness', type: 'text' },
      { src: 'manualQuestions', dst: 'manual_questions', type: 'json' },
      { src: 'customFields', dst: 'custom_fields', type: 'json' },
      { src: 'candidateEmails', dst: 'candidate_emails', type: 'json' },
      { src: 'candidateData', dst: 'candidate_data', type: 'json' },
      { src: 'interviewLink', dst: 'interview_link', type: 'text' },
      { src: 'accessCode', dst: 'access_code', type: 'text' },
      { src: 'createdBy', dst: 'created_by', type: 'json' },
      { src: 'isMock', dst: 'is_mock', type: 'bool' },
      { src: 'createdAt', dst: 'created_at', type: 'iso' },
      { src: 'updatedAt', dst: 'updated_at', type: 'iso' },
    ],
    raw: 'raw',
    columns: {
      recruiter_uid: 'recruiter_uid', team_id: 'team_id', title: 'title',
      description: 'description', department: 'department', employment_type: 'employment_type',
      min_experience: 'min_experience', max_experience: 'max_experience',
      experience: 'experience', skills: 'skills', education: 'education', location: 'location',
      salary_range: 'salary_range', gender_requirement: 'gender_requirement', deadline: 'deadline',
      num_questions: 'num_questions', difficulty: 'difficulty', strictness: 'strictness',
      manual_questions: 'manual_questions', custom_fields: 'custom_fields',
      candidate_emails: 'candidate_emails', candidate_data: 'candidate_data',
      interview_link: 'interview_link', access_code: 'access_code', created_by: 'created_by',
      is_mock: 'is_mock', created_at: 'created_at', updated_at: 'updated_at', raw: 'raw',
    },
    conflictUpdate: [
      'recruiter_uid', 'team_id', 'title', 'description', 'department', 'employment_type',
      'min_experience', 'max_experience', 'experience', 'skills', 'education', 'location',
      'salary_range', 'gender_requirement', 'deadline', 'num_questions', 'difficulty',
      'strictness', 'manual_questions', 'custom_fields', 'candidate_emails', 'candidate_data',
      'interview_link', 'access_code', 'created_by', 'is_mock', 'created_at', 'updated_at', 'raw',
    ],
  },
  attempts: {
    table: 'interview_attempts',
    fields: [
      { src: 'recruiterUID', dst: 'recruiter_uid', type: 'text' },
      { src: 'candidateUID', dst: 'candidate_uid', type: 'text' },
      { src: 'jobId', dst: 'job_id', type: 'text' },
      { src: 'jobTitle', dst: 'job_title', type: 'text' },
      { src: 'jobDescription', dst: 'job_description', type: 'text' },
      { src: 'status', dst: 'status', type: 'text' },
      { src: 'score', dst: 'score', type: 'text' },
      { src: 'resumeScore', dst: 'resume_score', type: 'number' },
      { src: 'qnaScore', dst: 'qna_score', type: 'number' },
      { src: 'feedback', dst: 'feedback', type: 'text' },
      { src: 'language', dst: 'language', type: 'text' },
      { src: 'isMock', dst: 'is_mock', type: 'bool' },
      { src: 'terminated', dst: 'terminated', type: 'bool' },
      { src: 'allowReattempt', dst: 'allow_reattempt', type: 'bool' },
      { src: 'clientAccessExpiresAt', dst: 'client_access_expires_at', type: 'iso' },
      { src: 'questions', dst: 'questions', type: 'json' },
      { src: 'answers', dst: 'answers', type: 'json' },
      { src: 'videoURLs', dst: 'video_urls', type: 'json' },
      { src: 'transcriptIds', dst: 'transcript_ids', type: 'json' },
      { src: 'transcriptTexts', dst: 'transcript_texts', type: 'json' },
      { src: 'candidateInfo', dst: 'candidate_info', type: 'json' },
      { src: 'visibilitySettings', dst: 'visibility_settings', type: 'json' },
      { src: 'meta', dst: 'meta', type: 'json' },
      { src: 'candidateResumeURL', dst: 'candidate_resume_url', type: 'text' },
      { src: 'candidateResumeMimeType', dst: 'candidate_resume_mime_type', type: 'text' },
      { src: 'candidateResumeText', dst: 'candidate_resume_text', type: 'text' },
      { src: 'submittedAt', dst: 'submitted_at', type: 'iso' },
      { src: 'createdAt', dst: 'created_at', type: 'iso' },
      { src: 'updatedAt', dst: 'updated_at', type: 'iso' },
    ],
    raw: 'raw',
    extra: (rec, doc) => {
      rec.params.interview_id = doc.parentId || null;
      rec.columns.interview_id = 'interview_id';
    },
    columns: {
      interview_id: 'interview_id', recruiter_uid: 'recruiter_uid', candidate_uid: 'candidate_uid',
      job_id: 'job_id', job_title: 'job_title', job_description: 'job_description',
      status: 'status', score: 'score', resume_score: 'resume_score', qna_score: 'qna_score',
      feedback: 'feedback', language: 'language', is_mock: 'is_mock', terminated: 'terminated',
      allow_reattempt: 'allow_reattempt', client_access_expires_at: 'client_access_expires_at',
      questions: 'questions', answers: 'answers', video_urls: 'video_urls',
      transcript_ids: 'transcript_ids', transcript_texts: 'transcript_texts',
      candidate_info: 'candidate_info', visibility_settings: 'visibility_settings',
      meta: 'meta', candidate_resume_url: 'candidate_resume_url',
      candidate_resume_mime_type: 'candidate_resume_mime_type',
      candidate_resume_text: 'candidate_resume_text', submitted_at: 'submitted_at',
      created_at: 'created_at', updated_at: 'updated_at', raw: 'raw',
    },
    conflictUpdate: [
      'interview_id', 'recruiter_uid', 'candidate_uid', 'job_id', 'job_title', 'job_description',
      'status', 'score', 'resume_score', 'qna_score', 'feedback', 'language', 'is_mock',
      'terminated', 'allow_reattempt', 'client_access_expires_at', 'questions', 'answers',
      'video_urls', 'transcript_ids', 'transcript_texts', 'candidate_info',
      'visibility_settings', 'meta', 'candidate_resume_url', 'candidate_resume_mime_type',
      'candidate_resume_text', 'submitted_at', 'created_at', 'updated_at', 'raw',
    ],
  },
  tests: {
    table: 'tests',
    fields: [
      { src: 'recruiterUID', dst: 'recruiter_uid', type: 'text' },
      { src: 'teamId', dst: 'team_id', type: 'text' },
      { src: 'title', dst: 'title', type: 'text' },
      { src: 'type', dst: 'type', type: 'text' },
      { src: 'duration', dst: 'duration', type: 'number' },
      { src: 'questions', dst: 'questions', type: 'json' },
      { src: 'accessCode', dst: 'access_code', type: 'text' },
      { src: 'passingScore', dst: 'passing_score', type: 'number' },
      { src: 'nextInterviewId', dst: 'next_interview_id', type: 'text' },
      { src: 'externalInterviewLink', dst: 'external_interview_link', type: 'text' },
      { src: 'externalAccessCode', dst: 'external_access_code', type: 'text' },
      { src: 'createdAt', dst: 'created_at', type: 'iso' },
      { src: 'updatedAt', dst: 'updated_at', type: 'iso' },
    ],
    raw: 'raw',
    columns: {
      recruiter_uid: 'recruiter_uid', team_id: 'team_id', title: 'title', type: 'type',
      duration: 'duration', questions: 'questions', access_code: 'access_code',
      passing_score: 'passing_score', next_interview_id: 'next_interview_id',
      external_interview_link: 'external_interview_link',
      external_access_code: 'external_access_code', created_at: 'created_at',
      updated_at: 'updated_at', raw: 'raw',
    },
    conflictUpdate: [
      'recruiter_uid', 'team_id', 'title', 'type', 'duration', 'questions', 'access_code',
      'passing_score', 'next_interview_id', 'external_interview_link', 'external_access_code',
      'created_at', 'updated_at', 'raw',
    ],
  },
  testSubmissions: {
    table: 'test_submissions',
    fields: [
      { src: 'testId', dst: 'test_id', type: 'text' },
      { src: 'recruiterUID', dst: 'recruiter_uid', type: 'text' },
      { src: 'candidateUID', dst: 'candidate_uid', type: 'text' },
      { src: 'candidateName', dst: 'candidate_name', type: 'text' },
      { src: 'candidateEmail', dst: 'candidate_email', type: 'text' },
      { src: 'answers', dst: 'answers', type: 'json' },
      { src: 'score', dst: 'score', type: 'number' },
      { src: 'feedback', dst: 'feedback', type: 'text' },
      { src: 'status', dst: 'status', type: 'text' },
      { src: 'type', dst: 'type', type: 'text' },
      { src: 'tabSwitchCount', dst: 'tab_switch_count', type: 'number' },
      { src: 'emailSent', dst: 'email_sent', type: 'bool' },
      { src: 'emailError', dst: 'email_error', type: 'text' },
      { src: 'submittedAt', dst: 'submitted_at', type: 'iso' },
    ],
    raw: 'raw',
    columns: {
      test_id: 'test_id', recruiter_uid: 'recruiter_uid', candidate_uid: 'candidate_uid',
      candidate_name: 'candidate_name', candidate_email: 'candidate_email', answers: 'answers',
      score: 'score', feedback: 'feedback', status: 'status', type: 'type',
      tab_switch_count: 'tab_switch_count', email_sent: 'email_sent', email_error: 'email_error',
      submitted_at: 'submitted_at', raw: 'raw',
    },
    conflictUpdate: [
      'test_id', 'recruiter_uid', 'candidate_uid', 'candidate_name', 'candidate_email',
      'answers', 'score', 'feedback', 'status', 'type', 'tab_switch_count', 'email_sent',
      'email_error', 'submitted_at', 'raw',
    ],
  },
  interviewAccessTokens: {
    table: 'interview_access_tokens',
    fields: [
      { src: 'testId', dst: 'test_id', type: 'text' },
      { src: 'nextInterviewId', dst: 'next_interview_id', type: 'text' },
      { src: 'candidateEmail', dst: 'candidate_email', type: 'text' },
      { src: 'candidateName', dst: 'candidate_name', type: 'text' },
      { src: 'isUsed', dst: 'is_used', type: 'bool' },
      { src: 'usedAt', dst: 'used_at', type: 'iso' },
      { src: 'generatedAt', dst: 'generated_at', type: 'iso' },
    ],
    columns: {
      test_id: 'test_id', next_interview_id: 'next_interview_id',
      candidate_email: 'candidate_email', candidate_name: 'candidate_name',
      is_used: 'is_used', used_at: 'used_at', generated_at: 'generated_at',
    },
    conflictUpdate: [
      'test_id', 'next_interview_id', 'candidate_email', 'candidate_name',
      'is_used', 'used_at', 'generated_at',
    ],
  },
  blogs: {
    table: 'blogs',
    fields: [
      { src: 'title', dst: 'title', type: 'text' },
      { src: 'excerpt', dst: 'excerpt', type: 'text' },
      { src: 'content', dst: 'content', type: 'text' },
      { src: 'imageUrl', dst: 'image_url', type: 'text' },
      { src: 'tags', dst: 'tags', type: 'json' },
      { src: 'readTime', dst: 'read_time', type: 'text' },
      { src: 'author', dst: 'author', type: 'text' },
      { src: 'createdAt', dst: 'created_at', type: 'iso' },
      { src: 'updatedAt', dst: 'updated_at', type: 'iso' },
    ],
    columns: {
      title: 'title', excerpt: 'excerpt', content: 'content', image_url: 'image_url',
      tags: 'tags', read_time: 'read_time', author: 'author',
      created_at: 'created_at', updated_at: 'updated_at',
    },
    conflictUpdate: [
      'title', 'excerpt', 'content', 'image_url', 'tags', 'read_time', 'author',
      'created_at', 'updated_at',
    ],
  },
  reviews: {
    table: 'reviews',
    fields: [
      { src: 'name', dst: 'name', type: 'text' },
      { src: 'email', dst: 'email', type: 'text' },
      { src: 'contact', dst: 'contact', type: 'text' },
      { src: 'review', dst: 'review', type: 'text' },
      { src: 'rating', dst: 'rating', type: 'number' },
      { src: 'userType', dst: 'user_type', type: 'text' },
      { src: 'approved', dst: 'approved', type: 'bool' },
      { src: 'createdAt', dst: 'created_at', type: 'iso' },
    ],
    columns: {
      name: 'name', email: 'email', contact: 'contact', review: 'review',
      rating: 'rating', user_type: 'user_type', approved: 'approved', created_at: 'created_at',
    },
    conflictUpdate: ['name', 'email', 'contact', 'review', 'rating', 'user_type', 'approved', 'created_at'],
  },
  notifications: {
    table: 'notifications',
    fields: [
      { src: 'userId', dst: 'user_id', type: 'text' },
      { src: 'message', dst: 'message', type: 'text' },
      { src: 'type', dst: 'type', type: 'text' },
      { src: 'read', dst: 'read', type: 'bool' },
      { src: 'senderId', dst: 'sender_id', type: 'text' },
      { src: 'senderName', dst: 'sender_name', type: 'text' },
      { src: 'createdAt', dst: 'created_at', type: 'iso' },
    ],
    columns: {
      user_id: 'user_id', message: 'message', type: 'type', read: 'read',
      sender_id: 'sender_id', sender_name: 'sender_name', created_at: 'created_at',
    },
    conflictUpdate: ['user_id', 'message', 'type', 'read', 'sender_id', 'sender_name', 'created_at'],
  },
  contactSubmissions: {
    table: 'contact_submissions',
    fields: [
      { src: 'name', dst: 'name', type: 'text' },
      { src: 'email', dst: 'email', type: 'text' },
      { src: 'phone', dst: 'phone', type: 'text' },
      { src: 'subject', dst: 'subject', type: 'text' },
      { src: 'message', dst: 'message', type: 'text' },
      { src: 'status', dst: 'status', type: 'text' },
      { src: 'createdAt', dst: 'created_at', type: 'iso' },
    ],
    columns: {
      name: 'name', email: 'email', phone: 'phone', subject: 'subject',
      message: 'message', status: 'status', created_at: 'created_at',
    },
    conflictUpdate: ['name', 'email', 'phone', 'subject', 'message', 'status', 'created_at'],
  },
  bugReports: {
    table: 'bug_reports',
    fields: [
      { src: 'name', dst: 'name', type: 'text' },
      { src: 'email', dst: 'email', type: 'text' },
      { src: 'feature', dst: 'feature', type: 'text' },
      { src: 'description', dst: 'description', type: 'text' },
      { src: 'steps', dst: 'steps', type: 'text' },
      { src: 'severity', dst: 'severity', type: 'text' },
      { src: 'type', dst: 'type', type: 'text' },
      { src: 'status', dst: 'status', type: 'text' },
      { src: 'createdAt', dst: 'created_at', type: 'iso' },
    ],
    columns: {
      name: 'name', email: 'email', feature: 'feature', description: 'description',
      steps: 'steps', severity: 'severity', type: 'type', status: 'status', created_at: 'created_at',
    },
    conflictUpdate: ['name', 'email', 'feature', 'description', 'steps', 'severity', 'type', 'status', 'created_at'],
  },
  supportTickets: {
    table: 'support_tickets',
    fields: [
      { src: 'userId', dst: 'user_id', type: 'text' },
      { src: 'email', dst: 'email', type: 'text' },
      { src: 'subject', dst: 'subject', type: 'text' },
      { src: 'message', dst: 'message', type: 'text' },
      { src: 'status', dst: 'status', type: 'text' },
      { src: 'createdAt', dst: 'created_at', type: 'iso' },
    ],
    columns: {
      user_id: 'user_id', email: 'email', subject: 'subject', message: 'message',
      status: 'status', created_at: 'created_at',
    },
    conflictUpdate: ['user_id', 'email', 'subject', 'message', 'status', 'created_at'],
  },
  candidateConsents: {
    table: 'candidate_consents',
    fields: [
      { src: 'interviewId', dst: 'interview_id', type: 'text' },
      { src: 'interviewTitle', dst: 'interview_title', type: 'text' },
      { src: 'candidateName', dst: 'candidate_name', type: 'text' },
      { src: 'candidateEmail', dst: 'candidate_email', type: 'text' },
      { src: 'ipAddress', dst: 'ip_address', type: 'text' },
      { src: 'acceptedItemIds', dst: 'accepted_item_ids', type: 'json' },
      { src: 'acceptedAll', dst: 'accepted_all', type: 'bool' },
      { src: 'consentVersion', dst: 'consent_version', type: 'text' },
      { src: 'consentMethod', dst: 'consent_method', type: 'text' },
      { src: 'status', dst: 'status', type: 'text' },
      { src: 'acceptedAt', dst: 'accepted_at', type: 'iso' },
      { src: 'createdAt', dst: 'created_at', type: 'iso' },
    ],
    columns: {
      interview_id: 'interview_id', interview_title: 'interview_title',
      candidate_name: 'candidate_name', candidate_email: 'candidate_email',
      ip_address: 'ip_address', accepted_item_ids: 'accepted_item_ids',
      accepted_all: 'accepted_all', consent_version: 'consent_version',
      consent_method: 'consent_method', status: 'status', accepted_at: 'accepted_at',
      created_at: 'created_at',
    },
    conflictUpdate: [
      'interview_id', 'interview_title', 'candidate_name', 'candidate_email', 'ip_address',
      'accepted_item_ids', 'accepted_all', 'consent_version', 'consent_method', 'status',
      'accepted_at', 'created_at',
    ],
  },
  resumeDumpCandidates: {
    table: 'resume_dump_candidates',
    fields: [
      { src: 'recruiterUID', dst: 'recruiter_uid', type: 'text' },
      { src: 'teamId', dst: 'team_id', type: 'text' },
      { src: 'createdBy', dst: 'created_by', type: 'text' },
      { src: 'name', dst: 'name', type: 'text' },
      { src: 'email', dst: 'email', type: 'text' },
      { src: 'phone', dst: 'phone', type: 'text' },
      { src: 'location', dst: 'location', type: 'text' },
      { src: 'currentTitle', dst: 'current_title', type: 'text' },
      { src: 'summary', dst: 'summary', type: 'text' },
      { src: 'totalExperienceYears', dst: 'total_experience_years', type: 'number' },
      { src: 'skills', dst: 'skills', type: 'json' },
      { src: 'experience', dst: 'experience', type: 'json' },
      { src: 'education', dst: 'education', type: 'json' },
      { src: 'certifications', dst: 'certifications', type: 'json' },
      { src: 'languages', dst: 'languages', type: 'json' },
      { src: 'keywords', dst: 'keywords', type: 'json' },
      { src: 'linkedinUrl', dst: 'linkedin_url', type: 'text' },
      { src: 'portfolioUrl', dst: 'portfolio_url', type: 'text' },
      { src: 'parsingMethod', dst: 'parsing_method', type: 'text' },
      { src: 'parserVersion', dst: 'parser_version', type: 'text' },
      { src: 'resumeUrl', dst: 'resume_url', type: 'text' },
      { src: 'resumeFileName', dst: 'resume_file_name', type: 'text' },
      { src: 'resumeMimeType', dst: 'resume_mime_type', type: 'text' },
      { src: 'resumeSize', dst: 'resume_size', type: 'number' },
      { src: 'resumeText', dst: 'resume_text', type: 'text' },
      { src: 'source', dst: 'source', type: 'text' },
      { src: 'sourceInterviewId', dst: 'source_interview_id', type: 'text' },
      { src: 'sourceJobTitle', dst: 'source_job_title', type: 'text' },
      { src: 'isHired', dst: 'is_hired', type: 'bool' },
      { src: 'doNotSuggest', dst: 'do_not_suggest', type: 'bool' },
      { src: 'createdAt', dst: 'created_at', type: 'iso' },
      { src: 'updatedAt', dst: 'updated_at', type: 'iso' },
    ],
    raw: 'raw',
    columns: {
      recruiter_uid: 'recruiter_uid', team_id: 'team_id', created_by: 'created_by',
      name: 'name', email: 'email', phone: 'phone', location: 'location',
      current_title: 'current_title', summary: 'summary',
      total_experience_years: 'total_experience_years', skills: 'skills',
      experience: 'experience', education: 'education', certifications: 'certifications',
      languages: 'languages', keywords: 'keywords', linkedin_url: 'linkedin_url',
      portfolio_url: 'portfolio_url', parsing_method: 'parsing_method',
      parser_version: 'parser_version', resume_url: 'resume_url',
      resume_file_name: 'resume_file_name', resume_mime_type: 'resume_mime_type',
      resume_size: 'resume_size', resume_text: 'resume_text', source: 'source',
      source_interview_id: 'source_interview_id', source_job_title: 'source_job_title',
      is_hired: 'is_hired', do_not_suggest: 'do_not_suggest',
      created_at: 'created_at', updated_at: 'updated_at', raw: 'raw',
    },
    conflictUpdate: [
      'recruiter_uid', 'team_id', 'created_by', 'name', 'email', 'phone', 'location',
      'current_title', 'summary', 'total_experience_years', 'skills', 'experience',
      'education', 'certifications', 'languages', 'keywords', 'linkedin_url', 'portfolio_url',
      'parsing_method', 'parser_version', 'resume_url', 'resume_file_name', 'resume_mime_type',
      'resume_size', 'resume_text', 'source', 'source_interview_id', 'source_job_title',
      'is_hired', 'do_not_suggest', 'created_at', 'updated_at', 'raw',
    ],
  },
  transactions: {
    table: 'transactions',
    fields: [
      { src: 'userId', dst: 'user_id', type: 'text' },
      { src: 'userName', dst: 'user_name', type: 'text' },
      { src: 'amount', dst: 'amount', type: 'number' },
      { src: 'paymentId', dst: 'payment_id', type: 'text' },
      { src: 'createdAt', dst: 'created_at', type: 'iso' },
    ],
    raw: 'raw',
    columns: {
      user_id: 'user_id', user_name: 'user_name', amount: 'amount',
      payment_id: 'payment_id', created_at: 'created_at', raw: 'raw',
    },
    conflictUpdate: ['user_id', 'user_name', 'amount', 'payment_id', 'created_at', 'raw'],
  },
  auditLogs: {
    table: 'audit_logs',
    fields: [
      { src: 'teamId', dst: 'team_id', type: 'text' },
      { src: 'action', dst: 'action', type: 'text' },
      { src: 'details', dst: 'details', type: 'text' },
      { src: 'performedBy', dst: 'performed_by', type: 'json' },
      { src: 'isoTimestamp', dst: 'iso_timestamp', type: 'text' },
      { src: 'createdAt', dst: 'created_at', type: 'iso' },
    ],
    columns: {
      team_id: 'team_id', action: 'action', details: 'details',
      performed_by: 'performed_by', iso_timestamp: 'iso_timestamp', created_at: 'created_at',
    },
    conflictUpdate: ['team_id', 'action', 'details', 'performed_by', 'iso_timestamp', 'created_at'],
  },
  settings: {
    table: 'settings',
    special: 'jsonb-doc',
    columns: { data: 'data', updated_at: 'updated_at' },
    conflictUpdate: ['data', 'updated_at'],
    timestampsInDoc: ['updatedAt'],
  },
  rateLimits: {
    table: 'company_rate_limits',
    fields: [
      { src: 'scope', dst: 'scope', type: 'text' },
      { src: 'interviews', dst: 'interviews', type: 'number' },
      { src: 'assessments', dst: 'assessments', type: 'number' },
      { src: 'codingAssessments', dst: 'coding_assessments', type: 'number' },
      { src: 'usage', dst: 'usage', type: 'json' },
      { src: 'topUps', dst: 'top_ups', type: 'json' },
      { src: 'usageBaseline', dst: 'usage_baseline', type: 'json' },
      { src: 'lastCandidateSubmissionAt', dst: 'last_candidate_submission_at', type: 'iso' },
      { src: 'updatedAt', dst: 'updated_at', type: 'iso' },
      { src: 'updatedBy', dst: 'updated_by', type: 'text' },
    ],
    columns: {
      scope: 'scope', interviews: 'interviews', assessments: 'assessments',
      coding_assessments: 'coding_assessments', usage: 'usage', top_ups: 'top_ups',
      usage_baseline: 'usage_baseline', last_candidate_submission_at: 'last_candidate_submission_at',
      updated_at: 'updated_at', updated_by: 'updated_by',
    },
    conflictUpdate: [
      'scope', 'interviews', 'assessments', 'coding_assessments', 'usage', 'top_ups',
      'usage_baseline', 'last_candidate_submission_at', 'updated_at', 'updated_by',
    ],
  },
};

const RESERVED_KEYS = new Set(['id', 'parentId', 'data']);

function castValue(value, type) {
  if (value === null || value === undefined || value === '') {
    if (type === 'json') return null;
    return null;
  }
  switch (type) {
    case 'text':
      return String(value);
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case 'bool':
      return Boolean(value);
    case 'json':
      return typeof value === 'string' ? value : JSON.stringify(value);
    case 'iso': {
      if (typeof value === 'number') return new Date(value).toISOString();
      return ISO(value);
    }
    default:
      return value;
  }
}

function buildRecord(def, doc) {
  const data = doc.data || {};
  const columns = {};
  const params = [doc.id];
  const placeholders = { id: '$1' };
  let i = 2;

  if (def.special === 'jsonb-doc') {
    const docCopy = { ...data };
    for (const ts of def.timestampsInDoc || []) {
      if (docCopy[ts] !== undefined) docCopy[ts] = ISO(docCopy[ts]);
    }
    columns.data = `$${i++}::jsonb`;
    params.push(JSON.stringify(docCopy));
    const ts = docCopy.updatedAt || data.updatedAt;
    if (ts) {
      columns.updated_at = `$${i++}::timestamptz`;
      params.push(ISO(ts));
    }
    return { columns, params };
  }

  const used = new Set(['id']);
  for (const field of def.fields || []) {
    const value = data[field.src];
    if (value === undefined) continue;
    columns[field.dst] = `$${i++}`;
    params.push(castValue(value, field.type));
    used.add(field.src);
  }

  if (def.extra) def.extra({ params, columns }, doc);

  // Unmapped fields → raw JSONB (if the table has a raw column).
  if (def.raw) {
    const raw = {};
    for (const [key, value] of Object.entries(data)) {
      if (RESERVED_KEYS.has(key) || used.has(key)) continue;
      raw[key] = value;
    }
    if (Object.keys(raw).length) {
      columns[def.raw] = `$${i++}::jsonb`;
      params.push(JSON.stringify(raw));
    }
  }

  // id goes last so param indexes stay consistent ($1 = id for upsert).
  return { columns, params };
}

function buildSql(def, columns) {
  const names = Object.keys(columns);
  if (!names.length) return null;
  const colList = ['id', ...names].join(', ');
  const valueList = ['$1', ...names.map((n) => columns[n])].join(', ');
  const updates = def.conflictUpdate
    .filter((c) => names.includes(c))
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ');
  return `INSERT INTO ${def.table} (${colList}) VALUES (${valueList})
          ON CONFLICT (id) DO UPDATE SET ${updates}`;
}

async function main() {
  if (!process.env.RDS_PASSWORD && !process.env.PGPASSWORD && !process.env.DATABASE_URL) {
    console.error('Missing RDS_PASSWORD (or PGPASSWORD/DATABASE_URL) in .env');
    process.exit(1);
  }
  const wanted = selected.length ? selected : Object.keys(TABLES);
  const report = {};

  for (const name of wanted) {
    const def = TABLES[name];
    if (!def) {
      console.warn(`Unknown table "${name}" — skipping.`);
      continue;
    }
    const file = join(inDir, `${name}.ndjson`);
    if (!existsSync(file)) {
      console.warn(`Missing export file: ${file} — skipping ${name}`);
      continue;
    }
    const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    let imported = 0;
    for (const line of lines) {
      const doc = JSON.parse(line);
      const { columns, params } = buildRecord(def, doc);
      const sql = buildSql(def, columns);
      if (!sql) {
        console.warn(`[${name}] No fields for row ${doc.id} — skipping`);
        continue;
      }
      if (dryRun) {
        imported++;
        continue;
      }
      try {
        await pool.query(sql, params);
        imported++;
      } catch (err) {
        console.error(`[${name}] Failed on row ${doc.id}: ${err.message}`);
        report[name] = { error: err.message, failedRow: doc.id };
        await pool.end();
        process.exit(1);
      }
    }
    report[name] = imported;
    console.log(`${name}: ${dryRun ? '[dry-run] ' : ''}${imported}/${lines.length} rows imported`);
  }

  console.log(`\nReport: ${JSON.stringify(report, null, 2)}`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  try { await pool.end(); } catch {}
  process.exit(1);
});
