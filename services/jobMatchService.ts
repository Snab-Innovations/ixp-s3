import { isEducationMatching, getEducationMatchDetails } from '../utils/educationMatcher';
import { detectCandidateGender } from './resumeService';
import { isJobMatchingDomain, resolveCandidateSectorsAndDepartments } from '../data/jobDomains';

export interface CandidateMatchProfile {
  name?: string;
  email?: string;
  phone?: string;
  gender?: string;
  location?: string;
  city?: string;
  domain?: string;
  domains?: string[];
  preferredDomains?: string[];
  sectors?: string[];
  sector?: string;
  departments?: string[];
  department?: string;
  experience?: number | string;
  totalExperienceYears?: number | string;
  education?: string | any[];
  highestEducation?: string;
  skills?: string[];
  resumeText?: string;
  summary?: string;
  currentTitle?: string;
  [key: string]: any;
}

export interface JobMatchResult {
  job: any;
  overallScore: number;
  matchGrade: 'Excellent Fit' | 'Great Fit' | 'Good Fit' | 'Moderate Fit' | 'Low Fit' | 'Not Recommended';
  badgeColor: string;
  domainMatch?: {
    isMatch: boolean;
    domain: string;
  };
  sectorMatch?: {
    isMatch: boolean;
    label: string;
  };
  deptMatch?: {
    isMatch: boolean;
    label: string;
  };
  skillMatch: {
    score: number;
    matchedSkills: string[];
    missingSkills: string[];
    totalRequired: number;
    ratioText: string;
  };
  locationMatch: {
    isMatch: boolean;
    label: string;
    details: string;
  };
  genderMatch: {
    isMatch: boolean;
    label: string;
    requiredGender: string;
    candidateGender: string;
  };
  expMatch: {
    isMatch: boolean;
    label: string;
    requiredExp: string;
    candidateExp: number;
  };
  eduMatch: {
    isMatch: boolean;
    label: string;
    requiredEdu: string;
    candidateEdu: string;
    allOptions: string[];
    matchedOptions: string[];
  };
  matchReasons: string[];
  failReasons: string[];
}

