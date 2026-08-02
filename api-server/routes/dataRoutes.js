import express from 'express';
import { query, withTransaction, dbReady } from '../db/pool.js';
import { verifyIdToken } from '../cognitoService.js';

const router = express.Router();

/** Coerce "55/100", "55", 55 → number for NUMERIC columns; null if empty/invalid. */
function toNumericScore(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value).trim();
  const match = text.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : null;
}

function bearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

async function optionalAuth(req, _res, next) {
  const token = bearer(req);
  if (!token) {
    req.caller = null;
    return next();
  }
  try {
    const payload = await verifyIdToken(token);
    const email = payload.email;
    let user = null;
    if (dbReady() && email) {
      const r = await query(
        `SELECT * FROM users WHERE email_lower = lower($1) OR id = $2 OR cognito_sub = $2 LIMIT 1`,
        [email, payload.sub]
      );
      user = r.rows[0] || null;
    }
    req.caller = {
      sub: payload.sub,
      email,
      groups: payload['cognito:groups'] || [],
      role: payload['custom:role'] || user?.role || null,
      user,
      uid: user?.id || payload['custom:legacyFirebaseUid'] || payload.sub,
    };
  } catch {
    req.caller = null;
  }
  next();
}

async function requireAuth(req, res, next) {
  await optionalAuth(req, res, async () => {
    if (!req.caller) return res.status(401).json({ success: false, error: 'Unauthorized' });
    next();
  });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.caller) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const role = req.caller.role;
    const groups = req.caller.groups || [];
    if (roles.includes(role) || roles.some((r) => groups.includes(r))) return next();
    return res.status(403).json({ success: false, error: 'Forbidden' });
  };
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    uid: row.id,
    cognitoSub: row.cognito_sub,
    email: row.email,
    role: row.role,
    fullname: row.fullname,
    name: row.display_name || row.fullname,
    displayName: row.display_name || row.fullname,
    phone: row.phone,
    phoneNumber: row.phone,
    company: row.company,
    experience: row.experience,
    photoURL: row.photo_url,
    accountStatus: row.account_status,
    adminVerified: row.admin_verified,
    parentRecruiterId: row.parent_recruiter_id,
    teamId: row.team_id,
    isSecondary: row.is_secondary,
    designation: row.designation,
    whatsappSessionId: row.whatsapp_session_id,
    whatsappSessionPasscode: row.whatsapp_session_passcode,
    authProvider: row.auth_provider,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.profile || {}),
  };
}

function mapInterview(row) {
  if (!row) return null;
  return {
    id: row.id,
    recruiterUID: row.recruiter_uid,
    teamId: row.team_id,
    title: row.title,
    description: row.description,
    department: row.department,
    employmentType: row.employment_type,
    minExperience: row.min_experience,
    maxExperience: row.max_experience,
    experience: row.experience,
    skills: row.skills,
    education: row.education,
    location: row.location,
    salaryRange: row.salary_range,
    genderRequirement: row.gender_requirement,
    deadline: row.deadline,
    numQuestions: row.num_questions,
    difficulty: row.difficulty,
    strictness: row.strictness,
    manualQuestions: row.manual_questions,
    customFields: row.custom_fields,
    candidateEmails: row.candidate_emails,
    candidateData: row.candidate_data,
    interviewLink: row.interview_link,
    accessCode: row.access_code,
    createdBy: row.created_by,
    isMock: row.is_mock,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.raw || {}),
  };
}

/**
 * Keep only the latest attempt per candidate identity (email, phone, candidate_uid).
 * Mirrors dedupeCandidatesByIdentity in services/candidateIdentity.ts.
 * Rows must be ordered most-recent-first for the kept row to be the latest.
 */
function dedupeAttempts(rows) {
  const seen = new Set();
  const kept = [];
  for (const row of rows) {
    const info = row.candidate_info && typeof row.candidate_info === 'object' ? row.candidate_info : {};
    const email = (info.email || '').trim().toLowerCase();
    const phoneDigits = (info.phone || '').replace(/\D/g, '');
    const phone =
      phoneDigits.length < 7 ? '' : phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits;
    const keys = [];
    if (email) keys.push(`email:${email}`);
    if (phone) keys.push(`phone:${phone}`);
    if (row.candidate_uid) keys.push(`uid:${row.candidate_uid}`);
    if (keys.length === 0) {
      kept.push(row);
      continue;
    }
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    kept.push(row);
  }
  return kept;
}

