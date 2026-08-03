import { collection, deleteDoc, doc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import { db } from './firebase';
import { uploadToCloudinary } from './api';
import { grokGenerateJson } from './grokService';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export type ResumeSource = 'resume_dump' | 'interview_creation' | 'candidate_interview';

export interface ResumeExperienceEntry {
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  highlights: string[];
  skills: string[];
}

export interface ResumeEducationEntry {
  degree: string;
  institution: string;
  year: string;
}

export interface ParsedResumeProfile {
  name: string;
  email: string;
  phone: string;
  location: string;
  currentTitle: string;
  summary: string;
  totalExperienceYears: number;
  skills: string[];
  experience: ResumeExperienceEntry[];
  education: ResumeEducationEntry[];
  certifications: string[];
  languages: string[];
  keywords: string[];
  linkedinUrl: string;
  portfolioUrl: string;
  additionalText?: string;
  parsingMethod: 'deterministic' | 'hybrid';
  parserVersion: number;
}

export interface ResumeDumpRecord extends ParsedResumeProfile {
  id: string;
  recruiterUID: string;
  resumeUrl: string;
  resumeFileName: string;
  resumeMimeType?: string;
  resumeSize?: number;
  resumeText?: string;
  additionalText?: string;
  source?: ResumeSource;
  sourceInterviewId?: string;
  sourceJobTitle?: string;
  isHired?: boolean;
  doNotSuggest?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ResumeIngestionResult {
  profile: ParsedResumeProfile;
  resumeText: string;
  resumeUrl: string;
}

export interface CandidateMatch extends ResumeDumpRecord {
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  matchReasons: string[];
  skillScore: number;
  experienceScore: number;
  roleScore: number;
}

const PARSER_VERSION = 2;
const MAX_RESUME_TEXT_CHARS = 25_000;
const EMAIL_REGEX = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
const PHONE_REGEX = /(?:\+?\d{1,4}[\s.-]?)?(?:[6-9]\d{4}[\s.-]?\d{5}|(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{4,5})/;
const URL_REGEX = /https?:\/\/[^\s)]+/gi;
const DATE_RANGE_REGEX = /(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{1,2})?[\s/'-]*(?:19|20)\d{2}\s*(?:-|–|—|to)\s*(?:present|current|now|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{1,2})?[\s/'-]*(?:19|20)\d{2})/i;
const SECTION_HEADING_REGEX = /^(summary|profile|objective|about|skills?|technical skills?|core competencies|competencies|technologies|tools|work experience|professional experience|employment|experience|projects?|education|academic background|certifications?|courses?|achievements?|languages?|interests?|personal details)\s*:?[\s]*$/i;

export function extractPhoneFromText(text: string): string {
  if (!text) return '';

  // 1. Look for explicit phone labels (e.g. Phone: 76665 43353, Mobile: +91 76665-43353)
  const labeledMatch = text.match(/(?:phone|mobile|mob|contact|cell|call|whatsapp|tel|ph)[\s.:#]*([+\d\s().-]{7,20})/i);
  if (labeledMatch) {
    const rawMatch = labeledMatch[1];
    const digitsOnly = rawMatch.replace(/[^0-9]/g, '');
    if (digitsOnly.length >= 9 && digitsOnly.length <= 13) {
      return rawMatch.trim();
    }
  }

  // 2. Fallback regex match
  const match = text.match(PHONE_REGEX);
  return match ? match[0].trim() : '';
}

export function formatExtractedPhone(phone: string): string {
  if (!phone) return '';
  let digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('0091')) digits = digits.slice(4);
  else if (digits.startsWith('091')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  
  if (digits.length === 10) return '+91 ' + digits;
  if (digits.length === 12 && digits.startsWith('91')) return '+91 ' + digits.slice(2);
  return phone.trim();
}

const SKILL_DEFINITIONS: Array<[string, RegExp[]]> = [
  ['JavaScript', [/\bjavascript\b/i, /\becmascript\b/i, /\bjs\b/i]],
  ['TypeScript', [/\btypescript\b/i, /\btype script\b/i]],
  ['React', [/\breact(?:\.js|js)?\b/i]],
  ['Next.js', [/\bnext(?:\.js|js)?\b/i]],
  ['Vue.js', [/\bvue(?:\.js|js)?\b/i]],
  ['Angular', [/\bangular\b/i]],
  ['Node.js', [/\bnode(?:\.js|js)?\b/i]],
  ['Express.js', [/\bexpress(?:\.js|js)?\b/i]],
  ['HTML', [/\bhtml5?\b/i]],
  ['CSS', [/\bcss3?\b/i]],
  ['Tailwind CSS', [/\btailwind(?:\s+css)?\b/i]],
  ['Bootstrap', [/\bbootstrap\b/i]],
  ['Redux', [/\bredux\b/i]],
  ['Python', [/\bpython\b/i]],
  ['Java', [/\bjava\b/i]],
  ['C++', [/\bc\+\+\b/i]],
  ['C#', [/\bc#\b/i, /\bc sharp\b/i]],
  ['PHP', [/\bphp\b/i]],
  ['.NET', [/\basp\.?net\b/i, /\bdotnet\b/i, /\b\.net\b/i]],
  ['Go', [/\bgolang\b/i, /\bgo language\b/i]],
  ['SQL', [/\bsql\b/i]],
  ['PostgreSQL', [/\bpostgres(?:ql)?\b/i]],
  ['MySQL', [/\bmysql\b/i]],
  ['MongoDB', [/\bmongo\s?db\b/i]],
  ['Redis', [/\bredis\b/i]],
  ['GraphQL', [/\bgraphql\b/i]],
  ['REST API', [/\brest(?:ful)?\s*(?:api|services?)\b/i]],
  ['Firebase', [/\bfirebase\b/i, /\bfirestore\b/i]],
  ['Supabase', [/\bsupabase\b/i]],
  ['AWS', [/\baws\b/i, /\bamazon web services\b/i]],
  ['Azure', [/\bmicrosoft azure\b/i, /\bazure\b/i]],
  ['Google Cloud', [/\bgcp\b/i, /\bgoogle cloud\b/i]],
  ['Docker', [/\bdocker\b/i]],
  ['Kubernetes', [/\bkubernetes\b/i, /\bk8s\b/i]],
  ['CI/CD', [/\bci\s*\/\s*cd\b/i, /\bcontinuous integration\b/i]],
  ['Git', [/\bgit\b/i]],
  ['Linux', [/\blinux\b/i]],
  ['Jest', [/\bjest\b/i]],
  ['Cypress', [/\bcypress\b/i]],
  ['Playwright', [/\bplaywright\b/i]],
  ['Selenium', [/\bselenium\b/i]],
  ['Machine Learning', [/\bmachine learning\b/i]],
  ['Deep Learning', [/\bdeep learning\b/i]],
  ['TensorFlow', [/\btensorflow\b/i]],
  ['PyTorch', [/\bpytorch\b/i]],
  ['Data Analysis', [/\bdata analys(?:is|tics)\b/i]],
  ['Data Science', [/\bdata science\b/i]],
  ['Power BI', [/\bpower\s*bi\b/i]],
  ['Tableau', [/\btableau\b/i]],
  ['Microsoft Excel', [/\bms\s*excel\b/i, /\bmicrosoft excel\b/i, /\badvanced excel\b/i]],
  ['Project Management', [/\bproject management\b/i]],
  ['Product Management', [/\bproduct management\b/i]],
  ['Agile', [/\bagile\b/i]],
  ['Scrum', [/\bscrum\b/i]],
  ['Jira', [/\bjira\b/i]],
  ['Figma', [/\bfigma\b/i]],
  ['UI/UX Design', [/\bui\s*\/\s*ux\b/i, /\buser experience design\b/i]],
  ['Digital Marketing', [/\bdigital marketing\b/i]],
  ['SEO', [/\bseo\b/i, /\bsearch engine optimi[sz]ation\b/i]],
  ['Content Marketing', [/\bcontent marketing\b/i]],
  ['Google Analytics', [/\bgoogle analytics\b/i]],
  ['Sales', [/\bsales\b/i]],
  ['Business Development', [/\bbusiness development\b/i]],
  ['CRM', [/\bcrm\b/i, /\bcustomer relationship management\b/i]],
  ['Salesforce', [/\bsalesforce\b/i]],
  ['Recruitment', [/\brecruitment\b/i, /\brecruiting\b/i]],
  ['Talent Acquisition', [/\btalent acquisition\b/i]],
  ['Human Resources', [/\bhuman resources\b/i, /\bhr operations\b/i]],
  ['Payroll', [/\bpayroll\b/i]],
  ['Accounting', [/\baccounting\b/i]],
  ['Financial Analysis', [/\bfinancial analysis\b/i]],
  ['Tally', [/\btally(?:\s+erp)?\b/i]],
  ['SAP', [/\bsap\b/i]],
  ['Supply Chain', [/\bsupply chain\b/i]],
  ['Procurement', [/\bprocurement\b/i]],
  ['Logistics', [/\blogistics\b/i]],
  ['Production Planning', [/\bproduction planning\b/i]],
  ['Quality Assurance', [/\bquality assurance\b/i, /\bquality control\b/i, /\bqa\s*\/\s*qc\b/i]],
  ['Six Sigma', [/\bsix sigma\b/i]],
  ['Lean Manufacturing', [/\blean manufacturing\b/i]],
  ['AutoCAD', [/\bautocad\b/i]],
  ['SolidWorks', [/\bsolidworks\b/i]],
  ['PLC', [/\bplc\b/i, /\bprogrammable logic controller\b/i]],
  ['Customer Service', [/\bcustomer service\b/i, /\bcustomer support\b/i]],
  ['Communication', [/\bcommunication skills?\b/i]],
  ['Leadership', [/\bleadership\b/i]],
  ['Problem Solving', [/\bproblem[ -]solving\b/i]],
];

const SKILL_ALIASES = new Map<string, string>();
SKILL_DEFINITIONS.forEach(([label]) => {
  SKILL_ALIASES.set(label.toLowerCase().replace(/[^a-z0-9+#]/g, ''), label);
});

const normalizeWhitespace = (value: string) => value.replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
const normalizeComparable = (value: string) => value.toLowerCase().replace(/\.js\b/g, 'js').replace(/[^a-z0-9+#]/g, '');
const normalizeSearchText = (value: string) => value.toLowerCase().replace(/\.js\b/g, 'js').replace(/[^a-z0-9+#]+/g, ' ').replace(/\s+/g, ' ').trim();
const uniqueStrings = (items: unknown[], limit = 30) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (typeof item !== 'string') continue;
    const value = item.replace(/^[•·▪●\-*]+\s*/, '').replace(/\s+/g, ' ').trim();
    const key = normalizeComparable(value);
    if (!key || seen.has(key) || value.length > 120) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
};

const canonicalizeSkill = (skill: string) => SKILL_ALIASES.get(normalizeComparable(skill)) || skill.trim();

export const extractSkillSignals = (text: string) => {
  const found: string[] = [];
  for (const [label, patterns] of SKILL_DEFINITIONS) {
    if (patterns.some((pattern) => pattern.test(text))) found.push(label);
  }

  const lines = text.split(/\r?\n/);
  const skillHeadingIndex = lines.findIndex((line) => /^(skills?|technical skills?|core competencies|technologies|tools)\s*:?\s*$/i.test(line.trim()));
  if (skillHeadingIndex >= 0) {
    for (let index = skillHeadingIndex + 1; index < Math.min(lines.length, skillHeadingIndex + 12); index++) {
      const line = lines[index].trim();
      if (!line || SECTION_HEADING_REGEX.test(line)) break;
      line.split(/[,;|/•·▪●]+/).forEach((token) => {
        const cleaned = token.replace(/^[\s:-]+|[\s.:-]+$/g, '').trim();
        if (cleaned.length >= 2 && cleaned.length <= 40 && !/[.!?].+\s/.test(cleaned)) found.push(canonicalizeSkill(cleaned));
      });
    }
  }

  return uniqueStrings(found.map(canonicalizeSkill), 40);
};

const extractSection = (text: string, headings: RegExp) => {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => headings.test(line.trim()));
  if (start < 0) return '';
  const section: string[] = [];
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index].trim();
    if (SECTION_HEADING_REGEX.test(line)) break;
    if (line) section.push(line);
    if (section.join(' ').length > 1800) break;
  }
  return section.join('\n');
};

const extractName = (text: string, fallbackFileName: string) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 15);
  const nameLine = lines.find((line) => {
    const lower = line.toLowerCase();
    return line.length >= 3 && line.length <= 60 && /^[a-zA-Z][a-zA-Z .'’-]+$/.test(line)
      && !EMAIL_REGEX.test(line) && !PHONE_REGEX.test(line)
      && !/(resume|curriculum|profile|summary|engineer|developer|manager|analyst|consultant|specialist)/i.test(lower);
  });
  return (nameLine || fallbackFileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')).replace(/\s+/g, ' ').trim() || 'Unknown Candidate';
};

const extractCurrentTitle = (text: string, name: string) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 25);
  const nameIndex = lines.findIndex((line) => normalizeComparable(line) === normalizeComparable(name));
  const candidates = nameIndex >= 0 ? lines.slice(nameIndex + 1, nameIndex + 5) : lines.slice(1, 6);
  return candidates.find((line) => line.length <= 80
    && !EMAIL_REGEX.test(line)
    && !PHONE_REGEX.test(line)
    && !/https?:\/\//i.test(line)
    && /(engineer|developer|manager|analyst|consultant|specialist|executive|lead|designer|recruiter|accountant|sales|marketing|operations|administrator|architect|intern|officer)/i.test(line)) || '';
};

const extractExperienceYears = (text: string) => {
  const explicit = Array.from(text.matchAll(/(\d{1,2}(?:\.\d+)?)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?experience/gi))
    .map((match) => Number(match[1])).filter((value) => value >= 0 && value <= 60);
  if (explicit.length) return Math.max(...explicit);

  const currentYear = new Date().getFullYear();
  const years = Array.from(text.matchAll(/\b((?:19|20)\d{2})\b/g)).map((match) => Number(match[1]))
    .filter((year) => year >= 1970 && year <= currentYear);
  return years.length >= 2 ? Math.min(60, Math.max(0, currentYear - Math.min(...years))) : 0;
};

const extractEducation = (text: string): ResumeEducationEntry[] => {
  const section = extractSection(text, /^(education|academic background|qualifications?)\s*:?$/i);
  const source = section || text;
  return uniqueStrings(source.split(/\r?\n/).filter((line) => /(bachelor|master|b\.?tech|m\.?tech|b\.?e\.?|m\.?e\.?|bsc|msc|bca|mca|mba|ph\.?d|diploma|university|college|institute)/i.test(line)), 6)
    .map((line) => ({
      degree: line.match(/(bachelor[^,|]*|master[^,|]*|b\.?tech[^,|]*|m\.?tech[^,|]*|b\.?e\.?(?:\s+[^,|]*)?|m\.?e\.?(?:\s+[^,|]*)?|bsc[^,|]*|msc[^,|]*|bca[^,|]*|mca[^,|]*|mba[^,|]*|ph\.?d[^,|]*|diploma[^,|]*)/i)?.[0]?.trim() || line,
      institution: line.match(/(?:at|from|,|\|)\s*([^,|]*(?:university|college|institute)[^,|]*)/i)?.[1]?.trim() || '',
      year: line.match(/\b(?:19|20)\d{2}\b/)?.[0] || '',
    }));
};

const extractSimpleListSection = (text: string, headings: RegExp, limit = 8) => {
  const section = extractSection(text, headings);
  if (!section) return [];
  return uniqueStrings(section.split(/\r?\n|[,;|•·▪●]+/), limit);
};

const deterministicParse = (text: string, fallbackFileName: string): ParsedResumeProfile => {
  const cleanText = normalizeWhitespace(text.replace(/[•·▪●]/g, '\n• '));
  const name = extractName(cleanText, fallbackFileName);
  const urls = cleanText.match(URL_REGEX) || [];
  const summary = extractSection(cleanText, /^(summary|profile|objective|about)\s*:?$/i).replace(/\n/g, ' ').slice(0, 1000);
  const topLines = cleanText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 18);
  const location = topLines.find((line) => /\b(?:india|maharashtra|pune|mumbai|delhi|bengaluru|bangalore|hyderabad|chennai|kolkata|noida|gurugram|gurgaon|nashik|nagpur|remote)\b/i.test(line)
    && !EMAIL_REGEX.test(line) && !PHONE_REGEX.test(line) && line.length <= 100) || '';

  return {
    name,
    email: cleanText.match(EMAIL_REGEX)?.[1]?.toLowerCase() || '',
    phone: formatExtractedPhone(extractPhoneFromText(cleanText)),
    location,
    currentTitle: extractCurrentTitle(cleanText, name),
    summary,
    totalExperienceYears: extractExperienceYears(cleanText),
    skills: extractSkillSignals(cleanText),
    experience: [],
    education: extractEducation(cleanText),
    certifications: extractSimpleListSection(cleanText, /^(certifications?|courses?)\s*:?$/i),
    languages: extractSimpleListSection(cleanText, /^languages?\s*:?$/i, 6),
    keywords: [],
    linkedinUrl: urls.find((url) => /linkedin\.com/i.test(url)) || '',
    portfolioUrl: urls.find((url) => !/linkedin\.com|github\.com/i.test(url)) || '',
    parsingMethod: 'deterministic',
    parserVersion: PARSER_VERSION,
  };
};

interface AIResumeProfile {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  location?: unknown;
  currentTitle?: unknown;
  summary?: unknown;
  totalExperienceYears?: unknown;
  skills?: unknown;
  experience?: unknown;
  education?: unknown;
  certifications?: unknown;
  languages?: unknown;
  keywords?: unknown;
  linkedinUrl?: unknown;
  portfolioUrl?: unknown;
}

const safeString = (value: unknown, max = 500) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const safeNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 60 ? parsed : 0;
};

const parseAIExperience = (value: unknown): ResumeExperienceEntry[] => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      title: safeString(record.title, 120),
      company: safeString(record.company, 120),
      startDate: safeString(record.startDate, 30),
      endDate: safeString(record.endDate, 30),
      highlights: uniqueStrings(Array.isArray(record.highlights) ? record.highlights : [], 8),
      skills: uniqueStrings(Array.isArray(record.skills) ? record.skills.map((skill) => canonicalizeSkill(String(skill))) : [], 15),
    };
  }).filter((item) => item.title || item.company || item.highlights.length);
};