// Canonicalize skill for comparison
const canonicalizeSkill = (s: string): string => {
  if (!s) return '';
  return s.toLowerCase().replace(/[^a-z0-9+#]/g, '').trim();
};

// Check if candidate location / city matches job location / city
export const checkLocationMatch = (candLoc: string, jobLoc: string): { isMatch: boolean; label: string; details: string } => {
  if (!jobLoc || !jobLoc.trim()) {
    return { isMatch: true, label: 'Any Location', details: 'No specific location restriction' };
  }
  const cleanJob = jobLoc.toLowerCase().trim();
  if (cleanJob.includes('remote') || cleanJob.includes('any') || cleanJob.includes('all india') || cleanJob.includes('work from home')) {
    return { isMatch: true, label: 'Remote / Any Location', details: 'Role accepts candidates from any location' };
  }

  if (!candLoc || !candLoc.trim()) {
    return { isMatch: true, label: 'Location Open', details: 'Candidate location not specified' };
  }

  const cleanCand = candLoc.toLowerCase().trim();

  // Direct substring or token match
  const jobTokens = cleanJob.split(/[\s,/-]+/).filter(t => t.length > 2);
  const candTokens = cleanCand.split(/[\s,/-]+/).filter(t => t.length > 2);

  const matchedToken = jobTokens.find(jt => candTokens.some(ct => ct.includes(jt) || jt.includes(ct)));

  if (matchedToken || cleanCand.includes(cleanJob) || cleanJob.includes(cleanCand)) {
    return { isMatch: true, label: `City / Location Matches (${candLoc})`, details: `Matched with ${jobLoc}` };
  }

  // Major Maharashtra city fallback check
  const cityEquivs: Record<string, string[]> = {
    nashik: ['nashik', 'nasik'],
    pune: ['pune', 'poona'],
    mumbai: ['mumbai', 'bombay', 'thane', 'navi mumbai'],
    nagpur: ['nagpur'],
    chhatrapati_sambhajinagar: ['aurangabad', 'sambhajinagar', 'chhatrapati sambhajinagar'],
  };

  for (const group of Object.values(cityEquivs)) {
    const candInGroup = group.some(g => cleanCand.includes(g));
    const jobInGroup = group.some(g => cleanJob.includes(g));
    if (candInGroup && jobInGroup) {
      return { isMatch: true, label: `City / Location Matches (${candLoc})`, details: `Matched region for ${jobLoc}` };
    }
  }

  return { isMatch: false, label: `Location Difference`, details: `Job in ${jobLoc}, Candidate in ${candLoc}` };
};

// Check if candidate gender matches job gender requirement:
// If job specifies "Any" (or unspecified), then BOTH genders can see and match the job.
export const checkGenderMatch = (candidate: CandidateMatchProfile, job: any): { isMatch: boolean; label: string; requiredGender: string; candidateGender: string } => {
  const reqGenderRaw = (job.genderRequirement || job.gender || job.genderPreference || '').toString().trim().toLowerCase();
  
  const isAnyGender = !reqGenderRaw || ['any', 'no preference', 'nopreference', 'both', 'all', 'none', 'unspecified', 'any / specified'].includes(reqGenderRaw);

  const candidateGenderDetected = candidate.gender && candidate.gender !== 'Any' && candidate.gender !== 'Unspecified'
    ? candidate.gender.toLowerCase()
    : detectCandidateGender(candidate);

  const formattedCandGender = candidateGenderDetected === 'female' ? 'Female' : candidateGenderDetected === 'male' ? 'Male' : 'Any / Open';

  // If job specifies Any Gender -> ALWAYS match (both male and female can see the job)
  if (isAnyGender || !candidateGenderDetected || candidateGenderDetected === 'any' || candidateGenderDetected === 'unspecified') {
    return { isMatch: true, label: 'Gender Eligible (Open to All)', requiredGender: 'Any', candidateGender: formattedCandGender };
  }

  if (reqGenderRaw.includes('female') || reqGenderRaw.includes('women') || reqGenderRaw.includes('girl')) {
    if (candidateGenderDetected === 'male') {
      return { isMatch: false, label: 'Role Requires Female Candidates Only', requiredGender: 'Female Only', candidateGender: 'Male' };
    }
    return { isMatch: true, label: 'Gender Matches (Female Candidate)', requiredGender: 'Female Only', candidateGender: 'Female' };
  }

  if (reqGenderRaw.includes('male') || reqGenderRaw.includes('men') || reqGenderRaw.includes('boy')) {
    if (candidateGenderDetected === 'female') {
      return { isMatch: false, label: 'Role Requires Male Candidates Only', requiredGender: 'Male Only', candidateGender: 'Female' };
    }
    return { isMatch: true, label: 'Gender Matches (Male Candidate)', requiredGender: 'Male Only', candidateGender: 'Male' };
  }

  return { isMatch: true, label: 'Gender Eligible', requiredGender: 'Any', candidateGender: formattedCandGender };
};

// Domain Skill Synonyms Dictionary for Intelligent Match Analysis
const DOMAIN_SKILL_SYNONYMS: Record<string, string[]> = {
  store: ['warehouse', 'inventory', 'stock', 'dispatch', 'godown', 'materials', 'logistics', 'store keeper', 'storekeeper', 'incharge', 'shipping', 'store management'],
  dispatch: ['shipping', 'logistics', 'chalan', 'loading', 'unloading', 'billing', 'goods', 'transportation', 'dispatch handling', 'dispatch incharge'],
  inventory: ['stock', 'tally', 'excel', 'materials', 'material management', 'audit', 'godown', 'inventory management', 'stock management'],
  mechanical: ['autocad', 'solidworks', 'catia', 'cnc', 'vmc', 'production', 'tooling', 'maintenance', 'assembly', 'be mechanical', 'diploma mechanical'],
  accounts: ['tally', 'gst', 'tds', 'excel', 'billing', 'finance', 'bookkeeping', 'taxation', 'tally prime'],
  sales: ['marketing', 'business development', 'bd', 'lead generation', 'client acquisition', 'telecalling', 'sales executive'],
  react: ['javascript', 'frontend', 'typescript', 'nextjs', 'web development'],
  python: ['django', 'flask', 'fastapi', 'data analysis', 'pandas', 'machine learning'],
  node: ['express', 'backend', 'javascript', 'typescript', 'api'],
};

// Check if candidate skill or text matches required skill (with synonym support)
const isSkillMatchWithSynonyms = (reqSkill: string, candidateSkills: string[], fullCandText: string): boolean => {
  const canonReq = canonicalizeSkill(reqSkill);
  if (!canonReq) return false;

  // 1. Direct match with candidate skills array
  const candSkillsCanon = candidateSkills.map(canonicalizeSkill).filter(Boolean);
  if (candSkillsCanon.some(cs => cs.includes(canonReq) || canonReq.includes(cs))) {
    return true;
  }

  // 2. Direct text match with full candidate text / resumeText / bio / title
  const cleanReq = reqSkill.toLowerCase().trim();
  const cleanText = fullCandText.toLowerCase();
  if (cleanReq.length > 2 && cleanText.includes(cleanReq)) {
    return true;
  }

  // 3. Synonym matching
  for (const [key, synonyms] of Object.entries(DOMAIN_SKILL_SYNONYMS)) {
    if (cleanReq.includes(key) || key.includes(cleanReq)) {
      const matchFound = synonyms.some(syn => 
        candSkillsCanon.some(cs => cs.includes(syn) || syn.includes(cs)) ||
        cleanText.includes(syn)
      );
      if (matchFound) return true;
    }
  }

  return false;
};

// Main Match Calculator function
export function calculateJobMatchScore(job: any, candidate: CandidateMatchProfile): JobMatchResult {
  const matchReasons: string[] = [];
  const failReasons: string[] = [];

  // 1. Gender Matching (Weight: 10 points)
  const genResult = checkGenderMatch(candidate, job);
  const isGenderStrictBlocked = !genResult.isMatch;
  const genderScore = genResult.isMatch ? 10 : 0;
  if (genResult.isMatch) {
    if (genResult.requiredGender !== 'Any') {
      matchReasons.push(genResult.label);
    }
  } else {
    failReasons.push(genResult.label);
  }

  // 2. Industry Sector & Functional Department Matching (Weight: 25 points)
  const { sectors: candSectors, departments: candDepts } = resolveCandidateSectorsAndDepartments(candidate);
  
  const jobSec = (job.industrySector || job.sector || job.industry || job.industryName || '').toLowerCase().trim();
  const jobDept = (job.department || job.departments || job.category || job.roleCategory || job.roleName || '').toLowerCase().trim();
  const jobText = `${job.title || ''} ${job.description || ''} ${jobDept} ${jobSec}`.toLowerCase();

  let sectorMatched = false;
  let matchedSectorName = '';
  if (candSectors.length > 0) {
    for (const sec of candSectors) {
      const sLower = sec.toLowerCase();
      const sParts = sLower.split(/[\s\/&]+/).filter(p => p.length > 2);
      if (jobSec.includes(sLower) || sParts.some(p => jobText.includes(p))) {
        sectorMatched = true;
        matchedSectorName = sec;
        break;
      }
    }
  }

  let deptMatched = false;
  let matchedDeptName = '';
  if (candDepts.length > 0) {
    for (const dept of candDepts) {
      const dLower = dept.toLowerCase();
      const dParts = dLower.split(/[\s\/&]+/).filter(p => p.length > 2);
      if (jobDept.includes(dLower) || dParts.some(p => jobText.includes(p))) {
        deptMatched = true;
        matchedDeptName = dept;
        break;
      }
    }
  }

  let sectorDeptScore = 12; // Base baseline
  if (sectorMatched && deptMatched) {
    sectorDeptScore = 25;
    matchReasons.unshift(`Industry Sector & Department Match (${matchedSectorName} • ${matchedDeptName})`);
  } else if (sectorMatched) {
    sectorDeptScore = 22;
    matchReasons.unshift(`Industry Sector Matches (${matchedSectorName})`);
  } else if (deptMatched) {
    sectorDeptScore = 20;
    matchReasons.unshift(`Functional Department Matches (${matchedDeptName})`);
  } else if (candSectors.length === 0 && candDepts.length === 0) {
    sectorDeptScore = 18;
  }

  // 3. Skills Matching (Weight: 25 points)
  let rawJobSkills: string[] = [];
  if (Array.isArray(job.skills)) {
    rawJobSkills = job.skills;
  } else if (typeof job.skills === 'string') {
    rawJobSkills = job.skills.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
  }
  if (rawJobSkills.length === 0 && job.description) {
    const text = job.description.toLowerCase();
    const commonTech = ['react', 'node', 'javascript', 'typescript', 'python', 'java', 'sql', 'autocad', 'excel', 'tally', 'billing', 'estimation', 'revit', 'site supervision', 'sales', 'marketing', 'hr', 'customer service', 'store management', 'dispatch', 'management', 'communication', 'maintenance'];
    rawJobSkills = commonTech.filter(tech => text.includes(tech));
  }

  const candidateSkills: string[] = Array.isArray(candidate.skills) ? candidate.skills : [];
  const fullCandText = `${candidateSkills.join(' ')} ${candidate.resumeText || ''} ${candidate.summary || ''} ${candidate.currentTitle || ''}`;

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  rawJobSkills.forEach(reqSkill => {
    if (isSkillMatchWithSynonyms(reqSkill, candidateSkills, fullCandText)) {
      matchedSkills.push(reqSkill);
    } else {
      missingSkills.push(reqSkill);
    }
  });

  const totalReqSkills = rawJobSkills.length;
  const skillMatchCoverage = totalReqSkills > 0 ? matchedSkills.length / totalReqSkills : 0.75;
  const skillScore = Math.round(skillMatchCoverage * 25);
  const ratioText = totalReqSkills > 0 ? `${matchedSkills.length}/${totalReqSkills} skills matched` : 'Skills match';

  if (totalReqSkills > 0 && matchedSkills.length > 0) {
    matchReasons.push(`Matched ${matchedSkills.length} of ${totalReqSkills} skills (${matchedSkills.slice(0, 3).join(', ')})`);
  }

  // 4. City & Location Matching (Weight: 10 points)
  const jobLoc = job.location || (job.city && job.state ? `${job.city}, ${job.state}` : job.city || job.state || '');
  const candLoc = candidate.location || candidate.city || '';
  const locResult = checkLocationMatch(candLoc, jobLoc);
  const locationScore = locResult.isMatch ? 10 : 4;
  if (locResult.isMatch) {
    matchReasons.push(locResult.label);
  } else {
    failReasons.push(locResult.details);
  }

  // 5. Education Qualification & Specialization Matching (Weight: 15 points)
  const reqEdu = (job.education || job.qualification || job.qualifications || '').toString().trim();
  const candEduStr = (candidate.highestEducation || candidate.education || '').toString().trim();
  
  const eduDetails = getEducationMatchDetails(candEduStr, reqEdu);
  let eduMatch = eduDetails.isMatch;
  let eduLabel = 'Qualification Matches 100%';
  let eduScore = 15;

  if (reqEdu && reqEdu.toLowerCase() !== 'any' && reqEdu.toLowerCase() !== 'unspecified') {
    if (eduDetails.isMatch) {
      eduScore = 15;
      eduLabel = `Education Matches (${candEduStr || 'Qualified'})`;
      matchReasons.push(`Education matches requirement (${eduDetails.matchedOptions.join(', ') || reqEdu})`);
    } else {
      eduScore = 0;
      eduMatch = false;
      eduLabel = `Education Mismatch: Job requires ${reqEdu} (Candidate has ${candEduStr || 'None'})`;
      failReasons.push(eduLabel);
    }
  } else {
    matchReasons.push('Open education requirements');
  }

  // 6. Experience Matching (Weight: 15 points)
  let minExp = 0;
  let maxExp = 0;

  if (job.minExperience !== undefined && job.minExperience !== null && !isNaN(Number(job.minExperience))) {
    minExp = Math.max(0, Number(job.minExperience));
  }
  if (job.maxExperience !== undefined && job.maxExperience !== null && !isNaN(Number(job.maxExperience))) {
    maxExp = Math.max(0, Number(job.maxExperience));
  }

  // Parse string ranges like "2 - 3 Yrs", "2-3 Years", "2 to 3", "2+ Yrs"
  const rawJobExpStr = String(job.experience || job.minExperience || '').trim();
  if (minExp === 0 && rawJobExpStr) {
    const rangeMatch = rawJobExpStr.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/i);
    if (rangeMatch) {
      minExp = parseFloat(rangeMatch[1]) || 0;
      maxExp = parseFloat(rangeMatch[2]) || 0;
    } else {
      const singleMatch = rawJobExpStr.match(/(\d+(?:\.\d+)?)/);
      if (singleMatch && !/fresher|0\s*yr/i.test(rawJobExpStr)) {
        minExp = parseFloat(singleMatch[1]) || 0;
      }
    }
  }

  const rawCandExp = candidate.totalExperienceYears ?? candidate.experience ?? 0;
  const candExpNum = Math.max(0, parseFloat(String(rawCandExp).replace(/[^0-9.]/g, '')) || 0);

  let expMatch = true;
  let expScore = 15;
  let expLabel = `Experience Fits (${candExpNum} Yrs)`;
  const reqExpText = minExp > 0 ? (maxExp > minExp ? `${minExp} - ${maxExp} Yrs` : `${minExp}+ Yrs`) : 'Fresher / Any Experience';

  if (minExp > 0) {
    if (candExpNum >= minExp) {
      expMatch = true;
      expScore = 15;
      expLabel = `Meets Experience (${candExpNum} Yrs vs ${minExp}+ Yrs required)`;
      matchReasons.push(`Meets experience criteria (${candExpNum} Yrs)`);
    } else {
      // Candidate experience is strictly below the required minimum (e.g. 1 yr vs 2-3 yrs required)
      expMatch = false;
      expScore = 0;
      expLabel = `Requires minimum ${minExp} Yrs (Candidate has ${candExpNum} Yrs)`;
      failReasons.push(expLabel);
    }
  } else {
    expMatch = true;
    expScore = 15;
    matchReasons.push(`Experience eligible (${candExpNum} Yrs)`);
  }

  // Composite Score (0 - 100)
  let compositeScore = genderScore + sectorDeptScore + skillScore + locationScore + eduScore + expScore;

  // If hard gender or education conflict, adjust
  if (isGenderStrictBlocked) {
    compositeScore = 0;
  }

  const overallScore = Math.min(100, Math.max(0, Math.round(compositeScore)));

  // Determine Match Grade & Color
  let matchGrade: 'Excellent Fit' | 'Great Fit' | 'Good Fit' | 'Moderate Fit' | 'Low Fit' | 'Not Recommended' = 'Moderate Fit';
  let badgeColor = 'bg-emerald-500 text-white';

  if (isGenderStrictBlocked || overallScore === 0) {
    matchGrade = 'Not Recommended';
    badgeColor = 'bg-rose-600 text-white shadow-rose-500/30';
  } else if (overallScore >= 80) {
    matchGrade = 'Excellent Fit';
    badgeColor = 'bg-emerald-600 text-white shadow-emerald-500/30';
  } else if (overallScore >= 65) {
    matchGrade = 'Great Fit';
    badgeColor = 'bg-teal-600 text-white shadow-teal-500/30';
  } else if (overallScore >= 50) {
    matchGrade = 'Good Fit';
    badgeColor = 'bg-blue-600 text-white shadow-blue-500/30';
  } else if (overallScore >= 35) {
    matchGrade = 'Moderate Fit';
    badgeColor = 'bg-amber-500 text-white shadow-amber-500/30';
  } else {
    matchGrade = 'Low Fit';
    badgeColor = 'bg-slate-500 text-white shadow-slate-500/30';
  }

  // Domain Matching for legacy compatibility
  const candDomainsList: string[] = Array.isArray(candidate.domains) && candidate.domains.length > 0
    ? candidate.domains
    : (Array.isArray(candidate.preferredDomains) && candidate.preferredDomains.length > 0
      ? candidate.preferredDomains
      : (candidate.domain ? [candidate.domain] : []));

  const domainMatched = isJobMatchingDomain(job, candDomainsList);

  return {
    job,
    overallScore,
    matchGrade,
    badgeColor,
    domainMatch: {
      isMatch: domainMatched || sectorMatched || deptMatched,
      domain: candDomainsList.join(', ') || matchedSectorName || matchedDeptName
    },
    sectorMatch: {
      isMatch: sectorMatched,
      label: matchedSectorName ? `Sector: ${matchedSectorName}` : 'Sector Open'
    },
    deptMatch: {
      isMatch: deptMatched,
      label: matchedDeptName ? `Dept: ${matchedDeptName}` : 'Dept Open'
    },
    skillMatch: {
      score: skillScore,
      matchedSkills,
      missingSkills,
      totalRequired: totalReqSkills,
      ratioText
    },
    locationMatch: {
      isMatch: locResult.isMatch,
      label: locResult.label,
      details: locResult.details
    },
    genderMatch: {
      isMatch: genResult.isMatch,
      label: genResult.label,
      requiredGender: genResult.requiredGender,
      candidateGender: genResult.candidateGender
    },
    expMatch: {
      isMatch: expMatch,
      label: expLabel,
      requiredExp: reqExpText,
      candidateExp: candExpNum
    },
    eduMatch: {
      isMatch: eduMatch,
      label: eduLabel,
      requiredEdu: reqEdu || 'Any Qualification',
      candidateEdu: candEduStr || 'Candidate Degree',
      allOptions: eduDetails.allOptions,
      matchedOptions: eduDetails.matchedOptions
    },
    matchReasons,
    failReasons
  };
}
