/**
 * InterviewXpert REST API Server
 * 
 * This server provides endpoints to:
 * 1. Receive Job Descriptions from external databases or Applicant Tracking Systems (ATS)
 * 2. Manage outward webhooks to dispatch candidate evaluation reports directly to external databases
 */

import express from 'express';
import cors from 'cors';
import admin from 'firebase-admin';
import fetch from 'node-fetch'; // Standard node fetch for webhook delivery
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK
// Make sure to set the environment variable FIREBASE_SERVICE_ACCOUNT_KEY or place serviceAccountKey.json in this directory
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || './serviceAccountKey.json';

try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("✅ Firebase Admin SDK initialized successfully.");
} catch (error) {
  console.warn("⚠️ Firebase service account key missing or invalid. Set FIREBASE_SERVICE_ACCOUNT_KEY env var or provide serviceAccountKey.json.");
  console.warn("⚠️ Firestore operations will fail until credentials are provided.");
}

let db = null;
try {
  if (admin.apps.length > 0) {
    db = admin.firestore();
  }
} catch (e) {
  console.warn("⚠️ Firestore database reference could not be loaded on boot.");
}

// Mock API Key database for validation (In production, load from a Firestore collection 'api_keys')
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

  if (!db) {
    console.warn("⚠️ Firestore connection unavailable. Returning mock response for testing/demo.");
    const mockRand = Math.random().toString(36).substring(2, 15);
    const mockLink = `http://localhost:3000/#/interview/${mockRand}`;
    const mockCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    return res.status(201).json({
      success: true,
      message: "Job description received and interview successfully scheduled inside InterviewXpert! (MOCK MODE: Firestore key missing)",
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

    const jobData = {
      title,
      description,
      department,
      employmentType,
      experience: Number(experience),
      skills,
      education,
      deadline,
      numQuestions: Number(numQuestions),
      difficulty,
      strictness,
      manualQuestions: [],
      customFields: [],
      candidateEmails,
      interviewLink: newInterviewLink,
      accessCode: newAccessCode,
      recruiterUID,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isMock: false
    };

    // Save to Firestore
    await db.collection('interviews').doc(newRand).set(jobData);

    console.log(`[REST API] New Job created from external DB: ${title} (Access Code: ${newAccessCode})`);

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
 * ── DELETE JOB BY ID OR JOB NO ──
 * Endpoints: DELETE /api/jobs/:id or POST /api/jobs/delete
 * Description: Deletes a job/interview from Firestore by ID, jobNo, or accessCode.
 */
app.delete('/api/jobs/:id', authenticateApiKey, async (req, res) => {
  const jobId = req.params.id;
  if (!jobId) {
    return res.status(400).json({ success: false, error: "Missing job ID parameter." });
  }

  try {
    if (!db) {
      return res.status(200).json({ success: true, message: "Job deleted (MOCK MODE)." });
    }

    await Promise.all([
      db.collection('jobs').doc(jobId).delete().catch(() => {}),
      db.collection('interviews').doc(jobId).delete().catch(() => {})
    ]);

    const [jobsByCode, interviewsByCode] = await Promise.all([
      db.collection('jobs').where('jobNo', '==', jobId).get().catch(() => ({ docs: [] })),
      db.collection('interviews').where('accessCode', '==', jobId).get().catch(() => ({ docs: [] }))
    ]);

    const deletePromises = [];
    jobsByCode.docs.forEach(docSnap => deletePromises.push(docSnap.ref.delete()));
    interviewsByCode.docs.forEach(docSnap => deletePromises.push(docSnap.ref.delete()));
    await Promise.all(deletePromises);

    console.log(`[REST API] Job deleted successfully: ${jobId}`);
    return res.status(200).json({
      success: true,
      message: `Job '${jobId}' deleted successfully from Firestore.`
    });
  } catch (error) {
    console.error("Error deleting job via API:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error deleting job.",
      details: error.message
    });
  }
});

app.post('/api/jobs/delete', authenticateApiKey, async (req, res) => {
  const { id, jobId, jobNo, accessCode } = req.body;
  const targetId = id || jobId || jobNo || accessCode;
  if (!targetId) {
    return res.status(400).json({ success: false, error: "Missing 'id', 'jobId', or 'jobNo' in request body." });
  }

  try {
    if (!db) {
      return res.status(200).json({ success: true, message: "Job deleted (MOCK MODE)." });
    }

    await Promise.all([
      db.collection('jobs').doc(targetId).delete().catch(() => {}),
      db.collection('interviews').doc(targetId).delete().catch(() => {})
    ]);

    const [jobsByCode, interviewsByCode] = await Promise.all([
      db.collection('jobs').where('jobNo', '==', targetId).get().catch(() => ({ docs: [] })),
      db.collection('interviews').where('accessCode', '==', targetId).get().catch(() => ({ docs: [] }))
    ]);

    const deletePromises = [];
    jobsByCode.docs.forEach(docSnap => deletePromises.push(docSnap.ref.delete()));
    interviewsByCode.docs.forEach(docSnap => deletePromises.push(docSnap.ref.delete()));
    await Promise.all(deletePromises);

    console.log(`[REST API] Job deleted successfully via POST /api/jobs/delete: ${targetId}`);
    return res.status(200).json({
      success: true,
      message: `Job '${targetId}' deleted successfully from Firestore.`
    });
  } catch (error) {
    console.error("Error deleting job via API:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error deleting job.",
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

  if (!db) {
    return res.status(503).json({
      success: false,
      error: "Firestore database connection is currently unavailable."
    });
  }

  try {
    // 1. Fetch Candidate Submission Data from Firestore
    const attemptSnap = await db.collection('interviews').doc(interviewId).collection('attempts').doc(submissionId).get();
    
    if (!attemptSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: `Submission with ID ${submissionId} not found under Interview ID ${interviewId}.`
      });
    }

    const submissionData = attemptSnap.data();

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
        transcripts: submissionData.transcripts || [],
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
app.get('/api/health', (req, res) => {
  res.json({ status: "healthy", service: "InterviewXpert REST Integration API" });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 REST API Integration Server running on port ${PORT}`);
});
