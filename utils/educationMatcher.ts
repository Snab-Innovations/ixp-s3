/**
 * Education & Qualification Matching Engine
 *
 * Handles intelligent matching between job education requirements and candidate qualifications.
 *
 * Core Rules:
 * 1. Multi-Option JDs (e.g. "BE Computer, Diploma Computers, MCA" or "BE Civil / Diploma Civil"):
 *    - If candidate satisfies ANY ONE of the options, it is a 100% match!
 * 2. Specific Specialization Requirements (e.g. "BE Computers", "Diploma Mechanical", "MBA HR", "ITI Electrician"):
 *    - Recommends ONLY to candidates having that branch/specialization (e.g. "BE Computers" will NOT match "BE Civil" or "BE Mechanical").
 * 3. Generic Degree / Any Requirements (e.g. "BE", "B.E/B.Tech", "BE - Any", "Diploma", "Diploma - Any", "ITI", "ITI - All Trade", "MBA", "Any Graduate", "Post-Graduate", "HSC - Any"):
 *    - Recommends to ALL candidates under that degree family (e.g. "BE" matches BE Computers, BE Civil, BE Mech, BE Electrical, etc.)!
 */

export const normalizeEducationString = (str: string): string => {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[,\/()\-|_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export type DegreeLevel =
  | 'BE_BTECH'
  | 'DIPLOMA'
  | 'ITI'
  | 'MBA'
  | 'ME_MTECH'
  | 'MCA'
  | 'BCA'
  | 'BCOM'
  | 'MCOM'
  | 'BSC'
  | 'MSC'
  | 'BA'
  | 'MA'
  | 'BBA'
  | 'BED'
  | 'MED'
  | 'PHARMA'
  | 'MEDICAL'
  | 'LAW'
  | 'HSC'
  | 'SSC'
  | 'GRADUATE_GENERIC'
  | 'POST_GRADUATE_GENERIC';

export type BranchCategory =
  | 'COMPUTER_IT'
  | 'MECHANICAL'
  | 'CIVIL'
  | 'ELECTRICAL'
  | 'ELECTRONICS'
  | 'CHEMICAL'
  | 'METALLURGY'
  | 'TEXTILE'
  | 'COMMERCE_FINANCE'
  | 'HR_MANAGEMENT'
  | 'MARKETING'
  | 'SCIENCE_BIO'
  | 'ARTS_HUMANITIES'
  | 'PHARMA_MEDICAL'
  | 'LAW'
  | 'SAFETY'
  | 'HOSPITALITY'
  | 'DESIGN'
  | 'FITTER'
  | 'ELECTRICIAN_TRADE'
  | 'WELDER'
  | 'TURNER'
  | 'MACHINIST'
  | 'PLUMBER'
  | 'CARPENTER'
  | 'DRAUGHTSMAN'
  | 'HSC_SCIENCE'
  | 'HSC_COMMERCE'
  | 'HSC_ARTS'
  | 'HSC_MCVC';

// Mapping of degree levels
const DEGREE_PATTERNS: { level: DegreeLevel; patterns: RegExp[] }[] = [
  {
    level: 'BE_BTECH',
    patterns: [
      /\b(b\.?tech|btech|b\.?e\.?|be|bachelor of technology|bachelor of engineering|graduate engineer)\b/i
    ]
  },
  {
    level: 'DIPLOMA',
    patterns: [
      /\b(diploma|polytechnic|d\.?pharm|dpharm)\b/i
    ]
  },
  {
    level: 'ITI',
    patterns: [
      /\b(iti|fitter|machinist|turner|welder|wireman|diesel mechanic|draughtsman|plumber|carpenter)\b/i
    ]
  },
  {
    level: 'ME_MTECH',
    patterns: [
      /\b(m\.?tech|mtech|m\.?e\.?|me|master of technology|master of engineering)\b/i
    ]
  },
  {
    level: 'MBA',
    patterns: [
      /\b(mba|pgdm|master of business administration|post graduate diploma in management|mpm)\b/i
    ]
  },
  {
    level: 'MCA',
    patterns: [
      /\b(mca|mcs|mcm|master of computer applications)\b/i
    ]
  },
  {
    level: 'BCA',
    patterns: [
      /\b(bca|bcs|bachelor of computer applications)\b/i
    ]
  },
  {
    level: 'BCOM',
    patterns: [
      /\b(b\.?com|bcom|bachelor of commerce)\b/i
    ]
  },
  {
    level: 'MCOM',
    patterns: [
      /\b(m\.?com|mcom|master of commerce)\b/i
    ]
  },
  {
    level: 'BSC',
    patterns: [
      /\b(b\.?sc|bsc|bachelor of science|bsw)\b/i
    ]
  },
  {
    level: 'MSC',
    patterns: [
      /\b(m\.?sc|msc|master of science|msw)\b/i
    ]
  },
  {
    level: 'BA',
    patterns: [
      /\b(b\.?a\.?|ba|bachelor of arts)\b/i
    ]
  },
  {
    level: 'MA',
    patterns: [
      /\b(m\.?a\.?|ma|master of arts)\b/i
    ]
  },
  {
    level: 'BBA',
    patterns: [
      /\b(bba|bbm|bachelor of business administration)\b/i
    ]
  },
  {
    level: 'BED',
    patterns: [
      /\b(b\.?ed|bed)\b/i
    ]
  },
  {
    level: 'MED',
    patterns: [
      /\b(m\.?ed|med)\b/i
    ]
  },
  {
    level: 'PHARMA',
    patterns: [
      /\b(b\.?pharm|bpharm|m\.?pharm|mpharm|d\.?pharm|pharmacy)\b/i
    ]
  },
  {
    level: 'MEDICAL',
    patterns: [
      /\b(bams|bhms|bds|mbbs|medical|doctor)\b/i
    ]
  },
  {
    level: 'LAW',
    patterns: [
      /\b(llb|bl\/?llb|llm|law)\b/i
    ]
  },
  {
    level: 'HSC',
    patterns: [
      /\b(hsc|12th|12th pass|higher secondary|mcvc)\b/i
    ]
  },
  {
    level: 'SSC',
    patterns: [
      /\b(ssc|10th|10th pass|secondary certificate|matric)\b/i
    ]
  },
  {
    level: 'POST_GRADUATE_GENERIC',
    patterns: [
      /\b(post[\s-]?graduate|postgraduate|pg|master|masters)\b/i
    ]
  },
  {
    level: 'GRADUATE_GENERIC',
    patterns: [
      /\b(graduate|any graduate|bachelor|bachelors|degree)\b/i
    ]
  }
];

// Mapping of branch/discipline categories
const BRANCH_PATTERNS: { branch: BranchCategory; patterns: RegExp[] }[] = [
  {
    branch: 'COMPUTER_IT',
    patterns: [
      /\b(computer|computers|cse|cs|it|information technology|software|data science|bca|mca|bcs|mcs|web designing)\b/i
    ]
  },
  {
    branch: 'MECHANICAL',
    patterns: [
      /\b(mechanical|mech|automobile|automotive|tool\s*(&|and)?\s*die|production|industrial engineering|mechatronics)\b/i
    ]
  },
  {
    branch: 'CIVIL',
    patterns: [
      /\b(civil|construction|structural|architecture|b\.?arch|interior design|site)\b/i
    ]
  },
  {
    branch: 'ELECTRICAL',
    patterns: [
      /\b(electrical|eee|power systems?)\b/i
    ]
  },
  {
    branch: 'ELECTRONICS',
    patterns: [
      /\b(electronics|e&tc|etc|ece|telecommunication|telecommunications|instrumentation|vlsi|embedded)\b/i
    ]
  },
  {
    branch: 'CHEMICAL',
    patterns: [
      /\b(chemical|plastic|polymer|petrochemical)\b/i
    ]
  },
  {
    branch: 'METALLURGY',
    patterns: [
      /\b(metallurgy|mining)\b/i
    ]
  },
  {
    branch: 'TEXTILE',
    patterns: [
      /\b(textile)\b/i
    ]
  },
  {
    branch: 'COMMERCE_FINANCE',
    patterns: [
      /\b(commerce|b\.?com|m\.?com|finance|accounting|accounts|tax|taxation|ca|icwa|cma|auditing|banking|insurance)\b/i
    ]
  },
  {
    branch: 'HR_MANAGEMENT',
    patterns: [
      /\b(hr|human resource|human resources|personnel|mpm|operations|logistics|supply chain|bba|bbm|msw|management)\b/i
    ]
  },
  {
    branch: 'MARKETING',
    patterns: [
      /\b(marketing|sales|digital marketing)\b/i
    ]
  },
  {
    branch: 'SCIENCE_BIO',
    patterns: [
      /\b(microbiology|biotech|biotechnology|physics|chemistry|biology|botany|zoology)\b/i
    ]
  },
  {
    branch: 'ARTS_HUMANITIES',
    patterns: [
      /\b(arts|economics|literature|sociology|history|psychology|political)\b/i
    ]
  },
  {
    branch: 'SAFETY',
    patterns: [
      /\b(fire\s*(&|and)?\s*safety|safety|environmental health)\b/i
    ]
  },
  {
    branch: 'HOSPITALITY',
    patterns: [
      /\b(hotel management|hospitality|tourism|travel)\b/i
    ]
  },
  {
    branch: 'DESIGN',
    patterns: [
      /\b(fashion design|graphic design|visual arts)\b/i
    ]
  },
  {
    branch: 'FITTER',
    patterns: [
      /\b(fitter)\b/i
    ]
  },
  {
    branch: 'ELECTRICIAN_TRADE',
    patterns: [
      /\b(electrician|wireman)\b/i
    ]
  },
  {
    branch: 'WELDER',
    patterns: [
      /\b(welder)\b/i
    ]
  },
  {
    branch: 'TURNER',
    patterns: [
      /\b(turner)\b/i
    ]
  },
  {
    branch: 'MACHINIST',
    patterns: [
      /\b(machinist)\b/i
    ]
  },
  {
    branch: 'PLUMBER',
    patterns: [
      /\b(plumber)\b/i
    ]
  },
  {
    branch: 'CARPENTER',
    patterns: [
      /\b(carpenter)\b/i
    ]
  },
  {
    branch: 'DRAUGHTSMAN',
    patterns: [
      /\b(draughtsman)\b/i
    ]
  },
  {
    branch: 'HSC_SCIENCE',
    patterns: [
      /\b(hsc science|12th science)\b/i
    ]
  },
  {
    branch: 'HSC_COMMERCE',
    patterns: [
      /\b(hsc commerce|12th commerce)\b/i
    ]
  },
  {
    branch: 'HSC_ARTS',
    patterns: [
      /\b(hsc arts|12th arts)\b/i
    ]
  },
  {
    branch: 'HSC_MCVC',
    patterns: [
      /\b(mcvc)\b/i
    ]
  }
];

export function detectDegreeLevels(text: string): DegreeLevel[] {
  const norm = normalizeEducationString(text);
  const found: DegreeLevel[] = [];

  for (const { level, patterns } of DEGREE_PATTERNS) {
    if (patterns.some(p => p.test(norm) || p.test(text))) {
      if (!found.includes(level)) found.push(level);
    }
  }

  return found;
}

export function detectBranches(text: string): BranchCategory[] {
  const norm = normalizeEducationString(text);
  const found: BranchCategory[] = [];

  for (const { branch, patterns } of BRANCH_PATTERNS) {
    if (patterns.some(p => p.test(norm) || p.test(text))) {
      if (!found.includes(branch)) found.push(branch);
    }
  }

  return found;
}

/**
 * Checks if a candidate's qualification satisfies a single education requirement option.
 */
export function checkSingleRequirementMatch(candidateEdu: string, reqOption: string): boolean {
  if (!reqOption || !reqOption.trim()) return true;
  if (!candidateEdu || !candidateEdu.trim()) return false;

  const candNorm = normalizeEducationString(candidateEdu);
  const reqNorm = normalizeEducationString(reqOption);

  // 1. Exact phrase match
  if (candNorm === reqNorm || candidateEdu.toLowerCase().trim() === reqOption.toLowerCase().trim()) {
    return true;
  }

  // 2. Open / Universal requirement terms
  if (/^(any|all|no preference|open|n\/a|none|not specified|as per job description|as per jd|other)$/i.test(reqNorm)) {
    return true;
  }
  if (/^(any|other qualification|not applicable)$/i.test(candNorm)) {
    return true;
  }

  const candLevels = detectDegreeLevels(candidateEdu);
  const reqLevels = detectDegreeLevels(reqOption);

  const candBranches = detectBranches(candidateEdu);
  const reqBranches = detectBranches(reqOption);

  // Check if requirement is completely generic "Any Graduate" or "Graduate"
  const isReqAnyGraduate = /^(any graduate|graduate|graduate - any|bachelor|bachelors)$/i.test(reqNorm) ||
    (reqLevels.includes('GRADUATE_GENERIC') && reqBranches.length === 0);

  if (isReqAnyGraduate) {
    const isGraduateCandidate = candLevels.some(l => [
      'BE_BTECH', 'BCOM', 'BSC', 'BA', 'BCA', 'BBA', 'BED', 'PHARMA', 'MEDICAL', 'LAW', 'GRADUATE_GENERIC'
    ].includes(l));
    if (isGraduateCandidate) return true;
  }

  // Check if requirement is completely generic "Post-Graduate" or "Post Graduate - Any"
  const isReqAnyPostGraduate = /^(post[\s-]?graduate|post graduate - any|pg|master|masters)$/i.test(reqNorm) ||
    (reqLevels.includes('POST_GRADUATE_GENERIC') && reqBranches.length === 0);

  if (isReqAnyPostGraduate) {
    const isPostGraduateCandidate = candLevels.some(l => [
      'ME_MTECH', 'MBA', 'MCA', 'MCOM', 'MSC', 'MA', 'MED', 'PHARMA', 'POST_GRADUATE_GENERIC'
    ].includes(l));
    if (isPostGraduateCandidate) return true;
  }

  // Check if requirement is generic "BE" / "B.E/B.Tech" / "BE - Any" / "BTech" without branch
  const isReqGenericBE = (
    reqLevels.includes('BE_BTECH') &&
    (reqBranches.length === 0 || /^(be|b\.?e\.?|b\.?tech|btech|b\.?e\/?b\.?tech|be other|be - any|be any)$/i.test(reqNorm))
  );

  if (isReqGenericBE) {
    if (candLevels.includes('BE_BTECH')) {
      return true; // Matches ALL BE specializations (BE Comp, BE Civil, BE Mech, BE Electrical, etc.)!
    }
  }

  // Check if requirement is generic "Diploma" / "Diploma - Any" without branch
  const isReqGenericDiploma = (
    reqLevels.includes('DIPLOMA') &&
    (reqBranches.length === 0 || /^(diploma|diploma - any|diploma any|polytechnic)$/i.test(reqNorm))
  );

  if (isReqGenericDiploma) {
    if (candLevels.includes('DIPLOMA')) {
      return true; // Matches ALL Diploma specializations!
    }
  }

  // Check if requirement is generic "ITI" / "ITI - All Trade" without specific trade
  const isReqGenericITI = (
    reqLevels.includes('ITI') &&
    (reqBranches.length === 0 || /^(iti|iti - all trade|iti all trade|iti any)$/i.test(reqNorm))
  );

  if (isReqGenericITI) {
    if (candLevels.includes('ITI')) {
      return true; // Matches ALL ITI trades!
    }
  }

  // Check if requirement is generic "MBA" / "MBA Other" without specific specialization
  const isReqGenericMBA = (
    reqLevels.includes('MBA') &&
    (reqBranches.length === 0 || /^(mba|mba other|mba any|pgdm)$/i.test(reqNorm))
  );

  if (isReqGenericMBA) {
    if (candLevels.includes('MBA')) {
      return true; // Matches ALL MBA specializations!
    }
  }

  // Check if requirement is generic "HSC" / "HSC - Any" without specific stream
  const isReqGenericHSC = (
    reqLevels.includes('HSC') &&
    (reqBranches.length === 0 || /^(hsc|hsc - any|hsc any|12th|12th pass)$/i.test(reqNorm))
  );

  if (isReqGenericHSC) {
    if (candLevels.includes('HSC')) {
      return true; // Matches ALL HSC streams!
    }
  }

  // Check if requirement is "SSC"
  const isReqSSC = reqLevels.includes('SSC') || /^(ssc|10th|10th pass|pass|fail)$/i.test(reqNorm);
  if (isReqSSC) {
    if (candLevels.includes('SSC') || /pass|fail|ssc|10th/i.test(candNorm)) {
      return true;
    }
  }

  // Specific Degree Level compatibility check
  let levelMatches = false;
  if (reqLevels.length === 0) {
    levelMatches = true; // No degree level required, e.g. only branch "Mechanical"
  } else {
    for (const rl of reqLevels) {
      if (candLevels.includes(rl)) {
        levelMatches = true;
        break;
      }
      // BE/BTech matches Generic Graduate
      if (rl === 'GRADUATE_GENERIC' && (
        candLevels.includes('BE_BTECH') || candLevels.includes('BCOM') ||
        candLevels.includes('BSC') || candLevels.includes('BA') ||
        candLevels.includes('BCA') || candLevels.includes('BBA')
      )) {
        levelMatches = true;
        break;
      }
      // MTech / MBA / MCA matches Generic Post-Graduate
      if (rl === 'POST_GRADUATE_GENERIC' && (
        candLevels.includes('ME_MTECH') || candLevels.includes('MBA') ||
        candLevels.includes('MCA') || candLevels.includes('MCOM') ||
        candLevels.includes('MSC') || candLevels.includes('MA')
      )) {
        levelMatches = true;
        break;
      }
    }
  }

  if (!levelMatches) {
    return false;
  }

  // Specific Branch / Specialization check
  if (reqBranches.length > 0) {
    let branchMatches = false;
    for (const rb of reqBranches) {
      if (candBranches.includes(rb)) {
        branchMatches = true;
        break;
      }
      // IT and Computer Science are interchangeable
      if ((rb === 'COMPUTER_IT') && candBranches.includes('COMPUTER_IT')) {
        branchMatches = true;
        break;
      }
      // Electrical and Electronics cross-compatibility where relevant
      if ((rb === 'ELECTRONICS') && (candBranches.includes('ELECTRONICS') || candBranches.includes('ELECTRICAL'))) {
        branchMatches = true;
        break;
      }
      // Mechanical and Automobile cross-compatibility where relevant
      if ((rb === 'MECHANICAL') && (candBranches.includes('MECHANICAL'))) {
        branchMatches = true;
        break;
      }
    }

    if (!branchMatches) {
      return false; // Candidate is different branch (e.g. BE Civil applying for BE Computers)
    }

    return true; // Level matches AND branch matches!
  }

  // If level matched and requirement didn't specify any restrictive branch
  return true;
}

/**
 * Splits complex multi-education strings into clean distinct requirement options.
 * Correctly fixes concatenated/unseparated strings like "Graduate - Any GraduateGraduate - B.Com".
 */
export function splitEducationRequirements(requiredEdu: string | string[] | undefined | null): string[] {
  if (!requiredEdu) return [];
  if (Array.isArray(requiredEdu)) {
    return requiredEdu.flatMap(e => splitEducationRequirements(e)).filter(Boolean);
  }

  let raw = String(requiredEdu).trim();
  if (!raw) return [];

  // Fix unseparated concatenated strings, e.g. "Graduate - Any GraduateGraduate - B.Com" -> "Graduate - Any Graduate, Graduate - B.Com"
  raw = raw.replace(/([a-z0-9\)])(?=(?:Diploma|Graduate|HSC|ITI|Post-Graduate|SSC|B\.?E|B\.?Tech|MCA|BCA|B\.?Com|M\.?Com|B\.?Sc|M\.?Sc|MBA)\s*-\s*)/g, '$1, ');
  raw = raw.replace(/([a-z0-9\)])(?=(?:Diploma|Graduate|HSC|ITI|Post-Graduate|SSC)\b)/g, '$1, ');

  // Protect acronyms that contain slashes before splitting:
  // e.g. "B.E/B.Tech", "M.E/M.Tech/MS", "BL/LLB", "Electronics/Telecommunications", "Production/Industrial"
  const protectedReq = raw
    .replace(/b\.?e\s*\/\s*b\.?tech/gi, 'B.E_B.Tech')
    .replace(/m\.?e\s*\/\s*m\.?tech\s*\/\s*ms/gi, 'M.E_M.Tech_MS')
    .replace(/bl\s*\/\s*llb/gi, 'BL_LLB')
    .replace(/electronics\s*\/\s*telecommunications?/gi, 'Electronics_Telecommunications')
    .replace(/production\s*\/\s*industrial/gi, 'Production_Industrial');

  // Split into individual requirement options by comma, semicolon, pipe, newline, or " or "
  const rawOptions = protectedReq
    .split(/,|\n|;|\||\b\s+or\s+\b|\s+\/\s+/)
    .map(o => o.replace(/_/g, '/').trim())
    .filter(Boolean);

  return Array.from(new Set(rawOptions));
}

