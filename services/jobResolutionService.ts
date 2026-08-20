import { db } from './firebase';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot, DocumentReference } from 'firebase/firestore';

export interface ResolvedJobData {
  id: string;
  docRef: DocumentReference;
  collectionName: 'jobs' | 'interviews';
  data: any;
}

/**
 * Normalizes job/interview document data so REST API created jobs and Recruiter Dashboard jobs
 * share consistent property names across the frontend application.
 */
import { resolveStrictListedCity } from '../data/maharashtraCities';

const formatStringList = (val: any): string => {
  if (!val) return '';
  if (Array.isArray(val)) return val.map(item => String(item).trim()).filter(Boolean).join(', ');
  if (typeof val === 'string') return val.trim();
  return String(val).trim();
};

const parseStringList = (val: any): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(item => String(item).trim()).filter(Boolean);
  if (typeof val === 'string') return val.split(',').map(item => item.trim()).filter(Boolean);
  return [String(val).trim()].filter(Boolean);
};

export interface SectorRolePrediction {
  industrySector: string;
  roleCategory: string;
  alternativeSectors: string[];
  alternativeCategories: string[];
}

/**
 * Predicts Industry Sector and Role Category based on Job Title, Description, Skills, and Company.
 * Ensures that if this data is not present in the incoming API payload, AI prediction populates it accurately.
 */
export function predictSectorAndRoleHeuristic(params: {
  title?: string;
  description?: string;
  skills?: string | string[];
  company?: string;
}): SectorRolePrediction {
  const titleStr = (params.title || '').toLowerCase();
  const descStr = (params.description || '').toLowerCase();
  const skillsStr = Array.isArray(params.skills) ? params.skills.join(' ').toLowerCase() : (params.skills || '').toLowerCase();
  const companyStr = (params.company || '').toLowerCase();

  const combinedText = `${titleStr} ${descStr} ${skillsStr} ${companyStr}`;

  // 1. Electrical & MEP Engineering
  if (
    combinedText.includes('electrical') ||
    combinedText.includes('mep') ||
    combinedText.includes('switchgear') ||
    combinedText.includes('revit') ||
    combinedText.includes('auto cad') ||
    combinedText.includes('autocad') ||
    combinedText.includes('power system') ||
    combinedText.includes('nec') ||
    combinedText.includes('iec')
  ) {
    return {
      industrySector: 'MEP Consultant',
      roleCategory: 'Design Engineer - Electrical',
      alternativeSectors: ['Electrical & Electronics', 'Engineering Services', 'Building Systems'],
      alternativeCategories: [
        'Design Engineer - Electrical',
        'Electrical Engineer',
        'AutoCAD & Revit Specialist',
        'MEP Project Engineer'
      ]
    };
  }

  // 2. Mechanical Engineering
  if (
    combinedText.includes('mechanical') ||
    combinedText.includes('hvac') ||
    combinedText.includes('piping') ||
    combinedText.includes('solidworks') ||
    combinedText.includes('catia') ||
    combinedText.includes('thermal') ||
    combinedText.includes('hydraulics')
  ) {
    return {
      industrySector: 'Mechanical & Heavy Engineering',
      roleCategory: 'Design Engineer - Mechanical',
      alternativeSectors: ['MEP Consultant', 'Automotive & Industrial Manufacturing', 'Engineering Services'],
      alternativeCategories: [
        'Design Engineer - Mechanical',
        'HVAC Engineer',
        'Piping Specialist',
        'Production Engineer'
      ]
    };
  }

  // 3. Software / IT / Web / AI
  if (
    combinedText.includes('software') ||
    combinedText.includes('developer') ||
    combinedText.includes('full stack') ||
    combinedText.includes('frontend') ||
    combinedText.includes('backend') ||
    combinedText.includes('react') ||
    combinedText.includes('node') ||
    combinedText.includes('python') ||
    combinedText.includes('java') ||
    combinedText.includes('cloud')
  ) {
    return {
      industrySector: 'Information Technology & Software Services',
      roleCategory: 'Software Development & Engineering',
      alternativeSectors: ['SaaS & Internet Services', 'IT Consulting', 'Digital Solutions'],
      alternativeCategories: [
        'Full Stack Developer',
        'Backend Engineer',
        'Frontend Web Developer',
        'Software Architect'
      ]
    };
  }

  // 4. Civil & Construction
  if (
    combinedText.includes('civil') ||
    combinedText.includes('construction') ||
    combinedText.includes('site engineer') ||
    combinedText.includes('structural') ||
    combinedText.includes('surveyor')
  ) {
    return {
      industrySector: 'Construction & Real Estate Development',
      roleCategory: 'Site & Civil Engineering',
      alternativeSectors: ['Infrastructure & Heavy Construction', 'Engineering Consultancy'],
      alternativeCategories: [
        'Site Engineer',
        'Structural Design Engineer',
        'Civil Project Manager',
        'Quantity Surveyor'
      ]
    };
  }

  // 5. Human Resources & Talent Acquisition
  if (
    combinedText.includes('hr') ||
    combinedText.includes('human resource') ||
    combinedText.includes('recruiter') ||
    combinedText.includes('talent') ||
    combinedText.includes('payroll')
  ) {
    return {
      industrySector: 'Human Resources & Recruitment',
      roleCategory: 'Talent Acquisition & HR Operations',
      alternativeSectors: ['Corporate Staffing', 'Consulting & Advisory'],
      alternativeCategories: [
        'HR Executive / Generalist',
        'Technical Recruiter',
        'Talent Acquisition Specialist',
        'HR Manager'
      ]
    };
  }

  // 6. Accounting & Finance
  if (
    combinedText.includes('account') ||
    combinedText.includes('finance') ||
    combinedText.includes('tally') ||
    combinedText.includes('audit') ||
    combinedText.includes('gst') ||
    combinedText.includes('tax')
  ) {
    return {
      industrySector: 'Accounting & Financial Services',
      roleCategory: 'Finance & Accounting Operations',
      alternativeSectors: ['Banking & Financial Services', 'Corporate Audit'],
      alternativeCategories: [
        'Accounts Executive',
        'Senior Accountant',
        'Taxation Specialist',
        'Financial Analyst'
      ]
    };
  }

  // 7. Quality & Testing
  if (
    combinedText.includes('quality') ||
    combinedText.includes('qa') ||
    combinedText.includes('qc') ||
    combinedText.includes('inspection')
  ) {
    return {
      industrySector: 'Quality Control & Industrial Standards',
      roleCategory: 'Quality Assurance / Quality Control Engineer',
      alternativeSectors: ['Manufacturing & Assembly', 'Engineering Operations'],
      alternativeCategories: [
        'QA/QC Inspector',
        'Quality Assurance Engineer',
        'Compliance Lead'
      ]
    };
  }

  // Default Fallback
  return {
    industrySector: 'Engineering & Industrial Operations',
    roleCategory: 'Technical Engineering Specialist',
    alternativeSectors: ['Industrial Services', 'Corporate Operations'],
    alternativeCategories: [
      'Technical Specialist',
      'Operations Engineer',
      'Project Coordinator'
    ]
  };
}

