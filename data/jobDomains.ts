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