function mapAttempt(row) {
  if (!row) return null;
  const mapped = {
    id: row.id,
    interviewId: row.interview_id,
    recruiterUID: row.recruiter_uid,
    candidateUID: row.candidate_uid,
    jobId: row.job_id,
    jobTitle: row.job_title,
    jobDescription: row.job_description,
    status: row.status,
    score: row.score,
    resumeScore: row.resume_score,
    qnaScore: row.qna_score,
    feedback: row.feedback,
    language: row.language,
    isMock: row.is_mock,
    terminated: row.terminated,
    allowReattempt: row.allow_reattempt,
    clientAccessExpiresAt: row.client_access_expires_at,
    questions: row.questions,
    answers: row.answers,
    videoURLs: row.video_urls,
    transcriptIds: row.transcript_ids,
    transcriptTexts: row.transcript_texts,
    candidateInfo: row.candidate_info,
    visibilitySettings: row.visibility_settings,
    meta: row.meta,
    candidateResumeURL: row.candidate_resume_url,
    candidateResumeMimeType: row.candidate_resume_mime_type,
    candidateResumeText: row.candidate_resume_text,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  // Merge raw extras without letting them wipe canonical columns.
  const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
  for (const [key, value] of Object.entries(raw)) {
    if (mapped[key] === undefined || mapped[key] === null || mapped[key] === '') {
      mapped[key] = value;
    }
  }
  return mapped;
}

function mapResumeDump(row) {
  return {
    id: row.id,
    recruiterUID: row.recruiter_uid,
    teamId: row.team_id,
    createdBy: row.created_by,
    name: row.name,
    email: row.email,
    phone: row.phone,
    location: row.location,
    currentTitle: row.current_title,
    summary: row.summary,
    totalExperienceYears: row.total_experience_years,
    skills: row.skills,
    experience: row.experience,
    education: row.education,
    certifications: row.certifications,
    languages: row.languages,
    keywords: row.keywords,
    linkedinUrl: row.linkedin_url,
    portfolioUrl: row.portfolio_url,
    parsingMethod: row.parsing_method,
    parserVersion: row.parser_version,
    resumeUrl: row.resume_url,
    resumeFileName: row.resume_file_name,
    resumeMimeType: row.resume_mime_type,
    resumeSize: row.resume_size,
    resumeText: row.resume_text,
    source: row.source,
    sourceInterviewId: row.source_interview_id,
    sourceJobTitle: row.source_job_title,
    isHired: row.is_hired,
    doNotSuggest: row.do_not_suggest,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.raw || {}),
  };
}

router.get('/health', async (_req, res) => {
  if (!dbReady()) return res.json({ success: false, postgres: false, reason: 'not_configured' });
  try {
    const r = await query('SELECT NOW() AS now');
    res.json({ success: true, postgres: true, now: r.rows[0].now });
  } catch (err) {
    res.status(500).json({ success: false, postgres: false, error: err.message });
  }
});

// ─── Users ──────────────────────────────────────────────────────────────────

router.get('/users/me', requireAuth, async (req, res) => {
  if (!req.caller.user) {
    return res.status(404).json({ success: false, error: 'User profile not found in Postgres.' });
  }
  res.json({ success: true, user: mapUser(req.caller.user) });
});

router.get('/users', requireAuth, requireRole('admin'), async (_req, res) => {
  const r = await query(`SELECT * FROM users ORDER BY created_at DESC`);
  res.json({ success: true, users: r.rows.map(mapUser) });
});

router.get('/users/team/:teamId', requireAuth, async (req, res) => {
  const teamId = req.params.teamId;
  if (req.caller.role !== 'admin' && req.caller.uid !== teamId && req.caller.user?.team_id !== teamId) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const r = await query(
    `SELECT * FROM users WHERE team_id = $1 OR parent_recruiter_id = $1 OR id = $1 ORDER BY created_at ASC`,
    [teamId]
  );
  res.json({ success: true, users: r.rows.map(mapUser) });
});

