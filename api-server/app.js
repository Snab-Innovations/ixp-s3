/**
 * InterviewXpert REST API Server — Express app (exportable for Lambda)
 *
 * Provides endpoints to:
 * 1. Receive Job Descriptions from external databases or Applicant Tracking Systems (ATS)
 * 2. Manage outward webhooks to dispatch candidate evaluation reports directly to external databases
 *
 * This module builds and exports the Express app WITHOUT calling app.listen() so the
 * same app can run as a long-lived server (server.js) or inside AWS Lambda (amplify/functions/api-server).
 */

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch'; // Standard node fetch for webhook delivery
import './cognitoConfig.js'; // load env before auth routes / Cognito client init
import authRoutes from './authRoutes.js';
import dataRoutes from './routes/dataRoutes.js';
import { pingDb, dbReady, query as pgQuery } from './db/pool.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Cognito auth bridge (login, password reset, user provisioning)
app.use('/auth', authRoutes);

// PostgreSQL data API
app.use('/api/db', dataRoutes);

// Mock API Key database for validation
const MOCK_API_KEYS = new Set(['ix_live_test_api_key_123456789']);

// Middleware to authenticate external database REST requests
const authenticateApiKey = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const apiKey = authHeader ? authHeader.replace('Bearer ', '') : req.query.apiKey;

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: "Missing API Key. Provide key in Authorization Bearer header or query parameter."
    });
  }

  if (!MOCK_API_KEYS.has(apiKey) && apiKey !== process.env.IX_API_KEY) {
    return res.status(403).json({
      success: false,
      error: "Invalid API Key. Access denied."
    });
  }

  next();
};

/**
 * ── 1. RECEIVE JOB DESCRIPTION FROM ANY OTHER DATABASE ──
 * Endpoint: POST /api/jobs/receive
 * Description: Call this from any external DB or system to create a new AI Interview Job inside InterviewXpert.
 */
app.post('/api/jobs/receive', authenticateApiKey, async (req, res) => {
  const {
    title,
    description,
    department = "Engineering",
    employmentType = "Full-time",
    experience = 1,
    skills = "",
    education = "Bachelor's",
    deadline = "",
    numQuestions = 5,
    difficulty = "Medium",
    strictness = "Medium",
    candidateEmails = [],
    recruiterUID = "system_api_integration"
  } = req.body;

  // Basic Validation
  if (!title || !description) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: 'title' and 'description' are mandatory."
    });
  }

  if (!dbReady()) {
    console.warn("⚠️ Postgres unavailable. Returning mock response for testing/demo.");
    const mockRand = Math.random().toString(36).substring(2, 15);
    const mockLink = `http://localhost:3000/#/interview/${mockRand}`;
    const mockCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    return res.status(201).json({
      success: true,
      message: "Job description received and interview successfully scheduled inside InterviewXpert! (MOCK MODE: Postgres not configured)",
      data: {
        interviewId: mockRand,
        accessCode: mockCode,
        interviewLink: mockLink,
        title,
        department
      }
    });
  }

  try {
    // Generate secure interview ID, link, and access code
    const newRand = Math.random().toString(36).substring(2, 15);
    const newInterviewLink = `${process.env.IX_FRONTEND_URL || 'http://localhost:5173'}/#/interview/${newRand}`;
    const newAccessCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    await pgQuery(
      `INSERT INTO interviews (
        id, recruiter_uid, team_id, title, description, department, employment_type,
        experience, skills, education, deadline, num_questions, difficulty, strictness,
        manual_questions, custom_fields, candidate_emails, candidate_data,
        interview_link, access_code, is_mock
      ) VALUES (
        $1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
        '[]'::jsonb,'[]'::jsonb,$14::jsonb,'[]'::jsonb,$15,$16,false
      )`,
      [
        newRand,
        recruiterUID,
        title,
        description,
        department,
        employmentType,
        Number(experience),
        skills,
        education,
        deadline,
        Number(numQuestions),
        difficulty,
        strictness,
        JSON.stringify(candidateEmails || []),
        newInterviewLink,
        newAccessCode,
      ]
    );

    console.log(`[REST API] New Job created in Postgres: ${title} (Access Code: ${newAccessCode})`);

    res.status(201).json({
      success: true,
      message: "Job description received and interview successfully scheduled inside InterviewXpert!",
      data: {
        interviewId: newRand,
        accessCode: newAccessCode,
        interviewLink: newInterviewLink,
        title,
        department
      }
    });

  } catch (error) {
    console.error("Error creating job via REST API:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error saving the job description.",
      details: error.message
    });
  }
});

