import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import * as pdfjsLib from 'pdfjs-dist';
import * as mammoth from 'mammoth';
import { Award, Clock, Edit3, Filter, GraduationCap, MapPin, Plus, Archive, Briefcase, Check, CheckCircle2, CheckSquare, ChevronDown, Copy, ExternalLink, FileText, Mail, MessageSquare, RotateCcw, Search, Send, SlidersHorizontal, Sparkles, Square, Trash2, UploadCloud, UserCheck, UserX, XCircle } from 'lucide-react';

import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { useMessageBox } from '../components/MessageBox';
import { LocationCityInput } from '../components/LocationCityInput';
import { EducationInput } from '../components/EducationInput';
import { ALL_EDUCATION_DEGREES, EDUCATION_QUALIFICATIONS, EDUCATION_SPECIALIZATIONS, EducationQualification } from '../data/allEducationDegrees';
import { isEducationMatching } from '../utils/educationMatcher';

import { MAHARASHTRA_CITIES } from '../data/maharashtraCities';
import { ALL_JOB_DOMAINS, ALL_JOB_SECTORS, ALL_JOB_DEPARTMENTS, resolveCandidateSectorsAndDepartments } from '../data/jobDomains';
import { SKILL_OPTIONS } from './Profile';
import { analyzeResumeText, ingestResumeFile, saveResumeDumpCandidate } from '../services/resumeService';
import { sendBulkWhatsAppInvites } from '../services/waSenderService';
import { sendInterviewInvitations } from '../services/sesService';
import { logTeamActivity } from '../services/auditService';
import { dedupeCandidatesByIdentity } from '../services/candidateIdentity';
import { deleteFileFromS3ByUrl } from '../services/s3Service';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// Domain Skill Synonyms Dictionary for Resume Dump Skill Filtering
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

type TimestampLike =
  | {
      toDate?: () => Date;
      toMillis?: () => number;
      seconds?: number;
    }
  | Date
  | string
  | null
  | undefined;

interface ResumeDumpCandidate {
  id: string;
  recruiterUID: string;
  name: string;
  email: string;
  phone: string;
  skills: string[];
  resumeUrl: string;
  resumeFileName: string;
  resumeMimeType?: string;
  resumeSize?: number;
  resumeText?: string;
  additionalText?: string;
  location?: string;
  currentTitle?: string;
  summary?: string;
  totalExperienceYears?: number;
  experience?: Array<{
    title: string;
    company: string;
    startDate: string;
    endDate: string;
    highlights: string[];
    skills: string[];
  }>;
  education?: Array<{ degree: string; institution: string; year: string }>;
  certifications?: string[];
  languages?: string[];
  source?: string;
  sourceJobTitle?: string;
  parsingMethod?: string;
  isHired?: boolean;
  doNotSuggest?: boolean;
  employmentStatus?: string;
  isWorking?: boolean;
  noticePeriod?: string;
  noticePeriodDays?: string;
  noticePeriodVal?: string;
  noticePeriodUnit?: string;
  currentSalary?: string;
  expectedSalary?: string;
  maritalStatus?: string;
  domain?: string;
  domains?: string[];
  sector?: string;
  sectors?: string[];
  department?: string;
  departments?: string[];
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
}

interface UploadResult {
  fileName: string;
  status: 'saved' | 'failed';
  message: string;
}

const SkeletonBlock = ({ className = '', style }: { className?: string; style?: React.CSSProperties }) => (
  <span className={`block animate-pulse rounded-[6px] bg-white/[0.06] ${className}`} style={style} aria-hidden="true" />
);

export const ResumeDumpSkeleton = () => (
  <div className="-mx-4 -my-8 min-h-[calc(100vh-3.5rem)] bg-[#000] text-white sm:-mx-6 lg:-mx-8">
    <section className="border-b border-white/[0.11] bg-[#000]">
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-7 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <SkeletonBlock className="h-4 w-32 bg-white/[0.04]" />
          <SkeletonBlock className="mt-2 h-8 w-56 max-w-full" />
          <SkeletonBlock className="mt-2 h-4 w-[34rem] max-w-full bg-white/[0.04]" />
        </div>
        <SkeletonBlock className="h-9 w-36 bg-white/[0.12]" />
      </div>
    </section>

    <section className="grid gap-3 border-b border-white/[0.11] px-4 py-3 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-7">
      <SkeletonBlock className="h-9 w-full bg-white/[0.04]" />
      <SkeletonBlock className="h-9 w-full bg-white/[0.04] lg:w-80" />
    </section>

    <section className="border-b border-white/[0.11] px-4 py-3 sm:px-6 lg:px-7">
      <div className="flex min-h-20 items-center justify-center gap-3 rounded-[6px] border border-dashed border-white/[0.13] bg-white/[0.02] px-4 py-4">
        <SkeletonBlock className="h-8 w-8 shrink-0 bg-white/[0.05]" />
        <div className="w-full max-w-sm">
          <SkeletonBlock className="h-4 w-48 max-w-full" />
          <SkeletonBlock className="mt-2 h-3 w-32 bg-white/[0.04]" />
        </div>
      </div>
    </section>

    <section className="flex min-h-[360px] flex-col">
      <div className="hidden grid-cols-[minmax(220px,1fr)_140px_minmax(260px,1fr)_160px_220px] gap-4 border-b border-white/[0.11] bg-[#080808] px-4 py-2.5 sm:px-6 lg:grid lg:px-7">
        {[120, 64, 82, 76, 70].map((width, index) => (
          <span key={index} className="block h-3 animate-pulse rounded-[6px] bg-white/[0.04]" style={{ width }} aria-hidden="true" />
        ))}
      </div>

      <div className="divide-y divide-white/[0.08]">
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            key={index}
            className="grid gap-3 px-4 py-3 sm:px-6 lg:grid-cols-[minmax(220px,1fr)_140px_minmax(260px,1fr)_160px_220px] lg:items-center lg:gap-4 lg:px-7"
          >
            <div className="min-w-0">
              <SkeletonBlock className="h-4 w-44 max-w-full" />
              <SkeletonBlock className="mt-2 h-3 w-56 max-w-full bg-white/[0.04]" />
            </div>
            <SkeletonBlock className="h-4 w-24 bg-white/[0.04]" />
            <div className="flex flex-wrap gap-1.5">
              <SkeletonBlock className="h-6 w-20 bg-white/[0.04]" />
              <SkeletonBlock className="h-6 w-16 bg-white/[0.04]" />
              <SkeletonBlock className="h-6 w-24 bg-white/[0.04]" />
            </div>
            <div>
              <SkeletonBlock className="h-3 w-20 bg-white/[0.04]" />
              <SkeletonBlock className="mt-2 h-3 w-28 bg-white/[0.035]" />
            </div>
            <div className="flex gap-2 lg:justify-end">
              <SkeletonBlock className="h-8 w-28 bg-white/[0.04]" />
              <SkeletonBlock className="h-8 w-20 bg-white/[0.04]" />
            </div>
          </div>
        ))}
      </div>
    </section>
  </div>
);

const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
const phoneRegex = /(?:\+?\d{1,4}[\s.-]?)?(?:[6-9]\d{4}[\s.-]?\d{5}|(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{4,5})/;
const sectionStopRegex = /\b(experience|work experience|employment|projects?|education|certifications?|achievements?|summary|profile|objective|languages?|interests?|declaration|personal details)\b/i;
const skillSectionRegex = /\b(skills?|technical skills?|core skills?|tools?|technologies?|tech stack)\b\s*[:\-]?\s*([\s\S]{0,1800})/i;

const SKILL_ALIASES: Array<{ label: string; patterns: RegExp[] }> = [
  { label: 'JavaScript', patterns: [/\bjavascript\b/i, /\bjs\b/i, /\bjs concepts?\b/i, /\becmascript\b/i] },
  { label: 'ES6+', patterns: [/\bes\s*6\+?\b/i, /\becmascript\s*6\b/i] },
  { label: 'Event Loop', patterns: [/\bevent loop\b/i] },
  { label: 'Promises', patterns: [/\bpromises?\b/i] },
  { label: 'Async/Await', patterns: [/\basync\s*\/?\s*await\b/i] },
  { label: 'DOM Manipulation', patterns: [/\bdom manipulation\b/i, /\bdom\b/i] },
  { label: 'React', patterns: [/\breact(?:\.js|js)?\b/i] },
  { label: 'Next.js', patterns: [/\bnext(?:\.js|js)?\b/i] },
  { label: 'Vue.js', patterns: [/\bvue(?:\.js|js)?\b/i] },
  { label: 'Angular', patterns: [/\bangular\b/i] },
  { label: 'Redux', patterns: [/\bredux\b/i] },
  { label: 'TypeScript', patterns: [/\btypescript\b/i, /\btype script\b/i] },
  { label: 'Vite', patterns: [/\bvite\b/i] },
  { label: 'Parcel', patterns: [/\bparcel\b/i] },
  { label: 'Tailwind CSS', patterns: [/\btailwind(?:\s+css)?\b/i] },
  { label: 'Bootstrap', patterns: [/\bbootstrap\b/i] },
  { label: 'SASS', patterns: [/\bsass\b/i, /\bscss\b/i] },
  { label: 'HTML5', patterns: [/\bhtml\s*5\b/i, /\bhtml5\b/i] },
  { label: 'HTML', patterns: [/\bhtml\b/i] },
  { label: 'CSS3', patterns: [/\bcss\s*3\b/i, /\bcss3\b/i] },
  { label: 'CSS', patterns: [/\bcss\b/i] },
  { label: 'Node.js', patterns: [/\bnode(?:\.js|js)?\b/i] },
  { label: 'Express.js', patterns: [/\bexpress(?:\.js|js)?\b/i] },
  { label: 'MongoDB', patterns: [/\bmongodb(?:\s+atlas)?\b/i, /\bmongo\s*db\b/i] },
  { label: 'Mongoose', patterns: [/\bmongoose\b/i] },
  { label: 'Supabase', patterns: [/\bsupabase\b/i] },
  { label: 'Firebase', patterns: [/\bfirebase\b/i, /\bfirestore\b/i] },
  { label: 'SQL', patterns: [/\bsql\b/i] },
  { label: 'PostgreSQL', patterns: [/\bpostgres(?:ql)?\b/i] },
  { label: 'MySQL', patterns: [/\bmysql\b/i] },
  { label: 'GraphQL', patterns: [/\bgraphql\b/i] },
  { label: 'REST API', patterns: [/\brest(?:ful)?\s+api\b/i, /\brest api\b/i] },
  { label: 'Python', patterns: [/\bpython\b/i] },
  { label: 'Java', patterns: [/\bjava\b/i] },
  { label: 'C++', patterns: [/\bc\+\+\b/i] },
  { label: 'C#', patterns: [/\bc#\b/i, /\bc sharp\b/i] },
  { label: 'AWS', patterns: [/\baws\b/i, /\bamazon web services\b/i] },
  { label: 'Docker', patterns: [/\bdocker\b/i] },
  { label: 'Linux', patterns: [/\blinux\b/i] },
  { label: 'Git', patterns: [/\bgit\b/i] },
  { label: 'GitHub', patterns: [/\bgithub\b/i, /\bgit hub\b/i] },
  { label: 'Figma', patterns: [/\bfigma\b/i] },
  { label: 'Postman', patterns: [/\bpostman\b/i] },
  { label: 'npm', patterns: [/\bnpm\b/i] },
  { label: 'Yarn', patterns: [/\byarn\b/i] },
  { label: 'Jest', patterns: [/\bjest\b/i] },
  { label: 'Cypress', patterns: [/\bcypress\b/i] },
  { label: 'Playwright', patterns: [/\bplaywright\b/i] },
  { label: 'DSA', patterns: [/\bdsa\b/i, /\bdata structures?\b/i, /\balgorithms?\b/i] },
  { label: 'Machine Learning', patterns: [/\bmachine learning\b/i, /\bml\b/i] },
  { label: 'Data Analysis', patterns: [/\bdata analysis\b/i, /\bdata analytics\b/i] },
  { label: 'VS Code', patterns: [/\bvs\s*code\b/i, /\bvisual studio code\b/i, /\bvscode\b/i] },
];

const skillAliasPriority = new Map(SKILL_ALIASES.map((alias, index) => [alias.label, index]));

const skillCategoryLabels = new Set([
  'skills',
  'technical skills',
  'core skills',
  'tools',
  'technologies',
  'tech stack',
  'frontend',
  'front end',
  'backend',
  'back end',
  'js concepts',
]);

const toMillis = (value: TimestampLike): number => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
};

const formatDate = (value: TimestampLike) => {
  const millis = toMillis(value);
  if (!millis) return 'Just now';
  return new Date(millis).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const normalizeResumeTextForSkills = (value: string) => (
  value
    .replace(/\r/g, '\n')
    .replace(/[•●▪·]/g, ',')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b(Frontend|Front End|Backend|Back End|Tools|Technologies|Tech Stack|JS Concepts)\b\s*/gi, '\n$1: ')
);

const normalizeSkillToken = (value: string) => (
  value
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^[^a-zA-Z0-9+#.]+|[^a-zA-Z0-9+#.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
);

const normalizeComparableSkill = (value: string) => value.toLowerCase().replace(/[^a-z0-9+#]/g, '');

const getSkillSectionText = (text: string) => {
  const preparedText = normalizeResumeTextForSkills(text);
  const directMatch = preparedText.match(skillSectionRegex);
  if (!directMatch) return '';

  const sectionText = directMatch[2] || '';
  const lines = sectionText.split(/\r?\n/);
  const stopIndex = lines.findIndex((line, index) => {
    const heading = line.trim().replace(/[:\-].*$/, '').trim().toLowerCase();
    return index > 0 && sectionStopRegex.test(line.trim()) && !skillCategoryLabels.has(heading);
  });
  if (stopIndex >= 0) return lines.slice(0, stopIndex).join('\n');

  const inlineStop = sectionText.search(sectionStopRegex);
  if (inlineStop > 80) return sectionText.slice(0, inlineStop);
  return sectionText;
};

const extractName = (text: string, fallback: string) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .slice(0, 12);

  const candidateLine = lines.find((line) => {
    const lower = line.toLowerCase();
    return (
      line.length >= 3 &&
      line.length <= 60 &&
      !emailRegex.test(line) &&
      !phoneRegex.test(line) &&
      !lower.includes('resume') &&
      !lower.includes('curriculum') &&
      !lower.includes('linkedin') &&
      !lower.includes('github') &&
      !lower.includes('http')
    );
  });

  if (candidateLine) return candidateLine.replace(/[|•]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return fallback.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Unknown Candidate';
};

const extractSkills = (text: string) => {
  const skillSection = getSkillSectionText(text);
  const searchableText = normalizeWhitespace(`${skillSection}\n${text}`)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[•●▪·]/g, ',');
  const found = new Map<string, string>();

  const addSkill = (skill: string) => {
    const normalized = normalizeSkillToken(skill);
    if (!normalized) return;
    const comparable = normalizeComparableSkill(normalized);
    if (
      normalized.length < 2 ||
      normalized.length > 40 ||
      skillCategoryLabels.has(normalized.toLowerCase()) ||
      /^\d+$/.test(normalized)
    ) {
      return;
    }

    const alias = SKILL_ALIASES.find((item) => item.patterns.some((pattern) => pattern.test(normalized)));
    const canonical = alias?.label || SKILL_OPTIONS.find((option) => normalizeComparableSkill(option) === comparable) || normalized;
    found.set(normalizeComparableSkill(canonical), canonical);
  };

  SKILL_OPTIONS.forEach((skill) => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\ /g, '\\s+');
    if (new RegExp(`(^|[^a-zA-Z0-9])${escaped}([^a-zA-Z0-9]|$)`, 'i').test(searchableText)) {
      addSkill(skill);
    }
  });

  SKILL_ALIASES.forEach((alias) => {
    if (alias.patterns.some((pattern) => pattern.test(searchableText))) {
      addSkill(alias.label);
    }
  });

  skillSection
    .split(/[,;|/\\\n\r\t]+/)
    .map((item) => item.replace(/^(frontend|backend|tools?|technologies?|js concepts?|technical skills?)\s*[:\-]?\s*/i, ''))
    .forEach((item) => addSkill(item));

  return Array.from(found.values()).slice(0, 24);
};

const extractSkillsRobust = (text: string) => {
  const skillSection = getSkillSectionText(text);
  const preparedResumeText = normalizeResumeTextForSkills(text);
  const searchableText = normalizeWhitespace(`${skillSection}\n${preparedResumeText}`);
  const found = new Map<string, string>();

  const addSkill = (skill: string) => {
    const normalized = normalizeSkillToken(skill);
    if (!normalized) return;
    const comparable = normalizeComparableSkill(normalized);
    if (
      normalized.length < 2 ||
      normalized.length > 40 ||
      skillCategoryLabels.has(normalized.toLowerCase()) ||
      /^\d+$/.test(normalized)
    ) {
      return;
    }

    const alias = SKILL_ALIASES.find((item) => item.patterns.some((pattern) => pattern.test(normalized)));
    const canonical = alias?.label || SKILL_OPTIONS.find((option) => normalizeComparableSkill(option) === comparable) || normalized;
    found.set(normalizeComparableSkill(canonical), canonical);
  };

  const scanKnownSkills = (source: string) => {
    SKILL_OPTIONS.forEach((skill) => {
      const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\ /g, '\\s+');
      if (new RegExp(`(^|[^a-zA-Z0-9+#.])${escaped}([^a-zA-Z0-9+#.]|$)`, 'i').test(source)) {
        addSkill(skill);
      }
    });

    SKILL_ALIASES.forEach((alias) => {
      if (alias.patterns.some((pattern) => pattern.test(source))) {
        addSkill(alias.label);
      }
    });
  };

  scanKnownSkills(searchableText);

  const sectionToTokenize = skillSection || preparedResumeText;
  sectionToTokenize
    .split(/[,;|/\\\n\r\t]+/)
    .map((item) => item.replace(/^(frontend|front end|backend|back end|tools?|technologies?|tech stack|js concepts?|technical skills?)\s*[:\-]?\s*/i, ''))
    .map(normalizeSkillToken)
    .filter(Boolean)
    .forEach((item) => {
      scanKnownSkills(item);
      addSkill(item);
    });

  return Array.from(found.values())
    .sort((left, right) => {
      const leftPriority = skillAliasPriority.get(left) ?? 999;
      const rightPriority = skillAliasPriority.get(right) ?? 999;
      return leftPriority - rightPriority || left.localeCompare(right);
    })
    .slice(0, 30);
};

const candidateDocId = (recruiterUID: string, email: string) => (
  `${recruiterUID}_${email.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`.replace(/_+$/g, '')
);

const createFallbackCandidateId = (recruiterUID: string, fileName: string) => {
  const safeName = fileName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return `${recruiterUID}_resume_${safeName || 'file'}_${Date.now()}`;
};

const readResumeText = async (file: File) => {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const pages: string[] = [];
    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
      const page = await pdf.getPage(pageIndex);
      const textContent = await page.getTextContent();
      pages.push(textContent.items.map((item: any) => item.str).join(' '));
    }
    return pages.join('\n');
  }

  if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.name.toLowerCase().endsWith('.docx')
  ) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
    return file.text();
  }

  throw new Error('Unsupported file type');
};