router.put('/users/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  if (req.caller.role !== 'admin' && req.caller.uid !== id) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const b = req.body || {};
  const r = await query(
    `UPDATE users SET
      fullname = COALESCE($2, fullname),
      display_name = COALESCE($3, display_name),
      phone = COALESCE($4, phone),
      company = COALESCE($5, company),
      experience = COALESCE($6, experience),
      photo_url = COALESCE($7, photo_url),
      designation = COALESCE($8, designation),
      whatsapp_session_id = COALESCE($9, whatsapp_session_id),
      whatsapp_session_passcode = COALESCE($10, whatsapp_session_passcode),
      account_status = COALESCE($11, account_status),
      admin_verified = COALESCE($12, admin_verified),
      profile = COALESCE($13, profile),
      updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      b.fullname ?? b.name ?? null,
      b.displayName ?? b.name ?? null,
      b.phone ?? b.phoneNumber ?? null,
      b.company ?? null,
      b.experience ?? null,
      b.photoURL ?? null,
      b.designation ?? null,
      b.whatsappSessionId ?? null,
      b.whatsappSessionPasscode ?? null,
      b.accountStatus ?? null,
      b.adminVerified ?? null,
      b.profile ? JSON.stringify(b.profile) : null,
    ]
  );
  if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, user: mapUser(r.rows[0]) });
});

router.post('/users', requireAuth, async (req, res) => {
  const b = req.body || {};
  if (!b.id || !b.email || !b.role) {
    return res.status(400).json({ success: false, error: 'id, email, role required' });
  }
  const isAdmin = req.caller.role === 'admin' || req.caller.groups.includes('admin');
  const isRecruiter = req.caller.role === 'recruiter' || req.caller.groups.includes('recruiter');
  if (!isAdmin) {
    if (!isRecruiter || b.role !== 'recruiter' || !b.isSecondary) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
  }

  const r = await query(
    `INSERT INTO users (
      id, cognito_sub, email, role, fullname, display_name, phone, experience,
      account_status, admin_verified, parent_recruiter_id, team_id, is_secondary,
      designation, whatsapp_session_id, whatsapp_session_passcode, auth_provider, profile
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,
      COALESCE($9,'active'), COALESCE($10,true), $11,$12,COALESCE($13,false),
      $14,$15,$16,COALESCE($17,'cognito'), COALESCE($18,'{}'::jsonb)
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      fullname = COALESCE(EXCLUDED.fullname, users.fullname),
      display_name = COALESCE(EXCLUDED.display_name, users.display_name),
      updated_at = NOW()
    RETURNING *`,
    [
      b.id,
      b.cognitoSub || b.id,
      b.email,
      b.role,
      b.fullname || b.name || null,
      b.displayName || b.name || b.fullname || null,
      b.phone || null,
      b.experience ?? null,
      b.accountStatus || 'active',
      b.adminVerified ?? true,
      b.parentRecruiterId || null,
      b.teamId || null,
      Boolean(b.isSecondary),
      b.designation || null,
      b.whatsappSessionId || null,
      b.whatsappSessionPasscode || null,
      b.authProvider || 'cognito',
      JSON.stringify(b.profile || {}),
    ]
  );
  res.status(201).json({ success: true, user: mapUser(r.rows[0]) });
});

// ─── Recruiter requests ─────────────────────────────────────────────────────

router.post('/recruiter-requests', optionalAuth, async (req, res) => {
  const { email, fullname, experience } = req.body || {};
  if (!email) return res.status(400).json({ success: false, error: 'email required' });
  const r = await query(
    `INSERT INTO recruiter_requests (email, fullname, experience) VALUES ($1,$2,$3) RETURNING *`,
    [email, fullname || null, experience ?? 0]
  );
  res.status(201).json({ success: true, request: r.rows[0] });
});

router.get('/recruiter-requests', requireAuth, requireRole('admin'), async (_req, res) => {
  const r = await query(`SELECT * FROM recruiter_requests WHERE status = 'pending' ORDER BY created_at DESC`);
  res.json({
    success: true,
    requests: r.rows.map((row) => ({
      id: row.id,
      email: row.email,
      fullname: row.fullname,
      experience: row.experience,
      status: row.status,
      createdAt: row.created_at,
    })),
  });
});

router.delete('/recruiter-requests/:id', requireAuth, requireRole('admin'), async (req, res) => {
  await query(`DELETE FROM recruiter_requests WHERE id = $1`, [req.params.id]);
  res.json({ success: true });
});

// ─── Interviews ─────────────────────────────────────────────────────────────

router.get('/interviews', requireAuth, async (req, res) => {
  const { recruiterUID, teamId } = req.query;
  let r;
  if (req.caller.role === 'admin' && !recruiterUID && !teamId) {
    r = await query(`SELECT * FROM interviews ORDER BY created_at DESC`);
  } else {
    const tid = teamId || recruiterUID || req.caller.user?.team_id || req.caller.uid;
    r = await query(
      `SELECT * FROM interviews WHERE recruiter_uid = $1 OR team_id = $1 ORDER BY created_at DESC`,
      [tid]
    );
  }
  res.json({ success: true, interviews: r.rows.map(mapInterview) });
});

router.get('/interviews/:id', optionalAuth, async (req, res) => {
  const r = await query(`SELECT * FROM interviews WHERE id = $1`, [req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, interview: mapInterview(r.rows[0]) });
});

router.post('/interviews', requireAuth, async (req, res) => {
  const b = req.body || {};
  const id = b.id || undefined;
  const recruiterUID = b.recruiterUID || req.caller.uid;
  const r = await query(
    `INSERT INTO interviews (
      id, recruiter_uid, team_id, title, description, department, employment_type,
      min_experience, max_experience, experience, skills, education, location, salary_range,
      gender_requirement, deadline, num_questions, difficulty, strictness,
      manual_questions, custom_fields, candidate_emails, candidate_data,
      interview_link, access_code, created_by, is_mock, raw
    ) VALUES (
      COALESCE($1, encode(gen_random_bytes(12),'hex')),
      $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
      $20::jsonb,$21::jsonb,$22::jsonb,$23::jsonb,$24,$25,$26::jsonb,COALESCE($27,false),$28::jsonb
    ) RETURNING *`,
    [
      id || null,
      recruiterUID,
      b.teamId || recruiterUID,
      b.title,
      b.description || null,
      b.department || null,
      b.employmentType || null,
      b.minExperience ?? null,
      b.maxExperience ?? null,
      b.experience ?? null,
      b.skills || null,
      b.education || null,
      b.location || null,
      b.salaryRange || null,
      b.genderRequirement || null,
      b.deadline || null,
      b.numQuestions ?? null,
      b.difficulty || null,
      b.strictness || null,
      JSON.stringify(b.manualQuestions || []),
      JSON.stringify(b.customFields || []),
      JSON.stringify(b.candidateEmails || []),
      JSON.stringify(b.candidateData || []),
      b.interviewLink || null,
      b.accessCode || null,
      JSON.stringify(b.createdBy || null),
      Boolean(b.isMock),
      JSON.stringify(b.raw || {}),
    ]
  );
  res.status(201).json({ success: true, interview: mapInterview(r.rows[0]) });
});

router.patch('/interviews/:id', requireAuth, async (req, res) => {
  const b = req.body || {};
  const existing = await query(`SELECT * FROM interviews WHERE id = $1`, [req.params.id]);
  if (!existing.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
  const row = existing.rows[0];
  if (
    req.caller.role !== 'admin' &&
    row.recruiter_uid !== req.caller.uid &&
    row.team_id !== req.caller.uid &&
    row.team_id !== req.caller.user?.team_id
  ) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const r = await query(
    `UPDATE interviews SET
      title = COALESCE($2, title),
      description = COALESCE($3, description),
      department = COALESCE($4, department),
      employment_type = COALESCE($5, employment_type),
      min_experience = COALESCE($6, min_experience),
      max_experience = COALESCE($7, max_experience),
      experience = COALESCE($8, experience),
      skills = COALESCE($9, skills),
      education = COALESCE($10, education),
      location = COALESCE($11, location),
      salary_range = COALESCE($12, salary_range),
      gender_requirement = COALESCE($13, gender_requirement),
      deadline = COALESCE($14, deadline),
      num_questions = COALESCE($15, num_questions),
      difficulty = COALESCE($16, difficulty),
      strictness = COALESCE($17, strictness),
      candidate_emails = COALESCE($18::jsonb, candidate_emails),
      candidate_data = COALESCE($19::jsonb, candidate_data),
      manual_questions = COALESCE($20::jsonb, manual_questions),
      custom_fields = COALESCE($21::jsonb, custom_fields),
      raw = COALESCE($22::jsonb, raw),
      updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [
      req.params.id,
      b.title ?? null,
      b.description ?? null,
      b.department ?? null,
      b.employmentType ?? null,
      b.minExperience ?? null,
      b.maxExperience ?? null,
      b.experience ?? null,
      b.skills ?? null,
      b.education ?? null,
      b.location ?? null,
      b.salaryRange ?? null,
      b.genderRequirement ?? null,
      b.deadline ?? null,
      b.numQuestions ?? null,
      b.difficulty ?? null,
      b.strictness ?? null,
      b.candidateEmails ? JSON.stringify(b.candidateEmails) : null,
      b.candidateData ? JSON.stringify(b.candidateData) : null,
      b.manualQuestions ? JSON.stringify(b.manualQuestions) : null,
      b.customFields ? JSON.stringify(b.customFields) : null,
      b.raw ? JSON.stringify(b.raw) : null,
    ]
  );
  res.json({ success: true, interview: mapInterview(r.rows[0]) });
});