/**
 * Returns detailed match breakdown of all required education options vs candidate education.
 * Highlights which specific options matched the candidate.
 */
export function getEducationMatchDetails(candidateEdu: string, requiredEdu: string | string[] | undefined | null): {
  allOptions: string[];
  matchedOptions: string[];
  isMatch: boolean;
} {
  const allOptions = splitEducationRequirements(requiredEdu);
  if (allOptions.length === 0) {
    return { allOptions: ['Any Qualification'], matchedOptions: ['Any Qualification'], isMatch: true };
  }

  const candTrim = (candidateEdu || '').trim();
  if (!candTrim) {
    const isAny = allOptions.some(o => /^(any|all|open|n\/a|none|not specified|as per job description|as per jd)$/i.test(o));
    return { allOptions, matchedOptions: isAny ? allOptions : [], isMatch: isAny };
  }

  const matchedOptions = allOptions.filter(opt => checkSingleRequirementMatch(candTrim, opt));

  return {
    allOptions,
    matchedOptions,
    isMatch: matchedOptions.length > 0
  };
}

/**
 * Main matcher: checks if candidate's qualification satisfies the job's required education.
 * Supports multi-qualification options separated by comma, slash, semicolon, or "or".
 * If ONE option matches, returns true (100% Match).
 */
export function isEducationMatching(candidateEdu: string, requiredEdu: string | string[]): boolean {
  if (!requiredEdu) return true;
  if (!candidateEdu || !candidateEdu.trim()) return false;

  const { isMatch } = getEducationMatchDetails(candidateEdu, requiredEdu);
  return isMatch;
}

