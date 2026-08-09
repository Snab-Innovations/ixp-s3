/**
 * Education & Qualification Matching Utility
 *
 * Handles intelligent matching between job education requirements and candidate qualifications.
 * Supports:
 * - Multi-option education requirements (comma, slash, semicolon, pipe, "or" separated strings)
 * - Equivalent degree titles (B.Tech, B.E., Bachelor of Technology, Bachelor of Engineering, Graduate BE, etc.)
 * - Diploma trades & Polytechnic equivalents
 * - Discipline / Branch matching (Mechanical, Civil, Computer Science / CSE, Electrical, Electronics, HR, Finance, etc.)
 * - Open / Universal education terms (Any Graduate, Open, N/A, As per Job Description, etc.)
 */

// Helper to normalize education text by removing special punctuation and excessive whitespace
export const normalizeEducationString = (str: string): string => {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[,\/()\-|_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// Degree equivalence groups mapping
const DEGREE_GROUPS: { name: string; patterns: string[] }[] = [
  {
    name: 'BE_BTECH',
    patterns: [
      'b.tech', 'btech', 'b.e', 'be', 'bachelor of technology', 'bachelor of engineering',
      'graduate be', 'graduate btech', 'graduate engineer', 'engineering degree',
      'b tech', 'b e'
    ]
  },
  {
    name: 'DIPLOMA',
    patterns: [
      'diploma', 'polytechnic', 'diploma in engineering', 'diploma diploma', 'd.pharm', 'dpharm'
    ]
  },
  {
    name: 'ME_MTECH',
    patterns: [
      'm.tech', 'mtech', 'm.e', 'me', 'master of technology', 'master of engineering', 'm tech', 'm e'
    ]
  },
  {
    name: 'MBA_PGDM',
    patterns: [
      'mba', 'pgdm', 'master of business administration', 'post graduate diploma in management'
    ]
  },
  {
    name: 'BBA_BBM',
    patterns: [
      'bba', 'bbm', 'bachelor of business administration'
    ]
  },
  {
    name: 'BCA',
    patterns: [
      'bca', 'bachelor of computer applications'
    ]
  },
  {
    name: 'MCA',
    patterns: [
      'mca', 'master of computer applications'
    ]
  },
  {
    name: 'BCOM',
    patterns: [
      'b.com', 'bcom', 'bachelor of commerce'
    ]
  },
  {
    name: 'MCOM',
    patterns: [
      'm.com', 'mcom', 'master of commerce'
    ]
  },
  {
    name: 'BSC',
    patterns: [
      'b.sc', 'bsc', 'bachelor of science'
    ]
  },
  {
    name: 'MSC',
    patterns: [
      'm.sc', 'msc', 'master of science'
    ]
  },
  {
    name: 'BA',
    patterns: [
      'b.a', 'ba', 'bachelor of arts'
    ]
  },
  {
    name: 'MA',
    patterns: [
      'm.a', 'ma', 'master of arts'
    ]
  },
  {
    name: 'TWELFTH',
    patterns: [
      '12th', 'hsc', 'higher secondary', '12th pass'
    ]
  },
  {
    name: 'TENTH',
    patterns: [
      '10th', 'ssc', 'secondary certificate', '10th pass'
    ]
  },
  {
    name: 'PHD',
    patterns: [
      'ph.d', 'phd', 'doctorate'
    ]
  }
];

// Branch / Discipline equivalence groups mapping
const BRANCH_GROUPS: { name: string; keywords: string[] }[] = [
  {
    name: 'MECHANICAL',
    keywords: ['mechanical', 'mech', 'automobile', 'automotive', 'tool & die', 'mechatronics']
  },
  {
    name: 'CIVIL',
    keywords: ['civil', 'structural', 'construction', 'architecture', 'interior']
  },
  {
    name: 'COMPUTER_SCIENCE',
    keywords: ['computer', 'cse', 'cs', 'it', 'information technology', 'software', 'data science', 'computer science & engineering']
  },
  {
    name: 'ELECTRICAL',
    keywords: ['electrical', 'eee', 'power system']
  },
  {
    name: 'ELECTRONICS',
    keywords: ['electronics', 'e&tc', 'etc', 'ece', 'telecommunication', 'vlsi', 'embedded', 'instrumentation']
  },
  {
    name: 'CHEMICAL',
    keywords: ['chemical']
  },
  {
    name: 'BIOTECH',
    keywords: ['biotechnology', 'biotech', 'bio', 'microbiology']
  },
  {
    name: 'FINANCE',
    keywords: ['finance', 'accounting', 'auditing', 'tax', 'banking']
  },
  {
    name: 'HR',
    keywords: ['hr', 'human resource']
  },
  {
    name: 'MARKETING',
    keywords: ['marketing', 'sales']
  }
];

export function getDegreeGroups(text: string): string[] {
  const norm = normalizeEducationString(text);
  const found: string[] = [];

  for (const group of DEGREE_GROUPS) {
    for (const pat of group.patterns) {
      const escaped = pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, 'i');
      if (regex.test(norm) || norm.includes(pat)) {
        if (!found.includes(group.name)) found.push(group.name);
        break;
      }
    }
  }

  // Handle generic "graduate" keyword
  if (found.length === 0 && /\b(graduate|bachelor|bachelors|degree)\b/i.test(norm)) {
    found.push('GRADUATE_GENERIC');
  }

  return found;
}

export function getBranchGroups(text: string): string[] {
  const norm = normalizeEducationString(text);
  const found: string[] = [];

  for (const group of BRANCH_GROUPS) {
    for (const kw of group.keywords) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, 'i');
      if (regex.test(norm)) {
        if (!found.includes(group.name)) found.push(group.name);
        break;
      }
    }
  }

  return found;
}