/**
 * Normalizes external API job payloads (e.g. PHP/JSON arrays with recruiterUID, industryName, roleName,
 * skills array, education array, typed location, city, entryBy, etc.) into database-aligned objects.
 */
export function normalizeApiJobPayload(rawPayload: any): Record<string, any> {
  if (!rawPayload || typeof rawPayload !== 'object') return {};

  const title = (rawPayload.title || '').trim();
  const companyName = (rawPayload.companyName || rawPayload.company || rawPayload.company_name || '').trim();
  const skillsArray = parseStringList(rawPayload.skills);
  const description = (rawPayload.description || '').trim();

  // AI / Smart Rule Prediction for Sector & Role Category if missing or generic
  const rawIndustry = (rawPayload.industryName || rawPayload.sector || '').trim();
  const rawRole = (rawPayload.roleName || rawPayload.roleCategory || '').trim();

  const isGenericIndustry = !rawIndustry || ['general', 'engineering', 'other', 'unknown'].includes(rawIndustry.toLowerCase());
  const isGenericRole = !rawRole || ['general', 'engineering', 'other', 'unknown'].includes(rawRole.toLowerCase());

  const prediction = predictSectorAndRoleHeuristic({
    title,
    description,
    skills: skillsArray,
    company: companyName
  });

  const industryName = isGenericIndustry ? prediction.industrySector : rawIndustry;
  const roleName = isGenericRole ? prediction.roleCategory : rawRole;
  
  const sectors = Array.from(new Set([industryName, ...(rawPayload.sectors || []), ...prediction.alternativeSectors]));
  const categories = Array.from(new Set([roleName, ...(rawPayload.categories || []), ...(rawPayload.roleCategories || []), ...prediction.alternativeCategories]));

  const category = rawPayload.category || rawPayload.department || roleName || industryName;
  const department = rawPayload.department || rawPayload.category || roleName || industryName;
  
  // Typed location & city handling (supports "Gadkari Chowk,Nashik" + "Nashik")
  const rawLoc = (rawPayload.location || '').trim();
  const rawCity = (rawPayload.city || '').trim();
  const extractedCityFromLoc = rawLoc.includes(',') ? rawLoc.split(',').pop()?.trim() : '';
  const resolvedCity = rawCity || resolveStrictListedCity(`${rawLoc} ${rawCity}`) || extractedCityFromLoc || rawLoc || 'Remote';
  const location = rawLoc || resolvedCity || 'Remote';

  const minExp = rawPayload.minExperience !== undefined ? Number(rawPayload.minExperience) : 0;
  const maxExp = rawPayload.maxExperience !== undefined ? Number(rawPayload.maxExperience) : minExp;
  const expStr = rawPayload.experience ? String(rawPayload.experience).trim() : (maxExp > minExp ? `${minExp} - ${maxExp} Years` : `${minExp} Years`);

  const skillsStr = skillsArray.join(', ');

  const eduArray = parseStringList(rawPayload.education || rawPayload.qualifications || rawPayload.qualification);
  const eduStr = eduArray.join(', ');

  const customFieldsList = Array.isArray(rawPayload.customFields) ? rawPayload.customFields : [];
  const customEntryBy = customFieldsList.find((cf: any) => {
    const k = (cf?.key || '').toLowerCase();
    return k.includes('entry by') || k.includes('entered by') || k.includes('uploaded by');
  })?.value;

  const recruiterUID = rawPayload.recruiterUID || rawPayload.userId || rawPayload.recruiterId || '';
  const entryBy = (
    rawPayload.entryBy ||
    rawPayload.entry_by ||
    rawPayload.uploadedBy ||
    rawPayload.uploaded_by ||
    rawPayload.recruiterName ||
    rawPayload.contactPerson ||
    rawPayload.contactPersonName ||
    (typeof rawPayload.createdBy === 'string' ? rawPayload.createdBy : rawPayload.createdBy?.name) ||
    customEntryBy ||
    ''
  ).toString().trim();

  // Job Number & Access Code (Access code is same as Job Number for API jobs)
  const jobNo = rawPayload.jobNo ? String(rawPayload.jobNo).trim() : (rawPayload.job_no ? String(rawPayload.job_no).trim() : '');
  const accessCode = jobNo || (rawPayload.accessCode ? String(rawPayload.accessCode).trim() : 'ACCESS');

  // Status & Expiry handling (Inactive -> expired/hidden, Active -> show job)
  const rawStatus = (rawPayload.status || 'Active').trim();
  const statusLower = rawStatus.toLowerCase();
  const isInactiveOrClosed = ['inactive', 'expired', 'closed', 'disabled', 'deactivated', 'draft'].includes(statusLower);
  const status = isInactiveOrClosed ? 'Inactive' : 'Active';
  const isExpired = isInactiveOrClosed;

  return {
    ...rawPayload,
    title,
    company: companyName,
    companyName: companyName,
    industryName,
    sector: industryName,
    sectors,
    roleName,
    roleCategory: roleName,
    categories,
    roleCategories: categories,
    category,
    department,
    description,
    location,
    city: resolvedCity,
    experience: expStr,
    minExperience: minExp,
    maxExperience: maxExp,
    salaryRange: formatStringList(rawPayload.salaryRange || rawPayload.salary || ''),
    salary: formatStringList(rawPayload.salary || rawPayload.salaryRange || ''),
    employmentType: (rawPayload.employmentType || 'Full-Time').trim(),
    skills: skillsArray,
    skillsStr: skillsStr,
    education: eduStr,
    qualifications: eduStr,
    qualification: eduStr,
    educationList: eduArray,
    genderRequirement: rawPayload.genderRequirement || rawPayload.gender || 'Any',
    gender: rawPayload.genderRequirement || rawPayload.gender || 'Any',
    strictGenderMatch: Boolean(rawPayload.strictGenderMatch),
    strictLocationMatch: Boolean(rawPayload.strictLocationMatch),
    strictEducationMatch: Boolean(rawPayload.strictEducationMatch),
    strictExperienceMatch: Boolean(rawPayload.strictExperienceMatch),
    jobNo,
    accessCode,
    status,
    isExpired,
    recruiterUID,
    entryBy,
    recruiterName: entryBy,
  };
}

