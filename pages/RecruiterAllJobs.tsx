import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, onSnapshot, where, doc, updateDoc, deleteDoc, arrayUnion, getDocs } from 'firebase/firestore';

import { db } from '../services/firebase';

import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { useMessageBox } from '../components/MessageBox';
import { sendInterviewInvitations } from '../services/brevoService';
import { parseCandidateDocument } from '../services/candidateFileParser';
import { ingestResumeFile, saveResumeDumpCandidate } from '../services/resumeService';
import { sendInterviewWhatsAppInvite, formatPhoneForWhatsApp, buildWhatsAppInviteText, openWhatsAppWebInvite, sendBulkWhatsAppInvites } from '../services/waSenderService';
import EditJobModal from './EditJob';
import { useBackgroundSend } from '../context/BackgroundSendContext';
import { LocationCityInput } from '../components/LocationCityInput';
import { EducationInput } from '../components/EducationInput';
import {
  Briefcase,
  Search,
  Filter,
  UserPlus,
  Edit,
  Eye,
  X,
  Calendar,
  MapPin,
  Building,
  Copy,
  Check,
  Mail,
  Plus,
  Users,
  CheckCircle2,
  Trash2,
  Layers,
  FileText,
  DollarSign,
  Award,
  BookOpen,
  ArrowLeft,
  Sparkles,
  Phone,
  MessageSquare,
  Clock,
  Send,
  Bell
} from 'lucide-react';



export interface AllJobItem {
  id: string;
  title: string;
  companyName?: string;
  location?: string;
  category?: string;
  department?: string;
  employmentType?: string;
  description?: string;
  skills?: string[] | string;
  qualifications?: string;
  education?: string;
  minExperience?: number | string;
  maxExperience?: number | string;
  experience?: number | string;
  minSalary?: number | string;
  maxSalary?: number | string;
  salary?: string;
  salaryRange?: string;
  accessCode?: string;
  interviewLink?: string;
  candidateEmails?: string[];
  createdAt?: any;
  updatedAt?: any;
  deadline?: any;
  applyDeadline?: any;
  customFields?: { id?: number; key: string; value: string }[];
  recruiterUID?: string;
  hasJobDoc?: boolean;
  hasInterviewDoc?: boolean;
}

const parseDeadlineMillis = (deadline: any): number => {
  if (!deadline) return 0;
  if (deadline instanceof Date) return deadline.getTime();
  if (typeof deadline === 'string') {
    const dateMatch = deadline.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateMatch) {
      const [, y, m, d] = dateMatch;
      return new Date(Number(y), Number(m) - 1, Number(d)).getTime();
    }
    const parsed = Date.parse(deadline);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof deadline?.toMillis === 'function') return deadline.toMillis();
  if (typeof deadline?.toDate === 'function') return deadline.toDate().getTime();
  if (typeof deadline?.seconds === 'number') return deadline.seconds * 1000;
  return 0;
};

