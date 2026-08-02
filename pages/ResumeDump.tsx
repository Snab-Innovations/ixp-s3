import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import * as pdfjsLib from 'pdfjs-dist';
import * as mammoth from 'mammoth';
import { Archive, CheckCircle2, ExternalLink, FileText, Search, Trash2, UploadCloud, UserCheck, UserX, XCircle } from 'lucide-react';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { useMessageBox } from '../components/MessageBox';
import { SKILL_OPTIONS } from './Profile';
import { ingestResumeFile, saveResumeDumpCandidate } from '../services/resumeService';
import { logTeamActivity } from '../services/auditService';
import { dedupeCandidatesByIdentity } from '../services/candidateIdentity';
import { deleteFileFromS3ByUrl } from '../services/s3Service';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

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
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingCandidateId, setDeletingCandidateId] = useState<string | null>(null);
  const [isDraggingResume, setIsDraggingResume] = useState(false);
  const [skillsPanelCandidate, setSkillsPanelCandidate] = useState<ResumeDumpCandidate | null>(null);

  const teamId = userProfile?.teamId || userProfile?.parentRecruiterId || user?.uid || '';

  useEffect(() => {
    if (!user) {
      setCandidates([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const candidatesQuery = teamId
      ? query(collection(db, 'resumeDumpCandidates'), where('teamId', '==', teamId))
      : query(collection(db, 'resumeDumpCandidates'), where('recruiterUID', '==', user.uid));

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
  }, [user]);

  const filteredCandidates = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return candidates;
    return candidates.filter((candidate) => (
      (candidate.name || '').toLowerCase().includes(term) ||
      (candidate.email || '').toLowerCase().includes(term) ||
      (candidate.phone || '').toLowerCase().includes(term) ||
      (candidate.currentTitle || '').toLowerCase().includes(term) ||
      (candidate.location || '').toLowerCase().includes(term) ||
      (candidate.sourceJobTitle || '').toLowerCase().includes(term) ||
      (candidate.resumeFileName || '').toLowerCase().includes(term) ||
      (candidate.skills || []).some((skill) => skill.toLowerCase().includes(term)) ||
      (candidate.education || []).some((item) => `${item.degree} ${item.institution}`.toLowerCase().includes(term))
    ));
  }, [candidates, searchTerm]);

  const processResumeFiles = async (files: File[]) => {
    if (!user || files.length === 0) return;

    setUploading(true);
    setIsDraggingResume(false);
    setUploadResults([]);
    setUploadStatus(`Parsing and saving ${files.length} resume${files.length === 1 ? '' : 's'}...`);

    const results = await Promise.all(files.map(async (file): Promise<UploadResult> => {
      try {
        const ingested = await ingestResumeFile(file);
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
    setUploading(false);
    setUploadStatus('');
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    await processResumeFiles(Array.from(event.target.files || []));
    event.target.value = '';
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
    await processResumeFiles(Array.from(event.dataTransfer.files || []));
  };

  const deleteCandidate = async (candidate: ResumeDumpCandidate) => {
    setDeletingCandidateId(candidate.id);
    try {
      // 1. Delete candidate document from Firestore
      await deleteDoc(doc(db, 'resumeDumpCandidates', candidate.id));

      // 2. Delete candidate resume file from Amazon S3 Bucket
      if (candidate.resumeUrl) {
        console.log(`[Resume Dump] Deleting S3 resume file for ${candidate.name || candidate.email}...`);
        await deleteFileFromS3ByUrl(candidate.resumeUrl);
      }

      // 3. Log audit event
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
    <div className="-mx-4 -my-8 min-h-[calc(100vh-3.5rem)] bg-[#000] text-white sm:-mx-6 lg:-mx-8">
      <section className="border-b border-white/[0.11] bg-[#000]">
        <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-7 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="geist-label uppercase text-[#6b7280]">Recruiter Library</p>
            <h1 className="geist-page-title mt-2 text-white">Resume Dump</h1>
            <p className="geist-small mt-1 max-w-2xl text-[#8f8f8f]">
              Upload resumes once, extract candidate details, and keep Cloudinary links ready for upcoming interview creation. Mark candidates as Hired to exclude them from automated suggestions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] flex-1 sm:flex-initial">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#8f8f8f]" strokeWidth={1.8} />
              <input
                type="text"
                placeholder="Search by name, email, skill, or degree..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="geist-caption h-9 w-full rounded-[6px] border border-white/[0.11] bg-[#050505] pl-9 pr-3 text-white outline-none placeholder:text-[#6b7280] focus:border-white/[0.24]"
              />
            </div>
            <label className="geist-caption inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-[6px] border border-white bg-white px-3 font-medium text-black transition-colors hover:bg-[#eaeaea]">
              <UploadCloud size={14} strokeWidth={1.8} />
              Upload resumes
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
          </div>
        </div>
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
        <section className="border-b border-white/[0.11] px-4 py-3 sm:px-6 lg:px-7">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {uploadResults.slice(-6).map((result) => (
              <div key={`${result.fileName}-${result.message}`} className="flex min-w-0 items-start gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 py-2">
                {result.status === 'saved' ? (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[#83d0a3]" strokeWidth={1.8} />
                ) : (
                  <XCircle className="mt-0.5 size-3.5 shrink-0 text-[#ff8f8f]" strokeWidth={1.8} />
                )}
                <div className="min-w-0">
                  <p className="geist-caption truncate text-white">{result.fileName}</p>
                  <p className="geist-small mt-0.5 truncate text-[#8f8f8f]">{result.message}</p>
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
                  <th className="geist-label whitespace-nowrap px-4 py-2.5 uppercase text-[#6b7280] sm:px-6 lg:px-7">Candidate</th>
                  <th className="geist-label whitespace-nowrap px-4 py-2.5 uppercase text-[#6b7280]">Phone</th>
                  <th className="geist-label whitespace-nowrap px-4 py-2.5 uppercase text-[#6b7280]">Skills</th>
                  <th className="geist-label whitespace-nowrap px-4 py-2.5 uppercase text-[#6b7280]">Suggestion Status</th>
                  <th className="geist-label whitespace-nowrap px-4 py-2.5 uppercase text-[#6b7280]">Uploaded</th>
                  <th className="geist-label whitespace-nowrap px-4 py-2.5 text-right uppercase text-[#6b7280]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.08]">
                {filteredCandidates.map((candidate) => (
                  <tr key={candidate.id} className={`transition-colors ${candidate.isHired || candidate.doNotSuggest ? 'bg-emerald-950/10 hover:bg-emerald-950/20' : 'hover:bg-white/[0.025]'}`}>
                    <td className="px-4 py-3 sm:px-6 lg:px-7">
                      <div className="geist-caption max-w-[320px] truncate font-semibold text-white" title={candidate.name}>
                        {candidate.name || 'Unknown Candidate'}
                      </div>
                      <div className="geist-small mt-0.5 max-w-[320px] truncate text-[#8bbde8]" title={candidate.email}>
                        {candidate.email || 'Email not found'}
                      </div>
                      {(candidate.currentTitle || candidate.location) && (
                        <div className="geist-small mt-0.5 max-w-[320px] truncate text-[#6b7280]" title={[candidate.currentTitle, candidate.location].filter(Boolean).join(' · ')}>
                          {[candidate.currentTitle, candidate.location].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="geist-caption whitespace-nowrap text-[#d4d4d4]">{candidate.phone || 'N/A'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {candidate.skills.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setSkillsPanelCandidate(candidate)}
                          className="flex max-w-[420px] flex-wrap gap-1.5 rounded-[6px] text-left transition-colors hover:bg-white/[0.025] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                          title="View parsed candidate profile"
                        >
                          {candidate.skills.slice(0, 5).map((skill) => (
                            <span key={skill} className="geist-small rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-2 py-0.5 text-[#d4d4d4]">
                              {skill}
                            </span>
                          ))}
                          {candidate.skills.length > 5 && (
                            <span className="geist-small rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-2 py-0.5 text-[#8f8f8f]">
                              +{candidate.skills.length - 5}
                            </span>
                          )}
                        </button>
                      ) : (
                        <button type="button" onClick={() => setSkillsPanelCandidate(candidate)} className="geist-caption text-[#6b7280] transition-colors hover:text-white">View parsed profile</button>
                      )}
                      {typeof candidate.totalExperienceYears === 'number' && candidate.totalExperienceYears > 0 && (
                        <p className="geist-small mt-1.5 text-[#6b7280]">{candidate.totalExperienceYears} years extracted experience</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {candidate.isHired || candidate.doNotSuggest ? (
                        <span className="geist-small inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-400">
                          🎉 Hired (Excluded)
                        </span>
                      ) : (
                        <span className="geist-small inline-flex items-center gap-1.5 rounded-full border border-white/[0.11] bg-white/[0.03] px-2.5 py-1 text-[#a1a1aa]">
                          Available
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="geist-label whitespace-nowrap text-[#9ca3af]">{formatDate(candidate.updatedAt || candidate.createdAt)}</div>
                      <div className="geist-small mt-0.5 max-w-[160px] truncate text-[#6b7280]" title={candidate.resumeFileName}>
                        {candidate.resumeFileName}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => toggleHiredStatus(candidate)}
                          className={`geist-caption inline-flex h-8 items-center justify-center gap-1.5 rounded-[6px] border px-2.5 font-medium transition-colors ${
                            candidate.isHired || candidate.doNotSuggest
                              ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/40'
                              : 'border-white/[0.11] bg-white/[0.03] text-[#d4d4d4] hover:bg-white/[0.06] hover:text-white'
                          }`}
                          title={candidate.isHired || candidate.doNotSuggest ? 'Mark candidate as available for job suggestions' : 'Mark candidate as Hired (will never be suggested for job roles)'}
                        >
                          {candidate.isHired || candidate.doNotSuggest ? (
                            <>
                              <UserX size={13} strokeWidth={1.8} />
                              <span>Hired (No Suggest)</span>
                            </>
                          ) : (
                            <>
                              <UserCheck size={13} strokeWidth={1.8} />
                              <span>Mark Hired</span>
                            </>
                          )}
                        </button>
                        <a
                          href={candidate.resumeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={actionButtonClass}
                        >
                          <ExternalLink size={13} strokeWidth={1.8} />
                          Open resume
                        </a>
                        <button
                          type="button"
                          onClick={() => confirmDeleteCandidate(candidate)}
                          disabled={deletingCandidateId === candidate.id}
                          className="geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border border-[#3f1d1d] bg-[#180707] px-3 font-medium text-[#ff8f8f] transition-colors hover:bg-[#260b0b] disabled:cursor-not-allowed disabled:opacity-40"
                          title="Delete candidate"
                        >
                          <Trash2 size={13} strokeWidth={1.8} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {skillsPanelCandidate &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => setSkillsPanelCandidate(null)}>
            <div
              className="w-full max-w-2xl overflow-hidden rounded-[8px] border border-white/[0.13] bg-[#050505] text-white shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-white/[0.11] px-4 py-3">
                <div className="min-w-0">
                  <p className="geist-label uppercase text-[#6b7280]">Parsed candidate profile</p>
                  <h3 className="geist-section-title mt-1 truncate text-white">
                    {skillsPanelCandidate.name || skillsPanelCandidate.email || 'Candidate'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSkillsPanelCandidate(null)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] text-[#8f8f8f] transition-colors hover:bg-white/[0.06] hover:text-white"
                  title="Close skills panel"
                >
                  <span className="text-lg leading-none">&times;</span>
                </button>
              </div>
              <div className="max-h-[68vh] space-y-5 overflow-y-auto p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[6px] border border-white/[0.11] bg-white/[0.025] p-3">
                    <p className="geist-label uppercase text-[#6b7280]">Current role</p>
                    <p className="geist-caption mt-1 text-[#d4d4d4]">{skillsPanelCandidate.currentTitle || 'Not found'}</p>
                  </div>
                  <div className="rounded-[6px] border border-white/[0.11] bg-white/[0.025] p-3">
                    <p className="geist-label uppercase text-[#6b7280]">Experience</p>
                    <p className="geist-caption mt-1 text-[#d4d4d4]">{skillsPanelCandidate.totalExperienceYears ? `${skillsPanelCandidate.totalExperienceYears} years` : 'Not found'}</p>
                  </div>
                  <div className="rounded-[6px] border border-white/[0.11] bg-white/[0.025] p-3">
                    <p className="geist-label uppercase text-[#6b7280]">Location</p>
                    <p className="geist-caption mt-1 text-[#d4d4d4]">{skillsPanelCandidate.location || 'Not found'}</p>
                  </div>
                </div>

                {skillsPanelCandidate.summary && (
                  <div>
                    <p className="geist-label uppercase text-[#6b7280]">Professional summary</p>
                    <p className="geist-caption mt-2 leading-6 text-[#d4d4d4]">{skillsPanelCandidate.summary}</p>
                  </div>
                )}

                <div>
                  <p className="geist-label uppercase text-[#6b7280]">Skills ({(skillsPanelCandidate.skills || []).length})</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(skillsPanelCandidate.skills || []).length > 0 ? skillsPanelCandidate.skills.map((skill) => (
                      <span key={skill} className="geist-caption rounded-[6px] border border-white/[0.11] bg-white/[0.04] px-2.5 py-1 font-medium text-[#d4d4d4]">
                        {skill}
                      </span>
                    )) : <span className="geist-caption text-[#6b7280]">No explicit skills found.</span>}
                  </div>
                </div>

                {(skillsPanelCandidate.experience || []).length > 0 && (
                  <div>
                    <p className="geist-label uppercase text-[#6b7280]">Experience history</p>
                    <div className="mt-2 space-y-2">
                      {skillsPanelCandidate.experience!.map((entry, index) => (
                        <div key={`${entry.title}-${entry.company}-${index}`} className="rounded-[6px] border border-white/[0.11] bg-white/[0.025] p-3">
                          <p className="geist-caption font-semibold text-white">{entry.title || 'Role'}{entry.company ? ` · ${entry.company}` : ''}</p>
                          {(entry.startDate || entry.endDate) && <p className="geist-small mt-1 text-[#6b7280]">{[entry.startDate, entry.endDate].filter(Boolean).join(' – ')}</p>}
                          {entry.highlights?.[0] && <p className="geist-small mt-2 text-[#a1a1aa]">{entry.highlights[0]}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(skillsPanelCandidate.education || []).length > 0 && (
                  <div>
                    <p className="geist-label uppercase text-[#6b7280]">Education</p>
                    <div className="mt-2 space-y-1.5">
                      {skillsPanelCandidate.education!.map((entry, index) => (
                        <p key={`${entry.degree}-${index}`} className="geist-caption text-[#d4d4d4]">{[entry.degree, entry.institution, entry.year].filter(Boolean).join(' · ')}</p>
                      ))}
                    </div>
                  </div>
                )}

                <p className="geist-small border-t border-white/[0.08] pt-3 text-[#6b7280]">
                  Source: {skillsPanelCandidate.source === 'candidate_interview' ? `Candidate interview${skillsPanelCandidate.sourceJobTitle ? ` · ${skillsPanelCandidate.sourceJobTitle}` : ''}` : skillsPanelCandidate.source === 'interview_creation' ? 'Interview creation upload' : 'Resume Dump upload'} · Parser: {skillsPanelCandidate.parsingMethod || 'legacy'}
                </p>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default ResumeDump;