/**
 * Normalizes job/interview document data so REST API created jobs and Recruiter Dashboard jobs
 * share consistent property names across the frontend application.
 */
export function normalizeJobData(rawId: string, data: any, collectionName: 'jobs' | 'interviews' = 'jobs') {
  if (!data) return null;

  const normalizedApiData = normalizeApiJobPayload(data);

  return {
    id: rawId,
    ...data,
    ...normalizedApiData,
    accessCode: normalizedApiData.jobNo || data.accessCode || 'ACCESS',
    interviewLink: data.interviewLink || `${window.location.origin}/#/interview/${rawId}`,
    collectionName
  };
}

/**
 * Resolves a job or interview document by ID or numerical/string jobNo.
 * Strategy 1: Direct Document Lookup in 'jobs' then 'interviews'
 * Strategy 2: Fallback Query by jobNo in 'jobs' then 'interviews'
 */
export async function resolveJobOrInterviewDocument(idOrJobNoParam: string): Promise<ResolvedJobData | null> {
  if (!idOrJobNoParam) return null;
  const paramStr = String(idOrJobNoParam).trim();
  if (!paramStr) return null;

  // Strategy 1: Direct Document Lookup in 'jobs'
  try {
    const jobRef = doc(db, 'jobs', paramStr);
    const jobSnap = await getDoc(jobRef);
    if (jobSnap.exists()) {
      return {
        id: jobSnap.id,
        docRef: jobRef,
        collectionName: 'jobs',
        data: normalizeJobData(jobSnap.id, jobSnap.data(), 'jobs')
      };
    }
  } catch (err) {
    console.warn("Direct lookup in 'jobs' failed or threw error:", err);
  }

  // Strategy 1b: Direct Document Lookup in 'interviews'
  try {
    const intRef = doc(db, 'interviews', paramStr);
    const intSnap = await getDoc(intRef);
    if (intSnap.exists()) {
      return {
        id: intSnap.id,
        docRef: intRef,
        collectionName: 'interviews',
        data: normalizeJobData(intSnap.id, intSnap.data(), 'interviews')
      };
    }
  } catch (err) {
    console.warn("Direct lookup in 'interviews' failed or threw error:", err);
  }

  // Strategy 2: Fallback Query by jobNo in 'jobs'
  try {
    const qJobsStr = query(collection(db, 'jobs'), where('jobNo', '==', paramStr));
    const snapJobsStr = await getDocs(qJobsStr);
    if (!snapJobsStr.empty) {
      const matchDoc = snapJobsStr.docs[0];
      return {
        id: matchDoc.id,
        docRef: matchDoc.ref,
        collectionName: 'jobs',
        data: normalizeJobData(matchDoc.id, matchDoc.data(), 'jobs')
      };
    }

    if (!isNaN(Number(paramStr))) {
      const qJobsNum = query(collection(db, 'jobs'), where('jobNo', '==', Number(paramStr)));
      const snapJobsNum = await getDocs(qJobsNum);
      if (!snapJobsNum.empty) {
        const matchDoc = snapJobsNum.docs[0];
        return {
          id: matchDoc.id,
          docRef: matchDoc.ref,
          collectionName: 'jobs',
          data: normalizeJobData(matchDoc.id, matchDoc.data(), 'jobs')
        };
      }
    }
  } catch (err) {
    console.warn("Fallback query by jobNo in 'jobs' failed:", err);
  }

  // Strategy 2b: Fallback Query by jobNo in 'interviews'
  try {
    const qIntStr = query(collection(db, 'interviews'), where('jobNo', '==', paramStr));
    const snapIntStr = await getDocs(qIntStr);
    if (!snapIntStr.empty) {
      const matchDoc = snapIntStr.docs[0];
      return {
        id: matchDoc.id,
        docRef: matchDoc.ref,
        collectionName: 'interviews',
        data: normalizeJobData(matchDoc.id, matchDoc.data(), 'interviews')
      };
    }

    if (!isNaN(Number(paramStr))) {
      const qIntNum = query(collection(db, 'interviews'), where('jobNo', '==', Number(paramStr)));
      const snapIntNum = await getDocs(qIntNum);
      if (!snapIntNum.empty) {
        const matchDoc = snapIntNum.docs[0];
        return {
          id: matchDoc.id,
          docRef: matchDoc.ref,
          collectionName: 'interviews',
          data: normalizeJobData(matchDoc.id, matchDoc.data(), 'interviews')
        };
      }
    }
  } catch (err) {
    console.warn("Fallback query by jobNo in 'interviews' failed:", err);
  }

  // Strategy 3: Lookup in JobFetched REST API
  try {
    const apiJobs = await fetchJobFetchedApiJobs();
    const match = apiJobs.find(
      (j) => String(j.id).trim() === paramStr ||
             String(j.accessCode).trim() === paramStr ||
             String(j.jobNo).trim() === paramStr
    );
    if (match) {
      return {
        id: match.id,
        docRef: doc(db, 'interviews', match.id),
        collectionName: 'interviews',
        data: match
      };
    }
  } catch (err) {
    console.warn("Fallback query in JobFetched API failed:", err);
  }

  return null;
}

