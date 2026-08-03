import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, deleteDoc, doc, updateDoc, arrayUnion, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, Sparkles } from 'lucide-react';

import { Interview } from '../types';
import { useMessageBox } from '../components/MessageBox';
import { createPortal } from 'react-dom';
import { sendInterviewInvitations } from '../services/brevoService';
import { sendWhatsAppMessage, sendInterviewWhatsAppInvite, buildWhatsAppInviteText, openWhatsAppWebInvite, formatPhoneForWhatsApp } from '../services/waSenderService';

import EditJobModal from './EditJob';

import { evaluateResumeMatch } from '../services/api';
import { ingestResumeFile, saveResumeDumpCandidate } from '../services/resumeService';
import { parseCandidateDocument } from '../services/candidateFileParser';
import { logTeamActivity } from '../services/auditService';
import { useCompanyRateLimits } from '../hooks/useRecruiterRateLimits';
import { getRateLimitReachedMessage, isRateLimitReached } from '../services/rateLimitService';

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

const toMillis = (value: TimestampLike): number => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch;
      return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
};

const formatDate = (value: TimestampLike, options?: Intl.DateTimeFormatOptions): string => {
  const millis = toMillis(value);
  if (!millis) return 'Open';
  return new Date(millis).toLocaleDateString('en-US', options || { month: 'short', day: 'numeric' });
};

const getInterviewDeadline = (interview: Interview): TimestampLike => {
  const job = interview as Interview & { deadline?: TimestampLike; applyDeadline?: TimestampLike };
  return job.deadline || job.applyDeadline;
};

const getInterviewStatus = (interview: Interview) => {
  const deadlineMillis = toMillis(getInterviewDeadline(interview));
  const deadlineEnd = deadlineMillis ? new Date(deadlineMillis) : null;
  if (deadlineEnd) deadlineEnd.setHours(23, 59, 59, 999);
  const isExpired = deadlineEnd ? deadlineEnd.getTime() < Date.now() : false;

  return isExpired
    ? {
        label: 'Expired',
        dotClass: 'bg-[#ff6b6b]',
        pillClass: 'border-[#3f1d1d] bg-[#180707] text-[#ff8f8f]',
      }
    : {
        label: 'Active',
        dotClass: 'bg-[#50e3c2]',
        pillClass: 'border-[#123b2a] bg-[#071a12] text-[#83d0a3]',
    };
};

const ButtonBusySkeleton = ({ className = 'bg-current/25' }: { className?: string }) => (
  <span className={`inline-block h-3 w-16 animate-pulse rounded-[4px] ${className}`} aria-hidden="true" />
);

export const RecruiterInterviewsSkeleton = () => (
  <div className="-mx-4 -my-8 flex h-[calc(100vh-3.5rem)] min-h-0 flex-col overflow-hidden bg-[#000] text-white sm:-mx-6 lg:-mx-8 animate-pulse">
    <section className="shrink-0 border-b border-white/[0.11] bg-[#000]">
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-7 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="h-8 w-24 rounded-[6px] bg-white/[0.04]" />
          <div className="h-7 w-48 rounded-[6px] bg-white/[0.04] mt-3" />
          <div className="h-4 w-64 rounded-[6px] bg-white/[0.04] mt-2" />
        </div>
        <div className="h-8 w-32 rounded-[6px] bg-white/[0.04]" />
      </div>
    </section>

    <section className="grid shrink-0 grid-cols-2 border-b border-white/[0.11] lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="border-r border-white/[0.11] px-4 py-4 last:border-r-0 sm:px-6 lg:px-7">
          <div className="h-3 w-12 rounded bg-white/[0.04]" />
          <div className="h-6 w-16 rounded bg-white/[0.04] mt-2" />
        </div>
      ))}
    </section>

    <section className="shrink-0 border-b border-white/[0.11]">
      <div className="flex flex-col gap-3 px-4 py-3 sm:px-6 lg:px-7 xl:flex-row xl:items-center xl:justify-between">
        <div className="h-9 w-full xl:max-w-xs rounded-[6px] bg-white/[0.04]" />
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-9 w-28 rounded-[6px] bg-white/[0.04]" />
          <div className="h-9 w-48 rounded-[6px] bg-white/[0.04]" />
        </div>
      </div>
    </section>

    <section className="flex min-h-0 flex-1 flex-col">
      <div className="hidden shrink-0 items-center gap-4 border-b border-white/[0.11] px-4 py-3 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_100px_120px_100px_100px_100px_100px] lg:px-7">
        <div className="h-3 w-16 rounded bg-white/[0.04]" />
        <div className="h-3 w-12 rounded bg-white/[0.04] mx-auto" />
        <div className="h-3 w-16 rounded bg-white/[0.04] mx-auto" />
        <div className="h-3 w-16 rounded bg-white/[0.04] mx-auto" />
        <div className="h-3 w-12 rounded bg-white/[0.04] mx-auto" />
        <div className="h-3 w-12 rounded bg-white/[0.04] mx-auto" />
        <div className="h-3 w-12 rounded bg-white/[0.04] ml-auto" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {[...Array(8)].map((_, idx) => (
          <div
            key={idx}
            className="grid gap-3 border-b border-white/[0.08] px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_100px_120px_100px_100px_100px_100px] lg:items-center lg:gap-4 lg:px-7"
          >
            <div className="space-y-2">
              <div className="h-4 w-40 rounded bg-white/[0.04]" />
              <div className="h-3 w-20 rounded bg-white/[0.04]" />
            </div>
            <div className="h-4 w-12 rounded bg-white/[0.04] mx-auto" />
            <div className="h-5 w-16 rounded bg-white/[0.04] mx-auto" />
            <div className="h-4 w-16 rounded bg-white/[0.04] mx-auto" />
            <div className="h-4 w-16 rounded bg-white/[0.04] mx-auto" />
            <div className="h-4 w-12 rounded bg-white/[0.04] mx-auto" />
            <div className="h-8 w-20 rounded bg-white/[0.04] ml-auto" />
          </div>
        ))}
      </div>
    </section>
  </div>
);

