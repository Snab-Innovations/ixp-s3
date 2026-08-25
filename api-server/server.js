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
 * AI / Rule-based prediction for Industry Sector & Role Category
 */
function predictSectorAndRole(title = '', description = '', skills = [], company = '') {
  const text = `${title} ${description} ${Array.isArray(skills) ? skills.join(' ') : skills} ${company}`.toLowerCase();

  if (text.includes('electrical') || text.includes('mep') || text.includes('switchgear') || text.includes('revit') || text.includes('autocad') || text.includes('cad')) {
    return {
      industrySector: 'MEP Consultant',
      roleCategory: 'Design Engineer - Electrical',
      alternativeSectors: ['Electrical & Electronics', 'Engineering Services', 'Building Systems'],
      alternativeCategories: ['Design Engineer - Electrical', 'Electrical Engineer', 'AutoCAD & Revit Specialist', 'MEP Project Engineer']
    };
  }
  if (text.includes('mechanical') || text.includes('hvac') || text.includes('piping') || text.includes('solidworks')) {
    return {
      industrySector: 'Mechanical & Heavy Engineering',
      roleCategory: 'Design Engineer - Mechanical',
      alternativeSectors: ['MEP Consultant', 'Automotive & Industrial Manufacturing'],
      alternativeCategories: ['Design Engineer - Mechanical', 'HVAC Engineer', 'Piping Specialist']
    };
  }
  if (text.includes('software') || text.includes('developer') || text.includes('full stack') || text.includes('frontend') || text.includes('backend') || text.includes('react') || text.includes('python')) {
    return {
      industrySector: 'Information Technology & Software Services',
      roleCategory: 'Software Development & Engineering',
      alternativeSectors: ['SaaS & Internet Services', 'IT Consulting'],
      alternativeCategories: ['Full Stack Developer', 'Backend Engineer', 'Frontend Web Developer', 'Software Architect']
    };
  }
  if (text.includes('civil') || text.includes('construction') || text.includes('site engineer') || text.includes('structural')) {
    return {
      industrySector: 'Construction & Real Estate Development',
      roleCategory: 'Site & Civil Engineering',
      alternativeSectors: ['Infrastructure & Heavy Construction', 'Engineering Consultancy'],
      alternativeCategories: ['Site Engineer', 'Structural Design Engineer', 'Civil Project Manager']
    };
  }
  if (text.includes('hr') || text.includes('human resource') || text.includes('recruiter') || text.includes('talent')) {
    return {
      industrySector: 'Human Resources & Recruitment',
      roleCategory: 'Talent Acquisition & HR Operations',
      alternativeSectors: ['Corporate Staffing', 'Consulting & Advisory'],
      alternativeCategories: ['HR Executive / Generalist', 'Technical Recruiter', 'Talent Acquisition Specialist']
    };
  }
  if (text.includes('account') || text.includes('finance') || text.includes('tally') || text.includes('audit') || text.includes('tax')) {
    return {
      industrySector: 'Accounting & Financial Services',
      roleCategory: 'Finance & Accounting Operations',
      alternativeSectors: ['Banking & Financial Services', 'Corporate Audit'],
      alternativeCategories: ['Accounts Executive', 'Senior Accountant', 'Taxation Specialist']
    };
  }
  return {
    industrySector: 'Engineering & Industrial Operations',
    roleCategory: 'Technical Engineering Specialist',
    alternativeSectors: ['Industrial Services', 'Corporate Operations'],
    alternativeCategories: ['Technical Specialist', 'Operations Engineer', 'Project Coordinator']
  };
}

/**
 * ── 1. RECEIVE JOB DESCRIPTION FROM ANY OTHER DATABASE ──
 * Endpoint: POST /api/jobs/receive
 * Description: Call this from any external DB or system to create a new AI Interview Job inside InterviewXpert.
 */
