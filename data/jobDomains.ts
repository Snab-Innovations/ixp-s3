export interface JobDomain {
  id: string;
  name: string;
  category: string;
  keywords: string[];
}

export const ALL_JOB_DOMAINS: JobDomain[] = [
  { id: 'accountant', name: 'Accountant', category: 'Finance & Accounts', keywords: ['accountant', 'accounts', 'tally', 'gst', 'tds', 'finance', 'billing', 'bookkeeping', 'taxation', 'tally prime', 'audit', 'chartered accountant', 'ca', 'balance sheet'] },
  { id: 'sales', name: 'Sales', category: 'Sales & Business Development', keywords: ['sales', 'business development', 'bd', 'field sales', 'sales executive', 'b2b sales', 'b2c sales', 'client acquisition', 'lead generation', 'target'] },
  { id: 'marketing', name: 'Marketing', category: 'Marketing & PR', keywords: ['marketing', 'digital marketing', 'social media', 'seo', 'sem', 'branding', 'content marketing', 'campaign', 'advertising', 'email marketing'] },
  { id: 'hr', name: 'HR', category: 'Human Resources', keywords: ['hr', 'human resources', 'recruiter', 'recruitment', 'talent acquisition', 'payroll', 'employee relations', 'onboarding', 'hr generalist', 'hr executive'] },
  { id: 'admin', name: 'Admin', category: 'Administration & Office', keywords: ['admin', 'administration', 'office admin', 'office manager', 'facility', 'front office', 'admin executive', 'operations'] },
  { id: 'back_office', name: 'Back Office', category: 'Office Operations', keywords: ['back office', 'data entry', 'computer operator', 'backoffice', 'documentation', 'office assistant', 'mis', 'excel'] },
  { id: 'receptionist', name: 'Receptionist', category: 'Office Operations', keywords: ['receptionist', 'front desk', 'desk executive', 'reception', 'visitor management', 'office receptionist'] },
  { id: 'telecaller', name: 'Telecaller', category: 'Customer Care & Sales', keywords: ['telecaller', 'telecalling', 'bpo', 'customer support', 'call center', 'inbound', 'outbound', 'customer care', 'voice process'] },
  { id: 'production', name: 'Production', category: 'Manufacturing & Operations', keywords: ['production', 'manufacturing', 'assembly', 'shop floor', 'plant', 'production engineer', 'line supervisor', 'process engineer'] },
  { id: 'quality', name: 'Quality', category: 'Manufacturing & QA', keywords: ['quality', 'qa', 'qc', 'quality control', 'quality assurance', 'iso', 'quality inspector', 'testing', 'audit', 'six sigma'] },
  { id: 'maintenance', name: 'Maintenance', category: 'Engineering & Plant', keywords: ['maintenance', 'breakdown', 'preventive maintenance', 'electrical maintenance', 'mechanical maintenance', 'technician', 'utility', 'plant maintenance'] },
  { id: 'stores', name: 'Stores', category: 'Logistics & Inventory', keywords: ['stores', 'store keeper', 'inventory', 'warehouse', 'godown', 'stock', 'material management', 'store executive'] },
  { id: 'purchase', name: 'Purchase', category: 'Procurement & SCM', keywords: ['purchase', 'procurement', 'vendor management', 'buying', 'sourcing', 'purchase executive', 'rfq', 'negotiation'] },
  { id: 'scm', name: 'SCM', category: 'Logistics & Supply Chain', keywords: ['scm', 'supply chain', 'supply chain management', 'logistics', 'dispatch', 'freight', 'transportation', 'distribution'] },
  { id: 'software', name: 'Software', category: 'IT & Software Development', keywords: ['software', 'developer', 'software engineer', 'full stack', 'frontend', 'backend', 'web developer', 'app developer', 'coding', 'react', 'python', 'java', 'node', 'c#', 'c++'] },
  { id: 'it', name: 'IT', category: 'IT Support & Systems', keywords: ['it', 'information technology', 'it support', 'system admin', 'network engineer', 'hardware', 'desktop support', 'infrastructure', 'cloud', 'devops'] },
];

/**
 * Auto-detect primary domain from text
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
 * Auto-detect multiple candidate domains from text
 */
export function detectDomainsFromText(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const clean = text.toLowerCase();

  const domainScores: { name: string; score: number }[] = [];

  for (const domain of ALL_JOB_DOMAINS) {
    let score = 0;
    for (const kw of domain.keywords) {
      if (clean.includes(kw)) {
        score += kw.length > 5 ? 3 : 1;
      }
    }
    if (score > 0) {
      domainScores.push({ name: domain.name, score });
    }
  }

  return domainScores
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(d => d.name);
}

/**
 * Check if job matches any candidate domain(s)
 */
export function isJobMatchingDomain(job: any, candidateDomains: string | string[]): boolean {
  if (!job || !candidateDomains) return false;

  const domainsList = Array.isArray(candidateDomains)
    ? candidateDomains.filter(Boolean)
    : [candidateDomains];

  if (domainsList.length === 0) return false;

  const jobDept = (job.department || job.category || job.roleCategory || '').toLowerCase();
  const jobTitle = (job.title || '').toLowerCase();
  const jobDesc = (job.description || '').toLowerCase();

  return domainsList.some(candDomain => {
    const cleanCandDomain = candDomain.toLowerCase().trim();
    if (!cleanCandDomain) return false;

    // Direct department/title match
    if (jobDept.includes(cleanCandDomain) || cleanCandDomain.includes(jobDept) || jobTitle.includes(cleanCandDomain)) {
      return true;
    }

    const targetDomainObj = ALL_JOB_DOMAINS.find(
      d => d.name.toLowerCase() === cleanCandDomain || d.id.toLowerCase() === cleanCandDomain
    );

    if (targetDomainObj) {
      return targetDomainObj.keywords.some(
        kw => jobDept.includes(kw) || jobTitle.includes(kw) || jobDesc.includes(kw)
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
