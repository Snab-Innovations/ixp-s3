import { isEducationMatching } from '../utils/educationMatcher';
import { detectCandidateGender } from './resumeService';

export interface CandidateMatchProfile {
  name?: string;
  email?: string;
  phone?: string;
  gender?: string;
  location?: string;
  city?: string;
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
  };
  matchReasons: string[];
  failReasons: string[];
}

// Canonicalize skill for comparison
const canonicalizeSkill = (s: string): string => {
  if (!s) return '';
  return s.toLowerCase().replace(/[^a-z0-9+#]/g, '').trim();
};

// Check if candidate location matches job location
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
    return { isMatch: true, label: `Location Matches (${candLoc})`, details: `Matched with ${jobLoc}` };
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
      return { isMatch: true, label: `Location Matches (${candLoc})`, details: `Matched region for ${jobLoc}` };
    }
  }

  return { isMatch: false, label: `Location Difference`, details: `Job is in ${jobLoc}, Candidate is in ${candLoc}` };
};

// Check if candidate gender matches job gender requirement
export const checkGenderMatch = (candidate: CandidateMatchProfile, job: any): { isMatch: boolean; label: string; requiredGender: string; candidateGender: string } => {
  const reqGenderRaw = (job.genderRequirement || job.gender || job.genderPreference || '').toString().trim().toLowerCase();
  
  const isAnyGender = !reqGenderRaw || ['any', 'no preference', 'nopreference', 'both', 'all', 'none', 'unspecified'].includes(reqGenderRaw);

  const candidateGenderDetected = candidate.gender && candidate.gender !== 'Any' && candidate.gender !== 'Unspecified'
    ? candidate.gender.toLowerCase()
    : detectCandidateGender(candidate);

  const formattedCandGender = candidateGenderDetected === 'female' ? 'Female' : candidateGenderDetected === 'male' ? 'Male' : 'Any / Specified';

  if (isAnyGender) {
    return { isMatch: true, label: 'Gender Eligible (Any Gender)', requiredGender: 'Any', candidateGender: formattedCandGender };
  }

  if (reqGenderRaw.includes('female') || reqGenderRaw.includes('women') || reqGenderRaw.includes('girl')) {
    if (candidateGenderDetected === 'male') {
      return { isMatch: false, label: 'Role Requires Female Candidates Only (Candidate is Male)', requiredGender: 'Female Only', candidateGender: 'Male' };
    }
    return { isMatch: true, label: 'Gender Matches (Female Candidate)', requiredGender: 'Female Only', candidateGender: 'Female' };
  }

  if (reqGenderRaw.includes('male') || reqGenderRaw.includes('men') || reqGenderRaw.includes('boy')) {
    if (candidateGenderDetected === 'female') {
      return { isMatch: false, label: 'Role Requires Male Candidates Only (Candidate is Female)', requiredGender: 'Male Only', candidateGender: 'Female' };
    }
    return { isMatch: true, label: 'Gender Matches (Male Candidate)', requiredGender: 'Male Only', candidateGender: 'Male' };
  }

  return { isMatch: true, label: 'Gender Eligible', requiredGender: 'Any', candidateGender: formattedCandGender };
};