app.post('/api/jobs/receive', authenticateApiKey, async (req, res) => {
  const payload = req.body || {};
  const recruiterUID = payload.recruiterUID || "pbbMTYxPDaf7jhc9uPEZ34CcWfz2";
  const title = (payload.title || "").trim();
  const description = payload.description || "";
  const company = (payload.company || payload.companyName || "").trim();
  const companyName = company;
  const skills = Array.isArray(payload.skills) ? payload.skills : (typeof payload.skills === 'string' ? payload.skills.split(',').map(s => s.trim()).filter(Boolean) : []);

  // AI Prediction for missing or generic Industry Sector / Role Category
  const rawIndustry = (payload.industryName || payload.sector || "").trim();
  const rawRole = (payload.roleName || payload.roleCategory || "").trim();
  const isGenericIndustry = !rawIndustry || ['general', 'engineering', 'other', 'unknown'].includes(rawIndustry.toLowerCase());
  const isGenericRole = !rawRole || ['general', 'engineering', 'other', 'unknown'].includes(rawRole.toLowerCase());

  const prediction = predictSectorAndRole(title, description, skills, company);

  const industryName = isGenericIndustry ? prediction.industrySector : rawIndustry;
  const roleName = isGenericRole ? prediction.roleCategory : rawRole;
  const sectors = Array.from(new Set([industryName, ...(payload.sectors || []), ...prediction.alternativeSectors]));
  const categories = Array.from(new Set([roleName, ...(payload.categories || []), ...(payload.roleCategories || []), ...prediction.alternativeCategories]));

  const department = payload.department || payload.category || roleName || industryName || "General";
  const category = department;
  const employmentType = payload.employmentType || "Full-time";
  const location = (payload.location || payload.city || "").trim();
  const city = (payload.city || "").trim();
  const minExperience = payload.minExperience !== undefined ? Number(payload.minExperience) : 0;
  const maxExperience = payload.maxExperience !== undefined ? Number(payload.maxExperience) : minExperience;
  const experience = payload.experience ? String(payload.experience).trim() : (maxExperience > minExperience ? `${minExperience} - ${maxExperience} Years` : `${minExperience} Years`);
  const salaryRange = payload.salaryRange || payload.salary || "";
  const salary = salaryRange;
  const education = Array.isArray(payload.education) ? payload.education : (typeof payload.education === 'string' ? payload.education.split(',').map(e => e.trim()).filter(Boolean) : (payload.education ? [String(payload.education)] : []));
  const qualifications = Array.isArray(education) ? education.join(', ') : String(education);
  const genderRequirement = payload.genderRequirement || payload.gender || "Any";
  const strictGenderMatch = Boolean(payload.strictGenderMatch);
  const jobNo = payload.jobNo ? String(payload.jobNo).trim() : "";
  const accessCode = jobNo || payload.accessCode || Math.random().toString(36).substring(2, 8).toUpperCase();
  const status = payload.status || "Active";
  const entryBy = payload.entryBy || payload.recruiterName || "";
  const deadline = (payload.deadlineDate || payload.deadline || payload.applyDeadline || payload.interviewDeadline || payload.endDate || payload.interviewDates || "").toString().trim();
  const deadlineDate = deadline;
  const numQuestions = Number(payload.numQuestions || 5);
  const difficulty = payload.difficulty || "Medium";
  const strictness = payload.strictness || "Medium";
  const candidateEmails = Array.isArray(payload.candidateEmails) ? payload.candidateEmails : [];

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
    
    return res.status(201).json({
      success: true,
      message: "Job description received and interview successfully scheduled inside InterviewXpert! (MOCK MODE: Firestore key missing)",
      data: {
        interviewId: mockRand,
        jobNo,
        accessCode,
        interviewLink: mockLink,
        title,
        recruiterUID,
        company,
        location,
        status,
        deadline,
        deadlineDate
      }
    });
  }

  try {
    const newRand = Math.random().toString(36).substring(2, 15);
    const newInterviewLink = `${process.env.IX_FRONTEND_URL || 'http://localhost:5173'}/#/interview/${newRand}`;

    const jobData = {
      title,
      description,
      company,
      companyName,
      industryName,
      sector: industryName,
      sectors,
      roleName,
      roleCategory: roleName,
      categories,
      roleCategories: categories,
      department,
      category,
      employmentType,
      minExperience,
      maxExperience,
      experience,
      location,
      city,
      salaryRange,
      salary,
      skills,
      education: qualifications,
      qualifications,
      genderRequirement,
      strictGenderMatch,
      jobNo,
      accessCode,
      status,
      entryBy,
      recruiterName: entryBy,
      recruiterUID,
      deadline,
      deadlineDate,
      applyDeadline: deadline,
      numQuestions,
      difficulty,
      strictness,
      manualQuestions: [],
      customFields: [],
      candidateEmails,
      interviewLink: newInterviewLink,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isMock: false
    };

    // Save to both collections ('interviews' and 'jobs') for complete database sync
    await db.collection('interviews').doc(newRand).set(jobData);
    await db.collection('jobs').doc(newRand).set(jobData);

    console.log(`[REST API] New Job created from external DB: ${title} (Access Code: ${accessCode}, recruiterUID: ${recruiterUID})`);

    res.status(201).json({
      success: true,
      message: "Job description received and interview successfully scheduled inside InterviewXpert!",
      data: {
        interviewId: newRand,
        jobNo,
        accessCode,
        interviewLink: newInterviewLink,
        title,
        recruiterUID,
        company,
        location,
        status
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
 * ── UPDATE EXISTING JOB BY ID OR JOB NO ──
 * Endpoints: POST /api/jobs/update or PUT /api/jobs/:id
 * Description: Updates job/interview details in Firestore by ID, jobNo, or accessCode.
 */
app.post('/api/jobs/update', authenticateApiKey, async (req, res) => {
  const payload = req.body || {};
  const targetId = payload.id || payload.jobId || payload.jobNo || payload.accessCode;

  if (!targetId) {
    return res.status(400).json({ success: false, error: "Missing 'id', 'jobId', or 'jobNo' in request body." });
  }

  try {
    const recruiterUID = payload.recruiterUID || "pbbMTYxPDaf7jhc9uPEZ34CcWfz2";
    const title = (payload.title || "").trim();
    const description = payload.description || "";
    const company = (payload.company || payload.companyName || "").trim();
    const companyName = company;
    const industryName = (payload.industryName || payload.sector || "").trim();
    const roleName = (payload.roleName || payload.roleCategory || "").trim();
    const department = payload.department || payload.category || roleName || industryName || "General";
    const category = department;
    const employmentType = payload.employmentType || "Full-time";
    const location = (payload.location || payload.city || "").trim();
    const city = (payload.city || "").trim();
    const minExperience = payload.minExperience !== undefined ? Number(payload.minExperience) : 0;
    const maxExperience = payload.maxExperience !== undefined ? Number(payload.maxExperience) : minExperience;
    const experience = payload.experience ? String(payload.experience).trim() : (maxExperience > minExperience ? `${minExperience} - ${maxExperience} Years` : `${minExperience} Years`);
    const salaryRange = payload.salaryRange || payload.salary || "";
    const salary = salaryRange;
    const skills = Array.isArray(payload.skills) ? payload.skills : (typeof payload.skills === 'string' ? payload.skills.split(',').map(s => s.trim()).filter(Boolean) : []);
    const education = Array.isArray(payload.education) ? payload.education : (typeof payload.education === 'string' ? payload.education.split(',').map(e => e.trim()).filter(Boolean) : (payload.education ? [String(payload.education)] : []));
    const qualifications = Array.isArray(education) ? education.join(', ') : String(education);
    const genderRequirement = payload.genderRequirement || payload.gender || "Any";
    const strictGenderMatch = Boolean(payload.strictGenderMatch);
    const jobNo = payload.jobNo ? String(payload.jobNo).trim() : String(targetId).trim();
    const accessCode = jobNo || payload.accessCode || Math.random().toString(36).substring(2, 8).toUpperCase();
    const status = payload.status || "Active";
    const entryBy = payload.entryBy || payload.recruiterName || "";

    const updatedJobData = {
      title,
      description,
      company,
      companyName,
      industryName,
      sector: industryName,
      roleName,
      roleCategory: roleName,
      department,
      category,
      employmentType,
      minExperience,
      maxExperience,
      experience,
      location,
      city,
      salaryRange,
      salary,
      skills,
      education: qualifications,
      qualifications,
      genderRequirement,
      strictGenderMatch,
      jobNo,
      accessCode,
      status,
      entryBy,
      recruiterName: entryBy,
      recruiterUID,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (!db) {
      return res.status(200).json({ success: true, message: "Job updated (MOCK MODE).", data: updatedJobData });
    }

    let docRef = db.collection('jobs').doc(String(targetId));
    let intRef = db.collection('interviews').doc(String(targetId));

    const jobSnap = await docRef.get();
    if (!jobSnap.exists) {
      const q = await db.collection('jobs').where('jobNo', '==', String(targetId)).get().catch(() => ({ empty: true }));
      if (!q.empty) {
        docRef = q.docs[0].ref;
        intRef = db.collection('interviews').doc(q.docs[0].id);
      }
    }

    await Promise.all([
      docRef.set(updatedJobData, { merge: true }),
      intRef.set(updatedJobData, { merge: true })
    ]);

    console.log(`[REST API] Job updated successfully: ${targetId} (Status: ${status})`);
    const deadline = (payload.deadlineDate || payload.deadline || payload.applyDeadline || '').toString().trim();
    const updatedJobId = String(docRef.id || targetId);
    const updatedJobNo = jobNo || updatedJobId;
    const origin = process.env.IX_FRONTEND_URL || 'https://dsource.interviewxpert.in';
    const interviewLink = `${origin}/#/interview/${updatedJobId}`;

    return res.status(200).json({
      success: true,
      message: 'Job updated successfully inside InterviewXpert!',
      data: {
        id: updatedJobId,
        interviewId: updatedJobId,
        jobNo: updatedJobNo,
        accessCode: accessCode || updatedJobNo,
        interviewLink,
        title,
        recruiterUID,
        company,
        location,
        status,
        deadline
      }
    });
  } catch (error) {
    console.error("Error updating job via API:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error updating job.",
      details: error.message
    });
  }
});

app.put('/api/jobs/:id', authenticateApiKey, async (req, res) => {
  req.body = { ...req.body, id: req.params.id };
  const targetId = req.params.id;

  try {
    const recruiterUID = req.body.recruiterUID || "pbbMTYxPDaf7jhc9uPEZ34CcWfz2";
    const title = (req.body.title || "").trim();
    const description = req.body.description || "";
    const company = (req.body.company || req.body.companyName || "").trim();
    const companyName = company;
    const industryName = (req.body.industryName || req.body.sector || "").trim();
    const roleName = (req.body.roleName || req.body.roleCategory || "").trim();
    const department = req.body.department || req.body.category || roleName || industryName || "General";
    const category = department;
    const employmentType = req.body.employmentType || "Full-time";
    const location = (req.body.location || req.body.city || "").trim();
    const city = (req.body.city || "").trim();
    const minExperience = req.body.minExperience !== undefined ? Number(req.body.minExperience) : 0;
    const maxExperience = req.body.maxExperience !== undefined ? Number(req.body.maxExperience) : minExperience;
    const experience = req.body.experience ? String(req.body.experience).trim() : (maxExperience > minExperience ? `${minExperience} - ${maxExperience} Years` : `${minExperience} Years`);
    const salaryRange = req.body.salaryRange || req.body.salary || "";
    const salary = salaryRange;
    const skills = Array.isArray(req.body.skills) ? req.body.skills : (typeof req.body.skills === 'string' ? req.body.skills.split(',').map(s => s.trim()).filter(Boolean) : []);
    const education = Array.isArray(req.body.education) ? req.body.education : (typeof req.body.education === 'string' ? req.body.education.split(',').map(e => e.trim()).filter(Boolean) : (req.body.education ? [String(req.body.education)] : []));
    const qualifications = Array.isArray(education) ? education.join(', ') : String(education);
    const genderRequirement = req.body.genderRequirement || req.body.gender || "Any";
    const strictGenderMatch = Boolean(req.body.strictGenderMatch);
    const jobNo = req.body.jobNo ? String(req.body.jobNo).trim() : String(targetId).trim();
    const accessCode = jobNo || req.body.accessCode || Math.random().toString(36).substring(2, 8).toUpperCase();
    const status = req.body.status || "Active";
    const entryBy = req.body.entryBy || req.body.recruiterName || "";

    const updatedJobData = {
      title,
      description,
      company,
      companyName,
      industryName,
      sector: industryName,
      roleName,
      roleCategory: roleName,
      department,
      category,
      employmentType,
      minExperience,
      maxExperience,
      experience,
      location,
      city,
      salaryRange,
      salary,
      skills,
      education: qualifications,
      qualifications,
      genderRequirement,
      strictGenderMatch,
      jobNo,
      accessCode,
      status,
      entryBy,
      recruiterName: entryBy,
      recruiterUID,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (!db) {
      return res.status(200).json({ success: true, message: "Job updated (MOCK MODE).", data: updatedJobData });
    }

    let docRef = db.collection('jobs').doc(String(targetId));
    let intRef = db.collection('interviews').doc(String(targetId));

    const jobSnap = await docRef.get();
    if (!jobSnap.exists) {
      const q = await db.collection('jobs').where('jobNo', '==', String(targetId)).get().catch(() => ({ empty: true }));
      if (!q.empty) {
        docRef = q.docs[0].ref;
        intRef = db.collection('interviews').doc(q.docs[0].id);
      }
    }

    await Promise.all([
      docRef.set(updatedJobData, { merge: true }),
      intRef.set(updatedJobData, { merge: true })
    ]);

    return res.status(200).json({
      success: true,
      message: `Job '${targetId}' updated successfully in Firestore.`,
      data: updatedJobData
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Internal server error updating job.",
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

// Amazon SES Send Email Endpoint (Server-Side)
app.post('/api/send-email', async (req, res) => {
  try {
    const { recipientEmail, recipientName, subject, htmlContent } = req.body;
    if (!recipientEmail || !recipientEmail.includes('@')) {
      return res.status(400).json({ success: false, error: 'Valid recipientEmail is required.' });
    }
    if (!subject || !htmlContent) {
      return res.status(400).json({ success: false, error: 'Subject and htmlContent are required.' });
    }

    const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
    const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || process.env.VITE_AWS_ACCESS_KEY_ID || '').replace(/['"]/g, '').trim();
    const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || process.env.VITE_AWS_SECRET_ACCESS_KEY || '').replace(/['"]/g, '').trim();
    const region = process.env.AWS_SES_REGION || process.env.AWS_REGION || 'us-east-1';
    const fromEmail = process.env.SES_FROM_EMAIL || 'info@interviewxpert.in';
    const senderName = process.env.SES_SENDER_NAME || 'InterviewXpert';

    if (!accessKeyId || !secretAccessKey) {
      return res.status(500).json({
        success: false,
        error: 'AWS SES credentials not configured on the server.'
      });
    }

    const sesClient = new SESv2Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const formattedSender = senderName ? `${senderName} <${fromEmail}>` : fromEmail;

    const command = new SendEmailCommand({
      FromEmailAddress: formattedSender,
      Destination: {
        ToAddresses: [recipientEmail.trim()],
      },
      Content: {
        Simple: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: htmlContent,
              Charset: 'UTF-8',
            },
          },
        },
      },
    });

    const response = await sesClient.send(command);
    console.log(`[REST API /api/send-email] Sent to ${recipientEmail}, MessageId: ${response.MessageId}`);

    return res.status(200).json({
      success: true,
      messageId: response.MessageId
    });
  } catch (error) {
    console.error('Error in /api/send-email:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Amazon SES email delivery failed on server.'
    });
  }
});

// Amazon Polly Text-to-Speech Endpoint (Aditi Indian Bilingual Voice)
app.post('/api/tts-polly', async (req, res) => {
  try {
    const { text, lang = 'hi-IN' } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Parameter text is required.' });
    }

    const { PollyClient, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly');
    const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || process.env.VITE_AWS_ACCESS_KEY_ID || process.env.VITE_AWS_S3_ACCESS_KEY_ID || '').replace(/['"]/g, '').trim();
    const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || process.env.VITE_AWS_SECRET_ACCESS_KEY || process.env.VITE_AWS_S3_SECRET_ACCESS_KEY || '').replace(/['"]/g, '').trim();
    const region = process.env.AWS_POLLY_REGION || process.env.AWS_REGION || process.env.AWS_S3_REGION || process.env.VITE_AWS_S3_REGION || 'ap-south-1';

    if (!accessKeyId || !secretAccessKey) {
      return res.status(500).json({
        success: false,
        error: 'AWS credentials not configured on server.'
      });
    }

    const pollyClient = new PollyClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const isHindi = /[\u0900-\u097F]/.test(text) || (lang || '').toLowerCase().startsWith('hi') || (lang || '').toLowerCase().startsWith('mr');
    const languageCode = isHindi ? 'hi-IN' : 'en-IN';

    const command = new SynthesizeSpeechCommand({
      Engine: 'standard',
      LanguageCode: languageCode,
      OutputFormat: 'mp3',
      Text: text.trim(),
      VoiceId: 'Aditi',
    });

    const response = await pollyClient.send(command);

    if (!response.AudioStream) {
      return res.status(500).json({ success: false, error: 'AWS Polly returned empty audio stream.' });
    }

    const audioBytes = await response.AudioStream.transformToByteArray();
    const audioBuffer = Buffer.from(audioBytes);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(audioBuffer);
  } catch (error) {
    console.error('Error in /api/tts-polly:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'AWS Polly speech synthesis failed on server.'
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