router.delete('/interviews/:id', requireAuth, async (req, res) => {
  await query(`DELETE FROM interviews WHERE id = $1`, [req.params.id]);
  res.json({ success: true });
});

// ─── Attempts ───────────────────────────────────────────────────────────────

router.get('/interviews/:id/attempts', optionalAuth, async (req, res) => {
  const r = await query(
    `SELECT * FROM interview_attempts WHERE interview_id = $1 ORDER BY submitted_at DESC NULLS LAST, created_at DESC`,
    [req.params.id]
  );
  res.json({ success: true, attempts: dedupeAttempts(r.rows).map(mapAttempt) });
});

router.get('/attempts/:id', optionalAuth, async (req, res) => {
  const r = await query(`SELECT * FROM interview_attempts WHERE id = $1`, [req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, attempt: mapAttempt(r.rows[0]) });
});

router.get('/attempts', requireAuth, async (req, res) => {
  const { recruiterUID, status } = req.query;
  const isAdmin = req.caller.role === 'admin' || (req.caller.groups || []).includes('admin');

  if (isAdmin && !recruiterUID) {
    const params = [];
    let sql = `SELECT * FROM interview_attempts`;
    if (status) {
      params.push(status);
      sql += ` WHERE status = $1`;
    }
    sql += ` ORDER BY submitted_at DESC NULLS LAST LIMIT 2000`;
    const r = await query(sql, params);
    return res.json({ success: true, attempts: r.rows.map(mapAttempt) });
  }

  const uid = recruiterUID || req.caller.uid;
  const params = [uid];
  let sql = `
    SELECT a.*
    FROM interview_attempts a
    LEFT JOIN interviews i ON i.id = a.interview_id
    WHERE a.recruiter_uid = $1 OR i.recruiter_uid = $1 OR i.team_id = $1
  `;
  if (status) {
    params.push(status);
    sql += ` AND a.status = $2`;
  }
  sql += ` ORDER BY a.submitted_at DESC NULLS LAST`;
  const r = await query(sql, params);
  res.json({ success: true, attempts: r.rows.map(mapAttempt) });
});

router.post('/interviews/:id/attempts', optionalAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const interviewId = req.params.id;

    const attempt = await withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO interview_attempts (
          id, interview_id, recruiter_uid, candidate_uid, job_id, job_title, job_description,
          status, score, resume_score, qna_score, feedback, language, is_mock, terminated,
          questions, answers, video_urls, transcript_ids, transcript_texts,
          candidate_info, meta, candidate_resume_url, candidate_resume_mime_type, candidate_resume_text, raw
        ) VALUES (
          COALESCE($1, encode(gen_random_bytes(12),'hex')),
          $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE($14,false),COALESCE($15,false),
          $16::jsonb,$17::jsonb,$18::jsonb,$19::jsonb,$20::jsonb,
          $21::jsonb,$22::jsonb,$23,$24,$25,$26::jsonb
        ) RETURNING *`,
        [
          b.id || null,
          interviewId,
          b.recruiterUID || null,
          b.candidateUID || null,
          b.jobId || interviewId,
          b.jobTitle || null,
          b.jobDescription || null,
          b.status || 'Completed',
          b.score != null ? String(b.score) : null,
          toNumericScore(b.resumeScore),
          toNumericScore(b.qnaScore),
          b.feedback || null,
          b.language || null,
          Boolean(b.isMock),
          Boolean(b.terminated),
          JSON.stringify(b.questions || []),
          JSON.stringify(b.answers || []),
          JSON.stringify(b.videoURLs || []),
          JSON.stringify(b.transcriptIds || []),
          JSON.stringify(b.transcriptTexts || []),
          JSON.stringify(b.candidateInfo || {}),
          JSON.stringify(b.meta || {}),
          b.candidateResumeURL || null,
          b.candidateResumeMimeType || null,
          b.candidateResumeText || null,
          JSON.stringify(b.raw || {}),
        ]
      );

      if (!b.isMock) {
        await client.query(
          `UPDATE company_rate_limits
           SET usage = jsonb_set(usage, '{interviews}', to_jsonb(COALESCE((usage->>'interviews')::int,0) + 1)),
               last_candidate_submission_at = NOW(),
               updated_at = NOW()
           WHERE id = 'company'`
        );
      }

      return inserted.rows[0];
    });

    res.status(201).json({ success: true, attempt: mapAttempt(attempt) });
  } catch (err) {
    console.error('[POST /interviews/:id/attempts]', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to save attempt' });
  }
});

router.patch('/attempts/:id', optionalAuth, async (req, res) => {
  const b = req.body || {};
  // Candidates may clear a granted reattempt flag without a recruiter session.
  // All other mutations still require an authenticated caller.
  if (!req.caller) {
    const keys = Object.keys(b || {});
    const onlyClearReattempt =
      keys.length === 1 && keys[0] === 'allowReattempt' && b.allowReattempt === false;
    if (!onlyClearReattempt) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
  }

  const r = await query(
    `UPDATE interview_attempts SET
      status = COALESCE($2, status),
      allow_reattempt = COALESCE($3, allow_reattempt),
      client_access_expires_at = CASE
        WHEN $6::boolean THEN $4::timestamptz
        ELSE client_access_expires_at
      END,
      visibility_settings = COALESCE($5::jsonb, visibility_settings),
      updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [
      req.params.id,
      b.status ?? null,
      b.allowReattempt ?? null,
      Object.prototype.hasOwnProperty.call(b, 'clientAccessExpiresAt')
        ? b.clientAccessExpiresAt
        : null,
      b.visibilitySettings ? JSON.stringify(b.visibilitySettings) : null,
      Object.prototype.hasOwnProperty.call(b, 'clientAccessExpiresAt'),
    ]
  );
  if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, attempt: mapAttempt(r.rows[0]) });
});