const parseAIEducation = (value: unknown): ResumeEducationEntry[] => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      degree: safeString(record.degree, 160),
      institution: safeString(record.institution, 160),
      year: safeString(record.year, 30),
    };
  }).filter((item) => item.degree || item.institution);
};

export const analyzeResumeText = async (
  text: string,
  fallbackFileName: string,
  overrides: Partial<Pick<ParsedResumeProfile, 'name' | 'email' | 'phone'>> = {}
): Promise<ParsedResumeProfile> => {
  const fallback = deterministicParse(text, fallbackFileName);
  if (normalizeWhitespace(text).length < 80) return { ...fallback, ...overrides };

  try {
    const ai = await grokGenerateJson<AIResumeProfile>(
      'You extract factual resume data for recruiters. Never infer missing facts, protected traits, personality, or candidate quality. Return only valid JSON.',
      `Extract this resume into the exact JSON shape below. Keep skills canonical and concise. Experience must contain only roles explicitly present in the resume. totalExperienceYears must be a number.\n\n{"name":"","email":"","phone":"","location":"","currentTitle":"","summary":"","totalExperienceYears":0,"skills":[],"experience":[{"title":"","company":"","startDate":"","endDate":"","highlights":[],"skills":[]}],"education":[{"degree":"","institution":"","year":""}],"certifications":[],"languages":[],"keywords":[],"linkedinUrl":"","portfolioUrl":""}\n\nRESUME:\n${text.slice(0, 18_000)}`,
      0.1,
      1800
    );

    const aiSkills = Array.isArray(ai.skills) ? ai.skills.map((skill) => canonicalizeSkill(safeString(skill, 60))) : [];
    const aiExperience = parseAIExperience(ai.experience);
    const experienceSkills = aiExperience.flatMap((entry) => entry.skills);
    const profile: ParsedResumeProfile = {
      name: safeString(ai.name, 100) || fallback.name,
      email: safeString(ai.email, 150).toLowerCase() || fallback.email,
      phone: formatExtractedPhone(safeString(ai.phone, 50)) || fallback.phone,
      location: safeString(ai.location, 150) || fallback.location,
      currentTitle: safeString(ai.currentTitle, 150) || fallback.currentTitle,
      summary: safeString(ai.summary, 1200) || fallback.summary,
      totalExperienceYears: safeNumber(ai.totalExperienceYears) || fallback.totalExperienceYears,
      skills: uniqueStrings([...aiSkills, ...experienceSkills, ...fallback.skills].map(canonicalizeSkill), 40),
      experience: aiExperience,
      education: parseAIEducation(ai.education).length ? parseAIEducation(ai.education) : fallback.education,
      certifications: uniqueStrings(Array.isArray(ai.certifications) ? ai.certifications : fallback.certifications, 12),
      languages: uniqueStrings(Array.isArray(ai.languages) ? ai.languages : fallback.languages, 8),
      keywords: uniqueStrings(Array.isArray(ai.keywords) ? ai.keywords : [], 20),
      linkedinUrl: safeString(ai.linkedinUrl, 500) || fallback.linkedinUrl,
      portfolioUrl: safeString(ai.portfolioUrl, 500) || fallback.portfolioUrl,
      parsingMethod: 'hybrid',
      parserVersion: PARSER_VERSION,
    };
    return { ...profile, ...Object.fromEntries(Object.entries(overrides).filter(([, value]) => Boolean(value))) };
  } catch (error) {
    console.warn('AI resume extraction failed; using deterministic parser.', error);
    return { ...fallback, ...Object.fromEntries(Object.entries(overrides).filter(([, value]) => Boolean(value))) };
  }
};