/**
 * Subscribes to real-time updates for a job/interview document using Document ID or jobNo resolution.
 */
export function subscribeToJobOrInterview(
  idOrJobNoParam: string,
  onData: (data: any | null, resolved: ResolvedJobData | null) => void,
  onError?: (err: any) => void
): () => void {
  let activeUnsubscribe: (() => void) | null = null;
  let isCancelled = false;

  resolveJobOrInterviewDocument(idOrJobNoParam)
    .then((resolved) => {
      if (isCancelled) return;
      if (!resolved) {
        onData(null, null);
        return;
      }

      activeUnsubscribe = onSnapshot(
        resolved.docRef,
        (snap) => {
          if (!snap.exists()) {
            onData(null, null);
          } else {
            const normalized = normalizeJobData(snap.id, snap.data(), resolved.collectionName);
            onData(normalized, { ...resolved, data: normalized });
          }
        },
        (err) => {
          if (onError) onError(err);
          else console.error("Error in job subscription:", err);
        }
      );
    })
    .catch((err) => {
      if (onError) onError(err);
      else console.error("Error resolving job document:", err);
    });

  return () => {
    isCancelled = true;
    if (activeUnsubscribe) activeUnsubscribe();
  };
}

export const JOBFETCHED_API_URL = import.meta.env.VITE_JOBFETCHED_API_URL || 'https://jobfetched-api-507k.onrender.com/api/jobs';
export const JOBFETCHED_SECRET_KEY = import.meta.env.VITE_JOBFETCHED_SECRET_KEY || '';
export const DEFAULT_RECRUITER_UID = 'pbbMTYxPDaf7jhc9uPEZ34CcWfz2';