const ResumeDump: React.FC = () => {
  const { user, userProfile } = useAuth();
  const messageBox = useMessageBox();
  const [candidates, setCandidates] = useState<ResumeDumpCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [uploadExtraInfo, setUploadExtraInfo] = useState('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedUploadFiles, setSelectedUploadFiles] = useState<File[]>([]);
  const [uploadModalExtraInfo, setUploadModalExtraInfo] = useState('');
  const [uploadModalExpYears, setUploadModalExpYears] = useState('');
  const [uploadModalLocation, setUploadModalLocation] = useState('');
  const [uploadModalHighestEducation, setUploadModalHighestEducation] = useState('B.Tech / B.E. (Bachelor of Engineering / Technology)');
  const [searchTerm, setSearchTerm] = useState('');

  const [deletingCandidateId, setDeletingCandidateId] = useState<string | null>(null);
  const [isDraggingResume, setIsDraggingResume] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'hired'>('all');
  const [skillFilter, setSkillFilter] = useState<string>('all');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [isSkillRecBoxOpen, setIsSkillRecBoxOpen] = useState<boolean>(false);
  const [skillRecSearch, setSkillRecSearch] = useState<string>('');
  const [titleFilter, setTitleFilter] = useState<string>('all');
  const [expFilter, setExpFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [isDomainRecBoxOpen, setIsDomainRecBoxOpen] = useState<boolean>(false);
  const [domainRecSearch, setDomainRecSearch] = useState<string>('');
  const [matchScoreFilter, setMatchScoreFilter] = useState<string>('all');
  const [educationFilter, setEducationFilter] = useState<string>('all');
  const [educationQualFilter, setEducationQualFilter] = useState<string>('all');
  const [educationSpecFilter, setEducationSpecFilter] = useState<string>('all');
  const [selectedEducation, setSelectedEducation] = useState<string[]>([]);
  const [isEducationRecBoxOpen, setIsEducationRecBoxOpen] = useState<boolean>(false);
  const [educationRecSearch, setEducationRecSearch] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [showMoreFilters, setShowMoreFilters] = useState<boolean>(false);
  const [skillsPanelCandidate, setSkillsPanelCandidate] = useState<ResumeDumpCandidate | null>(null);
  const [previewResumeCandidate, setPreviewResumeCandidate] = useState<ResumeDumpCandidate | null>(null);

  // Strict Mandatory AI Criteria Checkmarks
  const [strictGender, setStrictGender] = useState(false);
  const [strictLocation, setStrictLocation] = useState(false);
  const [strictEducation, setStrictEducation] = useState(false);
  const [strictExperience, setStrictExperience] = useState(false);

  // Job selection, scoring, candidate checkbox selection, and invite modal states
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('all');
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);
  const [copiedUploadPortalLink, setCopiedUploadPortalLink] = useState(false);
  const [inviteModalEducation, setInviteModalEducation] = useState<string>('B.Tech / B.E. (Bachelor of Engineering / Technology)');
  const [inviteDeliveryMode, setInviteDeliveryMode] = useState<'both' | 'whatsapp_api' | 'whatsapp_web' | 'email'>('both');
  const [isSendingInvites, setIsSendingInvites] = useState(false);
  const [sendingProgressMsg, setSendingProgressMsg] = useState('');

  // Add candidate with optional text modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addCandidateForm, setAddCandidateForm] = useState({
    name: '',
    email: '',
    phone: '',
    additionalText: '',
  });
  const [addCandidateFile, setAddCandidateFile] = useState<File | null>(null);
  const [isSavingCandidate, setIsSavingCandidate] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editingNotesText, setEditingNotesText] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Edit Candidate Info State
  const [editingCandidate, setEditingCandidate] = useState<ResumeDumpCandidate | null>(null);
  const [editingCandidateForm, setEditingCandidateForm] = useState({
    name: '',
    email: '',
    phone: '',
    currentTitle: '',
    totalExperienceYears: '',
    location: '',
    skills: '',
    education: '',
    summary: '',
    additionalText: '',
    employmentStatus: 'Working',
    noticePeriod: '',
    currentSalary: '',
    expectedSalary: '',
    gender: '',
    maritalStatus: ''
  });
  const [isSavingCandidateEdit, setIsSavingCandidateEdit] = useState(false);

  const handleOpenEditCandidateModal = (candidate: ResumeDumpCandidate) => {
    setEditingCandidate(candidate);
    setEditingCandidateForm({
      name: candidate.name || '',
      email: candidate.email || '',
      phone: candidate.phone || '',
      currentTitle: candidate.currentTitle || '',
      totalExperienceYears: candidate.totalExperienceYears !== undefined && candidate.totalExperienceYears !== null ? String(candidate.totalExperienceYears) : '',
      location: candidate.location || '',
      skills: (candidate.skills || []).join(', '),
      education: (candidate.education || []).map(e => [e.degree, e.institution, e.year].filter(Boolean).join(' - ')).join('; ') || '',
      summary: candidate.summary || '',
      additionalText: candidate.additionalText || '',
      employmentStatus: candidate.employmentStatus || 'Working',
      noticePeriod: candidate.noticePeriod || (candidate.noticePeriodDays ? `${candidate.noticePeriodDays} Days` : ''),
      currentSalary: candidate.currentSalary || '',
      expectedSalary: candidate.expectedSalary || '',
      gender: (candidate as any).gender || '',
      maritalStatus: candidate.maritalStatus || ''
    });
  };

  const handleSaveCandidateEdit = async () => {
    if (!editingCandidate || !user) return;
    setIsSavingCandidateEdit(true);

    try {
      const parsedExp = editingCandidateForm.totalExperienceYears.trim()
        ? parseFloat(editingCandidateForm.totalExperienceYears.trim())
        : undefined;

      const updatedSkills = editingCandidateForm.skills
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const eduArray = editingCandidateForm.education.trim()
        ? editingCandidateForm.education.split(';').map(part => {
            const trimmed = part.trim();
            return { degree: trimmed };
          })
        : (editingCandidate.education || []);

      const updateData: any = {
        name: editingCandidateForm.name.trim(),
        email: editingCandidateForm.email.trim(),
        phone: editingCandidateForm.phone.trim(),
        currentTitle: editingCandidateForm.currentTitle.trim(),
        totalExperienceYears: parsedExp !== undefined && !isNaN(parsedExp) ? parsedExp : null,
        location: editingCandidateForm.location.trim(),
        skills: updatedSkills,
        education: eduArray,
        summary: editingCandidateForm.summary.trim(),
        additionalText: editingCandidateForm.additionalText.trim(),
        employmentStatus: editingCandidateForm.employmentStatus,
        noticePeriod: editingCandidateForm.noticePeriod.trim(),
        currentSalary: editingCandidateForm.currentSalary.trim(),
        expectedSalary: editingCandidateForm.expectedSalary.trim(),
        gender: editingCandidateForm.gender,
        maritalStatus: editingCandidateForm.maritalStatus,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, 'resumeDumpCandidates', editingCandidate.id), updateData);

      // Update local candidates state
      setCandidates(prev => prev.map(c => c.id === editingCandidate.id ? { ...c, ...updateData } : c));

      if (skillsPanelCandidate && skillsPanelCandidate.id === editingCandidate.id) {
        setSkillsPanelCandidate(prev => prev ? ({ ...prev, ...updateData }) : null);
      }

      const creatorInfo = {
        uid: user.uid,
        name: userProfile?.name || user.email || 'Recruiter',
        email: user.email || '',
        role: userProfile?.role || 'recruiter',
        designation: userProfile?.designation || 'Recruiter'
      };
      logTeamActivity(
        teamId,
        'candidate_updated',
        `Updated candidate profile info for "${editingCandidateForm.name || editingCandidateForm.email}"`,
        creatorInfo
      );

      messageBox.showSuccess('Candidate details updated successfully!');
      setEditingCandidate(null);
    } catch (err) {
      console.error('Failed to update candidate details:', err);
      messageBox.showError('Failed to update candidate details.');
    } finally {
      setIsSavingCandidateEdit(false);
    }
  };

  const [currentPage, setCurrentPage] = useState(1);

  const CANDIDATES_PER_PAGE = 10;

  const teamId = userProfile?.teamId || userProfile?.parentRecruiterId || user?.uid || '';

  // Reset page when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, skillFilter, titleFilter, expFilter, locationFilter, matchScoreFilter, educationFilter, sourceFilter, dateFilter, selectedJobId]);


  // Fetch all platform jobs / interviews from Firestore
  useEffect(() => {
    if (!user) return;
    const qInterviews = query(collection(db, 'interviews'));
    const unsubscribe = onSnapshot(
      qInterviews,
      (snapshot) => {
        const records = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
        setJobs(records);
      },
      (error) => {
        console.error('Error fetching jobs:', error);
      }
    );
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setCandidates([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const candidatesQuery = query(collection(db, 'resumeDumpCandidates'));

    const unsubscribe = onSnapshot(
      candidatesQuery,
      (snapshot) => {
        const records = snapshot.docs
          .map((snapshotDoc) => {
            const data = snapshotDoc.data();
            return {
              ...data,
              id: snapshotDoc.id,
              name: typeof data.name === 'string' ? data.name : '',
              email: typeof data.email === 'string' ? data.email : '',
              phone: typeof data.phone === 'string' ? data.phone : '',
              skills: Array.isArray(data.skills) ? data.skills : [],
              experience: Array.isArray(data.experience) ? data.experience : [],
              education: Array.isArray(data.education) ? data.education : [],
              certifications: Array.isArray(data.certifications) ? data.certifications : [],
              languages: Array.isArray(data.languages) ? data.languages : [],
              resumeUrl: typeof data.resumeUrl === 'string' ? data.resumeUrl : '',
              resumeFileName: typeof data.resumeFileName === 'string' ? data.resumeFileName : 'resume',
            } as ResumeDumpCandidate;
          })
          .filter((c: any) => {
            // Include candidates from public upload portal (/#/upload-resume) for ALL recruiters on the platform
            if (
              c.isPublicUpload === true ||
              c.isPublicCandidate === true ||
              c.isGlobalPublicCandidate === true ||
              c.source === 'public_job_seeker_upload' ||
              c.recruiterUID === 'DSOURCE_PUBLIC_JOB_SEEKER_POOL' ||
              c.recruiterUID === 'PUBLIC_JOB_SEEKER_POOL' ||
              c.teamId === 'DSOURCE_TALENT_ROSTER' ||
              c.teamId === 'GLOBAL_CANDIDATE_POOL'
            ) {
              return true;
            }
            if (teamId && c.teamId === teamId) return true;
            if (user?.uid && c.recruiterUID === user.uid) return true;
            return false;
          })
          .sort((left, right) => toMillis(right.updatedAt || right.createdAt) - toMillis(left.updatedAt || left.createdAt));
        setCandidates(dedupeCandidatesByIdentity(records, (candidate) => toMillis(candidate.updatedAt || candidate.createdAt)));
        setLoading(false);
      },
      (error) => {
        console.error('Error loading resume dump:', error);
        setCandidates([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, teamId]);

  const uniqueSkillsList = useMemo(() => {
    const set = new Set<string>();
    candidates.forEach(c => (c.skills || []).forEach(s => {
      if (s && s.trim()) set.add(s.trim());
    }));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [candidates]);

  const uniqueTitlesList = useMemo(() => {
    const set = new Set<string>();
    candidates.forEach(c => {
      if (c.currentTitle && c.currentTitle.trim()) set.add(c.currentTitle.trim());
      if (c.sourceJobTitle && c.sourceJobTitle.trim()) set.add(c.sourceJobTitle.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [candidates]);

  const uniqueLocationsList = useMemo(() => {
    const set = new Set<string>(MAHARASHTRA_CITIES);
    candidates.forEach(c => {
      if (c.location && c.location.trim()) {
        const parts = c.location.split(/[,/]/).map(p => p.trim()).filter(Boolean);
        parts.forEach(p => {
          const matchedCity = MAHARASHTRA_CITIES.find(m => m.toLowerCase() === p.toLowerCase() || p.toLowerCase().includes(m.toLowerCase()));
          if (matchedCity) {
            set.add(matchedCity);
          }
        });
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [candidates]);

  const getCandidateEduText = (cand: any): string => {
    if (!cand) return '';
    const eduParts: string[] = [];

    if (Array.isArray(cand.education)) {
      cand.education.forEach((e: any) => {
        if (typeof e === 'string' && e.trim()) {
          eduParts.push(e.trim());
        } else if (e && typeof e === 'object') {
          if (e.degree && typeof e.degree === 'string') eduParts.push(e.degree);
          if (e.institution && typeof e.institution === 'string') eduParts.push(e.institution);
          if (e.field || e.major) eduParts.push(e.field || e.major);
        }
      });
    } else if (typeof cand.education === 'string' && cand.education.trim()) {
      eduParts.push(cand.education.trim());
    }

    if (typeof cand.qualificationBasic === 'string' && cand.qualificationBasic.trim()) eduParts.push(cand.qualificationBasic.trim());
    if (typeof cand.qualificationPG === 'string' && cand.qualificationPG.trim()) eduParts.push(cand.qualificationPG.trim());
    if (typeof cand.qualification === 'string' && cand.qualification.trim()) eduParts.push(cand.qualification.trim());
    if (typeof cand.highestEducation === 'string' && cand.highestEducation.trim()) eduParts.push(cand.highestEducation.trim());
    if (typeof cand.degree === 'string' && cand.degree.trim()) eduParts.push(cand.degree.trim());

    return eduParts.join(' ').trim();
  };

  const uniqueEducationList = useMemo(() => {
    const set = new Set<string>();
    candidates.forEach(c => {
      if (Array.isArray(c.education)) {
        c.education.forEach((e: any) => {
          if (typeof e === 'string' && e.trim()) set.add(e.trim());
          else if (e?.degree && typeof e.degree === 'string' && e.degree.trim()) set.add(e.degree.trim());
        });
      } else if (typeof c.education === 'string' && c.education.trim()) {
        set.add(c.education.trim());
      }
      if (c.qualificationBasic && typeof c.qualificationBasic === 'string' && c.qualificationBasic.trim()) set.add(c.qualificationBasic.trim());
      if (c.qualificationPG && typeof c.qualificationPG === 'string' && c.qualificationPG.trim()) set.add(c.qualificationPG.trim());
      if ((c as any).qualification && typeof (c as any).qualification === 'string' && (c as any).qualification.trim()) set.add((c as any).qualification.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [candidates]);

  const allAvailableDomains = useMemo(() => {
    const list = ALL_JOB_DOMAINS.map(d => d.name);
    const set = new Set(list.map(d => d.toLowerCase()));
    candidates.forEach(c => {
      if (c.domain) {
        c.domain.split(', ').forEach(d => {
          const trimmed = d.trim();
          if (trimmed && !set.has(trimmed.toLowerCase())) {
            set.add(trimmed.toLowerCase());
            list.push(trimmed);
          }
        });
      }
    });
    return list;
  }, [candidates]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedJobId !== 'all') count++;
    if (statusFilter !== 'all') count++;
    if (skillFilter !== 'all') count++;
    if (selectedSkills.length > 0) count++;
    if (titleFilter !== 'all') count++;
    if (expFilter !== 'all') count++;
    if (locationFilter !== 'all') count++;
    if (domainFilter !== 'all') count++;
    if (selectedDomains.length > 0) count++;
    if (matchScoreFilter !== 'all') count++;
    if (educationFilter !== 'all') count++;
    if (educationQualFilter !== 'all') count++;
    if (educationSpecFilter !== 'all') count++;
    if (selectedEducation.length > 0) count++;
    if (sourceFilter !== 'all') count++;
    if (dateFilter !== 'all') count++;
    if (strictGender) count++;
    if (strictLocation) count++;
    if (strictEducation) count++;
    if (strictExperience) count++;
    return count;
  }, [selectedJobId, statusFilter, skillFilter, selectedSkills, titleFilter, expFilter, locationFilter, domainFilter, selectedDomains, matchScoreFilter, educationFilter, educationQualFilter, educationSpecFilter, selectedEducation, sourceFilter, dateFilter, searchTerm, strictGender, strictLocation, strictEducation, strictExperience]);

  const handleClearAllFilters = () => {
    setSelectedJobId('all');
    setStatusFilter('all');
    setSkillFilter('all');
    setSelectedSkills([]);
    setTitleFilter('all');
    setExpFilter('all');
    setLocationFilter('all');
    setDomainFilter('all');
    setSelectedDomains([]);
    setMatchScoreFilter('all');
    setEducationFilter('all');
    setEducationQualFilter('all');
    setEducationSpecFilter('all');
    setSelectedEducation([]);
    setSourceFilter('all');
    setDateFilter('all');
    setSearchTerm('');
    setSelectedCandidateIds([]);
    setStrictGender(false);
    setStrictLocation(false);
    setStrictEducation(false);
    setStrictExperience(false);
  };

  // Selected Job Object
  const activeSelectedJob = useMemo(() => {
    return jobs.find(j => j.id === selectedJobId) || null;
  }, [jobs, selectedJobId]);

  // Sync & Auto-Check strict states when activeSelectedJob changes
  useEffect(() => {
    if (activeSelectedJob) {
      // 1. Strict Gender
      const hasSpecificGender = Boolean(
        activeSelectedJob.strictGenderMatch ||
        activeSelectedJob.strictGender ||
        (activeSelectedJob.genderRequirement && activeSelectedJob.genderRequirement !== 'Any' && activeSelectedJob.genderRequirement !== 'all')
      );
      setStrictGender(hasSpecificGender);

      // 2. Strict Location
      const jobCity = activeSelectedJob.city || activeSelectedJob.location || '';
      const hasLocation = Boolean(
        activeSelectedJob.strictLocationMatch ||
        activeSelectedJob.strictLocation ||
        activeSelectedJob.isLocationStrict ||
        jobCity.trim().length > 0
      );
      setStrictLocation(hasLocation);
      if (jobCity) {
        const matchedCity = MAHARASHTRA_CITIES.find(m => m.toLowerCase() === jobCity.toLowerCase() || jobCity.toLowerCase().includes(m.toLowerCase()));
        if (matchedCity) setLocationFilter(matchedCity);
        else setLocationFilter(jobCity);
      }

      // 3. Strict Education
      const jobEdu = activeSelectedJob.education || activeSelectedJob.qualification || '';
      const hasEducation = Boolean(
        activeSelectedJob.strictEducationMatch ||
        activeSelectedJob.strictEducation ||
        activeSelectedJob.isEducationStrict ||
        (typeof jobEdu === 'string' ? jobEdu.trim().length > 0 : (Array.isArray(jobEdu) && jobEdu.length > 0))
      );
      setStrictEducation(hasEducation);
      if (jobEdu) {
        if (typeof jobEdu === 'string' && jobEdu.trim()) {
          setSelectedEducation(jobEdu.split(',').map((s: string) => s.trim()).filter(Boolean));
        } else if (Array.isArray(jobEdu)) {
          setSelectedEducation(jobEdu.map((s: any) => String(s).trim()).filter(Boolean));
        }
      }

      // 4. Strict Experience
      const minExp = activeSelectedJob.minExperience ?? activeSelectedJob.experienceYears ?? 0;
      const maxExp = activeSelectedJob.maxExperience ?? 0;
      const hasExp = Boolean(
        activeSelectedJob.strictExperienceMatch ||
        activeSelectedJob.strictExperience ||
        activeSelectedJob.isExperienceStrict ||
        minExp > 0 ||
        maxExp > 0
      );
      setStrictExperience(hasExp);
      if (minExp > 0 || maxExp > 0) {
        if (minExp >= 6 && (maxExp <= 8 || maxExp === 0)) setExpFilter('5-10');
        else if (minExp >= 1 && minExp < 3) setExpFilter('1-3');
        else if (minExp >= 3 && minExp < 5) setExpFilter('3-5');
        else if (minExp >= 5 && minExp < 10) setExpFilter('5-10');
        else if (minExp >= 10) setExpFilter('10+');
        else if (minExp === 0 && maxExp <= 1) setExpFilter('0-1');
      }
    } else {
      setStrictGender(false);
      setStrictLocation(false);
      setStrictEducation(false);
      setStrictExperience(false);
    }
  }, [activeSelectedJob]);

  // Compute Match Score for each candidate against activeSelectedJob
  const candidatesWithScores = useMemo(() => {
    if (!activeSelectedJob) {
      return candidates.map(c => ({ ...c, matchScore: undefined }));
    }

    const jobTitle = (activeSelectedJob.title || activeSelectedJob.jobRole || '').toLowerCase();
    
    // Extract job skills
    let jobSkills: string[] = [];
    if (Array.isArray(activeSelectedJob.requiredSkills)) {
      jobSkills = activeSelectedJob.requiredSkills.map((s: any) => String(s).toLowerCase().trim());
    } else if (typeof activeSelectedJob.requiredSkills === 'string') {
      jobSkills = activeSelectedJob.requiredSkills.split(',').map((s: string) => s.toLowerCase().trim());
    } else if (Array.isArray(activeSelectedJob.skills)) {
      jobSkills = activeSelectedJob.skills.map((s: any) => String(s).toLowerCase().trim());
    }

    const jobDescText = (activeSelectedJob.description || activeSelectedJob.jdText || activeSelectedJob.jobDescription || '').toLowerCase();

    return candidates.map(candidate => {
      const candSkills = (candidate.skills || []).map(s => s.toLowerCase().trim());
      const candTitle = (candidate.currentTitle || candidate.sourceJobTitle || '').toLowerCase().trim();
      const candText = `${candidate.summary || ''} ${candidate.resumeText || ''}`.toLowerCase();

      let skillScore = 0;
      if (jobSkills.length > 0) {
        let matchCount = 0;
        jobSkills.forEach(js => {
          if (candSkills.some(cs => cs.includes(js) || js.includes(cs)) || candText.includes(js)) {
            matchCount++;
          }
        });
        skillScore = (matchCount / jobSkills.length) * 100;
      } else {
        let matchCount = 0;
        candSkills.forEach(cs => {
          if (jobTitle.includes(cs) || jobDescText.includes(cs)) matchCount++;
        });
        skillScore = Math.min(100, matchCount * 25);
      }

      let titleScore = 0;
      if (candTitle && jobTitle) {
        if (candTitle === jobTitle || jobTitle.includes(candTitle) || candTitle.includes(jobTitle)) {
          titleScore = 100;
        } else {
          const titleWords = jobTitle.split(/\s+/).filter(w => w.length > 3);
          const matchedWords = titleWords.filter(w => candTitle.includes(w));
          if (titleWords.length > 0) {
            titleScore = (matchedWords.length / titleWords.length) * 80;
          }
        }
      }

      const totalScore = Math.round(Math.min(100, Math.max(15, (skillScore * 0.7) + (titleScore * 0.3))));
      return {
        ...candidate,
        matchScore: totalScore
      };
    });
  }, [candidates, activeSelectedJob]);

  const filteredCandidates = useMemo(() => {
    let result = candidatesWithScores.filter((candidate) => {
      // 1. Keyword search term
      const term = searchTerm.toLowerCase().trim();
      if (term) {
        const matchSearch =
          (candidate.name || '').toLowerCase().includes(term) ||
          (candidate.email || '').toLowerCase().includes(term) ||
          (candidate.phone || '').toLowerCase().includes(term) ||
          (candidate.currentTitle || '').toLowerCase().includes(term) ||
          (candidate.location || '').toLowerCase().includes(term) ||
          (candidate.sourceJobTitle || '').toLowerCase().includes(term) ||
          (candidate.resumeFileName || '').toLowerCase().includes(term) ||
          (candidate.skills || []).some((skill) => skill.toLowerCase().includes(term)) ||
          (candidate.education || []).some((item) => `${item.degree} ${item.institution}`.toLowerCase().includes(term));
        if (!matchSearch) return false;
      }

      // 2. Status filter
      if (statusFilter === 'hired' && !(candidate.isHired || candidate.doNotSuggest)) return false;
      if (statusFilter === 'available' && (candidate.isHired || candidate.doNotSuggest)) return false;

      // 3. Skill filter (Recommended Domain Skills & Multi-Select Checkmark Box)
      if (selectedSkills.length > 0) {
        const candSkillsList = (candidate.skills || []).map(s => s.toLowerCase());
        const candFullText = `${(candidate.skills || []).join(' ')} ${candidate.resumeText || ''} ${candidate.additionalText || ''} ${candidate.currentTitle || ''} ${candidate.sourceJobTitle || ''}`.toLowerCase();

        const hasSelectedSkill = selectedSkills.some(reqSkill => {
          const reqLower = reqSkill.toLowerCase().trim();
          if (!reqLower) return true;

          // 1. Direct candidate skill array match
          if (candSkillsList.some(cs => cs.includes(reqLower) || reqLower.includes(cs))) return true;

          // 2. Full text / resume text match
          if (candFullText.includes(reqLower)) return true;

          // 3. Domain synonyms check
          for (const [key, synonyms] of Object.entries(DOMAIN_SKILL_SYNONYMS)) {
            if (reqLower.includes(key) || key.includes(reqLower)) {
              if (synonyms.some(syn => candSkillsList.some(cs => cs.includes(syn)) || candFullText.includes(syn))) {
                return true;
              }
            }
          }

          return false;
        });

        if (!hasSelectedSkill) return false;
      }
      if (skillFilter !== 'all') {
        const reqLower = skillFilter.toLowerCase().trim();
        const candSkillsList = (candidate.skills || []).map(s => s.toLowerCase());
        const candFullText = `${(candidate.skills || []).join(' ')} ${candidate.resumeText || ''} ${candidate.additionalText || ''} ${candidate.currentTitle || ''} ${candidate.sourceJobTitle || ''}`.toLowerCase();

        const hasSkill = candSkillsList.some(s => s.includes(reqLower) || reqLower.includes(s)) || candFullText.includes(reqLower);
        if (!hasSkill) return false;
      }

      // 4. Job Title / Industry filter
      if (titleFilter !== 'all') {
        const candidateTitle = (candidate.currentTitle || candidate.sourceJobTitle || '').toLowerCase();
        if (!candidateTitle.includes(titleFilter.toLowerCase())) return false;
      }

      // 5. Experience Filter
      if (expFilter !== 'all') {
        const expYears = candidate.totalExperienceYears !== undefined && candidate.totalExperienceYears !== null
          ? candidate.totalExperienceYears
          : (parseFloat((candidate as any).experienceYears || '0') || 0);
        if (expFilter === '0-1' && (expYears < 0 || expYears > 1)) return false;
        if (expFilter === '1-3' && (expYears < 1 || expYears > 3)) return false;
        if (expFilter === '3-5' && (expYears < 3 || expYears > 5)) return false;
        if (expFilter === '5-10' && (expYears < 5 || expYears > 10)) return false;
        if (expFilter === '10+' && expYears < 10) return false;
      }

      // 6. Location Filter
      if (locationFilter !== 'all') {
        const candLoc = (candidate.location || '').toLowerCase();
        if (!candLoc.includes(locationFilter.toLowerCase())) return false;
      }

      // 6.5. Target Domain Filter
      if (domainFilter !== 'all') {
        const candDom = (candidate.domain || '').toLowerCase().trim();
        const candTitle = (candidate.currentTitle || candidate.sourceJobTitle || '').toLowerCase();
        const candSkills = (candidate.skills || []).join(' ').toLowerCase();
        const targetDomainObj = ALL_JOB_DOMAINS.find(d => d.name.toLowerCase() === domainFilter.toLowerCase());
        const domReqLower = domainFilter.toLowerCase();

        let matchesDomain = candDom.includes(domReqLower) || domReqLower.includes(candDom) || candTitle.includes(domReqLower);
        if (!matchesDomain && targetDomainObj) {
          matchesDomain = targetDomainObj.keywords.some(kw => candDom.includes(kw) || candTitle.includes(kw) || candSkills.includes(kw));
        }
        if (!matchesDomain) return false;
      }

      // 6.6. Multi-Select Target Sectors & Departments Checkmark Filter
      if (selectedDomains.length > 0) {
        const candDom = (candidate.domain || '').toLowerCase().trim();
        const candTitle = (candidate.currentTitle || candidate.sourceJobTitle || '').toLowerCase();
        const candSkills = (candidate.skills || []).join(' ').toLowerCase();

        const matchesCheckmarkDomain = selectedDomains.some(reqDomain => {
          const domReqLower = reqDomain.toLowerCase().trim();
          if (candDom.includes(domReqLower) || domReqLower.includes(candDom) || candTitle.includes(domReqLower)) {
            return true;
          }
          const targetDomainObj = ALL_JOB_DOMAINS.find(d => d.name.toLowerCase() === domReqLower);
          if (targetDomainObj) {
            return targetDomainObj.keywords.some(kw => candDom.includes(kw) || candTitle.includes(kw) || candSkills.includes(kw));
          }
          return false;
        });

        if (!matchesCheckmarkDomain) return false;
      }

      // 7. Match Score Filter
      if (matchScoreFilter !== 'all') {
        const score = candidate.matchScore || 0;
        if (matchScoreFilter === '75+' && score < 75) return false;
        if (matchScoreFilter === '50+' && score < 50) return false;
        if (matchScoreFilter === '30+' && score < 30) return false;
      }

      // 8. Education / Degree Filter (Qualification & Specialization 2-Selector + Multi-select checkmark Rec Box)
      if (educationQualFilter !== 'all') {
        const candEduText = getCandidateEduText(candidate);
        if (educationSpecFilter !== 'all') {
          if (!isEducationMatching(candEduText, educationSpecFilter)) return false;
        } else {
          const validSpecs = EDUCATION_SPECIALIZATIONS[educationQualFilter as EducationQualification] || [];
          const matchesQual = isEducationMatching(candEduText, educationQualFilter) ||
            validSpecs.some(spec => isEducationMatching(candEduText, spec));
          if (!matchesQual) return false;
        }
      } else if (educationSpecFilter !== 'all') {
        const candEduText = getCandidateEduText(candidate);
        if (!isEducationMatching(candEduText, educationSpecFilter)) return false;
      }

      if (selectedEducation.length > 0) {
        const candEduText = getCandidateEduText(candidate);
        const hasSelectedEdu = selectedEducation.some(reqEdu =>
          isEducationMatching(candEduText, reqEdu)
        );
        if (!hasSelectedEdu) return false;
      }
      if (educationFilter !== 'all') {
        const candEduText = getCandidateEduText(candidate);
        if (!isEducationMatching(candEduText, educationFilter)) return false;
      }

      // 9. Source Filter
      if (sourceFilter !== 'all') {
        const candSource = ((candidate as any).source || '').toLowerCase();
        if (sourceFilter === 'upload' && !candSource.includes('upload') && candSource !== 'resume_dump' && !candSource) return false;
        if (sourceFilter === 'interview' && !candSource.includes('interview')) return false;
        if (sourceFilter === 'manual' && candSource !== 'manual') return false;
      }

      // 10. Date Filter
      if (dateFilter !== 'all') {
        const createdTime = (candidate.createdAt as any)?.seconds
          ? (candidate.createdAt as any).seconds * 1000
          : (candidate.createdAt ? new Date(candidate.createdAt as any).getTime() : 0);
        if (createdTime > 0) {
          const now = Date.now();
          const diffDays = (now - createdTime) / (1000 * 60 * 60 * 24);
          if (dateFilter === '7d' && diffDays > 7) return false;
          if (dateFilter === '30d' && diffDays > 30) return false;
          if (dateFilter === '90d' && diffDays > 90) return false;
        }
      }

      // --- STRICT MANDATORY AI CRITERIA EVALUATION ---
      // 1. Strict Gender Filter
      if (strictGender) {
        let reqGender = (activeSelectedJob?.genderRequirement || (activeSelectedJob as any)?.gender || 'Any').toLowerCase().trim();
        if (reqGender !== 'any' && reqGender !== 'all') {
          const candGender = (candidate.gender || (candidate as any).genderRequirement || '').toLowerCase().trim();
          if (candGender && candGender !== reqGender && !candGender.includes(reqGender) && !reqGender.includes(candGender)) {
            return false;
          }
        }
      }

      // 2. Strict Location Filter
      if (strictLocation) {
        const targetCity = (locationFilter !== 'all' ? locationFilter : (activeSelectedJob?.city || activeSelectedJob?.location || '')).toLowerCase().trim();
        if (targetCity && targetCity !== 'all') {
          const candLoc = (candidate.location || '').toLowerCase().trim();
          if (!candLoc || (!candLoc.includes(targetCity) && !targetCity.includes(candLoc))) {
            return false;
          }
        }
      }

      // 3. Strict Education Filter
      if (strictEducation) {
        const activeEduList = selectedEducation.length > 0
          ? selectedEducation
          : (educationFilter !== 'all'
              ? [educationFilter]
              : (activeSelectedJob?.education ? (typeof activeSelectedJob.education === 'string' ? activeSelectedJob.education.split(',') : activeSelectedJob.education) : []));

        if (activeEduList.length > 0) {
          const candEduText = getCandidateEduText(candidate);
          const matchesAnyStrictEdu = activeEduList.some(reqEdu => isEducationMatching(candEduText, String(reqEdu).trim()));
          if (!matchesAnyStrictEdu) return false;
        }
      }

      // 4. Strict Experience Filter
      if (strictExperience) {
        const expYears = candidate.totalExperienceYears !== undefined && candidate.totalExperienceYears !== null
          ? candidate.totalExperienceYears
          : (parseFloat((candidate as any).experienceYears || '0') || 0);

        if (activeSelectedJob) {
          const minExp = activeSelectedJob.minExperience ?? (activeSelectedJob as any).experienceYears ?? 0;
          const maxExp = activeSelectedJob.maxExperience ?? (minExp > 0 ? minExp + 3 : 0);
          if (minExp > 0 || maxExp > 0) {
            if (expYears < minExp || (maxExp > 0 && expYears > maxExp)) return false;
          }
        } else if (expFilter !== 'all') {
          if (expFilter === '0-1' && (expYears < 0 || expYears > 1)) return false;
          if (expFilter === '1-3' && (expYears < 1 || expYears > 3)) return false;
          if (expFilter === '3-5' && (expYears < 3 || expYears > 5)) return false;
          if (expFilter === '5-10' && (expYears < 5 || expYears > 10)) return false;
          if (expFilter === '10+' && expYears < 10) return false;
        }
      }

      return true;
    });

    // If a job is selected, sort candidates by highest match score to lowest match score
    if (selectedJobId !== 'all') {
      result = [...result].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    }

    return result;
  }, [candidatesWithScores, searchTerm, statusFilter, skillFilter, selectedSkills, titleFilter, expFilter, locationFilter, matchScoreFilter, educationFilter, educationQualFilter, educationSpecFilter, selectedEducation, sourceFilter, dateFilter, selectedJobId, strictGender, strictLocation, strictEducation, strictExperience]);

  const isSearchOrFilterActive = useMemo(() => {
    return Boolean(
      selectedJobId !== 'all' ||
      searchTerm.trim() ||
      statusFilter !== 'all' ||
      skillFilter !== 'all' ||
      selectedSkills.length > 0 ||
      titleFilter !== 'all' ||
      expFilter !== 'all' ||
      locationFilter !== 'all' ||
      matchScoreFilter !== 'all' ||
      educationFilter !== 'all' ||
      sourceFilter !== 'all' ||
      dateFilter !== 'all'
    );
  }, [selectedJobId, searchTerm, statusFilter, skillFilter, selectedSkills, titleFilter, expFilter, locationFilter, matchScoreFilter, educationFilter, sourceFilter, dateFilter]);


  const totalPages = isSearchOrFilterActive
    ? 1
    : Math.max(1, Math.ceil(filteredCandidates.length / CANDIDATES_PER_PAGE));

  const paginatedCandidates = useMemo(() => {
    if (isSearchOrFilterActive) {
      // When searching or filtering, load ALL matching candidates at once
      return filteredCandidates;
    }
    // When browsing default view, load 10 candidates per page
    const start = (currentPage - 1) * CANDIDATES_PER_PAGE;
    return filteredCandidates.slice(start, start + CANDIDATES_PER_PAGE);
  }, [filteredCandidates, currentPage, isSearchOrFilterActive]);

  const processResumeFiles = async (files: File[], customExtraText?: string) => {
    if (!user || files.length === 0) return;

    if (!uploadModalLocation.trim()) {
      messageBox.show({
        title: 'Location Required',
        message: 'Candidate Location / City is mandatory for proper filtering. Please select or enter a city.',
        variant: 'error',
      });
      return;
    }

    if (!uploadModalExpYears.trim()) {
      messageBox.show({
        title: 'Experience Required',
        message: 'Candidate Experience in Years is mandatory for proper filtering. Please enter experience.',
        variant: 'error',
      });
      return;
    }

    if (!uploadModalHighestEducation.trim()) {
      messageBox.show({
        title: 'Education Required',
        message: 'Highest Education Qualification is mandatory for proper filtering. Please select candidate education.',
        variant: 'error',
      });
      return;
    }

    const parsedExpNum = parseFloat(uploadModalExpYears.trim());
    if (isNaN(parsedExpNum)) {
      messageBox.show({
        title: 'Invalid Experience',
        message: 'Please enter a valid numeric experience in years (e.g. 1.5 or 3).',
        variant: 'error',
      });
      return;
    }

    setUploading(true);
    setIsDraggingResume(false);
    setUploadResults([]);
    setUploadStatus(`Parsing and saving ${files.length} resume${files.length === 1 ? '' : 's'}...`);

    const extraInfoText = (customExtraText !== undefined ? customExtraText : uploadExtraInfo).trim();

    const results = await Promise.all(files.map(async (file): Promise<UploadResult> => {
      try {
        const ingested = await ingestResumeFile(file, {}, '', extraInfoText);

        ingested.profile.location = uploadModalLocation.trim();
        ingested.profile.totalExperienceYears = parsedExpNum;
        if (uploadModalHighestEducation.trim()) {
          const selectedDegree = uploadModalHighestEducation.trim();
          const existingEdu = ingested.profile.education || [];
          ingested.profile.education = [
            { degree: selectedDegree, institution: 'Verified Qualification', year: '' },
            ...existingEdu.filter(e => e.degree.toLowerCase() !== selectedDegree.toLowerCase())
          ];
        }

        const creatorInfo = {
          uid: user.uid,
          name: userProfile?.name || user.email || 'Recruiter',
          email: user.email || '',
          role: userProfile?.role || 'recruiter',
          designation: userProfile?.designation || 'Recruiter'
        };

        await saveResumeDumpCandidate({
          recruiterUID: user.uid,
          teamId,
          createdBy: creatorInfo,
          profile: ingested.profile,
          resumeText: ingested.resumeText,
          resumeUrl: ingested.resumeUrl,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          additionalText: extraInfoText || undefined,
          source: 'resume_dump',
        });


        // Audit Logging
        logTeamActivity(
          teamId,
          'resume_uploaded',
          `Uploaded resume "${file.name}" for candidate ${ingested.profile.name || 'Candidate'}`,
          creatorInfo
        );

        return {
          fileName: file.name,
          status: 'saved',
          message: `${ingested.profile.name || 'Candidate'} saved with ${ingested.profile.skills.length} skill signals`,
        };
      } catch (error: any) {
        console.error(`Resume dump upload failed for ${file.name}:`, error);
        return {
          fileName: file.name,
          status: 'failed',
          message: error?.message || 'Failed to process resume',
        };
      }
    }));

    setUploadResults(results);
    setTimeout(() => {
      setUploadResults([]);
    }, 8000);
    setUploading(false);
    setUploadStatus('');
    setSelectedUploadFiles([]);
    setUploadModalExtraInfo('');
    setUploadModalExpYears('');
    setUploadModalLocation('');
    setUploadModalHighestEducation('B.Tech / B.E. (Bachelor of Engineering / Technology)');
    setIsUploadModalOpen(false);

  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length > 0) {
      setSelectedUploadFiles(files);
      setIsUploadModalOpen(true);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = uploading ? 'none' : 'copy';
    if (!uploading) setIsDraggingResume(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingResume(false);
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDraggingResume(false);
    if (uploading) return;
    const droppedFiles = Array.from(event.dataTransfer.files || []);
    if (droppedFiles.length > 0) {
      setSelectedUploadFiles(droppedFiles);
      setIsUploadModalOpen(true);
    }
  };

  const handleSaveAddCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!addCandidateFile && !addCandidateForm.additionalText.trim()) {
      messageBox.show({
        title: 'Input Required',
        message: 'Please attach a resume file or enter candidate text / details.',
        variant: 'error',
      });
      return;
    }

    setIsSavingCandidate(true);
    try {
      const creatorInfo = {
        uid: user.uid,
        name: userProfile?.name || user.email || 'Recruiter',
        email: user.email || '',
        role: userProfile?.role || 'recruiter',
        designation: userProfile?.designation || 'Recruiter',
      };

      let profile;
      let resumeText = '';
      let resumeUrl = '';
      let fileName = 'Pasted Candidate Details';
      let mimeType = 'text/plain';
      let fileSize = 0;

      const manualOverrides = {
        ...(addCandidateForm.name.trim() ? { name: addCandidateForm.name.trim() } : {}),
        ...(addCandidateForm.email.trim() ? { email: addCandidateForm.email.trim() } : {}),
        ...(addCandidateForm.phone.trim() ? { phone: addCandidateForm.phone.trim() } : {}),
      };

      const extraText = addCandidateForm.additionalText.trim();

      if (addCandidateFile) {
        // If file is uploaded, pass extraText to ingestResumeFile so it gets parsed WITH the PDF data!
        const ingested = await ingestResumeFile(addCandidateFile, manualOverrides, '', extraText);
        profile = ingested.profile;
        resumeText = ingested.resumeText;
        resumeUrl = ingested.resumeUrl;
        fileName = addCandidateFile.name;
        mimeType = addCandidateFile.type || 'application/octet-stream';
        fileSize = addCandidateFile.size;
      } else {
        profile = await analyzeResumeText(extraText, 'Pasted Details', manualOverrides);
        resumeText = extraText;
        fileSize = extraText.length;
      }

      await saveResumeDumpCandidate({
        recruiterUID: user.uid,
        teamId,
        createdBy: creatorInfo,
        profile,
        resumeText,
        resumeUrl,
        fileName,
        mimeType,
        fileSize,
        additionalText: extraText || undefined,
        source: 'resume_dump',
      });

      logTeamActivity(
        teamId,
        'resume_uploaded',
        `Added candidate "${profile.name || 'Candidate'}" with extra details to Resume Dump`,
        creatorInfo
      );

      messageBox.show({
        title: 'Candidate Saved',
        message: `Successfully saved ${profile.name || 'Candidate'} to Resume Dump.`,
        variant: 'success',
      });

      setIsAddModalOpen(false);
      setAddCandidateForm({ name: '', email: '', phone: '', additionalText: '' });
      setAddCandidateFile(null);
    } catch (error: any) {
      console.error('Failed to save candidate with text:', error);
      messageBox.show({
        title: 'Error Saving Candidate',
        message: error?.message || 'Failed to save candidate. Please try again.',
        variant: 'error',
      });
    } finally {
      setIsSavingCandidate(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!skillsPanelCandidate || !user) return;
    setIsSavingNotes(true);
    try {
      const candidateRef = doc(db, 'resumeDumpCandidates', skillsPanelCandidate.id);
      const updatedText = editingNotesText.trim();
      await updateDoc(candidateRef, {
        additionalText: updatedText,
        updatedAt: serverTimestamp(),
      });

      setSkillsPanelCandidate((prev) => (prev ? { ...prev, additionalText: updatedText } : null));
      setCandidates((prev) => prev.map((c) => (c.id === skillsPanelCandidate.id ? { ...c, additionalText: updatedText } : c)));
      setIsEditingNotes(false);
      messageBox.show({
        title: 'Notes Saved',
        message: 'Successfully updated candidate notes.',
        variant: 'success',
      });
    } catch (err: any) {
      console.error('Failed to update candidate notes:', err);
      messageBox.show({
        title: 'Error',
        message: 'Could not update candidate notes.',
        variant: 'error',
      });
    } finally {
      setIsSavingNotes(false);
    }
  };

  const deleteCandidate = async (candidate: ResumeDumpCandidate) => {
    setDeletingCandidateId(candidate.id);
    try {
      // 1. Delete primary candidate document from Firestore
      await deleteDoc(doc(db, 'resumeDumpCandidates', candidate.id)).catch(() => null);
      await deleteDoc(doc(db, 'resumeDump', candidate.id)).catch(() => null);

      // 2. Also delete all matching candidate records by email so stale data is completely purged
      const targetEmail = (candidate.email || '').trim().toLowerCase();
      if (targetEmail && targetEmail.includes('@')) {
        try {
          const matchingSnap = await getDocs(query(collection(db, 'resumeDumpCandidates'), where('email', '==', targetEmail))).catch(() => null);
          if (matchingSnap && !matchingSnap.empty) {
            await Promise.all(matchingSnap.docs.map((d) => deleteDoc(d.ref).catch(() => null)));
          }
          const matchingDumpSnap = await getDocs(query(collection(db, 'resumeDump'), where('email', '==', targetEmail))).catch(() => null);
          if (matchingDumpSnap && !matchingDumpSnap.empty) {
            await Promise.all(matchingDumpSnap.docs.map((d) => deleteDoc(d.ref).catch(() => null)));
          }
        } catch (e) {
          console.warn("Clean matching email docs notice:", e);
        }
      }

      // 3. Delete candidate resume file from Amazon S3 Bucket / Cloudinary storage
      if (candidate.resumeUrl) {
        console.log(`[Resume Dump] Deleting S3/Cloudinary resume file for ${candidate.name || candidate.email}...`);
        await deleteFileFromS3ByUrl(candidate.resumeUrl).catch((err) => console.warn("S3 delete notice:", err));
      }

      // 4. Log audit event
      const creatorInfo = {
        uid: user?.uid || '',
        name: userProfile?.name || user?.email || 'Recruiter',
        email: user?.email || '',
        role: userProfile?.role || 'recruiter',
        designation: userProfile?.designation || 'Recruiter'
      };
      logTeamActivity(
        teamId,
        'candidate_deleted',
        `Deleted candidate "${candidate.name || candidate.email}" and removed resume file from S3`,
        creatorInfo
      );
    } catch (error) {
      console.error('Failed to delete resume dump candidate:', error);
      messageBox.showError('Failed to delete candidate.');
    } finally {
      setDeletingCandidateId(null);
    }
  };

  const confirmDeleteCandidate = (candidate: ResumeDumpCandidate) => {
    messageBox.showConfirm(
      `Delete ${candidate.name || candidate.email} from Resume Dump? This permanently deletes the stored candidate record and deletes their resume file from S3 storage.`,
      () => deleteCandidate(candidate),
      'Delete candidate'
    );
  };

  const toggleHiredStatus = async (candidate: ResumeDumpCandidate) => {
    const newStatus = !(candidate.isHired || candidate.doNotSuggest);
    try {
      await updateDoc(doc(db, 'resumeDumpCandidates', candidate.id), {
        isHired: newStatus,
        doNotSuggest: newStatus,
        updatedAt: serverTimestamp(),
      });
      const creatorInfo = {
        uid: user?.uid || '',
        name: userProfile?.name || user?.email || 'Recruiter',
        email: user?.email || '',
        role: userProfile?.role || 'recruiter',
        designation: userProfile?.designation || 'Recruiter'
      };
      logTeamActivity(
        teamId,
        'candidate_status_changed',
        `Marked candidate "${candidate.name || candidate.email}" as ${newStatus ? 'Hired / Excluded from suggestions' : 'Available for suggestions'}`,
        creatorInfo
      );
    } catch (error) {
      console.error('Failed to update candidate status:', error);
      messageBox.showError('Failed to update candidate status.');
    }
  };

  const actionButtonClass = 'geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40';

  if (loading) {
    return <ResumeDumpSkeleton />;
  }

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] bg-[#000] text-white">

      <section className="border-b border-white/[0.11] bg-[#000]">
        <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-7 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="geist-label uppercase text-[#6b7280]">Recruiter Library</p>
            <h1 className="geist-page-title mt-2 text-white">Resume Dump</h1>
            <p className="geist-small mt-1 max-w-2xl text-[#8f8f8f]">
              Upload resumes once, extract candidate details, and keep Cloudinary links ready for upcoming interview creation. Mark candidates as Hired to exclude them from automated suggestions.
            </p>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div className="relative w-full sm:w-[220px] lg:w-[260px]">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#8f8f8f]" strokeWidth={1.8} />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="geist-caption h-9 w-full rounded-[6px] border border-white/[0.11] bg-[#050505] pl-9 pr-3 text-white outline-none placeholder:text-[#6b7280] focus:border-white/[0.24]"
              />
            </div>
            <div className="flex shrink-0 items-center gap-1.5 rounded-[6px] border border-white/[0.16] bg-white/[0.04] p-0.5">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/#/upload-resume`);
                  setCopiedUploadPortalLink(true);
                  setTimeout(() => setCopiedUploadPortalLink(false), 2500);
                }}
                className="geist-caption inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[4px] px-2.5 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.08] hover:text-white"
                title="Copy public candidate upload link to clipboard"
              >
                {copiedUploadPortalLink ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} strokeWidth={1.8} />}
                <span>{copiedUploadPortalLink ? 'Link Copied!' : 'Copy Upload Link'}</span>
              </button>

              <div className="h-4 w-[1px] bg-white/[0.16]" />

              <a
                href={`${window.location.origin}/#/upload-resume`}
                target="_blank"
                rel="noopener noreferrer"
                className="geist-caption inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[4px] px-2.5 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.08] hover:text-white"
                title="Open public candidate upload page in a new tab"
              >
                <ExternalLink size={14} strokeWidth={1.8} />
                <span>Open Link</span>
              </a>
            </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedUploadFiles([]);
                  setUploadModalExtraInfo('');
                  setIsUploadModalOpen(true);
                }}
                className="geist-caption inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] border border-white bg-white px-3.5 font-semibold text-black transition-colors hover:bg-[#eaeaea]"
              >
                <UploadCloud size={14} strokeWidth={1.8} />
                Upload resumes
              </button>
            </div>
          </div>
        </section>

      {/* Interactive Naukri-Style Filter Bar */}
      <section className="border-b border-gray-200 dark:border-white/[0.11] bg-slate-50 dark:bg-[#050505] px-4 py-3 sm:px-6 lg:px-7 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            {/* Select Job Role (Ranks candidates by Highest Match Score) */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Briefcase size={14} className="text-gray-500 dark:text-[#8f8f8f] shrink-0" />
              <select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                className="geist-caption h-8 rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] px-2.5 text-xs text-slate-800 dark:text-white outline-none focus:border-black dark:focus:border-white/30 cursor-pointer max-w-[200px]"
              >
                <option value="all">Select Job Role ({jobs.length} Jobs)</option>
                {jobs.map(j => (
                  <option key={j.id} value={j.id}>
                    {j.title || j.jobRole || 'Job'} {j.accessCode ? `(${j.accessCode})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-gray-200/70 dark:bg-[#111] border border-gray-300 dark:border-white/[0.11] rounded-[6px] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2 py-1 rounded-[4px] font-medium transition-colors ${statusFilter === 'all' ? 'bg-white dark:bg-white text-black font-semibold shadow-xs' : 'text-gray-600 dark:text-[#8f8f8f] hover:text-black dark:hover:text-white'}`}
              >
                All Status
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('available')}
                className={`px-2 py-1 rounded-[4px] font-medium transition-colors ${statusFilter === 'available' ? 'bg-white dark:bg-white text-black font-semibold shadow-xs' : 'text-gray-600 dark:text-[#8f8f8f] hover:text-black dark:hover:text-white'}`}
              >
                Available
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('hired')}
                className={`px-2 py-1 rounded-[4px] font-medium transition-colors ${statusFilter === 'hired' ? 'bg-emerald-600 dark:bg-emerald-500 text-white font-semibold shadow-xs' : 'text-gray-600 dark:text-[#8f8f8f] hover:text-black dark:hover:text-white'}`}
              >
                Hired
              </button>
            </div>

            {/* Skill Rec Box Filter (Multi-Select Checkmarks) */}
            <div className="flex items-center gap-1 shrink-0 relative">
              <Filter size={13} className="text-gray-500 dark:text-[#8f8f8f] shrink-0" />
              <button
                type="button"
                onClick={() => setIsSkillRecBoxOpen(prev => !prev)}
                className="geist-caption h-8 inline-flex items-center justify-between gap-1.5 rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] px-2.5 text-xs text-slate-800 dark:text-white outline-none focus:border-black dark:focus:border-white/30 cursor-pointer min-w-[140px] max-w-[180px] font-normal shadow-2xs"
                title="Click to select multiple skills with checkmarks"
              >
                <span className="truncate">
                  {selectedSkills.length > 0
                    ? `Skills (${selectedSkills.length})`
                    : `All Skills (${uniqueSkillsList.length})`}
                </span>
                <ChevronDown size={12} className="text-gray-500 dark:text-[#8f8f8f] shrink-0 ml-1" />
              </button>

              {/* Floating Recommended Skills Box (Rec Box) */}
              {isSkillRecBoxOpen && (
                <div
                  className="absolute left-0 top-full mt-1.5 z-[9999] w-72 rounded-lg border border-gray-200 dark:border-white/15 bg-white dark:bg-[#0c0c0d] p-3 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in duration-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-gray-200 dark:border-white/10">
                    <div className="relative flex-1">
                      <Search size={12} className="absolute left-2.5 top-2.5 text-gray-400" />
                      <input
                        type="text"
                        value={skillRecSearch}
                        onChange={(e) => setSkillRecSearch(e.target.value)}
                        placeholder="Search skills..."
                        className="w-full h-7 pl-7 pr-2 rounded bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-xs text-slate-900 dark:text-white outline-none focus:border-black dark:focus:border-white/30"
                      />
                    </div>
                    {selectedSkills.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedSkills([])}
                        className="text-[10px] text-red-500 hover:underline font-semibold shrink-0"
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  <p className="geist-label text-[10px] uppercase text-gray-500 dark:text-gray-400 mb-1.5 font-bold tracking-wider">
                    Recommended Domain Skills:
                  </p>

                  <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1">
                    {Array.from(new Set([
                      "AutoCAD", "Civil Engineering", "Site Management", "Estimating", "Structural Design",
                      "Billing & Estimation", "RCC Design", "Revit", "Quantity Surveying", "Project Management",
                      "React", "Node.js", "Python", "TypeScript", "JavaScript", "SQL", "PostgreSQL",
                      "Financial Analysis", "Accounting", "Tally", "GST Compliance", "Auditing",
                      "Sales & Marketing", "Business Development", "Digital Marketing", "SEO", "Lead Generation",
                      "Quality Assurance", "AWS", "Docker", "Machine Learning", "Data Analysis", "Excel",
                      ...uniqueSkillsList
                    ]))
                      .filter(s => s.toLowerCase().includes(skillRecSearch.toLowerCase()))
                      .map(skill => {
                        const isChecked = selectedSkills.includes(skill);
                        return (
                          <label
                            key={skill}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSkills(prev =>
                                isChecked ? prev.filter(s => s !== skill) : [...prev, skill]
                              );
                            }}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer text-xs transition-colors ${
                              isChecked
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold'
                                : 'hover:bg-gray-100 dark:hover:bg-white/5 text-slate-700 dark:text-gray-200'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                isChecked
                                  ? 'bg-emerald-500 border-emerald-500 text-white'
                                  : 'border-gray-300 dark:border-white/20 bg-white dark:bg-transparent'
                              }`}>
                                {isChecked && <Check size={11} strokeWidth={3} />}
                              </div>
                              <span>{skill}</span>
                            </div>
                          </label>
                        );
                      })}
                  </div>

                  <div className="mt-2 pt-2 border-t border-gray-200 dark:border-white/10 flex items-center justify-between text-[11px]">
                    <span className="text-gray-500 dark:text-gray-400 font-medium">{selectedSkills.length} selected</span>
                    <button
                      type="button"
                      onClick={() => setIsSkillRecBoxOpen(false)}
                      className="px-3 py-1 rounded bg-black dark:bg-white text-white dark:text-black font-bold text-xs hover:opacity-90 cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Job Title / Industry Filter Dropdown */}
            <select
              value={titleFilter}
              onChange={(e) => setTitleFilter(e.target.value)}
              className="geist-caption h-8 rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] px-2.5 text-xs text-slate-800 dark:text-white outline-none focus:border-black dark:focus:border-white/30 cursor-pointer max-w-[180px]"
            >
              <option value="all">All Roles / Industry ({uniqueTitlesList.length})</option>
              {uniqueTitlesList.map(title => (
                <option key={title} value={title}>{title}</option>
              ))}
            </select>

            {/* Target Domain, Industry Sectors & Departments Checkmark Filter Button */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsDomainRecBoxOpen(true)}
                className={`geist-caption h-8 rounded-[6px] border px-3 text-xs outline-none transition-colors flex items-center gap-2 cursor-pointer ${
                  selectedDomains.length > 0 || domainFilter !== 'all'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold'
                    : 'border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] text-slate-800 dark:text-white hover:border-gray-400 dark:hover:border-white/30'
                }`}
              >
                <Briefcase size={13} className={selectedDomains.length > 0 || domainFilter !== 'all' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-[#8f8f8f]'} />
                <span>
                  {selectedDomains.length > 0
                    ? `${selectedDomains.length} Sector/Dept Selected`
                    : domainFilter !== 'all'
                    ? `Domain: ${domainFilter}`
                    : 'All Domains & Sectors (Checkmarks)'}
                </span>
                {selectedDomains.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-emerald-500 text-white dark:text-black text-[10px] font-black flex items-center justify-center">
                    {selectedDomains.length}
                  </span>
                )}
                <ChevronDown size={12} className="text-gray-500 dark:text-[#8f8f8f]" />
              </button>
            </div>

                {isDomainRecBoxOpen && createPortal(
                  <div 
                    className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setIsDomainRecBoxOpen(false)}
                  >
                    <div 
                      className="bg-white dark:bg-[#0f0f0f] border border-gray-200 dark:border-white/10 text-slate-900 dark:text-white rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Header */}
                      <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-white/10 flex items-center justify-between gap-4 bg-slate-50 dark:bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-500 shrink-0">
                            <Briefcase className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-base sm:text-lg font-extrabold flex items-center gap-2 text-slate-900 dark:text-white">
                              <span>Filter Sectors & Departments</span>
                              {selectedDomains.length > 0 && (
                                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                                  {selectedDomains.length} Active
                                </span>
                              )}
                            </h3>
                            <p className="text-xs text-slate-600 dark:text-slate-400">
                              Checkmark options to filter candidate resumes live by industry sectors and functional departments.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsDomainRecBoxOpen(false)}
                          className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-700 dark:text-slate-300 transition-colors cursor-pointer shrink-0"
                        >
                          <XCircle className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Search & Actions Bar */}
                      <div className="p-3.5 sm:p-4 border-b border-gray-200 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-[#121212]">
                        <div className="relative w-full sm:w-80">
                          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                          <input
                            type="text"
                            value={domainRecSearch}
                            onChange={(e) => setDomainRecSearch(e.target.value)}
                            placeholder="Search sector or department..."
                            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                          />
                          {domainRecSearch && (
                            <button
                              type="button"
                              onClick={() => setDomainRecSearch('')}
                              className="absolute right-2.5 top-2 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                            >
                              Clear
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                          {selectedDomains.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setSelectedDomains([])}
                              className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 font-bold text-xs border border-red-200 dark:border-red-500/20 transition-all cursor-pointer"
                            >
                              Clear All Checkmarks ({selectedDomains.length})
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Scrollable Checkmarks Grid Container */}
                      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50/50 dark:bg-transparent">
                        {/* 1. Industry Sectors Grid */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2">
                            <label className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                              Industry Sectors ({ALL_JOB_SECTORS.length})
                            </label>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                            {ALL_JOB_SECTORS.filter(s => s.toLowerCase().includes(domainRecSearch.toLowerCase())).map((sectorName) => {
                              const isChecked = selectedDomains.some(d => d.toLowerCase() === sectorName.toLowerCase());
                              return (
                                <button
                                  key={sectorName}
                                  type="button"
                                  onClick={() => {
                                    setSelectedDomains(prev =>
                                      isChecked
                                        ? prev.filter(d => d.toLowerCase() !== sectorName.toLowerCase())
                                        : [...prev, sectorName]
                                    );
                                  }}
                                  className={`flex items-center justify-between p-2.5 sm:p-3 rounded-xl border text-xs transition-all text-left cursor-pointer shadow-2xs ${
                                    isChecked
                                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20 ring-2 ring-emerald-500/30 font-bold'
                                      : 'bg-white dark:bg-[#181818] border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-300 hover:border-emerald-500/40 hover:bg-emerald-50/40 dark:hover:bg-white/5 font-semibold'
                                  }`}
                                >
                                  <span className="break-words font-semibold text-[11px] sm:text-xs min-w-0 flex-1 pr-1">{sectorName}</span>
                                  <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-all ${
                                    isChecked
                                      ? 'bg-white text-emerald-600 border-white shadow-xs'
                                      : 'border-slate-300 dark:border-white/20 bg-slate-50 dark:bg-white/5'
                                  }`}>
                                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* 2. Functional Departments Grid */}
                        <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-white/10">
                          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2">
                            <label className="text-xs font-extrabold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                              Functional Departments ({ALL_JOB_DEPARTMENTS.length})
                            </label>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                            {ALL_JOB_DEPARTMENTS.filter(d => d.toLowerCase().includes(domainRecSearch.toLowerCase())).map((deptName) => {
                              const isChecked = selectedDomains.some(d => d.toLowerCase() === deptName.toLowerCase());
                              return (
                                <button
                                  key={deptName}
                                  type="button"
                                  onClick={() => {
                                    setSelectedDomains(prev =>
                                      isChecked
                                        ? prev.filter(d => d.toLowerCase() !== deptName.toLowerCase())
                                        : [...prev, deptName]
                                    );
                                  }}
                                  className={`flex items-center justify-between p-2.5 sm:p-3 rounded-xl border text-xs transition-all text-left cursor-pointer shadow-2xs ${
                                    isChecked
                                      ? 'bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-600/20 ring-2 ring-teal-500/30 font-bold'
                                      : 'bg-white dark:bg-[#181818] border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-300 hover:border-teal-500/40 hover:bg-teal-50/40 dark:hover:bg-white/5 font-semibold'
                                  }`}
                                >
                                  <span className="break-words font-semibold text-[11px] sm:text-xs min-w-0 flex-1 pr-1">{deptName}</span>
                                  <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-all ${
                                    isChecked
                                      ? 'bg-white text-teal-600 border-white shadow-xs'
                                      : 'border-slate-300 dark:border-white/20 bg-slate-50 dark:bg-white/5'
                                  }`}>
                                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        {/* 3. Active Candidate Database Domains */}
                        {allAvailableDomains.length > 0 && (
                          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-white/10">
                            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2">
                              <label className="text-xs font-extrabold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                                Active Database Candidate Domains ({allAvailableDomains.length})
                              </label>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                              {allAvailableDomains.filter(d => d.toLowerCase().includes(domainRecSearch.toLowerCase())).map((domName) => {
                                const isChecked = selectedDomains.some(d => d.toLowerCase() === domName.toLowerCase()) || domainFilter.toLowerCase() === domName.toLowerCase();
                                return (
                                  <button
                                    key={domName}
                                    type="button"
                                    onClick={() => {
                                      if (domainFilter !== 'all') setDomainFilter('all');
                                      setSelectedDomains(prev =>
                                        isChecked
                                          ? prev.filter(d => d.toLowerCase() !== domName.toLowerCase())
                                          : [...prev, domName]
                                      );
                                    }}
                                    className={`flex items-center justify-between p-2.5 sm:p-3 rounded-xl border text-xs transition-all text-left cursor-pointer shadow-2xs ${
                                      isChecked
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20 ring-2 ring-blue-500/30 font-bold'
                                        : 'bg-white dark:bg-[#181818] border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-300 hover:border-blue-500/40 hover:bg-blue-50/40 dark:hover:bg-white/5 font-semibold'
                                    }`}
                                  >
                                    <span className="break-words font-semibold text-[11px] sm:text-xs min-w-0 flex-1 pr-1">{domName}</span>
                                    <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-all ${
                                      isChecked
                                        ? 'bg-white text-blue-600 border-white shadow-xs'
                                        : 'border-slate-300 dark:border-white/20 bg-slate-50 dark:bg-white/5'
                                    }`}>
                                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Modal Footer */}
                      <div className="p-4 border-t border-gray-200 dark:border-white/10 flex items-center justify-between gap-3 bg-slate-50 dark:bg-white/[0.02]">
                        <span className="text-xs text-slate-600 dark:text-slate-400 font-semibold">
                          {selectedDomains.length} Checkmark Filters Active
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIsDomainRecBoxOpen(false)}
                            className="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                          >
                            <Check className="w-4 h-4 stroke-[3]" />
                            <span>Apply & Show Resumes</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>,
                  document.body
                )}

            {/* Experience Range Filter */}
            <div className="flex items-center gap-1 shrink-0">
              <Award size={13} className="text-gray-500 dark:text-[#8f8f8f] shrink-0" />
              <select
                value={expFilter}
                onChange={(e) => setExpFilter(e.target.value)}
                className="geist-caption h-8 rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] px-2.5 text-xs text-slate-800 dark:text-white outline-none focus:border-black dark:focus:border-white/30 cursor-pointer max-w-[170px]"
              >
                <option value="all">All Experience</option>
                <option value="0-1">0 - 1 Yrs (Freshers)</option>
                <option value="1-3">1 - 3 Yrs (Junior)</option>
                <option value="3-5">3 - 5 Yrs (Mid-Level)</option>
                <option value="5-10">5 - 10 Yrs (Senior)</option>
                <option value="10+">10+ Yrs (Lead / Exec)</option>
              </select>
            </div>

            {/* Location / City Filter Dropdown */}
            <div className="flex items-center gap-1 shrink-0">
              <MapPin size={13} className="text-gray-500 dark:text-[#8f8f8f] shrink-0" />
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="geist-caption h-8 rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] px-2.5 text-xs text-slate-800 dark:text-white outline-none focus:border-black dark:focus:border-white/30 cursor-pointer max-w-[160px]"
              >
                <option value="all">All Locations ({uniqueLocationsList.length})</option>
                {uniqueLocationsList.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>

            {/* Toggle More Naukri Filters */}
            <button
              type="button"
              onClick={() => setShowMoreFilters(prev => !prev)}
              className="geist-caption inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-gray-300 dark:border-white/[0.14] bg-white text-gray-900 dark:bg-white dark:text-black hover:bg-gray-100 dark:hover:bg-gray-200 px-2.5 text-xs font-normal transition-all shrink-0 cursor-pointer shadow-sm"
            >
              <SlidersHorizontal size={13} className="text-gray-700 dark:text-black" />
              <span>{showMoreFilters ? 'Less Filters' : 'More Filters'}</span>
              {activeFiltersCount > 0 && (
                <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-gray-900 dark:bg-black dark:text-white text-[10px] font-medium">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {selectedCandidateIds.length > 0 && (
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(true)}
                className="geist-caption inline-flex h-8 items-center gap-1.5 rounded-[6px] bg-black dark:bg-white text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200 px-3 font-semibold text-xs transition-colors shrink-0 shadow-sm"
              >
                <Send size={13} strokeWidth={2} />
                <span>Send Invite ({selectedCandidateIds.length})</span>
              </button>
            )}

            <span className="text-xs text-slate-500 dark:text-[#8f8f8f] font-medium">
              {isSearchOrFilterActive ? (
                <>Showing all <strong className="text-slate-900 dark:text-white">{filteredCandidates.length}</strong> matching candidates</>
              ) : (
                <>Showing <strong className="text-slate-900 dark:text-white">{paginatedCandidates.length}</strong> of {filteredCandidates.length} candidates {totalPages > 1 ? `(Page ${currentPage} of ${totalPages})` : ''}</>
              )}
            </span>

            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="geist-caption inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 font-semibold underline"
              >
                <RotateCcw size={12} />
                <span>Reset All</span>
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Secondary / Advanced Naukri Recruiter Filters */}
        {showMoreFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200 dark:border-white/[0.08] animate-in fade-in duration-150">
            {/* Match Score Filter */}
            <div className="flex items-center gap-1 shrink-0">
              <Sparkles size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
              <select
                value={matchScoreFilter}
                onChange={(e) => setMatchScoreFilter(e.target.value)}
                className="geist-caption h-8 rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] px-2.5 text-xs text-slate-800 dark:text-white outline-none focus:border-black dark:focus:border-white/30 cursor-pointer max-w-[170px]"
              >
                <option value="all">Match Score: All</option>
                <option value="75+">🔥 High Match (75%+)</option>
                <option value="50+">⚡ Good Match (50%+)</option>
                <option value="30+">Fair Match (30%+)</option>
              </select>
            </div>

            {/* 1. Education Qualification Filter Selector */}
            <div className="flex items-center gap-1 shrink-0">
              <GraduationCap size={13} className="text-gray-500 dark:text-[#8f8f8f] shrink-0" />
              <select
                value={educationQualFilter}
                onChange={(e) => {
                  setEducationQualFilter(e.target.value);
                  setEducationSpecFilter('all');
                }}
                className="geist-caption h-8 rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] px-2.5 text-xs text-slate-800 dark:text-white outline-none focus:border-black dark:focus:border-white/30 cursor-pointer max-w-[160px]"
              >
                <option value="all">All Qualifications</option>
                {EDUCATION_QUALIFICATIONS.map(qual => (
                  <option key={qual} value={qual}>{qual}</option>
                ))}
              </select>
            </div>

            {/* 2. Education Specialization Filter Selector (Dependent on chosen Qualification) */}
            <div className="flex items-center gap-1 shrink-0">
              <select
                value={educationSpecFilter}
                onChange={(e) => setEducationSpecFilter(e.target.value)}
                disabled={educationQualFilter === 'all'}
                className={`geist-caption h-8 rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] px-2.5 text-xs text-slate-800 dark:text-white outline-none focus:border-black dark:focus:border-white/30 cursor-pointer max-w-[210px] ${
                  educationQualFilter === 'all'
                    ? 'opacity-60 cursor-not-allowed bg-gray-100 dark:bg-white/[0.03]'
                    : ''
                }`}
              >
                <option value="all">
                  {educationQualFilter !== 'all'
                    ? `All ${educationQualFilter} Specializations`
                    : 'All Specializations (Pick Qual first)'}
                </option>
                {(educationQualFilter !== 'all' && EDUCATION_SPECIALIZATIONS[educationQualFilter as EducationQualification]
                  ? EDUCATION_SPECIALIZATIONS[educationQualFilter as EducationQualification]
                  : []
                ).map(spec => (
                  <option key={spec} value={spec}>{spec}</option>
                ))}
              </select>
            </div>

            {/* Candidate Source Filter */}
            <div className="flex items-center gap-1 shrink-0">
              <FileText size={13} className="text-gray-500 dark:text-[#8f8f8f] shrink-0" />
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="geist-caption h-8 rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] px-2.5 text-xs text-slate-800 dark:text-white outline-none focus:border-black dark:focus:border-white/30 cursor-pointer max-w-[160px]"
              >
                <option value="all">Source: All</option>
                <option value="upload">Direct Upload</option>
                <option value="interview">Interview Creation</option>
                <option value="manual">Manual Entry</option>
              </select>
            </div>

            {/* Freshness / Added Date Filter */}
            <div className="flex items-center gap-1 shrink-0">
              <Clock size={13} className="text-gray-500 dark:text-[#8f8f8f] shrink-0" />
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="geist-caption h-8 rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] px-2.5 text-xs text-slate-800 dark:text-white outline-none focus:border-black dark:focus:border-white/30 cursor-pointer max-w-[160px]"
              >
                <option value="all">Added: Any time</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
              </select>
            </div>
          </div>
        )}
      </section>


      {uploading && (
        <section className="border-b border-white/[0.11] bg-white/[0.02] px-4 py-4 sm:px-6 lg:px-7">
          <label
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex cursor-pointer items-center gap-3 rounded-[6px] border border-dashed px-4 py-3 transition-colors ${
              isDraggingResume ? 'border-white bg-white/[0.06]' : 'border-white/[0.16] bg-white/[0.02] hover:bg-white/[0.04]'
            }`}
          >
            <UploadCloud size={18} strokeWidth={1.8} />
            <span className="min-w-0">
              <span className="geist-caption block font-medium text-white">
                {uploading ? 'Processing resumes' : isDraggingResume ? 'Drop resumes to upload' : 'Drop resumes here or click to upload'}
              </span>
            </span>
          </label>
        </section>
      )}

      {(uploadResults.length > 0) && (
        <section className="border-b border-gray-200 dark:border-white/[0.11] bg-emerald-500/10 dark:bg-emerald-950/20 px-4 py-3 sm:px-6 lg:px-7 animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-2">
            <span className="geist-caption text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 size={14} />
              Recent Resume Upload Results:
            </span>
            <button
              type="button"
              onClick={() => setUploadResults([])}
              className="text-xs text-gray-600 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white flex items-center gap-1 px-2.5 py-0.5 rounded border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 transition-colors font-medium"
              title="Dismiss notification"
            >
              <span>Dismiss</span>
              <span className="font-bold text-sm leading-none">&times;</span>
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {uploadResults.slice(-6).map((result) => (
              <div key={`${result.fileName}-${result.message}`} className="flex min-w-0 items-start gap-2 rounded-[6px] border border-gray-200 dark:border-white/[0.11] bg-white dark:bg-white/[0.03] p-2.5 shadow-sm">
                {result.status === 'saved' ? (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-[#83d0a3]" strokeWidth={1.8} />
                ) : (
                  <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-500 dark:text-[#ff8f8f]" strokeWidth={1.8} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="geist-caption truncate font-medium text-slate-800 dark:text-white">{result.fileName}</p>
                  <p className="geist-small mt-0.5 truncate text-gray-500 dark:text-[#8f8f8f]">{result.message}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="flex min-h-[360px] flex-col">
        {filteredCandidates.length === 0 && !uploading ? (
          <label
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex min-h-[420px] cursor-pointer flex-col items-center justify-center border-b border-dashed px-4 py-14 text-center transition-colors sm:px-6 lg:px-7 ${
              isDraggingResume
                ? 'border-white bg-white/[0.06]'
                : 'border-white/[0.11] bg-transparent hover:bg-white/[0.025]'
            }`}
          >
            <div className={`flex h-14 w-14 items-center justify-center rounded-[8px] border transition-colors ${
              isDraggingResume
                ? 'border-white bg-white text-black'
                : 'border-white/[0.16] bg-white/[0.03] text-[#8f8f8f]'
            }`}>
              <UploadCloud size={24} strokeWidth={1.7} />
            </div>
            <h2 className="geist-section-title mt-4 text-white">
              {isDraggingResume ? 'Drop resumes here' : 'Drag and drop resumes here'}
            </h2>
            <p className="geist-caption mt-2 max-w-md text-[#8f8f8f]">
              Drop PDF, DOCX, or TXT resumes anywhere in this box. Missing email, phone, or skills will not block saving.
            </p>
          </label>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/[0.11] text-left">
              <thead className="bg-[#080808]">
                <tr>
                  <th className="w-8 px-2 py-2 text-center border-b border-gray-200 dark:border-white/[0.08] bg-gray-50/70 dark:bg-white/[0.02]">
                    <input
                      type="checkbox"
                      checked={paginatedCandidates.length > 0 && paginatedCandidates.every(c => selectedCandidateIds.includes(c.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const allIds = Array.from(new Set([...selectedCandidateIds, ...paginatedCandidates.map(c => c.id)]));
                          setSelectedCandidateIds(allIds);
                        } else {
                          const pageIds = new Set(paginatedCandidates.map(c => c.id));
                          setSelectedCandidateIds(selectedCandidateIds.filter(id => !pageIds.has(id)));
                        }
                      }}
                      className="rounded border-gray-300 dark:border-white/20 bg-white dark:bg-[#111] text-black dark:text-white focus:ring-0 cursor-pointer h-3.5 w-3.5 accent-black dark:accent-white"
                      title="Select all candidates on this page"
                    />
                  </th>
                  <th className="geist-label whitespace-nowrap px-3 py-2 text-left uppercase text-[10px] tracking-wider font-semibold text-gray-500 dark:text-[#8f8f8f] border-b border-gray-200 dark:border-white/[0.08] bg-gray-50/70 dark:bg-white/[0.02]">Candidate</th>
                  {selectedJobId !== 'all' && (
                    <th className="geist-label whitespace-nowrap px-3 py-2 text-left uppercase text-[10px] tracking-wider font-semibold text-gray-500 dark:text-[#8f8f8f] border-b border-gray-200 dark:border-white/[0.08] bg-gray-50/70 dark:bg-white/[0.02]">Match Score</th>
                  )}
                  <th className="geist-label whitespace-nowrap px-3 py-2 text-left uppercase text-[10px] tracking-wider font-semibold text-gray-500 dark:text-[#8f8f8f] border-b border-gray-200 dark:border-white/[0.08] bg-gray-50/70 dark:bg-white/[0.02]">Phone & Email</th>
                  <th className="geist-label whitespace-nowrap px-3 py-2 text-left uppercase text-[10px] tracking-wider font-semibold text-gray-500 dark:text-[#8f8f8f] border-b border-gray-200 dark:border-white/[0.08] bg-gray-50/70 dark:bg-white/[0.02]">Experience</th>
                  <th className="geist-label whitespace-nowrap px-3 py-2 text-left uppercase text-[10px] tracking-wider font-semibold text-gray-500 dark:text-[#8f8f8f] border-b border-gray-200 dark:border-white/[0.08] bg-gray-50/70 dark:bg-white/[0.02]">Education</th>
                  <th className="geist-label whitespace-nowrap px-3 py-2 text-left uppercase text-[10px] tracking-wider font-semibold text-gray-500 dark:text-[#8f8f8f] border-b border-gray-200 dark:border-white/[0.08] bg-gray-50/70 dark:bg-white/[0.02]">Skills</th>

                  <th className="geist-label whitespace-nowrap px-3 py-2 text-left uppercase text-[10px] tracking-wider font-semibold text-gray-500 dark:text-[#8f8f8f] border-b border-gray-200 dark:border-white/[0.08] bg-gray-50/70 dark:bg-white/[0.02]">Status</th>
                  <th className="geist-label whitespace-nowrap px-3 py-2 text-left uppercase text-[10px] tracking-wider font-semibold text-gray-500 dark:text-[#8f8f8f] border-b border-gray-200 dark:border-white/[0.08] bg-gray-50/70 dark:bg-white/[0.02]">Uploaded</th>
                  <th className="geist-label whitespace-nowrap px-3 py-2 text-right uppercase text-[10px] tracking-wider font-semibold text-gray-500 dark:text-[#8f8f8f] border-b border-gray-200 dark:border-white/[0.08] bg-gray-50/70 dark:bg-white/[0.02] w-[175px] min-w-[175px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-white/[0.08]">
                {paginatedCandidates.map((candidate) => (
                  <tr
                    key={candidate.id}
                    onClick={() => setSkillsPanelCandidate(candidate)}
                    className={`cursor-pointer transition-colors ${
                      selectedCandidateIds.includes(candidate.id)
                        ? 'bg-blue-50/60 dark:bg-white/[0.07] hover:bg-blue-50/80 dark:hover:bg-white/[0.09]'
                        : candidate.isHired || candidate.doNotSuggest
                        ? 'bg-emerald-500/5 dark:bg-emerald-950/10 hover:bg-emerald-500/10 dark:hover:bg-emerald-950/20'
                        : 'hover:bg-gray-50 dark:hover:bg-white/[0.04]'
                    }`}
                    title="Click row to view full candidate details"
                  >
                    <td className="w-8 px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedCandidateIds.includes(candidate.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCandidateIds([...selectedCandidateIds, candidate.id]);
                          } else {
                            setSelectedCandidateIds(selectedCandidateIds.filter(id => id !== candidate.id));
                          }
                        }}
                        className="rounded border-gray-300 dark:border-white/20 bg-white dark:bg-[#111] text-black dark:text-white focus:ring-0 cursor-pointer h-3.5 w-3.5 accent-black dark:accent-white"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="geist-caption max-w-[280px] truncate text-xs font-bold text-slate-900 dark:text-white" title={candidate.name}>
                          {candidate.name || 'Unknown Candidate'}
                        </div>
                      </div>
                      <div className="geist-small mt-0.5 max-w-[280px] truncate text-[11px] text-gray-600 dark:text-[#9ca3af]" title={candidate.currentTitle}>
                        {candidate.currentTitle || 'Candidate Profile'}
                      </div>
                      {candidate.location && (
                        <div className="geist-small mt-0.5 text-[10px] text-gray-500 dark:text-[#6b7280]">📍 {candidate.location}</div>
                      )}
                    </td>

                    {selectedJobId !== 'all' && (
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <span className={`geist-caption inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                          (candidate.matchScore || 0) >= 70
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                            : (candidate.matchScore || 0) >= 40
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                            : 'bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-[#a1a1aa] border border-gray-200 dark:border-white/[0.1]'
                        }`}>
                          {candidate.matchScore ?? 0}%
                        </span>
                      </td>
                    )}

                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <div className="geist-caption text-[11px] font-mono font-medium text-slate-800 dark:text-[#d4d4d4]">{candidate.phone || 'N/A'}</div>
                      <div className="geist-small text-[10px] text-gray-500 dark:text-[#8f8f8f] truncate max-w-[140px]">{candidate.email || 'No email'}</div>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <div className="geist-caption text-[11px] font-semibold text-slate-800 dark:text-[#d4d4d4]">
                        {candidate.totalExperienceYears !== undefined && candidate.totalExperienceYears !== null && !isNaN(Number(candidate.totalExperienceYears))
                          ? `${candidate.totalExperienceYears} Yrs`
                          : 'Not Specified'}
                      </div>
                    </td>

                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <div className="geist-caption text-[11px] font-semibold text-slate-800 dark:text-[#d4d4d4] truncate max-w-[150px]" title={candidate.education && candidate.education.length > 0 ? candidate.education[0].degree : 'Not Specified'}>
                        {candidate.education && candidate.education.length > 0 && candidate.education[0].degree
                          ? candidate.education[0].degree.replace(/\s*\([^)]*\)/g, '')
                          : 'Not Specified'}
                      </div>
                    </td>

                    <td className="px-3 py-1.5">
                      <div className="flex flex-wrap gap-1 max-w-[240px]">
                        {candidate.skills.slice(0, 3).map((skill, idx) => (
                          <span key={idx} className="geist-small rounded border border-gray-200 dark:border-white/[0.1] bg-gray-100 dark:bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:text-[#d4d4d4]">
                            {skill}
                          </span>
                        ))}
                        {candidate.skills.length > 3 && (
                          <span key="more" className="geist-small rounded border border-gray-200 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.02] px-1.5 py-0.5 text-[10px] text-gray-500 dark:text-[#8f8f8f]">
                            +{candidate.skills.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {candidate.isHired || candidate.doNotSuggest ? (
                        <span className="geist-small inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                          Hired 🎉
                        </span>
                      ) : (
                        <span className="geist-small inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-white/[0.11] bg-gray-100 dark:bg-white/[0.03] px-2 py-0.5 text-[10px] text-gray-600 dark:text-[#a1a1aa] whitespace-nowrap">
                          Available
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <div className="geist-label whitespace-nowrap text-[10px] text-gray-600 dark:text-[#9ca3af]">{formatDate(candidate.updatedAt || candidate.createdAt)}</div>
                      <div className="geist-small mt-0.5 max-w-[140px] truncate text-[10px] text-gray-400 dark:text-[#6b7280]" title={candidate.resumeFileName}>
                        {candidate.resumeFileName}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right w-[175px] min-w-[175px]" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col gap-1 w-[165px] ml-auto">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCandidateIds([candidate.id]);
                              setIsInviteModalOpen(true);
                            }}
                            className="geist-caption flex-1 inline-flex h-6 items-center justify-center gap-1 rounded-[5px] border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] px-1.5 text-[10px] font-medium text-slate-800 dark:text-[#d4d4d4] transition-all hover:bg-gray-100 dark:hover:bg-white/[0.08] hover:text-black dark:hover:text-white shadow-2xs cursor-pointer"
                            title="Send interview invitation"
                          >
                            <Send size={10} strokeWidth={1.8} className="shrink-0 text-slate-500 dark:text-[#8f8f8f]" />
                            <span>Invite</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleHiredStatus(candidate); }}
                            className={`geist-caption flex-1 inline-flex h-6 items-center justify-center gap-1 rounded-[5px] border px-1.5 text-[10px] font-medium transition-all shadow-2xs cursor-pointer ${
                              candidate.isHired || candidate.doNotSuggest
                                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25'
                                : 'border-gray-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-slate-800 dark:text-[#d4d4d4] hover:bg-gray-100 dark:hover:bg-white/[0.08] hover:text-black dark:hover:text-white'
                            }`}
                            title={candidate.isHired || candidate.doNotSuggest ? 'Unmark Hired' : 'Mark candidate as Hired'}
                          >
                            <UserCheck size={10} className="text-emerald-600 dark:text-emerald-400 shrink-0" strokeWidth={1.8} />
                            <span className="truncate">{candidate.isHired || candidate.doNotSuggest ? 'Hired 🎉' : 'Mark Hired'}</span>
                          </button>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewResumeCandidate(candidate);
                            }}
                            className="geist-caption flex-1 inline-flex h-6 items-center justify-center gap-1 rounded-[5px] border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] px-1.5 text-[10px] font-medium text-slate-800 dark:text-[#d4d4d4] transition-all hover:bg-gray-100 dark:hover:bg-white/[0.08] hover:text-black dark:hover:text-white shadow-2xs cursor-pointer"
                            title="View original resume"
                          >
                            <ExternalLink size={10} strokeWidth={1.8} className="shrink-0 text-blue-600 dark:text-blue-400" />
                            <span>Resume</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditCandidateModal(candidate);
                            }}
                            className="geist-caption flex-1 inline-flex h-6 items-center justify-center gap-1 rounded-[5px] border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] px-1.5 text-[10px] font-medium text-slate-800 dark:text-[#d4d4d4] transition-all hover:bg-gray-100 dark:hover:bg-white/[0.08] hover:text-black dark:hover:text-white shadow-2xs cursor-pointer"
                            title="Edit candidate"
                          >
                            <Edit3 size={10} strokeWidth={1.8} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); confirmDeleteCandidate(candidate); }}
                            disabled={deletingCandidateId === candidate.id}
                            className="geist-caption inline-flex h-6 w-6 items-center justify-center rounded-[5px] border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-slate-500 dark:text-[#8f8f8f] shrink-0 transition-all hover:border-red-300 dark:hover:border-red-500/40 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-600 dark:hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                            title="Delete candidate"
                          >
                            <Trash2 size={10} strokeWidth={1.8} />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls Bar */}
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.11] bg-[#050505] px-4 py-3 sm:px-6">
                <span className="text-xs text-[#8f8f8f]">
                  Showing Page <strong className="text-white">{currentPage}</strong> of <strong className="text-white">{totalPages}</strong> ({filteredCandidates.length} matching candidates)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage <= 1}
                    className="geist-caption h-8 rounded-[6px] border border-white/[0.11] bg-[#111] px-3 font-medium text-white transition-colors hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`geist-caption h-8 w-8 rounded-[6px] font-semibold text-xs transition-colors ${
                          currentPage === pageNum
                            ? 'bg-white text-black font-bold'
                            : 'border border-white/[0.11] bg-[#111] text-[#8f8f8f] hover:text-white'
                        }`}
                      >
                        {pageNum}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage >= totalPages}
                    className="geist-caption h-8 rounded-[6px] border border-white/[0.11] bg-[#111] px-3 font-medium text-white transition-colors hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Candidate Details Modal */}
      {skillsPanelCandidate &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onClick={() => setSkillsPanelCandidate(null)}>
            <div
              className="w-full max-w-2xl overflow-hidden rounded-[12px] border border-gray-200 dark:border-white/[0.13] bg-white dark:bg-[#090909] text-slate-900 dark:text-white shadow-2xl animate-in fade-in zoom-in duration-150"
              onClick={(event) => event.stopPropagation()}
            >
              {/* Modal Top Header with Responsive Non-Overflowing Action Buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200 dark:border-white/[0.11] px-5 py-4 bg-gray-50 dark:bg-[#0d0d0d]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="geist-label uppercase tracking-wider text-gray-500 dark:text-[#6b7280]">Candidate Profile</p>
                    {skillsPanelCandidate.isHired || skillsPanelCandidate.doNotSuggest ? (
                      <span className="geist-small rounded-full border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        🎉 Hired
                      </span>
                    ) : (
                      <span className="geist-small rounded-full border border-gray-200 dark:border-white/[0.11] bg-gray-100 dark:bg-white/[0.04] px-2 py-0.5 text-xs text-gray-700 dark:text-[#a1a1aa]">
                        Available
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold mt-0.5 text-slate-900 dark:text-white truncate">
                    {skillsPanelCandidate.name || 'Unknown Candidate'}
                  </h3>
                  <p className="text-xs text-blue-600 dark:text-[#8bbde8] mt-0.5 truncate">
                    {skillsPanelCandidate.email || 'Email not available'} {skillsPanelCandidate.phone ? `· ${skillsPanelCandidate.phone}` : ''}
                  </p>
                </div>
                
                {/* Top Action Buttons - Wrapped and Constrained so they NEVER overflow */}
                <div className="flex flex-wrap items-center gap-1.5 shrink-0 max-w-full">
                  <button
                    type="button"
                    onClick={async () => {
                      await toggleHiredStatus(skillsPanelCandidate);
                      setSkillsPanelCandidate(prev => prev ? ({ ...prev, isHired: !prev.isHired, doNotSuggest: !prev.isHired }) : null);
                    }}
                    className={`geist-caption inline-flex h-7 items-center gap-1 rounded-[6px] border px-2.5 font-semibold text-xs transition-all cursor-pointer ${
                      skillsPanelCandidate.isHired || skillsPanelCandidate.doNotSuggest
                        ? 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/30'
                        : 'border-emerald-600/40 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/25'
                    }`}
                    title={skillsPanelCandidate.isHired || skillsPanelCandidate.doNotSuggest ? 'Click to unmark as Hired' : 'Mark candidate as Hired'}
                  >
                    <UserCheck size={12} className="text-emerald-600 dark:text-emerald-400 shrink-0" strokeWidth={2} />
                    <span>{skillsPanelCandidate.isHired || skillsPanelCandidate.doNotSuggest ? 'Hired 🎉' : 'Mark Hired'}</span>
                  </button>

                  {skillsPanelCandidate.resumeUrl && (
                    <button
                      type="button"
                      onClick={() => setPreviewResumeCandidate(skillsPanelCandidate)}
                      className="geist-caption inline-flex h-7 items-center gap-1 rounded-[6px] border border-blue-500/40 bg-blue-50 dark:bg-blue-600/20 px-2.5 font-semibold text-xs text-blue-700 dark:text-blue-300 transition-colors hover:bg-blue-100 dark:hover:bg-blue-600/30 cursor-pointer"
                      title="View resume in popup modal"
                    >
                      <ExternalLink size={12} strokeWidth={1.8} className="shrink-0" />
                      <span>Resume</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleOpenEditCandidateModal(skillsPanelCandidate)}
                    className="geist-caption inline-flex h-7 items-center gap-1 rounded-[6px] border border-gray-300 dark:border-white/[0.15] bg-gray-100 dark:bg-white/[0.04] px-2.5 font-semibold text-xs text-slate-800 dark:text-[#d4d4d4] transition-colors hover:bg-gray-200 dark:hover:bg-white/[0.08] hover:text-black dark:hover:text-white cursor-pointer"
                    title="Edit candidate details"
                  >
                    <Edit3 size={12} className="text-indigo-600 dark:text-indigo-400 shrink-0" strokeWidth={1.8} />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSkillsPanelCandidate(null)}
                    className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-gray-200 dark:border-white/[0.11] bg-gray-100 dark:bg-white/[0.03] text-gray-500 dark:text-[#8f8f8f] transition-colors hover:bg-gray-200 dark:hover:bg-white/[0.06] hover:text-black dark:hover:text-white text-lg leading-none cursor-pointer"
                    title="Close details popup"
                  >
                    &times;
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5 geist-small">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-[8px] border border-gray-200 dark:border-white/[0.11] bg-gray-50/70 dark:bg-white/[0.025] p-3 min-w-0 overflow-hidden">
                    <p className="geist-label uppercase text-gray-500 dark:text-[#6b7280]">Name & Contact</p>
                    <p className="geist-caption mt-1 font-semibold text-slate-900 dark:text-white truncate">{skillsPanelCandidate.name || 'N/A'}</p>
                    <p className="geist-small text-blue-600 dark:text-[#8bbde8] mt-0.5 truncate" title={skillsPanelCandidate.email}>{skillsPanelCandidate.email || 'N/A'}</p>
                    <p className="geist-small text-slate-700 dark:text-[#d4d4d4] mt-0.5 truncate">{skillsPanelCandidate.phone || 'N/A'}</p>
                  </div>
                  <div className="rounded-[8px] border border-gray-200 dark:border-white/[0.11] bg-gray-50/70 dark:bg-white/[0.025] p-3 min-w-0 overflow-hidden">
                    <p className="geist-label uppercase text-gray-500 dark:text-[#6b7280]">Experience</p>
                    <p className="geist-caption mt-1 font-semibold text-emerald-700 dark:text-[#83d0a3] truncate">
                      {skillsPanelCandidate.totalExperienceYears !== undefined && skillsPanelCandidate.totalExperienceYears !== null && !isNaN(Number(skillsPanelCandidate.totalExperienceYears))
                        ? `${skillsPanelCandidate.totalExperienceYears} Years`
                        : 'N/A'}
                    </p>
                  </div>
                  <div className="rounded-[8px] border border-gray-200 dark:border-white/[0.11] bg-gray-50/70 dark:bg-white/[0.025] p-3 min-w-0 overflow-hidden">
                    <p className="geist-label uppercase text-gray-500 dark:text-[#6b7280]">Current Role</p>
                    <p className="geist-caption mt-1 font-semibold text-slate-800 dark:text-[#d4d4d4] truncate" title={skillsPanelCandidate.currentTitle}>{skillsPanelCandidate.currentTitle || 'Not specified'}</p>
                  </div>
                  <div className="rounded-[8px] border border-gray-200 dark:border-white/[0.11] bg-gray-50/70 dark:bg-white/[0.025] p-3 min-w-0 overflow-hidden">
                    <p className="geist-label uppercase text-gray-500 dark:text-[#6b7280]">Location & Source</p>
                    <p className="geist-caption mt-1 text-slate-800 dark:text-[#d4d4d4] truncate" title={skillsPanelCandidate.location}>{skillsPanelCandidate.location || 'Not specified'}</p>
                    <p className="geist-small text-gray-500 dark:text-[#6b7280] mt-0.5 truncate" title={skillsPanelCandidate.resumeFileName}>{skillsPanelCandidate.resumeFileName}</p>
                  </div>
                </div>

                {(skillsPanelCandidate.currentSalary || skillsPanelCandidate.expectedSalary || skillsPanelCandidate.noticePeriod || skillsPanelCandidate.noticePeriodDays || skillsPanelCandidate.employmentStatus) && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs p-3 rounded-[8px] bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-[#6b7280] block">Status</span>
                      <span className="font-semibold text-slate-800 dark:text-[#d4d4d4]">{skillsPanelCandidate.employmentStatus || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-[#6b7280] block">Notice Period</span>
                      <span className="font-semibold text-slate-800 dark:text-[#d4d4d4]">{skillsPanelCandidate.noticePeriod || (skillsPanelCandidate.noticePeriodDays ? `${skillsPanelCandidate.noticePeriodDays} Days` : 'N/A')}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-[#6b7280] block">Gender & Marital</span>
                      <span className="font-semibold text-slate-800 dark:text-[#d4d4d4]">
                        {(skillsPanelCandidate as any).gender || 'Not specified'}
                        {skillsPanelCandidate.maritalStatus ? ` · ${skillsPanelCandidate.maritalStatus}` : ''}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-[#6b7280] block">Salary (Cur / Exp)</span>
                      <span className="font-semibold text-slate-800 dark:text-[#d4d4d4]">
                        {skillsPanelCandidate.currentSalary || 'N/A'} / {skillsPanelCandidate.expectedSalary || 'N/A'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Target Industry Sectors & Functional Departments */}
                <div className="p-3.5 rounded-[12px] bg-slate-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.08] space-y-2.5">
                  <div className="flex items-center gap-2 border-b border-gray-200 dark:border-white/10 pb-1.5">
                    <Briefcase className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-white">
                      Target Industry Sectors & Functional Departments
                    </span>
                  </div>

                  {(() => {
                    const { sectors: modalSecs, departments: modalDepts } = resolveCandidateSectorsAndDepartments(skillsPanelCandidate);
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        {/* Industry Sectors */}
                        <div>
                          <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block mb-1">
                            Industry Sectors {modalSecs.length > 0 ? `(${modalSecs.length})` : ''}
                          </span>
                          {modalSecs.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {modalSecs.map(sec => (
                                <span key={sec} className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
                                  {sec}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-[11px]">Not specified</span>
                          )}
                        </div>

                        {/* Functional Departments / Domain */}
                        <div>
                          <span className="text-[10px] uppercase font-bold text-teal-600 dark:text-teal-400 block mb-1">
                            Functional Departments / Domain {modalDepts.length > 0 ? `(${modalDepts.length})` : ''}
                          </span>
                          {modalDepts.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {modalDepts.map(dept => (
                                <span key={dept} className="px-2.5 py-0.5 rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30 text-[11px] font-bold">
                                  {dept}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-[11px]">Not specified</span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {skillsPanelCandidate.summary && (
                  <div className="min-w-0">
                    <p className="geist-label uppercase text-gray-500 dark:text-[#6b7280]">Professional Summary</p>
                    <p className="geist-caption mt-2 leading-relaxed text-slate-800 dark:text-[#d4d4d4] bg-gray-50 dark:bg-white/[0.02] p-3 rounded-[6px] border border-gray-200 dark:border-white/[0.06] break-words whitespace-pre-wrap">{skillsPanelCandidate.summary}</p>
                  </div>
                )}

                <div className="min-w-0">
                  <p className="geist-label uppercase text-gray-500 dark:text-[#6b7280]">Skills & Tech Stack ({(skillsPanelCandidate.skills || []).length})</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(skillsPanelCandidate.skills || []).length > 0 ? skillsPanelCandidate.skills.map((skill) => (
                      <span key={skill} className="geist-caption rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-gray-100 dark:bg-white/[0.04] px-2.5 py-1 font-medium text-slate-800 dark:text-[#d4d4d4] break-all">
                        {skill}
                      </span>
                    )) : <span className="geist-caption text-gray-500 dark:text-[#6b7280]">No explicit skills extracted.</span>}
                  </div>
                </div>

                {(skillsPanelCandidate.education || []).length > 0 && (
                  <div className="min-w-0">
                    <p className="geist-label uppercase text-gray-500 dark:text-[#6b7280]">Education</p>
                    <div className="mt-2 space-y-1.5">
                      {skillsPanelCandidate.education!.map((entry, index) => (
                        <p key={`${entry.degree}-${index}`} className="geist-caption text-slate-800 dark:text-[#d4d4d4] break-words">{[entry.degree, entry.institution, entry.year].filter(Boolean).join(' · ')}</p>
                      ))}
                    </div>
                  </div>
                )}

                {skillsPanelCandidate.resumeUrl && (
                  <div className="pt-2 border-t border-gray-200 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-2 min-w-0">
                    <p className="geist-small text-gray-500 dark:text-[#6b7280] truncate max-w-[280px]">
                      File: <span className="text-slate-800 dark:text-[#a1a1aa] truncate">{skillsPanelCandidate.resumeFileName}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => setPreviewResumeCandidate(skillsPanelCandidate)}
                      className="geist-caption inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                    >
                      <ExternalLink size={13} />
                      View Full Resume Document in Popup
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Embedded Resume Viewer Modal Popup (Same Page) */}
      {previewResumeCandidate &&
        createPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-3 sm:p-6 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => setPreviewResumeCandidate(null)}
          >
            <div
              className="flex flex-col w-full max-w-5xl h-[88vh] bg-[#111111] border border-white/20 rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
              onClick={(event) => event.stopPropagation()}
            >
              {/* Top Bar Header */}
              <div className="flex items-center justify-between px-5 py-3.5 bg-gray-100 dark:bg-[#181818] border-b border-gray-200 dark:border-white/10 text-slate-900 dark:text-white shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="text-blue-600 dark:text-blue-400 size-5 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                      {previewResumeCandidate.name ? `${previewResumeCandidate.name}'s Resume` : previewResumeCandidate.resumeFileName}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {previewResumeCandidate.resumeFileName}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={previewResumeCandidate.resumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 transition-colors"
                    title="Download / Open in New Tab"
                  >
                    <ExternalLink size={13} />
                    <span className="hidden sm:inline">Download / New Tab</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setPreviewResumeCandidate(null)}
                    className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 flex items-center justify-center text-slate-700 dark:text-gray-300 hover:text-black dark:hover:text-white transition-colors"
                    title="Close Preview"
                  >
                    <span className="text-xl leading-none">&times;</span>
                  </button>
                </div>
              </div>

              {/* Embedded Document Viewer */}
              <div className="flex-1 w-full h-full bg-[#0a0a0a] relative flex items-center justify-center overflow-hidden">
                {previewResumeCandidate.resumeUrl ? (
                  <iframe
                    src={
                      previewResumeCandidate.resumeUrl.endsWith('.docx') || (previewResumeCandidate.resumeFileName && previewResumeCandidate.resumeFileName.endsWith('.docx'))
                        ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(previewResumeCandidate.resumeUrl)}`
                        : previewResumeCandidate.resumeUrl
                    }
                    className="w-full h-full border-0"
                    title="Candidate Resume Preview"
                  />
                ) : (
                  <div className="p-8 text-center text-gray-400">
                    <p className="text-sm font-medium">Resume file URL not available.</p>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Send Interview Invitations Modal Popup */}
      {isInviteModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md" onClick={() => !isSendingInvites && setIsInviteModalOpen(false)}>
            <div
              className="w-full max-w-lg overflow-hidden rounded-[14px] border border-gray-200 dark:border-white/[0.15] bg-white dark:bg-[#090909] text-slate-900 dark:text-white shadow-2xl animate-in fade-in zoom-in duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 py-4 bg-gray-50 dark:bg-[#0d0d0d] border-b border-gray-200 dark:border-white/[0.11]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-[6px] bg-gray-100 dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.11] text-slate-900 dark:text-white">
                    <Send size={16} strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">Send Interview Invitations</h3>
                    <p className="geist-small text-gray-500 dark:text-[#8f8f8f]">
                      Inviting {selectedCandidateIds.length || filteredCandidates.length} Candidate(s)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isSendingInvites}
                  onClick={() => setIsInviteModalOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-gray-200 dark:border-white/[0.11] bg-gray-100 dark:bg-white/[0.03] text-gray-500 dark:text-[#8f8f8f] transition-colors hover:bg-gray-200 dark:hover:bg-white/[0.06] hover:text-black dark:hover:text-white disabled:opacity-40"
                >
                  <span className="text-xl leading-none">&times;</span>
                </button>
              </div>

              {/* Modal Content Body */}
              <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                {/* Highest Education Qualification Input */}
                <div>
                  <label className="block geist-label uppercase text-gray-600 dark:text-[#6b7280] mb-1.5 font-medium">
                    Highest Education Qualification
                  </label>
                  <EducationInput
                    value={inviteModalEducation}
                    onChange={setInviteModalEducation}
                    placeholder="Type or select education (e.g. B.Tech Civil, Diploma, B.Com)..."
                  />
                </div>

                {/* 1. Job Role Selection */}
                <div>
                  <label className="block geist-label uppercase text-gray-600 dark:text-[#6b7280] mb-1.5 font-medium">
                    Select Target Job Role / Interview
                  </label>
                  <select
                    value={selectedJobId}
                    onChange={(e) => setSelectedJobId(e.target.value)}
                    className="geist-caption w-full h-9 rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111111] px-3 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:border-slate-900 dark:focus:border-white/30 cursor-pointer"
                  >
                    <option value="all" disabled className="bg-white dark:bg-[#111] text-slate-900 dark:text-white">-- Choose a Job Role to Invite Candidates --</option>
                    {jobs.map(j => (
                      <option key={j.id} value={j.id} className="bg-white dark:bg-[#111] text-slate-900 dark:text-white">
                        {j.title || j.jobRole || 'Untitled Job'} {j.accessCode ? `(Code: ${j.accessCode})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Invite Delivery Method Selector */}
                <div>
                  <label className="block geist-label uppercase text-gray-600 dark:text-[#6b7280] mb-1.5 font-medium flex items-center justify-between">
                    <span>Invite Delivery Method</span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase">API + Web Options</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setInviteDeliveryMode('both')}
                      className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                        inviteDeliveryMode === 'both'
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-bold shadow-sm'
                          : 'bg-white dark:bg-white/[0.03] border-gray-200 dark:border-white/[0.1] text-slate-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-1 text-xs font-bold mb-0.5">
                        <Sparkles size={12} className="text-emerald-500 shrink-0" />
                        <span>Both</span>
                      </div>
                      <p className="text-[10px] opacity-75 leading-tight">Email + WA API</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInviteDeliveryMode('whatsapp_api')}
                      className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                        inviteDeliveryMode === 'whatsapp_api'
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-bold shadow-sm'
                          : 'bg-white dark:bg-white/[0.03] border-gray-200 dark:border-white/[0.1] text-slate-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-1 text-xs font-bold mb-0.5">
                        <MessageSquare size={12} className="text-emerald-500 shrink-0" />
                        <span>WhatsApp API</span>
                      </div>
                      <p className="text-[10px] opacity-75 leading-tight">Automated API</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInviteDeliveryMode('email')}
                      className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                        inviteDeliveryMode === 'email'
                          ? 'bg-blue-500/10 border-blue-500 text-blue-700 dark:text-blue-300 font-bold shadow-sm'
                          : 'bg-white dark:bg-white/[0.03] border-gray-200 dark:border-white/[0.1] text-slate-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-1 text-xs font-bold mb-0.5">
                        <Mail size={12} className="text-blue-500 shrink-0" />
                        <span>Email Only</span>
                      </div>
                      <p className="text-[10px] opacity-75 leading-tight">SES / Resend</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInviteDeliveryMode('whatsapp_web')}
                      className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                        inviteDeliveryMode === 'whatsapp_web'
                          ? 'bg-amber-500/10 border-amber-500 text-amber-700 dark:text-amber-300 font-bold shadow-sm'
                          : 'bg-white dark:bg-white/[0.03] border-gray-200 dark:border-white/[0.1] text-slate-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-1 text-xs font-bold mb-0.5">
                        <ExternalLink size={12} className="text-amber-500 shrink-0" />
                        <span>WhatsApp Web</span>
                      </div>
                      <p className="text-[10px] opacity-75 leading-tight">Open Web App</p>
                    </button>
                  </div>
                </div>

                {/* 3. Candidate Selection Summary */}
                <div>
                  <label className="block geist-label uppercase text-gray-600 dark:text-[#6b7280] mb-1.5 font-medium">
                    Selected Candidates ({selectedCandidateIds.length > 0 ? selectedCandidateIds.length : filteredCandidates.length})
                  </label>
                  <div className="max-h-28 overflow-y-auto rounded-[6px] border border-gray-200 dark:border-white/[0.11] bg-gray-50/50 dark:bg-white/[0.025] p-2.5 space-y-1.5">
                    {(selectedCandidateIds.length > 0
                      ? candidates.filter(c => selectedCandidateIds.includes(c.id))
                      : filteredCandidates
                    ).map(cand => (
                      <div key={cand.id} className="flex items-center justify-between geist-caption px-2 py-1 rounded bg-white dark:bg-white/[0.03] border border-gray-200/60 dark:border-transparent">
                        <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[220px]">{cand.name || 'Candidate'}</span>
                        <span className="text-blue-600 dark:text-[#8bbde8] truncate max-w-[200px]">{cand.email || cand.phone || 'No Contact'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live Progress Banner */}
                {isSendingInvites && (
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 text-xs text-emerald-800 dark:text-emerald-200 font-semibold flex items-center gap-2.5 animate-pulse">
                    <RotateCcw className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />
                    <span>{sendingProgressMsg}</span>
                  </div>
                )}

                {/* 4. Generated Invite Details */}
                {activeSelectedJob ? (
                  <div className="p-3.5 rounded-[8px] border border-gray-200 dark:border-white/[0.11] bg-gray-50/50 dark:bg-white/[0.025] space-y-2.5">
                    <div className="flex items-center justify-between geist-caption">
                      <span className="text-gray-500 dark:text-[#8f8f8f]">Job Title:</span>
                      <span className="font-bold text-slate-900 dark:text-white">{activeSelectedJob.title || activeSelectedJob.jobRole}</span>
                    </div>
                    {activeSelectedJob.accessCode && (
                      <div className="flex items-center justify-between geist-caption">
                        <span className="text-gray-500 dark:text-[#8f8f8f]">Access Code:</span>
                        <span className="font-mono bg-gray-100 dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.11] px-2 py-0.5 rounded text-slate-900 dark:text-white font-bold">{activeSelectedJob.accessCode}</span>
                      </div>
                    )}
                    <div className="geist-caption">
                      <span className="text-gray-500 dark:text-[#8f8f8f] block mb-1">Interview Link:</span>
                      <div className="flex items-center gap-2 bg-gray-100 dark:bg-[#050505] border border-gray-200 dark:border-white/[0.11] p-2 rounded-[6px] text-slate-900 dark:text-[#d4d4d4] font-mono text-[11px] break-all">
                        <span className="flex-1 truncate">
                          {`${window.location.origin}/#/interview/${activeSelectedJob.id}${activeSelectedJob.accessCode ? `?code=${activeSelectedJob.accessCode}` : ''}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/#/interview/${activeSelectedJob.id}${activeSelectedJob.accessCode ? `?code=${activeSelectedJob.accessCode}` : ''}`);
                            setCopiedInviteLink(true);
                            setTimeout(() => setCopiedInviteLink(false), 2500);
                          }}
                          className="px-2.5 py-1 rounded bg-slate-900 dark:bg-white text-white dark:text-black hover:bg-slate-800 dark:hover:bg-neutral-200 font-sans text-xs font-semibold shrink-0 transition-colors"
                        >
                          {copiedInviteLink ? 'Copied! ✅' : 'Copy Link'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-[6px] border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs text-center font-medium">
                    ⚠️ Please select a Job Role above to generate the specific interview link & access code.
                  </div>
                )}
              </div>

              {/* Modal Footer Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-gray-50 dark:bg-[#0d0d0d] border-t border-gray-200 dark:border-white/[0.11]">
                <button
                  type="button"
                  disabled={isSendingInvites}
                  onClick={() => setIsInviteModalOpen(false)}
                  className="geist-caption h-9 px-4 rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-white/[0.03] hover:bg-gray-100 dark:hover:bg-white/[0.06] font-semibold text-xs text-slate-700 dark:text-[#d4d4d4] transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>

                <div className="flex items-center gap-2 flex-wrap">
                  {activeSelectedJob && (
                    <button
                      type="button"
                      disabled={isSendingInvites}
                      onClick={() => {
                        const jobTitle = activeSelectedJob.title || activeSelectedJob.jobRole || 'AI Interview';
                        const accessCode = activeSelectedJob.accessCode || '';
                        const interviewLink = `${window.location.origin}/#/interview/${activeSelectedJob.id}${accessCode ? `?code=${accessCode}` : ''}`;
                        const messageText = `Hello! You have been invited for an AI Interview for the position of *${jobTitle}*.\n\n` +
                          `📌 Access Code: *${accessCode || 'N/A'}*\n` +
                          `🔗 Interview Link: ${interviewLink}\n\n` +
                          `Please open the link to start your interview!`;
                        window.open(`https://wa.me/?text=${encodeURIComponent(messageText)}`, '_blank');
                      }}
                      className="geist-caption inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] border border-amber-600/40 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 font-semibold text-xs px-3 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors disabled:opacity-50 cursor-pointer"
                      title="Open pre-filled invitation in WhatsApp Web app"
                    >
                      <ExternalLink size={13} />
                      WhatsApp Web
                    </button>
                  )}

                  {activeSelectedJob && (
                    <button
                      type="button"
                      disabled={isSendingInvites}
                      onClick={async () => {
                        const targetCandidates = selectedCandidateIds.length > 0
                          ? candidates.filter(c => selectedCandidateIds.includes(c.id))
                          : filteredCandidates;
                        const candidatesWithPhones = targetCandidates
                          .map(c => ({
                            phone: (c.phone || (c as any).mobile || (c as any).whatsapp || (c as any).profile?.phone || '').trim(),
                            name: c.name || c.email?.split('@')[0] || 'Candidate',
                            email: c.email
                          }))
                          .filter(c => !!c.phone);

                        if (candidatesWithPhones.length === 0) {
                          messageBox.showError("No candidate phone numbers found for WhatsApp API invitation.");
                          return;
                        }

                        const jobTitle = activeSelectedJob.title || activeSelectedJob.jobRole || 'AI Interview';
                        const accessCode = activeSelectedJob.accessCode || '';
                        const interviewLink = `${window.location.origin}/#/interview/${activeSelectedJob.id}${accessCode ? `?code=${accessCode}` : ''}`;

                        const waOptions = {
                          recruiterName: userProfile?.name || (user as any)?.displayName || (user as any)?.email || 'Recruiting Team',
                          recruiterPhone: (userProfile as any)?.phone || (userProfile as any)?.phoneNumber || '',
                          deadline: activeSelectedJob.deadline || activeSelectedJob.interviewDeadline || '',
                          whatsappSessionId: (userProfile as any)?.whatsappSessionId || localStorage.getItem('wa_session_id') || '',
                          whatsappSessionPasscode: (userProfile as any)?.whatsappSessionPasscode || localStorage.getItem('wa_session_passcode') || ''
                        };

                        setIsSendingInvites(true);
                        setSendingProgressMsg(`Sending WhatsApp API invites to ${candidatesWithPhones.length} candidate(s)...`);
                        try {
                          const waResult = await sendBulkWhatsAppInvites(
                            candidatesWithPhones,
                            jobTitle,
                            interviewLink,
                            accessCode,
                            false,
                            (sentCount, totalCount, currentCand, isWait) => {
                              if (isWait) {
                                setSendingProgressMsg(`⏳ Sent WhatsApp to ${currentCand} (${sentCount}/${totalCount}). Delaying 15s anti-spam...`);
                              } else {
                                setSendingProgressMsg(`📱 Sending WhatsApp API invite ${sentCount}/${totalCount} to ${currentCand}...`);
                              }
                            },
                            waOptions
                          );

                          if (waResult.totalSent > 0) {
                            messageBox.showSuccess(`✅ WhatsApp API invitations sent to ${waResult.totalSent} candidate(s)!`);
                            setIsInviteModalOpen(false);
                            setSelectedCandidateIds([]);
                          } else {
                            const errReason = waResult.errors.length > 0 ? waResult.errors[0] : 'WhatsApp API session is disconnected or offline.';
                            messageBox.showError(`WhatsApp API Dispatch Failed (${errReason}). Opening WhatsApp Web fallback...`);
                            
                            // Fallback to WhatsApp Web
                            const firstPhone = candidatesWithPhones[0]?.phone || '';
                            const msgText = `Hello! You have been invited for an AI Interview for the position of *${jobTitle}*.\n\n` +
                              `📌 Access Code: *${accessCode || 'N/A'}*\n` +
                              `🔗 Interview Link: ${interviewLink}\n\n` +
                              `Please open the link to start your interview!`;
                            window.open(`https://web.whatsapp.com/send?phone=${firstPhone.replace(/[^0-9]/g, '')}&text=${encodeURIComponent(msgText)}`, '_blank');
                          }
                        } catch (err: any) {
                          messageBox.showError(err?.message || "Failed to send WhatsApp API invites.");
                        } finally {
                          setIsSendingInvites(false);
                          setSendingProgressMsg('');
                        }
                      }}
                      className="geist-caption inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] border border-emerald-600/40 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold text-xs px-3 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors disabled:opacity-50 cursor-pointer"
                      title="Send automated WhatsApp invitations via REST API"
                    >
                      <MessageSquare size={13} />
                      WhatsApp API
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={!activeSelectedJob || isSendingInvites}
                    onClick={async () => {
                      const targetCandidates = selectedCandidateIds.length > 0
                        ? candidates.filter(c => selectedCandidateIds.includes(c.id))
                        : filteredCandidates;

                      if (targetCandidates.length === 0) {
                        messageBox.showError("No candidates selected to invite.");
                        return;
                      }

                      setIsSendingInvites(true);
                      setSendingProgressMsg("Sending invitations via Both Email & WhatsApp API...");

                      try {
                        if (inviteModalEducation.trim()) {
                          await Promise.all(targetCandidates.map(async (cand) => {
                            const selectedDegree = inviteModalEducation.trim();
                            const existingEdu = cand.education || [];
                            const updatedEdu = [
                              { degree: selectedDegree, institution: 'Verified Qualification', year: '' },
                              ...existingEdu.filter(e => e.degree.toLowerCase() !== selectedDegree.toLowerCase())
                            ];
                            try {
                              await updateDoc(doc(db, 'resumeDumpCandidates', cand.id), {
                                education: updatedEdu,
                                updatedAt: serverTimestamp(),
                              });
                            } catch (err) {
                              console.error('Failed to update candidate education on invite:', err);
                            }
                          }));
                        }

                        const jobTitle = activeSelectedJob.title || activeSelectedJob.jobRole || 'AI Interview';
                        const accessCode = activeSelectedJob.accessCode || '';
                        const interviewLink = `${window.location.origin}/#/interview/${activeSelectedJob.id}${accessCode ? `?code=${accessCode}` : ''}`;

                        let waSentCount = 0;
                        let emailSentCount = 0;
                        let waErrorMsg = '';

                        if (inviteDeliveryMode === 'whatsapp_web') {
                          const messageText = `Hello! You have been invited for an AI Interview for the position of *${jobTitle}*.\n\n` +
                            `📌 Access Code: *${accessCode || 'N/A'}*\n` +
                            `🔗 Interview Link: ${interviewLink}\n\n` +
                            `Please open the link to start your interview!`;
                          window.open(`https://wa.me/?text=${encodeURIComponent(messageText)}`, '_blank');
                          messageBox.showSuccess('WhatsApp Web app opened with pre-filled message!');
                          setIsInviteModalOpen(false);
                          setSelectedCandidateIds([]);
                          return;
                        }

                        if (inviteDeliveryMode === 'whatsapp_api' || inviteDeliveryMode === 'both') {
                          const candidatesWithPhones = targetCandidates
                            .map(c => ({
                              phone: (c.phone || (c as any).mobile || (c as any).whatsapp || (c as any).profile?.phone || '').trim(),
                              name: c.name || c.email?.split('@')[0] || 'Candidate',
                              email: c.email
                            }))
                            .filter(c => !!c.phone);

                          if (candidatesWithPhones.length > 0) {
                            setSendingProgressMsg(`Sending WhatsApp API invites to ${candidatesWithPhones.length} candidate(s)...`);
                            const waRes = await sendBulkWhatsAppInvites(
                              candidatesWithPhones,
                              jobTitle,
                              interviewLink,
                              accessCode,
                              false,
                              (sentCount, totalCount, currentCand, isWait) => {
                                if (isWait) {
                                  setSendingProgressMsg(`⏳ Sent WhatsApp to ${currentCand} (${sentCount}/${totalCount}). Delaying 15s anti-spam...`);
                                } else {
                                  setSendingProgressMsg(`📱 Sending WhatsApp API invite ${sentCount}/${totalCount} to ${currentCand}...`);
                                }
                              },
                              {
                                recruiterName: userProfile?.name || (user as any)?.displayName || (user as any)?.email || 'Recruiting Team',
                                recruiterPhone: (userProfile as any)?.phone || (userProfile as any)?.phoneNumber || '',
                                whatsappSessionId: (userProfile as any)?.whatsappSessionId || localStorage.getItem('wa_session_id') || '',
                                whatsappSessionPasscode: (userProfile as any)?.whatsappSessionPasscode || localStorage.getItem('wa_session_passcode') || ''
                              }
                            );
                            waSentCount = waRes.totalSent;
                            if (waRes.totalSent === 0 && waRes.errors.length > 0) {
                              waErrorMsg = waRes.errors[0];
                            }
                          }
                        }

                        if (inviteDeliveryMode === 'email' || inviteDeliveryMode === 'both') {
                          const candidatePayload = targetCandidates
                            .filter(c => !!c.email && c.email.includes('@') && !c.email.endsWith('@whatsapp.local'));

                          if (candidatePayload.length > 0) {
                            setSendingProgressMsg(`Sending Email invites to ${candidatePayload.length} candidate(s)...`);
                            const emailRes = await sendInterviewInvitations(
                              candidatePayload,
                              jobTitle,
                              interviewLink,
                              accessCode,
                              false,
                              {
                                deadline: activeSelectedJob.deadline || activeSelectedJob.interviewDeadline || '',
                                recruiterName: userProfile?.name || (user as any)?.displayName || 'Recruiter'
                              }
                            );
                            if (emailRes.success) {
                              emailSentCount = emailRes.totalEmails;
                            }
                          }
                        }

                        const sentParts: string[] = [];
                        if (waSentCount > 0) sentParts.push(`${waSentCount} via WhatsApp API`);
                        if (emailSentCount > 0) sentParts.push(`${emailSentCount} via Email`);

                        if (sentParts.length > 0) {
                          messageBox.showSuccess(`✅ Invitations sent successfully: ${sentParts.join(' & ')}!`);
                        } else if (waErrorMsg) {
                          messageBox.showError(`WhatsApp API sending issue: ${waErrorMsg}. Use WhatsApp Web button to dispatch manually.`);
                        } else {
                          messageBox.showSuccess(`✅ Interview invitations generated & copied for ${targetCandidates.length} candidate(s)!`);
                        }

                        setIsInviteModalOpen(false);
                        setSelectedCandidateIds([]);
                      } catch (err: any) {
                        console.error('Failed to send invites:', err);
                        messageBox.showError(err?.message || 'Failed to send invitations.');
                      } finally {
                        setIsSendingInvites(false);
                        setSendingProgressMsg('');
                      }
                    }}
                    className="geist-caption inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] bg-slate-900 dark:bg-white text-white dark:text-black hover:bg-slate-800 dark:hover:bg-neutral-200 font-semibold text-xs px-4 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    {isSendingInvites ? (
                      <>
                        <RotateCcw size={13} className="animate-spin" />
                        <span>Sending Invites...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={13} />
                        <span>Send Invites ({inviteDeliveryMode === 'both' ? 'Both (Email + WA API)' : inviteDeliveryMode === 'whatsapp_api' ? 'WhatsApp API' : inviteDeliveryMode === 'whatsapp_web' ? 'WhatsApp Web' : 'Email Only'})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Upload Resumes Modal with Extra Info */}
      {isUploadModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md" onClick={() => !uploading && setIsUploadModalOpen(false)}>
            <div
              className="w-full max-w-xl overflow-hidden rounded-[14px] border border-gray-200 dark:border-white/[0.15] bg-white dark:bg-[#0c0c0d] text-slate-900 dark:text-white shadow-2xl animate-in fade-in zoom-in duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/[0.11] bg-gray-50 dark:bg-[#111113] px-5 py-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <UploadCloud size={18} className="text-slate-900 dark:text-white" />
                    Upload Candidate Resumes
                  </h3>
                  <p className="geist-small mt-0.5 text-gray-500 dark:text-[#8f8f8f]">
                    Select or drop resume files and optionally attach extra details to parse together.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !uploading && setIsUploadModalOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-gray-200 dark:border-white/[0.11] bg-gray-100 dark:bg-white/[0.03] text-gray-500 dark:text-[#8f8f8f] transition-colors hover:bg-gray-200 dark:hover:bg-white/[0.08] hover:text-black dark:hover:text-white text-xl leading-none"
                >
                  &times;
                </button>
              </div>

              <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
                {/* File Selection Dropzone */}
                <div>
                  <label className="geist-label block uppercase text-gray-600 dark:text-[#9ca3af] mb-1.5 font-medium">
                    Select Resume File(s) <span className="text-slate-900 dark:text-white font-semibold">*</span>
                  </label>
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed border-gray-300 dark:border-white/[0.18] bg-gray-50/80 dark:bg-white/[0.025] p-5 text-center transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.05]">
                    <UploadCloud size={24} className="text-gray-400 dark:text-[#a1a1aa]" />
                    <span className="geist-caption text-xs font-semibold text-slate-800 dark:text-white">
                      {selectedUploadFiles.length > 0
                        ? `Selected ${selectedUploadFiles.length} file${selectedUploadFiles.length > 1 ? 's' : ''}`
                        : 'Click to select PDF, DOCX, or TXT resumes'}
                    </span>
                    <span className="geist-small text-gray-500 dark:text-[#6b7280]">
                      Select single or multiple candidate resume files
                    </span>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length > 0) {
                          setSelectedUploadFiles(files);
                        }
                      }}
                      disabled={uploading}
                    />
                  </label>

                  {/* List of Selected Files */}
                  {selectedUploadFiles.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <p className="geist-label uppercase text-gray-500 dark:text-[#6b7280] text-[10px]">Selected Files ({selectedUploadFiles.length}):</p>
                      <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
                        {selectedUploadFiles.map((file, idx) => (
                          <div key={`${file.name}-${idx}`} className="flex items-center justify-between rounded-[6px] border border-gray-200 dark:border-white/[0.1] bg-gray-100/70 dark:bg-white/[0.03] px-3 py-1.5 text-xs">
                            <div className="flex items-center gap-2 truncate min-w-0">
                              <FileText size={13} className="text-blue-600 dark:text-blue-400 shrink-0" />
                              <span className="truncate text-slate-800 dark:text-white font-medium">{file.name}</span>
                              <span className="text-gray-500 dark:text-[#6b7280]">({(file.size / 1024).toFixed(0)} KB)</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedUploadFiles(prev => prev.filter((_, i) => i !== idx))}
                              className="text-gray-400 dark:text-[#8f8f8f] hover:text-red-500 dark:hover:text-red-400 font-bold ml-2 text-base"
                              disabled={uploading}
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Location, Experience & Education Mandatory Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="geist-label block uppercase text-gray-600 dark:text-[#9ca3af] mb-1.5 font-medium">
                      Location / City <span className="text-slate-900 dark:text-[#ededed] font-semibold">*</span>
                    </label>
                    <LocationCityInput
                      value={uploadModalLocation}
                      onChange={setUploadModalLocation}
                      placeholder="e.g. Nashik, Mumbai, Pune..."
                      className="w-full rounded-[8px] border border-gray-300 dark:border-white/[0.14] bg-white dark:bg-[#050505] p-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-black dark:focus:border-blue-400 placeholder:text-gray-400 dark:placeholder:text-[#6b7280]"
                    />
                  </div>

                  <div>
                    <label className="geist-label block uppercase text-gray-600 dark:text-[#9ca3af] mb-1.5 font-medium">
                      Experience Years <span className="text-slate-900 dark:text-[#ededed] font-semibold">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="60"
                      value={uploadModalExpYears}
                      onChange={(e) => setUploadModalExpYears(e.target.value)}
                      placeholder="e.g. 1.5 or 3.5 Yrs"
                      className="w-full rounded-[8px] border border-gray-300 dark:border-white/[0.14] bg-white dark:bg-[#050505] p-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-black dark:focus:border-blue-400 placeholder:text-gray-400 dark:placeholder:text-[#6b7280]"
                    />
                  </div>

                  <div>
                    <label className="geist-label block uppercase text-gray-600 dark:text-[#9ca3af] mb-1.5 font-medium">
                      Highest Education <span className="text-slate-900 dark:text-[#ededed] font-semibold">*</span>
                    </label>
                    <EducationInput
                      value={uploadModalHighestEducation}
                      onChange={setUploadModalHighestEducation}
                      placeholder="Type or select education (e.g. B.Tech Civil, Diploma, B.Com)..."
                    />
                  </div>
                </div>

                {/* Extra Info Input Field */}
                <div>
                  <label className="geist-label block uppercase text-gray-600 dark:text-[#9ca3af] mb-1.5 font-medium">
                    Extra Info / Candidate Notes <span className="text-blue-600 dark:text-blue-400 font-normal lowercase">(Optional — will be parsed WITH PDF data)</span>
                  </label>
                  <textarea
                    rows={4}
                    value={uploadModalExtraInfo}
                    onChange={(e) => setUploadModalExtraInfo(e.target.value)}
                    placeholder="Enter candidate bio, extra skills, recruiter notes, past performance, or details to combine with PDF parsing..."
                    className="w-full rounded-[8px] border border-gray-300 dark:border-white/[0.14] bg-white dark:bg-[#050505] p-3 text-xs text-slate-900 dark:text-white outline-none focus:border-black dark:focus:border-blue-400 placeholder:text-gray-400 dark:placeholder:text-[#6b7280] leading-relaxed"
                  />
                  <p className="geist-small mt-1 text-gray-500 dark:text-[#6b7280]">
                    💡 Any text entered here will be combined with the extracted PDF/DOCX text before AI extraction.
                  </p>
                </div>


                {/* Submit Actions */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200 dark:border-white/[0.1]">
                  <button
                    type="button"
                    onClick={() => setIsUploadModalOpen(false)}
                    disabled={uploading}
                    className="geist-caption rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-gray-100 dark:bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-700 dark:text-[#d4d4d4] hover:bg-gray-200 dark:hover:bg-white/[0.08]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => processResumeFiles(selectedUploadFiles, uploadModalExtraInfo)}
                    disabled={uploading || selectedUploadFiles.length === 0}
                    className="geist-caption inline-flex items-center gap-2 rounded-[6px] bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 px-4 py-2 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {uploading ? (
                      <>
                        <Sparkles size={14} className="animate-spin text-white dark:text-black" />
                        {uploadStatus || 'Processing Resumes...'}
                      </>
                    ) : (
                      <>
                        <UploadCloud size={14} strokeWidth={2} />
                        Upload & Process {selectedUploadFiles.length > 0 ? `(${selectedUploadFiles.length})` : ''}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Full Edit Candidate Info Modal */}
      {editingCandidate &&
        createPortal(
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setEditingCandidate(null)}>
            <div className="relative w-full max-w-2xl bg-white dark:bg-[#090909] border border-gray-200 dark:border-white/[0.15] rounded-[12px] shadow-2xl flex flex-col text-slate-900 dark:text-white max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 py-4 bg-gray-50 dark:bg-[#0d0d0d] border-b border-gray-200 dark:border-white/[0.11] shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-[6px] bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                    <Edit3 size={16} />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-900 dark:text-white">Edit Candidate Information</h3>
                    <p className="geist-small text-gray-500 dark:text-[#8f8f8f]">Update candidate profile, experience, skills, and contact details</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingCandidate(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-gray-200 dark:border-white/[0.11] bg-gray-100 dark:bg-white/[0.03] text-gray-500 dark:text-[#8f8f8f] transition-colors hover:bg-gray-200 dark:hover:bg-white/[0.06] hover:text-black dark:hover:text-white text-xl leading-none"
                >
                  &times;
                </button>
              </div>

              {/* Modal Body / Form */}
              <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh] geist-small">
                {/* 1. Personal & Contact Info */}
                <div className="space-y-3 p-3.5 bg-gray-50/60 dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.08] rounded-[8px]">
                  <p className="geist-label uppercase text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">Personal & Contact Details</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 dark:text-[#a1a1aa] mb-1 font-medium">Candidate Name</label>
                      <input
                        type="text"
                        value={editingCandidateForm.name}
                        onChange={(e) => setEditingCandidateForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g. Rahul Sharma"
                        className="w-full h-9 rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] px-3 text-slate-900 dark:text-white outline-none focus:border-slate-900 dark:focus:border-white/30 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-[#a1a1aa] mb-1 font-medium">Email Address</label>
                      <input
                        type="email"
                        value={editingCandidateForm.email}
                        onChange={(e) => setEditingCandidateForm(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="e.g. candidate@example.com"
                        className="w-full h-9 rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] px-3 text-slate-900 dark:text-white outline-none focus:border-slate-900 dark:focus:border-white/30 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-[#a1a1aa] mb-1 font-medium">Phone / WhatsApp Number</label>
                      <input
                        type="text"
                        value={editingCandidateForm.phone}
                        onChange={(e) => setEditingCandidateForm(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="e.g. +91 9876543210"
                        className="w-full h-9 rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] px-3 text-slate-900 dark:text-white outline-none focus:border-slate-900 dark:focus:border-white/30 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-[#a1a1aa] mb-1 font-medium">City / Location</label>
                      <LocationCityInput
                        value={editingCandidateForm.location}
                        onChange={(val) => setEditingCandidateForm(prev => ({ ...prev, location: val }))}
                        placeholder="e.g. Nashik, Mumbai, Pune..."
                        className="w-full h-9 rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] px-3 text-slate-900 dark:text-white outline-none focus:border-slate-900 dark:focus:border-white/30 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-[#a1a1aa] mb-1 font-medium">Gender</label>
                      <div className="grid grid-cols-3 gap-1">
                        {['Male', 'Female', 'Other'].map(g => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setEditingCandidateForm(prev => ({ ...prev, gender: g }))}
                            className={`h-9 rounded-[6px] text-xs font-bold border transition-colors cursor-pointer ${
                              editingCandidateForm.gender === g
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white dark:bg-[#111] border-gray-300 dark:border-white/[0.11] text-slate-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-white/5'
                            }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-[#a1a1aa] mb-1 font-medium">Marital Status</label>
                      <div className="grid grid-cols-2 gap-1">
                        {['Single / Unmarried', 'Married'].map(m => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setEditingCandidateForm(prev => ({ ...prev, maritalStatus: m }))}
                            className={`h-9 rounded-[6px] text-xs font-bold border transition-colors cursor-pointer ${
                              editingCandidateForm.maritalStatus === m
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white dark:bg-[#111] border-gray-300 dark:border-white/[0.11] text-slate-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-white/5'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Professional Details */}
                <div className="space-y-3 p-3.5 bg-gray-50/60 dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.08] rounded-[8px]">
                  <p className="geist-label uppercase text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">Professional Profile & Skills</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 dark:text-[#a1a1aa] mb-1 font-medium">Current Designation / Role</label>
                      <input
                        type="text"
                        value={editingCandidateForm.currentTitle}
                        onChange={(e) => setEditingCandidateForm(prev => ({ ...prev, currentTitle: e.target.value }))}
                        placeholder="e.g. Full Stack Developer"
                        className="w-full h-9 rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] px-3 text-slate-900 dark:text-white outline-none focus:border-slate-900 dark:focus:border-white/30 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-[#a1a1aa] mb-1 font-medium">Total Experience (Years)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="50"
                        value={editingCandidateForm.totalExperienceYears}
                        onChange={(e) => setEditingCandidateForm(prev => ({ ...prev, totalExperienceYears: e.target.value }))}
                        placeholder="e.g. 1.5, 2.5"
                        className="w-full h-9 rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] px-3 text-slate-900 dark:text-white outline-none focus:border-slate-900 dark:focus:border-white/30 text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-[#a1a1aa] mb-1 font-medium">Skills (Comma Separated or Check Rec Box below)</label>
                    <input
                      type="text"
                      value={editingCandidateForm.skills}
                      onChange={(e) => setEditingCandidateForm(prev => ({ ...prev, skills: e.target.value }))}
                      placeholder="e.g. React, Node.js, Python, AutoCAD, Civil Engineering"
                      className="w-full h-9 rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] px-3 text-slate-900 dark:text-white outline-none focus:border-slate-900 dark:focus:border-white/30 text-xs"
                    />

                    {/* Recommended Domain Skills Box with Checkmarks */}
                    <div className="mt-2.5 p-2.5 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-100/50 dark:bg-white/[0.02]">
                      <p className="geist-label text-[10px] uppercase text-emerald-600 dark:text-emerald-400 font-bold mb-1.5 flex items-center gap-1">
                        <CheckSquare size={12} />
                        Recommended Skills Rec Box (Click checkmark to add/remove):
                      </p>
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                        {[
                          "AutoCAD", "Civil Engineering", "Site Management", "Estimating", "Structural Design",
                          "Billing & Estimation", "RCC Design", "Revit", "Quantity Surveying", "Project Management",
                          "React", "Node.js", "Python", "TypeScript", "JavaScript", "SQL", "PostgreSQL",
                          "Financial Analysis", "Accounting", "Tally", "GST Compliance", "Auditing",
                          "Sales & Marketing", "Business Development", "Digital Marketing", "SEO", "Lead Generation",
                          "Quality Assurance", "AWS", "Docker", "Machine Learning", "Data Analysis", "Excel"
                        ].map(skill => {
                          const currentSkills = Array.isArray(editingCandidateForm.skills)
                            ? editingCandidateForm.skills.map((s: any) => String(s).trim())
                            : (typeof editingCandidateForm.skills === 'string' ? editingCandidateForm.skills.split(',').map(s => s.trim()).filter(Boolean) : []);
                          const isChecked = currentSkills.some(s => s.toLowerCase() === skill.toLowerCase());
                          return (
                            <button
                              key={skill}
                              type="button"
                              onClick={() => {
                                let newSkills: string[];
                                if (isChecked) {
                                  newSkills = currentSkills.filter(s => s.toLowerCase() !== skill.toLowerCase());
                                } else {
                                  newSkills = [...currentSkills, skill];
                                }
                                setEditingCandidateForm(prev => ({ ...prev, skills: newSkills.join(', ') }));
                              }}
                              className={`geist-caption inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold border transition-all cursor-pointer ${
                                isChecked
                                  ? 'bg-emerald-50 dark:bg-emerald-500/20 border-emerald-500/50 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-white dark:bg-white/[0.04] border-gray-300 dark:border-white/10 text-slate-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.08] hover:text-black dark:hover:text-white'
                              }`}
                            >
                              <div className={`w-3 h-3 rounded-xs border flex items-center justify-center ${isChecked ? 'bg-emerald-500 border-emerald-500 text-white dark:text-black' : 'border-gray-400 dark:border-gray-500'}`}>
                                {isChecked && <Check size={9} strokeWidth={3} />}
                              </div>
                              <span>{skill}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-[#a1a1aa] mb-1 font-medium">Degree / Education Qualification</label>
                    <EducationInput
                      value={editingCandidateForm.education}
                      onChange={(val) => setEditingCandidateForm(prev => ({ ...prev, education: val }))}
                      placeholder="Type or select qualification (e.g. B.Tech CSE, Diploma Civil, B.Com)..."
                    />
                  </div>

                  {/* Salary, Working Status & Notice Period */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-slate-700 dark:text-[#a1a1aa] mb-1 font-medium">Working Status</label>
                      <select
                        value={editingCandidateForm.employmentStatus}
                        onChange={(e) => setEditingCandidateForm(prev => ({ ...prev, employmentStatus: e.target.value }))}
                        className="w-full rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] p-2 text-slate-900 dark:text-white outline-none text-xs font-semibold"
                      >
                        <option value="Working">Currently Working (Employed)</option>
                        <option value="Not Working">Not Working (Unemployed)</option>
                        <option value="Serving Notice">Serving Notice Period</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 dark:text-[#a1a1aa] mb-1 font-medium">Notice Period</label>
                      <input
                        type="text"
                        value={editingCandidateForm.noticePeriod}
                        onChange={(e) => setEditingCandidateForm(prev => ({ ...prev, noticePeriod: e.target.value }))}
                        placeholder="e.g. 30 Days or 1 Month"
                        className="w-full rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] p-2 text-slate-900 dark:text-white outline-none text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 dark:text-[#a1a1aa] mb-1 font-medium">Current Salary (CTC)</label>
                      <input
                        type="text"
                        value={editingCandidateForm.currentSalary}
                        onChange={(e) => setEditingCandidateForm(prev => ({ ...prev, currentSalary: e.target.value }))}
                        placeholder="e.g. 4.5 LPA or 35,000 / month"
                        className="w-full rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] p-2 text-slate-900 dark:text-white outline-none text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 dark:text-[#a1a1aa] mb-1 font-medium">Expected Salary (CTC)</label>
                      <input
                        type="text"
                        value={editingCandidateForm.expectedSalary}
                        onChange={(e) => setEditingCandidateForm(prev => ({ ...prev, expectedSalary: e.target.value }))}
                        placeholder="e.g. 6.5 LPA or 50,000 / month"
                        className="w-full rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] p-2 text-slate-900 dark:text-white outline-none text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Summary & Recruiter Notes */}
                <div className="space-y-3 p-3.5 bg-gray-50/60 dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.08] rounded-[8px]">
                  <p className="geist-label uppercase text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">Summary & Recruiter Notes</p>
                  <div>
                    <label className="block text-slate-700 dark:text-[#a1a1aa] mb-1 font-medium">Professional Summary</label>
                    <textarea
                      rows={3}
                      value={editingCandidateForm.summary}
                      onChange={(e) => setEditingCandidateForm(prev => ({ ...prev, summary: e.target.value }))}
                      placeholder="Enter candidate profile summary or background..."
                      className="w-full rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] p-2.5 text-slate-900 dark:text-white outline-none focus:border-slate-900 dark:focus:border-white/30 text-xs resize-y"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-[#a1a1aa] mb-1 font-medium">Recruiter Notes / Additional Details</label>
                    <textarea
                      rows={2}
                      value={editingCandidateForm.additionalText}
                      onChange={(e) => setEditingCandidateForm(prev => ({ ...prev, additionalText: e.target.value }))}
                      placeholder="Add recruiter notes, expected salary, notice period, interview feedback..."
                      className="w-full rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-[#111] p-2.5 text-slate-900 dark:text-white outline-none focus:border-slate-900 dark:focus:border-white/30 text-xs resize-y"
                    />
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-gray-50 dark:bg-[#0d0d0d] border-t border-gray-200 dark:border-white/[0.11] shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingCandidate(null)}
                  className="geist-caption h-9 px-4 rounded-[6px] border border-gray-300 dark:border-white/[0.11] bg-white dark:bg-white/[0.03] text-slate-700 dark:text-[#d4d4d4] font-medium text-xs hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-black dark:hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCandidateEdit}
                  disabled={isSavingCandidateEdit}
                  className="geist-caption inline-flex items-center gap-1.5 h-9 px-4 rounded-[6px] bg-emerald-600 dark:bg-emerald-500 text-white dark:text-black font-bold text-xs hover:bg-emerald-700 dark:hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-emerald-500/20"
                >
                  {isSavingCandidateEdit ? (
                    <>
                      <Sparkles className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                      <span>Save Candidate Info</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default ResumeDump;