export const readResumeText = async (fileOrBlob: Blob, fileName = '') => {
  const mimeType = fileOrBlob.type;
  const lowerName = fileName.toLowerCase();
  if (mimeType === 'application/pdf' || lowerName.endsWith('.pdf')) {
    const buffer = await fileOrBlob.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages = await Promise.all(Array.from({ length: pdf.numPages }, async (_, pageIndex) => {
      const page = await pdf.getPage(pageIndex + 1);
      const content = await page.getTextContent();
      return content.items.map((item: any) => `${item.str}${item.hasEOL ? '\n' : ' '}`).join('');
    }));
    return normalizeWhitespace(pages.join('\n'));
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || lowerName.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ arrayBuffer: await fileOrBlob.arrayBuffer() });
    return normalizeWhitespace(result.value);
  }

  if (mimeType.startsWith('text/') || lowerName.endsWith('.txt')) return normalizeWhitespace(await fileOrBlob.text());
  throw new Error('Unsupported resume type. Upload PDF, DOCX, or TXT.');
};

export const ingestResumeFile = async (
  file: File,
  overrides: Partial<Pick<ParsedResumeProfile, 'name' | 'email' | 'phone'>> = {},
  existingResumeUrl = '',
  additionalText = ''
): Promise<ResumeIngestionResult> => {
  const resumeText = await readResumeText(file, file.name);
  if (!resumeText) throw new Error('No readable text was found in this resume.');

  const textToAnalyze = additionalText.trim()
    ? `${resumeText}\n\n[Additional Candidate Details & Recruiter Notes]:\n${additionalText.trim()}`
    : resumeText;

  const [profile, uploadedUrl] = await Promise.all([
    analyzeResumeText(textToAnalyze, file.name, overrides),
    existingResumeUrl ? Promise.resolve(existingResumeUrl) : uploadToCloudinary(file, 'auto'),
  ]);

  if (additionalText.trim()) {
    profile.additionalText = additionalText.trim();
  }

  return { profile, resumeText: resumeText.slice(0, MAX_RESUME_TEXT_CHARS), resumeUrl: uploadedUrl };
};

const safeDocumentKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100);

const normalizeResumeEmail = (value?: string | null) => (value || '').trim().toLowerCase();

const normalizeResumePhoneDigits = (value?: string | null) => {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length < 7) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const buildResumeDumpIdentityKey = (
  profile: Pick<ParsedResumeProfile, 'email' | 'phone' | 'name'>,
  fileName: string
) => {
  const email = normalizeResumeEmail(profile.email);
  if (email) return safeDocumentKey(email) || 'candidate';

  const phone = normalizeResumePhoneDigits(profile.phone);
  if (phone) return `phone_${phone}`;

  return safeDocumentKey(`${profile.name || 'candidate'}_${fileName || 'resume'}`) || 'candidate';
};

const toMillisSafe = (value: unknown) => {
  if (!value) return 0;
  if (typeof value === 'object' && value !== null && 'toMillis' in value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof value === 'object' && value !== null && 'seconds' in value && typeof (value as { seconds?: unknown }).seconds === 'number') {
    return (value as { seconds: number }).seconds * 1000;
  }
  return 0;
};

const resolveResumeDumpCandidateId = async (
  recruiterUID: string,
  profile: Pick<ParsedResumeProfile, 'email' | 'phone' | 'name'>,
  fileName: string
) => {
  const identityKey = buildResumeDumpIdentityKey(profile, fileName);
  const stableId = `${safeDocumentKey(recruiterUID)}_${identityKey}`;
  const email = normalizeResumeEmail(profile.email);

  // Prefer querying existing docs. Do NOT getDoc(stableId) when it may be missing —
  // Firestore denies reads on non-existent docs when rules depend on resource.data.
  if (email) {
    try {
      const legacySnap = await getDocs(query(
        collection(db, 'resumeDumpCandidates'),
        where('recruiterUID', '==', recruiterUID),
        where('email', '==', email),
        limit(25)
      ));
      if (!legacySnap.empty) {
        const sorted = [...legacySnap.docs].sort(
          (left, right) => toMillisSafe(right.data().updatedAt || right.data().createdAt) - toMillisSafe(left.data().updatedAt || left.data().createdAt)
        );
        const primary = sorted.find((entry) => entry.id === stableId) || sorted[0];
        return {
          candidateId: primary.id,
          alreadyExists: true,
          duplicateIds: sorted.filter((entry) => entry.id !== primary.id).map((entry) => entry.id),
          createdAt: primary.data()?.createdAt,
        };
      }
    } catch (error) {
      console.warn('Could not look up existing resume dump entries by email:', error);
    }
  }

  return { candidateId: stableId, alreadyExists: false, duplicateIds: [] as string[], createdAt: undefined as unknown };
};