/**
 * Fetches jobs directly from internal Vercel /api/jobs endpoint or fallback API
 * with Bearer authentication and maps/normalizes them to the default recruiter UID.
 */
export async function fetchJobFetchedApiJobs(targetRecruiterUID: string = DEFAULT_RECRUITER_UID): Promise<any[]> {
  try {
    const apiBase = import.meta.env.VITE_API_BASE_URL || '';
    const internalUrl = apiBase ? `${apiBase}/api/jobs` : '/api/jobs';

    // 1. Try internal Vercel Serverless /api/jobs
    let rawJobs: any[] = [];
    try {
      const internalRes = await fetch(internalUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${JOBFETCHED_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      if (internalRes.ok) {
        const json = await internalRes.json();
        if (Array.isArray(json)) rawJobs = json;
      }
    } catch (e) {
      // fallback
    }

    // 2. Fallback to external endpoint if internal empty
    if (rawJobs.length === 0) {
      const res = await fetch(JOBFETCHED_API_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${JOBFETCHED_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }).catch(() => null);

      if (res && res.ok) {
        const json = await res.json().catch(() => null);
        if (Array.isArray(json)) rawJobs = json;
      }
    }

    if (!Array.isArray(rawJobs)) return [];

    return rawJobs.map((rawJob: any) => {
      const normalized = normalizeApiJobPayload({
        ...rawJob,
        recruiterUID: rawJob.recruiterUID || targetRecruiterUID
      });
      return {
        id: rawJob.id || String(rawJob.accessCode || rawJob.jobNo),
        ...normalized,
      };
    });
  } catch (error) {
    console.error('Error fetching jobs from API:', error);
    return [];
  }
}