/**
 * ── 2. SEND COMPLETED REPORT TO OTHER DATABASE ──
 * Endpoint: POST /api/reports/dispatch
 * Description: Internally triggered (or externally requested) to send a candidate's evaluation report
 * to a pre-configured third-party API or database.
 */
app.post('/api/reports/dispatch', authenticateApiKey, async (req, res) => {
  const { interviewId, submissionId, webhookUrl } = req.body;

  if (!interviewId || !submissionId || !webhookUrl) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: 'interviewId', 'submissionId', and 'webhookUrl' must be provided."
    });
  }

  if (!dbReady()) {
    return res.status(503).json({
      success: false,
      error: "PostgreSQL database connection is currently unavailable."
    });
  }

  try {
    // 1. Fetch Candidate Submission Data from Postgres
    const attemptRes = await pgQuery(
      `SELECT * FROM interview_attempts WHERE interview_id = $1 AND id = $2 LIMIT 1`,
      [interviewId, submissionId]
    );

    if (!attemptRes.rows[0]) {
      return res.status(404).json({
        success: false,
        error: `Submission with ID ${submissionId} not found under Interview ID ${interviewId}.`
      });
    }

    const row = attemptRes.rows[0];
    const reportData = {
      id: row.id,
      interviewId: row.interview_id,
      recruiterUID: row.recruiter_uid,
      status: row.status,
      score: row.score,
      feedback: row.feedback,
      questions: row.questions,
      answers: row.answers,
      videoURLs: row.video_urls,
      transcriptTexts: row.transcript_texts,
      candidateInfo: row.candidate_info,
      submittedAt: row.submitted_at,
      ...(row.raw || {}),
    };

    const submissionData = reportData;

    // 2. Format Payload for External Database Ingestion
    const payload = {
      event: "interview.completed",
      timestamp: new Date().toISOString(),
      interviewId,
      submissionId,
      candidate: {
        name: submissionData.candidateInfo?.name || 'N/A',
        email: submissionData.candidateInfo?.email || 'N/A',
        phone: submissionData.candidateInfo?.phone || 'N/A',
        experience: submissionData.candidateInfo?.experience || 'N/A'
      },
      evaluation: {
        score: submissionData.score || 0,
        feedbackSummary: submissionData.feedback || "No feedback generated.",
        questionsAsked: submissionData.questions || [],
        transcripts: submissionData.transcriptTexts || [],
        videoURLs: submissionData.videoURLs || []
      }
    };

    console.log(`[REST API] Dispatching candidate evaluation report to external DB: ${webhookUrl}`);

    // 3. POST payload to other database
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.IX_OUTWARD_WEBHOOK_SECRET || 'ix_webhook_secret'}`
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`External database rejected webhook: ${response.status} - ${responseText}`);
    }

    res.status(200).json({
      success: true,
      message: "Candidate report successfully dispatched and saved to the external database!",
      externalResponseCode: response.status
    });

  } catch (error) {
    console.error("Error dispatching evaluation report to external database:", error);
    res.status(500).json({
      success: false,
      error: "Failed to forward report to external database.",
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const db = dbReady() ? await pingDb() : { ok: false, reason: 'not_configured' };
  res.json({
    status: "healthy",
    service: "InterviewXpert REST Integration API",
    authBridge: "/auth/health",
    dataApi: "/api/db/health",
    postgres: db,
  });
});

export default app;