// ─── Tests ──────────────────────────────────────────────────────────────────

router.get('/tests', requireAuth, async (req, res) => {
  const tid = req.query.recruiterUID || req.caller.uid;
  const r = await query(
    `SELECT * FROM tests WHERE recruiter_uid = $1 OR team_id = $1 ORDER BY created_at DESC`,
    [tid]
  );
  res.json({
    success: true,
    tests: r.rows.map((row) => ({
      id: row.id,
      recruiterUID: row.recruiter_uid,
      teamId: row.team_id,
      title: row.title,
      type: row.type,
      duration: row.duration,
      questions: row.questions,
      accessCode: row.access_code,
      passingScore: row.passing_score,
      nextInterviewId: row.next_interview_id,
      externalInterviewLink: row.external_interview_link,
      externalAccessCode: row.external_access_code,
      createdAt: row.created_at,
      ...(row.raw || {}),
    })),
  });
});

router.get('/tests/:id', optionalAuth, async (req, res) => {
  const r = await query(`SELECT * FROM tests WHERE id = $1`, [req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
  const row = r.rows[0];
  res.json({
    success: true,
    test: {
      id: row.id,
      recruiterUID: row.recruiter_uid,
      title: row.title,
      type: row.type,
      duration: row.duration,
      questions: row.questions,
      accessCode: row.access_code,
      passingScore: row.passing_score,
      nextInterviewId: row.next_interview_id,
      externalInterviewLink: row.external_interview_link,
      externalAccessCode: row.external_access_code,
      createdAt: row.created_at,
      ...(row.raw || {}),
    },
  });
});

router.post('/tests', requireAuth, async (req, res) => {
  const b = req.body || {};
  const r = await query(
    `INSERT INTO tests (
      recruiter_uid, team_id, title, type, duration, questions, access_code, passing_score,
      next_interview_id, external_interview_link, external_access_code, raw
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12::jsonb) RETURNING *`,
    [
      b.recruiterUID || req.caller.uid,
      b.teamId || req.caller.uid,
      b.title,
      b.type,
      b.duration ?? null,
      JSON.stringify(b.questions || []),
      b.accessCode || null,
      b.passingScore ?? null,
      b.nextInterviewId || null,
      b.externalInterviewLink || null,
      b.externalAccessCode || null,
      JSON.stringify(b.raw || {}),
    ]
  );
  res.status(201).json({ success: true, test: { id: r.rows[0].id, ...b } });
});

router.delete('/tests/:id', requireAuth, async (req, res) => {
  await query(`DELETE FROM tests WHERE id = $1`, [req.params.id]);
  res.json({ success: true });
});

router.post('/test-submissions', optionalAuth, async (req, res) => {
  const b = req.body || {};
  const row = await withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO test_submissions (
        test_id, recruiter_uid, candidate_uid, candidate_name, candidate_email,
        answers, score, feedback, status, type, tab_switch_count, email_sent, email_error, raw
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14::jsonb) RETURNING *`,
      [
        b.testId,
        b.recruiterUID || null,
        b.candidateUID || null,
        b.candidateName || null,
        b.candidateEmail || null,
        JSON.stringify(b.answers || {}),
        b.score ?? null,
        b.feedback || null,
        b.status || null,
        b.type || null,
        b.tabSwitchCount ?? 0,
        Boolean(b.emailSent),
        b.emailError || null,
        JSON.stringify(b.raw || {}),
      ]
    );

    const usageKey = b.type === 'coding' ? 'codingAssessments' : 'assessments';
    if (!b.isMock) {
      await client.query(
        `UPDATE company_rate_limits
         SET usage = jsonb_set(usage, ARRAY[$1], to_jsonb(COALESCE((usage->>$1)::int,0) + 1)),
             last_candidate_submission_at = NOW(),
             updated_at = NOW()
         WHERE id = 'company'`,
        [usageKey]
      );
    }
    return inserted.rows[0];
  });

  res.status(201).json({ success: true, submission: { id: row.id, ...b, submittedAt: row.submitted_at } });
});

router.get('/tests/:id/submissions', requireAuth, async (req, res) => {
  const r = await query(
    `SELECT * FROM test_submissions WHERE test_id = $1 ORDER BY submitted_at DESC`,
    [req.params.id]
  );
  res.json({
    success: true,
    submissions: r.rows.map((row) => ({
      id: row.id,
      testId: row.test_id,
      recruiterUID: row.recruiter_uid,
      candidateUID: row.candidate_uid,
      candidateName: row.candidate_name,
      candidateEmail: row.candidate_email,
      answers: row.answers,
      score: row.score,
      feedback: row.feedback,
      status: row.status,
      type: row.type,
      tabSwitchCount: row.tab_switch_count,
      submittedAt: row.submitted_at,
      ...(row.raw || {}),
    })),
  });
});

// ─── Rate limits / settings / misc ──────────────────────────────────────────

router.get('/rate-limits/company', optionalAuth, async (_req, res) => {
  const r = await query(`SELECT * FROM company_rate_limits WHERE id = 'company'`);
  const row = r.rows[0];
  res.json({
    success: true,
    rateLimits: {
      id: 'company',
      scope: row.scope,
      interviews: row.interviews,
      assessments: row.assessments,
      codingAssessments: row.coding_assessments,
      usage: row.usage,
      topUps: row.top_ups,
      usageBaseline: row.usage_baseline,
      lastCandidateSubmissionAt: row.last_candidate_submission_at,
      updatedAt: row.updated_at,
    },
  });
});

router.get('/rate-limits/raw-usage', requireAuth, requireRole('admin'), async (_req, res) => {
  const interviews = await query(`SELECT COUNT(*)::int AS count FROM interview_attempts WHERE COALESCE(is_mock, false) = false`);
  const assessments = await query(
    `SELECT COUNT(*)::int AS count FROM test_submissions WHERE COALESCE(type, 'aptitude') <> 'coding'`
  );
  const coding = await query(
    `SELECT COUNT(*)::int AS count FROM test_submissions WHERE type = 'coding'`
  );
  res.json({
    success: true,
    interviews: interviews.rows[0]?.count || 0,
    assessments: assessments.rows[0]?.count || 0,
    codingAssessments: coding.rows[0]?.count || 0,
  });
});

router.put('/rate-limits/company', requireAuth, requireRole('admin'), async (req, res) => {
  const b = req.body || {};
  try {
    const r = await query(
      `UPDATE company_rate_limits SET
        interviews = COALESCE($1, interviews),
        assessments = COALESCE($2, assessments),
        coding_assessments = COALESCE($3, coding_assessments),
        usage = COALESCE($4::jsonb, usage),
        top_ups = COALESCE($5::jsonb, top_ups),
        usage_baseline = COALESCE($6::jsonb, usage_baseline),
        updated_by = $7,
        updated_at = NOW()
       WHERE id = 'company' RETURNING *`,
      [
        b.interviews ?? null,
        b.assessments ?? null,
        b.codingAssessments ?? null,
        b.usage != null ? JSON.stringify(b.usage) : null,
        b.topUps != null ? JSON.stringify(b.topUps) : null,
        b.usageBaseline != null ? JSON.stringify(b.usageBaseline) : null,
        req.caller.uid || null,
      ]
    );
    const row = r.rows[0];
    if (!row) return res.status(404).json({ success: false, error: 'Rate limits row not found' });
    res.json({
      success: true,
      rateLimits: {
        id: 'company',
        scope: row.scope,
        interviews: row.interviews,
        assessments: row.assessments,
        codingAssessments: row.coding_assessments,
        usage: row.usage,
        topUps: row.top_ups,
        usageBaseline: row.usage_baseline,
        lastCandidateSubmissionAt: row.last_candidate_submission_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (err) {
    console.error('PUT /rate-limits/company failed:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to update rate limits' });
  }
});

router.get('/settings/:id', optionalAuth, async (req, res) => {
  const r = await query(`SELECT * FROM settings WHERE id = $1`, [req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, settings: { id: r.rows[0].id, ...r.rows[0].data } });
});

router.put('/settings/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const r = await query(
    `INSERT INTO settings (id, data, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
     RETURNING *`,
    [req.params.id, JSON.stringify(req.body || {})]
  );
  res.json({ success: true, settings: { id: r.rows[0].id, ...r.rows[0].data } });
});

router.post('/candidate-consents', optionalAuth, async (req, res) => {
  const b = req.body || {};
  const r = await query(
    `INSERT INTO candidate_consents (
      id, interview_id, interview_title, candidate_name, candidate_email, ip_address,
      accepted_item_ids, accepted_all, consent_version, consent_method, status, accepted_at
    ) VALUES (
      COALESCE($1, encode(gen_random_bytes(12),'hex')),
      $2,$3,$4,$5,$6,$7::jsonb,COALESCE($8,true),$9,$10,COALESCE($11,'accepted'),$12
    ) RETURNING *`,
    [
      b.id || null,
      b.interviewId,
      b.interviewTitle || null,
      b.candidateName,
      b.candidateEmail,
      b.ipAddress || null,
      JSON.stringify(b.acceptedItemIds || []),
      b.acceptedAll ?? true,
      b.consentVersion,
      b.consentMethod,
      b.status || 'accepted',
      b.acceptedAt || new Date().toISOString(),
    ]
  );
  res.status(201).json({ success: true, consent: r.rows[0] });
});

router.post('/resume-dump', requireAuth, async (req, res) => {
  const b = req.body || {};
  const r = await query(
    `INSERT INTO resume_dump_candidates (
      id, recruiter_uid, team_id, created_by, name, email, phone, location, current_title, summary,
      total_experience_years, skills, experience, education, certifications, languages, keywords,
      linkedin_url, portfolio_url, parsing_method, parser_version,
      resume_url, resume_file_name, resume_mime_type, resume_size, resume_text,
      source, source_interview_id, source_job_title, is_hired, do_not_suggest, raw
    ) VALUES (
      COALESCE($1, encode(gen_random_bytes(12),'hex')),
      $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
      $12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,
      $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,COALESCE($30,false),COALESCE($31,false),$32::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      name = COALESCE(EXCLUDED.name, resume_dump_candidates.name),
      email = COALESCE(EXCLUDED.email, resume_dump_candidates.email),
      phone = COALESCE(EXCLUDED.phone, resume_dump_candidates.phone),
      resume_url = COALESCE(EXCLUDED.resume_url, resume_dump_candidates.resume_url),
      resume_text = COALESCE(EXCLUDED.resume_text, resume_dump_candidates.resume_text),
      source_interview_id = COALESCE(EXCLUDED.source_interview_id, resume_dump_candidates.source_interview_id),
      source_job_title = COALESCE(EXCLUDED.source_job_title, resume_dump_candidates.source_job_title),
      updated_at = NOW()
    RETURNING *`,
    [
      b.id || null,
      b.recruiterUID || req.caller.uid,
      b.teamId || req.caller.uid,
      b.createdBy || req.caller.uid,
      b.name || null,
      b.email || null,
      b.phone || null,
      b.location || null,
      b.currentTitle || null,
      b.summary || null,
      b.totalExperienceYears ?? null,
      JSON.stringify(b.skills || []),
      JSON.stringify(b.experience || []),
      JSON.stringify(b.education || []),
      JSON.stringify(b.certifications || []),
      JSON.stringify(b.languages || []),
      JSON.stringify(b.keywords || []),
      b.linkedinUrl || null,
      b.portfolioUrl || null,
      b.parsingMethod || null,
      b.parserVersion || null,
      b.resumeUrl || null,
      b.resumeFileName || null,
      b.resumeMimeType || null,
      b.resumeSize ?? null,
      b.resumeText || null,
      b.source || null,
      b.sourceInterviewId || null,
      b.sourceJobTitle || null,
      Boolean(b.isHired),
      Boolean(b.doNotSuggest),
      JSON.stringify(b.raw || {}),
    ]
  );
  res.status(201).json({ success: true, candidate: { id: r.rows[0].id, ...b } });
});

router.get('/resume-dump', requireAuth, async (req, res) => {
  const tid = req.query.recruiterUID || req.caller.uid;
  const r = await query(
    `SELECT * FROM resume_dump_candidates WHERE recruiter_uid = $1 OR team_id = $1 ORDER BY updated_at DESC`,
    [tid]
  );
  res.json({
    success: true,
    candidates: r.rows.map(mapResumeDump),
  });
});

router.patch('/resume-dump/:id', requireAuth, async (req, res) => {
  const b = req.body || {};
  const r = await query(
    `UPDATE resume_dump_candidates SET
      name = COALESCE($2, name),
      email = COALESCE($3, email),
      phone = COALESCE($4, phone),
      current_title = COALESCE($5, current_title),
      is_hired = COALESCE($6, is_hired),
      do_not_suggest = COALESCE($7, do_not_suggest),
      updated_at = NOW()
     WHERE id = $1 AND (recruiter_uid = $8 OR team_id = $8)
     RETURNING *`,
    [
      req.params.id,
      b.name ?? null,
      b.email ?? null,
      b.phone ?? null,
      b.currentTitle ?? null,
      b.isHired ?? null,
      b.doNotSuggest ?? null,
      b.recruiterUID || req.caller.uid,
    ]
  );
  if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, candidate: mapResumeDump(r.rows[0]) });
});

router.delete('/resume-dump/:id', requireAuth, async (req, res) => {
  const r = await query(
    `DELETE FROM resume_dump_candidates WHERE id = $1 AND (recruiter_uid = $2 OR team_id = $2) RETURNING id`,
    [req.params.id, req.query.recruiterUID || req.caller.uid]
  );
  if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true });
});

router.post('/audit-logs', requireAuth, async (req, res) => {
  const b = req.body || {};
  const r = await query(
    `INSERT INTO audit_logs (team_id, action, details, performed_by, iso_timestamp)
     VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING *`,
    [b.teamId, b.action, b.details || null, JSON.stringify(b.performedBy || {}), b.isoTimestamp || new Date().toISOString()]
  );
  res.status(201).json({ success: true, log: r.rows[0] });
});

router.get('/audit-logs', requireAuth, async (req, res) => {
  const teamId = req.query.teamId || req.caller.uid;
  const r = await query(
    `SELECT * FROM audit_logs WHERE team_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [teamId]
  );
  res.json({ success: true, logs: r.rows });
});

router.get('/notifications', requireAuth, async (req, res) => {
  const r = await query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [req.caller.uid]
  );
  res.json({ success: true, notifications: r.rows });
});

router.post('/notifications', requireAuth, async (req, res) => {
  const b = req.body || {};
  const r = await query(
    `INSERT INTO notifications (user_id, message, type, sender_id, sender_name)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [b.userId, b.message, b.type || null, b.senderId || req.caller.uid, b.senderName || null]
  );
  res.status(201).json({ success: true, notification: r.rows[0] });
});

router.post('/interview-access-tokens', optionalAuth, async (req, res) => {
  const b = req.body || {};
  const r = await query(
    `INSERT INTO interview_access_tokens (test_id, next_interview_id, candidate_email, candidate_name)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [b.testId || null, b.nextInterviewId || null, b.candidateEmail || null, b.candidateName || null]
  );
  res.status(201).json({ success: true, token: r.rows[0] });
});

router.patch('/interview-access-tokens/:id', optionalAuth, async (req, res) => {
  const r = await query(
    `UPDATE interview_access_tokens SET is_used = COALESCE($2, is_used), used_at = COALESCE($3, used_at)
     WHERE id = $1 RETURNING *`,
    [req.params.id, req.body?.isUsed ?? null, req.body?.usedAt || (req.body?.isUsed ? new Date().toISOString() : null)]
  );
  res.json({ success: true, token: r.rows[0] });
});

// Public CMS / contact
router.get('/blogs', optionalAuth, async (_req, res) => {
  const r = await query(`SELECT * FROM blogs ORDER BY created_at DESC`);
  res.json({ success: true, blogs: r.rows });
});

router.post('/contact-submissions', optionalAuth, async (req, res) => {
  const b = req.body || {};
  const r = await query(
    `INSERT INTO contact_submissions (name, email, phone, subject, message)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [b.name || null, b.email || null, b.phone || null, b.subject || null, b.message || null]
  );
  res.status(201).json({ success: true, submission: r.rows[0] });
});

router.post('/bug-reports', optionalAuth, async (req, res) => {
  const b = req.body || {};
  const r = await query(
    `INSERT INTO bug_reports (name, email, feature, description, steps, severity, type)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [b.name || null, b.email || null, b.feature || null, b.description || null, b.steps || null, b.severity || null, b.type || null]
  );
  res.status(201).json({ success: true, report: r.rows[0] });
});

router.get('/reviews', optionalAuth, async (req, res) => {
  const admin = req.caller?.role === 'admin' || (req.caller?.groups || []).includes('admin');
  const r = await query(
    admin
      ? `SELECT * FROM reviews ORDER BY created_at DESC`
      : `SELECT * FROM reviews WHERE approved = true ORDER BY created_at DESC`
  );
  res.json({
    success: true,
    reviews: r.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      contact: row.contact,
      review: row.review,
      rating: Number(row.rating),
      userType: row.user_type,
      approved: row.approved,
      createdAt: row.created_at,
    })),
  });
});

