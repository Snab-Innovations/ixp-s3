import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { Interview } from '../types';
import { useMessageBox } from '../components/MessageBox';
import { createPortal } from 'react-dom';
import { sendInterviewInvitations } from '../services/brevoService';
import { sendWhatsAppMessage, sendInterviewWhatsAppInvite, buildWhatsAppInviteText, sendBulkWhatsAppInvites } from '../services/waSenderService';
import EditJobModal from './EditJob';
import InviteCandidateModal from '../components/InviteCandidateModal';
import { extractJobDetailsOptions } from '../services/jobDetailsHelper';

import { evaluateResumeMatch } from '../services/api';
import { ingestResumeFile, saveResumeDumpCandidate } from '../services/resumeService';
import { parseCandidateDocument } from '../services/candidateFileParser';
import { logTeamActivity } from '../services/auditService';
import { useCompanyRateLimits } from '../hooks/useRecruiterRateLimits';
import { getRateLimitReachedMessage, isRateLimitReached } from '../services/rateLimitService';
import { poll, rds } from '../services/rdsApi';

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
        dotClass: 'bg-red-500 dark:bg-[#ff6b6b]',
        pillClass: 'border-red-200 dark:border-[#3f1d1d] bg-red-50 dark:bg-[#180707] text-red-700 dark:text-[#ff8f8f]',
      }
    : {
        label: 'Active',
        dotClass: 'bg-emerald-500 dark:bg-[#50e3c2]',
        pillClass: 'border-emerald-200 dark:border-[#123b2a] bg-emerald-50 dark:bg-[#071a12] text-emerald-800 dark:text-[#83d0a3]',
    };
};

const ButtonBusySkeleton = ({ className = 'bg-current/25' }: { className?: string }) => (
  <span className={`inline-block h-3 w-16 animate-pulse rounded-[4px] ${className}`} aria-hidden="true" />
);

export const RecruiterInterviewsSkeleton = () => (
  <div className="-mx-4 -my-8 flex h-[calc(100vh-3.5rem)] min-h-0 flex-col overflow-hidden bg-slate-50 dark:bg-[#000] text-slate-900 dark:text-white sm:-mx-6 lg:-mx-8 animate-pulse">
    <section className="shrink-0 border-b border-slate-200 dark:border-white/[0.11] bg-white dark:bg-[#000]">
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-7 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="h-8 w-24 rounded-[6px] bg-slate-200 dark:bg-white/[0.04]" />
          <div className="h-7 w-48 rounded-[6px] bg-slate-300 dark:bg-white/[0.04] mt-3" />
          <div className="h-4 w-64 rounded-[6px] bg-slate-200 dark:bg-white/[0.04] mt-2" />
        </div>
        <div className="h-8 w-32 rounded-[6px] bg-slate-300 dark:bg-white/[0.04]" />
      </div>
    </section>

    <section className="grid shrink-0 grid-cols-2 border-b border-slate-200 dark:border-white/[0.11] bg-white dark:bg-transparent lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="border-r border-slate-200 dark:border-white/[0.11] px-4 py-4 last:border-r-0 sm:px-6 lg:px-7">
          <div className="h-3 w-12 rounded bg-slate-200 dark:bg-white/[0.04]" />
          <div className="h-6 w-16 rounded bg-slate-300 dark:bg-white/[0.04] mt-2" />
        </div>
      ))}
    </section>

    <section className="shrink-0 border-b border-slate-200 dark:border-white/[0.11] bg-white dark:bg-transparent">
      <div className="flex flex-col gap-3 px-4 py-3 sm:px-6 lg:px-7 xl:flex-row xl:items-center xl:justify-between">
        <div className="h-9 w-full xl:max-w-xs rounded-[6px] bg-slate-200 dark:bg-white/[0.04]" />
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-9 w-28 rounded-[6px] bg-slate-200 dark:bg-white/[0.04]" />
          <div className="h-9 w-48 rounded-[6px] bg-slate-200 dark:bg-white/[0.04]" />
        </div>
      </div>
    </section>

    <section className="flex min-h-0 flex-1 flex-col">
      <div className="hidden shrink-0 items-center gap-4 border-b border-slate-200 dark:border-white/[0.11] bg-slate-100 dark:bg-[#000] px-4 py-3 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_100px_120px_100px_100px_100px_100px] lg:px-7">
        <div className="h-3 w-16 rounded bg-slate-300 dark:bg-white/[0.04]" />
        <div className="h-3 w-12 rounded bg-slate-300 dark:bg-white/[0.04] mx-auto" />
        <div className="h-3 w-16 rounded bg-slate-300 dark:bg-white/[0.04] mx-auto" />
        <div className="h-3 w-16 rounded bg-slate-300 dark:bg-white/[0.04] mx-auto" />
        <div className="h-3 w-12 rounded bg-slate-300 dark:bg-white/[0.04] mx-auto" />
        <div className="h-3 w-12 rounded bg-slate-300 dark:bg-white/[0.04] mx-auto" />
        <div className="h-3 w-12 rounded bg-slate-300 dark:bg-white/[0.04] ml-auto" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-white dark:bg-transparent">
        {[...Array(8)].map((_, idx) => (
          <div
            key={idx}
            className="grid gap-3 border-b border-slate-200 dark:border-white/[0.08] px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_100px_120px_100px_100px_100px_100px] lg:items-center lg:gap-4 lg:px-7"
          >
            <div className="space-y-2">
              <div className="h-4 w-40 rounded bg-slate-300 dark:bg-white/[0.04]" />
              <div className="h-3 w-20 rounded bg-slate-200 dark:bg-white/[0.04]" />
            </div>
            <div className="h-4 w-12 rounded bg-slate-200 dark:bg-white/[0.04] mx-auto" />
            <div className="h-5 w-16 rounded bg-slate-200 dark:bg-white/[0.04] mx-auto" />
            <div className="h-4 w-16 rounded bg-slate-200 dark:bg-white/[0.04] mx-auto" />
            <div className="h-4 w-16 rounded bg-slate-200 dark:bg-white/[0.04] mx-auto" />
            <div className="h-4 w-12 rounded bg-slate-200 dark:bg-white/[0.04] mx-auto" />
            <div className="h-8 w-20 rounded bg-slate-200 dark:bg-white/[0.04] ml-auto" />
          </div>
        ))}
      </div>
    </section>
  </div>
);

