export interface JobDomain {
  id: string;
  name: string;
  category: string;
  keywords: string[];
}

export const ALL_JOB_SECTORS: string[] = [
  'Manufacturing / Engineering',
  'Automobile / Auto Components',
  'Electrical / Electronics',
  'Pharma / Chemical',
  'FMCG / Food Processing',
  'Real Estate / Construction / Infrastructure',
  'Software / IT / Technology',
  'Banking / Finance / Insurance / NBFC',
  'Healthcare / Hospital / Medical',
  'Hotel / Restaurant / Café / Hospitality',
  'Travel / Tourism',
  'Aviation / Airlines',
  'Logistics / Transport / Warehousing',
  'Retail / Wholesale / Trading',
  'E-commerce',
  'Education / Training / Coaching',
  'Recruitment / HR Services / Consulting',
  'Professional Services / Consultancy',
  'Telecom',
  'Agriculture / Agri Business',
  'Textile / Garment / Fashion',
  'Media / Advertising / Digital Marketing',
  'Printing / Packaging',
  'Security / Facility Management',
  'BPO / KPO / Call Centre',
  'Oil / Gas / Energy / Power',
  'Renewable Energy / Solar',
  'Government / PSU',
  'NGO / Social Sector'
];

export const ALL_JOB_DEPARTMENTS: string[] = [
  'Production / Manufacturing',
  'Quality / QA / QC',
  'Maintenance / Service / Installation',
  'Design / Engineering / R&D',
  'Projects / Planning / PPC',
  'Purchase / Procurement',
  'Stores / Inventory / Warehouse',
  'Logistics / Dispatch / Supply Chain',
  'Sales / Business Development',
  'Marketing / Digital Marketing',
  'Customer Support / Telecalling / Back Office',
  'HR / Recruitment / Training',
  'Accounts / Finance / Taxation / Billing',
  'Admin / Front Office / Facility Management',
  'IT / Software / Technical Support',
  'Civil / Construction / Site Execution',
  'Legal / Compliance',
  'Healthcare / Medical / Pharmacy',
  'Hospitality / Food & Beverage',
  'Education / Teaching / Training',
  'Creative / Graphic Design / Media',
  'Other'
];

export const ALL_JOB_DOMAINS: JobDomain[] = [
  ...ALL_JOB_DEPARTMENTS.map(dept => ({
    id: dept.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    name: dept,
    category: 'Functional Department',
    keywords: dept.toLowerCase().split(/[\s\/&]+/).filter(k => k.length > 2)
  })),
  ...ALL_JOB_SECTORS.map(sec => ({
    id: sec.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    name: sec,
    category: 'Industry Sector',
    keywords: sec.toLowerCase().split(/[\s\/&]+/).filter(k => k.length > 2)
  }))
];

/**
 * Auto-detect primary domain/department from text
 */
export function detectDomainFromText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  const clean = text.toLowerCase();

  let bestMatch = '';
  let highestScore = 0;

  for (const domain of ALL_JOB_DOMAINS) {
    let score = 0;
    for (const kw of domain.keywords) {
      if (clean.includes(kw)) {
        score += kw.length > 5 ? 3 : 1;
      }
    }
    if (score > highestScore) {
      highestScore = score;
      bestMatch = domain.name;
    }
  }

  return bestMatch;
}

/**
 * Auto-detect matching Industry Sectors from text
 */
export function detectSectorsFromText(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const clean = text.toLowerCase();

  const scores: { name: string; score: number }[] = [];

  for (const sector of ALL_JOB_SECTORS) {
    const keywords = sector.toLowerCase().split(/[\s\/&]+/).filter(k => k.length > 2);
    let score = 0;
    for (const kw of keywords) {
      if (clean.includes(kw)) {
        score += kw.length > 5 ? 3 : 1;
      }
    }
    if (score > 0) {
      scores.push({ name: sector, score });
    }
  }

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => s.name);
}

/**
 * Auto-detect matching Functional Departments from text
 */