// Main Match Calculator function
export function calculateJobMatchScore(job: any, candidate: CandidateMatchProfile): JobMatchResult {
  const matchReasons: string[] = [];
  const failReasons: string[] = [];

  // 1. Skills Matching (Weight: 35 points)
  let rawJobSkills: string[] = [];
  if (Array.isArray(job.skills)) {
    rawJobSkills = job.skills;
  } else if (typeof job.skills === 'string') {
    rawJobSkills = job.skills.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
  }
  if (rawJobSkills.length === 0 && job.description) {
    const text = job.description.toLowerCase();
    const commonTech = ['react', 'node', 'javascript', 'typescript', 'python', 'java', 'sql', 'autocad', 'excel', 'tally', 'billing', 'estimation', 'revit', 'site supervision', 'sales', 'marketing', 'hr', 'customer service'];
    rawJobSkills = commonTech.filter(tech => text.includes(tech));
  }

  const candidateSkills: string[] = Array.isArray(candidate.skills) ? candidate.skills : [];
  const candSkillsCanonical = candidateSkills.map(canonicalizeSkill).filter(Boolean);

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  rawJobSkills.forEach(reqSkill => {
    const canonReq = canonicalizeSkill(reqSkill);
    if (!canonReq) return;
    const found = candSkillsCanonical.some(cs => cs.includes(canonReq) || canonReq.includes(cs));
    if (found || (candidate.resumeText && candidate.resumeText.toLowerCase().includes(reqSkill.toLowerCase()))) {
      matchedSkills.push(reqSkill);
    } else {
      missingSkills.push(reqSkill);
    }
  });

  const totalReqSkills = rawJobSkills.length;
  const skillMatchCoverage = totalReqSkills > 0 ? matchedSkills.length / totalReqSkills : 0.8;
  const skillScore = Math.round(skillMatchCoverage * 35);
  const ratioText = totalReqSkills > 0 ? `${matchedSkills.length}/${totalReqSkills} skills matched` : 'Skills matched';

  if (totalReqSkills > 0 && matchedSkills.length > 0) {
    matchReasons.push(`Matched ${matchedSkills.length} of ${totalReqSkills} required skills (${matchedSkills.slice(0, 3).join(', ')})`);
  }

  // 2. Location Matching (Weight: 15 points)
  const jobLoc = job.location || (job.city && job.state ? `${job.city}, ${job.state}` : job.city || job.state || '');
  const candLoc = candidate.location || candidate.city || '';
  const locResult = checkLocationMatch(candLoc, jobLoc);
  const locationScore = locResult.isMatch ? 15 : 5;
  if (locResult.isMatch) {
    matchReasons.push(locResult.label);
  } else {
    failReasons.push(locResult.details);
  }

  // 3. Gender Matching (Weight: 10 points)
  const genResult = checkGenderMatch(candidate, job);
  const genderScore = genResult.isMatch ? 10 : 0;
  if (genResult.isMatch) {
    if (genResult.requiredGender !== 'Any') {
      matchReasons.push(genResult.label);
    }
  } else {
    failReasons.push(genResult.label);
  }

  // 4. Experience Matching (Weight: 20 points)
  const minExp = Math.max(0, Number(job.minExperience) || (typeof job.experience === 'number' ? job.experience : 0));
  const maxExp = Math.max(0, Number(job.maxExperience) || 0);
  const rawCandExp = candidate.totalExperienceYears ?? candidate.experience ?? 0;
  const candExpNum = Math.max(0, parseFloat(String(rawCandExp).replace(/[^0-9.]/g, '')) || 0);

  let expMatch = true;
  let expLabel = `Experience Fits (${candExpNum} Yrs)`;
  let reqExpText = minExp > 0 ? (maxExp > minExp ? `${minExp} - ${maxExp} Yrs` : `${minExp}+ Yrs`) : 'Fresher / Any Experience';

  let expScore = 20;
  if (minExp > 0) {
    if (candExpNum >= minExp) {
      if (maxExp > minExp && candExpNum > maxExp + 3) {
        expScore = 14;
        expLabel = `Overqualified (${candExpNum} Yrs vs ${minExp}-${maxExp} Yrs)`;
        matchReasons.push(`Highly experienced candidate (${candExpNum} Yrs)`);
      } else {
        expScore = 20;
        expLabel = `Meets Experience (${candExpNum} Yrs vs ${minExp}+ Yrs required)`;
        matchReasons.push(`Meets experience criteria (${candExpNum} Yrs)`);
      }
    } else {
      // STRICT RULE: If job requires minExp (e.g. 4 yrs) and candidate has less (e.g. 2 yrs), DO NOT RECOMMEND THIS JOB!
      expMatch = false;
      expScore = 0;
      expLabel = `Experience Mismatch: Requires min ${minExp} Yrs (Candidate has ${candExpNum} Yrs)`;
      failReasons.push(`Requires minimum ${minExp} Yrs experience (candidate has ${candExpNum} Yrs). Job not recommended.`);
    }
  } else {
    matchReasons.push(`Experience eligible (${candExpNum} Yrs)`);
  }

  // 5. Education Matching (Weight: 20 points)
  const reqEdu = (job.education || job.qualification || job.qualifications || '').toString().trim();
  const candEduStr = (candidate.highestEducation || candidate.education || '').toString().trim();
  
  let eduMatch = true;
  let eduLabel = 'Qualification Matches';
  let eduScore = 20;

  if (reqEdu) {
    const isMatched = isEducationMatching(candEduStr, reqEdu);
    if (isMatched) {
      eduScore = 20;
      eduLabel = `Education Matches (${candEduStr || 'Qualified'})`;
      matchReasons.push(`Degree matches requirement (${reqEdu})`);
    } else {
      eduScore = 6;
      eduMatch = false;
      eduLabel = `Education Mismatch (Job requires ${reqEdu})`;
      failReasons.push(`Requires ${reqEdu} (Candidate has ${candEduStr || 'unspecified'})`);
    }
  } else {
    matchReasons.push('Open education requirements');
  }

  // Calculate Overall Composite Score (0 - 100%)
  let compositeScore = skillScore + locationScore + genderScore + expScore + eduScore;

  // STRICT DISQUALIFICATION:
  // 1. If candidate experience is below minExp -> score = 0 (Not Recommended)
  // 2. If job specifies a gender restriction (e.g. Female Only) and candidate gender does NOT match -> score = 0 (Not Recommended & hidden)
  if (!expMatch || !genResult.isMatch) {
    compositeScore = 0;
  }

  const overallScore = Math.min(100, Math.max(0, Math.round(compositeScore)));

  // Determine Match Grade & Color
  let matchGrade: 'Excellent Fit' | 'Great Fit' | 'Good Fit' | 'Moderate Fit' | 'Low Fit' | 'Not Recommended' = 'Moderate Fit';
  let badgeColor = 'bg-emerald-500 text-white';

  if (!expMatch || !genResult.isMatch || overallScore === 0) {
    matchGrade = 'Not Recommended';
    badgeColor = 'bg-rose-600 text-white shadow-rose-500/30';
  } else if (overallScore >= 88) {
    matchGrade = 'Excellent Fit';
    badgeColor = 'bg-emerald-600 text-white shadow-emerald-500/30';
  } else if (overallScore >= 75) {
    matchGrade = 'Great Fit';
    badgeColor = 'bg-teal-600 text-white shadow-teal-500/30';
  } else if (overallScore >= 60) {
    matchGrade = 'Good Fit';
    badgeColor = 'bg-blue-600 text-white shadow-blue-500/30';
  } else if (overallScore >= 45) {
    matchGrade = 'Moderate Fit';
    badgeColor = 'bg-amber-500 text-white shadow-amber-500/30';
  } else {
    matchGrade = 'Low Fit';
    badgeColor = 'bg-slate-500 text-white shadow-slate-500/30';
  }

  return {
    job,
    overallScore,
    matchGrade,
    badgeColor,
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
      candidateEdu: candEduStr || 'Candidate Degree'
    },
    matchReasons,
    failReasons
  };
}