const RecruiterInterviews: React.FC = () => {
  const { user, userProfile } = useAuth();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [newEmails, setNewEmails] = useState<string[]>([]);
  const [parsedCandidates, setParsedCandidates] = useState<{email: string, phone: string, matchScore?: string}[]>([]);
  const [submissionsMap, setSubmissionsMap] = useState<Record<string, any[]>>({});
  const [parsingResumes, setParsingResumes] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [editingCandidateEmail, setEditingCandidateEmail] = useState<string | null>(null);
  const [editedEmailValue, setEditedEmailValue] = useState('');
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const [remindingInterviewId, setRemindingInterviewId] = useState<string | null>(null);
  const [whatsappModal, setWhatsappModal] = useState<{
      isOpen: boolean;
      email: string;
      phone: string;
      message: string;
      interview: Interview;
  } | null>(null);

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

    return poll(
      async () => {
        const [{ interviews: rows }, { attempts }] = await Promise.all([
          rds.listInterviews({ teamId }),
          rds.listAttemptsByRecruiter(teamId),
        ]);
        return { rows: rows || [], attempts: attempts || [] };
      },
      ({ rows, attempts }) => {
        const interviewsData = rows
          .map((row: any) => ({ ...row, id: row.id } as Interview))
          .filter((interview) => (interview as any).isMock !== true)
          .sort((a, b) => toMillis((b as any).createdAt) - toMillis((a as any).createdAt));
        setInterviews(interviewsData);

        const newSubmissionsMap: Record<string, any[]> = {};
        for (const interview of interviewsData) {
          newSubmissionsMap[interview.id] = attempts.filter(
            (attempt: any) => attempt.interviewId === interview.id
          );
        }
        setSubmissionsMap(newSubmissionsMap);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching interviews:", err);
        setLoading(false);
      },
      8000
    );
  }, [user, userProfile?.teamId, userProfile?.parentRecruiterId]);

  const handleDelete = (interviewId: string) => {
    messageBox.showConfirm("Are you sure you want to delete this interview?", async () => {
      try {
        await rds.deleteInterview(interviewId);
        setInterviews((prev) => prev.filter((i) => i.id !== interviewId));
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

  const handleEditAndResend = async (oldEmail: string, newEmail: string) => {
    if (!selectedInterview || !newEmail || oldEmail === newEmail) {
        setEditingCandidateEmail(null);
        return;
    }
    
    setResendingEmail(oldEmail);
    try {
        const updatedEmails = (selectedInterview.candidateEmails || []).filter(e => e.toLowerCase() !== oldEmail.toLowerCase());
        updatedEmails.push(newEmail.toLowerCase());

        await rds.updateInterview(selectedInterview.id, {
            candidateEmails: updatedEmails
        });
        
        setSelectedInterview({...selectedInterview, candidateEmails: updatedEmails});
        setInterviews((prev) => prev.map((inv) =>
          inv.id === selectedInterview.id ? { ...inv, candidateEmails: updatedEmails } : inv
        ));
        
        const resendOptions = extractJobDetailsOptions(selectedInterview, userProfile, user);

        const result = await sendInterviewInvitations(
            [newEmail],
            selectedInterview.title,
            selectedInterview.interviewLink || '',
            selectedInterview.accessCode,
            false,
            resendOptions
        );

        if (result.success) {
            messageBox.showSuccess(`Email updated and invitation resent to ${newEmail}!`);
        } else {
            messageBox.showError(`Failed to resend email: ${result.error}`);
        }
    } catch (error: any) {
        console.error('Edit & Resend error:', error);
        messageBox.showError('Failed to update and resend invitation.');
    } finally {
        setResendingEmail(null);
        setEditingCandidateEmail(null);
    }
  };

  const handleResend = async (email: string) => {
    if (!selectedInterview) return;
    setResendingEmail(email);
    try {
        const resendOpt = extractJobDetailsOptions(selectedInterview, userProfile, user);
        const result = await sendInterviewInvitations(
            [email],
            selectedInterview.title,
            selectedInterview.interviewLink || '',
            selectedInterview.accessCode,
            false,
            resendOpt
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

  const handleAllowReattempt = async (interviewId: string, attemptId: string, currentAllowValue: boolean) => {
    try {
        await rds.updateAttempt(attemptId, {
            allowReattempt: !currentAllowValue
        });
        setSubmissionsMap((prev) => ({
          ...prev,
          [interviewId]: (prev[interviewId] || []).map((attempt) =>
            attempt.id === attemptId ? { ...attempt, allowReattempt: !currentAllowValue } : attempt
          ),
        }));
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

        const existingEmails = (selectedInterview.candidateEmails || []).map((e) => e.toLowerCase());
        const mergedEmails = Array.from(new Set([
          ...existingEmails,
          ...validEmails.map((e) => e.toLowerCase()),
        ]));
        const existingCandidateData = ((selectedInterview as any).candidateData || []) as any[];
        const mergedCandidateData = [...existingCandidateData];
        for (const candidate of candidateDataToAdd) {
          const idx = mergedCandidateData.findIndex(
            (c) => (c.email || '').toLowerCase() === candidate.email.toLowerCase()
          );
          if (idx >= 0) mergedCandidateData[idx] = { ...mergedCandidateData[idx], ...candidate };
          else mergedCandidateData.push(candidate);
        }

        await rds.updateInterview(selectedInterview.id, {
            candidateEmails: mergedEmails,
            candidateData: mergedCandidateData,
        });
        setSelectedInterview({
          ...selectedInterview,
          candidateEmails: mergedEmails,
          candidateData: mergedCandidateData,
        } as any);
        setInterviews((prev) => prev.map((inv) =>
          inv.id === selectedInterview.id
            ? { ...inv, candidateEmails: mergedEmails, candidateData: mergedCandidateData } as any
            : inv
        ));
        
        const bulkOpt = extractJobDetailsOptions(selectedInterview, userProfile, user);

        let emailCount = 0;
        if (validEmails.length > 0) {
            setSendingProgressMsg(`Sending ${validEmails.length} invitation email(s)...`);
            const result = await sendInterviewInvitations(
                validEmails,
                selectedInterview.title,
                selectedInterview.interviewLink || '',
                selectedInterview.accessCode,
                false,
                bulkOpt
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
                bulkOpt
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
      (interview.jobNumber || (interview as any).jobNo || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
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
  const totalResponses = Object.values(submissionsMap).reduce<number>((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);

  return (
    <div className="-mx-4 -my-8 sm:-mx-6 lg:-mx-8 flex h-[calc(100vh-3.5rem)] min-h-0 flex-col overflow-hidden bg-slate-50 dark:bg-[#000] text-slate-900 dark:text-white">

      {/* Header */}
      <section className="shrink-0 border-b border-slate-200 dark:border-white/[0.11] bg-white dark:bg-[#000]">
        <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-7 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link to="/recruiter/dashboard" className="geist-caption inline-flex h-8 items-center gap-2 rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-slate-100 dark:bg-white/[0.03] px-3 font-medium text-slate-700 dark:text-[#d4d4d4] transition-colors hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white">
              <i className="fas fa-arrow-left text-[11px]"></i>
              <span>Dashboard</span>
            </Link>
            <h1 className="geist-page-title mt-2 text-slate-900 dark:text-white">My Interviews</h1>
            <p className="geist-small mt-1 text-slate-600 dark:text-[#8f8f8f]">Manage all your scheduled interviews.</p>
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
              className={`geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border px-3 font-medium transition-colors ${interviewLimitReached ? 'cursor-not-allowed border-red-500/30 bg-red-500/10 text-red-400' : 'border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-black hover:bg-slate-800 dark:hover:bg-[#eaeaea]'}`}
            >
              <i className="fas fa-plus text-[11px]"></i>
              <span>{interviewLimitReached ? 'Interview limit reached' : 'Create Job'}</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Strip */}
      <section className="grid shrink-0 grid-cols-2 border-b border-slate-200 dark:border-white/[0.11] bg-white dark:bg-transparent lg:grid-cols-4">
        <div className="border-r border-slate-200 dark:border-white/[0.11] px-4 py-4 sm:px-6 lg:px-7">
          <p className="geist-label uppercase text-slate-500 dark:text-[#6b7280]">Total</p>
          <p className="geist-metric mt-2 tabular-nums text-slate-900 dark:text-white">{interviews.length}</p>
        </div>
        <div className="border-r border-slate-200 dark:border-white/[0.11] px-4 py-4 sm:px-6 lg:px-7">
          <p className="geist-label uppercase text-slate-500 dark:text-[#6b7280]">Active</p>
          <p className="geist-metric mt-2 tabular-nums text-emerald-600 dark:text-[#83d0a3]">{activeInterviews}</p>
        </div>
        <div className="border-r border-slate-200 dark:border-white/[0.11] px-4 py-4 sm:px-6 lg:px-7">
          <p className="geist-label uppercase text-slate-500 dark:text-[#6b7280]">Expired</p>
          <p className="geist-metric mt-2 tabular-nums text-red-600 dark:text-[#ff8f8f]">{expiredInterviews}</p>
        </div>
        <div className="px-4 py-4 sm:px-6 lg:px-7">
          <p className="geist-label uppercase text-slate-500 dark:text-[#6b7280]">Responses</p>
          <p className="geist-metric mt-2 tabular-nums text-slate-900 dark:text-white">{totalResponses}</p>
        </div>
      </section>

      {/* Search & Filter Bar */}
      <section className="shrink-0 border-b border-slate-200 dark:border-white/[0.11] bg-white dark:bg-transparent">
        <div className="flex flex-col gap-3 px-4 py-3 sm:px-6 lg:px-7 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-auto sm:min-w-[220px] xl:max-w-xs">
              <i className="fas fa-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 dark:text-[#6b7280]"></i>
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search interviews..."
                className="geist-caption h-9 w-full rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-slate-50 dark:bg-white/[0.03] pl-9 pr-3 text-slate-900 dark:text-white outline-none transition-colors placeholder:text-slate-400 dark:placeholder:text-[#6b7280] focus:border-slate-400 dark:focus:border-white/[0.28] focus:bg-white dark:focus:bg-white/[0.05]"
              />
            </div>
            <div className="flex rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-slate-100 dark:bg-white/[0.03] p-0.5">
              <button
                type="button"
                onClick={() => setStatusFilter('active')}
                className={`geist-caption inline-flex h-7 items-center gap-1.5 rounded-[4px] px-3 font-medium transition-colors cursor-pointer ${statusFilter === 'active' ? 'bg-emerald-100 dark:bg-[#071a12] text-emerald-800 dark:text-[#83d0a3] font-semibold' : 'text-slate-600 dark:text-[#6b7280] hover:text-slate-900 dark:hover:text-[#d4d4d4]'}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${statusFilter === 'active' ? 'bg-emerald-500 dark:bg-[#50e3c2]' : 'bg-slate-400 dark:bg-[#6b7280]'}`} />
                Active
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('expired')}
                className={`geist-caption inline-flex h-7 items-center gap-1.5 rounded-[4px] px-3 font-medium transition-colors cursor-pointer ${statusFilter === 'expired' ? 'bg-red-100 dark:bg-[#180707] text-red-700 dark:text-[#ff8f8f] font-semibold' : 'text-slate-600 dark:text-[#6b7280] hover:text-slate-900 dark:hover:text-[#d4d4d4]'}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${statusFilter === 'expired' ? 'bg-red-500 dark:bg-[#ff6b6b]' : 'bg-slate-400 dark:bg-[#6b7280]'}`} />
                Expired
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="geist-label uppercase text-slate-500 dark:text-[#6b7280]">Dept</span>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="geist-caption h-9 rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-slate-50 dark:bg-[#050505] px-3 text-slate-800 dark:text-[#d4d4d4] outline-none transition-colors focus:border-slate-400 dark:focus:border-white/[0.28] cursor-pointer"
              >
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-slate-100 dark:bg-white/[0.03] px-2 py-1">
              <div className="flex rounded-[4px] bg-slate-200/60 dark:bg-white/[0.03] p-0.5">
                <button type="button" onClick={() => setDateMode('range')} className={`geist-caption px-2 py-0.5 rounded-[4px] font-medium transition-colors cursor-pointer ${dateMode === 'range' ? 'bg-white dark:bg-white/[0.08] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-[#6b7280] hover:text-slate-900 dark:hover:text-[#d4d4d4]'}`}>Range</button>
                <button type="button" onClick={() => setDateMode('specific')} className={`geist-caption px-2 py-0.5 rounded-[4px] font-medium transition-colors cursor-pointer ${dateMode === 'specific' ? 'bg-white dark:bg-white/[0.08] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-[#6b7280] hover:text-slate-900 dark:hover:text-[#d4d4d4]'}`}>Specific</button>
              </div>
              {dateMode === 'specific' ? (
                <div className="flex items-center gap-1.5">
                  <span className="geist-label uppercase text-slate-500 dark:text-[#6b7280]">On</span>
                  <input type="date" value={specificDate} onChange={(e) => setSpecificDate(e.target.value)} className="geist-caption bg-transparent text-slate-800 dark:text-[#d4d4d4] outline-none dark:[color-scheme:dark]" />
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="geist-label uppercase text-slate-500 dark:text-[#6b7280]">From</span>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="geist-caption bg-transparent text-slate-800 dark:text-[#d4d4d4] outline-none dark:[color-scheme:dark]" />
                  <span className="geist-small text-slate-500 dark:text-[#6b7280]">to</span>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="geist-caption bg-transparent text-slate-800 dark:text-[#d4d4d4] outline-none dark:[color-scheme:dark]" />
                </div>
              )}
            </div>
            {(searchQuery || statusFilter !== 'active' || selectedDept !== 'All' || startDate || endDate || specificDate) && (
              <button
                onClick={() => { setSearchQuery(''); setStatusFilter('active'); setSelectedDept('All'); setStartDate(''); setEndDate(''); setSpecificDate(''); }}
                className="geist-caption inline-flex h-8 items-center justify-center gap-1 rounded-[6px] border border-red-200 dark:border-[#3f1d1d] bg-red-50 dark:bg-[#180707] px-3 font-medium text-red-700 dark:text-[#ff8f8f] transition-colors hover:bg-red-100 dark:hover:bg-[#260b0b] cursor-pointer"
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
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto border-b border-dashed border-slate-200 dark:border-white/[0.11] bg-white dark:bg-transparent px-4 py-16 text-center sm:px-6 lg:px-7">
            <div>
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-slate-100 dark:bg-white/[0.03] text-slate-500 dark:text-[#8f8f8f]">
                <i className="fas fa-video"></i>
              </div>
              <p className="geist-caption mt-4 text-slate-700 dark:text-[#d4d4d4]">You haven't created any interviews yet.</p>
              <Link to="/recruiter/interview/create" className="geist-caption mt-3 inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border border-slate-900 dark:border-white bg-slate-900 dark:bg-white px-3 font-medium text-white dark:text-black transition-colors hover:bg-slate-800 dark:hover:bg-[#eaeaea]">
                <i className="fas fa-plus text-[11px]"></i>
                <span>Create your first job</span>
              </Link>
            </div>
          </div>
        ) : filteredInterviews.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto border-b border-dashed border-slate-200 dark:border-white/[0.11] bg-white dark:bg-transparent px-4 py-16 text-center sm:px-6 lg:px-7">
            <div>
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-slate-100 dark:bg-white/[0.03] text-slate-500 dark:text-[#8f8f8f]">
                <i className="fas fa-search"></i>
              </div>
              <p className="geist-caption mt-4 text-slate-700 dark:text-[#d4d4d4]">No interviews match your filters.</p>
              <button
                onClick={() => { setSearchQuery(''); setStatusFilter('active'); setSelectedDept('All'); setStartDate(''); setEndDate(''); setSpecificDate(''); }}
                className="geist-caption mt-3 inline-flex h-8 items-center justify-center rounded-[6px] border border-red-200 dark:border-[#3f1d1d] bg-red-50 dark:bg-[#180707] px-3 font-medium text-red-700 dark:text-[#ff8f8f] transition-colors hover:bg-red-100 dark:hover:bg-[#260b0b] cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Column Headers */}
            <div className="hidden shrink-0 items-center gap-4 border-b border-slate-200 dark:border-white/[0.11] bg-slate-100 dark:bg-[#000] px-4 py-2 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_90px_110px_90px_80px_80px_230px] lg:px-7">
              <span className="geist-label uppercase text-slate-600 dark:text-[#6b7280]">Name</span>
              <span className="geist-label text-center uppercase text-slate-600 dark:text-[#6b7280]">Status</span>
              <span className="geist-label text-center uppercase text-slate-600 dark:text-[#6b7280]">Department</span>
              <span className="geist-label text-center uppercase text-slate-600 dark:text-[#6b7280]">Difficulty</span>
              <span className="geist-label text-center uppercase text-slate-600 dark:text-[#6b7280]">ID</span>
              <span className="geist-label text-center uppercase text-slate-600 dark:text-[#6b7280]">Deadline</span>
              <span className="geist-label text-right uppercase text-slate-600 dark:text-[#6b7280]">Actions</span>
            </div>

            {/* List Rows */}
            <div className="min-h-0 flex-1 overflow-y-auto bg-white dark:bg-transparent [scrollbar-color:#cbd5e1_#f8fafc] dark:[scrollbar-color:#27272a_#000] [scrollbar-width:thin]">
              {filteredInterviews.map(interview => {
                const candidateCount = (interview.candidateEmails || []).length;
                const status = getInterviewStatus(interview);
                const shortId = interview.id.substring(0, 7);
                const deadlineText = formatDate(getInterviewDeadline(interview));

                return (
                  <article 
                    key={interview.id} 
                    className="grid gap-3 border-b border-slate-200 dark:border-white/[0.08] px-4 py-3 transition-colors hover:bg-slate-100/70 dark:hover:bg-white/[0.025] sm:px-6 lg:grid-cols-[minmax(0,1fr)_90px_110px_90px_80px_80px_230px] lg:items-center lg:gap-4 lg:px-7"
                  >
                    {/* Name */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 truncate">
                        <Link 
                          to={`/recruiter/interview/${interview.id}/overview`}
                          className="geist-caption truncate font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                          title={interview.title}
                        >
                          {interview.title}
                        </Link>
                        {(interview.jobNumber || (interview as any).jobNo) && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 shrink-0">
                            #{interview.jobNumber || (interview as any).jobNo}
                          </span>
                        )}
                      </div>
                      <p className="geist-small mt-0.5 text-slate-500 dark:text-[#8f8f8f]">
                        {candidateCount > 0 ? `${candidateCount} candidates` : 'No candidates invited'}
                      </p>
                    </div>

                    {/* Status */}
                    <div className="flex items-center justify-between gap-3 lg:justify-center">
                      <span className="geist-label uppercase text-slate-500 dark:text-[#6b7280] lg:hidden">Status</span>
                      <span className={`geist-small inline-flex items-center gap-1.5 rounded-[6px] border px-2 py-1 font-mono ${status.pillClass}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${status.dotClass}`} />
                        {status.label}
                      </span>
                    </div>

                    {/* Department */}
                    <div className="flex items-center justify-between gap-3 lg:justify-center">
                      <span className="geist-label uppercase text-slate-500 dark:text-[#6b7280] lg:hidden">Department</span>
                      <span className="geist-small inline-block rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-slate-100 dark:bg-white/[0.03] px-2 py-1 font-medium text-slate-700 dark:text-[#d4d4d4]">
                        {interview.department || "General"}
                      </span>
                    </div>

                    {/* Difficulty */}
                    <div className="flex items-center justify-between gap-3 lg:justify-center">
                      <span className="geist-label uppercase text-slate-500 dark:text-[#6b7280] lg:hidden">Difficulty</span>
                      <span className="geist-small text-slate-600 dark:text-[#8f8f8f]">{interview.difficulty || "Medium"}</span>
                    </div>

                    {/* ID */}
                    <div className="flex items-center justify-between gap-3 lg:justify-center">
                      <span className="geist-label uppercase text-slate-500 dark:text-[#6b7280] lg:hidden">ID</span>
                      <span className="geist-label text-slate-600 dark:text-[#6b7280] font-mono">{shortId}</span>
                    </div>

                    {/* Deadline */}
                    <div className="flex items-center justify-between gap-3 lg:justify-center">
                      <span className="geist-label uppercase text-slate-500 dark:text-[#6b7280] lg:hidden">Deadline</span>
                      <span className="geist-small text-slate-600 dark:text-[#8f8f8f]">{deadlineText}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedInterview(interview);
                          setIsInviteModalOpen(true);
                        }}
                        className="group geist-caption inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] border border-blue-200 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-500/10 px-3 font-semibold text-blue-700 dark:text-blue-400 transition-all hover:border-blue-300 dark:hover:border-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 cursor-pointer shrink-0"
                        title="Add/Invite Candidate to this interview"
                      >
                        <UserPlus size={13} className="text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-white transition-colors shrink-0" />
                        <span className="whitespace-nowrap font-semibold tracking-tight">+ Add Candidate</span>
                      </button>
                      <Link
                        to={`/recruiter/interview/${interview.id}/overview`}
                        className="geist-caption inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-slate-100 dark:bg-white/[0.03] px-3 font-medium text-slate-700 dark:text-[#d4d4d4] transition-colors hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white shrink-0"
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


    {isInviteModalOpen && selectedInterview && (
      <InviteCandidateModal
        job={selectedInterview}
        onClose={() => {
          setIsInviteModalOpen(false);
          setSelectedInterview(null);
        }}
      />
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
                            
                            // Save phone on interview candidateData via RDS
                            try {
                                const currentCandData = (whatsappModal.interview as any).candidateData || [];
                                const index = currentCandData.findIndex((c: any) => c.email.toLowerCase() === whatsappModal.email.toLowerCase());
                                
                                let updatedCandData = [...currentCandData];
                                if (index > -1) {
                                    updatedCandData[index] = { ...updatedCandData[index], phone: whatsappModal.phone };
                                } else {
                                    updatedCandData.push({ email: whatsappModal.email, phone: whatsappModal.phone });
                                }
                                
                                await rds.updateInterview(whatsappModal.interview.id, {
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
                                console.error("Error updating phone on interview:", err);
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