router.post('/reviews', optionalAuth, async (req, res) => {
  const b = req.body || {};
  const r = await query(
    `INSERT INTO reviews (name, email, contact, review, rating, user_type, approved)
     VALUES ($1,$2,$3,$4,$5,$6,false) RETURNING *`,
    [b.name, b.email || null, b.contact || null, b.review, b.rating, b.userType || null]
  );
  res.status(201).json({ success: true, review: r.rows[0] });
});

router.patch('/reviews/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const b = req.body || {};
  const r = await query(
    `UPDATE reviews SET approved = COALESCE($2, approved) WHERE id = $1 RETURNING *`,
    [req.params.id, typeof b.approved === 'boolean' ? b.approved : null]
  );
  if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, review: r.rows[0] });
});

router.delete('/reviews/:id', requireAuth, requireRole('admin'), async (req, res) => {
  await query(`DELETE FROM reviews WHERE id = $1`, [req.params.id]);
  res.json({ success: true });
});

router.get('/contact-submissions', requireAuth, requireRole('admin'), async (_req, res) => {
  const r = await query(`SELECT * FROM contact_submissions ORDER BY created_at DESC`);
  res.json({
    success: true,
    submissions: r.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      subject: row.subject,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
    })),
  });
});

router.patch('/contact-submissions/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const status = req.body?.status || 'read';
  const r = await query(
    `UPDATE contact_submissions SET status = $2 WHERE id = $1 RETURNING *`,
    [req.params.id, status]
  );
  if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, submission: r.rows[0] });
});

