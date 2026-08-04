import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  CheckCircle2, 
  ExternalLink, 
  Search, 
  Trash2, 
  UploadCloud, 
  UserCheck, 
  UserX, 
  XCircle,
  UserPlus,
  Edit3,
  MessageSquare,
  X,
  Save,
  Briefcase,
  Sparkles,
  Phone,
  Mail,
  FileText,
  FileSpreadsheet,
  Check,
  Building,
  MapPin,
  GraduationCap,
  Eye,
  SlidersHorizontal,
  Filter,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Layers,
  Award,
  Clock,
  ChevronDown,
  Target,
  Zap,
  Send
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMessageBox } from '../components/MessageBox';
import { Interview } from '../types';
import InviteCandidateModal from '../components/InviteCandidateModal';
import { extractSkillSignals, ingestResumeFile, saveResumeDumpCandidate, scoreCandidateForRole } from '../services/resumeService';
import { logTeamActivity } from '../services/auditService';
import { deleteFileFromS3ByUrl } from '../services/s3Service';
import { poll, rds } from '../services/rdsApi';

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
  <div className="-mx-4 -my-8 min-h-[calc(100vh-3.5rem)] bg-slate-50 dark:bg-[#000] text-slate-900 dark:text-white sm:-mx-6 lg:-mx-8">
    <section className="border-b border-slate-200 dark:border-white/[0.11] bg-white dark:bg-[#000]">
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-7 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <SkeletonBlock className="h-4 w-32 bg-slate-200 dark:bg-white/[0.04]" />
          <SkeletonBlock className="mt-2 h-8 w-56 max-w-full bg-slate-300 dark:bg-white/10" />
          <SkeletonBlock className="mt-2 h-4 w-[34rem] max-w-full bg-slate-200 dark:bg-white/[0.04]" />
        </div>
        <SkeletonBlock className="h-9 w-36 bg-slate-300 dark:bg-white/[0.12]" />
      </div>
    </section>

    <section className="grid gap-3 border-b border-slate-200 dark:border-white/[0.11] bg-white dark:bg-[#09090b] px-4 py-3 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-7">
      <SkeletonBlock className="h-9 w-full bg-slate-200 dark:bg-white/[0.04]" />
      <SkeletonBlock className="h-9 w-full bg-slate-200 dark:bg-white/[0.04] lg:w-80" />
    </section>

    <section className="border-b border-slate-200 dark:border-white/[0.11] px-4 py-3 sm:px-6 lg:px-7">
      <div className="flex min-h-20 items-center justify-center gap-3 rounded-[6px] border border-dashed border-slate-300 dark:border-white/[0.13] bg-slate-100/50 dark:bg-white/[0.02] px-4 py-4">
        <SkeletonBlock className="h-8 w-8 shrink-0 bg-slate-300 dark:bg-white/[0.05]" />
        <div className="w-full max-w-sm">
          <SkeletonBlock className="h-4 w-48 max-w-full bg-slate-300 dark:bg-white/10" />
          <SkeletonBlock className="mt-2 h-3 w-32 bg-slate-200 dark:bg-white/[0.04]" />
        </div>
      </div>
    </section>

    <section className="flex min-h-[360px] flex-col">
      <div className="hidden grid-cols-[minmax(220px,1fr)_140px_minmax(260px,1fr)_160px_220px] gap-4 border-b border-slate-200 dark:border-white/[0.11] bg-slate-100 dark:bg-[#080808] px-4 py-2.5 sm:px-6 lg:grid lg:px-7">
        {[120, 64, 82, 76, 70].map((width, index) => (
          <span key={index} className="block h-3 animate-pulse rounded-[6px] bg-slate-300 dark:bg-white/[0.04]" style={{ width }} aria-hidden="true" />
        ))}
      </div>

      <div className="divide-y divide-slate-200 dark:divide-white/[0.08]">
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            key={index}
            className="grid gap-3 px-4 py-3 sm:px-6 lg:grid-cols-[minmax(220px,1fr)_140px_minmax(260px,1fr)_160px_220px] lg:items-center lg:gap-4 lg:px-7"
          >
            <div className="min-w-0">
              <SkeletonBlock className="h-4 w-44 max-w-full bg-slate-300 dark:bg-white/10" />
              <SkeletonBlock className="mt-2 h-3 w-56 max-w-full bg-slate-200 dark:bg-white/[0.04]" />
            </div>
            <SkeletonBlock className="h-4 w-24 bg-slate-200 dark:bg-white/[0.04]" />
            <div className="flex flex-wrap gap-1.5">
              <SkeletonBlock className="h-6 w-20 bg-slate-200 dark:bg-white/[0.04]" />
              <SkeletonBlock className="h-6 w-16 bg-slate-200 dark:bg-white/[0.04]" />
              <SkeletonBlock className="h-6 w-24 bg-slate-200 dark:bg-white/[0.04]" />
            </div>
            <div>
              <SkeletonBlock className="h-3 w-20 bg-slate-200 dark:bg-white/[0.04]" />
              <SkeletonBlock className="mt-2 h-3 w-28 bg-slate-200 dark:bg-white/[0.035]" />
            </div>
            <div className="flex gap-2 lg:justify-end">
              <SkeletonBlock className="h-8 w-28 bg-slate-200 dark:bg-white/[0.04]" />
              <SkeletonBlock className="h-8 w-20 bg-slate-200 dark:bg-white/[0.04]" />
            </div>
          </div>
        ))}
      </div>
    </section>
  </div>
);

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