function getAISuggestedCandidatesForJob(job: any, candidates: any[], alreadyInvitedEmails: string[]) {
  if (!job || !candidates || candidates.length === 0) return [];

  const jobTitle = (job.title || job.jobRole || '').toLowerCase();

  let jobSkills: string[] = [];
  if (Array.isArray(job.requiredSkills)) {
    jobSkills = job.requiredSkills.map((s: any) => String(s).toLowerCase().trim());
  } else if (typeof job.requiredSkills === 'string') {
    jobSkills = job.requiredSkills.split(',').map((s: string) => s.toLowerCase().trim()).filter(Boolean);
  } else if (Array.isArray(job.skills)) {
    jobSkills = job.skills.map((s: any) => String(s).toLowerCase().trim());
  }

  const jobDescText = (job.description || job.jdText || job.jobDescription || '').toLowerCase();
  const normalizedInvited = (alreadyInvitedEmails || []).map(e => e.toLowerCase().trim());

  return candidates
    .filter(c => {
      const email = (c.email || '').toLowerCase().trim();
      const phone = (c.phone || '').trim();
      const pseudoEmail = phone ? `${phone.replace(/[^0-9]/g, '')}@whatsapp.local` : '';
      if (normalizedInvited.includes(email) || (pseudoEmail && normalizedInvited.includes(pseudoEmail))) {
        return false;
      }
      return true;
    })
    .map(candidate => {
      const candSkills = (candidate.skills || []).map((s: any) => String(s).toLowerCase().trim());
      const candTitle = (candidate.currentTitle || candidate.sourceJobTitle || candidate.title || '').toLowerCase().trim();
      const candText = `${candidate.summary || ''} ${candidate.resumeText || ''}`.toLowerCase();

      let skillScore = 0;
      if (jobSkills.length > 0) {
        let matchCount = 0;
        jobSkills.forEach(js => {
          if (candSkills.some((cs: string) => cs.includes(js) || js.includes(cs)) || candText.includes(js)) {
            matchCount++;
          }
        });
        skillScore = (matchCount / jobSkills.length) * 100;
      } else {
        let matchCount = 0;
        candSkills.forEach((cs: string) => {
          if (jobTitle.includes(cs) || jobDescText.includes(cs)) matchCount++;
        });
        skillScore = Math.min(100, matchCount * 25);
      }

      let titleScore = 0;
      if (candTitle && jobTitle) {
        if (candTitle === jobTitle || jobTitle.includes(candTitle) || candTitle.includes(jobTitle)) {
          titleScore = 100;
        } else {
          const titleWords = jobTitle.split(/\s+/).filter((w: string) => w.length > 3);
          const matchedWords = titleWords.filter((w: string) => candTitle.includes(w));
          if (titleWords.length > 0) {
            titleScore = (matchedWords.length / titleWords.length) * 80;
          }
        }
      }

      const matchScore = Math.round(Math.min(100, Math.max(20, (skillScore * 0.7) + (titleScore * 0.3))));

      return {
        id: candidate.id,
        name: candidate.name || 'Candidate',
        email: candidate.email || (candidate.phone ? `${candidate.phone.replace(/[^0-9]/g, '')}@whatsapp.local` : ''),
        phone: candidate.phone || 'N/A',
        experience: candidate.totalExperienceYears !== undefined && candidate.totalExperienceYears !== null
          ? `${candidate.totalExperienceYears} yrs`
          : 'N/A',
        skills: candidate.skills || [],
        matchScore
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}

const RecruiterInterviews: React.FC = () => {
  const { user, userProfile } = useAuth();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualExp, setManualExp] = useState('');
  const [newEmails, setNewEmails] = useState<string[]>([]);
  const [parsedCandidates, setParsedCandidates] = useState<{email: string, phone: string, name?: string, experience?: string, matchScore?: string}[]>([]);
  const [submissionsMap, setSubmissionsMap] = useState<Record<string, any[]>>({});
  const [parsingResumes, setParsingResumes] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [editingCandidateEmail, setEditingCandidateEmail] = useState<string | null>(null);
  const [editedEmailValue, setEditedEmailValue] = useState('');
  const [editedPhoneValue, setEditedPhoneValue] = useState('');
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const [remindingInterviewId, setRemindingInterviewId] = useState<string | null>(null);
  const [whatsappModal, setWhatsappModal] = useState<{
      isOpen: boolean;
      email: string;
      phone: string;
      message: string;
      interview: Interview;
  } | null>(null);

  // AI Single Candidate Resume Upload & Suggestion State
  const [inviteMode, setInviteMode] = useState<'single' | 'bulk' | 'invited' | 'ai_suggest'>('single');
  const [dumpCandidates, setDumpCandidates] = useState<any[]>([]);
  const [loadingDumpCandidates, setLoadingDumpCandidates] = useState(false);

  const [selectedResumeFile, setSelectedResumeFile] = useState<File | null>(null);
  const [resumeExtraText, setResumeExtraText] = useState('');
  const [analyzingResumeAI, setAnalyzingResumeAI] = useState(false);

  useEffect(() => {
    if (!selectedInterview || !user) return;
    setLoadingDumpCandidates(true);
    const teamId = userProfile?.teamId || userProfile?.parentRecruiterId || user.uid;
    const q = teamId
      ? query(collection(db, 'resumeDumpCandidates'), where('teamId', '==', teamId))
      : query(collection(db, 'resumeDumpCandidates'), where('recruiterUID', '==', user.uid));

    getDocs(q).then((snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDumpCandidates(list);
    }).catch((err) => {
      console.error("Error fetching candidates for AI suggestions:", err);
    }).finally(() => {
      setLoadingDumpCandidates(false);
    });
  }, [selectedInterview, user, userProfile]);

  const aiSuggestedCandidates = React.useMemo(() => {
    if (!selectedInterview) return [];
    const alreadyInvited = selectedInterview.candidateEmails || [];
    return getAISuggestedCandidatesForJob(selectedInterview, dumpCandidates, alreadyInvited);
  }, [selectedInterview, dumpCandidates]);




  const handleAnalyzeAndSaveResumeCandidate = async () => {
    if (!selectedResumeFile || !user || !selectedInterview) {
      messageBox.showError("Please select a candidate resume file first.");
      return;
    }

    setAnalyzingResumeAI(true);
    try {
      const { profile, resumeText, resumeUrl } = await ingestResumeFile(
        selectedResumeFile,
        {},
        '',
        resumeExtraText
      );

      if (manualExp.trim()) {
        const parsedExpNum = parseFloat(manualExp.trim());
        if (!isNaN(parsedExpNum)) {
          profile.totalExperienceYears = parsedExpNum;
        }
      }

      await saveResumeDumpCandidate({
        recruiterUID: user.uid,
        teamId: userProfile?.teamId || userProfile?.parentRecruiterId || user.uid,
        createdBy: {
          uid: user.uid,
          name: userProfile?.name || user?.displayName || 'Recruiter',
          email: user.email || '',
          role: userProfile?.role || 'recruiter',
        },
        profile,
        resumeText,
        resumeUrl,
        fileName: selectedResumeFile.name,
        mimeType: selectedResumeFile.type,
        fileSize: selectedResumeFile.size,
        additionalText: resumeExtraText.trim(),
        source: 'interview_creation',
        sourceInterviewId: selectedInterview.id,
        sourceJobTitle: selectedInterview.title,
      });

      const candidateEmail = (profile.email || '').toLowerCase().trim();
      const candExpText = profile.totalExperienceYears !== undefined && profile.totalExperienceYears !== null
        ? `${profile.totalExperienceYears} yrs`
        : 'N/A';

      if (candidateEmail) {
        if (!newEmails.includes(candidateEmail)) {
          setNewEmails(prev => [...prev, candidateEmail]);
          setParsedCandidates(prev => [...prev, {
            email: candidateEmail,
            phone: profile.phone || 'N/A',
            name: profile.name || 'Candidate',
            experience: candExpText,
            matchScore: 'N/A'
          }]);
        }
        messageBox.showSuccess(
          `✅ Candidate "${profile.name || candidateEmail}" (${candExpText} Exp) analyzed using AI, saved to Resume Dump, and added to invite list!`
        );
      } else if (profile.phone) {
        const pseudoEmail = `${profile.phone.replace(/[^0-9]/g, '')}@whatsapp.local`;
        if (!newEmails.includes(pseudoEmail)) {
          setNewEmails(prev => [...prev, pseudoEmail]);
          setParsedCandidates(prev => [...prev, {
            email: pseudoEmail,
            phone: profile.phone,
            name: profile.name || 'Candidate',
            experience: candExpText,
            matchScore: 'N/A'
          }]);
        }
        messageBox.showSuccess(
          `✅ Candidate "${profile.name || 'Candidate'}" (Phone: ${profile.phone}, ${candExpText} Exp) analyzed using AI, saved to Resume Dump, and added to invite list!`
        );
      } else {
        messageBox.showSuccess(
          `✅ Candidate "${profile.name || 'Candidate'}" analyzed using AI and saved to Resume Dump!`
        );
      }

      setSelectedResumeFile(null);
      setResumeExtraText('');
      setManualExp('');
    } catch (err: any) {
      console.error("Error analyzing candidate resume:", err);
      messageBox.showError(`AI extraction failed: ${err.message || 'Failed to analyze candidate resume.'}`);
    } finally {
      setAnalyzingResumeAI(false);
    }
  };



  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'expired'>('active');
  const [selectedDept, setSelectedDept] = useState('All');
  const [dateMode, setDateMode] = useState<'range' | 'specific'>('range');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [specificDate, setSpecificDate] = useState('');

  // Full Screen View Modals
  const [fullJdModal, setFullJdModal] = useState<{ isOpen: boolean; title: string; description: string } | null>(null);
  const [fullRosterModal, setFullRosterModal] = useState<{ isOpen: boolean; interview: Interview } | null>(null);

  const messageBox = useMessageBox();
  const navigate = useNavigate();
  const { status: rateLimitStatus } = useCompanyRateLimits();
  const interviewLimitReached = isRateLimitReached(rateLimitStatus, 'interviews');
  const actionButtonClass = 'geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white';

  useEffect(() => {
    if (!user) {
        setLoading(false);
        return;
    };

    setLoading(true);
    const teamId = userProfile?.teamId || userProfile?.parentRecruiterId || user.uid;
    const interviewsQuery = teamId
      ? query(collection(db, 'interviews'), where('teamId', '==', teamId))
      : query(collection(db, 'interviews'), where('recruiterUID', '==', user.uid));

    const unsubscribe = onSnapshot(interviewsQuery, async (querySnapshot) => {
      const interviewsData = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Interview))
        .filter(interview => (interview as any).isMock !== true)
        .sort((a, b) => {
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0;
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0;
          return timeB - timeA;
        });
      setInterviews(interviewsData);
      
      const newSubmissionsMap: Record<string, any[]> = {};
      for (const interview of interviewsData) {
         try {
             const qs = await getDocs(collection(db, 'interviews', interview.id, 'attempts'));
             newSubmissionsMap[interview.id] = qs.docs.map(d => ({ id: d.id, ...d.data() }));
         } catch (e) {
             console.error("Error fetching submissions for", interview.id, e);
             newSubmissionsMap[interview.id] = [];
         }
      }
      setSubmissionsMap(newSubmissionsMap);
      setLoading(false);
    }, (err) => {
        console.error("Error fetching interviews:", err);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleDelete = (interviewId: string) => {
    messageBox.showConfirm("Are you sure you want to delete this interview?", async () => {
      try {
        await deleteDoc(doc(db, 'interviews', interviewId));
      } catch (err) {
        messageBox.showError("Error deleting interview");
      }
    });
  };

  const openInviteModal = (interview: Interview) => {
    setSelectedInterview(interview);
    setIsInviteModalOpen(true);
  };

  const handleRemoveNewEmail = (emailToRemove: string) => {
      setNewEmails(newEmails.filter(email => email !== emailToRemove));
  };

  const [sendingProgressMsg, setSendingProgressMsg] = useState('');

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    setParsingResumes(true);
    const newCandidatesFound: {email: string, phone: string, name?: string, matchScore?: string}[] = [];
    let filesProcessed = 0;
    let filesWithErrors = 0;

    for (const f of Array.from(files)) {
      const file = f as File;
      try {
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
          const extracted = await parseCandidateDocument(file);
          for (const cand of extracted) {
            const lowerEmail = (cand.email || '').toLowerCase();
            const phone = cand.phone || 'N/A';
            const name = cand.name || 'Candidate';

            if (lowerEmail && !(selectedInterview?.candidateEmails || []).includes(lowerEmail) && !newEmails.includes(lowerEmail)) {
              if (!newCandidatesFound.some(c => c.email === lowerEmail)) {
                newCandidatesFound.push({ email: lowerEmail, phone, name, matchScore: 'N/A' });
              }
            } else if (phone && phone !== 'N/A') {
              const pseudoEmail = `${phone.replace(/[^0-9]/g, '')}@whatsapp.local`;
              if (!newEmails.includes(pseudoEmail) && !newCandidatesFound.some(c => c.phone === phone)) {
                newCandidatesFound.push({ email: pseudoEmail, phone, name, matchScore: 'N/A' });
              }
            }
          }
        } else {
          const ingested = await ingestResumeFile(file);
          const lowerEmail = (ingested.profile.email || '').toLowerCase();
          const phone = ingested.profile.phone || 'N/A';
          const name = ingested.profile.name || 'Candidate';

          await saveResumeDumpCandidate({
            recruiterUID: user.uid,
            profile: ingested.profile,
            resumeText: ingested.resumeText,
            resumeUrl: ingested.resumeUrl,
            fileName: file.name,
            mimeType: file.type,
            fileSize: file.size,
            source: 'interview_creation',
            sourceInterviewId: selectedInterview?.id || '',
            sourceJobTitle: selectedInterview?.title || '',
          });

          if (lowerEmail) {
            if (!(selectedInterview?.candidateEmails || []).includes(lowerEmail) && !newEmails.includes(lowerEmail)) {
              let matchScore = "N/A";
              if (selectedInterview && ingested.resumeText.length > 50) {
                try {
                  matchScore = await evaluateResumeMatch(
                    selectedInterview.title, 
                    selectedInterview.description, 
                    ingested.resumeText,
                    {
                      education: (selectedInterview as any).education,
                      gender: (selectedInterview as any).gender || (selectedInterview as any).genderRequirement
                    }
                  );
                } catch (err) {
                  console.error('Match score error:', err);
                }
              }
              
              if (!newCandidatesFound.some(c => c.email === lowerEmail)) {
                newCandidatesFound.push({ email: lowerEmail, phone, name, matchScore });
              }
            }
          }
        }
        filesProcessed++;
      } catch (error) {
        console.error(`Error parsing ${file.name}:`, error);
        filesWithErrors++;
      }
    }

    if (newCandidatesFound.length > 0) {
      setNewEmails(prev => [...prev, ...newCandidatesFound.map(c => c.email)]);
      setParsedCandidates(prev => [...prev, ...newCandidatesFound]);
    }
    
    messageBox.showInfo(`Processed ${filesProcessed} file(s). Found ${newCandidatesFound.length} new candidate(s). ${filesWithErrors > 0 ? `Failed to parse ${filesWithErrors} file(s).` : ''}`);
    setParsingResumes(false);
    e.target.value = '';
  };

  const handleEditAndResend = async (oldEmail: string, newEmail: string, newPhone?: string) => {
    if (!selectedInterview || (!newEmail && !newPhone)) {
        setEditingCandidateEmail(null);
        return;
    }
    
    setResendingEmail(oldEmail);
    try {
        const targetEmail = (newEmail || oldEmail).toLowerCase().trim();
        const targetPhone = (newPhone !== undefined ? newPhone : '').trim();

        // 1. Update candidateEmails array
        const updatedEmails = (selectedInterview.candidateEmails || []).filter(e => e.toLowerCase() !== oldEmail.toLowerCase());
        if (!updatedEmails.includes(targetEmail)) {
          updatedEmails.push(targetEmail);
        }

        // 2. Update candidateData array with phone number
        const currentCandData = (selectedInterview as any).candidateData || [];
        let updatedCandData = [...currentCandData];
        const idx = updatedCandData.findIndex((c: any) => c.email && c.email.toLowerCase() === oldEmail.toLowerCase());
        
        if (idx > -1) {
          updatedCandData[idx] = {
            ...updatedCandData[idx],
            email: targetEmail,
            phone: targetPhone || updatedCandData[idx].phone || 'N/A'
          };
        } else {
          updatedCandData.push({
            email: targetEmail,
            name: targetEmail.split('@')[0] || 'Candidate',
            phone: targetPhone || 'N/A',
            matchScore: 'N/A'
          });
        }

        const updatePayload = {
          candidateEmails: updatedEmails,
          candidateData: updatedCandData,
          updatedAt: new Date()
        };

        await Promise.all([
          updateDoc(doc(db, 'interviews', selectedInterview.id), updatePayload).catch(() => {}),
          updateDoc(doc(db, 'jobs', selectedInterview.id), updatePayload).catch(() => {})
        ]);

        
        setSelectedInterview({
          ...selectedInterview,
          candidateEmails: updatedEmails,
          candidateData: updatedCandData
        } as any);

        const result = await sendInterviewInvitations(
            [targetEmail],
            selectedInterview.title,
            selectedInterview.interviewLink || '',
            selectedInterview.accessCode,
            false,
            {
              gender: (selectedInterview as any).gender || (selectedInterview as any).genderRequirement,
              location: (selectedInterview as any).location,
              education: (selectedInterview as any).education || (selectedInterview as any).qualification,
              qualification: (selectedInterview as any).qualification || (selectedInterview as any).education,
              experience: (selectedInterview as any).experience || (selectedInterview as any).experienceRequired,
              salary: (selectedInterview as any).salary || (selectedInterview as any).salaryRange,
              recruiterName: userProfile?.name || (user as any)?.displayName || (selectedInterview as any).createdBy?.name || 'Recruitment Team',
              recruiterPhone: (userProfile as any)?.phone || (userProfile as any)?.phoneNumber || (userProfile as any)?.contactNumber || (user as any)?.phoneNumber || ''
            }
        );

        if (result.success) {
            messageBox.showSuccess(`✅ Candidate contact updated (Email: ${targetEmail}, Contact: ${targetPhone || 'N/A'}) & invite resent!`);
        } else {
            messageBox.showSuccess(`✅ Candidate contact updated (Email: ${targetEmail}, Contact: ${targetPhone || 'N/A'})!`);
        }
    } catch (error: any) {
        console.error('Edit & Resend error:', error);
        messageBox.showError('Failed to update candidate contact details.');
    } finally {
        setResendingEmail(null);
        setEditingCandidateEmail(null);
        setEditedEmailValue('');
        setEditedPhoneValue('');
    }
  };

  const handleResend = async (email: string) => {
    if (!selectedInterview) return;
    setResendingEmail(email);
    try {
        const result = await sendInterviewInvitations(
            [email],
            selectedInterview.title,
            selectedInterview.interviewLink || '',
            selectedInterview.accessCode,
            false,
            {
              gender: (selectedInterview as any).gender || (selectedInterview as any).genderRequirement,
              location: (selectedInterview as any).location,
              education: (selectedInterview as any).education || (selectedInterview as any).qualification,
              qualification: (selectedInterview as any).qualification || (selectedInterview as any).education,
              experience: (selectedInterview as any).experience || (selectedInterview as any).experienceRequired,
              salary: (selectedInterview as any).salary || (selectedInterview as any).salaryRange,
              recruiterName: userProfile?.name || (user as any)?.displayName || (selectedInterview as any).createdBy?.name || 'Recruitment Team',
              recruiterPhone: (userProfile as any)?.phone || (userProfile as any)?.phoneNumber || (userProfile as any)?.contactNumber || (user as any)?.phoneNumber || ''
            }
        );

        if (result.success) {
            messageBox.showSuccess(`Invitation resent to ${email}!`);
        } else {
            messageBox.showError(`Failed to resend email: ${result.error}`);
        }
    } catch (error: any) {
        console.error('Resend error:', error);
        messageBox.showError('Failed to resend invitation.');
    } finally {
        setResendingEmail(null);
    }
  };

  const handleSendWhatsAppReminder = async (candidateEmail: string, candidatePhone?: string) => {
    if (!selectedInterview) return;

    const candData = ((selectedInterview as any).candidateData || []).find(
      (c: any) => c.email && c.email.toLowerCase() === candidateEmail.toLowerCase()
    );
    const rawPhone = candidatePhone || candData?.phone || parsedCandidates.find(c => c.email.toLowerCase() === candidateEmail.toLowerCase())?.phone || '';
    const formattedPhone = formatPhoneForWhatsApp(rawPhone);

    const recruiterName = userProfile?.name || userProfile?.displayName || userProfile?.fullName || (user as any)?.displayName || (selectedInterview as any).createdBy?.name || user?.email?.split('@')[0] || 'Recruiter';
    const recruiterPhone = userProfile?.phone || userProfile?.phoneNumber || userProfile?.contactNumber || userProfile?.mobile || userProfile?.mobileNumber || userProfile?.whatsappPhone || (user as any)?.phoneNumber || '';

    const inviteOptions = {
      gender: (selectedInterview as any).gender || (selectedInterview as any).genderRequirement,
      location: (selectedInterview as any).location,
      education: (selectedInterview as any).education || (selectedInterview as any).qualification,
      qualification: (selectedInterview as any).qualification || (selectedInterview as any).education,
      experience: (selectedInterview as any).experience || (selectedInterview as any).experienceRequired,
      salary: (selectedInterview as any).salary || (selectedInterview as any).salaryRange,
      recruiterName,
      recruiterPhone,
      whatsappSessionId: userProfile?.whatsappSessionId || '',
      whatsappSessionPasscode: userProfile?.whatsappSessionPasscode || ''
    };

    const messageText = buildWhatsAppInviteText({
      candidateName: candidateEmail.split('@')[0] || 'Candidate',
      jobTitle: selectedInterview.title,
      interviewLink: selectedInterview.interviewLink || `${window.location.origin}/#/interview/${selectedInterview.id}`,
      accessCode: selectedInterview.accessCode || '',
      isReminder: true,
      options: inviteOptions
    });

    if (!formattedPhone) {
      messageBox.showError(`Phone number missing for ${candidateEmail}. Please click the edit icon to add candidate mobile number.`);
      return;
    }

    setResendingEmail(candidateEmail);
    try {
      const res = await sendInterviewWhatsAppInvite({
        phone: formattedPhone,
        candidateName: candidateEmail.split('@')[0] || 'Candidate',
        jobTitle: selectedInterview.title,
        interviewLink: selectedInterview.interviewLink || `${window.location.origin}/#/interview/${selectedInterview.id}`,
        accessCode: selectedInterview.accessCode || '',
        isReminder: true,
        options: inviteOptions
      });


      if (res.success) {
        messageBox.showSuccess(`✅ WhatsApp reminder sent to ${formattedPhone}!`);
      } else {
        messageBox.showInfo(`Opening WhatsApp Web for ${formattedPhone}...`);
        openWhatsAppWebInvite(formattedPhone, messageText);
      }
    } catch (err) {
      console.error("WhatsApp reminder error:", err);
      openWhatsAppWebInvite(formattedPhone, messageText);
    } finally {
      setResendingEmail(null);
    }
  };


  const handleAllowReattempt = async (interviewId: string, attemptId: string, currentAllowValue: boolean) => {
    try {
        const attemptRef = doc(db, 'interviews', interviewId, 'attempts', attemptId);
        await updateDoc(attemptRef, {
            allowReattempt: !currentAllowValue
        });
        messageBox.showSuccess(!currentAllowValue ? "Reattempt permission granted!" : "Reattempt permission removed.");
    } catch (err: any) {
        console.error("Error updating reattempt status:", err);
        messageBox.showError("Failed to update reattempt status.");
    }
  };

  const handleSendBulkReminders = async (interview: Interview) => {
    const explicitEmails = (interview.candidateEmails || []).map(e => e.toLowerCase());
    const submissions = submissionsMap[interview.id] || [];
    const pendingEmails = explicitEmails.filter(email => {
        return !submissions.some(sub => (sub.candidateInfo?.email || '').toLowerCase() === email);
    });

    if (pendingEmails.length === 0) {
        messageBox.showInfo('No pending candidates found. Everyone invited has already submitted.');
        return;
    }

    setRemindingInterviewId(interview.id);
    try {
        const result = await sendInterviewInvitations(
            pendingEmails,
            interview.title,
            interview.interviewLink || '',
            interview.accessCode,
            true,
            {
              gender: (interview as any).gender || (interview as any).genderRequirement,
              location: (interview as any).location,
              education: (interview as any).education || (interview as any).qualification,
              qualification: (interview as any).qualification || (interview as any).education,
              experience: (interview as any).experience || (interview as any).experienceRequired,
              salary: (interview as any).salary || (interview as any).salaryRange,
              recruiterName: userProfile?.name || (user as any)?.displayName || (interview as any).createdBy?.name || 'Recruitment Team',
              recruiterPhone: (userProfile as any)?.phone || (userProfile as any)?.phoneNumber || (userProfile as any)?.contactNumber || (user as any)?.phoneNumber || ''
            }
        );

        if (result.success) {
            messageBox.showSuccess(`Sent reminder to ${result.totalEmails} candidate(s)!`);
        } else {
            messageBox.showError(`Failed to send reminders: ${result.error}`);
        }
    } catch (error: any) {
        console.error('Bulk reminder error:', error);
        messageBox.showError('Failed to send reminders.');
    } finally {
        setRemindingInterviewId(null);
    }
  };

  const handleSendInvites = async () => {
    if (!selectedInterview || (newEmails.length === 0 && parsedCandidates.length === 0)) return;
    
    setSendingEmails(true);
    setSendingProgressMsg('Preparing candidate invitations...');

    try {
        const candidateDataToAdd = newEmails.map(email => {
            const parsed = parsedCandidates.find(c => c.email.toLowerCase() === email.toLowerCase());
            return {
                email: email.toLowerCase(),
                name: (parsed as any)?.name || 'Candidate',
                phone: parsed?.phone || 'N/A',
                matchScore: parsed?.matchScore || 'N/A'
            };
        });

        const validEmails = newEmails.filter(e => !e.endsWith('@whatsapp.local'));

        const inviteUpdatePayload = { 
            candidateEmails: validEmails.length > 0 ? arrayUnion(...validEmails) : arrayUnion(),
            candidateData: arrayUnion(...candidateDataToAdd),
            updatedAt: new Date()
        };

        await Promise.all([
          updateDoc(doc(db, 'interviews', selectedInterview.id), inviteUpdatePayload).catch(() => {}),
          updateDoc(doc(db, 'jobs', selectedInterview.id), inviteUpdatePayload).catch(() => {})
        ]);

        
        let emailCount = 0;
        if (validEmails.length > 0) {
            setSendingProgressMsg(`Sending ${validEmails.length} invitation email(s)...`);
            const result = await sendInterviewInvitations(
                validEmails,
                selectedInterview.title,
                selectedInterview.interviewLink || '',
                selectedInterview.accessCode,
                false,
                {
                  gender: (selectedInterview as any).gender || (selectedInterview as any).genderRequirement,
                  location: (selectedInterview as any).location,
                  education: (selectedInterview as any).education || (selectedInterview as any).qualification,
                  qualification: (selectedInterview as any).qualification || (selectedInterview as any).education,
                  experience: (selectedInterview as any).experience || (selectedInterview as any).experienceRequired,
                  salary: (selectedInterview as any).salary || (selectedInterview as any).salaryRange,
                  recruiterName: userProfile?.name || (user as any)?.displayName || (selectedInterview as any).createdBy?.name || 'Recruiting Team',
                  recruiterPhone: (userProfile as any)?.phone || (userProfile as any)?.phoneNumber || (userProfile as any)?.contactNumber || (user as any)?.phoneNumber || ''
                }
            );
            if (result.success) emailCount = result.totalEmails;
        }

        let waCount = 0;
        const candidatesWithPhones = parsedCandidates.filter(c => c.phone && c.phone !== 'N/A');
        if (candidatesWithPhones.length > 0) {
            setSendingProgressMsg(`Sending WhatsApp invites one-by-one with 10s anti-spam delay...`);
            const waResult = await sendBulkWhatsAppInvites(
                candidatesWithPhones,
                selectedInterview.title,
                selectedInterview.interviewLink || '',
                selectedInterview.accessCode,
                false,
                (sentCount, totalCount, currentCandidate, isWaiting) => {
                    if (isWaiting) {
                        setSendingProgressMsg(`⏳ Sent WhatsApp to ${currentCandidate} (${sentCount}/${totalCount}). Waiting 10s delay to protect WhatsApp number...`);
                    } else {
                        setSendingProgressMsg(`📱 Sending WhatsApp invite ${sentCount}/${totalCount} to ${currentCandidate}...`);
                    }
                },
                {
                  gender: (selectedInterview as any).gender || (selectedInterview as any).genderRequirement,
                  location: (selectedInterview as any).location,
                  education: (selectedInterview as any).education || (selectedInterview as any).qualification,
                  qualification: (selectedInterview as any).qualification || (selectedInterview as any).education,
                  experience: (selectedInterview as any).experience || (selectedInterview as any).experienceRequired,
                  salary: (selectedInterview as any).salary || (selectedInterview as any).salaryRange,
                  recruiterName: userProfile?.name || (user as any)?.displayName || (selectedInterview as any).createdBy?.name || 'Recruiting Team',
                  recruiterPhone: (userProfile as any)?.phone || (userProfile as any)?.phoneNumber || (userProfile as any)?.contactNumber || (user as any)?.phoneNumber || '',
                  whatsappSessionId: userProfile?.whatsappSessionId || '',
                  whatsappSessionPasscode: userProfile?.whatsappSessionPasscode || ''
                }
            );
            if (waResult.success) waCount = waResult.totalSent;
        }

        messageBox.showSuccess(`Invitations sent: ${emailCount > 0 ? `${emailCount} Email(s)` : ''}${emailCount > 0 && waCount > 0 ? ' & ' : ''}${waCount > 0 ? `${waCount} WhatsApp invite(s)` : ''}!`);
        
        const primaryUid = userProfile?.parentRecruiterId || userProfile?.teamId || user?.uid || '';
        if (primaryUid) {
          const candidateSummary = candidateDataToAdd.map(c => {
            const phonePart = c.phone && c.phone !== 'N/A' ? ` (${c.phone})` : '';
            return `${c.email}${phonePart}`;
          }).join(', ');

          const detailMsg = candidateDataToAdd.length === 1
            ? `Invited candidate ${candidateSummary} for job "${selectedInterview.title}"`
            : `Invited ${candidateDataToAdd.length} candidates [${candidateSummary}] for job "${selectedInterview.title}"`;

          logTeamActivity(
            primaryUid,
            'candidate_invited',
            detailMsg,
            {
              uid: user?.uid || '',
              name: userProfile?.name || user?.displayName || user?.email || 'Recruiter',
              email: user?.email || '',
              designation: userProfile?.designation || 'Recruiter'
            }
          );
        }

        setIsInviteModalOpen(false);
        setSelectedInterview(null);
        setNewEmails([]);
        setParsedCandidates([]);
    } catch (error: any) {
        console.error('Invite sending error:', error);
        messageBox.showError('Failed to send invitations.');
    } finally {
        setSendingEmails(false);
        setSendingProgressMsg('');
    }
  };


  if (loading) return <RecruiterInterviewsSkeleton />;

  const departments = ['All', ...Array.from(new Set(interviews.map(i => i.department).filter(Boolean)))];

  const filteredInterviews = interviews.filter(interview => {
    // 1. Search Query filter (title, department, description)
    const matchesSearch = 
      !searchQuery ||
      interview.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      interview.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      interview.description?.toLowerCase().includes(searchQuery.toLowerCase());
      
    // 2. Active / Expired filter
    const interviewStatus = getInterviewStatus(interview).label;
    const matchesStatus =
      statusFilter === 'active' ? interviewStatus === 'Active' : interviewStatus === 'Expired';

    // 3. Department filter
    const matchesDept = selectedDept === 'All' || interview.department === selectedDept;
    
    // 4. Date range or specific date filter
    let matchesDate = true;
    if (interview.createdAt) {
      const createdDate = interview.createdAt.toDate ? interview.createdAt.toDate() : new Date((interview.createdAt as any).seconds * 1000);
      const createdTime = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate()).getTime();

      if (dateMode === 'specific' && specificDate) {
        const spec = new Date(specificDate);
        const specTime = new Date(spec.getFullYear(), spec.getMonth(), spec.getDate()).getTime();
        if (createdTime !== specTime) matchesDate = false;
      } else if (dateMode === 'range') {
        if (startDate) {
          const start = new Date(startDate);
          const startTime = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
          if (createdTime < startTime) matchesDate = false;
        }
        if (endDate) {
          const end = new Date(endDate);
          const endTime = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
          if (createdTime > endTime) matchesDate = false;
        }
      }
    } else if ((dateMode === 'specific' && specificDate) || (dateMode === 'range' && (startDate || endDate))) {
      matchesDate = false;
    }
    
    return matchesSearch && matchesStatus && matchesDept && matchesDate;
  });

  const activeInterviews = interviews.filter(interview => getInterviewStatus(interview).label === 'Active').length;
  const expiredInterviews = interviews.length - activeInterviews;
  const totalResponses = Object.values(submissionsMap).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="w-full flex h-[calc(100vh-3.5rem)] min-h-0 flex-col overflow-hidden bg-[#000] text-white">


      {/* Header */}
      <section className="shrink-0 border-b border-white/[0.11] bg-[#000]">
        <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-7 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link to="/recruiter/dashboard" className="geist-caption inline-flex h-8 items-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white">
              <i className="fas fa-arrow-left text-[11px]"></i>
              <span>Dashboard</span>
            </Link>
            <h1 className="geist-page-title mt-2 text-white">My Interviews</h1>
            <p className="geist-small mt-1 text-[#8f8f8f]">Manage all your scheduled interviews.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/recruiter/interview/create"
              onClick={(event) => {
                if (!interviewLimitReached) return;
                event.preventDefault();
                messageBox.showWarning(getRateLimitReachedMessage('interviews'));
              }}
              aria-disabled={interviewLimitReached}
              className={`geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border px-3 font-medium transition-colors ${interviewLimitReached ? 'cursor-not-allowed border-red-500/30 bg-red-500/10 text-red-400' : 'border-white bg-white text-black hover:bg-[#eaeaea]'}`}
            >
              <i className="fas fa-plus text-[11px]"></i>
              <span>{interviewLimitReached ? 'Interview limit reached' : 'Create Interview'}</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Strip */}
      <section className="grid shrink-0 grid-cols-2 border-b border-white/[0.11] lg:grid-cols-4">
        <div className="border-r border-white/[0.11] px-4 py-4 sm:px-6 lg:px-7">
          <p className="geist-label uppercase text-[#6b7280]">Total</p>
          <p className="geist-metric mt-2 tabular-nums text-white">{interviews.length}</p>
        </div>
        <div className="border-r border-white/[0.11] px-4 py-4 sm:px-6 lg:px-7">
          <p className="geist-label uppercase text-[#6b7280]">Active</p>
          <p className="geist-metric mt-2 tabular-nums text-[#83d0a3]">{activeInterviews}</p>
        </div>
        <div className="border-r border-white/[0.11] px-4 py-4 sm:px-6 lg:px-7">
          <p className="geist-label uppercase text-[#6b7280]">Expired</p>
          <p className="geist-metric mt-2 tabular-nums text-[#ff8f8f]">{expiredInterviews}</p>
        </div>
        <div className="px-4 py-4 sm:px-6 lg:px-7">
          <p className="geist-label uppercase text-[#6b7280]">Responses</p>
          <p className="geist-metric mt-2 tabular-nums text-white">{totalResponses}</p>
        </div>
      </section>

      {/* Search & Filter Bar */}
      <section className="shrink-0 border-b border-white/[0.11]">
        <div className="flex flex-col gap-3 px-4 py-3 sm:px-6 lg:px-7 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-auto sm:min-w-[220px] xl:max-w-xs">
              <i className="fas fa-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-[#6b7280]"></i>
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search interviews..."
                className="geist-caption h-9 w-full rounded-[6px] border border-white/[0.11] bg-white/[0.03] pl-9 pr-3 text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-white/[0.28] focus:bg-white/[0.05]"
              />
            </div>
            <div className="flex rounded-[6px] border border-white/[0.11] bg-white/[0.03] p-0.5">
              <button
                type="button"
                onClick={() => setStatusFilter('active')}
                className={`geist-caption inline-flex h-7 items-center gap-1.5 rounded-[4px] px-3 font-medium transition-colors ${statusFilter === 'active' ? 'bg-[#071a12] text-[#83d0a3]' : 'text-[#6b7280] hover:text-[#d4d4d4]'}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${statusFilter === 'active' ? 'bg-[#50e3c2]' : 'bg-[#6b7280]'}`} />
                Active
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('expired')}
                className={`geist-caption inline-flex h-7 items-center gap-1.5 rounded-[4px] px-3 font-medium transition-colors ${statusFilter === 'expired' ? 'bg-[#180707] text-[#ff8f8f]' : 'text-[#6b7280] hover:text-[#d4d4d4]'}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${statusFilter === 'expired' ? 'bg-[#ff6b6b]' : 'bg-[#6b7280]'}`} />
                Expired
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="geist-label uppercase text-[#6b7280]">Dept</span>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="geist-caption h-9 rounded-[6px] border border-white/[0.11] bg-[#050505] px-3 text-[#d4d4d4] outline-none transition-colors focus:border-white/[0.28]"
              >
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-2 py-1">
              <div className="flex rounded-[4px] bg-white/[0.03] p-0.5">
                <button type="button" onClick={() => setDateMode('range')} className={`geist-caption px-2 py-0.5 rounded-[4px] font-medium transition-colors ${dateMode === 'range' ? 'bg-white/[0.08] text-white' : 'text-[#6b7280] hover:text-[#d4d4d4]'}`}>Range</button>
                <button type="button" onClick={() => setDateMode('specific')} className={`geist-caption px-2 py-0.5 rounded-[4px] font-medium transition-colors ${dateMode === 'specific' ? 'bg-white/[0.08] text-white' : 'text-[#6b7280] hover:text-[#d4d4d4]'}`}>Specific</button>
              </div>
              {dateMode === 'specific' ? (
                <div className="flex items-center gap-1.5">
                  <span className="geist-label uppercase text-[#6b7280]">On</span>
                  <input type="date" value={specificDate} onChange={(e) => setSpecificDate(e.target.value)} className="geist-caption bg-transparent text-[#d4d4d4] outline-none [color-scheme:dark]" />
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="geist-label uppercase text-[#6b7280]">From</span>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="geist-caption bg-transparent text-[#d4d4d4] outline-none [color-scheme:dark]" />
                  <span className="geist-small text-[#6b7280]">to</span>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="geist-caption bg-transparent text-[#d4d4d4] outline-none [color-scheme:dark]" />
                </div>
              )}
            </div>
            {(searchQuery || statusFilter !== 'active' || selectedDept !== 'All' || startDate || endDate || specificDate) && (
              <button
                onClick={() => { setSearchQuery(''); setStatusFilter('active'); setSelectedDept('All'); setStartDate(''); setEndDate(''); setSpecificDate(''); }}
                className="geist-caption inline-flex h-8 items-center justify-center gap-1 rounded-[6px] border border-[#3f1d1d] bg-[#180707] px-3 font-medium text-[#ff8f8f] transition-colors hover:bg-[#260b0b]"
              >
                <i className="fas fa-undo-alt text-[10px]"></i>
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="flex min-h-0 flex-1 flex-col">
        {interviews.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto border-b border-dashed border-white/[0.11] px-4 py-16 text-center sm:px-6 lg:px-7">
            <div>
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] text-[#8f8f8f]">
                <i className="fas fa-video"></i>
              </div>
              <p className="geist-caption mt-4 text-[#d4d4d4]">You haven't created any interviews yet.</p>
              <Link to="/recruiter/interview/create" className="geist-caption mt-3 inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border border-white bg-white px-3 font-medium text-black transition-colors hover:bg-[#eaeaea]">
                <i className="fas fa-plus text-[11px]"></i>
                <span>Create your first interview</span>
              </Link>
            </div>
          </div>
        ) : filteredInterviews.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto border-b border-dashed border-white/[0.11] px-4 py-16 text-center sm:px-6 lg:px-7">
            <div>
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] text-[#8f8f8f]">
                <i className="fas fa-search"></i>
              </div>
              <p className="geist-caption mt-4 text-[#d4d4d4]">No interviews match your filters.</p>
              <button
                onClick={() => { setSearchQuery(''); setStatusFilter('active'); setSelectedDept('All'); setStartDate(''); setEndDate(''); setSpecificDate(''); }}
                className="geist-caption mt-3 inline-flex h-8 items-center justify-center rounded-[6px] border border-[#3f1d1d] bg-[#180707] px-3 font-medium text-[#ff8f8f] transition-colors hover:bg-[#260b0b]"
              >
                Reset Filters
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Column Headers */}
            <div className="hidden shrink-0 items-center gap-4 border-b border-white/[0.11] bg-[#000] px-4 py-2 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_90px_110px_90px_80px_80px_230px] lg:px-7">
              <span className="geist-label uppercase text-[#6b7280]">Name</span>
              <span className="geist-label text-center uppercase text-[#6b7280]">Status</span>
              <span className="geist-label text-center uppercase text-[#6b7280]">Department</span>
              <span className="geist-label text-center uppercase text-[#6b7280]">Difficulty</span>
              <span className="geist-label text-center uppercase text-[#6b7280]">ID</span>
              <span className="geist-label text-center uppercase text-[#6b7280]">Deadline</span>
              <span className="geist-label text-right uppercase text-[#6b7280]">Actions</span>
            </div>

            {/* List Rows */}
            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-color:#27272a_#000] [scrollbar-width:thin]">
              {filteredInterviews.map(interview => {
                const candidateCount = (interview.candidateEmails || []).length;
                const status = getInterviewStatus(interview);
                const shortId = interview.id.substring(0, 7);
                const deadlineText = formatDate(getInterviewDeadline(interview));

                return (
                  <article 
                    key={interview.id} 
                    className="grid gap-3 border-b border-white/[0.08] px-4 py-3 transition-colors hover:bg-white/[0.025] sm:px-6 lg:grid-cols-[minmax(0,1fr)_90px_110px_90px_80px_80px_230px] lg:items-center lg:gap-4 lg:px-7"
                  >
                    {/* Name */}
                    <div className="min-w-0">
                      <Link 
                        to={`/recruiter/interview/${interview.id}/overview`}
                        className="geist-caption block truncate font-semibold text-white hover:underline"
                        title={interview.title}
                      >
                        {interview.title}
                      </Link>
                      <p className="geist-small mt-0.5 text-[#8f8f8f]">
                        {candidateCount > 0 ? `${candidateCount} candidates` : 'No candidates invited'}
                      </p>
                    </div>

                    {/* Status */}
                    <div className="flex items-center justify-between gap-3 lg:justify-center">
                      <span className="geist-label uppercase text-[#6b7280] lg:hidden">Status</span>
                      <span className={`geist-small inline-flex items-center gap-1.5 rounded-[6px] border px-2 py-1 font-mono ${status.pillClass}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${status.dotClass}`} />
                        {status.label}
                      </span>
                    </div>

                    {/* Department */}
                    <div className="flex items-center justify-between gap-3 lg:justify-center">
                      <span className="geist-label uppercase text-[#6b7280] lg:hidden">Department</span>
                      <span className="geist-small inline-block rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-2 py-1 font-medium text-[#d4d4d4]">
                        {interview.department || "General"}
                      </span>
                    </div>

                    {/* Difficulty */}
                    <div className="flex items-center justify-between gap-3 lg:justify-center">
                      <span className="geist-label uppercase text-[#6b7280] lg:hidden">Difficulty</span>
                      <span className="geist-small text-[#8f8f8f]">{interview.difficulty || "Medium"}</span>
                    </div>

                    {/* ID */}
                    <div className="flex items-center justify-between gap-3 lg:justify-center">
                      <span className="geist-label uppercase text-[#6b7280] lg:hidden">ID</span>
                      <span className="geist-label text-[#6b7280]">{shortId}</span>
                    </div>

                    {/* Deadline */}
                    <div className="flex items-center justify-between gap-3 lg:justify-center">
                      <span className="geist-label uppercase text-[#6b7280] lg:hidden">Deadline</span>
                      <span className="geist-small text-[#8f8f8f]">{deadlineText}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedInterview(interview);
                          setIsInviteModalOpen(true);
                        }}
                        className="group geist-caption inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] border border-blue-500/40 bg-blue-500/10 px-3 font-semibold text-blue-400 transition-all hover:border-blue-400 hover:bg-blue-500/20 hover:text-white cursor-pointer shrink-0"
                        title="Add/Invite Candidate to this interview"
                      >
                        <UserPlus size={13} className="text-blue-400 group-hover:text-white transition-colors shrink-0" />
                        <span className="whitespace-nowrap font-semibold tracking-tight">+ Add Candidate</span>
                      </button>
                      <Link
                        to={`/recruiter/interview/${interview.id}/overview`}
                        className="geist-caption inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white shrink-0"
                      >
                        Manage
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>


    {isInviteModalOpen && selectedInterview && createPortal(
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-in fade-in duration-200" onClick={() => setIsInviteModalOpen(false)}>
            <div className="bg-[#090909] border border-white/[0.13] rounded-[12px] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col text-white animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                {/* Modal Header */}
                <div className="flex items-center justify-between px-5 py-4 bg-[#0d0d0d] border-b border-white/[0.11]">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-[6px] bg-white/[0.05] border border-white/[0.11] text-white">
                            <i className="fas fa-user-plus text-sm"></i>
                        </div>
                        <div>
                            <h3 className="font-bold text-base text-white">Invite Candidates</h3>
                            <p className="geist-small text-[#8f8f8f]">{selectedInterview.title}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsInviteModalOpen(false)}
                        className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] text-[#8f8f8f] transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                        <span className="text-xl leading-none">&times;</span>
                    </button>
                </div>

                {/* Modal Body Content */}
                <div className="p-5 space-y-4 overflow-y-auto">
                    <div className="p-4 bg-white/[0.025] border border-white/[0.11] rounded-[8px] space-y-3">
                        <div>
                            <h4 className="geist-label uppercase text-[#6b7280] mb-1">Access Code</h4>
                            <div className="flex items-center justify-between bg-[#111111] p-2.5 rounded-[6px] border border-white/[0.11]">
                                <span className="font-mono text-sm font-bold tracking-widest text-white">{selectedInterview.accessCode}</span>
                                <button onClick={() => {navigator.clipboard.writeText(selectedInterview.accessCode || ''); messageBox.showSuccess('Access code copied!');}} className="text-[#8f8f8f] hover:text-white transition-colors" title="Copy Access Code">
                                    <i className="fas fa-copy"></i>
                                </button>
                            </div>
                        </div>
                        <div>
                            <h4 className="geist-label uppercase text-[#6b7280] mb-1">Interview Link</h4>
                            <div className="flex items-center justify-between bg-[#111111] p-2.5 rounded-[6px] border border-white/[0.11]">
                                <span className="text-xs font-mono truncate mr-2 text-[#d4d4d4]">
                                    {selectedInterview.interviewLink || `${window.location.origin}/#/interview/${selectedInterview.id}`}
                                </span>
                                <button onClick={() => {
                                    const link = selectedInterview.interviewLink || `${window.location.origin}/#/interview/${selectedInterview.id}`;
                                    navigator.clipboard.writeText(link);
                                    messageBox.showSuccess('Interview link copied!');
                                }} className="text-[#8f8f8f] hover:text-white transition-colors" title="Copy Interview Link">
                                    <i className="fas fa-link"></i>
                                </button>
                            </div>
                        </div>
                        <div className="pt-1 text-right">
                             <button onClick={() => {
                                    const link = selectedInterview.interviewLink || `${window.location.origin}/#/interview/${selectedInterview.id}`;
                                    const text = `You've been invited to an interview for ${selectedInterview.title}.\n\nInterview Link: ${link}\nAccess Code: ${selectedInterview.accessCode}`;
                                    navigator.clipboard.writeText(text);
                                    messageBox.showSuccess('Full invite details copied!');
                             }} className="geist-caption text-xs font-semibold text-white hover:underline transition-colors">
                                 <i className="fas fa-clipboard-list mr-1"></i> Copy Full Invite Details
                             </button>
                        </div>
                    </div>

                    {/* Mode Selector */}
                    <div className="flex items-center gap-1 p-1 bg-white/[0.04] border border-white/[0.08] rounded-[6px] flex-wrap">
                        <button
                            type="button"
                            onClick={() => setInviteMode('single')}
                            className={`geist-caption flex-1 py-1.5 px-2 rounded-[4px] font-semibold text-xs transition-all flex items-center justify-center gap-1.5 min-w-[110px] ${
                                inviteMode === 'single'
                                    ? 'bg-white text-black shadow-sm'
                                    : 'text-[#8f8f8f] hover:text-white hover:bg-white/[0.04]'
                            }`}
                        >
                            <i className="fas fa-file-alt text-xs"></i>
                            <span>Single Candidate</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setInviteMode('bulk')}
                            className={`geist-caption flex-1 py-1.5 px-2 rounded-[4px] font-semibold text-xs transition-all flex items-center justify-center gap-1.5 min-w-[95px] ${
                                inviteMode === 'bulk'
                                    ? 'bg-white text-black shadow-sm'
                                    : 'text-[#8f8f8f] hover:text-white hover:bg-white/[0.04]'
                            }`}
                        >
                            <i className="fas fa-layer-group text-xs"></i>
                            <span>Bulk Import</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setInviteMode('invited')}
                            className={`geist-caption flex-1 py-1.5 px-2 rounded-[4px] font-semibold text-xs transition-all flex items-center justify-center gap-1.5 min-w-[130px] ${
                                inviteMode === 'invited'
                                    ? 'bg-white text-black shadow-sm'
                                    : 'text-[#8f8f8f] hover:text-white hover:bg-white/[0.04]'
                            }`}
                        >
                            <i className="fas fa-users text-xs"></i>
                            <span>Invited Candidates ({(selectedInterview.candidateEmails || []).length})</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setInviteMode('ai_suggest')}
                            className={`geist-caption flex-1 py-1.5 px-2 rounded-[4px] font-semibold text-xs transition-all flex items-center justify-center gap-1.5 min-w-[140px] ${
                                inviteMode === 'ai_suggest'
                                    ? 'bg-emerald-400 text-black shadow-sm font-bold'
                                    : 'text-emerald-400 hover:text-emerald-300 hover:bg-white/[0.04]'
                            }`}
                        >
                            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Suggest AI Candidates</span>
                        </button>
                    </div>



                    {inviteMode === 'single' && (
                        <>
                            {/* AI Single Candidate Resume Upload + Optional Extra Text Section */}
                            <div className="p-3 bg-white/[0.02] border border-white/[0.11] rounded-[6px] space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <Sparkles className="w-4 h-4 text-emerald-400" />
                                        <span className="geist-caption font-semibold text-white">Upload Single Resume + AI Analysis</span>
                                    </div>
                                </div>

                                <p className="geist-small text-[#8f8f8f]">
                                    Upload candidate resume (PDF, DOCX, TXT) and add optional recruiter notes. AI analyzes details, extracts contact info, saves to <strong>Resume Dump</strong>, and adds candidate to invite roster.
                                </p>

                                <div>
                                    <label className="geist-label uppercase text-[#6b7280] block mb-1">
                                        Select Candidate Resume File
                                    </label>
                                    <input
                                        type="file"
                                        accept=".pdf,.docx,.txt"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) setSelectedResumeFile(file);
                                        }}
                                        className="geist-caption w-full rounded-[6px] border border-white/[0.11] bg-white/[0.03] p-2 text-white outline-none focus:border-white/[0.28] file:mr-3 file:py-1 file:px-2.5 file:rounded-[4px] file:border-0 file:text-xs file:font-semibold file:bg-white file:text-black hover:file:bg-[#eaeaea] cursor-pointer"
                                    />
                                    {selectedResumeFile && (
                                        <span className="geist-small text-emerald-400 block mt-1">
                                            Selected: {selectedResumeFile.name} ({(selectedResumeFile.size / 1024).toFixed(1)} KB)
                                        </span>
                                    )}
                                </div>

                                <div>
                                    <label className="geist-label uppercase text-[#6b7280] block mb-1">
                                        Experience (Years) (Optional)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.5"
                                        min="0"
                                        max="60"
                                        placeholder="e.g. 3 or 5.5 (Leave blank for AI auto-extraction from resume)"
                                        value={manualExp}
                                        onChange={(e) => setManualExp(e.target.value)}
                                        className="geist-caption w-full rounded-[6px] border border-white/[0.11] bg-white/[0.03] p-2.5 text-white outline-none focus:border-white/[0.28] placeholder:text-[#6b7280]"
                                    />
                                </div>

                                <div>
                                    <label className="geist-label uppercase text-[#6b7280] block mb-1">
                                        Optional Extra Text / Recruiter Notes (Analyzed with Resume)
                                    </label>
                                    <textarea
                                        rows={2}
                                        placeholder="Enter optional extra text (e.g. candidate phone/email, referral notes, cover letter, or additional info to analyze with resume)..."
                                        value={resumeExtraText}
                                        onChange={(e) => setResumeExtraText(e.target.value)}
                                        className="geist-caption w-full rounded-[6px] border border-white/[0.11] bg-white/[0.03] p-2.5 text-[#d4d4d4] outline-none focus:border-white/[0.28] placeholder:text-[#6b7280]"
                                    />
                                </div>


                                <button
                                    type="button"
                                    onClick={handleAnalyzeAndSaveResumeCandidate}
                                    disabled={!selectedResumeFile || analyzingResumeAI}
                                    className="geist-caption inline-flex h-8 w-full items-center justify-center gap-2 rounded-[6px] border border-emerald-500/40 bg-emerald-500/10 px-3 font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>{analyzingResumeAI ? 'Analyzing with AI & Saving to Resume Dump...' : 'Analyze Resume with AI & Save to Resume Dump'}</span>
                                </button>
                            </div>

                            <div className="relative border-t border-white/[0.08] my-1">
                                <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-[#000] px-2 text-[10px] uppercase text-[#6b7280] font-mono">
                                    OR ADD MANUALLY
                                </span>
                            </div>

                            <div>
                                <label className="block geist-label uppercase text-[#6b7280] mb-1.5">Add Candidate Manually (Email & WhatsApp Phone)</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="email" 
                                        value={newEmail} 
                                        onChange={(e) => setNewEmail(e.target.value)} 
                                        placeholder="Candidate email address" 
                                        className="flex-1 p-2 rounded-[6px] bg-[#111111] border border-white/[0.11] text-xs text-white outline-none focus:border-white/30 placeholder:text-[#6b7280]" 
                                    />
                                    <input 
                                        type="tel" 
                                        value={manualPhone} 
                                        onChange={(e) => setManualPhone(e.target.value)} 
                                        placeholder="WhatsApp Phone (+91...)" 
                                        className="w-2/5 p-2 rounded-[6px] bg-[#111111] border border-white/[0.11] text-xs text-white outline-none focus:border-white/30 placeholder:text-[#6b7280]" 
                                    />
                                    <button 
                                        onClick={() => {
                                            const trimmedEmail = newEmail.trim().toLowerCase();
                                            const trimmedPhone = manualPhone.trim();
                                            if (!trimmedEmail && !trimmedPhone) {
                                                messageBox.showError("Please enter an email address or WhatsApp phone number.");
                                                return;
                                            }
                                            const targetEmail = trimmedEmail || `${trimmedPhone.replace(/[^0-9]/g, '')}@whatsapp.local`;
                                            if (!newEmails.includes(targetEmail)) {
                                                setNewEmails(prev => [...prev, targetEmail]);
                                            }
                                            if (trimmedPhone) {
                                                setParsedCandidates(prev => [
                                                    ...prev.filter(c => c.email.toLowerCase() !== targetEmail.toLowerCase()),
                                                    { email: targetEmail, phone: trimmedPhone, name: trimmedEmail ? trimmedEmail.split('@')[0] : 'Candidate', matchScore: 'N/A' }
                                                ]);
                                            }
                                            setNewEmail('');
                                            setManualPhone('');
                                        }} 
                                        className="geist-caption bg-white text-black font-semibold px-4 py-2 rounded-[6px] text-xs hover:bg-neutral-200 transition-colors shrink-0"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>
                        </>
                    )}


                    {inviteMode === 'bulk' && (
                        <div>
                            <label className="block geist-label uppercase text-[#6b7280] mb-1.5">Bulk Upload Candidate File or Resumes</label>
                            <label className="flex items-center justify-center gap-2 px-4 py-3 bg-white/[0.02] border-2 border-dashed border-white/[0.16] rounded-[8px] cursor-pointer hover:bg-white/[0.04] transition-colors">
                                {parsingResumes ? (
                                  <>
                                    <ButtonBusySkeleton className="w-5 bg-white/30" />
                                    <ButtonBusySkeleton className="w-40 bg-white/30" />
                                  </>
                                ) : (
                                  <>
                                    <i className="fas fa-file-excel text-emerald-400 text-lg"></i>
                                    <span className="geist-caption font-medium text-xs text-[#d4d4d4]">Upload Excel, CSV, PDF, DOCX, or TXT (Auto-extracts Name, Phone & Email)</span>
                                  </>
                                )}
                                <input type="file" multiple accept=".xlsx,.xls,.csv,.pdf,.txt,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,text/csv" className="hidden" onChange={handleResumeUpload} disabled={parsingResumes} />
                            </label>
                        </div>
                    )}

                    {inviteMode === 'invited' && (
                        <div className="space-y-3">
                            <h4 className="geist-label uppercase text-[#6b7280]">Invited Candidates Roster ({(selectedInterview.candidateEmails || []).length}):</h4>
                            {(!selectedInterview.candidateEmails || selectedInterview.candidateEmails.length === 0) ? (
                                <p className="geist-small text-[#6b7280] italic p-4 text-center border border-white/[0.08] rounded-[6px]">No candidates invited yet for this role.</p>
                            ) : (
                                <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                                    {selectedInterview.candidateEmails.map((email) => {
                                        const isEditing = editingCandidateEmail === email;
                                        const isResending = resendingEmail === email;
                                        const candData = ((selectedInterview as any).candidateData || []).find((c: any) => c.email && c.email.toLowerCase() === email.toLowerCase());
                                        const candPhone = candData?.phone && candData.phone !== 'N/A' ? candData.phone : '';

                                        return (
                                            <div key={email} className="flex items-center justify-between text-xs bg-white/[0.025] border border-white/[0.11] rounded-[6px] px-3.5 py-2.5 shadow-sm">
                                                {isEditing ? (
                                                    <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mr-2">
                                                        <input 
                                                            type="email" 
                                                            value={editedEmailValue} 
                                                            onChange={(e) => setEditedEmailValue(e.target.value)} 
                                                            placeholder="Candidate Email"
                                                            className="flex-1 p-2 text-xs rounded-[6px] border border-white/[0.11] bg-[#111111] text-white outline-none focus:border-white/30"
                                                            autoFocus
                                                        />
                                                        <input 
                                                            type="tel" 
                                                            value={editedPhoneValue} 
                                                            onChange={(e) => setEditedPhoneValue(e.target.value)} 
                                                            placeholder="Phone number (e.g. +91...)"
                                                            className="w-full sm:w-2/5 p-2 text-xs rounded-[6px] border border-white/[0.11] bg-[#111111] text-white outline-none focus:border-white/30"
                                                        />
                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            <button 
                                                                onClick={() => handleEditAndResend(email, editedEmailValue, editedPhoneValue)}
                                                                disabled={resendingEmail !== null}
                                                                className="bg-white text-black hover:bg-neutral-200 px-3 py-1.5 rounded-[6px] text-xs font-semibold disabled:opacity-50 flex items-center gap-1 shrink-0 transition-colors"
                                                            >
                                                                {isResending ? <ButtonBusySkeleton className="w-12 bg-black/30" /> : <><i className="fas fa-save"></i> Save</>}
                                                            </button>
                                                            <button 
                                                                onClick={() => { setEditingCandidateEmail(null); setEditedEmailValue(''); setEditedPhoneValue(''); }}
                                                                disabled={resendingEmail !== null}
                                                                className="border border-white/[0.11] bg-white/[0.03] text-[#d4d4d4] hover:bg-white/[0.06] px-3 py-1.5 rounded-[6px] text-xs shrink-0 transition-colors"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="font-semibold text-white truncate max-w-[240px]" title={email}>{email}</span>
                                                            {candPhone ? (
                                                                <span className="text-xs text-[#8bbde8] font-mono flex items-center gap-1.5 mt-0.5">
                                                                    <i className="fas fa-phone-alt"></i> {candPhone}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[11px] text-[#6b7280] italic">No phone attached (Click pencil to edit)</span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            <button 
                                                                onClick={() => { 
                                                                    setEditingCandidateEmail(email); 
                                                                    setEditedEmailValue(email); 
                                                                    setEditedPhoneValue(candPhone);
                                                                }}
                                                                disabled={resendingEmail !== null}
                                                                className="w-7 h-7 rounded border border-white/[0.11] bg-white/[0.03] text-[#d4d4d4] hover:bg-white/[0.08] hover:text-white transition-colors flex items-center justify-center" 
                                                                title="Edit Candidate Contact Details"
                                                            >
                                                                <i className="fas fa-pencil-alt text-xs"></i>
                                                            </button>
                                                            <button 
                                                                onClick={() => handleResend(email)}
                                                                disabled={resendingEmail !== null}
                                                                className="w-7 h-7 rounded border border-white/[0.11] bg-white/[0.04] text-[#d4d4d4] hover:bg-white/[0.08] hover:text-white transition-colors flex items-center justify-center" 
                                                                title="Mail Reminder"
                                                            >
                                                                <i className="fas fa-envelope text-blue-400 text-xs"></i>
                                                            </button>
                                                            <button 
                                                                onClick={() => handleSendWhatsAppReminder(email, candPhone)}
                                                                disabled={resendingEmail !== null}
                                                                className="w-7 h-7 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center justify-center" 
                                                                title="WhatsApp Reminder"
                                                            >
                                                                <i className="fab fa-whatsapp text-xs"></i>
                                                            </button>
                                                        </div>

                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* AI Candidate Suggestions Tab Panel */}
                    {inviteMode === 'ai_suggest' && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-[6px]">
                                <div>
                                    <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-xs">
                                        <Sparkles className="w-4 h-4" />
                                        <span>AI Candidate Recommendations ({aiSuggestedCandidates.length})</span>
                                    </div>
                                    <p className="geist-small text-[#8f8f8f] mt-0.5 text-[11px]">
                                        Best matched candidates from your candidate pool based on skills & interview requirements.
                                    </p>
                                </div>

                                {aiSuggestedCandidates.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const top5 = aiSuggestedCandidates.slice(0, 5);
                                            let addedCount = 0;
                                            top5.forEach(cand => {
                                                const targetEmail = cand.email;
                                                if (targetEmail) {
                                                    if (!newEmails.includes(targetEmail)) {
                                                        setNewEmails(prev => [...prev, targetEmail]);
                                                        addedCount++;
                                                    }
                                                    setParsedCandidates(prev => [
                                                        ...prev.filter(c => c.email.toLowerCase() !== targetEmail.toLowerCase()),
                                                        { email: targetEmail, phone: cand.phone || 'N/A', name: cand.name, experience: cand.experience, matchScore: `${cand.matchScore}%` }
                                                    ]);
                                                }
                                            });
                                            messageBox.showSuccess(`Added top ${addedCount > 0 ? addedCount : Math.min(5, aiSuggestedCandidates.length)} AI candidate matches to invite list!`);
                                        }}
                                        className="geist-caption inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[4px] bg-emerald-500 text-black font-bold text-xs hover:bg-emerald-400 transition-colors shrink-0"
                                    >
                                        <Sparkles className="w-3 h-3" />
                                        <span>+ Add Top 5</span>
                                    </button>
                                )}
                            </div>

                            {loadingDumpCandidates ? (
                                <div className="py-8 text-center text-[#8f8f8f]">
                                    <Sparkles className="w-5 h-5 animate-spin mx-auto text-emerald-400 mb-2" />
                                    Analyzing candidate profiles against interview requirements...
                                </div>
                            ) : aiSuggestedCandidates.length === 0 ? (
                                <div className="p-6 text-center border border-white/[0.08] rounded-[6px] bg-white/[0.02]">
                                    <p className="geist-caption text-white font-medium">No new candidate recommendations found</p>
                                    <p className="geist-small text-[#6b7280] mt-1 max-w-sm mx-auto">
                                        All stored candidate profiles are already invited, or upload more resumes to generate matches.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1 geist-small">
                                    {aiSuggestedCandidates.map((cand) => {
                                        const isAdded = newEmails.includes(cand.email);
                                        return (
                                            <div
                                                key={cand.id}
                                                className="flex items-start justify-between gap-3 p-3 bg-white/[0.03] border border-white/[0.09] rounded-[6px] hover:border-white/[0.2] transition-colors"
                                            >
                                                <div className="space-y-1 min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-semibold text-white text-xs truncate">{cand.name}</span>
                                                        <span className={`geist-small inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 font-bold text-[10px] ${
                                                            cand.matchScore >= 75
                                                                ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                                                                : cand.matchScore >= 50
                                                                ? 'border border-blue-500/40 bg-blue-500/10 text-blue-400'
                                                                : 'border border-white/[0.15] bg-white/[0.05] text-[#d4d4d4]'
                                                        }`}>
                                                            {cand.matchScore >= 75 ? '🔥' : '⚡'} {cand.matchScore}% Match
                                                        </span>
                                                        {cand.experience && cand.experience !== 'N/A' && (
                                                            <span className="text-[10px] text-[#83d0a3] bg-emerald-950/40 border border-emerald-500/20 px-1.5 py-0.2 rounded font-mono">
                                                                {cand.experience}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="text-[11px] text-[#8f8f8f] truncate font-mono">
                                                        {cand.email} {cand.phone && cand.phone !== 'N/A' ? `· ${cand.phone}` : ''}
                                                    </div>

                                                    {cand.skills && cand.skills.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            {cand.skills.slice(0, 4).map((s: string) => (
                                                                <span key={s} className="text-[10px] text-[#d4d4d4] bg-white/[0.04] border border-white/[0.08] px-1.5 py-0.2 rounded">
                                                                    {s}
                                                                </span>
                                                            ))}
                                                            {cand.skills.length > 4 && (
                                                                <span className="text-[10px] text-[#6b7280] px-1 py-0.2">
                                                                    +{cand.skills.length - 4} more
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const targetEmail = cand.email;
                                                        if (targetEmail) {
                                                            if (!newEmails.includes(targetEmail)) {
                                                                setNewEmails(prev => [...prev, targetEmail]);
                                                            }
                                                            setParsedCandidates(prev => [
                                                                ...prev.filter(c => c.email.toLowerCase() !== targetEmail.toLowerCase()),
                                                                { email: targetEmail, phone: cand.phone || 'N/A', name: cand.name, experience: cand.experience, matchScore: `${cand.matchScore}%` }
                                                            ]);
                                                            messageBox.showSuccess(`Added "${cand.name}" (${cand.matchScore}% Match) to invite list!`);
                                                        }
                                                    }}
                                                    disabled={isAdded}
                                                    className={`geist-caption inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[4px] text-xs font-semibold shrink-0 transition-colors ${
                                                        isAdded
                                                            ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 opacity-80 cursor-default'
                                                            : 'border border-white/20 bg-white text-black hover:bg-neutral-200'
                                                    }`}
                                                >
                                                    {isAdded ? '✓ Added' : '+ Add Candidate'}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}


                    {sendingProgressMsg && (
                        <div className="p-3 bg-white/[0.04] border border-white/[0.15] rounded-[6px] text-xs font-medium text-white flex items-center gap-2 animate-pulse">
                            <i className="fas fa-spinner fa-spin text-white"></i>
                            <span>{sendingProgressMsg}</span>
                        </div>
                    )}

                    {inviteMode !== 'invited' && (
                        <div>
                            <h4 className="geist-label uppercase text-[#6b7280] mb-1.5">New Candidates to Invite:</h4>
                            {newEmails.length === 0 ? (
                                 <p className="geist-small text-[#6b7280] italic">No candidates added yet. Upload resumes or add manually above.</p>
                            ) : (
                                <div className="flex flex-col gap-2 max-h-[180px] overflow-y-auto pr-1">
                                    {newEmails.map(email => {
                                        const parsedData = parsedCandidates.find(c => c.email === email);
                                        
                                        let ScoreBadge = null;
                                        if (parsedData?.matchScore && parsedData.matchScore !== 'N/A') {
                                            const numScore = parseFloat(parsedData.matchScore);
                                            let badgeColor = 'bg-white/[0.04] text-[#8f8f8f] border-white/[0.08]';
                                            let icon = 'fas fa-minus-circle';
                                            
                                            if (!isNaN(numScore)) {
                                                if (numScore >= 75) {
                                                    badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-semibold';
                                                    icon = 'fas fa-check-circle';
                                                } else if (numScore >= 50) {
                                                    badgeColor = 'bg-white/[0.06] text-[#d4d4d4] border-white/[0.15]';
                                                    icon = 'fas fa-exclamation-circle';
                                                } else {
                                                    badgeColor = 'bg-red-500/10 text-red-400 border-red-500/30';
                                                    icon = 'fas fa-times-circle';
                                                }
                                            }
                                            
                                            ScoreBadge = (
                                                <div className={`mt-1 flex w-fit items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-xs border ${badgeColor}`} title="AI Resume Match Score vs Job Description">
                                                    <i className={icon}></i> Match: {parsedData.matchScore}%
                                                </div>
                                            );
                                        }

                                        return (
                                            <div key={email} className="flex items-start justify-between text-xs bg-white/[0.025] border border-white/[0.11] rounded-[6px] px-3.5 py-2.5 shadow-sm transition-colors hover:border-white/20">
                                                <div className="flex flex-col min-w-0">
                                                    <span className="font-semibold text-white truncate max-w-[260px]">{email}</span>
                                                    {parsedData?.phone && parsedData.phone !== 'N/A' && (
                                                        <span className="text-xs text-[#8bbde8] font-mono flex items-center gap-1.5 mt-0.5"><i className="fas fa-phone-alt"></i>{parsedData.phone}</span>
                                                    )}
                                                    {ScoreBadge}
                                                </div>
                                                <button onClick={() => handleRemoveNewEmail(email)} className="text-[#8f8f8f] hover:text-[#ff8f8f] transition-colors p-1.5 rounded hover:bg-white/[0.06]" title="Remove Candidate">
                                                    <i className="fas fa-trash-alt"></i>
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                </div>

                {/* Modal Footer */}
                <div className="flex justify-end gap-2 p-4 bg-[#0d0d0d] border-t border-white/[0.11]">
                    <button 
                        onClick={() => setIsInviteModalOpen(false)} 
                        className="geist-caption h-9 px-4 rounded-[6px] border border-white/[0.11] bg-white/[0.03] hover:bg-white/[0.06] font-semibold text-xs text-[#d4d4d4] transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSendInvites} 
                        disabled={sendingEmails || newEmails.length === 0}
                        className="geist-caption h-9 px-4 rounded-[6px] bg-white text-black hover:bg-neutral-200 font-semibold text-xs flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        {sendingEmails ? (
                            <ButtonBusySkeleton className="w-20 bg-black/30" />
                        ) : 'Send Invites'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )}

    {editingJobId && <EditJobModal jobId={editingJobId} onClose={() => setEditingJobId(null)} />}

    {whatsappModal && whatsappModal.isOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-gray-200 dark:border-white/10 flex flex-col text-gray-900 dark:text-white transform transition-all duration-300">
                {/* Header */}
                <div className="flex items-center gap-3 p-4 bg-emerald-500/10 dark:bg-emerald-500/5 border-b border-emerald-500/20 dark:border-emerald-500/10">
                    <div className="p-2 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                        <i className="fab fa-whatsapp text-xl"></i>
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Send WhatsApp Invite</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Send an invitation link to the candidate via WhatsApp Web</p>
                    </div>
                    <button 
                        onClick={() => setWhatsappModal(null)} 
                        className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                        <i className="fas fa-times text-lg"></i>
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Candidate Email</label>
                        <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-black/30 p-2.5 rounded-lg border border-gray-200 dark:border-zinc-800">
                            {whatsappModal.email}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Phone Number <span className="text-red-500">*</span></label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 font-medium text-sm">
                                <i className="fas fa-phone-alt mr-1"></i>
                            </span>
                            <input 
                                type="tel" 
                                value={whatsappModal.phone} 
                                onChange={(e) => setWhatsappModal({...whatsappModal, phone: e.target.value})} 
                                placeholder="Enter phone number (e.g. 9876543210)" 
                                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white dark:bg-zinc-800 text-sm outline-none"
                            />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">Include country code if outside India. 10-digit Indian numbers auto-prepend +91.</p>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Draft Message Preview</label>
                        <textarea 
                            value={whatsappModal.message} 
                            onChange={(e) => setWhatsappModal({...whatsappModal, message: e.target.value})} 
                            rows={6}
                            className="w-full p-3 border border-gray-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white dark:bg-zinc-800 text-xs font-mono outline-none leading-relaxed resize-none"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 p-4 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5">
                    <button 
                        onClick={() => setWhatsappModal(null)} 
                        className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={async () => {
                            if (!whatsappModal.phone.trim()) {
                                messageBox.showError("Please enter a valid phone number");
                                return;
                            }
                            
                            // Save phone to Firestore under candidateData array
                            try {
                                const intRef = doc(db, 'interviews', whatsappModal.interview.id);
                                const currentCandData = (whatsappModal.interview as any).candidateData || [];
                                const index = currentCandData.findIndex((c: any) => c.email.toLowerCase() === whatsappModal.email.toLowerCase());
                                
                                let updatedCandData = [...currentCandData];
                                if (index > -1) {
                                    updatedCandData[index] = { ...updatedCandData[index], phone: whatsappModal.phone };
                                } else {
                                    updatedCandData.push({ email: whatsappModal.email, phone: whatsappModal.phone });
                                }
                                
                                await updateDoc(intRef, {
                                    candidateData: updatedCandData
                                });
                                
                                // Update local state so it reflects immediately
                                setInterviews(prev => prev.map(inv => {
                                    if (inv.id === whatsappModal.interview.id) {
                                        return { ...inv, candidateData: updatedCandData };
                                    }
                                    return inv;
                                }));
                            } catch (err) {
                                console.error("Error updating phone in Firestore:", err);
                            }
                            
                            // Send message via WhatsApp API
                            const res = await sendWhatsAppMessage(whatsappModal.phone, whatsappModal.message);
                            setWhatsappModal(null);
                            if (res.success) {
                                messageBox.showSuccess("✅ WhatsApp invitation sent successfully!");
                            } else {
                                messageBox.showError(`WhatsApp API error: ${res.error || 'Failed to send'}. Opening WhatsApp Web fallback.`);
                                const cleanedPhone = whatsappModal.phone.replace(/[^0-9]/g, '');
                                const targetPhone = cleanedPhone.length === 10 ? '91' + cleanedPhone : cleanedPhone;
                                window.open(`https://web.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(whatsappModal.message)}`, '_blank');
                            }
                        }}
                        className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
                    >
                        <i className="fab fa-whatsapp"></i>
                        <span>Send WhatsApp Invite</span>
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )}

    {fullJdModal && fullJdModal.isOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-zinc-950 rounded-2xl shadow-2xl border border-gray-200 dark:border-zinc-800 w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden text-gray-900 dark:text-white">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/20">
                    <div>
                        <span className="text-[10px] uppercase font-bold text-primary tracking-widest block mb-0.5">Full Job Description</span>
                        <h3 className="text-lg font-extrabold text-gray-900 dark:text-white leading-tight">{fullJdModal.title}</h3>
                    </div>
                    <button 
                        onClick={() => setFullJdModal(null)} 
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        title="Close full screen Job Description view"
                    >
                        <i className="fas fa-times text-lg"></i>
                    </button>
                </div>
                {/* Body */}
                <div className="p-6 overflow-y-auto custom-card-scrollbar text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {fullJdModal.description || "No description provided."}
                </div>
                {/* Footer */}
                <div className="flex justify-end p-4 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/20">
                    <button 
                        onClick={() => setFullJdModal(null)} 
                        className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all shadow-sm"
                        title="Close window"
                    >
                        Close View
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )}

    {fullRosterModal && fullRosterModal.isOpen && (() => {
        const interview = fullRosterModal.interview;
        return createPortal(
            <FullRosterModalContent 
                interview={interview} 
                submissionsMap={submissionsMap} 
                setWhatsappModal={(modal) => setWhatsappModal({ ...modal, isOpen: true })} 
                onAllowReattempt={handleAllowReattempt}
                onClose={() => setFullRosterModal(null)} 
            />,
            document.body
        );
    })()}
    </div>
    );
};

interface FullRosterModalContentProps {
    interview: Interview;
    submissionsMap: Record<string, any[]>;
    setWhatsappModal: (modal: any) => void;
    onAllowReattempt: (interviewId: string, attemptId: string, currentAllowValue: boolean) => Promise<void>;
    onClose: () => void;
}

const FullRosterModalContent: React.FC<FullRosterModalContentProps> = ({ interview, submissionsMap, setWhatsappModal, onAllowReattempt, onClose }) => {
    const [rosterSearch, setRosterSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');

    const explicitEmails = (interview.candidateEmails || []).map(e => e.toLowerCase());
    const submissions = submissionsMap[interview.id] || [];
    const unifiedList: {email: string, hasSubmitted: boolean, attemptId?: string, allowReattempt?: boolean}[] = [];
    
    submissions.forEach(sub => {
        unifiedList.push({ 
            email: sub.candidateInfo?.email || 'N/A', 
            hasSubmitted: true,
            attemptId: sub.id,
            allowReattempt: sub.allowReattempt || false
        });
    });

    explicitEmails.forEach(email => {
        const hasSubmitted = submissions.some(sub => (sub.candidateInfo?.email || '').toLowerCase() === email);
        if (!hasSubmitted && !unifiedList.some(u => u.email.toLowerCase() === email)) {
            unifiedList.push({ email, hasSubmitted: false });
        }
    });

    const filteredList = unifiedList.filter(cand => {
        const matchesSearch = cand.email.toLowerCase().includes(rosterSearch.toLowerCase());
        const matchesStatus = statusFilter === 'All' || 
            (statusFilter === 'Submitted' && cand.hasSubmitted) ||
            (statusFilter === 'Pending' && !cand.hasSubmitted);
        return matchesSearch && matchesStatus;
    });

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-zinc-950 rounded-2xl shadow-2xl border border-gray-200 dark:border-zinc-800 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden text-gray-900 dark:text-white">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/20">
                    <div>
                        <span className="text-[10px] uppercase font-bold text-primary tracking-widest block mb-0.5">Tracking Roster</span>
                        <h3 className="text-lg font-extrabold text-gray-900 dark:text-white leading-tight">{interview.title}</h3>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        title="Close candidate roster view"
                    >
                        <i className="fas fa-times text-lg"></i>
                    </button>
                </div>
                
                {/* Search and Filters inside Roster */}
                <div className="p-4 bg-gray-50/50 dark:bg-zinc-900/10 border-b border-gray-100 dark:border-zinc-800 flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 pointer-events-none">
                            <i className="fas fa-search text-xs"></i>
                        </span>
                        <input
                            type="text"
                            value={rosterSearch}
                            onChange={(e) => setRosterSearch(e.target.value)}
                            placeholder="Search candidate email..."
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 text-xs font-semibold outline-none focus:ring-2 focus:ring-primary transition-all"
                            title="Filter roster list by typing candidate email"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-2 border border-gray-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 text-xs font-semibold outline-none focus:ring-1 focus:ring-primary"
                        title="Filter candidates by status"
                    >
                        <option value="All">All Status</option>
                        <option value="Submitted">Submitted</option>
                        <option value="Pending">Pending</option>
                    </select>
                </div>

                {/* Body */}
                <div className="p-5 overflow-y-auto custom-card-scrollbar flex-grow space-y-2.5 max-h-[50vh]">
                    {filteredList.length === 0 ? (
                        <p className="text-xs text-gray-500 italic text-center py-8">No matching candidates found.</p>
                    ) : (
                        filteredList.map((cand, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-gray-50 dark:bg-zinc-900/40 text-xs rounded-xl px-4 py-3 border border-gray-100 dark:border-zinc-800">
                                <span className="font-semibold text-gray-700 dark:text-gray-200 truncate max-w-[240px] sm:max-w-[320px]" title={cand.email}>
                                    {cand.email}
                                </span>
                                {cand.hasSubmitted ? (
                                     <div className="flex items-center gap-2 shrink-0">
                                         <span className="text-green-600 dark:text-green-400 font-bold flex items-center gap-1.5 font-sans">
                                             <i className="fas fa-check-circle"></i> Submitted
                                         </span>
                                         <button
                                             type="button"
                                             onClick={() => onAllowReattempt(interview.id, cand.attemptId!, cand.allowReattempt || false)}
                                             className={`inline-flex items-center gap-1 px-2.5 py-1.5 border rounded-lg text-[10px] font-extrabold transition-all ${
                                                 cand.allowReattempt 
                                                     ? 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-800/50' 
                                                     : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-zinc-700'
                                             }`}
                                             title={cand.allowReattempt ? "Remove Reattempt Chance" : "Give Reattempt Chance"}
                                         >
                                             <i className="fas fa-redo"></i>
                                             <span>{cand.allowReattempt ? 'Allowed' : 'Allow Reattempt'}</span>
                                         </button>
                                     </div>
                                ) : (
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-yellow-600 dark:text-yellow-500 font-bold flex items-center gap-1.5">
                                            <i className="fas fa-clock"></i> Pending
                                        </span>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const candData = (interview as any).candidateData?.find((c: any) => c.email?.toLowerCase() === cand.email?.toLowerCase());
                                                const phone = candData?.phone && candData.phone !== 'N/A' ? candData.phone.trim() : '';

                                                const options = {
                                                  gender: (interview as any).gender || (interview as any).genderRequirement,
                                                  location: (interview as any).location,
                                                  education: (interview as any).education || (interview as any).qualification,
                                                  qualification: (interview as any).qualification || (interview as any).education,
                                                  experience: (interview as any).experience || (interview as any).experienceRequired,
                                                  salary: (interview as any).salary || (interview as any).salaryRange,
                                                  recruiterName: (interview as any).createdBy?.name || 'Recruiter',
                                                  recruiterPhone: ''
                                                };

                                                if (!phone) {
                                                    const msg = buildWhatsAppInviteText({
                                                      candidateName: cand.email.split('@')[0],
                                                      jobTitle: interview.title,
                                                      interviewLink: interview.interviewLink || `${window.location.origin}/#/interview/${interview.id}`,
                                                      accessCode: interview.accessCode,
                                                      options
                                                    });
                                                    setWhatsappModal({
                                                        isOpen: true,
                                                        email: cand.email,
                                                        phone: '',
                                                        message: msg,
                                                        interview: interview
                                                    });
                                                    onClose();
                                                    return;
                                                }

                                                try {
                                                    const res = await sendInterviewWhatsAppInvite({
                                                        phone: phone,
                                                        candidateName: cand.email.split('@')[0],
                                                        jobTitle: interview.title,
                                                        interviewLink: interview.interviewLink || `${window.location.origin}/#/interview/${interview.id}`,
                                                        accessCode: interview.accessCode,
                                                        options
                                                    });

                                                    if (res.success) {
                                                        alert(`✅ WhatsApp invitation sent to ${phone} via WhatsApp API!`);
                                                    } else {
                                                        alert(`WhatsApp API error: ${res.error || 'Failed to send'}`);
                                                    }
                                                } catch (err: any) {
                                                    console.error('Direct WA error:', err);
                                                    alert('Failed to send WhatsApp message via API.');
                                                }
                                            }}
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 rounded-lg text-[10px] font-extrabold transition-all"
                                            title="Directly send WhatsApp invite via API"
                                        >
                                            <i className="fab fa-whatsapp"></i>
                                            <span>Invite via WhatsApp</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end p-4 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/20">
                    <button 
                        onClick={onClose} 
                        className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all shadow-sm"
                        title="Close window"
                    >
                        Close View
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RecruiterInterviews;