const formatDate = (dateVal: any) => {
  const millis = parseDeadlineMillis(dateVal);
  if (!millis) return 'Open Application';
  return new Date(millis).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatSkillsList = (skillsRaw: string[] | string | undefined): string[] => {
  if (!skillsRaw) return [];
  if (Array.isArray(skillsRaw)) return skillsRaw.map(s => s.trim()).filter(Boolean);
  return skillsRaw.split(',').map(s => s.trim()).filter(Boolean);
};

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

const RecruiterAllJobs: React.FC = () => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const messageBox = useMessageBox();
  const { startBackgroundSend } = useBackgroundSend();

  const [jobs, setJobs] = useState<AllJobItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedEmploymentType, setSelectedEmploymentType] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Expired'>('All');

  // Modals
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [viewingJobDetails, setViewingJobDetails] = useState<AllJobItem | null>(null);
  const [invitingJob, setInvitingJob] = useState<AllJobItem | null>(null);

  // Invite candidate state
  const [inviteMode, setInviteMode] = useState<'single' | 'bulk' | 'invited' | 'ai_suggest'>('single');
  const [candidateEmailsInput, setCandidateEmailsInput] = useState('');
  const [inviteEmailsList, setInviteEmailsList] = useState<string[]>([]);
  const [parsedCandidates, setParsedCandidates] = useState<{ email: string; phone: string; name?: string; experience?: string }[]>([]);
  const [currentSingleName, setCurrentSingleName] = useState('');
  const [currentSingleEmail, setCurrentSingleEmail] = useState('');
  const [currentSinglePhone, setCurrentSinglePhone] = useState('');
  const [currentSingleExp, setCurrentSingleExp] = useState('');
  const [currentSingleLocation, setCurrentSingleLocation] = useState('');
  const [currentSingleEducation, setCurrentSingleEducation] = useState('B.Tech / B.E. (Bachelor of Engineering / Technology)');

  // AI Candidate Suggestions State
  const [dumpCandidates, setDumpCandidates] = useState<any[]>([]);
  const [loadingDumpCandidates, setLoadingDumpCandidates] = useState(false);


  const [sendingInvites, setSendingInvites] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [parsingDoc, setParsingDoc] = useState(false);

  // Edit Candidate State inside Invite Modal
  const [editingCandidateEmail, setEditingCandidateEmail] = useState<string | null>(null);
  const [editedEmailValue, setEditedEmailValue] = useState('');
  const [editedPhoneValue, setEditedPhoneValue] = useState('');
  const [savingCandidateEdit, setSavingCandidateEdit] = useState(false);

  // AI Single Candidate Resume Upload State
  const [selectedResumeFile, setSelectedResumeFile] = useState<File | null>(null);
  const [resumeExtraText, setResumeExtraText] = useState('');
  const [analyzingResumeAI, setAnalyzingResumeAI] = useState(false);

  // Delivery Channels State
  const [sendEmailChannel, setSendEmailChannel] = useState<boolean>(true);
  const [sendWhatsAppChannel, setSendWhatsAppChannel] = useState<boolean>(true);
  const [waMinDelay, setWaMinDelay] = useState<number | string>(15);
  const [waMaxDelay, setWaMaxDelay] = useState<number | string>(25);
  const [waDelayUnit, setWaDelayUnit] = useState<'sec' | 'min'>('sec');
  const [sendingProgressMsg, setSendingProgressMsg] = useState('');

  // Reminder States
  const [remindingCandidateEmail, setRemindingCandidateEmail] = useState<string | null>(null);
  const [remindingWhatsAppEmail, setRemindingWhatsAppEmail] = useState<string | null>(null);

  const handleEditCandidate = async (oldEmail: string, newEmail: string, newPhone: string) => {
    if (!invitingJob || !user) return;
    const targetEmail = (newEmail || oldEmail).trim().toLowerCase();
    const targetPhone = (newPhone || '').trim();

    if (!targetEmail) {
      messageBox.showError("Candidate email address cannot be empty.");
      return;
    }

    setSavingCandidateEdit(true);
    try {
      const currentEmails = invitingJob.candidateEmails || [];
      const updatedEmails = currentEmails.map((e: string) =>
        e.toLowerCase() === oldEmail.toLowerCase() ? targetEmail : e
      );

      const currentCandData = (invitingJob as any).candidateData || [];
      const index = currentCandData.findIndex(
        (c: any) => c.email && c.email.toLowerCase() === oldEmail.toLowerCase()
      );

      let updatedCandData = [...currentCandData];
      if (index > -1) {
        updatedCandData[index] = {
          ...updatedCandData[index],
          email: targetEmail,
          phone: targetPhone || 'N/A'
        };
      } else {
        updatedCandData.push({
          email: targetEmail,
          phone: targetPhone || 'N/A',
          name: targetEmail.split('@')[0] || 'Candidate'
        });
      }

      const updatePayload = {
        candidateEmails: updatedEmails,
        candidateData: updatedCandData,
        updatedAt: new Date()
      };

      await Promise.all([
        updateDoc(doc(db, 'interviews', invitingJob.id), updatePayload).catch(() => {}),
        updateDoc(doc(db, 'jobs', invitingJob.id), updatePayload).catch(() => {})
      ]);

      setInvitingJob(prev => prev ? {
        ...prev,
        candidateEmails: updatedEmails,
        candidateData: updatedCandData
      } as any : null);

      messageBox.showSuccess(`✅ Candidate contact details updated successfully!`);
      setEditingCandidateEmail(null);
      setEditedEmailValue('');
      setEditedPhoneValue('');
    } catch (err: any) {
      console.error("Error updating candidate:", err);
      messageBox.showError("Failed to update candidate contact details.");
    } finally {
      setSavingCandidateEdit(false);
    }
  };


  const handleSendEmailReminder = async (candidateEmail: string) => {
    if (!invitingJob) return;
    const targetLink = invitingJob.interviewLink || `${window.location.origin}/#/interview/${invitingJob.id}`;
    
    setRemindingCandidateEmail(candidateEmail);
    try {
      const res = await sendInterviewInvitations(
        [candidateEmail],
        invitingJob.title,
        targetLink,
        invitingJob.accessCode || '',
        true, // isReminder = true
        {
          location: invitingJob.location,
          qualification: invitingJob.qualifications || invitingJob.education,
          experience: ((invitingJob as any).maxExperience > (invitingJob as any).minExperience)
            ? `${(invitingJob as any).minExperience} - ${(invitingJob as any).maxExperience} Years`
            : invitingJob.experience,
          minExperience: (invitingJob as any).minExperience,
          maxExperience: (invitingJob as any).maxExperience,
          gender: (invitingJob as any).gender || (invitingJob as any).genderRequirement,
          salary: invitingJob.salary || invitingJob.salaryRange,
          salaryRange: invitingJob.salaryRange || invitingJob.salary,
          employmentType: (invitingJob as any).employmentType,
          customFields: (invitingJob as any).customFields,
          recruiterName: userProfile?.name || userProfile?.fullname || userProfile?.displayName || (user as any)?.displayName || 'Hiring Team',
          recruiterPhone: userProfile?.phone || userProfile?.phoneNumber || userProfile?.contactNumber || (user as any)?.phoneNumber || '9762588623 / 8484888632'
        }
      );

      if (res.success) {
        messageBox.showSuccess(`✅ Email reminder sent to ${candidateEmail}!`);
      } else {
        messageBox.showError(`Failed to send email reminder: ${res.error}`);
      }
    } catch (err) {
      console.error("Email reminder error", err);
      messageBox.showError("Failed to send email reminder.");
    } finally {
      setRemindingCandidateEmail(null);
    }
  };

  const handleSendWhatsAppReminder = async (candidateEmail: string, candidatePhone?: string) => {
    if (!invitingJob) return;

    const candData = ((invitingJob as any).candidateData || []).find(
      (c: any) => c.email && c.email.toLowerCase() === candidateEmail.toLowerCase()
    );
    const rawPhone = candidatePhone || candData?.phone || parsedCandidates.find(c => c.email.toLowerCase() === candidateEmail.toLowerCase())?.phone || '';
    const formattedPhone = formatPhoneForWhatsApp(rawPhone);

    const recruiterName = userProfile?.name || userProfile?.displayName || userProfile?.fullName || (user as any)?.displayName || user?.email?.split('@')[0] || 'Recruiter';
    const recruiterPhone = userProfile?.phone || userProfile?.phoneNumber || userProfile?.contactNumber || userProfile?.mobile || userProfile?.mobileNumber || userProfile?.whatsappPhone || (user as any)?.phoneNumber || '';

    const inviteOptions = {
      location: invitingJob.location,
      qualification: invitingJob.qualifications || invitingJob.education,
      experience: invitingJob.experience,
      salary: invitingJob.salary || invitingJob.salaryRange,
      recruiterName,
      recruiterPhone,
      whatsappSessionId: userProfile?.whatsappSessionId || '',
      whatsappSessionPasscode: userProfile?.whatsappSessionPasscode || ''
    };

    const messageText = buildWhatsAppInviteText({
      candidateName: candidateEmail.split('@')[0] || 'Candidate',
      jobTitle: invitingJob.title,
      interviewLink: invitingJob.interviewLink || `${window.location.origin}/#/interview/${invitingJob.id}`,
      accessCode: invitingJob.accessCode || '',
      isReminder: true,
      options: inviteOptions
    });

    if (!formattedPhone) {
      messageBox.showError(`Phone number missing for ${candidateEmail}. Please enter mobile number to send WhatsApp reminder.`);
      return;
    }

    setRemindingWhatsAppEmail(candidateEmail);
    try {
      const res = await sendInterviewWhatsAppInvite({
        phone: formattedPhone,
        candidateName: candidateEmail.split('@')[0] || 'Candidate',
        jobTitle: invitingJob.title,
        interviewLink: invitingJob.interviewLink || `${window.location.origin}/#/interview/${invitingJob.id}`,
        accessCode: invitingJob.accessCode || '',
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
      console.error("WhatsApp reminder error", err);
      openWhatsAppWebInvite(formattedPhone, messageText);
    } finally {
      setRemindingWhatsAppEmail(null);
    }
  };


  useEffect(() => {
    if (!invitingJob || !user) return;
    setLoadingDumpCandidates(true);
    const teamId = userProfile?.teamId || userProfile?.parentRecruiterId || user.uid;
    const q = teamId
      ? query(collection(db, 'resumeDumpCandidates'), where('teamId', '==', teamId))
      : query(collection(db, 'resumeDumpCandidates'), where('recruiterUID', '==', user.uid));

    getDocs(q).then((snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDumpCandidates(list);
    }).catch((err) => {
      console.error("Error fetching dump candidates for suggestions:", err);
    }).finally(() => {
      setLoadingDumpCandidates(false);
    });
  }, [invitingJob, user, userProfile]);

  const aiSuggestedCandidates = useMemo(() => {
    if (!invitingJob) return [];
    const alreadyInvited = invitingJob.candidateEmails || [];
    return getAISuggestedCandidatesForJob(invitingJob, dumpCandidates, alreadyInvited);
  }, [invitingJob, dumpCandidates]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }


    setLoading(true);
    const teamId = userProfile?.teamId || userProfile?.parentRecruiterId || user.uid;

    const jobsQuery = teamId
      ? query(collection(db, 'jobs'), where('teamId', '==', teamId))
      : query(collection(db, 'jobs'), where('recruiterUID', '==', user.uid));

    const interviewsQuery = teamId
      ? query(collection(db, 'interviews'), where('teamId', '==', teamId))
      : query(collection(db, 'interviews'), where('recruiterUID', '==', user.uid));

    let fetchedJobs: any[] = [];
    let fetchedInterviews: any[] = [];

    const mergeAndSetJobs = (jobsList: any[], interviewsList: any[]) => {
      const jobMap = new Map<string, AllJobItem>();

      jobsList.forEach((j) => {
        jobMap.set(j.id, {
          id: j.id,
          title: j.title || 'Untitled Role',
          companyName: j.companyName || userProfile?.company || 'Company',
          location: j.location || 'Remote',
          category: j.category || j.department || 'General',
          department: j.department || j.category,
          employmentType: j.employmentType || 'Full-time',
          description: j.description || '',
          skills: j.skills || [],
          qualifications: j.qualifications || j.education || '',
          education: j.education || j.qualifications || '',
          minExperience: j.minExperience ?? j.experience ?? 0,
          maxExperience: j.maxExperience ?? j.experience ?? 0,
          experience: j.experience ?? 0,
          salary: j.salary || j.salaryRange || '',
          salaryRange: j.salaryRange || j.salary || '',
          accessCode: j.accessCode || '',
          interviewLink: j.interviewLink || `${window.location.origin}/#/interview/${j.id}`,
          candidateEmails: j.candidateEmails || [],
          candidateData: j.candidateData || [],
          createdAt: j.createdAt || j.postedAt || j.updatedAt,
          deadline: j.applyDeadline || j.deadline,
          customFields: j.customFields || [],
          recruiterUID: j.recruiterUID,
          hasJobDoc: true,
          hasInterviewDoc: false,
        });
      });

      interviewsList.forEach((i) => {
        const existing = jobMap.get(i.id);
        const title = i.title ? i.title.replace(/\s+Interview$/i, '').trim() : 'Untitled Role';
        jobMap.set(i.id, {
          id: i.id,
          title: title || existing?.title || 'Untitled Role',
          companyName: existing?.companyName || userProfile?.company || 'Company',
          location: i.location || existing?.location || 'Remote',
          category: i.department || existing?.category || 'General',
          department: i.department || existing?.department,
          employmentType: i.employmentType || existing?.employmentType || 'Full-time',
          description: i.description || existing?.description || '',
          skills: i.skills || existing?.skills || [],
          qualifications: i.qualifications || i.education || existing?.qualifications || '',
          education: i.education || i.qualification || existing?.education || '',
          minExperience: i.minExperience ?? i.experience ?? existing?.minExperience ?? 0,
          maxExperience: i.maxExperience ?? i.experience ?? existing?.maxExperience ?? 0,
          experience: i.experience ?? existing?.experience ?? 0,
          salary: i.salary || i.salaryRange || existing?.salary || '',
          salaryRange: i.salaryRange || i.salary || existing?.salaryRange || '',
          accessCode: i.accessCode || existing?.accessCode || '',
          interviewLink: i.interviewLink || existing?.interviewLink || `${window.location.origin}/#/interview/${i.id}`,
          candidateEmails: i.candidateEmails || existing?.candidateEmails || [],
          candidateData: i.candidateData || existing?.candidateData || [],

          createdAt: existing?.createdAt || i.createdAt || i.updatedAt,
          deadline: existing?.deadline || i.deadline || i.applyDeadline,
          customFields: i.customFields || existing?.customFields || [],
          recruiterUID: i.recruiterUID || existing?.recruiterUID,
          hasJobDoc: existing?.hasJobDoc || false,
          hasInterviewDoc: true,
        });
      });

      const mergedList = Array.from(jobMap.values()).sort((a, b) => {
        const timeA = parseDeadlineMillis(a.createdAt);
        const timeB = parseDeadlineMillis(b.createdAt);
        return timeB - timeA;
      });

      setJobs(mergedList);
      setLoading(false);
    };

    const unsubJobs = onSnapshot(jobsQuery, (snap) => {
      fetchedJobs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      mergeAndSetJobs(fetchedJobs, fetchedInterviews);
    }, (err) => {
      console.error("Error fetching jobs", err);
      setLoading(false);
    });

    const unsubInterviews = onSnapshot(interviewsQuery, (snap) => {
      fetchedInterviews = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((d: any) => d.isMock !== true);
      mergeAndSetJobs(fetchedJobs, fetchedInterviews);
    }, (err) => {
      console.error("Error fetching interviews", err);
      setLoading(false);
    });

    return () => {
      unsubJobs();
      unsubInterviews();
    };
  }, [user, userProfile]);

  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach(j => {
      if (j.category) set.add(j.category);
      if (j.department) set.add(j.department);
    });
    return ['All', ...Array.from(set)];
  }, [jobs]);

  const employmentTypesList = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach(j => {
      if (j.employmentType) set.add(j.employmentType);
    });
    return ['All', ...Array.from(set)];
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const now = Date.now();
    return jobs.filter(job => {
      const search = searchQuery.toLowerCase().trim();
      const skillsStr = formatSkillsList(job.skills).join(' ').toLowerCase();
      const matchesSearch = !search ||
        job.title.toLowerCase().includes(search) ||
        (job.companyName && job.companyName.toLowerCase().includes(search)) ||
        (job.description && job.description.toLowerCase().includes(search)) ||
        (job.location && job.location.toLowerCase().includes(search)) ||
        (job.category && job.category.toLowerCase().includes(search)) ||
        skillsStr.includes(search);

      const matchesCategory = selectedCategory === 'All' ||
        job.category === selectedCategory ||
        job.department === selectedCategory;

      const matchesType = selectedEmploymentType === 'All' ||
        job.employmentType === selectedEmploymentType;

      const deadlineMillis = parseDeadlineMillis(job.deadline);
      const isExpired = deadlineMillis > 0 && deadlineMillis < now;
      const matchesStatus = statusFilter === 'All' ||
        (statusFilter === 'Active' && !isExpired) ||
        (statusFilter === 'Expired' && isExpired);

      return matchesSearch && matchesCategory && matchesType && matchesStatus;
    });
  }, [jobs, searchQuery, selectedCategory, selectedEmploymentType, statusFilter]);

  const canUserDeleteJob = (): boolean => {
    if (!user || !userProfile) return false;
    if (
      userProfile.role === 'subrecruiter' ||
      userProfile.role === 'team_member' ||
      Boolean(userProfile.parentRecruiterId) ||
      Boolean(userProfile.primaryRecruiterUID)
    ) {
      return false;
    }
    const role = (userProfile.role || '').toLowerCase();
    return role === 'primary' || role === 'owner' || role === 'admin' || role === 'recruiter';
  };

  const handleDeleteJob = (jobId: string, title: string) => {
    if (!canUserDeleteJob()) {
      messageBox.showError("Only the main primary recruiter can delete jobs.");
      return;
    }

    messageBox.showConfirm(`Are you sure you want to delete "${title}"?`, async () => {
      try {
        await Promise.all([
          deleteDoc(doc(db, 'jobs', jobId)).catch(() => {}),
          deleteDoc(doc(db, 'interviews', jobId)).catch(() => {})
        ]);
        messageBox.showSuccess(`Job "${title}" deleted successfully.`);
        if (viewingJobDetails?.id === jobId) {
          setViewingJobDetails(null);
        }
      } catch (err) {
        console.error("Failed to delete job", err);
        messageBox.showError("Failed to delete job. Please try again.");
      }
    });
  };

  const handleAddCandidate = () => {
    const trimmedName = currentSingleName.trim();
    const trimmedEmail = currentSingleEmail.trim().toLowerCase();
    const trimmedPhone = currentSinglePhone.trim();
    const expText = currentSingleExp.trim() ? `${currentSingleExp.trim()} yrs` : 'N/A';
    const locText = currentSingleLocation.trim() || 'N/A';

    if (!trimmedEmail && !trimmedPhone) {
      messageBox.showError("Please enter an email address or WhatsApp phone number.");
      return;
    }

    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      messageBox.showError("Please enter a valid email address.");
      return;
    }

    const targetEmail = trimmedEmail || `${trimmedPhone.replace(/[^0-9]/g, '')}@whatsapp.local`;
    const candidateDisplayName = trimmedName || (trimmedEmail ? trimmedEmail.split('@')[0] : 'Candidate');

    if (!inviteEmailsList.includes(targetEmail)) {
      setInviteEmailsList(prev => [...prev, targetEmail]);
    }

    setParsedCandidates(prev => [
      ...prev.filter(c => c.email.toLowerCase() !== targetEmail.toLowerCase()),
      { email: targetEmail, phone: trimmedPhone || 'N/A', name: candidateDisplayName, experience: expText, location: locText }
    ]);

    setCurrentSingleName('');
    setCurrentSingleEmail('');
    setCurrentSinglePhone('');
    setCurrentSingleExp('');
    setCurrentSingleLocation('');
  };

  const handleRemoveEmail = (email: string) => {
    setInviteEmailsList(prev => prev.filter(e => e !== email));
  };


  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setParsingDoc(true);
    try {
      const extractedEmails: string[] = [];
      const newParsed: { email: string; phone: string; name?: string; experience?: string }[] = [];
      for (const f of Array.from(files)) {
        const file = f as File;
        const candidates = await parseCandidateDocument(file);
        candidates.forEach(c => {
          const email = (c.email || '').toLowerCase().trim();
          const phone = (c.phone || '').trim();
          const name = c.name || 'Candidate';
          const targetEmail = email || (phone ? `${phone.replace(/[^0-9]/g, '')}@whatsapp.local` : '');
          if (targetEmail) {
            if (!extractedEmails.includes(targetEmail)) {
              extractedEmails.push(targetEmail);
            }
            newParsed.push({ email: targetEmail, phone: phone || 'N/A', name, experience: 'N/A' });
          }
        });
      }
      if (extractedEmails.length > 0) {
        setInviteEmailsList(prev => Array.from(new Set([...prev, ...extractedEmails])));
        setParsedCandidates(prev => [...prev, ...newParsed]);
        messageBox.showSuccess(`Extracted ${extractedEmails.length} candidate contact(s) from uploaded document(s).`);
      } else {
        messageBox.showInfo("No valid candidate contacts found in the document.");
      }
    } catch (err) {
      console.error("Document parse error", err);
      messageBox.showError("Failed to parse candidate document.");
    } finally {
      setParsingDoc(false);
      e.target.value = '';
    }
  };

  // AI Resume Analysis + Extra Text + Save to Resume Dump Handler
  const handleAnalyzeAndSaveResumeCandidate = async () => {
    if (!selectedResumeFile || !user) {
      messageBox.showError("Please select a candidate resume file first.");
      return;
    }
    if (!invitingJob) return;

    if (!currentSingleLocation.trim()) {
      messageBox.showError("Candidate Location / City is mandatory for proper filtering. Please enter or select a city.");
      return;
    }

    if (!currentSingleExp.trim()) {
      messageBox.showError("Candidate Experience in Years is mandatory for proper filtering. Please enter experience.");
      return;
    }

    if (!currentSingleEducation.trim()) {
      messageBox.showError("Highest Education Qualification is mandatory for proper filtering. Please select candidate education.");
      return;
    }

    const parsedExpNum = parseFloat(currentSingleExp.trim());
    if (isNaN(parsedExpNum)) {
      messageBox.showError("Please enter a valid numeric experience in years (e.g. 1.5 or 3).");
      return;
    }

    setAnalyzingResumeAI(true);
    try {
      // 1. Parse resume file + analyze with AI
      const { profile, resumeText, resumeUrl } = await ingestResumeFile(
        selectedResumeFile,
        {},
        '',
        resumeExtraText
      );

      // Mandatory overrides for location and experience
      profile.location = currentSingleLocation.trim();
      profile.totalExperienceYears = parsedExpNum;
      if (currentSingleEducation.trim()) {
        const selectedDegree = currentSingleEducation.trim();
        const existingEdu = profile.education || [];
        profile.education = [
          { degree: selectedDegree, institution: 'Verified Qualification', year: '' },
          ...existingEdu.filter(e => e.degree.toLowerCase() !== selectedDegree.toLowerCase())
        ];
      }

      // 2. Save full candidate record into Resume Dump
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
        sourceInterviewId: invitingJob.id,
        sourceJobTitle: invitingJob.title,
      });

      // 3. Extract candidate contact email & phone and store in roster
      const candidateEmail = (profile.email || '').toLowerCase().trim();
      const candidatePhone = (profile.phone || '').trim();
      const candidateName = profile.name || 'Candidate';
      const candExpText = profile.totalExperienceYears !== undefined && profile.totalExperienceYears !== null
        ? `${profile.totalExperienceYears} yrs`
        : 'N/A';
      const targetEmail = candidateEmail || (candidatePhone ? `${candidatePhone.replace(/[^0-9]/g, '')}@whatsapp.local` : '');

      if (targetEmail) {
        if (!inviteEmailsList.includes(targetEmail)) {
          setInviteEmailsList(prev => [...prev, targetEmail]);
        }
        setParsedCandidates(prev => [
          ...prev.filter(c => c.email.toLowerCase() !== targetEmail.toLowerCase()),
          { email: targetEmail, phone: candidatePhone || 'N/A', name: candidateName, experience: candExpText }
        ]);

        messageBox.showSuccess(
          `✅ Candidate "${candidateName}" (${candExpText} Exp) analyzed using AI, saved to Resume Dump, and added to invite list!`
        );
      } else {
        messageBox.showSuccess(
          `✅ Candidate "${candidateName}" analyzed using AI and saved to Resume Dump!`
        );
      }

      // Reset file picker, extra text, experience & location inputs
      setSelectedResumeFile(null);
      setResumeExtraText('');
      setCurrentSingleExp('');
      setCurrentSingleLocation('');
    } catch (err: any) {
      console.error("Error analyzing candidate resume:", err);
      messageBox.showError(`AI extraction failed: ${err.message || 'Failed to analyze candidate resume.'}`);
    } finally {
      setAnalyzingResumeAI(false);
    }
  };

  const handleSendInvites = async (isReminder = false) => {
    if (!invitingJob) return;

    if (!sendEmailChannel && !sendWhatsAppChannel) {
      messageBox.showError("Please select at least one delivery channel (Email or WhatsApp).");
      return;
    }

    const extraInputEmails = candidateEmailsInput
      .split(/[\n,;]/)
      .map(e => e.trim().toLowerCase())
      .filter(e => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    const finalEmails = Array.from(new Set([...inviteEmailsList, ...extraInputEmails]));

    if (finalEmails.length === 0) {
      messageBox.showError("Please enter or upload at least one candidate email.");
      return;
    }

    setSendingInvites(true);
    setSendingProgressMsg(`Preparing candidate ${isReminder ? 'reminders' : 'invitations'}...`);

    try {
      const existingCandidateEmails = invitingJob.candidateEmails || [];
      const updatedCandidateEmails = Array.from(new Set([...existingCandidateEmails, ...finalEmails]));

      const candidateDataToAdd = finalEmails.map(email => {
        const parsed = parsedCandidates.find(c => c.email.toLowerCase() === email.toLowerCase());
        return {
          email: email.toLowerCase(),
          name: parsed?.name || email.split('@')[0] || 'Candidate',
          phone: parsed?.phone || 'N/A',
          experience: parsed?.experience || 'N/A'
        };
      });

      const updatePayload = {
        candidateEmails: updatedCandidateEmails,
        candidateData: arrayUnion(...candidateDataToAdd),
        updatedAt: new Date()
      };

      await Promise.all([
        updateDoc(doc(db, 'interviews', invitingJob.id), updatePayload).catch(() => {}),
        updateDoc(doc(db, 'jobs', invitingJob.id), updatePayload).catch(() => {})
      ]);

      const targetLink = invitingJob.interviewLink || `${window.location.origin}/#/interview/${invitingJob.id}`;

      const candidatesPayload = candidateDataToAdd.map(c => ({
        email: c.email,
        phone: c.phone,
        name: c.name
      }));

      startBackgroundSend({
        candidates: candidatesPayload,
        jobTitle: invitingJob.title,
        interviewLink: targetLink,
        accessCode: invitingJob.accessCode || '',
        isReminder,
        sendEmailChannel,
        sendWhatsAppChannel,
        options: {
          location: invitingJob.location,
          qualification: invitingJob.qualifications || invitingJob.education,
          experience: ((invitingJob as any).maxExperience > (invitingJob as any).minExperience)
            ? `${(invitingJob as any).minExperience} - ${(invitingJob as any).maxExperience} Years`
            : invitingJob.experience,
          minExperience: (invitingJob as any).minExperience,
          maxExperience: (invitingJob as any).maxExperience,
          gender: (invitingJob as any).gender || (invitingJob as any).genderRequirement,
          salary: invitingJob.salary || invitingJob.salaryRange,
          salaryRange: invitingJob.salaryRange || invitingJob.salary,
          employmentType: (invitingJob as any).employmentType,
          customFields: (invitingJob as any).customFields,
          recruiterName: userProfile?.name || userProfile?.fullname || userProfile?.displayName || user?.displayName || 'Hiring Team',
          recruiterPhone: userProfile?.phone || userProfile?.phoneNumber || userProfile?.contactNumber || user?.phoneNumber || '9762588623 / 8484888632',
          recruiterEmail: userProfile?.email || user?.email || '',
          whatsappSessionId: userProfile?.whatsappSessionId || '',
          whatsappSessionPasscode: userProfile?.whatsappSessionPasscode || ''
        },
        waMinDelay: typeof waMinDelay === 'number' ? waMinDelay : (parseInt(waMinDelay) || 15),
        waMaxDelay: typeof waMaxDelay === 'number' ? waMaxDelay : (parseInt(waMaxDelay) || 25),
        waDelayUnit
      });

      messageBox.showSuccess(`🚀 Background ${isReminder ? 'reminders' : 'sending'} started for ${candidatesPayload.length} candidate(s)! You can freely navigate to any page.`);

      setInvitingJob(null);
      setInviteEmailsList([]);
      setParsedCandidates([]);
      setCandidateEmailsInput('');
      setCurrentSingleEmail('');
    } catch (err) {
      console.error("Invite send error", err);
      messageBox.showError("Failed to send invitations. Please try again.");
    } finally {
      setSendingInvites(false);
      setSendingProgressMsg('');
    }
  };

  const handleCopyLink = (link: string) => {

    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#000] text-white font-sans">
      {/* Top Header Section */}
      <section className="shrink-0 border-b border-white/[0.11] bg-[#000]">
        <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-7 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link
              to="/recruiter/jobs"
              className="geist-caption inline-flex h-8 items-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </Link>
            <h1 className="geist-page-title mt-2 text-white">All Job Postings</h1>
            <p className="geist-small mt-1 text-[#8f8f8f]">
              Manage and view all job openings, invite candidates, view detailed descriptions, and edit roles.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/recruiter/interview/create"
              className="geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border border-white bg-white px-3 font-medium text-black transition-colors hover:bg-[#eaeaea]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Job</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Metrics Strip */}
      <section className="grid shrink-0 grid-cols-2 border-b border-white/[0.11] lg:grid-cols-4">
        <div className="border-r border-white/[0.11] px-4 py-4 sm:px-6 lg:px-7">
          <p className="geist-label uppercase text-[#6b7280]">Total Jobs</p>
          <p className="geist-metric mt-2 tabular-nums text-white">{jobs.length}</p>
        </div>
        <div className="border-r border-white/[0.11] px-4 py-4 sm:px-6 lg:px-7">
          <p className="geist-label uppercase text-[#6b7280]">Active Jobs</p>
          <p className="geist-metric mt-2 tabular-nums text-[#83d0a3]">
            {jobs.filter(j => {
              const millis = parseDeadlineMillis(j.deadline);
              return millis === 0 || millis >= Date.now();
            }).length}
          </p>
        </div>
        <div className="border-r border-white/[0.11] px-4 py-4 sm:px-6 lg:px-7">
          <p className="geist-label uppercase text-[#6b7280]">Invited Candidates</p>
          <p className="geist-metric mt-2 tabular-nums text-white">
            {jobs.reduce((acc, j) => acc + (j.candidateEmails?.length || 0), 0)}
          </p>
        </div>
        <div className="px-4 py-4 sm:px-6 lg:px-7">
          <p className="geist-label uppercase text-[#6b7280]">Departments</p>
          <p className="geist-metric mt-2 tabular-nums text-white">
            {categoriesList.length > 1 ? categoriesList.length - 1 : 0}
          </p>
        </div>
      </section>

      {/* Search & Filter Toolbar */}
      <section className="shrink-0 border-b border-white/[0.11] px-4 py-3 sm:px-6 lg:px-7">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="relative w-full sm:w-auto sm:min-w-[260px] xl:max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-[#6b7280] w-3.5 h-3.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search jobs by title, skills, location..."
                className="geist-caption h-9 w-full rounded-[6px] border border-white/[0.11] bg-white/[0.03] pl-9 pr-8 text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-white/[0.28] focus:bg-white/[0.05]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8f8f8f] hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex rounded-[6px] border border-white/[0.11] bg-white/[0.03] p-0.5">
              {(['All', 'Active', 'Expired'] as const).map(status => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`geist-caption inline-flex h-7 items-center gap-1.5 rounded-[4px] px-3 font-medium transition-colors ${
                    statusFilter === status
                      ? status === 'Active'
                        ? 'bg-[#071a12] text-[#83d0a3]'
                        : status === 'Expired'
                        ? 'bg-[#180707] text-[#ff8f8f]'
                        : 'bg-white/[0.08] text-white'
                      : 'text-[#6b7280] hover:text-[#d4d4d4]'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="geist-label uppercase text-[#6b7280]">Dept</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="geist-caption h-9 rounded-[6px] border border-white/[0.11] bg-[#050505] px-3 text-[#d4d4d4] outline-none transition-colors focus:border-white/[0.28]"
              >
                {categoriesList.map(cat => (
                  <option key={cat} value={cat}>{cat === 'All' ? 'All Departments' : cat}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="geist-label uppercase text-[#6b7280]">Type</span>
              <select
                value={selectedEmploymentType}
                onChange={(e) => setSelectedEmploymentType(e.target.value)}
                className="geist-caption h-9 rounded-[6px] border border-white/[0.11] bg-[#050505] px-3 text-[#d4d4d4] outline-none transition-colors focus:border-white/[0.28]"
              >
                {employmentTypesList.map(type => (
                  <option key={type} value={type}>{type === 'All' ? 'All Job Types' : type}</option>
                ))}
              </select>
            </div>

            {(searchQuery || statusFilter !== 'All' || selectedCategory !== 'All' || selectedEmploymentType !== 'All') && (
              <button
                onClick={() => { setSearchQuery(''); setStatusFilter('All'); setSelectedCategory('All'); setSelectedEmploymentType('All'); }}
                className="geist-caption inline-flex h-9 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Main Jobs Listing Content */}
      <div className="flex-1 p-4 sm:p-6 lg:p-7">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-56 rounded-[6px] border border-white/[0.11] bg-white/[0.02] p-4 animate-pulse flex flex-col justify-between"
              >
                <div>
                  <div className="h-3 w-20 bg-white/10 rounded mb-2" />
                  <div className="h-5 w-3/4 bg-white/10 rounded mb-2" />
                  <div className="h-3 w-1/2 bg-white/5 rounded mb-3" />
                  <div className="h-10 w-full bg-white/5 rounded" />
                </div>
                <div className="flex gap-2">
                  <div className="h-8 flex-1 bg-white/10 rounded" />
                  <div className="h-8 flex-1 bg-white/5 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center rounded-[6px] border border-dashed border-white/[0.11] p-12 text-center">
            <div>
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] text-[#8f8f8f]">
                <Briefcase className="w-5 h-5" />
              </div>
              <p className="geist-caption mt-4 text-[#d4d4d4]">No jobs found matching your filters.</p>
              <div className="mt-3 flex justify-center gap-2">
                <button
                  onClick={() => { setSearchQuery(''); setStatusFilter('All'); setSelectedCategory('All'); setSelectedEmploymentType('All'); }}
                  className="geist-caption inline-flex h-8 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  Clear Filters
                </button>
                <Link
                  to="/recruiter/interview/create"
                  className="geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border border-white bg-white px-3 font-medium text-black transition-colors hover:bg-[#eaeaea]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Job</span>
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredJobs.map((job) => {
              const skillsList = formatSkillsList(job.skills);
              const deadlineMillis = parseDeadlineMillis(job.deadline);
              const isExpired = deadlineMillis > 0 && deadlineMillis < Date.now();
              const invitedCount = job.candidateEmails?.length || 0;

              return (
                <article
                  key={job.id}
                  className="group rounded-[6px] border border-white/[0.11] bg-white/[0.02] p-4 transition-all hover:bg-white/[0.04] hover:border-white/[0.22] flex flex-col justify-between"
                >
                  <div>
                    {/* Top Row: Category & Status */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="geist-small inline-block rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-2 py-0.5 font-medium text-[#d4d4d4]">
                        {job.category || job.department || 'General'}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {isExpired ? (
                          <span className="geist-small inline-flex items-center gap-1 rounded-[6px] border border-[#3f1d1d] bg-[#180707] px-2 py-0.5 font-mono text-[#ff8f8f]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#ff6b6b]" />
                            Expired
                          </span>
                        ) : (
                          <span className="geist-small inline-flex items-center gap-1 rounded-[6px] border border-[#0e2f22] bg-[#071a12] px-2 py-0.5 font-mono text-[#83d0a3]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#50e3c2]" />
                            Active
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Job Title & Company */}
                    <h2
                      onClick={() => setViewingJobDetails(job)}
                      className="geist-caption text-base font-semibold text-white group-hover:text-primary transition-colors cursor-pointer truncate"
                      title="Click to view details"
                    >
                      {job.title}
                    </h2>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 geist-small text-[#8f8f8f]">
                      {job.jobNo && (
                        <span className="font-mono text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded text-[11px]">
                          Job No: {job.jobNo}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-[#6b7280]" />
                        {job.location || 'Remote'}
                      </span>
                      {job.employmentType && (
                        <span>• {job.employmentType}</span>
                      )}
                    </div>

                    {/* Short Description */}
                    <p
                      onClick={() => setViewingJobDetails(job)}
                      className="geist-small mt-2 text-[#8f8f8f] line-clamp-2 cursor-pointer hover:text-[#d4d4d4] transition-colors"
                    >
                      {job.description || 'No description provided.'}
                    </p>

                    {/* Specifications */}
                    <div className="mt-3 pt-2.5 border-t border-white/[0.08] grid grid-cols-2 gap-2 geist-small text-[#8f8f8f]">
                      {job.experience !== undefined && job.experience !== '' && (
                        <div>
                          Exp: <span className="text-white font-medium">{job.experience} yrs</span>
                        </div>
                      )}
                      {(job.salary || job.salaryRange) && (
                        <div className="truncate">
                          Salary: <span className="text-white font-medium">{job.salary || job.salaryRange}</span>
                        </div>
                      )}
                      <div>
                        Invited: <span className="text-white font-medium">{invitedCount} candidates</span>
                      </div>
                      <div>
                        Deadline: <span className="text-white font-medium">{formatDate(job.deadline)}</span>
                      </div>
                    </div>

                    {/* Skills */}
                    {skillsList.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2.5">
                        {skillsList.slice(0, 3).map((skill, sIdx) => (
                          <span
                            key={sIdx}
                            className="geist-small text-[11px] px-1.5 py-0.5 rounded-[4px] bg-white/[0.04] border border-white/[0.08] text-[#d4d4d4]"
                          >
                            {skill}
                          </span>
                        ))}
                        {skillsList.length > 3 && (
                          <span className="geist-small text-[11px] text-[#6b7280] self-center">
                            +{skillsList.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div className="mt-4 pt-3 border-t border-white/[0.08] flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setInvitingJob(job)}
                      className="geist-caption flex-1 inline-flex h-8 items-center justify-center gap-1.5 rounded-[6px] border border-white bg-white px-3 font-semibold text-black transition-colors hover:bg-[#eaeaea]"
                      title="Invite candidate"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Invite Candidate</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setViewingJobDetails(job)}
                      className="geist-caption inline-flex h-8 items-center justify-center gap-1.5 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-2.5 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
                      title="View description"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Details</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditingJobId(job.id)}
                      className="geist-caption inline-flex h-8 items-center justify-center gap-1.5 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-2.5 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
                      title="Edit job"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>


                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Job Modal */}
      {editingJobId && (
        <EditJobModal
          jobId={editingJobId}
          onClose={() => setEditingJobId(null)}
        />
      )}

      {/* Job Description Modal */}
      {viewingJobDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-3xl max-h-[90vh] bg-[#000] border border-white/[0.13] rounded-[8px] shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-start justify-between border-b border-white/[0.11] bg-[#000] px-5 py-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="geist-small inline-block rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-2 py-0.5 font-medium text-[#d4d4d4]">
                    {viewingJobDetails.category || viewingJobDetails.department || 'General'}
                  </span>
                  {viewingJobDetails.employmentType && (
                    <span className="geist-small text-[#8f8f8f]">• {viewingJobDetails.employmentType}</span>
                  )}
                </div>
                <h2 className="geist-section-title text-white text-lg font-bold">{viewingJobDetails.title}</h2>
                <p className="geist-small text-[#8f8f8f] mt-0.5">
                  {viewingJobDetails.jobNo ? <span className="font-mono text-emerald-400 font-bold mr-2">Job No: {viewingJobDetails.jobNo} •</span> : null}
                  {viewingJobDetails.location || 'Remote'}
                </p>
              </div>

              <button
                onClick={() => setViewingJobDetails(null)}
                className="text-[#8f8f8f] hover:text-white p-1 rounded-[6px] hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-white geist-small [scrollbar-color:#27272a_#000] [scrollbar-width:thin]">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-white/[0.02] border border-white/[0.08] rounded-[6px]">
                <div>
                  <span className="geist-label uppercase text-[#6b7280] block">Experience</span>
                  <span className="text-white font-medium">{viewingJobDetails.experience !== undefined ? `${viewingJobDetails.experience} Years` : 'N/A'}</span>
                </div>
                <div>
                  <span className="geist-label uppercase text-[#6b7280] block">Salary</span>
                  <span className="text-white font-medium">{viewingJobDetails.salary || viewingJobDetails.salaryRange || 'Disclosed later'}</span>
                </div>
                <div>
                  <span className="geist-label uppercase text-[#6b7280] block">Access Code</span>
                  <code className="text-[#83d0a3] font-mono">{viewingJobDetails.accessCode || 'N/A'}</code>
                </div>
                <div>
                  <span className="geist-label uppercase text-[#6b7280] block">Deadline</span>
                  <span className="text-white font-medium">{formatDate(viewingJobDetails.deadline)}</span>
                </div>
              </div>

              <div>
                <span className="geist-label uppercase text-[#6b7280] block mb-1">Job Description</span>
                <div className="bg-[#050505] border border-white/[0.08] rounded-[6px] p-3 text-[#d4d4d4] leading-relaxed whitespace-pre-wrap">
                  {viewingJobDetails.description || 'No description provided for this role.'}
                </div>
              </div>

              {(viewingJobDetails.qualifications || viewingJobDetails.education) && (
                <div>
                  <span className="geist-label uppercase text-[#6b7280] block mb-1">Qualifications</span>
                  <div className="bg-[#050505] border border-white/[0.08] rounded-[6px] p-3 text-[#d4d4d4]">
                    {viewingJobDetails.qualifications || viewingJobDetails.education}
                  </div>
                </div>
              )}

              {formatSkillsList(viewingJobDetails.skills).length > 0 && (
                <div>
                  <span className="geist-label uppercase text-[#6b7280] block mb-1">Required Skills</span>
                  <div className="flex flex-wrap gap-1.5">
                    {formatSkillsList(viewingJobDetails.skills).map((skill, sIdx) => (
                      <span
                        key={sIdx}
                        className="geist-small px-2 py-1 rounded-[4px] bg-white/[0.05] border border-white/[0.1] text-[#d4d4d4]"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-3 bg-white/[0.02] border border-white/[0.08] rounded-[6px] flex flex-col sm:flex-row items-center justify-between gap-2">
                <span className="geist-small text-[#8f8f8f] font-mono truncate max-w-md">
                  {viewingJobDetails.interviewLink || `${window.location.origin}/#/interview/${viewingJobDetails.id}`}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyLink(viewingJobDetails.interviewLink || `${window.location.origin}/#/interview/${viewingJobDetails.id}`)}
                  className="geist-caption shrink-0 inline-flex h-8 items-center gap-1.5 px-3 rounded-[6px] border border-white/[0.11] bg-white/[0.03] text-[#d4d4d4] hover:bg-white/[0.06] hover:text-white"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-[#83d0a3]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
                </button>
              </div>
            </div>

            <div className="border-t border-white/[0.11] bg-[#000] px-5 py-3 flex items-center justify-between gap-2">
              {canUserDeleteJob() ? (
                <button
                  type="button"
                  onClick={() => handleDeleteJob(viewingJobDetails.id, viewingJobDetails.title)}
                  className="geist-caption text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Job</span>
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const jobId = viewingJobDetails.id;
                    setViewingJobDetails(null);
                    navigate(`/recruiter/interview/${jobId}/responses`);
                  }}
                  className="geist-caption inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-blue-500/30 bg-blue-500/10 px-3 font-medium text-blue-400 hover:bg-blue-500/20 transition-colors"
                  title="See Responses"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>See Responses</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const j = viewingJobDetails;
                    setViewingJobDetails(null);
                    setEditingJobId(j.id);
                  }}
                  className="geist-caption inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] hover:bg-white/[0.06] hover:text-white"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Edit Job</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const j = viewingJobDetails;
                    setViewingJobDetails(null);
                    setInvitingJob(j);
                  }}
                  className="geist-caption inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-white bg-white px-3 font-medium text-black hover:bg-[#eaeaea]"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Invite Candidate</span>
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Invite Candidate Modal */}
      {invitingJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-3xl bg-[#000] border border-white/[0.13] rounded-[10px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">

            <div className="flex items-center justify-between border-b border-white/[0.11] bg-[#000] px-5 py-4 shrink-0">
              <div>
                <h3 className="geist-section-title text-white text-base font-bold flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-[#83d0a3]" />
                  Invite Candidate to Job
                </h3>
                <p className="geist-small text-[#8f8f8f] mt-0.5">Role: {invitingJob.title}</p>
              </div>
              <button
                onClick={() => setInvitingJob(null)}
                className="text-[#8f8f8f] hover:text-white p-1 rounded-[6px] hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto geist-small [scrollbar-color:#27272a_#000] [scrollbar-width:thin]">
              {/* Invite Mode Selector */}
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
                  <FileText className="w-3.5 h-3.5" />
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
                  <Layers className="w-3.5 h-3.5" />
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
                  <Users className="w-3.5 h-3.5" />
                  <span>Invited Candidates ({(invitingJob.candidateEmails || []).length})</span>
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
                  {/* Single Candidate Resume Upload + Optional Extra Text */}
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

                    {/* File Picker */}
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

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="geist-label uppercase text-[#6b7280] block mb-1">
                          Location / City <span className="text-white font-semibold">*</span>
                        </label>
                        <LocationCityInput
                          value={currentSingleLocation}
                          onChange={setCurrentSingleLocation}
                          placeholder="e.g. Nashik, Mumbai, Pune..."
                          className="geist-caption w-full rounded-[6px] border border-white/[0.11] bg-white/[0.03] p-2.5 text-white outline-none focus:border-white/[0.28] placeholder:text-[#6b7280]"
                        />
                      </div>

                      <div>
                        <label className="geist-label uppercase text-[#6b7280] block mb-1">
                          Experience (Years) <span className="text-white font-semibold">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="60"
                          placeholder="e.g. 1.5 or 3.5 Yrs"
                          value={currentSingleExp}
                          onChange={(e) => setCurrentSingleExp(e.target.value)}
                          className="geist-caption w-full rounded-[6px] border border-white/[0.11] bg-white/[0.03] p-2.5 text-white outline-none focus:border-white/[0.28] placeholder:text-[#6b7280]"
                        />
                      </div>

                      <div>
                        <label className="geist-label uppercase text-[#6b7280] block mb-1">
                          Highest Education <span className="text-white font-semibold">*</span>
                        </label>
                        <EducationInput
                          value={currentSingleEducation}
                          onChange={setCurrentSingleEducation}
                          placeholder="Type or select education..."
                          className="geist-caption w-full rounded-[6px] border border-white/[0.11] bg-white/[0.03] p-2.5 text-white outline-none focus:border-white/[0.28] placeholder:text-[#6b7280]"
                        />
                      </div>
                    </div>

                    {/* Optional Extra Text Area */}
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


                    {/* Process Action Button */}
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

                  <div className="relative border-t border-white/[0.08] my-3">
                    <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-[#000] px-2 text-[10px] uppercase text-[#6b7280] font-mono">
                      OR ADD MANUALLY
                    </span>
                  </div>

                  {/* Single Candidate Manual Input */}
                  <div className="space-y-2">
                    <label className="geist-label uppercase text-[#6b7280] block">
                      Add Candidate Manually (Email & WhatsApp Contact)
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        placeholder="Candidate Name (e.g. Rahul Sharma)"
                        value={currentSingleName}
                        onChange={(e) => setCurrentSingleName(e.target.value)}
                        className="geist-caption flex-1 h-9 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 text-white outline-none focus:border-white/[0.28] placeholder:text-[#6b7280]"
                      />
                      <input
                        type="email"
                        placeholder="Candidate email (e.g. candidate@example.com)"
                        value={currentSingleEmail}
                        onChange={(e) => setCurrentSingleEmail(e.target.value)}
                        className="geist-caption flex-1 h-9 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 text-white outline-none focus:border-white/[0.28] placeholder:text-[#6b7280]"
                      />
                      <input
                        type="tel"
                        placeholder="WhatsApp Phone (+91...)"
                        value={currentSinglePhone}
                        onChange={(e) => setCurrentSinglePhone(e.target.value)}
                        className="geist-caption w-full sm:w-1/4 h-9 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 text-white outline-none focus:border-white/[0.28] placeholder:text-[#6b7280]"
                      />
                      <button
                        type="button"
                        onClick={handleAddCandidate}
                        className="geist-caption h-9 px-4 bg-white text-black hover:bg-[#eaeaea] rounded-[6px] font-semibold transition-colors shrink-0"
                      >
                        + Add Candidate
                      </button>
                    </div>
                  </div>
                </>
              )}

              {inviteMode === 'bulk' && (
                <>
                  {/* Bulk Candidate Document Upload (Excel, CSV, Multiple Resumes) */}
                  <div className="p-4 bg-white/[0.02] border border-dashed border-white/[0.16] rounded-[8px] text-center space-y-2">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 mx-auto mb-1">
                      <FileText className="w-5 h-5" />
                    </div>
                    <span className="geist-caption text-white font-semibold text-sm block">Bulk Import Candidate Files</span>
                    <p className="geist-small text-[#8f8f8f] max-w-sm mx-auto">
                      Upload Excel (.xlsx, .xls), CSV, or multiple PDF/DOCX/TXT resumes. Auto-extracts Name, Phone Number, and Email Address.
                    </p>
                    <label className="geist-caption inline-flex h-9 items-center justify-center gap-2 px-5 rounded-[6px] bg-white text-black font-semibold text-xs hover:bg-[#eaeaea] transition-colors cursor-pointer mt-2">
                      <span>{parsingDoc ? 'Parsing Document...' : 'Select File(s) (Excel / CSV / Resumes)'}</span>
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.csv,.xlsx,.xls,.txt,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,text/csv"
                        onChange={handleDocumentUpload}
                        className="hidden"
                        disabled={parsingDoc}
                      />
                    </label>
                  </div>

                  {/* Bulk Paste Multiple Emails */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="geist-label uppercase text-[#6b7280] block font-semibold text-xs">
                        Paste Multiple Emails
                      </label>
                      {candidateEmailsInput.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            const extracted = candidateEmailsInput
                              .split(/[\n,;\s]+/)
                              .map(e => e.trim().toLowerCase())
                              .filter(e => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
                            if (extracted.length === 0) {
                              messageBox.showError('No valid email addresses found in pasted text.');
                              return;
                            }
                            let added = 0;
                            extracted.forEach(email => {
                              if (!inviteEmailsList.includes(email)) {
                                setInviteEmailsList(prev => [...prev, email]);
                                added++;
                              }
                            });
                            setCandidateEmailsInput('');
                            messageBox.showSuccess(`Added ${added} candidate email(s) to invite list!`);
                          }}
                          className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold transition-colors flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Pasted Emails</span>
                        </button>
                      )}
                    </div>
                    <textarea
                      rows={3}
                      placeholder="Enter or paste multiple candidate emails separated by comma or newline (e.g. alex@example.com, sara@company.org)..."
                      value={candidateEmailsInput}
                      onChange={(e) => setCandidateEmailsInput(e.target.value)}
                      className="geist-caption w-full rounded-[6px] border border-white/[0.11] bg-white/[0.03] p-3 text-white outline-none focus:border-white/[0.28] placeholder:text-[#6b7280]"
                    />
                  </div>
                </>
              )}

              {inviteMode === 'invited' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="geist-label uppercase text-[#6b7280] block font-semibold text-xs">
                      Invited Candidates Roster ({(invitingJob.candidateEmails || []).length})
                    </span>
                  </div>

                  {(!invitingJob.candidateEmails || invitingJob.candidateEmails.length === 0) ? (
                    <div className="p-6 bg-white/[0.02] border border-white/[0.08] rounded-[6px] text-center text-[#8f8f8f]">
                      No candidates invited yet for this job.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                      {invitingJob.candidateEmails.map((email: string) => {
                        const isEditing = editingCandidateEmail === email;
                        const candData = ((invitingJob as any).candidateData || []).find(
                          (c: any) => c.email && c.email.toLowerCase() === email.toLowerCase()
                        );
                        const candPhone = candData?.phone && candData.phone !== 'N/A' ? candData.phone : '';
                        const isEmailSending = remindingCandidateEmail === email;
                        const isWASending = remindingWhatsAppEmail === email;

                        return (
                          <div key={email} className="bg-white/[0.025] border border-white/[0.11] rounded-[6px] p-3 shadow-sm space-y-2">
                            {isEditing ? (
                              <div className="space-y-2">
                                <div className="text-xs text-[#83d0a3] font-semibold">Editing Candidate Details:</div>
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <input
                                    type="email"
                                    value={editedEmailValue}
                                    onChange={(e) => setEditedEmailValue(e.target.value)}
                                    placeholder="Candidate Email"
                                    className="geist-caption flex-1 h-8 rounded-[4px] border border-white/[0.11] bg-black px-2.5 text-xs text-white outline-none focus:border-white/30"
                                  />
                                  <input
                                    type="tel"
                                    value={editedPhoneValue}
                                    onChange={(e) => setEditedPhoneValue(e.target.value)}
                                    placeholder="WhatsApp Phone (+91...)"
                                    className="geist-caption w-full sm:w-2/5 h-8 rounded-[4px] border border-white/[0.11] bg-black px-2.5 text-xs text-white outline-none focus:border-white/30"
                                  />
                                </div>
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCandidateEmail(null);
                                      setEditedEmailValue('');
                                      setEditedPhoneValue('');
                                    }}
                                    disabled={savingCandidateEdit}
                                    className="geist-caption h-7 px-3 rounded border border-white/[0.11] bg-white/[0.03] text-[#d4d4d4] hover:bg-white/[0.06] text-xs"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleEditCandidate(email, editedEmailValue, editedPhoneValue)}
                                    disabled={savingCandidateEdit}
                                    className="geist-caption h-7 px-3 rounded bg-white text-black font-semibold text-xs hover:bg-[#eaeaea]"
                                  >
                                    {savingCandidateEdit ? 'Saving...' : 'Save Changes'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex flex-col min-w-0">
                                  <span className="font-semibold text-white truncate text-xs" title={email}>{email}</span>
                                  {candPhone ? (
                                    <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1 mt-0.5">
                                      <Phone className="w-2.5 h-2.5" />
                                      {candPhone}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-[#6b7280] italic">No WhatsApp phone attached</span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCandidateEmail(email);
                                      setEditedEmailValue(email);
                                      setEditedPhoneValue(candPhone);
                                    }}
                                    className="geist-caption inline-flex items-center justify-center w-7 h-7 rounded border border-white/[0.11] bg-white/[0.03] text-[#d4d4d4] hover:bg-white/[0.08] hover:text-white transition-colors"
                                    title="Edit Candidate Contact Details"
                                  >
                                    <Edit className="w-3.5 h-3.5 text-[#d4d4d4]" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleSendEmailReminder(email)}
                                    disabled={isEmailSending}
                                    className="geist-caption inline-flex items-center justify-center w-7 h-7 rounded border border-white/[0.11] bg-white/[0.04] text-[#d4d4d4] hover:bg-white/[0.08] hover:text-white transition-colors disabled:opacity-50"
                                    title="Mail Reminder"
                                  >
                                    <Mail className="w-3.5 h-3.5 text-blue-400" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleSendWhatsAppReminder(email, candPhone)}
                                    disabled={isWASending}
                                    className="geist-caption inline-flex items-center justify-center w-7 h-7 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                                    title="WhatsApp Reminder"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                                  </button>
                                </div>

                              </div>
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
                        Best matched candidates from your candidate pool based on skills & job requirements.
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
                              if (!inviteEmailsList.includes(targetEmail)) {
                                setInviteEmailsList(prev => [...prev, targetEmail]);
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
                      Analyzing candidate profiles against job requirements...
                    </div>
                  ) : aiSuggestedCandidates.length === 0 ? (
                    <div className="p-6 text-center border border-white/[0.08] rounded-[6px] bg-white/[0.02]">
                      <Users className="w-8 h-8 text-[#6b7280] mx-auto mb-2" />
                      <p className="geist-caption text-white font-medium">No new candidate recommendations found</p>
                      <p className="geist-small text-[#6b7280] mt-1 max-w-sm mx-auto">
                        All stored candidate profiles are already invited, or upload more resumes to generate matches.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1 geist-small [scrollbar-color:#27272a_#000] [scrollbar-width:thin]">
                      {aiSuggestedCandidates.map((cand) => {
                        const isAdded = inviteEmailsList.includes(cand.email);
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
                                  if (!inviteEmailsList.includes(targetEmail)) {
                                    setInviteEmailsList(prev => [...prev, targetEmail]);
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


              {/* Delivery Channels Toggle */}
              <div className="p-3 bg-white/[0.03] border border-white/[0.11] rounded-[6px] space-y-2">
                <span className="geist-label uppercase text-[#6b7280] block font-semibold text-[11px]">
                  Invitation Delivery Channels:
                </span>
                <div className="flex items-center gap-4 flex-wrap text-xs">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-white font-medium">
                    <input
                      type="checkbox"
                      checked={sendEmailChannel}
                      onChange={(e) => setSendEmailChannel(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-0 cursor-pointer"
                    />
                    <Mail className="w-4 h-4 text-blue-400" />
                    <span>Send Email Invitations</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none text-white font-medium">
                    <input
                      type="checkbox"
                      checked={sendWhatsAppChannel}
                      onChange={(e) => setSendWhatsAppChannel(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-500 focus:ring-0 cursor-pointer"
                    />
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                    <span>Send WhatsApp Invitations</span>
                  </label>
                </div>

                {sendWhatsAppChannel && (
                  <div className="mt-2.5 pt-2.5 border-t border-border/40 grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                    <div>
                      <label className="text-[11px] text-muted-foreground block mb-1 font-medium">Min Delay</label>
                      <input
                        type="number"
                        min="1"
                        max="360"
                        value={waMinDelay}
                        onChange={(e) => {
                          const val = e.target.value;
                          setWaMinDelay(val === '' ? '' : Math.max(1, parseInt(val) || 1));
                        }}
                        placeholder="15"
                        className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 cursor-text"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground block mb-1 font-medium">Max Delay</label>
                      <input
                        type="number"
                        min="1"
                        max="360"
                        value={waMaxDelay}
                        onChange={(e) => {
                          const val = e.target.value;
                          setWaMaxDelay(val === '' ? '' : Math.max(1, parseInt(val) || 1));
                        }}
                        placeholder="25"
                        className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 cursor-text"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground block mb-1 font-medium">Delay Unit</label>
                      <select
                        value={waDelayUnit}
                        onChange={(e) => setWaDelayUnit(e.target.value as 'sec' | 'min')}
                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 cursor-pointer"
                      >
                        <option value="sec" className="bg-background text-foreground">Seconds (sec)</option>
                        <option value="min" className="bg-background text-foreground">Minutes (min)</option>
                      </select>
                    </div>
                    <p className="sm:col-span-3 text-[10px] text-emerald-500 dark:text-emerald-400 italic">
                      * Each WhatsApp message will pause for a random delay between {waMinDelay || 15} - {waMaxDelay || 25} {waDelayUnit} to protect your WhatsApp number from spam blocking.
                    </p>
                  </div>
                )}
              </div>

              {sendingProgressMsg && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-[6px] text-xs font-medium text-emerald-400 flex items-center gap-2 animate-pulse">
                  <Sparkles className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>{sendingProgressMsg}</span>
                </div>
              )}

              {/* Selected Candidates Roster */}
              {inviteEmailsList.length > 0 && (
                <div className="pt-2 border-t border-white/[0.08]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="geist-label uppercase text-[#6b7280] block font-semibold text-xs">
                      Selected Candidates ({inviteEmailsList.length}):
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setInviteEmailsList([]);
                        setParsedCandidates([]);
                        setCandidateEmailsInput('');
                        messageBox.showInfo('Cleared all candidate entries.');
                      }}
                      className="text-xs text-red-400 hover:text-red-300 font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove All ({inviteEmailsList.length})</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-white/[0.02] border border-white/[0.08] rounded-[6px]">
                    {inviteEmailsList.map(email => {
                      const parsed = parsedCandidates.find(c => c.email.toLowerCase() === email.toLowerCase());
                      const phone = parsed?.phone && parsed.phone !== 'N/A' ? parsed.phone : '';
                      return (
                        <span
                          key={email}
                          className="geist-small inline-flex flex-col items-start gap-0.5 px-2.5 py-1 rounded-[4px] bg-white/[0.06] border border-white/[0.1] text-white"
                        >
                          <div className="flex items-center gap-1.5 w-full justify-between">
                            <span className="font-semibold text-white">{email}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveEmail(email)}
                              className="text-[#8f8f8f] hover:text-[#ff8f8f] ml-1 cursor-pointer"
                            >
                              &times;
                            </button>
                          </div>
                          {phone && (
                            <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                              <Phone className="w-2.5 h-2.5" />
                              {phone}
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="p-3 bg-[#050505] border border-white/[0.08] rounded-[6px] space-y-1 geist-small">
                <div className="flex items-center justify-between">
                  <span className="text-[#8f8f8f]">Access Code:</span>
                  <code className="text-[#83d0a3] font-mono">{invitingJob.accessCode || 'N/A'}</code>
                </div>
              </div>
            </div>



            <div className="border-t border-white/[0.11] bg-[#000] px-5 py-3 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setInvitingJob(null)}
                className="geist-caption h-8 px-3 border border-white/[0.11] text-[#d4d4d4] hover:text-white rounded-[6px] font-medium hover:bg-white/[0.04] cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleSendInvites(true)}
                disabled={sendingInvites}
                className="geist-caption inline-flex h-8 items-center gap-1.5 px-3 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 rounded-[6px] font-semibold text-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{sendingInvites ? 'Sending...' : 'Send Bulk Reminders'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSendInvites(false)}
                disabled={sendingInvites}
                className="geist-caption inline-flex h-8 items-center gap-2 px-4 bg-white text-black hover:bg-[#eaeaea] rounded-[6px] font-semibold text-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>{sendingInvites ? 'Sending...' : 'Send Invitations'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecruiterAllJobs;