export default function ResumeDump() {
  const { user, userProfile } = useAuth();
  const messageBox = useMessageBox();

  const [candidates, setCandidates] = useState<ResumeDumpCandidate[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [isDraggingResume, setIsDraggingResume] = useState(false);
  const [deletingCandidateId, setDeletingCandidateId] = useState<string | null>(null);

  // Checkmark Selection State
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());

  // Candidate Full Profile Drawer/Modal State
  const [profileCandidate, setProfileCandidate] = useState<ResumeDumpCandidate | null>(null);
  const [showFullDocViewer, setShowFullDocViewer] = useState(false);

  // Invite Flow State
  const [inviteCandidatesList, setInviteCandidatesList] = useState<ResumeDumpCandidate[]>([]);
  const [showJobPickerModal, setShowJobPickerModal] = useState(false);
  const [selectedJobForInvite, setSelectedJobForInvite] = useState<Interview | null>(null);
  const [modalSelectedJobId, setModalSelectedJobId] = useState<string>('');

  // Upload Resumes Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [modalUploadFiles, setModalUploadFiles] = useState<File[]>([]);
  const [modalExpYears, setModalExpYears] = useState('');
  const [modalExtraNotes, setModalExtraNotes] = useState('');

  // Edit Candidate Information Modal State (matching screenshot UI)
  const [editingCandidate, setEditingCandidate] = useState<ResumeDumpCandidate | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    location: '',
    currentTitle: '',
    experience: '',
    skills: '',
    educationDegree: '',
    summary: ''
  });
  const [isSavingCandidate, setIsSavingCandidate] = useState(false);

  // Naukri-Style Search & Filters State
  const [selectedJobRoleFilter, setSelectedJobRoleFilter] = useState('All');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'All' | 'Available' | 'Hired'>('All');
  const [selectedSkillFilter, setSelectedSkillFilter] = useState('All');
  const [selectedIndustryRoleFilter, setSelectedIndustryRoleFilter] = useState('All');
  const [selectedExpRangeFilter, setSelectedExpRangeFilter] = useState('All');
  const [selectedLocationFilter, setSelectedLocationFilter] = useState('All');

  // Secondary Filter Bar State
  const [showMoreFiltersPanel, setShowMoreFiltersPanel] = useState(false);
  const [selectedMatchScoreFilter, setSelectedMatchScoreFilter] = useState('All');
  const [selectedEducationFilter, setSelectedEducationFilter] = useState('All');
  const [selectedSourceFilter, setSelectedSourceFilter] = useState('All');
  const [selectedAddedDateFilter, setSelectedAddedDateFilter] = useState('Any time');
  const [searchFullText, setSearchFullText] = useState(false);

  // Pagination State (10 per page matching screenshot)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const teamId = userProfile?.teamId || userProfile?.parentRecruiterId || user?.uid || '';
  const isWhatsAppConnected = Boolean(userProfile?.whatsappSessionId);

  // Load Candidate Data & Active Interviews from RDS PostgreSQL
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const cancelCandidatesPoll = poll(
      () => rds.listResumeDump(teamId).then((res) => res.candidates || []),
      (data) => {
        const candidateList: ResumeDumpCandidate[] = (data || []).map((candidateData: any) => ({
          id: candidateData.id,
          recruiterUID: candidateData.recruiterUID || user.uid,
          name: candidateData.name || '',
          email: candidateData.email || '',
          phone: candidateData.phone || '',
          skills: Array.isArray(candidateData.skills) ? candidateData.skills : [],
          resumeUrl: candidateData.resumeUrl || '',
          resumeFileName: candidateData.resumeFileName || '',
          resumeMimeType: candidateData.resumeMimeType || '',
          resumeSize: candidateData.resumeSize || 0,
          resumeText: candidateData.resumeText || '',
          location: candidateData.location || '',
          currentTitle: candidateData.currentTitle || '',
          summary: candidateData.summary || '',
          totalExperienceYears: candidateData.totalExperienceYears || 0,
          experience: Array.isArray(candidateData.experience) ? candidateData.experience : [],
          education: Array.isArray(candidateData.education) ? candidateData.education : [],
          certifications: Array.isArray(candidateData.certifications) ? candidateData.certifications : [],
          languages: Array.isArray(candidateData.languages) ? candidateData.languages : [],
          source: candidateData.source || 'resume_dump',
          sourceJobTitle: candidateData.sourceJobTitle || '',
          parsingMethod: candidateData.parsingMethod || 'deterministic',
          isHired: Boolean(candidateData.isHired),
          doNotSuggest: Boolean(candidateData.doNotSuggest),
          createdAt: candidateData.createdAt,
          updatedAt: candidateData.updatedAt,
        }));
        setCandidates(candidateList);
        setLoading(false);
      },
      undefined,
      5000
    );

    // Fetch active interviews for Invite candidate flow
    rds.listInterviews(teamId)
      .then(({ interviews: activeJobs }) => {
        setInterviews(activeJobs || []);
      })
      .catch((err) => console.error('Failed to load active interviews:', err));

    return () => {
      cancelCandidatesPoll();
    };
  }, [user, teamId]);

  // Derived Filter Dropdown Options
  const uniqueJobRoles = useMemo(() => {
    const set = new Set<string>();
    interviews.forEach((i) => {
      if (i.title) set.add(i.title);
    });
    candidates.forEach((c) => {
      if (c.sourceJobTitle) set.add(c.sourceJobTitle);
    });
    return Array.from(set).sort();
  }, [interviews, candidates]);

  const uniqueSkillsWithCount = useMemo(() => {
    const map = new Map<string, number>();
    candidates.forEach((c) => {
      (c.skills || []).forEach((s) => {
        const clean = s.trim();
        if (clean) {
          map.set(clean, (map.get(clean) || 0) + 1);
        }
      });
    });
    return Array.from(map.entries())
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count);
  }, [candidates]);

  const uniqueIndustryRoles = useMemo(() => {
    const set = new Set<string>();
    candidates.forEach((c) => {
      if (c.currentTitle) set.add(c.currentTitle);
    });
    return Array.from(set).sort();
  }, [candidates]);

  const uniqueLocations = useMemo(() => {
    const set = new Set<string>();
    candidates.forEach((c) => {
      if (c.location) set.add(c.location);
    });
    return Array.from(set).sort();
  }, [candidates]);

  const uniqueEducations = useMemo(() => {
    const set = new Set<string>();
    candidates.forEach((c) => {
      if (c.education && c.education.length > 0 && c.education[0].degree) {
        set.add(c.education[0].degree);
      }
    });
    return Array.from(set).sort();
  }, [candidates]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedJobRoleFilter !== 'All') count++;
    if (selectedStatusFilter !== 'All') count++;
    if (selectedSkillFilter !== 'All') count++;
    if (selectedIndustryRoleFilter !== 'All') count++;
    if (selectedExpRangeFilter !== 'All') count++;
    if (selectedLocationFilter !== 'All') count++;
    if (selectedMatchScoreFilter !== 'All') count++;
    if (selectedEducationFilter !== 'All') count++;
    if (selectedSourceFilter !== 'All') count++;
    if (selectedAddedDateFilter !== 'Any time') count++;
    if (searchFullText) count++;
    if (searchTerm.trim()) count++;
    return count;
  }, [
    selectedJobRoleFilter,
    selectedStatusFilter,
    selectedSkillFilter,
    selectedIndustryRoleFilter,
    selectedExpRangeFilter,
    selectedLocationFilter,
    selectedMatchScoreFilter,
    selectedEducationFilter,
    selectedSourceFilter,
    selectedAddedDateFilter,
    searchFullText,
    searchTerm
  ]);

  // Precompute Match Scores for all candidates when selectedJobRoleFilter changes for super-fast O(1) filtering & sorting
  const candidateMatchScoresMap = useMemo(() => {
    const map = new Map<string, { score: number; matchedSkills: string[]; jobTitle: string }>();
    if (selectedJobRoleFilter === 'All') return map;

    const targetJob = interviews.find((i) => i.title === selectedJobRoleFilter || i.id === selectedJobRoleFilter) || null;
    if (!targetJob) return map;

    const reqSkills = typeof (targetJob as any).skills === 'string'
      ? (targetJob as any).skills.split(',').map((s: string) => s.trim()).filter(Boolean)
      : Array.isArray((targetJob as any).skills) ? (targetJob as any).skills : [];

    candidates.forEach((c) => {
      const res = scoreCandidateForRole(
        c as any,
        {
          title: targetJob.title || '',
          requiredSkills: reqSkills,
          description: targetJob.description || ''
        }
      );
      if (res) {
        map.set(c.id, {
          score: res.matchScore,
          matchedSkills: res.matchedSkills || [],
          jobTitle: targetJob.title
        });
      } else {
        // Safe fallback score for candidates with low/no skill match
        const candidateSkills = c.skills || [];
        const matched = reqSkills.filter((req: string) =>
          candidateSkills.some((cs: string) => cs.toLowerCase().includes(req.toLowerCase()) || req.toLowerCase().includes(cs.toLowerCase()))
        );
        const rawScore = reqSkills.length > 0 ? Math.round((matched.length / reqSkills.length) * 100) : 0;
        map.set(c.id, {
          score: rawScore,
          matchedSkills: matched,
          jobTitle: targetJob.title
        });
      }
    });

    return map;
  }, [candidates, interviews, selectedJobRoleFilter]);

  // Fast O(1) Helper to get Match Score for a candidate
  const getCandidateMatchScore = (candidate: ResumeDumpCandidate) => {
    if (selectedJobRoleFilter === 'All') return null;
    return candidateMatchScoresMap.get(candidate.id) || null;
  };

  // Naukri-Style Advanced Search & Filter Engine with Automatic AI Match Ranking
  const filteredCandidates = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    const resultList = candidates.filter((c) => {
      // 1. Text Search Filter
      if (query) {
        const nameMatch = c.name.toLowerCase().includes(query);
        const emailMatch = c.email.toLowerCase().includes(query);
        const phoneMatch = c.phone.toLowerCase().includes(query);
        const titleMatch = c.currentTitle && c.currentTitle.toLowerCase().includes(query);
        const locMatch = c.location && c.location.toLowerCase().includes(query);
        const skillMatch = c.skills.some((s) => s.toLowerCase().includes(query));
        const summaryMatch = c.summary && c.summary.toLowerCase().includes(query);
        const fullTextMatch = searchFullText && c.resumeText && c.resumeText.toLowerCase().includes(query);

        if (!nameMatch && !emailMatch && !phoneMatch && !titleMatch && !locMatch && !skillMatch && !summaryMatch && !fullTextMatch) {
          return false;
        }
      }

      // 2. Status Filter (Available vs Hired)
      if (selectedStatusFilter === 'Available' && (c.isHired || c.doNotSuggest)) return false;
      if (selectedStatusFilter === 'Hired' && !(c.isHired || c.doNotSuggest)) return false;

      // 4. Skill Filter
      if (selectedSkillFilter !== 'All' && !c.skills.some((s) => s.toLowerCase() === selectedSkillFilter.toLowerCase())) {
        return false;
      }

      // 5. Industry / Role Filter
      if (selectedIndustryRoleFilter !== 'All' && c.currentTitle !== selectedIndustryRoleFilter) {
        return false;
      }

      // 6. Experience Range Filter
      if (selectedExpRangeFilter !== 'All') {
        const exp = c.totalExperienceYears || 0;
        if (selectedExpRangeFilter === '0-1' && (exp < 0 || exp > 1)) return false;
        if (selectedExpRangeFilter === '1-3' && (exp <= 1 || exp > 3)) return false;
        if (selectedExpRangeFilter === '3-5' && (exp <= 3 || exp > 5)) return false;
        if (selectedExpRangeFilter === '5-8' && (exp <= 5 || exp > 8)) return false;
        if (selectedExpRangeFilter === '8-12' && (exp <= 8 || exp > 12)) return false;
        if (selectedExpRangeFilter === '12+' && exp <= 12) return false;
      }

      // 7. Location Filter
      if (selectedLocationFilter !== 'All' && c.location !== selectedLocationFilter) {
        return false;
      }

      // 8. Match Score Filter (75%+ or 50%+)
      if (selectedMatchScoreFilter !== 'All') {
        const match = getCandidateMatchScore(c);
        if (!match) return false;
        if (selectedMatchScoreFilter === '75+' && match.score < 75) return false;
        if (selectedMatchScoreFilter === '50+' && match.score < 50) return false;
      }

      // 9. Education Filter
      if (selectedEducationFilter !== 'All') {
        const hasEducation = c.education && c.education.some(e => e.degree && e.degree.toLowerCase().includes(selectedEducationFilter.toLowerCase()));
        if (!hasEducation) return false;
      }

      // 10. Source Filter
      if (selectedSourceFilter !== 'All' && c.source !== selectedSourceFilter) {
        return false;
      }

      // 11. Added Date Filter
      if (selectedAddedDateFilter !== 'Any time') {
        const candidateMillis = toMillis(c.createdAt || c.updatedAt);
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        if (selectedAddedDateFilter === 'Today' && (now - candidateMillis > oneDay)) return false;
        if (selectedAddedDateFilter === 'This Week' && (now - candidateMillis > 7 * oneDay)) return false;
        if (selectedAddedDateFilter === 'This Month' && (now - candidateMillis > 30 * oneDay)) return false;
      }

      return true;
    });

    // Ranking Sort: If a job role is selected, sort candidates ranking-wise by Match Score (Highest First)
    if (selectedJobRoleFilter !== 'All') {
      resultList.sort((a, b) => {
        const scoreA = getCandidateMatchScore(a)?.score ?? 0;
        const scoreB = getCandidateMatchScore(b)?.score ?? 0;
        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }
        return toMillis(b.updatedAt || b.createdAt) - toMillis(a.updatedAt || a.createdAt);
      });
    }

    return resultList;
  }, [
    candidates,
    searchTerm,
    searchFullText,
    selectedJobRoleFilter,
    selectedStatusFilter,
    selectedSkillFilter,
    selectedIndustryRoleFilter,
    selectedExpRangeFilter,
    selectedLocationFilter,
    selectedEducationFilter,
    selectedSourceFilter,
    selectedAddedDateFilter,
    interviews
  ]);

  // Reset all filters to default
  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedJobRoleFilter('All');
    setSelectedStatusFilter('All');
    setSelectedSkillFilter('All');
    setSelectedIndustryRoleFilter('All');
    setSelectedExpRangeFilter('All');
    setSelectedLocationFilter('All');
    setSelectedMatchScoreFilter('All');
    setSelectedEducationFilter('All');
    setSelectedSourceFilter('All');
    setSelectedAddedDateFilter('Any time');
    setSearchFullText(false);
    setCurrentPage(1);
    setSelectedCandidateIds(new Set());
  };

  // Calculate Pagination
  const totalPages = Math.ceil(filteredCandidates.length / pageSize) || 1;
  const paginatedCandidates = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCandidates.slice(start, start + pageSize);
  }, [filteredCandidates, currentPage, pageSize]);

  // Checkmark Selection Handlers
  const isAllSelected = useMemo(() => {
    if (paginatedCandidates.length === 0) return false;
    return paginatedCandidates.every((c) => selectedCandidateIds.has(c.id));
  }, [paginatedCandidates, selectedCandidateIds]);

  const toggleSelectCandidate = (candidateId: string, event?: React.MouseEvent) => {
    if (event) event.stopPropagation();
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) {
        next.delete(candidateId);
      } else {
        next.add(candidateId);
      }
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    if (isAllSelected) {
      setSelectedCandidateIds((prev) => {
        const next = new Set(prev);
        paginatedCandidates.forEach((c) => next.delete(c.id));
        return next;
      });
    } else {
      setSelectedCandidateIds((prev) => {
        const next = new Set(prev);
        paginatedCandidates.forEach((c) => next.add(c.id));
        return next;
      });
    }
  };

  // Bulk Actions Handlers
  const selectedCandidatesList = useMemo(() => {
    return candidates.filter((c) => selectedCandidateIds.has(c.id));
  }, [candidates, selectedCandidateIds]);

  const handleDirectSelectJobAndInvite = (jobIdOrTitle: string) => {
    if (!jobIdOrTitle || jobIdOrTitle === 'Select') return;
    const job = interviews.find((i) => i.id === jobIdOrTitle || i.title === jobIdOrTitle);
    if (!job) {
      messageBox.showError('Selected job posting not found.');
      return;
    }
    const listToInvite = selectedCandidatesList.length > 0 ? selectedCandidatesList : candidates;
    setInviteCandidatesList(listToInvite);
    setSelectedJobForInvite(job);
  };

  const handleBulkInvite = () => {
    if (selectedCandidatesList.length === 0) return;
    setInviteCandidatesList(selectedCandidatesList);
    if (interviews.length === 0) {
      messageBox.showError('No active job postings found. Please create a job posting first.');
      return;
    }
    if (selectedJobRoleFilter !== 'All') {
      const job = interviews.find((i) => i.title === selectedJobRoleFilter || i.id === selectedJobRoleFilter);
      if (job) setModalSelectedJobId(job.id);
    } else if (interviews.length === 1) {
      setModalSelectedJobId(interviews[0].id);
    } else {
      setModalSelectedJobId('');
    }
    setShowJobPickerModal(true);
  };

  const handleBulkMarkHired = async () => {
    if (selectedCandidatesList.length === 0) return;
    const targetIds = new Set(selectedCandidateIds);

    // Instant local state update (0ms lag, no popup)
    setCandidates((prev) =>
      prev.map((c) => (targetIds.has(c.id) ? { ...c, isHired: true, doNotSuggest: true } : c))
    );
    setSelectedCandidateIds(new Set());

    // Async DB update in background
    try {
      await Promise.all(
        Array.from(targetIds).map((id) =>
          rds.updateResumeDump(id as string, { isHired: true, doNotSuggest: true, recruiterUID: teamId })
        )
      );
    } catch (err) {
      console.error('Bulk mark hired failed in DB:', err);
    }
  };

  const handleBulkDelete = () => {
    if (selectedCandidatesList.length === 0) return;
    messageBox.showConfirm(
      `Permanently delete ${selectedCandidatesList.length} candidate(s) from Resume Dump and S3 storage?`,
      async () => {
        try {
          await Promise.all(
            selectedCandidatesList.map(async (c) => {
              await rds.deleteResumeDump(c.id, teamId);
              if (c.resumeUrl) await deleteFileFromS3ByUrl(c.resumeUrl);
            })
          );
          messageBox.showSuccess(`Deleted ${selectedCandidatesList.length} candidate(s).`);
          setSelectedCandidateIds(new Set());
        } catch (err) {
          console.error('Bulk delete failed:', err);
          messageBox.showError('Failed to delete selected candidates.');
        }
      },
      'Bulk Delete Candidates'
    );
  };

  // Process uploaded resume files with optional extra notes and experience override
  const processResumeFiles = async (files: File[], extraExpYears?: string, extraNotes?: string) => {
    const validFiles = files.filter((f) => /\.(pdf|docx|doc|txt|xlsx|csv)$/i.test(f.name));
    if (validFiles.length === 0) {
      messageBox.showError('Please select valid resume files (.pdf, .docx, .doc, .txt, .xlsx, .csv).');
      return;
    }

    setUploading(true);
    setUploadResults([]);
    setUploadStatus(`Parsing and uploading ${validFiles.length} file(s)...`);

    const creatorInfo = {
      uid: user?.uid || '',
      name: userProfile?.name || user?.email || 'Recruiter',
      email: user?.email || '',
      role: userProfile?.role || 'recruiter',
      designation: userProfile?.designation || 'Recruiter'
    };

    const results: UploadResult[] = await Promise.all(validFiles.map(async (file) => {
      try {
        const notesText = extraNotes ? extraNotes.trim() : '';

        // Extract priority experience years from extraExpYears OR extraNotes (e.g. "2", "2 years", "2 yrs")
        let priorityExpYears: number | undefined = undefined;
        if (extraExpYears && extraExpYears.trim()) {
          const parsedVal = parseFloat(extraExpYears.trim());
          if (!isNaN(parsedVal) && parsedVal >= 0) priorityExpYears = parsedVal;
        }

        if (priorityExpYears === undefined && notesText) {
          if (/^\d+(?:\.\d+)?$/.test(notesText)) {
            priorityExpYears = parseFloat(notesText);
          } else {
            const match = notesText.match(/(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?|yr|exp\b|experience\b)/i)
              || notesText.match(/(?:exp|experience)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
            if (match) {
              const parsedVal = parseFloat(match[1]);
              if (!isNaN(parsedVal) && parsedVal >= 0) priorityExpYears = parsedVal;
            }
          }
        }

        const overridesToPass: any = {};
        if (priorityExpYears !== undefined) {
          overridesToPass.totalExperienceYears = priorityExpYears;
        }

        const ingested = await ingestResumeFile(file, overridesToPass, '', notesText);

        let finalResumeText = typeof ingested.resumeText === 'string' ? ingested.resumeText : '';
        let extraSkillsExtracted: string[] = [];

        if (notesText) {
          // Extract skills from extra notes using predefined patterns + comma/line token splitting
          const structuredSkillSignals = extractSkillSignals(notesText);

          const rawNotesTokens = notesText
            .split(/[,;\n|/•·▪●]+/)
            .map((s) => s.replace(/^[\s:-]+|[\s.:-]+$/g, '').trim())
            .filter((s) => s.length >= 2 && s.length <= 40 && !/[.!?].+\s/.test(s));

          extraSkillsExtracted = Array.from(new Set([...structuredSkillSignals, ...rawNotesTokens]));
        }

        const combinedSkills = Array.from(new Set([
          ...extraSkillsExtracted,
          ...(ingested.profile.skills || [])
        ]));

        const finalProfile = {
          ...ingested.profile,
          skills: combinedSkills,
          totalExperienceYears: priorityExpYears !== undefined ? priorityExpYears : ingested.profile.totalExperienceYears
        };

        await saveResumeDumpCandidate({
          recruiterUID: user?.uid || '',
          teamId,
          profile: finalProfile,
          resumeText: finalResumeText,
          resumeUrl: ingested.resumeUrl || '',
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          source: 'resume_dump',
        });

        logTeamActivity(
          teamId,
          'resume_uploaded',
          `Uploaded resume "${file.name}" for candidate ${finalProfile.name || 'Candidate'}`,
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

  // Delete Single Candidate
  const deleteCandidate = async (candidate: ResumeDumpCandidate) => {
    setDeletingCandidateId(candidate.id);
    try {
      await rds.deleteResumeDump(candidate.id, teamId);

      if (candidate.resumeUrl) {
        await deleteFileFromS3ByUrl(candidate.resumeUrl);
      }

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
      messageBox.showSuccess(`Deleted ${candidate.name || candidate.email}.`);
    } catch (error) {
      console.error('Failed to delete candidate:', error);
      messageBox.showError('Failed to delete candidate.');
    } finally {
      setDeletingCandidateId(null);
    }
  };

  const confirmDeleteCandidate = (candidate: ResumeDumpCandidate) => {
    messageBox.showConfirm(
      `Delete ${candidate.name || candidate.email} from Resume Dump? This permanently deletes the candidate record and their resume file from S3.`,
      () => deleteCandidate(candidate),
      'Delete candidate'
    );
  };

  // Toggle Hired / Excluded Status (Instant UI state update, no popup/delay)
  const toggleHiredStatus = async (candidate: ResumeDumpCandidate) => {
    const newStatus = !(candidate.isHired || candidate.doNotSuggest);

    // Instant local state update (0ms lag)
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidate.id ? { ...c, isHired: newStatus, doNotSuggest: newStatus } : c))
    );

    if (profileCandidate && profileCandidate.id === candidate.id) {
      setProfileCandidate({
        ...profileCandidate,
        isHired: newStatus,
        doNotSuggest: newStatus
      });
    }

    // Background DB update
    try {
      await rds.updateResumeDump(candidate.id, {
        isHired: newStatus,
        doNotSuggest: newStatus,
        recruiterUID: teamId,
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
      console.error('Failed to update candidate status in DB:', error);
    }
  };

  // Open Edit Candidate Information Modal
  const handleStartEdit = (candidate: ResumeDumpCandidate) => {
    setEditingCandidate(candidate);
    const degreeVal = candidate.education && candidate.education.length > 0
      ? `${candidate.education[0].degree || ''} ${candidate.education[0].institution || ''}`.trim()
      : '';

    setEditForm({
      name: candidate.name || '',
      email: candidate.email || '',
      phone: candidate.phone || '',
      location: candidate.location || '',
      currentTitle: candidate.currentTitle || '',
      experience: candidate.totalExperienceYears ? String(candidate.totalExperienceYears) : '',
      skills: (candidate.skills || []).join(', '),
      educationDegree: degreeVal,
      summary: candidate.summary || ''
    });
  };

  // Save Candidate Information Edit
  const handleSaveCandidateEdit = async () => {
    if (!editingCandidate) return;

    setIsSavingCandidate(true);
    try {
      const skillsArray = editForm.skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const expNum = editForm.experience ? parseFloat(editForm.experience) : 0;

      const updatedData: any = {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        location: editForm.location.trim(),
        currentTitle: editForm.currentTitle.trim(),
        totalExperienceYears: expNum,
        skills: skillsArray,
        summary: editForm.summary.trim(),
        recruiterUID: teamId,
      };

      if (editForm.educationDegree.trim()) {
        updatedData.education = [{ degree: editForm.educationDegree.trim(), institution: '', year: '' }];
      }

      await rds.updateResumeDump(editingCandidate.id, updatedData);

      messageBox.showSuccess('Candidate details updated successfully.');
      setEditingCandidate(null);
    } catch (err: any) {
      console.error('Failed to save candidate edits:', err);
      messageBox.showError('Failed to update candidate details.');
    } finally {
      setIsSavingCandidate(false);
    }
  };

  // Start Single Candidate Invite Flow
  const handleStartInvite = (candidate: ResumeDumpCandidate) => {
    setInviteCandidatesList([candidate]);
    if (interviews.length === 0) {
      messageBox.showError('No active job postings found. Please create a job posting first before inviting candidates.');
      return;
    }
    if (selectedJobRoleFilter !== 'All') {
      const job = interviews.find((i) => i.title === selectedJobRoleFilter || i.id === selectedJobRoleFilter);
      if (job) setModalSelectedJobId(job.id);
    } else if (interviews.length === 1) {
      setModalSelectedJobId(interviews[0].id);
    } else {
      setModalSelectedJobId('');
    }
    setShowJobPickerModal(true);
  };

  const parsedEditSkillsList = useMemo(() => {
    return editForm.skills
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }, [editForm.skills]);

  const actionButtonClass = 'geist-caption inline-flex h-8 items-center justify-center gap-1.5 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-2.5 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40';

  if (loading) {
    return <ResumeDumpSkeleton />;
  }

  return (
    <div className="-mx-4 -my-8 sm:-mx-6 lg:-mx-8 min-h-[calc(100vh-3.5rem)] bg-slate-50 dark:bg-[#000] text-slate-900 dark:text-white font-sans flex flex-col justify-between">
      <div>
        {/* Top Header Section */}
        <section className="border-b border-slate-200 dark:border-white/[0.11] bg-white dark:bg-[#000]">
          <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-7 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <p className="geist-label uppercase text-slate-500 dark:text-[#6b7280]">Recruiter Library</p>
              <h1 className="geist-page-title mt-2 text-slate-900 dark:text-white">Resume Dump</h1>
              <p className="geist-small mt-1 max-w-2xl text-slate-600 dark:text-[#8f8f8f]">
                Upload resumes once, extract candidate details, and keep Cloudinary links ready for upcoming interview creation. Mark candidates as Hired to exclude them from automated suggestions.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Search Input Bar */}
              <div className="relative min-w-[260px] flex-1 sm:flex-initial">
                <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400 dark:text-[#8f8f8f]" strokeWidth={1.8} />
                <input
                  type="text"
                  placeholder="Search by name, email, skill, or degree..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="geist-caption h-9 w-full rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-slate-50 dark:bg-[#050505] pl-9 pr-3 text-slate-900 dark:text-white outline-none placeholder:text-slate-400 dark:placeholder:text-[#6b7280] focus:border-slate-400 dark:focus:border-white/[0.24]"
                />
              </div>

              {/* Upload Candidate Resumes Modal Trigger Button */}
              <button
                onClick={() => setShowUploadModal(true)}
                className="geist-caption inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-[6px] border border-slate-900 dark:border-white bg-slate-900 dark:bg-white px-3.5 font-medium text-white dark:text-black transition-colors hover:bg-slate-800 dark:hover:bg-[#eaeaea] shadow-sm"
              >
                <UploadCloud size={14} strokeWidth={1.8} />
                Upload resumes
              </button>
            </div>
          </div>
        </section>

        {/* Naukri-Style Search & Multi-Filter Control Bar */}
        <section className="border-b border-slate-200 dark:border-white/[0.11] bg-white dark:bg-[#09090b] px-4 py-3 sm:px-6 lg:px-7 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            
            {/* Primary Filter Row */}
            <div className="flex flex-wrap items-center gap-2">
              
              {/* 1. Job Role Dropdown */}
              <select
                value={selectedJobRoleFilter}
                onChange={(e) => {
                  setSelectedJobRoleFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-slate-50 dark:bg-[#121215] border border-slate-200 dark:border-white/[0.12] rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-gray-200 focus:outline-none focus:border-slate-400 dark:focus:border-white/30 cursor-pointer"
              >
                <option value="All">Select Job Role ({uniqueJobRoles.length} Jobs)</option>
                {uniqueJobRoles.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>

              {/* 2. Status Filter Pills */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#121215] border border-slate-200 dark:border-white/[0.12] p-1 rounded-lg">
                <button
                  onClick={() => { setSelectedStatusFilter('All'); setCurrentPage(1); }}
                  className={`px-2.5 py-1 rounded-md font-semibold text-[11px] transition-all cursor-pointer ${
                    selectedStatusFilter === 'All'
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-black shadow-sm'
                      : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  All Status
                </button>
                <button
                  onClick={() => { setSelectedStatusFilter('Available'); setCurrentPage(1); }}
                  className={`px-2.5 py-1 rounded-md font-semibold text-[11px] transition-all cursor-pointer ${
                    selectedStatusFilter === 'Available'
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-black shadow-sm'
                      : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Available
                </button>
                <button
                  onClick={() => { setSelectedStatusFilter('Hired'); setCurrentPage(1); }}
                  className={`px-2.5 py-1 rounded-md font-semibold text-[11px] transition-all cursor-pointer ${
                    selectedStatusFilter === 'Hired'
                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Hired
                </button>
              </div>

              {/* 3. Skills Filter Dropdown */}
              <select
                value={selectedSkillFilter}
                onChange={(e) => {
                  setSelectedSkillFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-slate-50 dark:bg-[#121215] border border-slate-200 dark:border-white/[0.12] rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-gray-200 focus:outline-none focus:border-slate-400 dark:focus:border-white/30 cursor-pointer max-w-[160px] truncate"
              >
                <option value="All">All Skills ({uniqueSkillsWithCount.length})</option>
                {uniqueSkillsWithCount.map(({ skill, count }) => (
                  <option key={skill} value={skill}>{skill} ({count})</option>
                ))}
              </select>

              {/* 4. Roles / Industry Dropdown */}
              <select
                value={selectedIndustryRoleFilter}
                onChange={(e) => {
                  setSelectedIndustryRoleFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-slate-50 dark:bg-[#121215] border border-slate-200 dark:border-white/[0.12] rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-gray-200 focus:outline-none focus:border-slate-400 dark:focus:border-white/30 cursor-pointer max-w-[180px] truncate"
              >
                <option value="All">All Roles / Industry ({uniqueIndustryRoles.length})</option>
                {uniqueIndustryRoles.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>

              {/* 5. Experience Range Filter Dropdown */}
              <select
                value={selectedExpRangeFilter}
                onChange={(e) => {
                  setSelectedExpRangeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-slate-50 dark:bg-[#121215] border border-slate-200 dark:border-white/[0.12] rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-gray-200 focus:outline-none focus:border-slate-400 dark:focus:border-white/30 cursor-pointer"
              >
                <option value="All">All Experience</option>
                <option value="0-1">Fresher (0-1 Yrs)</option>
                <option value="1-3">Junior (1-3 Yrs)</option>
                <option value="3-5">Mid-Level (3-5 Yrs)</option>
                <option value="5-8">Senior (5-8 Yrs)</option>
                <option value="8-12">Lead / Manager (8-12 Yrs)</option>
                <option value="12+">Veteran (12+ Yrs)</option>
              </select>

              {/* 6. Location Filter Dropdown */}
              <select
                value={selectedLocationFilter}
                onChange={(e) => {
                  setSelectedLocationFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-slate-50 dark:bg-[#121215] border border-slate-200 dark:border-white/[0.12] rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-gray-200 focus:outline-none focus:border-slate-400 dark:focus:border-white/30 cursor-pointer max-w-[160px] truncate"
              >
                <option value="All">All Locations ({uniqueLocations.length})</option>
                {uniqueLocations.map((loc) => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>

            </div>

            {/* Right Side Results Counter & Reset All Button */}
            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-gray-400">
              <span>Showing all <strong className="text-slate-900 dark:text-white">{filteredCandidates.length}</strong> matching candidates</span>

              {activeFilterCount > 0 && (
                <button
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 text-xs font-medium underline cursor-pointer"
                >
                  <RotateCcw size={12} />
                  <span>Reset All</span>
                </button>
              )}
            </div>

          </div>

          {/* More Filters Toggle Button */}
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-white/[0.06] pt-2.5">
            <button
              onClick={() => setShowMoreFiltersPanel(!showMoreFiltersPanel)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                showMoreFiltersPanel
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-50 dark:bg-[#121215] text-slate-700 dark:text-gray-300 border-slate-200 dark:border-white/[0.12] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <SlidersHorizontal size={13} />
              <span>{showMoreFiltersPanel ? `Less Filters ${activeFilterCount > 0 ? `(${activeFilterCount})` : ''}` : `More Filters ${activeFilterCount > 0 ? `(${activeFilterCount})` : ''}`}</span>
            </button>
          </div>

          {/* Expanded Secondary Filter Row */}
          {showMoreFiltersPanel && (
            <div className="pt-2 flex flex-wrap items-center gap-2 text-xs border-t border-slate-200 dark:border-white/[0.08] animate-in fade-in">
              <select
                value={selectedMatchScoreFilter}
                onChange={(e) => { setSelectedMatchScoreFilter(e.target.value); setCurrentPage(1); }}
                className="bg-slate-50 dark:bg-[#141418] border border-slate-200 dark:border-white/[0.12] rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-gray-200 focus:outline-none cursor-pointer"
              >
                <option value="All">Match Score: All</option>
                <option value="75+">75%+ High Match</option>
                <option value="50+">50%+ Medium Match</option>
              </select>

              <select
                value={selectedEducationFilter}
                onChange={(e) => { setSelectedEducationFilter(e.target.value); setCurrentPage(1); }}
                className="bg-slate-50 dark:bg-[#141418] border border-slate-200 dark:border-white/[0.12] rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-gray-200 focus:outline-none max-w-[180px] truncate cursor-pointer"
              >
                <option value="All">Education: All ({uniqueEducations.length})</option>
                {uniqueEducations.map((edu) => (
                  <option key={edu} value={edu}>{edu}</option>
                ))}
              </select>

              <select
                value={selectedSourceFilter}
                onChange={(e) => { setSelectedSourceFilter(e.target.value); setCurrentPage(1); }}
                className="bg-slate-50 dark:bg-[#141418] border border-slate-200 dark:border-white/[0.12] rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-gray-200 focus:outline-none cursor-pointer"
              >
                <option value="All">Direct Upload / Source</option>
                <option value="resume_dump">Direct Upload</option>
                <option value="interview_creation">Interview Creation</option>
              </select>

              <select
                value={selectedAddedDateFilter}
                onChange={(e) => { setSelectedAddedDateFilter(e.target.value); setCurrentPage(1); }}
                className="bg-slate-50 dark:bg-[#141418] border border-slate-200 dark:border-white/[0.12] rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-gray-200 focus:outline-none cursor-pointer"
              >
                <option value="Any time">Added: Any time</option>
                <option value="Today">Added: Today</option>
                <option value="This Week">Added: This Week</option>
                <option value="This Month">Added: This Month</option>
              </select>

              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 dark:bg-[#141418] border border-slate-200 dark:border-white/[0.12] px-3 py-1.5 rounded-lg text-slate-700 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={searchFullText}
                  onChange={(e) => setSearchFullText(e.target.checked)}
                  className="rounded border-slate-300 dark:border-gray-700 text-emerald-600 dark:text-emerald-500 focus:ring-emerald-500 bg-white dark:bg-gray-900 cursor-pointer"
                />
                <span>Full Text Search</span>
              </label>

            </div>
          )}
        </section>

        {/* Floating Bulk Action Bar (When 1 or more candidates checked) */}
        {selectedCandidateIds.size > 0 && (
          <div className="bg-emerald-50 dark:bg-[#101412] border-y border-emerald-300 dark:border-emerald-500/30 px-6 py-3 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-emerald-600 dark:bg-emerald-500 text-white dark:text-black font-bold text-xs shadow-sm">
                {selectedCandidateIds.size} Selected
              </span>
              <span className="text-xs text-emerald-800 dark:text-emerald-400 font-medium">
                Ready to invite candidates or manage status
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleBulkInvite}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black font-bold text-xs hover:bg-slate-800 dark:hover:bg-gray-200 shadow-md transition-all cursor-pointer"
              >
                <Send size={14} className="text-emerald-400 dark:text-emerald-600 fill-emerald-400 dark:fill-emerald-600" />
                Invite Selected ({selectedCandidateIds.size})
              </button>

              <button
                onClick={handleBulkMarkHired}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 hover:bg-emerald-200 dark:hover:bg-emerald-500/30 text-xs font-semibold transition-all cursor-pointer"
              >
                <UserCheck size={14} />
                Mark Selected Hired
              </button>

              <button
                onClick={handleBulkDelete}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/30 hover:bg-red-200 dark:hover:bg-red-500/30 text-xs font-semibold transition-all cursor-pointer"
              >
                <Trash2 size={14} />
                Delete Selected
              </button>

              <button
                onClick={() => setSelectedCandidateIds(new Set())}
                className="text-xs text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white underline ml-2 cursor-pointer"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}

        {/* Upload Status */}
        {uploading && (
          <section className="border-b border-slate-200 dark:border-white/[0.11] bg-slate-100/50 dark:bg-white/[0.02] px-4 py-4 sm:px-6 lg:px-7">
            <label
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex cursor-pointer items-center gap-3 rounded-[6px] border border-dashed px-4 py-3 transition-colors ${
                isDraggingResume ? 'border-slate-400 dark:border-white bg-slate-100 dark:bg-white/[0.06]' : 'border-slate-300 dark:border-white/[0.16] bg-white dark:bg-white/[0.02] hover:bg-slate-50 dark:hover:bg-white/[0.04]'
              }`}
            >
              <UploadCloud size={18} strokeWidth={1.8} className="text-slate-700 dark:text-white" />
              <span className="min-w-0">
                <span className="geist-caption block font-medium text-slate-900 dark:text-white">
                  {uploading ? uploadStatus || 'Processing resumes...' : isDraggingResume ? 'Drop resumes to upload' : 'Drop resumes here or click to upload'}
                </span>
              </span>
            </label>
          </section>
        )}

        {/* Upload Results */}
        {uploadResults.length > 0 && (
          <section className="border-b border-slate-200 dark:border-white/[0.11] px-4 py-3 sm:px-6 lg:px-7">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {uploadResults.slice(-6).map((result) => (
                <div key={`${result.fileName}-${result.message}`} className="flex min-w-0 items-start gap-2 rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-white dark:bg-white/[0.03] px-3 py-2">
                  {result.status === 'saved' ? (
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-[#83d0a3]" strokeWidth={1.8} />
                  ) : (
                    <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-600 dark:text-[#ff8f8f]" strokeWidth={1.8} />
                  )}
                  <div className="min-w-0">
                    <p className="geist-caption truncate text-slate-900 dark:text-white font-medium">{result.fileName}</p>
                    <p className="geist-small mt-0.5 truncate text-slate-500 dark:text-[#8f8f8f]">{result.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Main Candidate Table */}
        <section className="flex min-h-[360px] flex-col">
          {filteredCandidates.length === 0 && !uploading ? (
            <label
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex min-h-[420px] cursor-pointer flex-col items-center justify-center border-b border-dashed px-4 py-14 text-center transition-colors sm:px-6 lg:px-7 ${
                isDraggingResume
                  ? 'border-slate-400 dark:border-white bg-slate-100 dark:bg-white/[0.06]'
                  : 'border-slate-300 dark:border-white/[0.11] bg-white dark:bg-transparent hover:bg-slate-50 dark:hover:bg-white/[0.025]'
              }`}
            >
              <div className={`flex h-14 w-14 items-center justify-center rounded-[8px] border transition-colors ${
                isDraggingResume
                  ? 'border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-black'
                  : 'border-slate-200 dark:border-white/[0.16] bg-slate-100 dark:bg-white/[0.03] text-slate-500 dark:text-[#8f8f8f]'
              }`}>
                <UploadCloud size={24} strokeWidth={1.7} />
              </div>
              <h2 className="geist-section-title mt-4 text-slate-900 dark:text-white">
                {isDraggingResume ? 'Drop resumes here' : 'No matching candidates found'}
              </h2>
              <p className="geist-caption mt-2 max-w-md text-slate-600 dark:text-[#8f8f8f]">
                Try adjusting your search criteria or filters, or drag and drop PDF, DOCX, TXT, Excel, or CSV files anywhere to upload new resumes.
              </p>
            </label>
          ) : (
            <div className="overflow-x-auto bg-white dark:bg-transparent">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-white/[0.11] text-left">
                <thead className="bg-slate-100 dark:bg-[#080808]">
                  <tr>
                    <th className="px-4 py-2.5 w-10 sm:px-6 lg:px-7">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={toggleSelectAllOnPage}
                        className="rounded border-slate-300 dark:border-gray-700 text-emerald-600 dark:text-emerald-500 focus:ring-emerald-500 bg-white dark:bg-gray-900 cursor-pointer"
                        title="Select/Deselect all candidates on this page"
                      />
                    </th>
                    <th className="geist-label whitespace-nowrap px-4 py-2.5 uppercase text-slate-600 dark:text-[#6b7280]">Candidate</th>
                    <th className="geist-label whitespace-nowrap px-4 py-2.5 uppercase text-slate-600 dark:text-[#6b7280]">Match Score</th>
                    <th className="geist-label whitespace-nowrap px-4 py-2.5 uppercase text-slate-600 dark:text-[#6b7280]">Phone</th>
                    <th className="geist-label whitespace-nowrap px-4 py-2.5 uppercase text-slate-600 dark:text-[#6b7280]">Experience</th>
                    <th className="geist-label whitespace-nowrap px-4 py-2.5 uppercase text-slate-600 dark:text-[#6b7280]">Skills</th>
                    <th className="geist-label whitespace-nowrap px-4 py-2.5 uppercase text-slate-600 dark:text-[#6b7280]">Suggestion Status</th>
                    <th className="geist-label whitespace-nowrap px-4 py-2.5 uppercase text-slate-600 dark:text-[#6b7280]">Uploaded</th>
                    <th className="geist-label whitespace-nowrap px-4 py-2.5 text-right uppercase text-slate-600 dark:text-[#6b7280]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/[0.08]">
                  {paginatedCandidates.map((candidate) => {
                    const isChecked = selectedCandidateIds.has(candidate.id);

                    return (
                      <tr 
                        key={candidate.id} 
                        className={`transition-colors cursor-pointer ${
                          isChecked 
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-950/30' 
                            : candidate.isHired || candidate.doNotSuggest 
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/10 hover:bg-emerald-100/50 dark:hover:bg-emerald-950/20' 
                            : 'hover:bg-slate-50 dark:hover:bg-white/[0.025]'
                        }`}
                        onClick={() => setProfileCandidate(candidate)}
                      >
                        <td className="px-4 py-3 sm:px-6 lg:px-7" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => toggleSelectCandidate(candidate.id, e as any)}
                            className="rounded border-slate-300 dark:border-gray-700 text-emerald-600 dark:text-emerald-500 focus:ring-emerald-500 bg-white dark:bg-gray-900 cursor-pointer"
                          />
                        </td>

                        <td className="px-4 py-3">
                          <div className="geist-caption max-w-[240px] truncate font-semibold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors" title="Click row to view full candidate details">
                            {candidate.name || 'Unknown Candidate'}
                          </div>
                          <div className="geist-small mt-0.5 max-w-[240px] truncate text-blue-600 dark:text-[#8bbde8]" title={candidate.email}>
                            {candidate.email || 'Email not found'}
                          </div>
                          {(candidate.currentTitle || candidate.location) && (
                            <div className="geist-small mt-0.5 max-w-[240px] truncate text-slate-500 dark:text-[#6b7280]" title={[candidate.currentTitle, candidate.location].filter(Boolean).join(' · ')}>
                              {[candidate.currentTitle, candidate.location].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          {(() => {
                            const match = getCandidateMatchScore(candidate);
                            if (!match) {
                              return <span className="geist-caption text-slate-400 dark:text-[#4b5563]">—</span>;
                            }
                            const badgeStyle = match.score >= 75
                              ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30'
                              : match.score >= 50
                              ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/30'
                              : 'bg-slate-100 dark:bg-gray-500/10 text-slate-600 dark:text-gray-400 border-slate-200 dark:border-gray-500/20';

                            return (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-bold border ${badgeStyle}`}>
                                <Target size={12} />
                                {match.score}% Match
                              </span>
                            );
                          })()}
                        </td>

                        <td className="px-4 py-3">
                          <span className="geist-caption whitespace-nowrap text-slate-700 dark:text-[#d4d4d4] font-mono text-xs">
                            {candidate.phone || 'N/A'}
                          </span>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="geist-caption font-semibold text-emerald-600 dark:text-emerald-400">
                            {candidate.totalExperienceYears ? `${candidate.totalExperienceYears} Yrs` : 'N/A'}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          {candidate.skills.length > 0 ? (
                            <div className="flex max-w-[200px] flex-wrap items-center gap-1">
                              {candidate.skills.slice(0, 2).map((skill) => (
                                <span key={skill} className="geist-small rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-slate-100 dark:bg-white/[0.03] px-2 py-0.5 text-slate-700 dark:text-[#d4d4d4] truncate max-w-[95px]" title={skill}>
                                  {skill}
                                </span>
                              ))}
                              {candidate.skills.length > 2 && (
                                <span className="geist-small rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-slate-100 dark:bg-white/[0.03] px-1.5 py-0.5 text-slate-500 dark:text-[#8f8f8f] font-mono font-medium">
                                  +{candidate.skills.length - 2}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="geist-caption text-slate-400 dark:text-[#6b7280]">View profile</span>
                          )}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          {candidate.isHired || candidate.doNotSuggest ? (
                            <span className="geist-small inline-flex items-center gap-1.5 rounded-full border border-emerald-300 dark:border-emerald-500/30 bg-emerald-100 dark:bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-800 dark:text-emerald-400">
                              🎉 Hired
                            </span>
                          ) : (
                            <span className="geist-small inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/[0.11] bg-slate-100 dark:bg-white/[0.03] px-2.5 py-1 text-slate-600 dark:text-[#a1a1aa]">
                              Available
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="geist-label text-slate-500 dark:text-[#9ca3af]">{formatDate(candidate.updatedAt || candidate.createdAt)}</div>
                          <div className="geist-small mt-0.5 max-w-[130px] truncate text-slate-400 dark:text-[#6b7280]" title={candidate.resumeFileName}>
                            {candidate.resumeFileName}
                          </div>
                        </td>

                        <td className="px-4 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col items-end gap-1.5 min-w-[155px]">
                            
                            {/* Top Row: Invite & Mark Hired */}
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleStartInvite(candidate)}
                                className="inline-flex h-7 items-center justify-center gap-1 px-2.5 rounded-[6px] bg-slate-900 dark:bg-white text-white dark:text-black font-bold hover:bg-slate-800 dark:hover:bg-gray-200 transition-colors shadow-sm text-xs cursor-pointer"
                                title="Invite candidate to job posting"
                              >
                                <UserPlus size={12} strokeWidth={2.2} />
                                <span>Invite</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => toggleHiredStatus(candidate)}
                                className={`inline-flex h-7 items-center justify-center gap-1 rounded-[6px] border px-2 text-xs font-semibold transition-colors cursor-pointer ${
                                  candidate.isHired || candidate.doNotSuggest
                                    ? 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/40'
                                    : 'border-slate-200 dark:border-white/[0.11] bg-slate-100 dark:bg-white/[0.03] text-slate-700 dark:text-[#d4d4d4] hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white'
                                }`}
                                title={candidate.isHired || candidate.doNotSuggest ? 'Mark as available' : 'Mark candidate as Hired'}
                              >
                                {candidate.isHired || candidate.doNotSuggest ? (
                                  <>
                                    <UserX size={12} />
                                    <span>Hired</span>
                                  </>
                                ) : (
                                  <>
                                    <UserCheck size={12} />
                                    <span>Mark Hired</span>
                                  </>
                                )}
                              </button>
                            </div>

                            {/* Bottom Row: Resume | Edit | Delete */}
                            <div className="flex items-center gap-1">
                              <a
                                href={candidate.resumeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex h-6 items-center justify-center gap-1 rounded-[5px] border border-slate-200 dark:border-white/[0.1] bg-slate-100 dark:bg-white/[0.03] px-2 text-[11px] font-medium text-slate-700 dark:text-[#c4c4c4] hover:bg-slate-200 dark:hover:bg-white/[0.08] hover:text-slate-900 dark:hover:text-white transition-colors"
                                title="Open resume file"
                              >
                                <ExternalLink size={11} />
                                <span>Resume</span>
                              </a>

                              <button
                                type="button"
                                onClick={() => handleStartEdit(candidate)}
                                className="inline-flex h-6 items-center justify-center gap-1 rounded-[5px] border border-slate-200 dark:border-white/[0.1] bg-slate-100 dark:bg-white/[0.03] px-2 text-[11px] font-medium text-slate-700 dark:text-[#c4c4c4] hover:bg-slate-200 dark:hover:bg-white/[0.08] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                                title="Edit candidate details"
                              >
                                <Edit3 size={11} />
                                <span>Edit</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => confirmDeleteCandidate(candidate)}
                                disabled={deletingCandidateId === candidate.id}
                                className="inline-flex h-6 items-center justify-center p-1.5 rounded-[5px] border border-red-200 dark:border-[#3f1d1d] bg-red-50 dark:bg-[#180707] text-red-600 dark:text-[#ff8f8f] transition-colors hover:bg-red-100 dark:hover:bg-[#260b0b] disabled:opacity-40 cursor-pointer"
                                title="Delete candidate"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>

                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Bottom Pagination Bar */}
      {filteredCandidates.length > 0 && (
        <section className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 dark:border-white/[0.11] bg-white dark:bg-[#09090b] text-xs">
          <span className="text-slate-500 dark:text-gray-400 font-medium">
            Showing Page <span className="text-slate-900 dark:text-white font-bold">{currentPage}</span> of <span className="text-slate-900 dark:text-white font-bold">{totalPages}</span> ({filteredCandidates.length} matching candidates)
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.12] bg-slate-50 dark:bg-[#121215] text-slate-700 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <ChevronLeft size={14} />
              Previous
            </button>

            {Array.from({ length: totalPages }).map((_, idx) => {
              const pageNum = idx + 1;
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    currentPage === pageNum
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-black shadow-md'
                      : 'bg-slate-50 dark:bg-[#121215] text-slate-700 dark:text-gray-300 border border-slate-200 dark:border-white/[0.12] hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.12] bg-slate-50 dark:bg-[#121215] text-slate-700 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </section>
      )}

      {/* Candidate Profile Modal / Full Info Drawer */}
      {profileCandidate &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 dark:bg-black/80 p-4 backdrop-blur-md animate-in fade-in" onClick={() => setProfileCandidate(null)}>
            <div
              className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#0a0a0d] text-slate-900 dark:text-white shadow-2xl overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-[#0e0e12]">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider">Candidate Profile</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      profileCandidate.isHired || profileCandidate.doNotSuggest
                        ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30'
                        : 'bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-gray-300 border-slate-200 dark:border-white/[0.1]'
                    }`}>
                      {profileCandidate.isHired || profileCandidate.doNotSuggest ? 'Hired (Excluded)' : 'Available'}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{profileCandidate.name || 'Candidate Details'}</h3>
                  <p className="text-xs text-slate-500 dark:text-gray-400 flex flex-wrap items-center gap-x-3">
                    <span>{profileCandidate.email}</span>
                    {profileCandidate.phone && <span className="text-emerald-600 dark:text-emerald-400 font-mono">{profileCandidate.phone}</span>}
                  </p>
                </div>
                <button onClick={() => setProfileCandidate(null)} className="p-1.5 rounded-xl text-slate-400 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors">
                  <X size={20} />
                </button>
              </div>

              {/* Action Buttons Row */}
              <div className="flex flex-wrap items-center gap-2.5 px-6 py-3 bg-slate-100/50 dark:bg-[#111116] border-b border-slate-200 dark:border-white/[0.08]">
                <button
                  onClick={() => toggleHiredStatus(profileCandidate)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    profileCandidate.isHired || profileCandidate.doNotSuggest
                      ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30'
                      : 'bg-white dark:bg-white/[0.06] text-slate-800 dark:text-white border-slate-200 dark:border-white/[0.12] hover:bg-slate-50 dark:hover:bg-white/[0.12]'
                  }`}
                >
                  <UserCheck size={14} />
                  {profileCandidate.isHired || profileCandidate.doNotSuggest ? 'Mark Available' : 'Mark Hired'}
                </button>

                {profileCandidate.resumeUrl && (
                  <a
                    href={profileCandidate.resumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-white/[0.06] text-slate-800 dark:text-white border border-slate-200 dark:border-white/[0.12] hover:bg-slate-50 dark:hover:bg-white/[0.12] text-xs font-semibold transition-all"
                  >
                    <ExternalLink size={14} />
                    View Resume File
                  </a>
                )}

                <button
                  onClick={() => {
                    const c = profileCandidate;
                    setProfileCandidate(null);
                    handleStartEdit(c);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 hover:bg-emerald-200 dark:hover:bg-emerald-500/30 text-xs font-semibold transition-all cursor-pointer"
                >
                  <Edit3 size={14} />
                  Edit Info
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-xs">
                {/* Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-slate-50 dark:bg-[#121217] border border-slate-200 dark:border-white/[0.08] p-3.5 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-gray-500 tracking-wider">Name & Contact</span>
                    <p className="font-semibold text-slate-900 dark:text-white">{profileCandidate.name || 'N/A'}</p>
                    <p className="text-slate-600 dark:text-gray-400">{profileCandidate.email || 'N/A'}</p>
                    <p className="text-emerald-600 dark:text-emerald-400 font-mono">{profileCandidate.phone || 'N/A'}</p>
                  </div>

                  <div className="bg-slate-50 dark:bg-[#121217] border border-slate-200 dark:border-white/[0.08] p-3.5 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-gray-500 tracking-wider">Experience</span>
                    <p className="font-semibold text-slate-900 dark:text-white text-sm">
                      {profileCandidate.totalExperienceYears ? `${profileCandidate.totalExperienceYears} Years` : 'Not specified'}
                    </p>
                  </div>

                  <div className="bg-slate-50 dark:bg-[#121217] border border-slate-200 dark:border-white/[0.08] p-3.5 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-gray-500 tracking-wider">Current Role</span>
                    <p className="font-semibold text-slate-900 dark:text-white">{profileCandidate.currentTitle || 'Not specified'}</p>
                  </div>

                  <div className="bg-slate-50 dark:bg-[#121217] border border-slate-200 dark:border-white/[0.08] p-3.5 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-gray-500 tracking-wider">Location & Source</span>
                    <p className="font-semibold text-slate-900 dark:text-white">{profileCandidate.location || 'Not specified'}</p>
                    <p className="text-slate-600 dark:text-gray-400">{profileCandidate.resumeFileName}</p>
                  </div>
                </div>

                {/* Skills & Tech Stack */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Skills & Tech Stack ({profileCandidate.skills.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5 bg-slate-50 dark:bg-[#121217] border border-slate-200 dark:border-white/[0.08] p-4 rounded-xl">
                    {profileCandidate.skills.length > 0 ? (
                      profileCandidate.skills.map((skill, idx) => (
                        <span key={idx} className="px-2.5 py-1 bg-slate-200/60 dark:bg-white/[0.05] text-slate-800 dark:text-gray-200 rounded-lg border border-slate-300 dark:border-white/[0.08] text-xs">
                          {skill}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-400 dark:text-gray-500">No skills extracted</span>
                    )}
                  </div>
                </div>

                {/* Profile Summary */}
                {profileCandidate.summary && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Summary & Recruiter Notes</span>
                    <div className="bg-slate-50 dark:bg-[#121217] border border-slate-200 dark:border-white/[0.08] p-4 rounded-xl text-slate-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                      {profileCandidate.summary}
                    </div>
                  </div>
                )}

                {/* Full Resume Document Viewer Button / Toggle */}
                {profileCandidate.resumeUrl && (
                  <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText size={15} />
                        File: {profileCandidate.resumeFileName}
                      </span>
                      <button
                        onClick={() => setShowFullDocViewer(!showFullDocViewer)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 hover:bg-emerald-200 dark:hover:bg-emerald-500/30 text-xs font-semibold transition-all cursor-pointer"
                      >
                        <Eye size={14} />
                        {showFullDocViewer ? 'Hide Document Preview' : 'View Full Resume Document in Popup'}
                      </button>
                    </div>

                    {showFullDocViewer && (
                      <div className="w-full h-96 bg-white dark:bg-[#000] border border-slate-200 dark:border-white/[0.12] rounded-xl overflow-hidden animate-in fade-in">
                        <iframe
                          src={profileCandidate.resumeUrl}
                          className="w-full h-full border-0"
                          title="Resume Preview Document"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-[#0e0e12] flex justify-end">
                <button onClick={() => setProfileCandidate(null)} className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black font-semibold text-xs hover:bg-slate-800 dark:hover:bg-gray-200 cursor-pointer">
                  Close Profile
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Edit Candidate Information Modal */}
      {editingCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/85 backdrop-blur-md p-4 animate-in fade-in">
          <div className="w-full max-w-2xl max-h-[92vh] flex flex-col bg-white dark:bg-[#0b0c0e] border border-slate-200 dark:border-white/[0.12] rounded-2xl shadow-2xl overflow-hidden text-left font-sans text-slate-900 dark:text-white">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-[#0e0f13]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/20">
                  <Edit3 size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white leading-none">Edit Candidate Information</h3>
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">Update candidate profile, experience, skills, and contact details</p>
                </div>
              </div>
              <button onClick={() => setEditingCandidate(null)} className="p-1.5 rounded-xl text-slate-400 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-xs">

              {/* SECTION 1: PERSONAL & CONTACT DETAILS */}
              <div className="bg-slate-50 dark:bg-[#101116] border border-slate-200 dark:border-white/[0.08] p-5 rounded-2xl space-y-4">
                <span className="text-[10px] font-mono uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider block">
                  PERSONAL & CONTACT DETAILS
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] text-slate-700 dark:text-gray-300 font-medium mb-1.5">Candidate Name</label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      placeholder="Full Name"
                      className="w-full bg-white dark:bg-[#16171d] border border-slate-200 dark:border-white/[0.1] rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-700 dark:text-gray-300 font-medium mb-1.5">Email Address</label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      placeholder="candidate@example.com"
                      className="w-full bg-white dark:bg-[#16171d] border border-slate-200 dark:border-white/[0.1] rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-700 dark:text-gray-300 font-medium mb-1.5">Phone / WhatsApp Number</label>
                    <input
                      type="text"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      placeholder="+91 7620142519"
                      className="w-full bg-white dark:bg-[#16171d] border border-slate-200 dark:border-white/[0.1] rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-700 dark:text-gray-300 font-medium mb-1.5">City / Location</label>
                    <input
                      type="text"
                      value={editForm.location}
                      onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                      placeholder="e.g. Mumbai, Maharashtra"
                      className="w-full bg-white dark:bg-[#16171d] border border-slate-200 dark:border-white/[0.1] rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: PROFESSIONAL PROFILE & SKILLS */}
              <div className="bg-slate-50 dark:bg-[#101116] border border-slate-200 dark:border-white/[0.08] p-5 rounded-2xl space-y-4">
                <span className="text-[10px] font-mono uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider block">
                  PROFESSIONAL PROFILE & SKILLS
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] text-slate-700 dark:text-gray-300 font-medium mb-1.5">Current Designation / Role</label>
                    <input
                      type="text"
                      value={editForm.currentTitle}
                      onChange={(e) => setEditForm({ ...editForm, currentTitle: e.target.value })}
                      placeholder="e.g. Full Stack Developer"
                      className="w-full bg-white dark:bg-[#16171d] border border-slate-200 dark:border-white/[0.1] rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-700 dark:text-gray-300 font-medium mb-1.5">Total Experience (Years)</label>
                    <input
                      type="text"
                      value={editForm.experience}
                      onChange={(e) => setEditForm({ ...editForm, experience: e.target.value })}
                      placeholder="9"
                      className="w-full bg-white dark:bg-[#16171d] border border-slate-200 dark:border-white/[0.1] rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-700 dark:text-gray-300 font-medium mb-1.5">Skills (Comma Separated)</label>
                  <input
                    type="text"
                    value={editForm.skills}
                    onChange={(e) => setEditForm({ ...editForm, skills: e.target.value })}
                    placeholder="Microsoft Excel, Accounting, Tally, Communication..."
                    className="w-full bg-white dark:bg-[#16171d] border border-slate-200 dark:border-white/[0.1] rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                  />

                  {/* Live Skill Pill Badges */}
                  {parsedEditSkillsList.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-200 dark:border-white/[0.08]">
                      {parsedEditSkillsList.map((skill, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.1] text-[11px] text-slate-800 dark:text-gray-200 font-medium">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] text-slate-700 dark:text-gray-300 font-medium mb-1.5">Degree / Education Qualification</label>
                  <input
                    type="text"
                    value={editForm.educationDegree}
                    onChange={(e) => setEditForm({ ...editForm, educationDegree: e.target.value })}
                    placeholder="e.g. B.Tech Computer Science - IIT Bombay"
                    className="w-full bg-white dark:bg-[#16171d] border border-slate-200 dark:border-white/[0.1] rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* SECTION 3: SUMMARY & RECRUITER NOTES */}
              <div className="bg-slate-50 dark:bg-[#101116] border border-slate-200 dark:border-white/[0.08] p-5 rounded-2xl space-y-3">
                <span className="text-[10px] font-mono uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider block">
                  SUMMARY & RECRUITER NOTES
                </span>

                <div>
                  <label className="block text-[11px] text-slate-700 dark:text-gray-300 font-medium mb-1.5">Professional Summary</label>
                  <textarea
                    rows={4}
                    value={editForm.summary}
                    onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })}
                    placeholder="Enter candidate profile summary or background..."
                    className="w-full bg-white dark:bg-[#16171d] border border-slate-200 dark:border-white/[0.1] rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-emerald-500 resize-y"
                  />
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-[#0e0f13]">
              <button
                onClick={() => setEditingCandidate(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCandidateEdit}
                disabled={isSavingCandidate}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 dark:bg-emerald-500 text-white dark:text-black font-bold text-xs hover:bg-emerald-500 dark:hover:bg-emerald-400 disabled:opacity-40 transition-all shadow-md cursor-pointer"
              >
                <Check size={16} />
                {isSavingCandidate ? 'Saving Candidate Info...' : 'Save Candidate Info'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Send Interview Invitations Modal (Matching Exact User Screenshot UI) */}
      {showJobPickerModal && inviteCandidatesList.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/85 backdrop-blur-md p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-[#0a0a0d] border border-slate-200 dark:border-white/[0.14] rounded-2xl shadow-2xl overflow-hidden text-left font-sans text-slate-900 dark:text-white">
            
            {/* Modal Header (Exact Screenshot Layout: Icon Box + Title + Subtitle + Close Button) */}
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-[#0e0e12]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-800 dark:text-white border border-slate-200 dark:border-white/[0.1]">
                  <Send size={16} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">Send Interview Invitations</h3>
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                    Inviting {inviteCandidatesList.length} Candidate(s)
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowJobPickerModal(false);
                  setModalSelectedJobId('');
                }}
                className="p-1.5 rounded-xl text-slate-400 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 text-xs">
              
              {/* 1. SELECT TARGET JOB ROLE / INTERVIEW */}
              <div className="space-y-2">
                <label className="block text-[11px] font-mono uppercase font-bold text-slate-500 dark:text-gray-400 tracking-wider">
                  SELECT TARGET JOB ROLE / INTERVIEW
                </label>
                <select
                  value={modalSelectedJobId}
                  onChange={(e) => setModalSelectedJobId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#121319] border border-slate-200 dark:border-white/[0.14] rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">-- Choose a Job Role to Invite Candidates --</option>
                  {interviews.map((job) => {
                    let avgMatchScore = 0;
                    inviteCandidatesList.forEach((c) => {
                      const reqSkills = typeof (job as any).skills === 'string'
                        ? (job as any).skills.split(',').map((s: string) => s.trim()).filter(Boolean)
                        : Array.isArray((job as any).skills) ? (job as any).skills : [];

                      const res = scoreCandidateForRole(
                        c as any,
                        {
                          title: job.title || '',
                          requiredSkills: reqSkills,
                          description: job.description || ''
                        }
                      );
                      avgMatchScore += res?.matchScore || 0;
                    });
                    avgMatchScore = Math.round(avgMatchScore / inviteCandidatesList.length);

                    return (
                      <option key={job.id} value={job.id}>
                        {job.title} {job.accessCode ? `(Code: ${job.accessCode})` : ''} - {avgMatchScore}% Skill Match
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* 2. SELECTED CANDIDATES (N) */}
              <div className="space-y-2">
                <label className="block text-[11px] font-mono uppercase font-bold text-slate-500 dark:text-gray-400 tracking-wider">
                  SELECTED CANDIDATES ({inviteCandidatesList.length})
                </label>
                <div className="bg-slate-50 dark:bg-[#121319] border border-slate-200 dark:border-white/[0.1] rounded-xl p-3.5 space-y-2.5 max-h-48 overflow-y-auto custom-scrollbar">
                  {inviteCandidatesList.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 text-xs border-b border-slate-200 dark:border-white/[0.06] last:border-0 pb-2 last:pb-0">
                      <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[220px]">{c.name || 'Candidate'}</span>
                      <span className="text-blue-600 dark:text-[#8bbde8] font-mono text-[11px] truncate max-w-[220px]">{c.email}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Notice / Warning Banner (Matching Screenshot Amber Box) */}
              {!modalSelectedJobId ? (
                <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs">
                  <span className="text-amber-600 dark:text-amber-400 font-bold text-sm">⚠️</span>
                  <span>Please select a Job Role above to generate the specific interview link & access code.</span>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">✓</span>
                  <span>Target job role selected. Click Send Invites below to launch bulk Email & WhatsApp sender.</span>
                </div>
              )}

            </div>

            {/* Modal Footer (Matching Screenshot Buttons) */}
            <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-[#0e0e12]">
              <button
                onClick={() => {
                  setShowJobPickerModal(false);
                  setModalSelectedJobId('');
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white bg-slate-200/50 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.1] transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                disabled={!modalSelectedJobId}
                onClick={() => {
                  const targetJob = interviews.find((i) => i.id === modalSelectedJobId || i.title === modalSelectedJobId);
                  if (targetJob) {
                    setSelectedJobForInvite(targetJob);
                    setShowJobPickerModal(false);
                    setModalSelectedJobId('');
                  }
                }}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-md ${
                  modalSelectedJobId
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-black hover:bg-slate-800 dark:hover:bg-gray-200 cursor-pointer'
                    : 'bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-gray-500 border border-slate-300 dark:border-white/10 cursor-not-allowed'
                }`}
              >
                <Mail size={15} />
                <span>Send Invites</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Full Invite Candidate Modal Pre-loaded with Roster */}
      {selectedJobForInvite && (
        <InviteCandidateModal
          job={{
            ...selectedJobForInvite,
            // Pass candidate roster
            candidateData: [
              ...((selectedJobForInvite as any).candidateData || []),
              ...inviteCandidatesList.map((c) => ({
                name: c.name || c.email.split('@')[0],
                email: c.email,
                phone: c.phone
              }))
            ]
          }}
          onClose={() => {
            setSelectedJobForInvite(null);
            setInviteCandidatesList([]);
            setSelectedCandidateIds(new Set());
          }}
        />
      )}

      {/* Upload Candidate Resumes Modal (Matching Requested UI) */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/85 backdrop-blur-md p-4 animate-in fade-in">
          <div className="w-full max-w-xl bg-white dark:bg-[#0a0a0d] border border-slate-200 dark:border-white/[0.14] rounded-2xl shadow-2xl overflow-hidden text-left font-sans text-slate-900 dark:text-white">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-[#0e0e12]">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Upload Candidate Resumes</h3>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  Select or drop resume files and optionally attach extra details to parse together.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setModalUploadFiles([]);
                  setModalExpYears('');
                  setModalExtraNotes('');
                }}
                className="p-1.5 rounded-xl text-slate-400 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 text-xs">
              
              {/* Select Resume File(s) * */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-900 dark:text-white">
                  Select Resume File(s) <span className="text-emerald-600 dark:text-emerald-400">*</span>
                </label>

                <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-white/[0.16] hover:border-emerald-500/50 bg-slate-50 dark:bg-[#121319] hover:bg-slate-100 dark:hover:bg-[#161722] rounded-xl p-6 cursor-pointer transition-all text-center">
                  <UploadCloud size={24} className="text-emerald-600 dark:text-emerald-400 mb-2" strokeWidth={1.8} />
                  <p className="font-semibold text-slate-900 dark:text-white text-xs">Click to select PDF, DOCX, or TXT resumes</p>
                  <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">Select single or multiple candidate resume files</p>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.docx,.doc,.txt,.xlsx,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setModalUploadFiles(files);
                    }}
                  />
                </label>

                {/* File List Badges */}
                {modalUploadFiles.length > 0 && (
                  <div className="space-y-1.5 pt-2 max-h-32 overflow-y-auto custom-scrollbar">
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono font-semibold">
                      {modalUploadFiles.length} file(s) selected:
                    </p>
                    {modalUploadFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between bg-slate-100 dark:bg-[#181920] border border-slate-200 dark:border-white/[0.08] px-3 py-1.5 rounded-lg text-[11px] text-slate-800 dark:text-gray-200">
                        <span className="truncate max-w-[320px] font-mono">{file.name}</span>
                        <span className="text-slate-500 dark:text-gray-500 font-mono text-[10px]">{(file.size / 1024).toFixed(1)} KB</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Experience Years (Optional) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800 dark:text-gray-200">
                  Experience Years <span className="text-slate-400 dark:text-gray-500 font-normal">(Optional e.g. 3 or 5.5 — leave blank to auto-detect with AI)</span>
                </label>
                <input
                  type="text"
                  value={modalExpYears}
                  onChange={(e) => setModalExpYears(e.target.value)}
                  placeholder="e.g. 3 or 5.5 (Optional)"
                  className="w-full bg-slate-50 dark:bg-[#121319] border border-slate-200 dark:border-white/[0.14] rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              {/* Extra Info / Candidate Notes (Optional) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800 dark:text-gray-200">
                  Extra Info / Candidate Notes <span className="text-slate-400 dark:text-gray-500 font-normal">(Optional — will be parsed WITH PDF data)</span>
                </label>
                <textarea
                  rows={3}
                  value={modalExtraNotes}
                  onChange={(e) => setModalExtraNotes(e.target.value)}
                  placeholder="Enter candidate bio, extra skills, recruiter notes, past performance, or details to combine with PDF parsing..."
                  className="w-full bg-slate-50 dark:bg-[#121319] border border-slate-200 dark:border-white/[0.14] rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-emerald-500 resize-y"
                />
                
                <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-[11px]">
                  <span>💡 Any text entered here will be combined with the extracted PDF/DOCX text before AI extraction.</span>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-[#0e0e12]">
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setModalUploadFiles([]);
                  setModalExpYears('');
                  setModalExtraNotes('');
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white bg-slate-200/50 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.1] transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                disabled={modalUploadFiles.length === 0 || uploading}
                onClick={async () => {
                  if (modalUploadFiles.length === 0) return;
                  const filesToProcess = modalUploadFiles;
                  const expToApply = modalExpYears;
                  const notesToApply = modalExtraNotes;
                  setShowUploadModal(false);
                  setModalUploadFiles([]);
                  setModalExpYears('');
                  setModalExtraNotes('');
                  await processResumeFiles(filesToProcess, expToApply, notesToApply);
                }}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-md ${
                  modalUploadFiles.length > 0 && !uploading
                    ? 'bg-emerald-600 dark:bg-emerald-500 text-white dark:text-black hover:bg-emerald-500 dark:hover:bg-emerald-400 cursor-pointer'
                    : 'bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-gray-500 border border-slate-300 dark:border-white/10 cursor-not-allowed'
                }`}
              >
                <UploadCloud size={15} />
                <span>{uploading ? 'Processing...' : 'Upload & Process'}</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