export const saveResumeDumpCandidate = async ({
  recruiterUID,
  teamId,
  createdBy,
  profile,
  resumeText,
  resumeUrl,
  fileName,
  mimeType,
  fileSize,
  additionalText,
  source,
  sourceInterviewId = '',
  sourceJobTitle = '',
}: {
  recruiterUID: string;
  teamId?: string;
  createdBy?: { uid: string; name?: string; email?: string; role?: string; designation?: string };
  profile: ParsedResumeProfile;
  resumeText: string;
  resumeUrl: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
  additionalText?: string;
  source: ResumeSource;
  sourceInterviewId?: string;
  sourceJobTitle?: string;
}) => {
  if (!recruiterUID) throw new Error('Recruiter ownership is required to save a resume.');

  const normalizedProfile: ParsedResumeProfile = {
    ...profile,
    email: normalizeResumeEmail(profile.email),
    phone: formatExtractedPhone(profile.phone),
  };

  // Candidates are unauthenticated and cannot query/read the dump, so use a stable
  // identity id and upsert. Recruiters can resolve legacy duplicates and clean them up.
  let candidateId: string;
  let duplicateIds: string[] = [];
  let existingCreatedAt: unknown;

  if (source === 'candidate_interview') {
    candidateId = `${safeDocumentKey(recruiterUID)}_${buildResumeDumpIdentityKey(normalizedProfile, fileName)}`;
  } else {
    const resolved = await resolveResumeDumpCandidateId(recruiterUID, normalizedProfile, fileName);
    candidateId = resolved.candidateId;
    duplicateIds = resolved.duplicateIds;
    existingCreatedAt = resolved.createdAt;
  }

  const candidateRef = doc(db, 'resumeDumpCandidates', candidateId);

  await setDoc(candidateRef, {
    ...normalizedProfile,
    recruiterUID,
    teamId: teamId || recruiterUID,
    ...(createdBy ? { createdBy } : {}),
    resumeUrl,
    resumeFileName: fileName || 'resume',
    resumeMimeType: mimeType || 'application/octet-stream',
    resumeSize: Math.max(0, fileSize || 0),
    resumeText: normalizeWhitespace(resumeText).slice(0, MAX_RESUME_TEXT_CHARS),
    ...(additionalText !== undefined ? { additionalText: normalizeWhitespace(additionalText).slice(0, 10000) } : {}),
    source,
    sourceInterviewId,
    sourceJobTitle,
    ...(existingCreatedAt ? { createdAt: existingCreatedAt } : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  if (duplicateIds.length > 0) {
    await Promise.all(duplicateIds.map(async (duplicateId) => {
      try {
        await deleteDoc(doc(db, 'resumeDumpCandidates', duplicateId));
      } catch (error) {
        console.warn(`Could not remove duplicate resume dump entry ${duplicateId}:`, error);
      }
    }));
  }

  return candidateId;
};

const tokenSet = (value: string) => new Set(normalizeSearchText(value).split(' ').filter((token) => token.length > 2));

const overlapRatio = (left: string, right: string) => {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let overlap = 0;
  leftTokens.forEach((token) => { if (rightTokens.has(token)) overlap++; });
  return overlap / Math.max(1, leftTokens.size);
};

const skillMatches = (candidateSkill: string, requiredSkill: string) => {
  const candidate = normalizeComparable(canonicalizeSkill(candidateSkill));
  const required = normalizeComparable(canonicalizeSkill(requiredSkill));
  return Boolean(candidate && required && (candidate === required || (candidate.length >= 5 && required.length >= 5 && (candidate.includes(required) || required.includes(candidate)))));
};

export const scoreCandidateForRole = (
  candidate: ResumeDumpRecord,
  role: { title: string; description: string; requiredSkills: string[]; minExperience?: number; maxExperience?: number }
): CandidateMatch | null => {
  const requiredSkills = uniqueStrings(role.requiredSkills.map(canonicalizeSkill), 30);
  const candidateSkills = uniqueStrings([...(candidate.skills || []), ...(candidate.experience || []).flatMap((entry) => entry.skills || [])].map(canonicalizeSkill), 50);
  const evidenceText = `${candidate.currentTitle || ''} ${candidate.summary || ''} ${(candidate.experience || []).map((entry) => `${entry.title} ${entry.company} ${(entry.highlights || []).join(' ')}`).join(' ')} ${candidate.resumeText || ''}`;
  const matchedSkills = requiredSkills.filter((required) => candidateSkills.some((skill) => skillMatches(skill, required)) || extractSkillSignals(evidenceText).some((skill) => skillMatches(skill, required)));
  const missingSkills = requiredSkills.filter((skill) => !matchedSkills.includes(skill));

  const skillCoverage = requiredSkills.length ? matchedSkills.length / requiredSkills.length : 0;
  const skillScore = Math.round(skillCoverage * 60);
  const roleEvidence = `${candidate.currentTitle || ''} ${(candidate.experience || []).map((entry) => entry.title).join(' ')} ${candidate.summary || ''}`;
  const roleRatio = Math.max(overlapRatio(role.title, roleEvidence), overlapRatio(`${role.title} ${role.description.slice(0, 500)}`, roleEvidence));
  const roleScore = Math.round(Math.min(1, roleRatio * 2.5) * 20);

  const minExperience = Math.max(0, Number(role.minExperience) || 0);
  const candidateExperience = Math.max(0, Number(candidate.totalExperienceYears) || 0);
  let experienceScore = 10;
  if (minExperience > 0) experienceScore = Math.round(Math.min(1, candidateExperience / minExperience) * 15);
  else if (candidateExperience > 0) experienceScore = 15;

  const evidenceHits = matchedSkills.filter((skill) => normalizeSearchText(evidenceText).includes(normalizeSearchText(skill))).length;
  const evidenceScore = matchedSkills.length ? Math.round((evidenceHits / matchedSkills.length) * 5) : 0;
  const matchScore = Math.min(100, skillScore + roleScore + experienceScore + evidenceScore);
  if (matchScore < 20 || (requiredSkills.length > 0 && matchedSkills.length === 0 && roleScore < 10)) return null;

  const matchReasons: string[] = [];
  if (matchedSkills.length) matchReasons.push(`${matchedSkills.length}/${requiredSkills.length} required skills matched`);
  if (roleScore >= 10) matchReasons.push('Relevant role or experience evidence');
  if (minExperience > 0) matchReasons.push(candidateExperience >= minExperience ? `Meets ${minExperience}+ years requirement` : `${Math.max(0, minExperience - candidateExperience).toFixed(1)} years below target`);
  if (candidate.parsingMethod === 'deterministic') matchReasons.push('Review recommended: limited structured resume data');

  return { ...candidate, matchScore, matchedSkills, missingSkills, matchReasons, skillScore, experienceScore, roleScore };
};