router.get('/bug-reports', requireAuth, requireRole('admin'), async (_req, res) => {
  const r = await query(`SELECT * FROM bug_reports ORDER BY created_at DESC`);
  res.json({
    success: true,
    reports: r.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      feature: row.feature,
      description: row.description,
      steps: row.steps,
      severity: row.severity,
      type: row.type,
      status: row.status,
      createdAt: row.created_at,
    })),
  });
});

router.patch('/bug-reports/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const status = req.body?.status || 'fixed';
  const r = await query(`UPDATE bug_reports SET status = $2 WHERE id = $1 RETURNING *`, [
    req.params.id,
    status,
  ]);
  if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, report: r.rows[0] });
});

router.get('/candidate-consents', requireAuth, requireRole('admin'), async (_req, res) => {
  const r = await query(`SELECT * FROM candidate_consents ORDER BY created_at DESC`);
  res.json({
    success: true,
    consents: r.rows.map((row) => ({
      id: row.id,
      interviewId: row.interview_id,
      interviewTitle: row.interview_title,
      candidateName: row.candidate_name,
      candidateEmail: row.candidate_email,
      ipAddress: row.ip_address,
      acceptedItemIds: row.accepted_item_ids,
      acceptedAll: row.accepted_all,
      consentVersion: row.consent_version,
      consentMethod: row.consent_method,
      status: row.status,
      acceptedAt: row.accepted_at,
      createdAt: row.created_at,
    })),
  });
});

router.get('/transactions', requireAuth, requireRole('admin'), async (_req, res) => {
  const r = await query(`SELECT * FROM transactions ORDER BY created_at DESC`);
  res.json({
    success: true,
    transactions: r.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      amount: row.amount,
      paymentId: row.payment_id,
      createdAt: row.created_at,
      ...(row.raw || {}),
    })),
  });
});

router.delete('/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  await query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
  res.json({ success: true });
});

export default router;