export function detectDepartmentsFromText(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const clean = text.toLowerCase();

  const scores: { name: string; score: number }[] = [];

  for (const dept of ALL_JOB_DEPARTMENTS) {
    const keywords = dept.toLowerCase().split(/[\s\/&]+/).filter(k => k.length > 2);
    let score = 0;
    for (const kw of keywords) {
      if (clean.includes(kw)) {
        score += kw.length > 5 ? 3 : 1;
      }
    }
    if (score > 0) {
      scores.push({ name: dept, score });
    }
  }

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(d => d.name);
}

/**
 * Auto-detect multiple candidate domains/departments from text
 */
export function detectDomainsFromText(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const detectedSecs = detectSectorsFromText(text);
  const detectedDepts = detectDepartmentsFromText(text);
  const combined = Array.from(new Set([...detectedSecs, ...detectedDepts]));
  return combined.slice(0, 4);
}

/**
 * Check if job matches candidate target sectors/departments
 */
export function isJobMatchingDomain(job: any, candidateDomains: string | string[]): boolean {
  if (!job || !candidateDomains) return false;

  const domainsList = Array.isArray(candidateDomains)
    ? candidateDomains.filter(Boolean)
    : [candidateDomains];

  if (domainsList.length === 0) return false;

  const jobDept = (job.department || job.category || job.roleCategory || '').toLowerCase();
  const jobSector = (job.sector || job.industry || '').toLowerCase();
  const jobTitle = (job.title || '').toLowerCase();
  const jobDesc = (job.description || '').toLowerCase();

  return domainsList.some(candDomain => {
    const cleanCandDomain = candDomain.toLowerCase().trim();
    if (!cleanCandDomain) return false;

    // Direct department/sector/title match
    if (jobDept.includes(cleanCandDomain) || cleanCandDomain.includes(jobDept) || 
        jobSector.includes(cleanCandDomain) || cleanCandDomain.includes(jobSector) || 
        jobTitle.includes(cleanCandDomain)) {
      return true;
    }

    const targetDomainObj = ALL_JOB_DOMAINS.find(
      d => d.name.toLowerCase() === cleanCandDomain || d.id.toLowerCase() === cleanCandDomain
    );

    if (targetDomainObj) {
      return targetDomainObj.keywords.some(
        kw => jobDept.includes(kw) || jobSector.includes(kw) || jobTitle.includes(kw) || jobDesc.includes(kw)
      );
    }

    return false;
  });
}

/**
 * Get domain metadata by name
 */
export function getDomainMetadata(domainName: string): JobDomain | undefined {
  if (!domainName) return undefined;
  const clean = domainName.toLowerCase().trim();
  return ALL_JOB_DOMAINS.find(
    d => d.name.toLowerCase() === clean || d.id.toLowerCase() === clean || d.keywords.some(k => k.toLowerCase() === clean)
  );
}

/**
 * Intelligently separates and resolves candidate industry sectors and functional departments.
 * Handles legacy/merged fields where sectors were stored in domains, or sectors/departments were combined.
 */