/**
 * Compares candidate qualification string against a single required qualification option.
 */
export function checkSingleRequirementMatch(candidateEdu: string, reqOption: string): boolean {
  const candNorm = normalizeEducationString(candidateEdu);
  const reqNorm = normalizeEducationString(reqOption);

  if (!candNorm || !reqNorm) return true;

  // 1. Direct or partial substring inclusion
  if (candNorm.includes(reqNorm) || reqNorm.includes(candNorm)) {
    return true;
  }

  // 2. Open / Universal requirement terms
  if (/\b(any|all|no preference|open|n\/a|none|not specified|as per job description)\b/i.test(reqNorm)) {
    return true;
  }
  if (/\b(any|other qualification)\b/i.test(candNorm)) {
    return true;
  }

  // 3. Extract Degree and Branch Groups
  const candDegrees = getDegreeGroups(candidateEdu);
  const reqDegrees = getDegreeGroups(reqOption);

  const candBranches = getBranchGroups(candidateEdu);
  const reqBranches = getBranchGroups(reqOption);

  // Degree compatibility check
  let degreeMatches = false;
  if (reqDegrees.length === 0) {
    // Required option doesn't specify a degree group (e.g. only branch "Mechanical")
    degreeMatches = true;
  } else {
    for (const reqDeg of reqDegrees) {
      if (candDegrees.includes(reqDeg)) {
        degreeMatches = true;
        break;
      }
      // If req is GRADUATE_GENERIC, any Bachelor degree or BE/B.Tech matches
      if (reqDeg === 'GRADUATE_GENERIC' && (
        candDegrees.includes('BE_BTECH') || candDegrees.includes('BCOM') ||
        candDegrees.includes('BSC') || candDegrees.includes('BA') ||
        candDegrees.includes('BCA') || candDegrees.includes('BBA_BBM') ||
        candDegrees.includes('GRADUATE_GENERIC')
      )) {
        degreeMatches = true;
        break;
      }
      // If candidate is BE_BTECH, and req is GRADUATE_GENERIC or BE_BTECH
      if (candDegrees.includes('BE_BTECH') && (reqDeg === 'BE_BTECH' || reqDeg === 'GRADUATE_GENERIC')) {
        degreeMatches = true;
        break;
      }
    }
  }

  if (!degreeMatches) {
    return false;
  }

  // Branch compatibility check
  let branchMatches = false;
  if (reqBranches.length === 0) {
    // Required option doesn't specify a branch (e.g. "Graduate BE" or "Any Graduate")
    branchMatches = true;
  } else {
    for (const reqBr of reqBranches) {
      if (candBranches.includes(reqBr)) {
        branchMatches = true;
        break;
      }
    }
  }

  if (degreeMatches && branchMatches) {
    return true;
  }

  // Fallback: Word token overlap ratio
  const stopWords = new Set(['graduate', 'degree', 'qualification', 'diploma', 'in', 'and', '&', 'of', 'for', 'or', 'with', 'the', 'b.tech', 'b.e', 'btech', 'be']);
  const reqTokens = reqNorm.split(/\s+/).filter(t => t.length > 2 && !stopWords.has(t));
  const candTokens = new Set(candNorm.split(/\s+/).filter(t => t.length > 2 && !stopWords.has(t)));

  if (reqTokens.length > 0) {
    const matchedTokensCount = reqTokens.filter(t => candTokens.has(t) || candNorm.includes(t)).length;
    if (matchedTokensCount / reqTokens.length >= 0.5) {
      return true;
    }
  }

  return false;
}

/**
 * Main function: checks if candidate's qualification satisfies the job's required education.
 * Handles multi-qualification options in requiredEdu separated by comma, slash, semicolon, or "or".
 */
export function isEducationMatching(candidateEdu: string, requiredEdu: string): boolean {
  if (!requiredEdu || !requiredEdu.trim()) return true;
  if (!candidateEdu || !candidateEdu.trim()) return true;

  const reqTrim = requiredEdu.trim();
  const candTrim = candidateEdu.trim();

  // If required is "Any", "All", "No Preference", etc.
  if (/^(any|all|open|n\/a|none|not specified|as per job description|as per jd)$/i.test(reqTrim)) {
    return true;
  }

  // Split requiredEdu into individual options by comma, semicolon, pipe, slash (when separated by spaces or between options), or "or"
  const rawOptions = reqTrim
    .split(/,|\n|;|\||\b\s+or\s+\b|\s+\/\s+/)
    .map(o => o.trim())
    .filter(Boolean);

  if (rawOptions.length === 0) return true;

  // Check if candidate matches ANY ONE of the required options
  for (const option of rawOptions) {
    if (checkSingleRequirementMatch(candTrim, option)) {
      return true; // Match found!
    }
  }

  return false; // No matching option found -> Mismatch
}
