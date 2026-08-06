import React, { useEffect, useMemo, useState } from 'react';
import { arrayUnion, collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { Link, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Sparkles, Check, UserPlus, ExternalLink, X, Search } from 'lucide-react';
import { db } from '../services/firebase';
import { subscribeToJobOrInterview } from '../services/jobResolutionService';
import { useAuth } from '../context/AuthContext';
import { useMessageBox } from '../components/MessageBox';
import { sendInterviewInvitations } from '../services/brevoService';
import { sendWhatsAppMessage, sendBulkWhatsAppInvites, sendInterviewWhatsAppInvite, buildWhatsAppInviteText } from '../services/waSenderService';
import { evaluateResumeMatch } from '../services/api';
import { formatExtractedPhone, ingestResumeFile, saveResumeDumpCandidate, scoreCandidateForRole, extractSkillSignals, ResumeDumpRecord } from '../services/resumeService';
import { parseCandidateDocument } from '../services/candidateFileParser';
import { InterviewCandidatesSkeleton } from '../components/ui/interview-loading-skeleton';
import { logTeamActivity } from '../services/auditService';
import { Interview } from '../types';
import { LocationCityInput } from '../components/LocationCityInput';
import { EducationInput } from '../components/EducationInput';
import WhatsAppConnectModal from '../components/WhatsAppConnectModal';
import { useBackgroundSend } from '../context/BackgroundSendContext';

type CandidateDraft = { name?: string; email: string; phone: string; experience?: string; location?: string; education?: string; matchScore?: string };
type RosterCandidate = { email: string; hasSubmitted: boolean; attemptId?: string; allowReattempt?: boolean };

const buildWhatsAppMessage = (interview: Interview) => {
  const link = `${window.location.origin}/#/interview/${interview.id}`;
  return `Hi there!\n\nWe're actively hiring for the ${interview.title} role and we'd love to invite you to take our AI-powered interview.\n\nStart your interview here:\n${link}\n\nAccess Code:\n${interview.accessCode}\n\nYou can complete it whenever you're ready. Best of luck!`;
};

const ButtonBusySkeleton = ({ className = 'bg-current/25' }: { className?: string }) => (
  <span className={`inline-block h-3 w-16 animate-pulse rounded-[4px] ${className}`} aria-hidden="true" />
);

const InterviewCandidates: React.FC = () => {
  const { interviewId } = useParams<{ interviewId: string }>();
  const { user, userProfile } = useAuth();
  const messageBox = useMessageBox();
  const { startBackgroundSend } = useBackgroundSend();
  const [interview, setInterview] = useState<Interview | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualName, setManualName] = useState('');
  const [singleResumeFile, setSingleResumeFile] = useState<File | null>(null);
  const [singleUploadLocation, setSingleUploadLocation] = useState('');
  const [singleUploadExp, setSingleUploadExp] = useState('');
  const [singleUploadEducation, setSingleUploadEducation] = useState('B.Tech / B.E. (Bachelor of Engineering / Technology)');
  const [singleUploadNotes, setSingleUploadNotes] = useState('');
  const [analyzingSingleResume, setAnalyzingSingleResume] = useState(false);

  // WhatsApp Delay Modal state
  const [showWaDelayModal, setShowWaDelayModal] = useState(false);
  const [waReminderTarget, setWaReminderTarget] = useState<'whatsapp' | 'both'>('whatsapp');
  const [waMinDelay, setWaMinDelay] = useState<number | string>(15);
  const [waMaxDelay, setWaMaxDelay] = useState<number | string>(25);
  const [waDelayUnit, setWaDelayUnit] = useState<'sec' | 'min'>('sec');
  const [isWhatsAppConnectOpen, setIsWhatsAppConnectOpen] = useState(false);
  const [newEmails, setNewEmails] = useState<string[]>([]);
  const [parsedCandidates, setParsedCandidates] = useState<CandidateDraft[]>([]);
  const [parsingResumes, setParsingResumes] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [editingCandidateEmail, setEditingCandidateEmail] = useState<string | null>(null);
  const [editedEmailValue, setEditedEmailValue] = useState('');
  const [editedPhoneValue, setEditedPhoneValue] = useState('');
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const [reminding, setReminding] = useState(false);
  const [rosterSearch, setRosterSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Submitted' | 'Pending'>('All');
  const [whatsappModal, setWhatsappModal] = useState<{
    isOpen: boolean;
    email: string;
    phone: string;
    message: string;
    interview: Interview;
  } | null>(null);

  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [resumeDumpCandidates, setResumeDumpCandidates] = useState<ResumeDumpRecord[]>([]);
  const [loadingResumeDump, setLoadingResumeDump] = useState(false);
  const [suggestSearchTerm, setSuggestSearchTerm] = useState('');

  useEffect(() => {
    if (!user) return;
    setLoadingResumeDump(true);
    const q = query(collection(db, 'resumeDumpCandidates'), where('recruiterUID', '==', user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: ResumeDumpRecord[] = snapshot.docs.map(candidateDoc => {
        const data = candidateDoc.data();
        return {
          id: candidateDoc.id,
          recruiterUID: data.recruiterUID || user.uid,
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          location: data.location || '',
          currentTitle: data.currentTitle || '',
          summary: data.summary || '',
          totalExperienceYears: data.totalExperienceYears || 0,
          skills: Array.isArray(data.skills) ? data.skills : [],
          experience: Array.isArray(data.experience) ? data.experience : [],
          education: Array.isArray(data.education) ? data.education : [],
          certifications: Array.isArray(data.certifications) ? data.certifications : [],
          languages: Array.isArray(data.languages) ? data.languages : [],
          keywords: Array.isArray(data.keywords) ? data.keywords : [],
          linkedinUrl: data.linkedinUrl || '',
          portfolioUrl: data.portfolioUrl || '',
          parsingMethod: data.parsingMethod || 'deterministic',
          parserVersion: data.parserVersion || 1,
          resumeUrl: data.resumeUrl || '',
          resumeFileName: data.resumeFileName || '',
          isHired: Boolean(data.isHired),
          doNotSuggest: Boolean(data.doNotSuggest),
        };
      });
      setResumeDumpCandidates(list);
      setLoadingResumeDump(false);
    }, (err) => {
      console.error("Failed to load resume dump candidates for suggestions:", err);
      setLoadingResumeDump(false);
    });
    return () => unsub();
  }, [user]);

  const suggestedCandidatesForInterview = useMemo(() => {
    if (!interview) return [];

    const roleText = `${interview.title || ''} ${interview.description || ''} ${interview.skills || ''}`;
    const requiredSkills = extractSkillSignals(roleText);
    const invitedEmails = new Set((interview.candidateEmails || []).map(e => e.toLowerCase()));
    const queuedEmails = new Set(newEmails.map(e => e.toLowerCase()));
    const queuedPhones = new Set(parsedCandidates.map(c => c.phone).filter(Boolean));

    return resumeDumpCandidates
      .filter(c => !c.isHired && !c.doNotSuggest)
      .filter(c => {
        const emailLower = (c.email || '').toLowerCase();
        if (emailLower && (invitedEmails.has(emailLower) || queuedEmails.has(emailLower))) return false;
        if (c.phone && queuedPhones.has(c.phone)) return false;
        return true;
      })
      .map(candidate => {
        return scoreCandidateForRole(candidate, {
          title: interview.title || '',
          description: interview.description || '',
          requiredSkills: requiredSkills.length > 0 
            ? requiredSkills 
            : (Array.isArray(interview.skills) 
                ? interview.skills 
                : (typeof interview.skills === 'string' ? interview.skills.split(',').map(s => s.trim()) : [])),
          minExperience: (interview as any).minExperience || 0,
          maxExperience: (interview as any).maxExperience || 0,
        });
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .sort((a, b) => b.matchScore - a.matchScore);
  }, [interview, resumeDumpCandidates, newEmails, parsedCandidates]);

  const filteredSuggestedCandidates = useMemo(() => {
    if (!suggestSearchTerm.trim()) return suggestedCandidatesForInterview;
    const term = suggestSearchTerm.toLowerCase();
    return suggestedCandidatesForInterview.filter(c => 
      c.name.toLowerCase().includes(term) ||
      c.email.toLowerCase().includes(term) ||
      c.phone.toLowerCase().includes(term) ||
      c.skills.some(s => s.toLowerCase().includes(term))
    );
  }, [suggestedCandidatesForInterview, suggestSearchTerm]);

  const addSuggestedCandidateToQueue = (candidate: { email: string; phone: string; name?: string; matchScore?: number }) => {
    const email = (candidate.email || '').trim().toLowerCase();
    const phone = candidate.phone ? formatExtractedPhone(candidate.phone) : 'N/A';
    const scoreStr = candidate.matchScore ? `${candidate.matchScore}%` : 'N/A';

    if (email && !newEmails.includes(email)) {
      setNewEmails(prev => [...prev, email]);
    }

    setParsedCandidates(prev => {
      const exists = prev.some(c => (email && c.email.toLowerCase() === email) || (phone && phone !== 'N/A' && c.phone === phone));
      if (exists) return prev;
      return [...prev, { email: email || `${phone.replace(/[^0-9]/g, '')}@whatsapp.local`, phone, matchScore: scoreStr }];
    });
  };

  const addAllSuggestedToQueue = () => {
    if (filteredSuggestedCandidates.length === 0) return;
    filteredSuggestedCandidates.forEach(candidate => addSuggestedCandidateToQueue(candidate));
    messageBox.showSuccess(`Added ${filteredSuggestedCandidates.length} matched candidate(s) to invite queue!`);
  };

  useEffect(() => {
    if (!interviewId || !user) {
      setLoading(false);
      return;
    }

    const unsubscribeInterview = subscribeToJobOrInterview(
      interviewId,
      (data) => {
        if (!data) {
          setInterview(null);
          setLoading(false);
          return;
        }

        const currentTeamId = userProfile?.teamId || userProfile?.parentRecruiterId || userProfile?.primaryRecruiterUID || user.uid;
        const interviewTeamId = data.teamId || data.recruiterUID;
        const roleLower = (userProfile?.role || '').toLowerCase();
        const isRecruiterRole = roleLower === 'recruiter' || roleLower === 'primary' || roleLower === 'subrecruiter' || roleLower === 'admin' || roleLower === 'owner';
        const isTeamMember = isRecruiterRole || interviewTeamId === currentTeamId || data.recruiterUID === user.uid || (userProfile?.primaryRecruiterUID && data.recruiterUID === userProfile.primaryRecruiterUID);

        if (!isTeamMember) {
          setInterview(null);
          setLoading(false);
          return;
        }
        setInterview(data as Interview);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading interview:', error);
        setLoading(false);
      }
    );

    const unsubscribeSubmissions = onSnapshot(
      collection(db, 'interviews', interviewId, 'attempts'),
      (snapshot) => setSubmissions(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      (error) => console.error('Error loading submissions:', error)
    );

    return () => {
      unsubscribeInterview();
      unsubscribeSubmissions();
    };
  }, [interviewId, user]);

  const roster = useMemo<RosterCandidate[]>(() => {
    if (!interview) return [];
    const explicitEmails = (interview.candidateEmails || []).map((email) => email.toLowerCase());
    const unifiedList: RosterCandidate[] = [];

    submissions.forEach((submission) => {
      unifiedList.push({
        email: submission.candidateInfo?.email || 'N/A',
        hasSubmitted: true,
        attemptId: submission.id,
        allowReattempt: submission.allowReattempt || false,
      });
    });

    explicitEmails.forEach((email) => {
      const hasSubmitted = submissions.some((submission) => (submission.candidateInfo?.email || '').toLowerCase() === email);
      if (!hasSubmitted && !unifiedList.some((candidate) => candidate.email.toLowerCase() === email)) {
        unifiedList.push({ email, hasSubmitted: false });
      }
    });

    return unifiedList;
  }, [interview, submissions]);

  const filteredRoster = roster.filter((candidate) => {
    const matchesSearch = candidate.email.toLowerCase().includes(rosterSearch.toLowerCase());
    const matchesStatus =
      statusFilter === 'All' ||
      (statusFilter === 'Submitted' && candidate.hasSubmitted) ||
      (statusFilter === 'Pending' && !candidate.hasSubmitted);
    return matchesSearch && matchesStatus;
  });

  const pendingEmails = useMemo(() => {
    if (!interview) return [];
    const explicitEmails = (interview.candidateEmails || []).map((email) => email.toLowerCase());
    return explicitEmails.filter((email) => {
      const sub = submissions.find((submission) => (submission.candidateInfo?.email || '').toLowerCase() === email);
      if (!sub) return true; // Has not submitted
      if (sub.allowReattempt) return true; // Reattempt permitted
      return false; // Submitted & completed -> Exclude from pending reminders
    });
  }, [interview, submissions]);

  const [sendingProgressMsg, setSendingProgressMsg] = useState('');

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!interview || !user) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setParsingResumes(true);
    const candidatesFound: CandidateDraft[] = [];
    let filesProcessed = 0;
    let filesWithErrors = 0;

    for (const file of Array.from(files)) {
      try {
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
          const extracted = await parseCandidateDocument(file);
          for (const cand of extracted) {
            const lowerEmail = (cand.email || '').toLowerCase();
            const phone = cand.phone || 'N/A';
            const name = cand.name || 'Candidate';

            if (lowerEmail && !(interview.candidateEmails || []).includes(lowerEmail) && !newEmails.includes(lowerEmail)) {
              if (!candidatesFound.some(c => c.email === lowerEmail)) {
                candidatesFound.push({ email: lowerEmail, phone, matchScore: 'N/A' });
              }
            } else if (phone && phone !== 'N/A') {
              const pseudoEmail = `${phone.replace(/[^0-9]/g, '')}@whatsapp.local`;
              if (!newEmails.includes(pseudoEmail) && !candidatesFound.some(c => c.phone === phone)) {
                candidatesFound.push({ email: pseudoEmail, phone, matchScore: 'N/A' });
              }
            }
          }
        } else {
          const ingested = await ingestResumeFile(file);
          const lowerEmail = (ingested.profile.email || '').toLowerCase();
          const phone = ingested.profile.phone || 'N/A';

          await saveResumeDumpCandidate({
            recruiterUID: user.uid,
            profile: ingested.profile,
            resumeText: ingested.resumeText,
            resumeUrl: ingested.resumeUrl,
            fileName: file.name,
            mimeType: file.type,
            fileSize: file.size,
            source: 'interview_creation',
            sourceInterviewId: interview.id,
            sourceJobTitle: interview.title,
          });

          if (lowerEmail) {
            const alreadyInvited = (interview.candidateEmails || []).some((email) => email.toLowerCase() === lowerEmail);
            const alreadyQueued = newEmails.some((email) => email.toLowerCase() === lowerEmail);
            if (!alreadyInvited && !alreadyQueued && !candidatesFound.some((candidate) => candidate.email === lowerEmail)) {
              let matchScore = 'N/A';
              if (ingested.resumeText.length > 50) {
                try {
                  matchScore = await evaluateResumeMatch(
                    interview.title, 
                    interview.description, 
                    ingested.resumeText,
                    {
                      education: (interview as any).education,
                      gender: (interview as any).gender || (interview as any).genderRequirement
                    }
                  );
                } catch (error) {
                  console.error('Match score error:', error);
                }
              }
              candidatesFound.push({ email: lowerEmail, phone, matchScore });
            }
          }
        }
        filesProcessed++;
      } catch (error) {
        console.error(`Error parsing ${file.name}:`, error);
        filesWithErrors++;
      }
    }

    if (candidatesFound.length > 0) {
      setNewEmails((prev) => [...prev, ...candidatesFound.map((candidate) => candidate.email)]);
      setParsedCandidates((prev) => [...prev, ...candidatesFound]);
    }
    messageBox.showInfo(`Processed ${filesProcessed} file(s). Found ${candidatesFound.length} new candidate(s). ${filesWithErrors > 0 ? `Failed to parse ${filesWithErrors} file(s).` : ''}`);
    setParsingResumes(false);
    e.target.value = '';
  };

  const handleSingleResumeUploadAndAnalyze = async () => {
    if (!interview || !user) return;
    if (!singleResumeFile) {
      messageBox.showError('Please select a resume file first.');
      return;
    }

    setAnalyzingSingleResume(true);
    try {
      const ingested = await ingestResumeFile(singleResumeFile);
      const lowerEmail = (ingested.profile.email || '').toLowerCase();
      const phone = ingested.profile.phone || 'N/A';
      const name = ingested.profile.name || 'Candidate';

      const mergedText = `${ingested.resumeText}\n\n[Recruiter Notes / Extra Info]:\n${singleUploadNotes.trim()}`;

      await saveResumeDumpCandidate({
        recruiterUID: user.uid,
        profile: {
          ...ingested.profile,
          name: name,
          email: lowerEmail,
          phone: phone,
          location: singleUploadLocation.trim() || ingested.profile.location,
          totalExperienceYears: singleUploadExp.trim() ? (parseFloat(singleUploadExp) || ingested.profile.totalExperienceYears) : ingested.profile.totalExperienceYears,
          education: singleUploadEducation ? [{ degree: singleUploadEducation, institution: '', year: '' }] : ingested.profile.education,
          summary: singleUploadNotes.trim() ? `${ingested.profile.summary || ''}\nRecruiter Notes: ${singleUploadNotes.trim()}`.trim() : ingested.profile.summary,
          parsingMethod: 'deterministic',
          parserVersion: 1,
        },
        resumeText: mergedText,
        resumeUrl: ingested.resumeUrl,
        fileName: singleResumeFile.name,
        mimeType: singleResumeFile.type,
        fileSize: singleResumeFile.size,
        source: 'interview_creation',
        sourceInterviewId: interview.id,
        sourceJobTitle: interview.title,
      });

      let matchScore = 'N/A';
      if (mergedText.length > 50) {
        try {
          matchScore = await evaluateResumeMatch(
            interview.title,
            interview.description,
            mergedText,
            {
              education: singleUploadEducation || (interview as any).education,
              gender: (interview as any).gender || (interview as any).genderRequirement
            }
          );
        } catch (error) {
          console.error('Match score error:', error);
        }
      }

      const candidateObj: CandidateDraft = {
        name: name,
        email: lowerEmail || `${phone.replace(/[^0-9]/g, '')}@whatsapp.local`,
        phone: phone,
        experience: singleUploadExp || String(ingested.profile.totalExperienceYears || ''),
        location: singleUploadLocation || ingested.profile.location,
        education: singleUploadEducation,
        matchScore: matchScore,
      };

      if (lowerEmail && !newEmails.includes(lowerEmail)) {
        setNewEmails((prev) => [...prev, lowerEmail]);
      }
      setParsedCandidates((prev) => {
        const exists = prev.some(c => (lowerEmail && c.email.toLowerCase() === lowerEmail) || (phone && phone !== 'N/A' && c.phone === phone));
        if (exists) return prev;
        return [...prev, candidateObj];
      });

      messageBox.showSuccess(`Resume analyzed and saved to Resume Dump! Candidate added to invite queue.`);

      setSingleResumeFile(null);
      setSingleUploadLocation('');
      setSingleUploadExp('');
      setSingleUploadNotes('');
    } catch (error) {
      console.error('Single resume upload error:', error);
      messageBox.showError('Failed to analyze resume file.');
    } finally {
      setAnalyzingSingleResume(false);
    }
  };

  const handleSendInvites = async () => {
    if (!interview || (newEmails.length === 0 && parsedCandidates.length === 0)) return;
    setSendingEmails(true);
    setSendingProgressMsg('Preparing candidate invitations...');

    try {
      const validEmails = newEmails.map((email) => email.toLowerCase()).filter(e => !e.endsWith('@whatsapp.local'));
      const candidatesWithPhones = parsedCandidates.filter((candidate) => candidate.phone && candidate.phone !== 'N/A');

      await updateDoc(doc(db, 'interviews', interview.id), {
        candidateEmails: validEmails.length > 0 ? arrayUnion(...validEmails) : arrayUnion(),
        candidateData: arrayUnion(...parsedCandidates),
      });

      let emailCount = 0;
      if (validEmails.length > 0) {
        setSendingProgressMsg(`Sending ${validEmails.length} invitation email(s)...`);
        const result = await sendInterviewInvitations(
          validEmails,
          interview.title,
          interview.interviewLink || '',
          interview.accessCode,
          false,
          {
            gender: (interview as any).gender || (interview as any).genderRequirement,
            location: (interview as any).location,
            education: (interview as any).education || (interview as any).qualification,
            qualification: (interview as any).qualification || (interview as any).education,
            experience: ((interview as any).maxExperience > (interview as any).minExperience)
              ? `${(interview as any).minExperience} - ${(interview as any).maxExperience} Years`
              : ((interview as any).experience || (interview as any).experienceRequired),
            minExperience: (interview as any).minExperience,
            maxExperience: (interview as any).maxExperience,
            salary: (interview as any).salary || (interview as any).salaryRange,
            salaryRange: (interview as any).salaryRange || (interview as any).salary,
            employmentType: (interview as any).employmentType,
            customFields: (interview as any).customFields,
            recruiterName: userProfile?.name || (user as any)?.displayName || (interview as any).createdBy?.name || 'Recruiting Team',
            recruiterPhone: (userProfile as any)?.phone || (userProfile as any)?.phoneNumber || (userProfile as any)?.contactNumber || (user as any)?.phoneNumber || ''
          }
        );
        if (result.success) {
          emailCount = result.totalEmails;
        }
      }

      let waCount = 0;
      if (candidatesWithPhones.length > 0) {
        setSendingProgressMsg(`Sending WhatsApp invites one-by-one with 10s anti-spam delay...`);
        const waResult = await sendBulkWhatsAppInvites(
          candidatesWithPhones,
          interview.title,
          interview.interviewLink || '',
          interview.accessCode,
          false,
          (sentCount, totalCount, currentCandidate, isWaiting) => {
            if (isWaiting) {
              setSendingProgressMsg(`⏳ Sent WhatsApp to ${currentCandidate} (${sentCount}/${totalCount}). Waiting 10s delay to protect WhatsApp number...`);
            } else {
              setSendingProgressMsg(`📱 Sending WhatsApp invite ${sentCount}/${totalCount} to ${currentCandidate}...`);
            }
          },
          {
            gender: (interview as any).gender || (interview as any).genderRequirement,
            location: (interview as any).location,
            education: (interview as any).education || (interview as any).qualification,
            qualification: (interview as any).qualification || (interview as any).education,
            experience: ((interview as any).maxExperience > (interview as any).minExperience)
              ? `${(interview as any).minExperience} - ${(interview as any).maxExperience} Years`
              : ((interview as any).experience || (interview as any).experienceRequired),
            minExperience: (interview as any).minExperience,
            maxExperience: (interview as any).maxExperience,
            salary: (interview as any).salary || (interview as any).salaryRange,
            salaryRange: (interview as any).salaryRange || (interview as any).salary,
            employmentType: (interview as any).employmentType,
            customFields: (interview as any).customFields,
            recruiterName: userProfile?.name || (user as any)?.displayName || (interview as any).createdBy?.name || 'Recruiting Team',
            recruiterPhone: (userProfile as any)?.phone || (userProfile as any)?.phoneNumber || (userProfile as any)?.contactNumber || (user as any)?.phoneNumber || ''
          }
        );
        if (waResult.success) {
          waCount = waResult.totalSent;
        }
      }

      messageBox.showSuccess(`Invitations sent: ${emailCount > 0 ? `${emailCount} Email(s)` : ''}${emailCount > 0 && waCount > 0 ? ' & ' : ''}${waCount > 0 ? `${waCount} WhatsApp Mobile invite(s)` : ''}!`);
      setNewEmails([]);
      setParsedCandidates([]);
    } catch (error) {
      console.error('Invite sending error:', error);
      messageBox.showError('Failed to send invitations.');
    } finally {
      setSendingEmails(false);
      setSendingProgressMsg('');
    }
  };

  const handleSendBulkEmailReminders = async () => {
    if (!interview) return;
    if (pendingEmails.length === 0) {
      messageBox.showInfo('No pending candidates found.');
      return;
    }

    const candData = (interview as any).candidateData || [];
    const candidatesPayload = pendingEmails.map((email) => {
      const match = candData.find((c: any) => c.email && c.email.toLowerCase() === email.toLowerCase());
      return { email, phone: match?.phone, name: match?.name || email.split('@')[0] };
    });

    startBackgroundSend({
      candidates: candidatesPayload,
      jobTitle: interview.title,
      interviewLink: interview.interviewLink || `${window.location.origin}/#/interview/${interview.id}`,
      accessCode: interview.accessCode || '',
      isReminder: true,
      sendEmailChannel: true,
      sendWhatsAppChannel: false,
      options: {
        gender: (interview as any).gender || (interview as any).genderRequirement,
        location: (interview as any).location,
        education: (interview as any).education || (interview as any).qualification,
        qualification: (interview as any).qualification || (interview as any).education,
        experience: (interview as any).experience || (interview as any).experienceRequired,
        minExperience: (interview as any).minExperience,
        maxExperience: (interview as any).maxExperience,
        salary: (interview as any).salary || (interview as any).salaryRange,
        recruiterName: userProfile?.name || (user as any)?.displayName || (interview as any).createdBy?.name || 'Recruiter',
        recruiterPhone: (userProfile as any)?.phone || (userProfile as any)?.phoneNumber || (userProfile as any)?.contactNumber || (user as any)?.phoneNumber || ''
      }
    });

    messageBox.showSuccess(`🚀 Background Email reminders started for ${pendingEmails.length} candidate(s)! You can freely navigate to any page.`);
  };

  const executeSendBulkWhatsAppReminders = async (minDelay = 15, maxDelay = 25, delayUnit: 'sec' | 'min' = 'sec') => {
    if (!interview) return;
    if (pendingEmails.length === 0) {
      messageBox.showInfo('No pending candidates found.');
      return;
    }

    const candData = (interview as any).candidateData || [];
    const pendingWithPhones = pendingEmails.map((email) => {
      const match = candData.find((c: any) => c.email && c.email.toLowerCase() === email.toLowerCase());
      return { email, phone: match?.phone, name: match?.name || email.split('@')[0] };
    }).filter((c) => c.phone && c.phone !== 'N/A');

    if (pendingWithPhones.length === 0) {
      messageBox.showInfo('No phone numbers found for pending candidates to send WhatsApp reminders.');
      return;
    }

    startBackgroundSend({
      candidates: pendingWithPhones,
      jobTitle: interview.title,
      interviewLink: interview.interviewLink || `${window.location.origin}/#/interview/${interview.id}`,
      accessCode: interview.accessCode || '',
      isReminder: true,
      sendEmailChannel: false,
      sendWhatsAppChannel: true,
      waMinDelay: Number(minDelay) || 15,
      waMaxDelay: Number(maxDelay) || 25,
      waDelayUnit: delayUnit,
      options: {
        gender: (interview as any).gender || (interview as any).genderRequirement,
        location: (interview as any).location,
        education: (interview as any).education || (interview as any).qualification,
        qualification: (interview as any).qualification || (interview as any).education,
        experience: (interview as any).experience || (interview as any).experienceRequired,
        minExperience: (interview as any).minExperience,
        maxExperience: (interview as any).maxExperience,
        salary: (interview as any).salary || (interview as any).salaryRange,
        recruiterName: userProfile?.name || (user as any)?.displayName || (interview as any).createdBy?.name || 'Recruiter',
        recruiterPhone: (userProfile as any)?.phone || (userProfile as any)?.phoneNumber || (userProfile as any)?.contactNumber || (user as any)?.phoneNumber || '',
        whatsappSessionId: userProfile?.whatsappSessionId,
        whatsappSessionPasscode: userProfile?.whatsappSessionPasscode
      }
    });

    messageBox.showSuccess(`🚀 Background WhatsApp reminders started for ${pendingWithPhones.length} candidate(s)! You can freely navigate to any page.`);
  };

  const executeSendBulkBothReminders = async (minDelay = 15, maxDelay = 25, delayUnit: 'sec' | 'min' = 'sec') => {
    if (!interview) return;
    if (pendingEmails.length === 0) {
      messageBox.showInfo('No pending candidates found.');
      return;
    }

    const candData = (interview as any).candidateData || [];
    const candidatesPayload = pendingEmails.map((email) => {
      const match = candData.find((c: any) => c.email && c.email.toLowerCase() === email.toLowerCase());
      return { email, phone: match?.phone, name: match?.name || email.split('@')[0] };
    });

    startBackgroundSend({
      candidates: candidatesPayload,
      jobTitle: interview.title,
      interviewLink: interview.interviewLink || `${window.location.origin}/#/interview/${interview.id}`,
      accessCode: interview.accessCode || '',
      isReminder: true,
      sendEmailChannel: true,
      sendWhatsAppChannel: true,
      waMinDelay: Number(minDelay) || 15,
      waMaxDelay: Number(maxDelay) || 25,
      waDelayUnit: delayUnit,
      options: {
        gender: (interview as any).gender || (interview as any).genderRequirement,
        location: (interview as any).location,
        education: (interview as any).education || (interview as any).qualification,
        qualification: (interview as any).qualification || (interview as any).education,
        experience: (interview as any).experience || (interview as any).experienceRequired,
        minExperience: (interview as any).minExperience,
        maxExperience: (interview as any).maxExperience,
        salary: (interview as any).salary || (interview as any).salaryRange,
        recruiterName: userProfile?.name || (user as any)?.displayName || (interview as any).createdBy?.name || 'Recruiter',
        recruiterPhone: (userProfile as any)?.phone || (userProfile as any)?.phoneNumber || (userProfile as any)?.contactNumber || (user as any)?.phoneNumber || '',
        whatsappSessionId: userProfile?.whatsappSessionId,
        whatsappSessionPasscode: userProfile?.whatsappSessionPasscode
      }
    });

    messageBox.showSuccess(`🚀 Background reminders (Email + WhatsApp) started for ${pendingEmails.length} candidate(s)! You can freely navigate to any page.`);
  };

  const handleResend = async (email: string) => {
    if (!interview) return;
    setResendingEmail(email);
    try {
      let emailSent = false;
      let waSent = false;

      if (email && email.includes('@')) {
        const result = await sendInterviewInvitations(
          [email],
          interview.title,
          interview.interviewLink || '',
          interview.accessCode,
          false,
          {
            gender: (interview as any).gender || (interview as any).genderRequirement,
            location: (interview as any).location,
            education: (interview as any).education || (interview as any).qualification,
            qualification: (interview as any).qualification || (interview as any).education,
            experience: (interview as any).experience || (interview as any).experienceRequired,
            minExperience: (interview as any).minExperience,
            maxExperience: (interview as any).maxExperience,
            salary: (interview as any).salary || (interview as any).salaryRange,
            recruiterName: userProfile?.name || (user as any)?.displayName || (interview as any).createdBy?.name || 'Recruiter',
            recruiterPhone: (userProfile as any)?.phone || (userProfile as any)?.phoneNumber || (userProfile as any)?.contactNumber || (user as any)?.phoneNumber || ''
          }
        );
        if (result.success) emailSent = true;
      }

      const candData = (interview as any).candidateData || [];
      const match = candData.find((c: any) => c.email && c.email.toLowerCase() === email.toLowerCase());
      const phone = match?.phone || parsedCandidates.find((p) => p.email.toLowerCase() === email.toLowerCase())?.phone;

      if (phone && phone !== 'N/A') {
        const waRes = await sendInterviewWhatsAppInvite({
          phone: phone,
          candidateName: email && email.includes('@') ? email.split('@')[0] : 'Candidate',
          jobTitle: interview.title,
          interviewLink: interview.interviewLink || '',
          accessCode: interview.accessCode,
          options: {
            whatsappSessionId: userProfile?.whatsappSessionId || '',
            whatsappSessionPasscode: userProfile?.whatsappSessionPasscode || ''
          }
        });
        if (waRes.success) waSent = true;
      }

      if (emailSent && waSent) {
        messageBox.showSuccess(`Invitation resent to ${email} via BOTH Email & WhatsApp!`);
      } else if (emailSent) {
        messageBox.showSuccess(`Invitation resent to ${email} via Email!`);
      } else if (waSent) {
        messageBox.showSuccess(`Invitation resent to ${phone} via WhatsApp!`);
      } else {
        messageBox.showError(`Failed to resend invitation.`);
      }
    } catch (error) {
      console.error('Resend error:', error);
      messageBox.showError('Failed to resend invitation.');
    } finally {
      setResendingEmail(null);
    }
  };

  const handleEditAndResend = async (oldEmail: string, updatedEmail: string, updatedPhone?: string) => {
    if (!interview || !updatedEmail) {
      setEditingCandidateEmail(null);
      return;
    }

    setResendingEmail(oldEmail);
    try {
      const updatedEmails = (interview.candidateEmails || []).filter((email) => email.toLowerCase() !== oldEmail.toLowerCase());
      if (!updatedEmails.includes(updatedEmail.toLowerCase())) {
        updatedEmails.push(updatedEmail.toLowerCase());
      }

      const candData = (interview as any).candidateData || [];
      const idx = candData.findIndex((c: any) => c.email && c.email.toLowerCase() === oldEmail.toLowerCase());
      let updatedCandData = [...candData];

      if (idx > -1) {
        updatedCandData[idx] = {
          ...updatedCandData[idx],
          email: updatedEmail.toLowerCase(),
          phone: updatedPhone && updatedPhone.trim() ? updatedPhone.trim() : (updatedCandData[idx].phone || 'N/A')
        };
      } else {
        updatedCandData.push({
          email: updatedEmail.toLowerCase(),
          phone: updatedPhone && updatedPhone.trim() ? updatedPhone.trim() : 'N/A',
          name: 'Candidate'
        });
      }

      await updateDoc(doc(db, 'interviews', interview.id), {
        candidateEmails: updatedEmails,
        candidateData: updatedCandData
      });

      await handleResend(updatedEmail);
    } catch (error) {
      console.error('Edit and resend error:', error);
      messageBox.showError('Failed to update and resend invitation.');
    } finally {
      setResendingEmail(null);
      setEditingCandidateEmail(null);
    }
  };

  const handleAllowReattempt = async (attemptId: string, currentAllowValue: boolean) => {
    if (!interview) return;
    try {
      await updateDoc(doc(db, 'interviews', interview.id, 'attempts', attemptId), { allowReattempt: !currentAllowValue });
      messageBox.showSuccess(!currentAllowValue ? 'Reattempt permission granted!' : 'Reattempt permission removed.');
    } catch (error) {
      console.error('Error updating reattempt status:', error);
      messageBox.showError('Failed to update reattempt status.');
    }
  };

  const [sendingWhatsAppEmail, setSendingWhatsAppEmail] = useState<string | null>(null);

  const handleDirectWhatsAppInvite = async (candidateEmail: string, candidatePhone?: string) => {
    if (!interview) return;
    const phone = candidatePhone && candidatePhone !== 'N/A' ? candidatePhone.trim() : '';

    if (!phone) {
      setWhatsappModal({
        isOpen: true,
        email: candidateEmail,
        phone: '',
        message: buildWhatsAppInviteText({
          candidateName: candidateEmail.split('@')[0],
          jobTitle: interview.title,
          interviewLink: interview.interviewLink || `${window.location.origin}/#/interview/${interview.id}`,
          accessCode: interview.accessCode,
          options: {
            gender: (interview as any).gender || (interview as any).genderRequirement,
            location: (interview as any).location,
            education: (interview as any).education || (interview as any).qualification,
            qualification: (interview as any).qualification || (interview as any).education,
            experience: (interview as any).experience || (interview as any).experienceRequired,
            minExperience: (interview as any).minExperience,
            maxExperience: (interview as any).maxExperience,
            salary: (interview as any).salary || (interview as any).salaryRange,
            recruiterName: userProfile?.name || (user as any)?.displayName || (interview as any).createdBy?.name || 'Recruiting Team',
            recruiterPhone: (userProfile as any)?.phone || (userProfile as any)?.phoneNumber || (userProfile as any)?.contactNumber || (user as any)?.phoneNumber || ''
          }
        }),
        interview
      });
      return;
    }

    setSendingWhatsAppEmail(candidateEmail);
    try {
      const res = await sendInterviewWhatsAppInvite({
        phone: phone,
        candidateName: candidateEmail.split('@')[0],
        jobTitle: interview.title,
        interviewLink: interview.interviewLink || `${window.location.origin}/#/interview/${interview.id}`,
        accessCode: interview.accessCode,
        options: {
          gender: (interview as any).gender || (interview as any).genderRequirement,
          location: (interview as any).location,
          education: (interview as any).education || (interview as any).qualification,
          qualification: (interview as any).qualification || (interview as any).education,
          experience: (interview as any).experience || (interview as any).experienceRequired,
          minExperience: (interview as any).minExperience,
          maxExperience: (interview as any).maxExperience,
          salary: (interview as any).salary || (interview as any).salaryRange,
          recruiterName: userProfile?.name || (user as any)?.displayName || (interview as any).createdBy?.name || 'Recruiting Team',
          recruiterPhone: (userProfile as any)?.phone || (userProfile as any)?.phoneNumber || (userProfile as any)?.contactNumber || (user as any)?.phoneNumber || '',
          whatsappSessionId: userProfile?.whatsappSessionId || '',
          whatsappSessionPasscode: userProfile?.whatsappSessionPasscode || ''
        }
      });

      if (res.success) {
        messageBox.showSuccess(`✅ WhatsApp invitation sent to ${phone} via API!`);
        const primaryUid = userProfile?.parentRecruiterId || userProfile?.teamId || user?.uid || '';
        if (primaryUid) {
          logTeamActivity(
            primaryUid,
            'candidate_whatsapp_invited',
            `Sent direct WhatsApp invitation to candidate ${phone} (${candidateEmail}) for job "${interview.title}"`,
            {
              uid: user?.uid || '',
              name: userProfile?.name || user?.displayName || user?.email || 'Recruiter',
              email: user?.email || '',
              designation: userProfile?.designation || 'Recruiter'
            }
          );
        }
      } else {
        messageBox.showError(`WhatsApp API error: ${res.error || 'Failed to send'}`);
      }
    } catch (err: any) {
      console.error('Direct WhatsApp error:', err);
      messageBox.showError('Failed to send WhatsApp message via API.');
    } finally {
      setSendingWhatsAppEmail(null);
    }
  };

  const handleWhatsAppSend = async () => {
    if (!whatsappModal || !whatsappModal.phone.trim()) {
      messageBox.showError('Please enter a valid phone number');
      return;
    }

    try {
      const intRef = doc(db, 'interviews', whatsappModal.interview.id);
      const currentCandData = (whatsappModal.interview as any).candidateData || [];
      const index = currentCandData.findIndex((candidate: any) => candidate.email?.toLowerCase() === whatsappModal.email.toLowerCase());
      const updatedCandData = [...currentCandData];
      if (index > -1) {
        updatedCandData[index] = { ...updatedCandData[index], phone: whatsappModal.phone };
      } else {
        updatedCandData.push({ email: whatsappModal.email, phone: whatsappModal.phone });
      }
      await updateDoc(intRef, { candidateData: updatedCandData });
    } catch (error) {
      console.error('Error updating phone in Firestore:', error);
    }

    // Send message via WhatsApp API
    const res = await sendWhatsAppMessage(whatsappModal.phone, whatsappModal.message);
    setWhatsappModal(null);
    if (res.success) {
      messageBox.showSuccess('✅ WhatsApp invitation sent successfully!');
    } else {
      messageBox.showError(`WhatsApp API error: ${res.error || 'Failed to send'}. Opening WhatsApp Web fallback.`);
      const cleanedPhone = whatsappModal.phone.replace(/[^0-9]/g, '');
      const targetPhone = cleanedPhone.length === 10 ? `91${cleanedPhone}` : cleanedPhone;
      window.open(`https://web.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(whatsappModal.message)}`, '_blank');
    }
  };

  const queueManualCandidate = () => {
    const email = newEmail.trim().toLowerCase();
    const phone = manualPhone.trim();
    const name = manualName.trim();

    if (!email && !phone) {
      messageBox.showError('Please enter an Email address or Mobile phone number.');
      return;
    }
    if (email && (interview?.candidateEmails || []).some((item) => item.toLowerCase() === email)) {
      messageBox.showInfo('This candidate email is already invited.');
      return;
    }
    if (email) {
      if (!newEmails.some((item) => item.toLowerCase() === email)) {
        setNewEmails((prev) => [...prev, email]);
      }
    }
    const formattedPhone = phone ? formatExtractedPhone(phone) : 'N/A';
    setParsedCandidates((prev) => {
      const exists = prev.some((c) => (email && c.email.toLowerCase() === email) || (phone && c.phone === phone));
      if (exists) return prev;
      return [...prev, {
        name: name || 'Candidate',
        email: email || '',
        phone: formattedPhone,
        matchScore: 'N/A'
      }];
    });

    // NOTE: Manual candidate entry is NOT saved to Resume Dump per user request.

    setNewEmail('');
    setManualPhone('');
    setManualName('');
  };

  if (loading) {
    return <InterviewCandidatesSkeleton />;
  }

  if (!interview || !interviewId) {
    return (
      <div className="-mx-4 -my-8 flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center bg-[#000] p-8 text-center text-white sm:-mx-6 lg:-mx-8">
        <h1 className="geist-section-title text-white">Interview not found</h1>
        <Link to="/recruiter/all-jobs" className="geist-caption mt-4 inline-flex h-8 items-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white">
          Back to jobs
        </Link>
      </div>
    );
  }

  const invitedCount = interview.candidateEmails?.length || 0;
  const submittedCount = submissions.length;
  const pendingCount = pendingEmails.length;
  const queuedCount = parsedCandidates.length > 0 ? parsedCandidates.length : newEmails.length;
  const interviewLink = interview.interviewLink || `${window.location.origin}/#/interview/${interview.id}`;
  const actionButtonClass = "geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40";
  const primaryButtonClass = "geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border border-white bg-white px-3 font-medium text-black transition-colors hover:bg-[#eaeaea] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] bg-[#000] text-white">

      <section className="sticky top-14 z-20 border-b border-white/[0.11] bg-[#000]">
        <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-7 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-2">
              <Link
                to="/recruiter/all-jobs"
                className="geist-caption inline-flex h-8 items-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <i className="fas fa-arrow-left text-[11px]"></i>
                Back to jobs
              </Link>
              <span className="geist-label uppercase text-[#9ca3af]">Candidates</span>
            </div>
            <h1 className="geist-page-title mt-2 max-w-5xl truncate text-white">{interview.title}</h1>
            <p className="geist-small mt-1 text-[#8f8f8f]">Invite candidates, send reminders, and manage roster status.</p>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button 
              onClick={() => setShowSuggestModal(true)}
              className="geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border border-blue-500/40 bg-blue-500/10 px-3 font-medium text-blue-400 hover:bg-blue-500/20 active:scale-95 transition-all shadow-sm"
              title="Suggest best matching candidates from Resume Dump for this JD"
            >
              <Sparkles size={13} className="text-blue-400 animate-pulse" />
              <span>Suggest Candidates {suggestedCandidatesForInterview.length > 0 ? `(${suggestedCandidatesForInterview.length})` : ''}</span>
            </button>
            <span className="geist-label rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-2 py-1 uppercase tracking-[0.18em] text-[#d4d4d4]">
              {interview.accessCode}
            </span>
            <button onClick={() => { navigator.clipboard.writeText(interviewLink); messageBox.showSuccess('Interview link copied!'); }} className={primaryButtonClass} title="Copy Interview Link">
              <i className="fas fa-link text-[11px]"></i>
              Copy link
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 border-b border-white/[0.11] lg:grid-cols-4">
        {[
          ['Invited', invitedCount],
          ['Submitted', submittedCount],
          ['Pending', pendingCount],
          ['Queued', queuedCount],
        ].map(([label, value]) => (
          <div key={label} className="border-r border-white/[0.11] px-4 py-4 last:border-r-0 sm:px-6 lg:px-7">
            <p className="geist-label uppercase text-[#6b7280]">{label}</p>
            <p className="geist-metric mt-2 tabular-nums text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 border-b border-white/[0.11] px-4 py-4 sm:px-6 lg:px-7">
          {/* Section 1: Upload Single Resume + AI Analysis */}
          <div className="p-4 rounded-[6px] border border-white/[0.11] bg-white/[0.02] space-y-4">
            <div>
              <h3 className="geist-caption font-bold text-white text-sm flex items-center gap-2">
                <i className="fas fa-file-pdf text-blue-400"></i>
                Upload Single Resume + AI Analysis
              </h3>
              <p className="geist-small text-[#8f8f8f] mt-0.5">
                Upload candidate resume (PDF, DOCX, TXT) and add optional recruiter notes. AI analyzes details, extracts contact info, saves to Resume Dump, and adds candidate to invite roster.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* File Select */}
              <div className="space-y-1">
                <label className="geist-label uppercase text-[#6b7280] text-[10px] block">Select Candidate Resume File</label>
                <label className="flex h-9 cursor-pointer items-center justify-between rounded-[6px] border border-dashed border-white/[0.18] bg-white/[0.03] px-3 text-[#d4d4d4] transition-colors hover:bg-white/[0.06] overflow-hidden">
                  <span className="geist-caption truncate text-xs text-[#8f8f8f]">
                    {singleResumeFile ? singleResumeFile.name : 'No file chosen'}
                  </span>
                  <span className="geist-small rounded bg-white/[0.08] px-2 py-0.5 text-[10px] text-white shrink-0 ml-2">Browse</span>
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,.xlsx,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    className="hidden"
                    onChange={(e) => setSingleResumeFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>

              {/* Location */}
              <div className="space-y-1">
                <label className="geist-label uppercase text-[#6b7280] text-[10px] block">Location / City *</label>
                <LocationCityInput
                  value={singleUploadLocation}
                  onChange={(val) => setSingleUploadLocation(val)}
                  placeholder="e.g. Nashik, Mumbai, Pune..."
                  className="geist-caption h-9 w-full rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-white/[0.28]"
                />
              </div>

              {/* Experience */}
              <div className="space-y-1">
                <label className="geist-label uppercase text-[#6b7280] text-[10px] block">Experience (Years) *</label>
                <input
                  type="text"
                  value={singleUploadExp}
                  onChange={(e) => setSingleUploadExp(e.target.value)}
                  placeholder="e.g. 1.5 or 3.5 Yrs"
                  className="geist-caption h-9 w-full rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-white/[0.28]"
                />
              </div>

              {/* Education */}
              <div className="space-y-1">
                <label className="geist-label uppercase text-[#6b7280] text-[10px] block">Highest Education *</label>
                <EducationInput
                  value={singleUploadEducation}
                  onChange={(val) => setSingleUploadEducation(val)}
                  className="geist-caption h-9 w-full rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-white/[0.28]"
                />
              </div>
            </div>

            {/* Recruiter Notes */}
            <div className="space-y-1">
              <label className="geist-label uppercase text-[#6b7280] text-[10px] block">
                Optional Extra Text / Recruiter Notes (Analyzed with Resume)
              </label>
              <textarea
                value={singleUploadNotes}
                onChange={(e) => setSingleUploadNotes(e.target.value)}
                rows={2}
                placeholder="Enter optional extra text (e.g. candidate phone/email, referral notes, cover letter, or additional info to analyze with resume)..."
                className="geist-caption w-full rounded-[6px] border border-white/[0.11] bg-white/[0.03] p-2.5 text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-white/[0.28]"
              />
            </div>

            {/* Submit Button */}
            <button
              type="button"
              onClick={handleSingleResumeUploadAndAnalyze}
              disabled={analyzingSingleResume || !singleResumeFile}
              className="geist-caption inline-flex h-9 items-center justify-center gap-2 rounded-[6px] border border-emerald-600 bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm transition-all hover:bg-emerald-500 disabled:border-emerald-700/50 disabled:bg-emerald-800/60 disabled:text-emerald-100/70 disabled:cursor-not-allowed cursor-pointer"
            >
              {analyzingSingleResume ? (
                <>
                  <i className="fas fa-spinner fa-spin text-xs"></i>
                  <span>Analyzing Resume with AI & Saving...</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} className="text-emerald-200" />
                  <span className="font-bold text-white">Analyze Resume with AI & Save to Resume Dump</span>
                </>
              )}
            </button>
          </div>

          {/* Section 2: Manual Candidate Entry */}
          <div className="p-3.5 rounded-[6px] border border-white/[0.11] bg-white/[0.02] space-y-2">
            <div className="flex items-center justify-between">
              <span className="geist-label uppercase text-[#6b7280] block text-[10px] tracking-wider font-mono font-bold">
                Add Candidate Manually
              </span>
              <span className="geist-small text-[10px] text-[#6b7280]">
                (Name, Email, WhatsApp number — Not saved to Resume Dump)
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Full Name *" className="geist-caption h-9 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-white/[0.28]" />
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Email Address *" className="geist-caption h-9 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-white/[0.28]" />
              <input type="tel" value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} placeholder="WhatsApp / Mobile Number *" className="geist-caption h-9 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-white/[0.28]" />
              <button onClick={queueManualCandidate} className={actionButtonClass}>
                <i className="fas fa-plus text-[11px]"></i>
                Add Candidate
              </button>
            </div>
          </div>

          {/* Section 3: Bulk Upload & Invite Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <label className="flex flex-1 min-h-10 cursor-pointer items-center justify-center gap-2 rounded-[6px] border border-dashed border-white/[0.18] bg-white/[0.03] px-4 text-[#d4d4d4] transition-colors hover:bg-white/[0.06]">
              {parsingResumes ? (
                <>
                  <ButtonBusySkeleton className="w-4 bg-white/[0.16]" />
                  <ButtonBusySkeleton className="w-24 bg-white/[0.16]" />
                </>
              ) : (
                <>
                  <i className="fas fa-file-excel text-green-400 text-[14px]"></i>
                  <span className="geist-caption font-semibold text-xs sm:text-sm">Bulk Upload (Excel / CSV / Multi-Resumes)</span>
                </>
              )}
              <input type="file" multiple accept=".xlsx,.xls,.csv,.pdf,.txt,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,text/csv" className="hidden" onChange={handleResumeUpload} disabled={parsingResumes} />
            </label>

            <button onClick={handleSendInvites} disabled={sendingEmails || queuedCount === 0} className={`${primaryButtonClass} shrink-0 px-5`}>
              {sendingEmails ? (
                <ButtonBusySkeleton className="w-28 bg-black/[0.18]" />
              ) : (
                <>
                  <i className="fas fa-paper-plane text-[11px]"></i>
                  Send invites{queuedCount ? ` (${queuedCount})` : ''}
                </>
              )}
            </button>
          </div>

          {sendingProgressMsg && (
            <div className="flex items-center gap-2 rounded-[6px] border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-300 animate-pulse">
              <i className="fas fa-spinner fa-spin"></i>
              <span>{sendingProgressMsg}</span>
            </div>
          )}

          <div className="grid gap-2">
            <p className="geist-label uppercase text-[#6b7280]">Invite queue</p>
            {parsedCandidates.length === 0 && newEmails.length === 0 ? (
              <p className="geist-caption rounded-[6px] border border-dashed border-white/[0.11] px-3 py-2 text-[#6b7280]">No candidates queued. Upload resumes or add manually.</p>
            ) : (
              <div className="grid max-h-[120px] gap-2 overflow-y-auto pr-1">
                {parsedCandidates.map((candidate, idx) => {
                  return (
                    <div key={candidate.email || candidate.phone || idx} className="grid gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div className="min-w-0">
                        <p className="geist-caption truncate font-medium text-white">
                          {candidate.name ? candidate.name : (candidate.email || candidate.phone)}
                        </p>
                        <p className="geist-small mt-0.5 truncate text-[#8f8f8f]">
                          {candidate.email ? `Email: ${candidate.email}` : ''}
                          {candidate.phone && candidate.phone !== 'N/A' ? ` | Phone: ${candidate.phone}` : ''}
                          {candidate.experience ? ` | Exp: ${candidate.experience} yrs` : ''}
                          {candidate.location ? ` | Loc: ${candidate.location}` : ''}
                          {candidate.matchScore && candidate.matchScore !== 'N/A' ? ` | Match: ${candidate.matchScore}%` : ''}
                        </p>
                      </div>
                      <button onClick={() => {
                        if (candidate.email) setNewEmails((prev) => prev.filter((item) => item !== candidate.email));
                        setParsedCandidates((prev) => prev.filter((_, i) => i !== idx));
                      }} className="geist-caption inline-flex h-8 items-center justify-center rounded-[6px] border border-[#3f1d1d] bg-[#180707] px-3 font-medium text-[#ff8f8f] transition-colors hover:bg-[#260b0b]" title="Remove Candidate">
                        <i className="fas fa-trash-alt text-[11px]"></i>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
      </section>

      <section className="grid gap-3 border-b border-white/[0.11] px-4 py-3 sm:px-6 lg:grid-cols-[minmax(240px,1fr)_140px_auto] lg:items-center lg:px-7">
        <label className="relative min-w-0">
          <span className="sr-only">Search candidates</span>
          <i className="fas fa-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-[#6b7280]"></i>
          <input
            type="text"
            value={rosterSearch}
            onChange={(e) => setRosterSearch(e.target.value)}
            placeholder="Search candidate email"
            className="geist-caption h-9 w-full rounded-[6px] border border-white/[0.11] bg-white/[0.03] pl-9 pr-3 text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-white/[0.28] focus:bg-white/[0.05]"
          />
        </label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'All' | 'Submitted' | 'Pending')}
          className="geist-caption h-9 rounded-[6px] border border-white/[0.11] bg-[#050505] px-3 text-[#d4d4d4] outline-none transition-colors focus:border-white/[0.28]"
        >
          <option value="All">All status</option>
          <option value="Submitted">Submitted</option>
          <option value="Pending">Pending</option>
        </select>

        {/* Distinct Reminder Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSendBulkEmailReminders}
            disabled={reminding || pendingEmails.length === 0}
            className="geist-caption inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] border border-blue-500/40 bg-blue-500/10 px-3 font-semibold text-blue-300 transition-colors hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            title="Send bulk reminder via Email to all pending candidates"
          >
            <i className="fas fa-envelope text-[11px] text-blue-400"></i>
            <span>Email Reminders</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setWaReminderTarget('whatsapp');
              setShowWaDelayModal(true);
            }}
            disabled={reminding || pendingEmails.length === 0}
            className="geist-caption inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] border border-emerald-500/40 bg-emerald-500/10 px-3 font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            title="Configure min/max delay & send bulk WhatsApp reminders"
          >
            <i className="fab fa-whatsapp text-[12px] text-emerald-400"></i>
            <span>WhatsApp Reminders</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setWaReminderTarget('both');
              setShowWaDelayModal(true);
            }}
            disabled={reminding || pendingEmails.length === 0}
            className="geist-caption inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] border border-amber-500/40 bg-amber-500/10 px-3 font-semibold text-amber-300 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            title="Configure min/max delay & send BOTH Email & WhatsApp reminders"
          >
            <i className="fas fa-paper-plane text-[11px] text-amber-400"></i>
            <span>Both (Mail + WhatsApp) {pendingEmails.length > 0 ? `(${pendingEmails.length})` : ''}</span>
          </button>
        </div>
      </section>

      <section className="flex min-h-[360px] flex-col">
        {filteredRoster.length === 0 ? (
          <div className="border-b border-dashed border-white/[0.11] px-4 py-14 text-center sm:px-6 lg:px-7">
            <p className="geist-caption text-[#8f8f8f]">No candidates found.</p>
          </div>
        ) : (
          <>
            <div className="sticky top-[146px] z-10 hidden grid-cols-[minmax(0,1fr)_120px_150px_minmax(280px,auto)] items-center gap-4 border-b border-white/[0.11] bg-[#000] px-4 py-2 sm:px-6 lg:grid lg:px-7">
              <span className="geist-label uppercase text-[#6b7280]">Candidate</span>
              <span className="geist-label uppercase text-[#6b7280]">Status</span>
              <span className="geist-label uppercase text-[#6b7280]">Resume</span>
              <span className="geist-label text-right uppercase text-[#6b7280]">Actions</span>
            </div>
            <div className="max-h-[calc(100vh-430px)] min-h-[280px] overflow-y-auto">
              {filteredRoster.map((candidate) => {
                const candidateData = (interview as any).candidateData?.find((item: any) => item.email?.toLowerCase() === candidate.email.toLowerCase());
                const isInvited = (interview.candidateEmails || []).some((email) => email.toLowerCase() === candidate.email.toLowerCase());
                const isEditing = editingCandidateEmail?.toLowerCase() === candidate.email.toLowerCase();
                const isResending = resendingEmail?.toLowerCase() === candidate.email.toLowerCase();

                return (
                  <article key={`${candidate.email}-${candidate.attemptId || 'pending'}`} className="grid gap-3 border-b border-white/[0.08] px-4 py-3 transition-colors hover:bg-white/[0.025] sm:px-6 lg:grid-cols-[minmax(0,1fr)_120px_150px_minmax(280px,auto)] lg:items-center lg:gap-4 lg:px-7">
                    <div className="min-w-0">
                      {isEditing ? (
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                          <input
                            type="email"
                            value={editedEmailValue}
                            onChange={(e) => setEditedEmailValue(e.target.value)}
                            className="geist-caption h-8 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 text-white outline-none focus:border-white/[0.28]"
                            placeholder="Candidate Email"
                            autoFocus
                          />
                          <input
                            type="tel"
                            value={editedPhoneValue}
                            onChange={(e) => setEditedPhoneValue(e.target.value)}
                            className="geist-caption h-8 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 text-white outline-none focus:border-white/[0.28]"
                            placeholder="Phone (e.g. 9823188483)"
                          />
                          <button onClick={() => handleEditAndResend(candidate.email, editedEmailValue, editedPhoneValue)} disabled={resendingEmail !== null} className={primaryButtonClass}>
                            {isResending ? (
                              <ButtonBusySkeleton className="w-12 bg-black/[0.18]" />
                            ) : (
                              <>
                                <i className="fas fa-save text-[11px]"></i>
                                Save & Resend
                              </>
                            )}
                          </button>
                          <button onClick={() => setEditingCandidateEmail(null)} disabled={resendingEmail !== null} className={actionButtonClass}>Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="geist-caption truncate font-semibold text-white">{candidate.email}</p>
                            <p className="geist-small mt-1 truncate text-[#8bbde8]">
                              {candidateData?.phone && candidateData.phone !== 'N/A' ? (
                                <span><i className="fas fa-phone-alt mr-1 text-[10px] opacity-70"></i>{candidateData.phone}</span>
                              ) : (
                                <span className="text-[#8f8f8f]">Phone not added</span>
                              )}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setEditingCandidateEmail(candidate.email);
                              setEditedEmailValue(candidate.email);
                              setEditedPhoneValue(candidateData?.phone && candidateData.phone !== 'N/A' ? candidateData.phone : '');
                            }}
                            className="p-1 text-[#8f8f8f] hover:text-white transition-colors"
                            title="Edit Candidate Email & Phone"
                          >
                            <i className="fas fa-edit text-xs"></i>
                          </button>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="geist-label mb-1 uppercase text-[#6b7280] lg:hidden">Status</p>
                      <span className={`geist-caption inline-flex h-7 items-center gap-1.5 rounded-[6px] border px-2 font-medium ${candidate.hasSubmitted ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-[#173d25] dark:bg-[#071a10] dark:text-[#7ee787]' : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-[#4b3a16] dark:bg-[#181104] dark:text-[#ffd166]'}`}>
                        <i className={candidate.hasSubmitted ? 'fas fa-check-circle text-[10px]' : 'fas fa-clock text-[10px]'}></i>
                        {candidate.hasSubmitted ? 'Submitted' : 'Pending'}
                      </span>
                    </div>

                    <div>
                      <p className="geist-label mb-1 uppercase text-[#6b7280] lg:hidden">Resume</p>
                      <p className="geist-caption truncate text-[#d4d4d4]">
                        {candidateData?.matchScore && candidateData.matchScore !== 'N/A' ? `${candidateData.matchScore}% match` : 'Not scored'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end lg:whitespace-nowrap">
                      {candidate.hasSubmitted && (
                        <button
                          type="button"
                          onClick={() => handleAllowReattempt(candidate.attemptId!, candidate.allowReattempt || false)}
                          className={`geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border px-3 font-medium transition-colors ${candidate.allowReattempt ? 'border-[#32245a] bg-[#120b29] text-[#c4b5fd] hover:bg-[#1b103d]' : 'border-white/[0.11] bg-white/[0.03] text-[#d4d4d4] hover:bg-white/[0.06] hover:text-white'}`}
                        >
                          <i className="fas fa-redo text-[10px]"></i>
                          {candidate.allowReattempt ? 'Reattempt on' : 'Allow reattempt'}
                        </button>
                      )}

                      {!candidate.hasSubmitted && (
                        <button
                          type="button"
                          onClick={() => handleDirectWhatsAppInvite(candidate.email, candidateData?.phone)}
                          disabled={sendingWhatsAppEmail === candidate.email}
                          className="geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border border-emerald-500/30 bg-emerald-500/10 px-3 font-semibold text-emerald-700 hover:bg-emerald-600 hover:text-white dark:border-[#173d25] dark:bg-[#071a10] dark:text-[#7ee787] dark:hover:bg-[#0b2415] transition-colors disabled:opacity-50"
                        >
                          {sendingWhatsAppEmail === candidate.email ? (
                            <i className="fas fa-spinner fa-spin text-[11px]"></i>
                          ) : (
                            <i className="fab fa-whatsapp text-[11px]"></i>
                          )}
                          WhatsApp
                        </button>
                      )}

                      {isInvited && !isEditing && (
                        <>
                          <button onClick={() => { setEditingCandidateEmail(candidate.email); setEditedEmailValue(candidate.email); }} disabled={resendingEmail !== null} className={actionButtonClass} title="Edit Email & Resend">
                            <i className="fas fa-pencil-alt text-[11px]"></i>
                            Edit
                          </button>
                          <button onClick={() => handleResend(candidate.email)} disabled={resendingEmail !== null} className={actionButtonClass} title="Resend Invitation">
                            {isResending ? (
                              <ButtonBusySkeleton className="w-16 bg-white/[0.16]" />
                            ) : (
                              <>
                                <i className="fas fa-paper-plane text-[11px]"></i>
                                Resend
                              </>
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      {whatsappModal?.isOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white text-gray-900 shadow-xl dark:border-white/10 dark:bg-zinc-900 dark:text-white">
              <div className="flex items-center gap-3 border-b border-emerald-500/20 bg-emerald-500/10 p-4">
                <div className="rounded-full bg-emerald-500/20 p-2 text-emerald-600 dark:text-emerald-400">
                  <i className="fab fa-whatsapp text-xl"></i>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold">Send WhatsApp Invite</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Send an invitation link to the candidate via WhatsApp Web</p>
                </div>
                <button onClick={() => setWhatsappModal(null)} className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-600 dark:hover:bg-white/5 dark:hover:text-gray-200">
                  <i className="fas fa-times text-lg"></i>
                </button>
              </div>
              <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Candidate Email</label>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-sm font-semibold dark:border-zinc-800 dark:bg-black/30">{whatsappModal.email}</div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Phone Number <span className="text-red-500">*</span></label>
                  <input type="tel" value={whatsappModal.phone} onChange={(e) => setWhatsappModal({ ...whatsappModal, phone: e.target.value })} placeholder="Enter phone number" className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800" />
                  <p className="mt-1 text-[10px] text-gray-400">Include country code if outside India. 10-digit Indian numbers auto-prepend +91.</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Draft Message Preview</label>
                  <textarea value={whatsappModal.message} onChange={(e) => setWhatsappModal({ ...whatsappModal, message: e.target.value })} rows={6} className="w-full resize-none rounded-xl border border-gray-200 bg-white p-3 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800" />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 p-4 dark:border-white/5 dark:bg-white/5">
                <button onClick={() => setWhatsappModal(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5">Cancel</button>
                <button onClick={handleWhatsAppSend} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition-colors hover:bg-emerald-500">
                  <i className="fab fa-whatsapp"></i>
                  <span>Send WhatsApp Invite</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      {showSuggestModal &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setShowSuggestModal(false)}>
            <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-white/[0.15] bg-[#0c0c0c] text-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/[0.11] bg-[#141414] px-6 py-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Sparkles className="text-blue-400 size-4 animate-pulse" />
                    Suggested Candidates for "{interview.title}"
                  </h2>
                  <p className="geist-small text-[#8f8f8f] mt-0.5">
                    Matched from your Resume Dump based on JD & skills. Excludes hired candidates and already invited candidates.
                  </p>
                </div>
                <button onClick={() => setShowSuggestModal(false)} className="text-[#8f8f8f] hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>

              {/* Search & Batch Actions bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.11] bg-[#050505] px-6 py-3">
                <div className="relative flex-1 min-w-[220px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8f8f8f]" />
                  <input
                    type="text"
                    placeholder="Filter candidate suggestions by name, email, or skill..."
                    value={suggestSearchTerm}
                    onChange={e => setSuggestSearchTerm(e.target.value)}
                    className="geist-caption h-8 w-full rounded-[6px] border border-white/[0.11] bg-[#111] pl-8 pr-3 text-white outline-none focus:border-blue-500/50"
                  />
                </div>
                
                {filteredSuggestedCandidates.length > 0 && (
                  <button
                    onClick={addAllSuggestedToQueue}
                    className="geist-caption inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-blue-500/40 bg-blue-600/20 px-3 font-semibold text-blue-300 hover:bg-blue-600/30 transition-colors"
                  >
                    <UserPlus size={13} />
                    <span>Add All Matched ({filteredSuggestedCandidates.length}) to Queue</span>
                  </button>
                )}
              </div>

              {/* Candidate Suggestions List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
                {loadingResumeDump ? (
                  <div className="py-12 text-center text-[#8f8f8f] geist-caption">
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Matching candidate resumes against job description...
                  </div>
                ) : filteredSuggestedCandidates.length === 0 ? (
                  <div className="py-12 text-center space-y-2">
                    <p className="geist-caption font-semibold text-white">No candidate suggestions found matching this role</p>
                    <p className="geist-small text-[#8f8f8f] max-w-md mx-auto">
                      Upload candidate resumes into <Link to="/recruiter/resume-dump" onClick={() => setShowSuggestModal(false)} className="text-blue-400 underline">Resume Dump</Link> or try clearing your search filter.
                    </p>
                  </div>
                ) : (
                  filteredSuggestedCandidates.map((candidate) => {
                    const emailLower = (candidate.email || '').toLowerCase();
                    const isQueued = (emailLower && newEmails.includes(emailLower)) || 
                                     parsedCandidates.some(c => (emailLower && c.email.toLowerCase() === emailLower) || (candidate.phone && c.phone === candidate.phone));

                    return (
                      <div key={candidate.id} className="rounded-[8px] border border-white/[0.11] bg-[#121212] p-4 hover:border-white/[0.2] transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="geist-caption font-bold text-white truncate">{candidate.name || 'Candidate'}</h4>
                              <span className="geist-small rounded-full border border-blue-500/40 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-bold text-blue-400">
                                {candidate.matchScore}% Match
                              </span>
                            </div>

                            <div className="geist-small mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[#8bbde8]">
                              {candidate.email && <span>✉️ {candidate.email}</span>}
                              {candidate.phone && <span>📱 {candidate.phone}</span>}
                            </div>

                            {(candidate.currentTitle || candidate.totalExperienceYears > 0) && (
                              <p className="geist-small mt-1 text-[#8f8f8f]">
                                {[candidate.currentTitle, candidate.totalExperienceYears > 0 ? `${candidate.totalExperienceYears} yrs experience` : ''].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {candidate.resumeUrl && (
                              <a
                                href={candidate.resumeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="geist-caption inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-2.5 text-[#d4d4d4] hover:text-white hover:bg-white/[0.06] transition-colors"
                              >
                                <ExternalLink size={13} />
                                <span>Resume</span>
                              </a>
                            )}

                            <button
                              type="button"
                              disabled={isQueued}
                              onClick={() => addSuggestedCandidateToQueue(candidate)}
                              className={`geist-caption inline-flex h-8 items-center gap-1.5 rounded-[6px] px-3 font-semibold transition-colors ${
                                isQueued
                                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 cursor-default'
                                  : 'border border-white bg-white text-black hover:bg-[#eaeaea]'
                              }`}
                            >
                              {isQueued ? (
                                <>
                                  <Check size={13} />
                                  <span>Added</span>
                                </>
                              ) : (
                                <>
                                  <UserPlus size={13} />
                                  <span>Add to Queue</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {candidate.matchedSkills && candidate.matchedSkills.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-white/[0.06]">
                            <span className="geist-small text-[#6b7280] self-center mr-1">Matched Skills:</span>
                            {candidate.matchedSkills.slice(0, 6).map(skill => (
                              <span key={skill} className="geist-small rounded-[4px] border border-white/[0.11] bg-white/[0.04] px-2 py-0.5 text-[#d4d4d4]">
                                {skill}
                              </span>
                            ))}
                            {candidate.matchedSkills.length > 6 && (
                              <span className="geist-small text-[#8f8f8f] self-center ml-1">+{candidate.matchedSkills.length - 6} more</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-white/[0.11] bg-[#141414] px-6 py-3">
                <span className="geist-small text-[#8f8f8f]">
                  Candidates added to queue will appear in your invitation queue for 1-click Email & WhatsApp sending.
                </span>
                <button
                  onClick={() => setShowSuggestModal(false)}
                  className="geist-caption rounded-[6px] border border-white bg-white px-4 py-1.5 font-bold text-black hover:bg-[#eaeaea] transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {showWaDelayModal &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 text-white shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-emerald-500/20 p-2 text-emerald-400">
                    <i className="fab fa-whatsapp text-lg"></i>
                  </div>
                  <div>
                    <h3 className="geist-caption font-bold text-base text-white">WhatsApp Anti-Spam Delay Settings</h3>
                    <p className="geist-small text-xs text-[#8f8f8f]">Set min/max delay between candidate reminders</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowWaDelayModal(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] text-[#8f8f8f] block mb-1 font-medium">Min Delay</label>
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
                    className="w-full h-9 rounded-[6px] border border-white/15 bg-white/[0.04] px-2.5 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#8f8f8f] block mb-1 font-medium">Max Delay</label>
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
                    className="w-full h-9 rounded-[6px] border border-white/15 bg-white/[0.04] px-2.5 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#8f8f8f] block mb-1 font-medium">Delay Unit</label>
                  <select
                    value={waDelayUnit}
                    onChange={(e) => setWaDelayUnit(e.target.value as 'sec' | 'min')}
                    className="w-full h-9 rounded-[6px] border border-white/15 bg-[#121212] px-2 text-xs text-white outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="sec">Seconds (sec)</option>
                    <option value="min">Minutes (min)</option>
                  </select>
                </div>
              </div>

              <p className="text-[11px] text-emerald-400 italic">
                * Each WhatsApp message will pause for a random delay between {waMinDelay || 15} - {waMaxDelay || 25} {waDelayUnit} to protect your WhatsApp number from spam blocking.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowWaDelayModal(false)}
                  className="geist-caption h-9 px-4 rounded-[6px] border border-white/15 bg-white/[0.04] text-xs font-medium text-[#d4d4d4] hover:bg-white/[0.08]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowWaDelayModal(false);
                    if (waReminderTarget === 'whatsapp') {
                      executeSendBulkWhatsAppReminders(Number(waMinDelay) || 15, Number(waMaxDelay) || 25, waDelayUnit);
                    } else {
                      executeSendBulkBothReminders(Number(waMinDelay) || 15, Number(waMaxDelay) || 25, waDelayUnit);
                    }
                  }}
                  className="geist-caption h-9 px-4 rounded-[6px] border border-emerald-500 bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500 shadow-sm flex items-center gap-1.5"
                >
                  <i className="fab fa-whatsapp"></i>
                  <span>Send Reminders Now</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      <WhatsAppConnectModal
        isOpen={isWhatsAppConnectOpen}
        onClose={() => setIsWhatsAppConnectOpen(false)}
      />
    </div>
  );
};

export default InterviewCandidates;
