/**
 * Precision Education & Qualification Matching Engine
 *
 * Core Rules:
 * 1. Specific Specializations:
 *    - "Graduate - B.Sc" / "B.Sc" / "B.Sc - Agriculture" -> Matches ONLY B.Sc candidates (NOT BE Computers, NOT B.A, NOT B.Com).
 *    - "Graduate - B.A" / "B.A" -> Matches ONLY B.A candidates.
 *    - "Graduate - B.Com" / "B.Com" -> Matches ONLY B.Com / Commerce candidates.
 *    - "BE Computers" / "BSc Computer Science" / "BCA" -> Matches ONLY Computer/IT candidates (NOT BE Civil, NOT BE Mechanical).
 *    - "BE Civil" -> Matches ONLY Civil candidates (NOT BE Mech, NOT BE Comp).
 *    - "BE Mechanical" -> Matches ONLY Mechanical/Automobile candidates.
 *    - "Diploma Mechanical" -> Matches ONLY Diploma Mechanical candidates.
 *    - "Diploma Civil" -> Matches ONLY Diploma Civil candidates.
 *    - "ITI Electrician" -> Matches ONLY ITI Electrician candidates.
 *
 * 2. Generic Degree Families:
 *    - "Graduate - Any" / "Any Graduate" / "Graduate" -> Matches ALL Graduate candidates (B.Sc, B.A, B.Com, BE, BCA, BBA, etc.).
 *    - "BE" / "B.E/B.Tech" / "BE - Any" / "BTech" -> Matches ALL BE specializations (BE Comp, BE Civil, BE Mech, BE Electrical, etc.).
 *    - "Diploma" / "Diploma - Any" -> Matches ALL Diploma specializations.
 *    - "ITI" / "ITI - All Trade" -> Matches ALL ITI trades.
 *    - "Post-Graduate" / "Post Graduate - Any" -> Matches ALL Post-Graduate candidates.
 *    - "MBA" / "MBA Other" -> Matches ALL MBA candidates.
 *    - "HSC" / "HSC - Any" -> Matches ALL HSC candidates.
 *
 * 3. Multi-Education JDs (e.g. "BE Computer, Diploma Computers, MCA"):
 *    - If candidate satisfies ANY ONE of the required options -> 100% Match!
 */