export function resolveCandidateSectorsAndDepartments(candidate: any): { sectors: string[]; departments: string[] } {
  if (!candidate) return { sectors: [], departments: [] };

  const allValues = new Set<string>();

  const addItems = (val: any) => {
    if (!val) return;
    if (Array.isArray(val)) {
      val.forEach(v => {
        if (typeof v === 'string' && v.trim()) {
          v.split(/[,;|]+/).forEach(item => {
            const trimmed = item.trim();
            if (trimmed && trimmed.toLowerCase() !== 'other' && trimmed.toLowerCase() !== 'not specified') {
              allValues.add(trimmed);
            }
          });
        }
      });
    } else if (typeof val === 'string' && val.trim()) {
      val.split(/[,;|]+/).forEach(item => {
        const trimmed = item.trim();
        if (trimmed && trimmed.toLowerCase() !== 'other' && trimmed.toLowerCase() !== 'not specified') {
          allValues.add(trimmed);
        }
      });
    }
  };

  // Extract from all possible candidate domain/sector/department fields
  addItems(candidate.sectors);
  addItems(candidate.sector);
  addItems(candidate.departments);
  addItems(candidate.department);
  addItems(candidate.domains);
  addItems(candidate.domain);
  addItems(candidate.preferredDomains);

  const resolvedSectors = new Set<string>();
  const resolvedDepartments = new Set<string>();

  allValues.forEach(rawVal => {
    const val = rawVal.trim();
    const valLower = val.toLowerCase();

    // 1. Check exact match with ALL_JOB_SECTORS
    const exactSector = ALL_JOB_SECTORS.find(s => s.toLowerCase() === valLower);
    if (exactSector) {
      resolvedSectors.add(exactSector);
      return;
    }

    // 2. Check exact match with ALL_JOB_DEPARTMENTS
    const exactDept = ALL_JOB_DEPARTMENTS.find(d => d.toLowerCase() === valLower);
    if (exactDept) {
      resolvedDepartments.add(exactDept);
      return;
    }

    // 3. Partial or keyword match against ALL_JOB_SECTORS
    const matchedSector = ALL_JOB_SECTORS.find(sec => {
      const secLower = sec.toLowerCase();
      const secParts = secLower.split(/[\s\/&]+/).filter(p => p.length > 2);
      const valParts = valLower.split(/[\s\/&]+/).filter(p => p.length > 2);
      return secParts.every(p => valLower.includes(p)) || valParts.some(p => secLower.includes(p));
    });

    // 4. Partial or keyword match against ALL_JOB_DEPARTMENTS
    const matchedDept = ALL_JOB_DEPARTMENTS.find(dept => {
      const deptLower = dept.toLowerCase();
      const deptParts = deptLower.split(/[\s\/&]+/).filter(p => p.length > 2);
      const valParts = valLower.split(/[\s\/&]+/).filter(p => p.length > 2);
      return deptParts.every(p => valLower.includes(p)) || valParts.some(p => deptLower.includes(p));
    });

    if (matchedSector && !matchedDept) {
      resolvedSectors.add(matchedSector);
    } else if (matchedDept && !matchedSector) {
      resolvedDepartments.add(matchedDept);
    } else if (matchedSector && matchedDept) {
      resolvedSectors.add(matchedSector);
      resolvedDepartments.add(matchedDept);
    } else {
      // Fallback categorization based on common terms
      if (/(sector|industry|automobile|manufacturing|pharma|chemical|fmcg|banking|insurance|finance|real estate|construction|infrastructure|e-commerce|ecommerce|aviation|telecom|textile|garment|energy|power|solar|hospitality|hotel|tourism|bpo|kpo)/i.test(valLower)) {
        resolvedSectors.add(val);
      } else {
        resolvedDepartments.add(val);
      }
    }
  });

  // If sectors are still empty, auto-detect from resumeText, currentTitle, or summary
  if (resolvedSectors.size === 0) {
    const textToScan = `${candidate.currentTitle || ''} ${candidate.summary || ''} ${candidate.resumeText || ''} ${candidate.title || ''}`;
    if (textToScan.trim()) {
      const autoSecs = detectSectorsFromText(textToScan);
      autoSecs.slice(0, 3).forEach(s => resolvedSectors.add(s));
    }
  }

  // If departments are still empty, auto-detect from text
  if (resolvedDepartments.size === 0) {
    const textToScan = `${candidate.currentTitle || ''} ${candidate.summary || ''} ${candidate.resumeText || ''} ${candidate.title || ''}`;
    if (textToScan.trim()) {
      const autoDepts = detectDepartmentsFromText(textToScan);
      autoDepts.slice(0, 3).forEach(d => resolvedDepartments.add(d));
    }
  }

  return {
    sectors: Array.from(resolvedSectors),
    departments: Array.from(resolvedDepartments)
  };
}
