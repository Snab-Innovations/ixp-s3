import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { useMessageBox } from '../components/MessageBox';
import {
  Flame,
  Search,
  Mail,
  MessageCircle,
  ExternalLink,
  CheckCircle2,
  Clock,
  Send,
  User,
  Phone,
  Briefcase,
  CheckSquare,
  Square,
  Plus,
  ArrowLeft,
  RotateCw,
  Copy,
  Check,
  ChevronDown,
  X,
} from 'lucide-react';
import { sendInterviewInvitations } from '../services/brevoService';
import {
  sendInterviewWhatsAppInvite,
  openWhatsAppWebInvite,
  buildWhatsAppInviteText,
} from '../services/waSenderService';
import { isJobStatusActive } from '../services/jobResolutionService';
import { RecruiterInterviewsSkeleton } from './RecruiterInterviews';

export const parseDeadlineMillis = (deadline: any): number => {
  if (!deadline) return 0;
  if (deadline instanceof Date) return deadline.getTime();
  if (typeof deadline === 'string') {
    const dateMatch = deadline.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateMatch) {
      const [, y, m, d] = dateMatch;
      return new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999).getTime();
    }
    const parsed = Date.parse(deadline);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof deadline?.toMillis === 'function') return deadline.toMillis();
  if (typeof deadline?.toDate === 'function') return deadline.toDate().getTime();
  if (typeof deadline?.seconds === 'number') return deadline.seconds * 1000;
  return 0;
};

export const isDeadlineActive = (_deadline?: any): boolean => {
  return true;
};

export interface HotLeadItem {
  id: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  jobId: string;
  jobTitle: string;
  companyName: string;
  accessCode: string;
  interviewLink: string;
  deadline: string;
  isJobActive?: boolean;
  appliedAt: any;
  // Interview response state
  hasSubmitted: boolean;
  submissionId?: string;
  submittedAt?: any;
  score?: number | string;
  numericScore?: number;
  status?: string;
  summary?: string;
  source?: string;
}