export const normalizeEducationString = (str: string): string => {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[,\/()\-|_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export type EduFamily =
  | 'GRADUATE_ANY'
  | 'BE_ANY'
  | 'BE_COMPUTERS'
  | 'BE_CIVIL'
  | 'BE_MECHANICAL'
  | 'BE_ELECTRICAL'
  | 'BE_ELECTRONICS'
  | 'BE_CHEMICAL'
  | 'BE_METALLURGY'
  | 'BE_TEXTILE'
  | 'BE_OTHER'
  | 'BSC'
  | 'BSC_COMPUTERS'
  | 'BSC_MICROBIOLOGY'
  | 'BA'
  | 'BCOM'
  | 'BBA'
  | 'BCA'
  | 'BARCH'
  | 'BED'
  | 'BPHARM'
  | 'MEDICAL'
  | 'LAW'
  | 'DIPLOMA_ANY'
  | 'DIPLOMA_MECHANICAL'
  | 'DIPLOMA_CIVIL'
  | 'DIPLOMA_COMPUTERS'
  | 'DIPLOMA_ELECTRICAL'
  | 'DIPLOMA_ELECTRONICS'
  | 'DIPLOMA_CHEMICAL'
  | 'DIPLOMA_OTHER'
  | 'ITI_ANY'
  | 'ITI_ELECTRICIAN'
  | 'ITI_FITTER'
  | 'ITI_WELDER'
  | 'ITI_MACHINIST'
  | 'ITI_AUTOMOBILE'
  | 'ITI_OTHER'
  | 'POST_GRADUATE_ANY'
  | 'MBA_ANY'
  | 'MBA_FINANCE'
  | 'MBA_HR'
  | 'MBA_MARKETING'
  | 'MBA_OPERATIONS'
  | 'MCA'
  | 'ME_MTECH'
  | 'MCOM'
  | 'MSC'
  | 'MA'
  | 'HSC_ANY'
  | 'HSC_SCIENCE'
  | 'HSC_COMMERCE'
  | 'HSC_ARTS'
  | 'HSC_MCVC'
  | 'SSC_ANY'
  | 'OPEN_ANY';

/**
 * Classifies an education string into a specific canonical EduFamily.
 */
export function classifyEducationString(raw: string): EduFamily {
  if (!raw || !raw.trim()) return 'OPEN_ANY';
  const text = raw.toLowerCase().trim();

  // Strip qualification prefixes like "Graduate - ", "Diploma - ", "ITI - ", "Post-Graduate - ", "HSC - "
  const stripped = text
    .replace(/^(graduate|diploma|iti|post[\s-]?graduate|hsc|ssc)\s*-\s*/i, '')
    .trim();

  // 1. Open / Universal Any
  if (/^(any|all|open|n\/a|none|not specified|as per job description|as per jd|any qualification)$/i.test(stripped) ||
      /^(any|all|open|n\/a|none|not specified)$/i.test(text)) {
    return 'OPEN_ANY';
  }

  // 2. Generic Graduate (Any Graduate)
  if (/^(any graduate|graduate|graduate - any|graduate any|any degree|bachelor|bachelors)$/i.test(stripped) ||
      /^(any graduate|graduate|graduate - any|graduate any|any degree)$/i.test(text)) {
    return 'GRADUATE_ANY';
  }

  // 3. Generic Post-Graduate
  if (/^(post[\s-]?graduate|post graduate - any|post graduate any|pg|master|masters)$/i.test(stripped) ||
      /^(post[\s-]?graduate|post graduate - any|post graduate any)$/i.test(text)) {
    return 'POST_GRADUATE_ANY';
  }

  // 4. BE / B.Tech Family
  if (/\b(b\.?tech|btech|b\.?e\.?|be|bachelor of engineering|bachelor of technology)\b/i.test(stripped) ||
      /\b(b\.?tech|btech|b\.?e\.?|be)\b/i.test(text)) {
    // Specific BE branches:
    if (/\b(computer|computers|cse|cs|it|information technology|software)\b/i.test(stripped)) return 'BE_COMPUTERS';
    if (/\b(civil|construction|structural)\b/i.test(stripped)) return 'BE_CIVIL';
    if (/\b(mechanical|mech|automobile|automotive|tool\s*(&|and)?\s*die|production|industrial)\b/i.test(stripped)) return 'BE_MECHANICAL';
    if (/\b(electrical|eee|power)\b/i.test(stripped)) return 'BE_ELECTRICAL';
    if (/\b(electronics|e&tc|etc|ece|telecommunication|telecommunications|instrumentation)\b/i.test(stripped)) return 'BE_ELECTRONICS';
    if (/\b(chemical|plastic|polymer)\b/i.test(stripped)) return 'BE_CHEMICAL';
    if (/\b(metallurgy|mining)\b/i.test(stripped)) return 'BE_METALLURGY';
    if (/\b(textile)\b/i.test(stripped)) return 'BE_TEXTILE';
    // Generic BE:
    return 'BE_ANY';
  }

  // 5. Diploma Family
  if (/\b(diploma|polytechnic)\b/i.test(stripped) || /\b(diploma|polytechnic)\b/i.test(text)) {
    if (/^(diploma - any|diploma any|diploma)$/i.test(stripped) || /^(diploma - any|diploma any|diploma)$/i.test(text)) {
      return 'DIPLOMA_ANY';
    }
    if (/\b(mechanical|mech|automobile|automotive|tool\s*(&|and)?\s*die|production|industrial)\b/i.test(stripped)) return 'DIPLOMA_MECHANICAL';
    if (/\b(civil|construction|structural|architecture)\b/i.test(stripped)) return 'DIPLOMA_CIVIL';
    if (/\b(computer|computers|cse|cs|it|information technology|web designing)\b/i.test(stripped)) return 'DIPLOMA_COMPUTERS';
    if (/\b(electrical|eee)\b/i.test(stripped)) return 'DIPLOMA_ELECTRICAL';
    if (/\b(electronics|e&tc|etc|ece|telecommunication|telecommunications)\b/i.test(stripped)) return 'DIPLOMA_ELECTRONICS';
    if (/\b(chemical|plastic|polymer)\b/i.test(stripped)) return 'DIPLOMA_CHEMICAL';
    return 'DIPLOMA_ANY';
  }

  // 6. ITI Family
  if (/\b(iti|fitter|machinist|turner|welder|wireman|electrician|plumber|carpenter|diesel mechanic)\b/i.test(stripped) ||
      /\b(iti)\b/i.test(text)) {
    if (/^(iti - all trade|iti all trade|iti any|iti)$/i.test(stripped) || /^(iti - all trade|iti all trade|iti any|iti)$/i.test(text)) {
      return 'ITI_ANY';
    }
    if (/\b(electrician|wireman)\b/i.test(stripped)) return 'ITI_ELECTRICIAN';
    if (/\b(fitter)\b/i.test(stripped)) return 'ITI_FITTER';
    if (/\b(welder)\b/i.test(stripped)) return 'ITI_WELDER';
    if (/\b(machinist|turner)\b/i.test(stripped)) return 'ITI_MACHINIST';
    if (/\b(automobile|diesel mechanic|mechanic)\b/i.test(stripped)) return 'ITI_AUTOMOBILE';
    return 'ITI_ANY';
  }

  // 7. Post-Graduate / MBA Family
  if (/\b(mba|pgdm|mpm)\b/i.test(stripped)) {
    if (/\b(finance|accounting)\b/i.test(stripped)) return 'MBA_FINANCE';
    if (/\b(hr|human resource|human resources|personnel)\b/i.test(stripped)) return 'MBA_HR';
    if (/\b(marketing|sales)\b/i.test(stripped)) return 'MBA_MARKETING';
    if (/\b(operations|logistics|supply chain)\b/i.test(stripped)) return 'MBA_OPERATIONS';
    return 'MBA_ANY';
  }
  if (/\b(mca|mcm|mcs)\b/i.test(stripped)) return 'MCA';
  if (/\b(m\.?tech|mtech|m\.?e\.?|me)\b/i.test(stripped)) return 'ME_MTECH';
  if (/\b(m\.?com|mcom)\b/i.test(stripped)) return 'MCOM';
  if (/\b(m\.?sc|msc)\b/i.test(stripped)) return 'MSC';
  if (/\b(m\.?a\.?|ma)\b/i.test(stripped)) return 'MA';

  // 8. Individual Graduate Degrees:
  // BCA / BCS
  if (/\b(bca|bcs)\b/i.test(stripped)) return 'BCA';

  // B.Sc (Bachelor of Science)
  if (/\b(b\.?sc|bsc|bachelor of science)\b/i.test(stripped)) {
    if (/\b(computer|computers|cs|it)\b/i.test(stripped)) return 'BSC_COMPUTERS';
    if (/\b(microbiology|biotech|biotechnology)\b/i.test(stripped)) return 'BSC_MICROBIOLOGY';
    return 'BSC';
  }

  // B.A (Bachelor of Arts)
  if (/\b(b\.?a\.?|ba|bachelor of arts)\b/i.test(stripped)) return 'BA';

  // B.Com (Bachelor of Commerce)
  if (/\b(b\.?com|bcom|bachelor of commerce|ca|icwa)\b/i.test(stripped)) return 'BCOM';

  // BBA / BBM
  if (/\b(bba|bbm|bachelor of business administration)\b/i.test(stripped)) return 'BBA';

  // B.Arch
  if (/\b(b\.?arch|barch|architecture)\b/i.test(stripped)) return 'BARCH';

  // B.Ed
  if (/\b(b\.?ed|bed)\b/i.test(stripped)) return 'BED';

  // B.Pharm / Pharmacy
  if (/\b(b\.?pharm|bpharm|pharmacy)\b/i.test(stripped)) return 'BPHARM';

  // Medical
  if (/\b(bams|bhms|bds|mbbs|medical)\b/i.test(stripped)) return 'MEDICAL';

  // Law
  if (/\b(bl\/?llb|llb|law)\b/i.test(stripped)) return 'LAW';

  // 9. HSC (12th)
  if (/\b(hsc|12th|mcvc)\b/i.test(stripped) || /\b(hsc|12th)\b/i.test(text)) {
    if (/\b(science)\b/i.test(stripped)) return 'HSC_SCIENCE';
    if (/\b(commerce)\b/i.test(stripped)) return 'HSC_COMMERCE';
    if (/\b(arts)\b/i.test(stripped)) return 'HSC_ARTS';
    if (/\b(mcvc)\b/i.test(stripped)) return 'HSC_MCVC';
    return 'HSC_ANY';
  }

  // 10. SSC (10th)
  if (/\b(ssc|10th|pass|fail)\b/i.test(stripped) || /\b(ssc|10th)\b/i.test(text)) {
    return 'SSC_ANY';
  }

  // Fallback: Check if original text had "Computer"
  if (/\b(computer|computers|software|it)\b/i.test(text)) return 'BE_COMPUTERS';

  return 'OPEN_ANY';
}

/**
 * Evaluates whether a candidate's classified education satisfies the required education option.
 */
export function matchesEduFamily(candidateFamily: EduFamily, requiredFamily: EduFamily, rawCand: string, rawReq: string): boolean {
  // 1. If requirement is completely open/any
  if (requiredFamily === 'OPEN_ANY') return true;

  // 2. Exact family match
  if (candidateFamily === requiredFamily) return true;

  // 3. Generic Graduate requirement (Any Graduate / Graduate)
  if (requiredFamily === 'GRADUATE_ANY') {
    return [
      'GRADUATE_ANY', 'BE_ANY', 'BE_COMPUTERS', 'BE_CIVIL', 'BE_MECHANICAL',
      'BE_ELECTRICAL', 'BE_ELECTRONICS', 'BE_CHEMICAL', 'BE_METALLURGY', 'BE_TEXTILE', 'BE_OTHER',
      'BSC', 'BSC_COMPUTERS', 'BSC_MICROBIOLOGY', 'BA', 'BCOM', 'BBA', 'BCA',
      'BARCH', 'BED', 'BPHARM', 'MEDICAL', 'LAW'
    ].includes(candidateFamily);
  }

  // 4. Generic Post-Graduate requirement
  if (requiredFamily === 'POST_GRADUATE_ANY') {
    return [
      'POST_GRADUATE_ANY', 'MBA_ANY', 'MBA_FINANCE', 'MBA_HR', 'MBA_MARKETING', 'MBA_OPERATIONS',
      'MCA', 'ME_MTECH', 'MCOM', 'MSC', 'MA'
    ].includes(candidateFamily);
  }

  // 5. Generic BE requirement (BE / B.E/B.Tech / BE - Any)
  if (requiredFamily === 'BE_ANY') {
    return [
      'BE_ANY', 'BE_COMPUTERS', 'BE_CIVIL', 'BE_MECHANICAL',
      'BE_ELECTRICAL', 'BE_ELECTRONICS', 'BE_CHEMICAL', 'BE_METALLURGY', 'BE_TEXTILE', 'BE_OTHER'
    ].includes(candidateFamily);
  }

  // 6. Generic Diploma requirement (Diploma / Diploma - Any)
  if (requiredFamily === 'DIPLOMA_ANY') {
    return [
      'DIPLOMA_ANY', 'DIPLOMA_MECHANICAL', 'DIPLOMA_CIVIL',
      'DIPLOMA_COMPUTERS', 'DIPLOMA_ELECTRICAL', 'DIPLOMA_ELECTRONICS',
      'DIPLOMA_CHEMICAL', 'DIPLOMA_OTHER'
    ].includes(candidateFamily);
  }

  // 7. Generic ITI requirement (ITI / ITI - All Trade)
  if (requiredFamily === 'ITI_ANY') {
    return [
      'ITI_ANY', 'ITI_ELECTRICIAN', 'ITI_FITTER', 'ITI_WELDER',
      'ITI_MACHINIST', 'ITI_AUTOMOBILE', 'ITI_OTHER'
    ].includes(candidateFamily);
  }

  // 8. Generic MBA requirement (MBA / MBA Other)
  if (requiredFamily === 'MBA_ANY') {
    return [
      'MBA_ANY', 'MBA_FINANCE', 'MBA_HR', 'MBA_MARKETING', 'MBA_OPERATIONS'
    ].includes(candidateFamily);
  }

  // 9. Generic HSC requirement (HSC / HSC - Any)
  if (requiredFamily === 'HSC_ANY') {
    return [
      'HSC_ANY', 'HSC_SCIENCE', 'HSC_COMMERCE', 'HSC_ARTS', 'HSC_MCVC'
    ].includes(candidateFamily);
  }

  // 10. SSC requirement
  if (requiredFamily === 'SSC_ANY') {
    return true; // Any candidate with SSC or higher matches SSC
  }

  // 11. Specific Cross-Discipline Equivalences:
  // Computer Science / IT cross-equivalences:
  // BE_COMPUTERS, BCA, BSC_COMPUTERS, MCA
  if (requiredFamily === 'BE_COMPUTERS') {
    return ['BE_COMPUTERS', 'BCA', 'BSC_COMPUTERS', 'MCA'].includes(candidateFamily);
  }
  if (requiredFamily === 'BCA' || requiredFamily === 'BSC_COMPUTERS' || requiredFamily === 'MCA') {
    return ['BE_COMPUTERS', 'BCA', 'BSC_COMPUTERS', 'MCA'].includes(candidateFamily);
  }

  // B.Sc (General) matches B.Sc specializations
  if (requiredFamily === 'BSC') {
    return ['BSC', 'BSC_MICROBIOLOGY', 'BSC_COMPUTERS'].includes(candidateFamily);
  }

  // Mechanical engineering / Automobile cross-equivalence
  if (requiredFamily === 'BE_MECHANICAL') {
    return candidateFamily === 'BE_MECHANICAL';
  }
  if (requiredFamily === 'DIPLOMA_MECHANICAL') {
    return candidateFamily === 'DIPLOMA_MECHANICAL';
  }

  // Electrical & Electronics cross-compatibility where relevant
  if (requiredFamily === 'BE_ELECTRICAL') {
    return ['BE_ELECTRICAL', 'BE_ELECTRONICS'].includes(candidateFamily);
  }
  if (requiredFamily === 'BE_ELECTRONICS') {
    return ['BE_ELECTRONICS', 'BE_ELECTRICAL'].includes(candidateFamily);
  }

  // 12. Cross-Discipline Boundaries & Specializations:
  // Candidate with generic "GRADUATE_ANY" (without specific degree) matches Bachelor requirements
  if (candidateFamily === 'GRADUATE_ANY') {
    const allGradFamilies: EduFamily[] = [
      'GRADUATE_ANY', 'BE_ANY', 'BE_COMPUTERS', 'BE_CIVIL', 'BE_MECHANICAL',
      'BE_ELECTRICAL', 'BE_ELECTRONICS', 'BE_CHEMICAL', 'BE_METALLURGY', 'BE_TEXTILE', 'BE_OTHER',
      'BSC', 'BSC_COMPUTERS', 'BSC_MICROBIOLOGY', 'BA', 'BCOM', 'BBA', 'BCA',
      'BARCH', 'BED', 'BPHARM', 'MEDICAL', 'LAW'
    ];
    if (allGradFamilies.includes(requiredFamily)) {
      return true;
    }
  }

  // B.Com / Commerce family cross-compatibility
  if (requiredFamily === 'BCOM') {
    if (['BCOM', 'MCOM'].includes(candidateFamily)) return true;
    const candLower = (rawCand || '').toLowerCase();
    if (candLower.includes('b.com') || candLower.includes('bcom') || candLower.includes('commerce') || candLower.includes('b com') || candLower.includes('m.com') || candLower.includes('mcom')) {
      return true;
    }
    return false;
  }

  // B.A / Arts family
  if (requiredFamily === 'BA') {
    if (['BA', 'MA'].includes(candidateFamily)) return true;
    const candLower = (rawCand || '').toLowerCase();
    if (candLower.includes('b.a') || candLower.includes('arts') || candLower.includes('b a ') || candLower.includes('bachelor of arts')) {
      return true;
    }
    return false;
  }

  // B.Sc family
  if (requiredFamily === 'BSC') {
    if (['BSC', 'BSC_COMPUTERS', 'BSC_MICROBIOLOGY', 'MSC'].includes(candidateFamily)) return true;
    const candLower = (rawCand || '').toLowerCase();
    if (candLower.includes('b.sc') || candLower.includes('bsc') || candLower.includes('b sc') || candLower.includes('science')) {
      return true;
    }
    return false;
  }

  // MBA / Management family
  if (requiredFamily === 'MBA_ANY' || requiredFamily === 'MBA_FINANCE' || requiredFamily === 'MBA_HR' || requiredFamily === 'MBA_MARKETING' || requiredFamily === 'MBA_OPERATIONS') {
    if (['MBA_ANY', 'MBA_FINANCE', 'MBA_HR', 'MBA_MARKETING', 'MBA_OPERATIONS', 'POST_GRADUATE_ANY'].includes(candidateFamily)) return true;
    const candLower = (rawCand || '').toLowerCase();
    if (candLower.includes('mba') || candLower.includes('pgdm') || candLower.includes('management')) {
      return true;
    }
    return false;
  }

  // Text substring fallback for exact degree title match
  const candNorm = normalizeEducationString(rawCand);
  const reqNorm = normalizeEducationString(rawReq);
  if (candNorm && reqNorm && (candNorm === reqNorm || candNorm.includes(reqNorm) || reqNorm.includes(candNorm))) {
    // Prevent major cross-category leaks (e.g. mba matching bcom, or civil matching comp)
    const isCandMba = candNorm.includes('mba') || candNorm.includes('pgdm');
    const isReqMba = reqNorm.includes('mba') || reqNorm.includes('pgdm');
    const isCandCom = candNorm.includes('com') || candNorm.includes('commerce');
    const isReqCom = reqNorm.includes('com') || reqNorm.includes('commerce');
    const isCandEng = candNorm.includes('be') || candNorm.includes('tech') || candNorm.includes('engineering') || candNorm.includes('diploma');
    const isReqEng = reqNorm.includes('be') || reqNorm.includes('tech') || reqNorm.includes('engineering') || reqNorm.includes('diploma');
    
    if (isReqMba && !isCandMba) return false;
    if (isReqCom && !isCandCom && !candNorm.includes('graduate')) return false;
    if (isReqEng && !isCandEng && !candNorm.includes('graduate')) return false;

    return true;
  }

  return false;
}

/**
 * Checks if a candidate's qualification satisfies a single education requirement option.
 */
export function checkSingleRequirementMatch(candidateEdu: string, reqOption: string): boolean {
  if (!reqOption || !reqOption.trim()) return true;
  if (!candidateEdu || !candidateEdu.trim()) return false;

  const candFamily = classifyEducationString(candidateEdu);
  const reqFamily = classifyEducationString(reqOption);

  return matchesEduFamily(candFamily, reqFamily, candidateEdu, reqOption);
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
