/**
 * Vercel Serverless API: Complete Jobs REST API Suite
 * 
 * Supported Endpoints & Actions:
 * 1. POST   /api/jobs          - Create new job or update status
 * 2. PUT    /api/jobs          - Update existing job fields by jobNo / id
 * 3. PATCH  /api/jobs          - Partial update (e.g. status: "Inactive")
 * 4. GET    /api/jobs          - List all jobs or fetch single job (?jobNo=... or ?id=...)
 * 5. DELETE /api/jobs          - Delete job by jobNo or id
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  limit 
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyDBo-Hbvw3MJdnSBx-cZq_hn_yUSSBduiE",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "dsource-main-db.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "dsource-main-db",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "dsource-main-db.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "555747926046",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:555747926046:web:0c5217a1834ce4db610e0f",
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || "G-RMZBWEWJW9"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

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

const inMemoryJobs = new Map();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT,PATCH,DELETE');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ── Mandatory Bearer Authentication ──
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  const apiKey = authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7).trim() 
    : (req.query?.apiKey || req.headers['x-api-key'] || '');

  const expectedKey = (process.env.JOBFETCHED_SECRET_KEY || process.env.IX_API_KEY || '').trim();

  if (!apiKey || !expectedKey || apiKey !== expectedKey) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized: Invalid or missing API Key. Please provide a valid 'Authorization: Bearer <API_KEY>' header."
    });
  }

  const queryParams = req.query || {};
  const urlPath = req.url ? req.url.split('?')[0] : '';
  const urlSlug = urlPath.startsWith('/api/jobs/') ? decodeURIComponent(urlPath.replace('/api/jobs/', '')).trim() : '';
  const targetJobNo = (req.body?.jobNo || queryParams.jobNo || queryParams.jobId || urlSlug || '').toString().trim();
  const targetId = (req.body?.id || req.body?.interviewId || queryParams.id || queryParams.interviewId || urlSlug || '').toString().trim();

  // ── 1. GET: List All Jobs or Fetch Single Job ──
  if (req.method === 'GET') {
    try {
      // Single Job Fetch
      if (targetId || targetJobNo) {
        if (targetId && inMemoryJobs.has(targetId)) {
          return res.status(200).json({ success: true, data: inMemoryJobs.get(targetId) });
        }
        for (const job of inMemoryJobs.values()) {
          if (targetJobNo && String(job.jobNo) === targetJobNo) {
            return res.status(200).json({ success: true, data: job });
          }
        }

        if (targetId) {
          const snap = await getDoc(doc(db, 'interviews', targetId));
          if (snap.exists()) {
            return res.status(200).json({ success: true, data: { id: snap.id, ...snap.data() } });
          }
        }
        if (targetJobNo) {
          const q = query(collection(db, 'interviews'), where('jobNo', '==', targetJobNo), limit(1));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const d = snap.docs[0];
            return res.status(200).json({ success: true, data: { id: d.id, ...d.data() } });
          }
        }
      }

      // List Jobs (with optional ?status= filter)
      const q = query(collection(db, 'interviews'), limit(100));
      const snap = await getDocs(q).catch(() => null);
      const dbJobs = snap ? snap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
      
      const mergedMap = new Map();
      for (const j of dbJobs) {
        mergedMap.set(j.id, j);
      }
      for (const [id, j] of inMemoryJobs.entries()) {
        mergedMap.set(id, j);
      }

      let allJobs = Array.from(mergedMap.values());
      if (queryParams.status) {
        const filterStatus = queryParams.status.toLowerCase();
        allJobs = allJobs.filter(j => (j.status || 'active').toLowerCase() === filterStatus);
      }

      return res.status(200).json(allJobs);
    } catch (err) {
      console.error('Error in GET /api/jobs:', err);
      return res.status(200).json(Array.from(inMemoryJobs.values()));
    }
  }

  // ── 2. DELETE: Delete a Job by jobNo or ID ──
  if (req.method === 'DELETE') {
    if (!targetJobNo && !targetId) {
      return res.status(400).json({ success: false, error: 'Please provide jobNo or id to delete.' });
    }

    // Remove from in-memory cache
    if (targetId) inMemoryJobs.delete(targetId);
    for (const [id, job] of inMemoryJobs.entries()) {
      if (targetJobNo && String(job.jobNo) === targetJobNo) {
        inMemoryJobs.delete(id);
      }
    }

    // Remove from Firestore collections
    try {
      if (targetId) {
        await Promise.all([
          deleteDoc(doc(db, 'interviews', targetId)).catch(() => null),
          deleteDoc(doc(db, 'jobs', targetId)).catch(() => null)
        ]);
      }
      if (targetJobNo) {
        for (const col of ['interviews', 'jobs']) {
          const q = query(collection(db, col), where('jobNo', '==', targetJobNo));
          const snap = await getDocs(q);
          for (const d of snap.docs) {
            await deleteDoc(doc(db, col, d.id)).catch(() => null);
          }
        }
      }
    } catch (delErr) {
      console.warn('Firestore delete error:', delErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Job ${targetJobNo || targetId} successfully deleted.`
    });
  }

  // ── 3. PUT / PATCH / POST: Update Job or Create Job ──
  try {
    const payload = req.body || {};
    const isExplicitUpdate = req.method === 'PUT' || req.method === 'PATCH';
    const isDeactivateAction = payload.action === 'deactivate' || payload.action === 'close';
    const hasRequiredCreationFields = Boolean(payload.title && payload.description);
    const isPartialUpdate = isExplicitUpdate || isDeactivateAction || (!hasRequiredCreationFields && (targetJobNo || targetId));

    // UPDATE / DEACTIVATE BRANCH
    if ((targetJobNo || targetId) && isPartialUpdate && !hasRequiredCreationFields) {
      const newStatus = payload.status || (payload.action === 'deactivate' ? 'Inactive' : 'Active');
      const updatedTimestamp = new Date().toISOString();
      const updateFields = {
        ...payload,
        status: newStatus,
        updatedAt: updatedTimestamp
      };

      // Update in-memory
      for (const [id, job] of inMemoryJobs.entries()) {
        if ((targetJobNo && String(job.jobNo) === targetJobNo) || (targetId && id === targetId)) {
          Object.assign(job, updateFields);
        }
      }

      // Update Firestore
      try {
        const collectionsToSearch = ['interviews', 'jobs'];
        for (const colName of collectionsToSearch) {
          if (targetId) {
            await setDoc(doc(db, colName, targetId), updateFields, { merge: true });
          }
          if (targetJobNo) {
            const q = query(collection(db, colName), where('jobNo', '==', targetJobNo));
            const snap = await getDocs(q);
            for (const d of snap.docs) {
              await setDoc(doc(db, colName, d.id), updateFields, { merge: true });
            }
          }
        }
      } catch (dbErr) {
        console.warn('[API /api/jobs] Firestore update warning:', dbErr.message);
      }

      return res.status(200).json({
        success: true,
        message: `Job ${targetJobNo || targetId} successfully updated to status: "${newStatus}"`,
        data: {
          jobNo: targetJobNo,
          id: targetId,
          status: newStatus,
          updatedAt: updatedTimestamp
        }
      });
    }

    // CREATE NEW JOB BRANCH
    const title = (payload.title || '').trim();
    const description = payload.description || '';
    const recruiterUID = payload.recruiterUID || 'pbbMTYxPDaf7jhc9uPEZ34CcWfz2';

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: 'title' and 'description' are mandatory to create a new job. To update an existing job, provide 'jobNo' or 'id' with 'status'."
      });
    }

    const company = (payload.company || payload.companyName || 'InterviewXpert Partner').trim();
    const skills = Array.isArray(payload.skills)
      ? payload.skills
      : typeof payload.skills === 'string'
      ? payload.skills.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    const prediction = predictSectorAndRole(title, description, skills, company);

    const rawIndustry = (payload.industryName || payload.sectorName || payload.sector || '').trim();
    const rawRole = (payload.roleName || payload.roleCategoryName || payload.roleCategory || '').trim();
    const isGenericIndustry = !rawIndustry || ['general', 'engineering', 'other', 'unknown'].includes(rawIndustry.toLowerCase());
    const isGenericRole = !rawRole || ['general', 'engineering', 'other', 'unknown'].includes(rawRole.toLowerCase());

    const industryName = isGenericIndustry ? prediction.industrySector : rawIndustry;
    const roleName = isGenericRole ? prediction.roleCategory : rawRole;
    const sectors = Array.from(new Set([industryName, ...(payload.sectors || []), ...prediction.alternativeSectors]));
    const categories = Array.from(new Set([roleName, ...(payload.categories || []), ...(payload.roleCategories || []), ...prediction.alternativeCategories]));

    const department = payload.department || payload.category || roleName || industryName || 'General';
    const location = (payload.location || payload.city || '').trim();
    const city = (payload.city || location || '').trim();
    const minExperience = payload.minExperience !== undefined ? Number(payload.minExperience) : 0;
    const maxExperience = payload.maxExperience !== undefined ? Number(payload.maxExperience) : minExperience;
    const experience = payload.experience
      ? String(payload.experience).trim()
      : maxExperience > minExperience
      ? `${minExperience} - ${maxExperience} Years`
      : `${minExperience} Years`;

    const salaryRange = payload.salaryRange || payload.salary || '';
    const employmentType = payload.employmentType || 'Full-Time';
    const education = Array.isArray(payload.education)
      ? payload.education
      : typeof payload.education === 'string'
      ? payload.education.split(',').map((e) => e.trim()).filter(Boolean)
      : [];
    const qualifications = education.join(', ');
    const genderRequirement = payload.genderRequirement || payload.gender || 'Any';
    const strictGenderMatch = payload.strictGenderMatch === true || payload.strictGenderMatch === 'true';
    const jobNo = payload.jobNo ? String(payload.jobNo).trim() : '';
    const jobId = jobNo || payload.id || payload.interviewId || Math.random().toString(36).substring(2, 15);
    const accessCode = jobNo || payload.accessCode || Math.random().toString(36).substring(2, 8).toUpperCase();
    const entryBy = payload.entryBy || payload.recruiterName || '';
    const deadline = (payload.deadlineDate || payload.deadline || payload.applyDeadline || '').toString().trim();

    const origin = req.headers['origin'] || (req.headers['host'] ? `https://${req.headers['host']}` : 'https://interviewxpert.in');
    const interviewLink = `${origin}/#/interview/${jobId}`;

    const jobData = {
      id: jobId,
      interviewId: jobId,
      title,
      description,
      company,
      companyName: company,
      industryName,
      sector: industryName,
      sectors,
      roleName,
      roleCategory: roleName,
      categories,
      roleCategories: categories,
      department,
      category: department,
      employmentType,
      minExperience,
      maxExperience,
      experience,
      location,
      city,
      salaryRange,
      salary: salaryRange,
      skills,
      education: qualifications,
      qualifications,
      genderRequirement,
      strictGenderMatch,
      jobNo: jobNo || jobId,
      accessCode,
      status: payload.status || 'Active',
      entryBy,
      recruiterName: entryBy,
      recruiterUID,
      deadline,
      deadlineDate: deadline,
      interviewLink,
      createdAt: new Date().toISOString(),
      numQuestions: Number(payload.numQuestions || 5),
      difficulty: payload.difficulty || 'Medium',
      strictness: payload.strictness || 'Medium',
      candidateEmails: Array.isArray(payload.candidateEmails) ? payload.candidateEmails : []
    };

    // Cache in memory
    inMemoryJobs.set(jobId, jobData);

    // Save to Firestore collections 'interviews' and 'jobs' using the jobId (matching jobNo)
    try {
      await Promise.all([
        setDoc(doc(db, 'interviews', jobId), jobData, { merge: true }),
        setDoc(doc(db, 'jobs', jobId), jobData, { merge: true })
      ]);
    } catch (firestoreErr) {
      console.warn('[API /api/jobs] Firestore write note:', firestoreErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Job description received and interview successfully scheduled inside InterviewXpert!',
      data: {
        id: jobId,
        interviewId: jobId,
        jobNo: jobNo || jobId,
        accessCode,
        interviewLink,
        title,
        recruiterUID,
        company,
        location,
        status: 'Active',
        deadline
      }
    });

  } catch (error) {
    console.error('Error in /api/jobs:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error'
    });
  }
}