export default function HotLeads() {
  const { user, userProfile } = useAuth();
  const messageBox = useMessageBox();

  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<any[]>([]);
  const [leads, setLeads] = useState<HotLeadItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'responded'>('all');
  const [scoreFilter, setScoreFilter] = useState<'all' | 'high' | 'mid' | 'low'>('all');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);
  const [bulkSending, setBulkSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isJobDropdownOpen, setIsJobDropdownOpen] = useState(false);
  const [jobSearchQuery, setJobSearchQuery] = useState('');
  const jobDropdownRef = useRef<HTMLDivElement>(null);
  const jobSearchInputRef = useRef<HTMLInputElement>(null);

  const userUid = user?.uid;
  const userTeamId = userProfile?.teamId;
  const userParentRecruiterId = userProfile?.parentRecruiterId;
  const isAdmin = userProfile?.role === 'admin';

  // ── 1. Fetch Recruiter Jobs & Applications & Responses ──
  useEffect(() => {
    if (!userUid) return;
    setLoading(true);

    const resolvedTeamId = userTeamId || userParentRecruiterId || userUid;

    let jobsList: any[] = [];
    let applicationsList: any[] = [];
    let responsesList: any[] = [];

    const mergeAllData = () => {
      const jobMap = new Map<string, any>();
      jobsList.forEach((j) => jobMap.set(j.id, j));

      const leadsMap = new Map<string, HotLeadItem>();

      // 1. Ingest all from candidateApplications collection
      applicationsList.forEach((app) => {
        const jobId = app.interviewId || app.jobId;
        const job = jobMap.get(jobId);
        const email = (app.candidateEmail || app.email || '').toLowerCase().trim();
        if (!email) return;

        const uniqueKey = `${email}_${jobId}`;
        const deadline = job?.deadline || job?.deadlineDate || '';

        leadsMap.set(uniqueKey, {
          id: uniqueKey,
          candidateName: app.candidateName || app.name || email.split('@')[0],
          candidateEmail: email,
          candidatePhone: app.candidatePhone || app.phone || '',
          jobId: jobId || '',
          jobTitle: app.jobTitle || job?.title || 'General Role',
          companyName: job?.companyName || job?.company || userProfile?.company || 'Company',
          accessCode: job?.accessCode || job?.jobNo || '',
          interviewLink: job?.interviewLink || `${window.location.origin}/#/interview/${jobId}`,
          deadline,
          isJobActive: isJobStatusActive(job),
          appliedAt: app.appliedAt || app.createdAt,
          hasSubmitted: false,
          source: app.source || 'Job Application',
        });
      });

      // 2. Ingest from candidateData and candidateEmails on jobs
      jobsList.forEach((job) => {
        const deadline = job.deadline || job.deadlineDate || '';
        const candidateDataArr = Array.isArray(job.candidateData) ? job.candidateData : [];
        const candidateEmailsArr = Array.isArray(job.candidateEmails) ? job.candidateEmails : [];

        // Check candidateData
        candidateDataArr.forEach((c: any) => {
          const email = (c?.email || '').toLowerCase().trim();
          if (!email) return;
          const uniqueKey = `${email}_${job.id}`;
          if (!leadsMap.has(uniqueKey)) {
            leadsMap.set(uniqueKey, {
              id: uniqueKey,
              candidateName: c.name || email.split('@')[0],
              candidateEmail: email,
              candidatePhone: c.phone || '',
              jobId: job.id,
              jobTitle: job.title || 'Role',
              companyName: job.companyName || job.company || userProfile?.company || 'Company',
              accessCode: job.accessCode || job.jobNo || '',
              interviewLink: job.interviewLink || `${window.location.origin}/#/interview/${job.id}`,
              deadline,
              isJobActive: isJobStatusActive(job),
              appliedAt: c.appliedAt || c.invitedAt || job.createdAt,
              hasSubmitted: false,
              source: c.source || 'Invited Candidate',
            });
          }
        });

        // Check raw candidateEmails
        candidateEmailsArr.forEach((emailRaw: string) => {
          const email = String(emailRaw || '').toLowerCase().trim();
          if (!email) return;
          const uniqueKey = `${email}_${job.id}`;
          if (!leadsMap.has(uniqueKey)) {
            leadsMap.set(uniqueKey, {
              id: uniqueKey,
              candidateName: email.split('@')[0],
              candidateEmail: email,
              candidatePhone: '',
              jobId: job.id,
              jobTitle: job.title || 'Role',
              companyName: job.companyName || job.company || userProfile?.company || 'Company',
              accessCode: job.accessCode || job.jobNo || '',
              interviewLink: job.interviewLink || `${window.location.origin}/#/interview/${job.id}`,
              deadline,
              isJobActive: isJobStatusActive(job),
              appliedAt: job.createdAt,
              hasSubmitted: false,
              source: 'Direct Lead',
            });
          }
        });
      });

      // 3. Match candidate interview responses / attempts
      responsesList.forEach((resp) => {
        const jobId = resp.interviewId || resp.jobId;
        const candidateEmail = (resp.candidateInfo?.email || resp.candidateEmail || resp.email || '').toLowerCase().trim();
        if (!candidateEmail) return;

        const uniqueKey = `${candidateEmail}_${jobId}`;
        const existingLead = leadsMap.get(uniqueKey);

        const rawScore = resp.score;
        let numScore = 0;
        if (typeof rawScore === 'number') {
          numScore = rawScore > 10 ? rawScore / 10 : rawScore;
        } else if (typeof rawScore === 'string') {
          const parts = rawScore.split('/');
          const val = parseFloat(parts[0]);
          const den = parseFloat(parts[1]) || 10;
          numScore = !isNaN(val) ? (val / den) * 10 : 0;
        }

        const job = jobMap.get(jobId);
        const deadline = job?.deadline || job?.deadlineDate || '';

        if (existingLead) {
          existingLead.hasSubmitted = true;
          existingLead.submissionId = resp.id || resp.attemptId;
          existingLead.submittedAt = resp.submittedAt || resp.savedAt || resp.createdAt;
          existingLead.score = resp.score;
          existingLead.numericScore = numScore;
          existingLead.status = resp.status || (numScore >= 7.5 ? 'Shortlist' : 'Completed');
          existingLead.summary = resp.feedback?.overallFeedback || resp.feedbackSummary || '';
          existingLead.isJobActive = isJobStatusActive(job);
          if (resp.candidateInfo?.phone && !existingLead.candidatePhone) {
            existingLead.candidatePhone = resp.candidateInfo.phone;
          }
        } else {
          leadsMap.set(uniqueKey, {
            id: uniqueKey,
            candidateName: resp.candidateInfo?.name || resp.candidateName || candidateEmail.split('@')[0],
            candidateEmail,
            candidatePhone: resp.candidateInfo?.phone || resp.phone || '',
            jobId: jobId || '',
            jobTitle: resp.jobTitle || job?.title || 'Interview Assessment',
            companyName: job?.companyName || job?.company || userProfile?.company || 'Company',
            accessCode: job?.accessCode || job?.jobNo || '',
            interviewLink: job?.interviewLink || `${window.location.origin}/#/interview/${jobId}`,
            deadline,
            isJobActive: isJobStatusActive(job),
            appliedAt: resp.submittedAt || resp.savedAt || resp.createdAt,
            hasSubmitted: true,
            submissionId: resp.id || resp.attemptId,
            submittedAt: resp.submittedAt || resp.savedAt || resp.createdAt,
            score: resp.score,
            numericScore: numScore,
            status: resp.status || (numScore >= 7.5 ? 'Shortlist' : 'Completed'),
            summary: resp.feedback?.overallFeedback || resp.feedbackSummary || '',
            source: 'Interview Submission',
          });
        }
      });

      const list = Array.from(leadsMap.values());
      // Active jobs policy: candidates are active if job is active or if they have already submitted
      const validLeads = list.filter((lead) => lead.hasSubmitted || lead.isJobActive);
      validLeads.sort((a, b) => {
        const timeA = a.submittedAt?.toMillis
          ? a.submittedAt.toMillis()
          : a.appliedAt?.toMillis
          ? a.appliedAt.toMillis()
          : new Date(a.submittedAt || a.appliedAt || 0).getTime();
        const timeB = b.submittedAt?.toMillis
          ? b.submittedAt.toMillis()
          : b.appliedAt?.toMillis
          ? b.appliedAt.toMillis()
          : new Date(b.submittedAt || b.appliedAt || 0).getTime();
        return timeB - timeA;
      });

      setLeads(validLeads);
      setLoading(false);
    };

    // A. Query Recruiter Jobs & Interviews
    const jobsQ = isAdmin
      ? query(collection(db, 'interviews'))
      : resolvedTeamId && resolvedTeamId !== userUid
      ? query(collection(db, 'interviews'), where('teamId', '==', resolvedTeamId))
      : query(collection(db, 'interviews'), where('recruiterUID', '==', userUid));

    const unsubJobs = onSnapshot(
      jobsQ,
      (snap) => {
        jobsList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setJobs(jobsList);
        mergeAllData();
      },
      (err) => {
        console.error('Error fetching jobs in HotLeads:', err);
        setLoading(false);
      }
    );

    // B. Query Candidate Applications
    const appsQ = query(collection(db, 'candidateApplications'), orderBy('appliedAt', 'desc'));
    const unsubApps = onSnapshot(
      appsQ,
      (snap) => {
        applicationsList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        mergeAllData();
      },
      () => {
        mergeAllData();
      }
    );

    // C. Query Top-Level Candidate Responses
    const respQ = query(collection(db, 'candidateResponses'), orderBy('savedAt', 'desc'));
    const unsubResp = onSnapshot(
      respQ,
      (snap) => {
        responsesList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        mergeAllData();
      },
      () => {
        mergeAllData();
      }
    );

    return () => {
      unsubJobs();
      unsubApps();
      unsubResp();
    };
  }, [userUid, userTeamId, userParentRecruiterId, isAdmin]);

  // ── Filtered Leads ──
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      // Baseline rule: if job is inactive/deactivated and interview not given, don't show in leads
      if (!lead.hasSubmitted && !lead.isJobActive) return false;

      // Tab filter
      if (activeTab === 'pending' && lead.hasSubmitted) return false;
      if (activeTab === 'responded' && !lead.hasSubmitted) return false;

      // Job filter
      if (selectedJobId !== 'all' && lead.jobId !== selectedJobId) return false;

      // Score filter
      if (scoreFilter !== 'all') {
        if (!lead.hasSubmitted) return false;
        const score = lead.numericScore || 0;
        if (scoreFilter === 'high' && score < 7.5) return false;
        if (scoreFilter === 'mid' && (score < 5 || score >= 7.5)) return false;
        if (scoreFilter === 'low' && score >= 5) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const queryLower = searchTerm.toLowerCase();
        const matchesName = lead.candidateName.toLowerCase().includes(queryLower);
        const matchesEmail = lead.candidateEmail.toLowerCase().includes(queryLower);
        const matchesPhone = lead.candidatePhone.toLowerCase().includes(queryLower);
        const matchesJob = lead.jobTitle.toLowerCase().includes(queryLower);
        if (!matchesName && !matchesEmail && !matchesPhone && !matchesJob) return false;
      }

      return true;
    });
  }, [leads, activeTab, selectedJobId, scoreFilter, searchTerm]);

  // ── KPI Metrics ──
  const stats = useMemo(() => {
    const total = leads.length;
    const responded = leads.filter((l) => l.hasSubmitted).length;
    // Only count pending candidates whose job is currently active
    const pending = leads.filter((l) => !l.hasSubmitted && l.isJobActive).length;
    const scores = leads.filter((l) => l.hasSubmitted && l.numericScore !== undefined).map((l) => l.numericScore || 0);
    const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';

    return { total, responded, pending, avgScore };
  }, [leads]);

  // Click outside & Escape key handler for job dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (jobDropdownRef.current && !jobDropdownRef.current.contains(event.target as Node)) {
        setIsJobDropdownOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsJobDropdownOpen(false);
      }
    };
    if (isJobDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isJobDropdownOpen]);

  const leadCountByJob = useMemo(() => {
    const map = new Map<string, number>();
    leads.forEach((lead) => {
      map.set(lead.jobId, (map.get(lead.jobId) || 0) + 1);
    });
    return map;
  }, [leads]);

  const selectedJobTitle = useMemo(() => {
    if (selectedJobId === 'all') return `All Jobs (${jobs.length})`;
    const found = jobs.find((j) => j.id === selectedJobId);
    return found ? (found.title || 'Untitled Role') : 'Selected Job';
  }, [selectedJobId, jobs]);

  const filteredJobsForDropdown = useMemo(() => {
    if (!jobSearchQuery.trim()) return jobs;
    const query = jobSearchQuery.toLowerCase().trim();
    return jobs.filter((j) => {
      const title = (j.title || '').toLowerCase();
      const department = (j.department || j.category || '').toLowerCase();
      const company = (j.companyName || j.company || '').toLowerCase();
      const id = (j.id || '').toLowerCase();
      return title.includes(query) || department.includes(query) || company.includes(query) || id.includes(query);
    });
  }, [jobs, jobSearchQuery]);

  // ── Selection Handlers ──
  const handleSelectAllPending = () => {
    const pendingIds = filteredLeads.filter((l) => !l.hasSubmitted && l.isJobActive).map((l) => l.id);
    if (selectedLeadIds.length === pendingIds.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(pendingIds);
    }
  };

  const toggleSelectLead = (id: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // ── Send WhatsApp Reminder ──
  const handleSendWhatsAppReminder = async (lead: HotLeadItem) => {
    if (!lead.candidatePhone) {
      messageBox.showError(`Phone number missing for candidate ${lead.candidateName}.`);
      return;
    }

    setSendingReminderId(`wa_${lead.id}`);
    try {
      const res = await sendInterviewWhatsAppInvite({
        phone: lead.candidatePhone,
        candidateName: lead.candidateName,
        jobTitle: lead.jobTitle,
        interviewLink: lead.interviewLink,
        accessCode: lead.accessCode,
        isReminder: true,
        options: {
          deadline: lead.deadline,
          recruiterName: userProfile?.name || userProfile?.fullname || 'Recruiter',
          recruiterPhone: userProfile?.phone || '9762588623',
          recruiterUid: userUid,
        },
      });

      if (res.success) {
        messageBox.showSuccess(`WhatsApp reminder sent to ${lead.candidateName}!`);
      } else {
        const text = buildWhatsAppInviteText({
          candidateName: lead.candidateName,
          jobTitle: lead.jobTitle,
          interviewLink: lead.interviewLink,
          accessCode: lead.accessCode,
          isReminder: true,
          options: { deadline: lead.deadline },
        });
        openWhatsAppWebInvite(lead.candidatePhone, text);
        messageBox.showInfo(`Opening WhatsApp Web chat for ${lead.candidateName}...`);
      }
    } catch (err: any) {
      console.error('WhatsApp reminder error:', err);
      const text = buildWhatsAppInviteText({
        candidateName: lead.candidateName,
        jobTitle: lead.jobTitle,
        interviewLink: lead.interviewLink,
        accessCode: lead.accessCode,
        isReminder: true,
        options: { deadline: lead.deadline },
      });
      openWhatsAppWebInvite(lead.candidatePhone, text);
      messageBox.showInfo(`Opening WhatsApp Web chat for ${lead.candidateName}...`);
    } finally {
      setSendingReminderId(null);
    }
  };

  // ── Send Email Reminder ──
  const handleSendEmailReminder = async (lead: HotLeadItem) => {
    setSendingReminderId(`email_${lead.id}`);
    try {
      const result = await sendInterviewInvitations(
        [{ email: lead.candidateEmail, name: lead.candidateName, phone: lead.candidatePhone }],
        lead.jobTitle,
        lead.interviewLink,
        lead.accessCode,
        true,
        {
          deadline: lead.deadline,
          recruiterName: userProfile?.name || userProfile?.fullname || 'Recruiting Team',
          recruiterEmail: userProfile?.email || user?.email || '',
          recruiterUid: userUid,
        }
      );

      if (result.success && result.totalEmails > 0) {
        messageBox.showSuccess(`Interview reminder email sent to ${lead.candidateEmail}!`);
      } else {
        messageBox.showError(result.error || `Failed to send reminder email to ${lead.candidateEmail}.`);
      }
    } catch (err: any) {
      console.error('Email reminder error:', err);
      messageBox.showError('Failed to send reminder email.');
    } finally {
      setSendingReminderId(null);
    }
  };

  // ── Send Both WhatsApp & Email Reminders ──
  const handleSendBothReminders = async (lead: HotLeadItem) => {
    setSendingReminderId(`both_${lead.id}`);
    let emailOk = false;
    let waOk = false;

    // 1. Email
    try {
      const emailRes = await sendInterviewInvitations(
        [{ email: lead.candidateEmail, name: lead.candidateName, phone: lead.candidatePhone }],
        lead.jobTitle,
        lead.interviewLink,
        lead.accessCode,
        true,
        {
          deadline: lead.deadline,
          recruiterName: userProfile?.name || userProfile?.fullname || 'Recruiting Team',
          recruiterEmail: userProfile?.email || user?.email || '',
          recruiterUid: userUid,
        }
      );
      if (emailRes.success && emailRes.totalEmails > 0) emailOk = true;
    } catch (e) {
      console.error('Email send failed:', e);
    }

    // 2. WhatsApp
    if (lead.candidatePhone) {
      try {
        const waRes = await sendInterviewWhatsAppInvite({
          phone: lead.candidatePhone,
          candidateName: lead.candidateName,
          jobTitle: lead.jobTitle,
          interviewLink: lead.interviewLink,
          accessCode: lead.accessCode,
          isReminder: true,
          options: {
            deadline: lead.deadline,
            recruiterName: userProfile?.name || userProfile?.fullname || 'Recruiter',
            recruiterPhone: userProfile?.phone || '9762588623',
            recruiterUid: userUid,
          },
        });
        if (waRes.success) waOk = true;
      } catch (e) {
        console.error('WhatsApp send failed:', e);
      }
    }

    setSendingReminderId(null);
    if (emailOk && waOk) {
      messageBox.showSuccess(`Reminders sent via BOTH Email and WhatsApp to ${lead.candidateName}!`);
    } else if (emailOk) {
      messageBox.showSuccess(`Email reminder sent to ${lead.candidateEmail}.`);
    } else if (waOk) {
      messageBox.showSuccess(`WhatsApp reminder sent to ${lead.candidatePhone}.`);
    } else {
      messageBox.showError(`Failed to send reminders to ${lead.candidateName}.`);
    }
  };

  // ── Send Bulk Reminders ──
  const handleSendBulkReminders = async () => {
    const selectedLeads = leads.filter((l) => selectedLeadIds.includes(l.id) && !l.hasSubmitted && l.isJobActive);
    if (selectedLeads.length === 0) {
      messageBox.showInfo('Please select at least one pending candidate with an active job.');
      return;
    }

    setBulkSending(true);
    let successCount = 0;

    for (const lead of selectedLeads) {
      try {
        await sendInterviewInvitations(
          [{ email: lead.candidateEmail, name: lead.candidateName, phone: lead.candidatePhone }],
          lead.jobTitle,
          lead.interviewLink,
          lead.accessCode,
          true,
          {
            deadline: lead.deadline,
            recruiterName: userProfile?.name || userProfile?.fullname || 'Recruiting Team',
            recruiterEmail: userProfile?.email || user?.email || '',
            recruiterUid: userUid,
          }
        );

        if (lead.candidatePhone) {
          await sendInterviewWhatsAppInvite({
            phone: lead.candidatePhone,
            candidateName: lead.candidateName,
            jobTitle: lead.jobTitle,
            interviewLink: lead.interviewLink,
            accessCode: lead.accessCode,
            isReminder: true,
            options: {
              deadline: lead.deadline,
              recruiterName: userProfile?.name || userProfile?.fullname || 'Recruiter',
              recruiterPhone: userProfile?.phone || '9762588623',
              recruiterUid: userUid,
            },
          });
        }
        successCount++;
      } catch (err) {
        console.warn(`Bulk reminder error for ${lead.candidateEmail}:`, err);
      }
    }

    setBulkSending(false);
    setSelectedLeadIds([]);
    messageBox.showSuccess(`Bulk reminders sent to ${successCount} of ${selectedLeads.length} candidates!`);
  };

  const handleCopyLink = (link: string, id: string) => {
    navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (val: any) => {
    if (!val) return '—';
    try {
      const date = val?.toDate ? val.toDate() : val instanceof Date ? val : new Date(val);
      if (isNaN(date.getTime())) return '—';
      return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
  };

  if (loading) {
    return <RecruiterInterviewsSkeleton />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#000] text-white font-sans pt-1 sm:pt-1.5">
      {/* ── 1. Top Section Header (Matches RecruiterAllJobs / ResumeDump) ── */}
      <section className="shrink-0 border-b border-white/[0.11] bg-[#000]">
        <div className="flex flex-col gap-2.5 px-4 py-2.5 sm:px-6 sm:py-3 lg:px-7 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Link
                to="/recruiter/jobs"
                className="geist-caption inline-flex h-7 items-center gap-1.5 rounded-[5px] border border-white/[0.11] bg-white/[0.03] px-2.5 text-xs font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Dashboard</span>
              </Link>
              <span className="geist-label uppercase text-[#6b7280] text-[10px] tracking-wider font-semibold">Candidate Pipeline</span>
            </div>
            <h1 className="geist-page-title mt-1 text-white flex items-center gap-2">
              <Flame className="w-5 h-5 text-amber-500 fill-amber-500/20 animate-pulse" />
              <span>Hot Leads & Responses</span>
            </h1>
            <p className="geist-small mt-0.5 text-[#8f8f8f] max-w-3xl text-xs">
              Track candidate applications across all posted jobs, view AI interview responses at a glance, and send one-click WhatsApp and Email reminders for pending submissions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <Link
              to="/recruiter/all-jobs"
              className="geist-caption inline-flex h-7 sm:h-8 items-center gap-1.5 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 text-xs font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>All Jobs</span>
            </Link>
            <Link
              to="/recruiter/interview/create"
              className="geist-caption inline-flex h-7 sm:h-8 items-center justify-center gap-1.5 rounded-[6px] border border-white bg-white px-3 text-xs font-semibold text-black transition-colors hover:bg-[#eaeaea]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Job</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── 2. KPI Metrics Bar (Matches RecruiterDashboard Stat Tiles) ── */}
      <section className="border-b border-white/[0.11] bg-[#000]">
        <div className="grid grid-cols-1 divide-y divide-white/[0.11] sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
          <div className="px-4 py-4 sm:px-6 lg:px-7">
            <p className="geist-label uppercase text-[10px] text-[#8f8f8f] font-semibold tracking-wider flex items-center gap-1.5">
              <User className="size-3 text-[#8f8f8f]" />
              <span>Total Hot Leads</span>
            </p>
            <div className="geist-page-title mt-1.5 text-white font-bold">{stats.total}</div>
            <p className="geist-small mt-0.5 text-[11px] text-[#6b7280]">All candidate applicants across jobs</p>
          </div>

          <div className="px-4 py-4 sm:px-6 lg:px-7">
            <p className="geist-label uppercase text-[10px] text-emerald-400 font-semibold tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="size-3 text-emerald-400" />
              <span>Responses Received</span>
            </p>
            <div className="geist-page-title mt-1.5 text-white font-bold">{stats.responded}</div>
            <p className="geist-small mt-0.5 text-[11px] text-[#6b7280]">Completed AI video interviews</p>
          </div>

          <div className="px-4 py-4 sm:px-6 lg:px-7">
            <p className="geist-label uppercase text-[10px] text-amber-500 dark:text-amber-400 font-semibold tracking-wider flex items-center gap-1.5 !bg-transparent">
              <Clock className="size-3 text-amber-500 dark:text-amber-400 !bg-transparent" />
              <span className="!bg-transparent">Awaiting Interview</span>
            </p>
            <div className="geist-page-title mt-1.5 text-white font-bold">{stats.pending}</div>
            <p className="geist-small mt-0.5 text-[11px] text-[#6b7280]">Ready for WhatsApp & Email follow-up</p>
          </div>
        </div>
      </section>

      {/* ── 3. Controls & Filter Section (Matches Platform Toolbar) ── */}
      <section className="border-b border-white/[0.11] bg-[#000] px-4 py-3.5 sm:px-6 lg:px-7">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          
          {/* Segmented Filter Pills */}
          <div className="flex shrink-0 items-center gap-1.5 rounded-[6px] border border-white/[0.16] bg-white/[0.04] p-0.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`geist-caption inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[4px] px-3 font-medium transition-colors ${
                activeTab === 'all'
                  ? 'bg-white text-black font-semibold'
                  : 'text-[#d4d4d4] hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              <span>All Leads</span>
              <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${activeTab === 'all' ? 'bg-black/15 text-black' : 'bg-white/10 text-[#8f8f8f]'}`}>
                {stats.total}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={`geist-caption inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[4px] px-3 font-medium transition-colors !bg-transparent ${
                activeTab === 'pending'
                  ? '!bg-white !text-black font-semibold'
                  : 'text-[#d4d4d4] hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-500 !bg-transparent" />
              <span className="!bg-transparent">Needs Reminder</span>
              <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${activeTab === 'pending' ? 'bg-black/15 text-black' : 'bg-white/10 text-[#8f8f8f]'}`}>
                {stats.pending}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('responded')}
              className={`geist-caption inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[4px] px-3 font-medium transition-colors ${
                activeTab === 'responded'
                  ? 'bg-white text-black font-semibold'
                  : 'text-[#d4d4d4] hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Responses Received</span>
              <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${activeTab === 'responded' ? 'bg-black/15 text-black' : 'bg-emerald-500/20 text-emerald-400'}`}>
                {stats.responded}
              </span>
            </button>
          </div>

          {/* Search & Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Box */}
            <div className="relative w-full sm:w-[220px] lg:w-[260px]">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#8f8f8f]" strokeWidth={1.8} />
              <input
                type="text"
                placeholder="Search candidate, email, phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="geist-caption h-9 w-full rounded-[6px] border border-white/[0.11] bg-[#050505] pl-9 pr-3 text-white outline-none placeholder:text-[#6b7280] focus:border-white/[0.24]"
              />
            </div>

            {/* Searchable Job Filter Dropdown */}
            <div className="relative" ref={jobDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setIsJobDropdownOpen(!isJobDropdownOpen);
                  if (!isJobDropdownOpen) {
                    setTimeout(() => jobSearchInputRef.current?.focus(), 50);
                  }
                }}
                className={`geist-caption h-9 rounded-[6px] border px-2.5 text-xs text-white outline-none transition-colors flex items-center justify-between gap-2 min-w-[170px] max-w-[240px] sm:max-w-[280px] cursor-pointer ${
                  isJobDropdownOpen
                    ? 'border-white/[0.35] bg-white/[0.06]'
                    : selectedJobId !== 'all'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-white/[0.11] bg-[#050505] hover:border-white/[0.24]'
                }`}
                title={selectedJobTitle}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1 text-left">
                  <Briefcase className={`size-3 shrink-0 ${selectedJobId !== 'all' ? 'text-emerald-400' : 'text-[#8f8f8f]'}`} />
                  <span className="truncate">{selectedJobTitle}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {selectedJobId !== 'all' && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedJobId('all');
                        setJobSearchQuery('');
                      }}
                      className="rounded p-0.5 text-[#8f8f8f] hover:text-white hover:bg-white/10"
                      title="Clear job filter"
                    >
                      <X className="size-3" />
                    </span>
                  )}
                  <ChevronDown
                    className={`size-3 text-[#8f8f8f] transition-transform duration-200 ${
                      isJobDropdownOpen ? 'rotate-180 text-white' : ''
                    }`}
                  />
                </div>
              </button>

              {isJobDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 z-50 w-[290px] sm:w-[320px] rounded-[8px] border border-white/[0.15] bg-[#0d0d10] shadow-2xl backdrop-blur-xl overflow-hidden">
                  {/* Search input inside dropdown */}
                  <div className="relative border-b border-white/[0.08] p-2 bg-white/[0.02]">
                    <Search className="absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-[#8f8f8f]" />
                    <input
                      ref={jobSearchInputRef}
                      type="text"
                      placeholder="Search jobs by title, department..."
                      value={jobSearchQuery}
                      onChange={(e) => setJobSearchQuery(e.target.value)}
                      className="h-8 w-full rounded-[5px] border border-white/[0.1] bg-black/60 pl-8 pr-7 text-xs text-white placeholder:text-[#6b7280] outline-none focus:border-white/[0.28]"
                    />
                    {jobSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setJobSearchQuery('');
                          jobSearchInputRef.current?.focus();
                        }}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8f8f8f] hover:text-white"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>

                  {/* List of jobs */}
                  <div className="max-h-[260px] overflow-y-auto divide-y divide-white/[0.04]">
                    {/* All Jobs option */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedJobId('all');
                        setIsJobDropdownOpen(false);
                        setJobSearchQuery('');
                      }}
                      className={`w-full text-left px-3 py-2.5 text-xs flex items-center justify-between gap-2 hover:bg-white/[0.05] transition-colors ${
                        selectedJobId === 'all' ? 'bg-white/[0.08] text-white font-semibold' : 'text-[#d4d4d4]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">All Jobs ({jobs.length})</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-[#8f8f8f] font-mono">{leads.length} leads</span>
                        {selectedJobId === 'all' && <Check className="size-3.5 text-emerald-400" />}
                      </div>
                    </button>

                    {/* Filtered jobs */}
                    {filteredJobsForDropdown.length > 0 ? (
                      filteredJobsForDropdown.map((j) => {
                        const count = leadCountByJob.get(j.id) || 0;
                        const isSelected = selectedJobId === j.id;
                        return (
                          <button
                            key={j.id}
                            type="button"
                            onClick={() => {
                              setSelectedJobId(j.id);
                              setIsJobDropdownOpen(false);
                              setJobSearchQuery('');
                            }}
                            className={`w-full text-left px-3 py-2.5 text-xs flex items-center justify-between gap-2 hover:bg-white/[0.05] transition-colors ${
                              isSelected ? 'bg-white/[0.08] text-white font-semibold' : 'text-[#d4d4d4]'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">{j.title || 'Untitled Role'}</div>
                              <div className="text-[10px] text-[#8f8f8f] truncate mt-0.5">
                                {j.department || j.category || j.companyName || 'General'}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {count > 0 ? (
                                <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                  {count} leads
                                </span>
                              ) : (
                                <span className="text-[10px] text-[#6b7280] font-mono">0 leads</span>
                              )}
                              {isSelected && <Check className="size-3.5 text-emerald-400" />}
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-3 py-6 text-center text-xs text-[#8f8f8f]">
                        No jobs matching &ldquo;{jobSearchQuery}&rdquo;
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Score Filter Dropdown */}
            <select
              value={scoreFilter}
              onChange={(e) => setScoreFilter(e.target.value as any)}
              className="geist-caption h-9 rounded-[6px] border border-white/[0.11] bg-[#050505] px-2.5 text-xs text-white outline-none focus:border-white/[0.24] cursor-pointer max-w-[170px]"
            >
              <option value="all" className="bg-[#111]">All Score Ranges</option>
              <option value="high" className="bg-[#111]">Top Score (7.5 - 10)</option>
              <option value="mid" className="bg-[#111]">Medium (5.0 - 7.4)</option>
              <option value="low" className="bg-[#111]">Low (&lt; 5.0)</option>
            </select>

            {/* Bulk Reminder Action */}
            {activeTab !== 'responded' && selectedLeadIds.length > 0 && (
              <button
                type="button"
                onClick={handleSendBulkReminders}
                disabled={bulkSending}
                className="geist-caption inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] border border-amber-500/40 bg-amber-500/10 px-3 font-semibold text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
              >
                {bulkSending ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Send Reminders ({selectedLeadIds.length})</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── 4. Main Leads Table (Matches RecruiterAllJobs / ResumeDump Table) ── */}
      <div className="px-4 py-6 sm:px-6 lg:px-7">
        <div className="rounded-[8px] border border-white/[0.11] bg-[#000] overflow-hidden">
          {filteredLeads.length === 0 ? (
            <div className="py-16 text-center">
              <div className="size-12 rounded-full border border-white/[0.11] bg-white/[0.03] flex items-center justify-center mx-auto mb-3 text-amber-500">
                <Flame className="w-6 h-6" />
              </div>
              <h3 className="geist-subheading text-white">No candidate leads found</h3>
              <p className="geist-small mt-1 text-[#8f8f8f] max-w-sm mx-auto">
                {searchTerm || selectedJobId !== 'all' || scoreFilter !== 'all'
                  ? 'No applicants match the selected filters. Try clearing your search or filter options.'
                  : 'When candidates apply for your posted jobs or submit AI video interviews, they will automatically appear here as hot leads!'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.11] bg-[#050505]">
                    {activeTab !== 'responded' && (
                      <th className="geist-label w-10 px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={handleSelectAllPending}
                          className="text-[#8f8f8f] hover:text-white transition-colors"
                          title="Select all pending leads"
                        >
                          {selectedLeadIds.length > 0 && selectedLeadIds.length === filteredLeads.filter((l) => !l.hasSubmitted).length ? (
                            <CheckSquare className="size-3.5 text-amber-500" />
                          ) : (
                            <Square className="size-3.5" />
                          )}
                        </button>
                      </th>
                    )}
                    <th className="geist-label whitespace-nowrap px-4 py-2.5 uppercase text-[10px] tracking-wider font-semibold text-[#8f8f8f]">
                      Candidate Lead
                    </th>
                    <th className="geist-label whitespace-nowrap px-4 py-2.5 uppercase text-[10px] tracking-wider font-semibold text-[#8f8f8f]">
                      Applied Job Role
                    </th>
                    <th className="geist-label whitespace-nowrap px-4 py-2.5 uppercase text-[10px] tracking-wider font-semibold text-[#8f8f8f]">
                      Application & Deadline
                    </th>
                    <th className="geist-label whitespace-nowrap px-4 py-2.5 uppercase text-[10px] tracking-wider font-semibold text-[#8f8f8f]">
                      Interview Status & Score
                    </th>
                    <th className="geist-label whitespace-nowrap px-4 py-2.5 text-right uppercase text-[10px] tracking-wider font-semibold text-[#8f8f8f]">
                      Actions & Follow-Up
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.07]">
                  {filteredLeads.map((lead) => {
                    const isSelected = selectedLeadIds.includes(lead.id);

                    return (
                      <tr
                        key={lead.id}
                        className={`transition-colors duration-150 ${
                          isSelected ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        {/* Checkbox for pending */}
                        {activeTab !== 'responded' && (
                          <td className="px-3 py-3.5 text-center">
                            {!lead.hasSubmitted && lead.isJobActive ? (
                              <button
                                type="button"
                                onClick={() => toggleSelectLead(lead.id)}
                                className="text-[#8f8f8f] hover:text-white transition-colors"
                              >
                                {isSelected ? (
                                  <CheckSquare className="size-3.5 text-amber-500" />
                                ) : (
                                  <Square className="size-3.5" />
                                )}
                              </button>
                            ) : (
                              <span className="inline-block size-3.5" />
                            )}
                          </td>
                        )}

                        {/* Candidate Details */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="size-8 shrink-0 rounded-full border border-white/[0.12] bg-[#111] text-xs font-semibold text-[#d4d4d4] flex items-center justify-center">
                              {lead.candidateName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="geist-caption truncate text-xs font-semibold text-white flex items-center gap-2">
                                <span>{lead.candidateName}</span>
                                {lead.hasSubmitted && (
                                  <span className="rounded-[4px] border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-bold text-emerald-400">
                                    INTERVIEWED
                                  </span>
                                )}
                              </div>
                              <div className="geist-small text-[11px] text-[#8f8f8f] truncate font-mono mt-0.5">
                                {lead.candidateEmail}
                              </div>
                              {lead.candidatePhone && (
                                <div className="geist-small text-[10px] text-[#6b7280] font-mono flex items-center gap-1 mt-0.5">
                                  <Phone className="size-2.5 text-[#8f8f8f]" />
                                  <span>{lead.candidatePhone}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Applied Job Role */}
                        <td className="px-4 py-3.5">
                          <div className="space-y-0.5">
                            {lead.jobId ? (
                              <Link
                                to={`/recruiter/interview/${lead.jobId}/responses`}
                                className="geist-caption text-xs font-semibold text-white hover:text-blue-400 dark:hover:text-blue-400 transition-colors inline-flex items-center gap-1 group max-w-[240px]"
                                title={`View all candidate responses for ${lead.jobTitle}`}
                              >
                                <span className="truncate group-hover:underline underline-offset-2">{lead.jobTitle}</span>
                                <ExternalLink className="size-3 shrink-0 text-[#8f8f8f] group-hover:text-blue-400 transition-colors" />
                              </Link>
                            ) : (
                              <div className="geist-caption text-xs font-medium text-white truncate max-w-[240px]">
                                {lead.jobTitle}
                              </div>
                            )}
                            <div className="geist-small text-[11px] text-[#8f8f8f] truncate max-w-[240px]">
                              {lead.companyName}
                            </div>
                            {lead.accessCode && (
                              <div className="geist-small text-[10px] text-[#6b7280] font-mono">
                                Code: <span className="text-[#d4d4d4]">{lead.accessCode}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Application & Deadline */}
                        <td className="px-4 py-3.5">
                          <div className="space-y-0.5">
                            <div className="geist-small text-[11px] text-[#8f8f8f]">
                              Applied: <span className="text-white font-medium">{formatDate(lead.appliedAt)}</span>
                            </div>
                            <div className="geist-small text-[10px] text-[#6b7280]">
                              Deadline: <span className="text-[#8f8f8f] dark:text-[#a1a1aa] font-mono !bg-transparent">{formatDate(lead.deadline)}</span>
                            </div>
                            {lead.hasSubmitted && (
                              <div className="geist-small text-[10px] text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="size-3" />
                                <span>Submitted: {formatDate(lead.submittedAt)}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Status & Score At A Glance */}
                        <td className="px-4 py-3.5">
                          {lead.hasSubmitted ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`rounded-[4px] border px-2 py-0.5 text-[11px] font-mono font-bold ${
                                    lead.numericScore && lead.numericScore >= 7.5
                                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                                      : lead.numericScore && lead.numericScore >= 5.0
                                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                                      : 'border-red-500/40 bg-red-500/10 text-red-400'
                                  }`}
                                >
                                  Score: {lead.score || `${lead.numericScore?.toFixed(1)}/10`}
                                </span>
                                <span
                                  className={`rounded-[4px] border px-2 py-0.5 text-[10px] font-semibold ${
                                    lead.status === 'Shortlist'
                                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                      : lead.status === 'Reject'
                                      ? 'border-red-500/30 bg-red-500/10 text-red-400'
                                      : 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                                  }`}
                                >
                                  {lead.status || 'Completed'}
                                </span>
                              </div>
                              {lead.summary && (
                                <p className="geist-small text-[11px] text-[#8f8f8f] truncate max-w-xs" title={lead.summary}>
                                  {lead.summary}
                                </p>
                              )}
                            </div>
                          ) : lead.isJobActive ? (
                            <span className="geist-small inline-flex items-center gap-1.5 rounded-[4px] border border-white/[0.12] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-[#d4d4d4] !bg-transparent">
                              <Clock className="size-3 text-[#8f8f8f] !bg-transparent" />
                              <span className="!bg-transparent">Pending Response</span>
                            </span>
                          ) : (
                            <span className="geist-small inline-flex items-center gap-1.5 rounded-[4px] border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-[10px] font-medium text-[#71717a] !bg-transparent">
                              <Clock className="size-3 text-[#71717a] !bg-transparent" />
                              <span className="!bg-transparent">Job Inactive</span>
                            </span>
                          )}
                        </td>

                        {/* Actions / Follow-up Reminders */}
                        <td className="px-4 py-3.5 text-right">
                          {lead.hasSubmitted ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Link
                                to={lead.submissionId ? `/report/${lead.jobId}/${lead.submissionId}` : `/recruiter/interview/${lead.jobId}/responses`}
                                className="geist-caption inline-flex h-7 items-center justify-center gap-1.5 rounded-[5px] border border-white/[0.15] bg-white/[0.05] px-2.5 text-xs font-medium text-white hover:bg-white/[0.1] transition-colors"
                              >
                                <span>View Report</span>
                                <ExternalLink className="size-3" />
                              </Link>
                            </div>
                          ) : !lead.isJobActive ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="geist-small text-[10px] text-[#71717a] italic">
                                Job Inactive
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              {/* WhatsApp Reminder Button */}
                              <button
                                type="button"
                                onClick={() => handleSendWhatsAppReminder(lead)}
                                disabled={sendingReminderId === `wa_${lead.id}`}
                                title="Send WhatsApp Reminder"
                                className="geist-caption inline-flex h-7 items-center justify-center gap-1 rounded-[5px] border border-emerald-500/30 bg-emerald-500/10 px-2 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                              >
                                {sendingReminderId === `wa_${lead.id}` ? (
                                  <RotateCw className="size-3 animate-spin" />
                                ) : (
                                  <MessageCircle className="size-3" />
                                )}
                                <span>WhatsApp</span>
                              </button>

                              {/* Email Reminder Button */}
                              <button
                                type="button"
                                onClick={() => handleSendEmailReminder(lead)}
                                disabled={sendingReminderId === `email_${lead.id}`}
                                title="Send Email Reminder"
                                className="geist-caption inline-flex h-7 items-center justify-center gap-1 rounded-[5px] border border-blue-500/30 bg-blue-500/10 px-2 text-xs font-medium text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                              >
                                {sendingReminderId === `email_${lead.id}` ? (
                                  <RotateCw className="size-3 animate-spin" />
                                ) : (
                                  <Mail className="size-3" />
                                )}
                                <span>Email</span>
                              </button>

                              {/* Dual Reminder (Both) */}
                              <button
                                type="button"
                                onClick={() => handleSendBothReminders(lead)}
                                disabled={sendingReminderId === `both_${lead.id}`}
                                title="Send both Email and WhatsApp reminders"
                                className="geist-caption inline-flex h-7 items-center justify-center gap-1 rounded-[5px] border border-amber-500/30 bg-amber-500/10 px-2 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                              >
                                {sendingReminderId === `both_${lead.id}` ? (
                                  <RotateCw className="size-3 animate-spin" />
                                ) : (
                                  <Send className="size-3" />
                                )}
                                <span>Both</span>
                              </button>

                              {/* Copy Interview Link Button */}
                              <button
                                type="button"
                                onClick={() => handleCopyLink(lead.interviewLink, lead.id)}
                                title="Copy Candidate Interview Link"
                                className="geist-caption inline-flex h-7 items-center justify-center rounded-[5px] border border-white/[0.11] bg-white/[0.03] px-2 text-xs font-medium text-[#d4d4d4] hover:bg-white/[0.06] hover:text-white transition-colors"
                              >
                                {copiedId === lead.id ? (
                                  <Check className="size-3 text-emerald-400" />
                                ) : (
                                  <Copy className="size-3" />
                                )}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
