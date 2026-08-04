import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  UserPlus, 
  Sparkles, 
  Upload, 
  FileText, 
  Users, 
  Send, 
  Check, 
  Trash2, 
  Search, 
  Phone, 
  Mail, 
  CheckCircle2,
  RefreshCw,
  Edit3,
  MessageSquare,
  FileSpreadsheet,
  Save,
  Clock,
  AlertTriangle,
  Zap
} from 'lucide-react';
import { Interview } from '../types';
import { useAuth } from '../context/AuthContext';
import { useMessageBox } from '../components/MessageBox';
import { sendInterviewInvitations } from '../services/brevoService';
import { sendInterviewWhatsAppInvite, sendBulkWhatsAppInvites } from '../services/waSenderService';
import { parseCandidateDocument } from '../services/candidateFileParser';
import { ingestResumeFile, saveResumeDumpCandidate, scoreCandidateForRole, ResumeDumpRecord, ParsedResumeProfile } from '../services/resumeService';
import { rds } from '../services/rdsApi';
import { extractJobDetailsOptions } from '../services/jobDetailsHelper';

interface InviteCandidateModalProps {
  job: Interview;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function InviteCandidateModal({ job, onClose, onSuccess }: InviteCandidateModalProps) {
  const { user, userProfile } = useAuth();
  const messageBox = useMessageBox();

  // Active Tab: 'single' | 'bulk' | 'invited' | 'suggest'
  const [activeTab, setActiveTab] = useState<'single' | 'bulk' | 'invited' | 'suggest'>('single');

  // Single Resume Upload State
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [singleExperience, setSingleExperience] = useState<string>('');
  const [singleNotes, setSingleNotes] = useState<string>('');
  const [isAnalyzingSingle, setIsAnalyzingSingle] = useState<boolean>(false);

  // Manual Candidate Entry State
  const [manualEmail, setManualEmail] = useState<string>('');
  const [manualPhone, setManualPhone] = useState<string>('');

  // Candidate Roster to be invited in this session
  const [candidateRoster, setCandidateRoster] = useState<Array<{ email: string; phone: string; name?: string; source?: string }>>([]);

  // Bulk Upload State
  const [bulkFiles, setBulkFiles] = useState<FileList | null>(null);
  const [bulkText, setBulkText] = useState<string>('');
  const [isProcessingBulk, setIsProcessingBulk] = useState<boolean>(false);

  // Live WhatsApp Progress & Anti-Ban Delay State
  const [waProgress, setWaProgress] = useState<{
    current: number;
    total: number;
    candidateName: string;
    isWaiting: boolean;
  } | null>(null);

  // Inline Editing State for Invited Candidates
  const [editingInvitedEmail, setEditingInvitedEmail] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editEmail, setEditEmail] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Reminders Action State
  const [sendingReminderEmail, setSendingReminderEmail] = useState<string | null>(null);
  const [sendingReminderWA, setSendingReminderWA] = useState<string | null>(null);

  // AI Suggestions State
  const [resumeDumpCandidates, setResumeDumpCandidates] = useState<ResumeDumpRecord[]>([]);
  const [loadingResumeDump, setLoadingResumeDump] = useState<boolean>(false);
  const [suggestSearch, setSuggestSearch] = useState<string>('');

  // Submitting / Dispatching Invites State
  const [isSending, setIsSending] = useState<boolean>(false);

  const teamId = userProfile?.teamId || userProfile?.parentRecruiterId || user?.uid || '';

  // Already invited candidates list from job data
  const existingInvitedCandidates = useMemo(() => {
    const emails = job.candidateEmails || [];
    const candidateData: any[] = (job as any).candidateData || [];
    const map = new Map<string, { email: string; phone: string; name?: string }>();

    candidateData.forEach((c) => {
      const email = c.email || '';
      const phone = c.phone || '';
      const cleanEmail = email.includes('@whatsapp.noemail') ? '' : email;
      const key = cleanEmail ? cleanEmail.toLowerCase() : phone;
      if (!key) return;

      map.set(key, {
        email: cleanEmail,
        phone: phone || '',
        name: c.name || (cleanEmail ? cleanEmail.split('@')[0] : phone ? `Candidate (${phone})` : 'Candidate')
      });
    });

    emails.forEach((email) => {
      if (email && !email.includes('@whatsapp.noemail') && !map.has(email.toLowerCase())) {
        map.set(email.toLowerCase(), {
          email,
          phone: '',
          name: email.split('@')[0]
        });
      }
    });

    return Array.from(map.values());
  }, [job]);

  // Load Resume Dump for AI Candidate suggestions
  useEffect(() => {
    if (!user || activeTab !== 'suggest') return;
    setLoadingResumeDump(true);

    rds.listResumeDump(teamId)
      .then(({ candidates }) => {
        const list: ResumeDumpRecord[] = (candidates || []).map((data: any) => ({
          id: data.id,
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
        })).filter((c) => !c.isHired && !c.doNotSuggest);
        setResumeDumpCandidates(list);
      })
      .catch((err) => console.error('Failed to fetch resume dump:', err))
      .finally(() => setLoadingResumeDump(false));
  }, [user, activeTab, teamId]);

  // AI Candidate scoring for suggestions
  const suggestedCandidates = useMemo(() => {
    if (resumeDumpCandidates.length === 0) return [];

    const jobTitle = job.title || '';
    const rawSkills = (job as any).skills || '';
    const jobSkills = typeof rawSkills === 'string'
      ? rawSkills.split(',').map((s: string) => s.trim()).filter(Boolean)
      : Array.isArray(rawSkills) ? rawSkills : [];

    return resumeDumpCandidates
      .map((c) => {
        const scoreResult = scoreCandidateForRole(c, {
          title: jobTitle,
          requiredSkills: jobSkills,
          description: job.description || ''
        });
        return {
          candidate: c,
          score: scoreResult.matchScore,
          matchedSkills: scoreResult.matchedSkills
        };
      })
      .filter((item) => {
        if (!suggestSearch) return true;
        const q = suggestSearch.toLowerCase();
        return (
          item.candidate.name.toLowerCase().includes(q) ||
          item.candidate.email.toLowerCase().includes(q) ||
          item.candidate.skills.some((s) => s.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.score - a.score);
  }, [resumeDumpCandidates, job, suggestSearch]);

  // Start Inline Edit for an Invited Candidate
  const handleStartEditInvited = (candidate: { email: string; phone: string; name?: string }) => {
    setEditingInvitedEmail(candidate.email);
    setEditName(candidate.name || '');
    setEditEmail(candidate.email || '');
    setEditPhone(candidate.phone || '');
  };

  // Save Inline Edit for an Invited Candidate
  const handleSaveEditInvited = async (originalEmail: string) => {
    if (!editEmail.trim() && !editPhone.trim()) {
      messageBox.showError('Please provide a valid email or phone number.');
      return;
    }

    setIsSavingEdit(true);

    try {
      const existingEmails = job.candidateEmails || [];
      const existingCandidateData: any[] = (job as any).candidateData || [];

      // Replace in emails array
      const updatedEmails = existingEmails.map((e) => (e.toLowerCase() === originalEmail.toLowerCase() ? editEmail.trim() : e));
      if (!updatedEmails.includes(editEmail.trim())) {
        updatedEmails.push(editEmail.trim());
      }

      // Replace in candidateData array
      let updatedData = existingCandidateData.map((c) => {
        if (c.email && c.email.toLowerCase() === originalEmail.toLowerCase()) {
          return {
            ...c,
            name: editName.trim() || c.name,
            email: editEmail.trim(),
            phone: editPhone.trim()
          };
        }
        return c;
      });

      if (!updatedData.some((c) => c.email && c.email.toLowerCase() === editEmail.trim().toLowerCase())) {
        updatedData.push({
          name: editName.trim() || editEmail.split('@')[0],
          email: editEmail.trim(),
          phone: editPhone.trim()
        });
      }

      await rds.updateInterview(job.id, {
        candidateEmails: updatedEmails,
        candidateData: updatedData
      });

      // Update local job state
      (job as any).candidateEmails = updatedEmails;
      (job as any).candidateData = updatedData;

      messageBox.showSuccess('Candidate details updated successfully.');
      setEditingInvitedEmail(null);
    } catch (err: any) {
      console.error('Error updating candidate details:', err);
      messageBox.showError('Failed to update candidate details: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Send WhatsApp Reminder
  const handleSendWAReminder = async (candidate: { email: string; phone: string; name?: string }) => {
    if (!candidate.phone) {
      messageBox.showError('WhatsApp phone number is not available for this candidate.');
      return;
    }

    setSendingReminderWA(candidate.email);

    try {
      const interviewLink = job.interviewLink || `${window.location.origin}/#/interview/${job.id}`;
      const accessCode = job.accessCode || 'IXP' + job.id.slice(0, 6).toUpperCase();

      const remOptions = extractJobDetailsOptions(job, userProfile, user);

      const res = await sendInterviewWhatsAppInvite({
        phone: candidate.phone,
        candidateName: candidate.name || (candidate.email ? candidate.email.split('@')[0] : 'Candidate'),
        jobTitle: job.title,
        interviewLink,
        accessCode,
        isReminder: true,
        options: remOptions
      });

      if (res.success) {
        messageBox.showSuccess(`WhatsApp reminder sent to ${candidate.name || candidate.phone}!`);
      } else {
        messageBox.showError('WhatsApp reminder failed: ' + (res.error || 'Unknown error'));
      }
    } catch (err: any) {
      console.error('Error sending WhatsApp reminder:', err);
      messageBox.showError('Failed to send WhatsApp reminder.');
    } finally {
      setSendingReminderWA(null);
    }
  };

  // Send Email Reminder
  const handleSendEmailReminder = async (candidate: { email: string; phone: string; name?: string }) => {
    if (!candidate.email || !candidate.email.includes('@')) {
      messageBox.showError('Valid email address is not available for this candidate.');
      return;
    }

    setSendingReminderEmail(candidate.email);

    try {
      const interviewLink = job.interviewLink || `${window.location.origin}/#/interview/${job.id}`;
      const accessCode = job.accessCode || 'IXP' + job.id.slice(0, 6).toUpperCase();
      const remOptions = extractJobDetailsOptions(job, userProfile, user);

      const res = await sendInterviewInvitations(
        [candidate.email],
        job.title,
        interviewLink,
        accessCode,
        true, // isReminder
        remOptions
      );

      if (res.success) {
        messageBox.showSuccess(`Email reminder sent to ${candidate.email}!`);
      } else {
        messageBox.showError('Email reminder failed: ' + (res.error || 'Unknown error'));
      }
    } catch (err: any) {
      console.error('Error sending email reminder:', err);
      messageBox.showError('Failed to send email reminder.');
    } finally {
      setSendingReminderEmail(null);
    }
  };

  // Add Manual Candidate
  const handleAddManualCandidate = () => {
    const email = manualEmail.trim();
    const phone = manualPhone.trim();

    if (!email && !phone) {
      messageBox.showError('Please provide an email address or WhatsApp phone number.');
      return;
    }

    if (email && !email.includes('@')) {
      messageBox.showError('Please enter a valid email address.');
      return;
    }

    setCandidateRoster((prev) => {
      const filtered = prev.filter((c) => (email && c.email.toLowerCase() === email.toLowerCase()) || (phone && c.phone === phone));
      return [...filtered, { email, phone, source: 'Manual' }];
    });

    setManualEmail('');
    setManualPhone('');
    messageBox.showSuccess('Candidate added to invitation list.');
  };

  // Analyze Single Resume
  const handleAnalyzeSingleResume = async () => {
    if (!singleFile) {
      messageBox.showError('Please select a candidate resume file (PDF, DOCX, TXT).');
      return;
    }

    setIsAnalyzingSingle(true);
    try {
      const docResult = await parseCandidateDocument(singleFile);
      const text = typeof docResult === 'string' ? docResult : (docResult as any[]).map((c) => c.text || '').join('\n');
      const ingested = await ingestResumeFile(singleFile);
      const prof = ingested.profile;

      const candidateProfile: ParsedResumeProfile = {
        name: prof.name || singleFile.name.replace(/\.[^/.]+$/, ''),
        email: prof.email || '',
        phone: prof.phone || '',
        location: prof.location || '',
        currentTitle: prof.currentTitle || '',
        summary: singleNotes ? `${prof.summary || ''}\nRecruiter Notes: ${singleNotes}` : prof.summary || '',
        totalExperienceYears: singleExperience ? parseFloat(singleExperience) : prof.totalExperienceYears || 0,
        skills: prof.skills || [],
        experience: prof.experience || [],
        education: prof.education || [],
        certifications: prof.certifications || [],
        languages: prof.languages || [],
        keywords: prof.keywords || [],
        linkedinUrl: prof.linkedinUrl || '',
        portfolioUrl: prof.portfolioUrl || '',
        parsingMethod: 'hybrid',
        parserVersion: 1,
      };

      if (user) {
        await saveResumeDumpCandidate({
          recruiterUID: user.uid,
          teamId,
          profile: candidateProfile,
          resumeText: typeof ingested.resumeText === 'string' ? ingested.resumeText : text,
          resumeUrl: ingested.resumeUrl || '',
          fileName: singleFile.name,
          mimeType: singleFile.type || 'application/pdf',
          source: 'interview_creation',
          sourceInterviewId: job.id,
          sourceJobTitle: job.title
        });
      }

      if (candidateProfile.email || candidateProfile.phone) {
        setCandidateRoster((prev) => [
          ...prev,
          {
            email: candidateProfile.email,
            phone: candidateProfile.phone,
            name: candidateProfile.name,
            source: 'Resume AI'
          }
        ]);
        messageBox.showSuccess(`Resume analyzed! Saved candidate "${candidateProfile.name}" to Resume Dump and added to invite list.`);
      } else {
        messageBox.showSuccess('Resume analyzed and saved to Resume Dump! Please specify candidate email or phone below.');
      }

      setSingleFile(null);
      setSingleExperience('');
      setSingleNotes('');
    } catch (err: any) {
      console.error('Error analyzing resume:', err);
      messageBox.showError('Failed to analyze resume: ' + (err.message || 'Unknown error'));
    } finally {
      setIsAnalyzingSingle(false);
    }
  };

  // Process Bulk Import (Excel, CSV, PDF, DOCX, TXT)
  const handleProcessBulk = async () => {
    setIsProcessingBulk(true);
    try {
      const extracted: Array<{ email: string; phone: string; name?: string }> = [];

      // Process pasted text
      if (bulkText.trim()) {
        const emails = bulkText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
        const phones = bulkText.match(/\+?[0-9]{10,13}/g) || [];

        const count = Math.max(emails.length, phones.length);
        for (let i = 0; i < count; i++) {
          extracted.push({
            email: emails[i] || '',
            phone: phones[i] || '',
            name: emails[i] ? emails[i].split('@')[0] : 'Candidate'
          });
        }
      }

      // Process uploaded files (Excel / CSV / PDF / DOCX / TXT)
      if (bulkFiles && bulkFiles.length > 0) {
        for (let i = 0; i < bulkFiles.length; i++) {
          const file = bulkFiles[i];
          try {
            const records = await parseCandidateDocument(file);
            if (Array.isArray(records)) {
              records.forEach((r) => {
                if (r.email || r.phone) {
                  extracted.push({
                    name: r.name,
                    email: r.email,
                    phone: r.phone
                  });
                }
              });
            }
          } catch (e) {
            console.error('Error parsing file:', file.name, e);
          }
        }
      }

      if (extracted.length === 0) {
        messageBox.showError('No candidate contacts found in uploaded files or text.');
        return;
      }

      setCandidateRoster((prev) => {
        const set = new Map(prev.map((c) => [c.email.toLowerCase() || c.phone, c]));
        extracted.forEach((item) => {
          const key = item.email.toLowerCase() || item.phone;
          if (key && !set.has(key)) {
            set.set(key, { ...item, source: 'Bulk Import' });
          }
        });
        return Array.from(set.values());
      });

      setBulkText('');
      setBulkFiles(null);
      messageBox.showSuccess(`Successfully extracted ${extracted.length} candidate(s) from Excel/CSV/Resumes!`);
    } catch (err: any) {
      console.error('Error processing bulk import:', err);
      messageBox.showError('Failed to process bulk import.');
    } finally {
      setIsProcessingBulk(false);
    }
  };

  // Toggle AI Candidate for Invite
  const handleToggleSuggestedCandidate = (c: ResumeDumpRecord) => {
    if (!c.email && !c.phone) return;
    const exists = candidateRoster.some((item) => (c.email && item.email.toLowerCase() === c.email.toLowerCase()) || (c.phone && item.phone === c.phone));

    if (exists) {
      setCandidateRoster((prev) => prev.filter((item) => (c.email && item.email.toLowerCase() !== c.email.toLowerCase()) && (c.phone && item.phone !== c.phone)));
    } else {
      setCandidateRoster((prev) => [
        ...prev,
        {
          email: c.email,
          phone: c.phone,
          name: c.name,
          source: 'AI Suggestion'
        }
      ]);
    }
  };

  // Dispatch Invitations Handler (Supports Email Only, WhatsApp Only, or Both with Anti-Ban 10s Delay)
  const handleSendInvitations = async (mode: 'both' | 'email' | 'whatsapp' = 'both') => {
    if (candidateRoster.length === 0) {
      messageBox.showError('Please add at least one candidate to the invitation list.');
      return;
    }

    setIsSending(true);
    setWaProgress(null);

    try {
      const interviewLink = job.interviewLink || `${window.location.origin}/#/interview/${job.id}`;
      const accessCode = job.accessCode || 'IXP' + job.id.slice(0, 6).toUpperCase();

      const validEmails = candidateRoster.map((c) => c.email).filter((e) => e && e.includes('@'));
      const validPhones = candidateRoster.filter((c) => c.phone && c.phone.trim()).map((c) => ({
        phone: c.phone,
        name: c.name || c.email?.split('@')[0]
      }));

      let emailSent = 0;
      let waSent = 0;

      const jobDetailsOptions = extractJobDetailsOptions(job, userProfile, user);

      // 1. Send Emails via Brevo if mode is 'both' or 'email'
      if ((mode === 'both' || mode === 'email') && validEmails.length > 0) {
        const emailRes = await sendInterviewInvitations(
          validEmails,
          job.title,
          interviewLink,
          accessCode,
          false,
          jobDetailsOptions
        );
        if (emailRes.success) emailSent = emailRes.totalEmails;
      }

      // 2. Send WhatsApp Invitations if mode is 'both' or 'whatsapp' (with mandatory 10s anti-ban delay)
      if ((mode === 'both' || mode === 'whatsapp') && validPhones.length > 0) {
        const waRes = await sendBulkWhatsAppInvites(
          validPhones,
          job.title,
          interviewLink,
          accessCode,
          false,
          (sentCount, totalCount, currentCandidate, isWaiting) => {
            setWaProgress({
              current: sentCount,
              total: totalCount,
              candidateName: currentCandidate,
              isWaiting
            });
          },
          jobDetailsOptions
        );
        if (waRes.success) waSent = waRes.totalSent;
      }

      // 3. Update PostgreSQL Interview Record with newly invited emails and candidate data
      const existingEmails: string[] = job.candidateEmails || [];
      const existingCandidateData: any[] = (job as any).candidateData || [];

      const newCandidateData = candidateRoster.map((c) => {
        const cleanPhone = c.phone ? c.phone.trim() : '';
        const cleanEmail = c.email ? c.email.trim().toLowerCase() : '';
        const fallbackEmail = cleanEmail || (cleanPhone ? `${cleanPhone.replace(/[^0-9]/g, '')}@whatsapp.noemail` : '');
        return {
          email: fallbackEmail,
          phone: cleanPhone || 'N/A',
          name: c.name || (cleanEmail ? cleanEmail.split('@')[0] : cleanPhone ? `Candidate (${cleanPhone})` : 'Candidate')
        };
      });

      const mergedCandidateData = [...existingCandidateData];
      for (const item of newCandidateData) {
        const itemEmail = (item.email || '').toLowerCase();
        const itemPhone = item.phone || '';
        const idx = mergedCandidateData.findIndex(
          (c: any) =>
            (itemEmail && c.email && c.email.toLowerCase() === itemEmail) ||
            (itemPhone && c.phone && c.phone === itemPhone && itemPhone !== 'N/A')
        );
        if (idx >= 0) {
          mergedCandidateData[idx] = { ...mergedCandidateData[idx], ...item };
        } else {
          mergedCandidateData.push(item);
        }
      }

      const allEmailsToSave = Array.from(
        new Set([
          ...existingEmails,
          ...mergedCandidateData.map((c: any) => c.email).filter(Boolean)
        ])
      );

      await rds.updateInterview(job.id, {
        candidateEmails: allEmailsToSave,
        candidateData: mergedCandidateData
      });

      messageBox.showSuccess(`Invitations dispatched successfully! (${emailSent} Emails, ${waSent} WhatsApp messages)`);
      setCandidateRoster([]);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error dispatching invitations:', err);
      messageBox.showError('Failed to send invitations: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSending(false);
      setWaProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/85 backdrop-blur-md p-4 animate-in fade-in">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col bg-white dark:bg-[#0a0a0c] border border-slate-200 dark:border-white/[0.12] rounded-2xl shadow-2xl overflow-hidden text-left font-sans text-slate-900 dark:text-white">

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-[#0d0d10]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
              <UserPlus size={18} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-none">Invite Candidate to Job</h3>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">Role: <span className="text-slate-900 dark:text-white font-medium">{job.title}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs Bar (4 Tabs matching screenshot) */}
        <div className="flex items-center gap-1 px-4 py-2 bg-slate-100/70 dark:bg-[#0c0c0e] border-b border-slate-200 dark:border-white/[0.08] overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setActiveTab('single')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === 'single'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-black shadow-md'
                : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/[0.04]'
            }`}
          >
            <FileText size={14} />
            Single Candidate
          </button>
          <button
            onClick={() => setActiveTab('bulk')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === 'bulk'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-black shadow-md'
                : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/[0.04]'
            }`}
          >
            <Upload size={14} />
            Bulk Import
          </button>
          <button
            onClick={() => setActiveTab('invited')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === 'invited'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-black shadow-md'
                : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/[0.04]'
            }`}
          >
            <Users size={14} />
            Invited Candidates ({existingInvitedCandidates.length})
          </button>
          <button
            onClick={() => setActiveTab('suggest')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === 'suggest'
                ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30'
                : 'text-emerald-700 dark:text-emerald-400/80 hover:text-emerald-900 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
            }`}
          >
            <Sparkles size={14} />
            Suggest AI Candidates
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-white dark:bg-[#0a0a0c]">

          {/* WhatsApp Progress & 10-second Anti-Ban Delay Live Banner */}
          {waProgress && (
            <div className="bg-emerald-50 dark:bg-[#121814] border border-emerald-200 dark:border-emerald-500/30 p-4 rounded-xl space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <span className="flex items-center gap-2">
                  <RefreshCw className="animate-spin" size={14} />
                  Sending WhatsApp {waProgress.current} of {waProgress.total}: {waProgress.candidateName}
                </span>
                <span className="font-mono text-[11px]">
                  {Math.round((waProgress.current / waProgress.total) * 100)}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-emerald-100 dark:bg-emerald-950 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 dark:bg-emerald-400 transition-all duration-300"
                  style={{ width: `${(waProgress.current / waProgress.total) * 100}%` }}
                />
              </div>

              {waProgress.isWaiting && (
                <div className="flex items-center gap-2 text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 p-2 rounded-lg border border-amber-200 dark:border-amber-500/20 mt-1">
                  <Clock size={13} className="shrink-0 animate-pulse" />
                  <span>WhatsApp Anti-Ban Protection: Mandatory 10-second delay between messages to protect account from blocking...</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 1: Single Candidate */}
          {activeTab === 'single' && (
            <div className="space-y-6">

              {/* Upload Single Resume + AI Analysis Box */}
              <div className="bg-slate-50 dark:bg-[#101014] border border-slate-200 dark:border-white/[0.1] p-5 rounded-2xl space-y-4">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold uppercase tracking-wider">
                  <Sparkles size={15} />
                  <span>Upload Single Resume + AI Analysis</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">
                  Upload candidate resume (PDF, DOCX, TXT) and add optional recruiter notes. AI analyzes details, extracts contact info, saves to <span className="text-slate-900 dark:text-white font-medium">Resume Dump</span>, and adds candidate to invite roster.
                </p>

                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 dark:text-gray-400 mb-1.5">
                    SELECT CANDIDATE RESUME FILE
                  </label>
                  <div className="flex items-center gap-3 bg-white dark:bg-[#16161b] border border-slate-200 dark:border-white/[0.1] rounded-xl p-2.5">
                    <input
                      type="file"
                      accept=".pdf,.docx,.doc,.txt"
                      onChange={(e) => setSingleFile(e.target.files?.[0] || null)}
                      className="text-xs text-slate-700 dark:text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-900 dark:file:bg-white file:text-white dark:file:text-black hover:file:bg-slate-800 dark:hover:file:bg-gray-200 cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 dark:text-gray-400 mb-1.5">
                    EXPERIENCE (YEARS) (OPTIONAL)
                  </label>
                  <input
                    type="text"
                    value={singleExperience}
                    onChange={(e) => setSingleExperience(e.target.value)}
                    placeholder="e.g. 3 or 5.5 (Leave blank for AI auto-extraction from resume)"
                    className="w-full bg-white dark:bg-[#16161b] border border-slate-200 dark:border-white/[0.1] rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-slate-400 dark:focus:border-white/40"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 dark:text-gray-400 mb-1.5">
                    OPTIONAL EXTRA TEXT / RECRUITER NOTES (ANALYZED WITH RESUME)
                  </label>
                  <textarea
                    rows={3}
                    value={singleNotes}
                    onChange={(e) => setSingleNotes(e.target.value)}
                    placeholder="Enter optional extra text (e.g. candidate phone/email, referral notes, cover letter, or additional info to analyze with resume)..."
                    className="w-full bg-white dark:bg-[#16161b] border border-slate-200 dark:border-white/[0.1] rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-slate-400 dark:focus:border-white/40"
                  />
                </div>

                <button
                  onClick={handleAnalyzeSingleResume}
                  disabled={isAnalyzingSingle || !singleFile}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-50 dark:bg-gradient-to-r dark:from-emerald-600/30 dark:to-emerald-500/20 border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/30 disabled:opacity-40 font-semibold text-xs transition-all"
                >
                  <Sparkles size={15} />
                  {isAnalyzingSingle ? 'Analyzing Resume & Saving to Dump...' : 'Analyze Resume with AI & Save to Resume Dump'}
                </button>
              </div>

              {/* Divider */}
              <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200 dark:border-white/[0.1]" />
                </div>
                <span className="relative bg-white dark:bg-[#0a0a0c] px-4 text-[10px] font-mono uppercase text-slate-500 dark:text-gray-500">
                  OR ADD MANUALLY
                </span>
              </div>

              {/* Manual Contact Entry Box */}
              <div className="space-y-3">
                <label className="block text-[10px] font-mono uppercase text-slate-500 dark:text-gray-400">
                  ADD CANDIDATE MANUALLY (EMAIL & WHATSAPP CONTACT)
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <input
                    type="email"
                    value={manualEmail}
                    onChange={(e) => setManualEmail(e.target.value)}
                    placeholder="Candidate email (e.g. candidate@example.com)"
                    className="flex-1 bg-slate-50 dark:bg-[#121215] border border-slate-200 dark:border-white/[0.1] rounded-xl px-3 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-slate-400 dark:focus:border-white/40"
                  />
                  <input
                    type="text"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                    placeholder="WhatsApp Phone (+91...)"
                    className="flex-1 bg-slate-50 dark:bg-[#121215] border border-slate-200 dark:border-white/[0.1] rounded-xl px-3 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-slate-400 dark:focus:border-white/40"
                  />
                  <button
                    onClick={handleAddManualCandidate}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black font-semibold text-xs hover:bg-slate-800 dark:hover:bg-gray-200 transition-all whitespace-nowrap"
                  >
                    Add Candidate
                  </button>
                </div>
              </div>

              {/* Access Code Box */}
              <div className="flex items-center justify-between bg-slate-50 dark:bg-[#121216] border border-slate-200 dark:border-white/[0.08] px-4 py-3 rounded-xl text-xs">
                <span className="text-slate-500 dark:text-gray-400">Access Code:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                  {job.accessCode || 'IXP' + job.id.slice(0, 6).toUpperCase()}
                </span>
              </div>
            </div>
          )}

          {/* TAB 2: Bulk Import */}
          {activeTab === 'bulk' && (
            <div className="space-y-5">
              <div className="bg-slate-50 dark:bg-[#101014] border border-slate-200 dark:border-white/[0.1] p-5 rounded-2xl space-y-4">
                <div className="flex items-center gap-2 text-slate-900 dark:text-white text-xs font-bold uppercase tracking-wider">
                  <FileSpreadsheet className="text-emerald-600 dark:text-emerald-400" size={16} />
                  <span>Bulk Import Candidate Files</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">
                  Upload Excel (<span className="text-slate-900 dark:text-white font-medium">.xlsx, .xls</span>), CSV (<span className="text-slate-900 dark:text-white font-medium">.csv</span>), or multiple PDF/DOCX/TXT resumes. Auto-extracts <span className="text-slate-900 dark:text-white font-medium">Name, Phone Number, and Email Address</span>.
                </p>

                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 dark:text-gray-400 mb-1.5">
                    SELECT FILE(S) (EXCEL / CSV / RESUMES)
                  </label>
                  <input
                    type="file"
                    multiple
                    accept=".xlsx,.xls,.csv,.pdf,.docx,.doc,.txt"
                    onChange={(e) => setBulkFiles(e.target.files)}
                    className="w-full bg-white dark:bg-[#16161b] border border-slate-200 dark:border-white/[0.1] rounded-xl p-2.5 text-xs text-slate-700 dark:text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-900 dark:file:bg-white file:text-white dark:file:text-black hover:file:bg-slate-800 dark:hover:file:bg-gray-200 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 dark:text-gray-400 mb-1.5">
                    OR PASTE EMAILS AND PHONE NUMBERS (ONE PER LINE OR COMMA SEPARATED)
                  </label>
                  <textarea
                    rows={4}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder="candidate1@example.com, +919876543210&#10;candidate2@example.com, +919123456789"
                    className="w-full bg-white dark:bg-[#16161b] border border-slate-200 dark:border-white/[0.1] rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-slate-400 dark:focus:border-white/40 font-mono"
                  />
                </div>

                <button
                  onClick={handleProcessBulk}
                  disabled={isProcessingBulk || (!bulkFiles && !bulkText.trim())}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black font-semibold text-xs hover:bg-slate-800 dark:hover:bg-gray-200 disabled:opacity-40 transition-all shadow-md"
                >
                  <Upload size={15} />
                  {isProcessingBulk ? 'Extracting Candidate Contacts...' : 'Process & Extract Candidates'}
                </button>
              </div>
            </div>
          )}

          {/* Candidate Roster Box: Candidates Pending Invitation (N) */}
          {candidateRoster.length > 0 && (
            <div className="space-y-3 bg-slate-50 dark:bg-[#121216] border border-slate-200 dark:border-white/[0.1] p-4 rounded-2xl animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Candidates Pending Invitation ({candidateRoster.length})
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/20">
                    Ready to Dispatch
                  </span>
                </div>
                <button
                  onClick={() => setCandidateRoster([])}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline"
                >
                  Clear All
                </button>
              </div>

              <div className="max-h-52 overflow-y-auto space-y-2 custom-scrollbar">
                {candidateRoster.map((c, i) => (
                  <div key={i} className="flex items-center justify-between bg-white dark:bg-[#18181f] border border-slate-200 dark:border-white/[0.06] p-2.5 rounded-xl text-xs">
                    <div className="space-y-0.5 max-w-[75%]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white truncate">{c.name || 'Candidate'}</span>
                        {c.source && (
                          <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-gray-400">
                            {c.source}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500 dark:text-gray-400">
                        {c.email && <span className="truncate">{c.email}</span>}
                        {c.phone && <span className="text-emerald-600 dark:text-emerald-400 font-mono">{c.phone}</span>}
                      </div>
                    </div>

                    <button
                      onClick={() => setCandidateRoster((prev) => prev.filter((_, idx) => idx !== i))}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                      title="Remove Candidate"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Bulk Dispatch Quick Actions Row */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                <button
                  onClick={() => handleSendInvitations('both')}
                  disabled={isSending}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black font-semibold text-xs hover:bg-slate-800 dark:hover:bg-gray-200 disabled:opacity-40 transition-all shadow-md"
                >
                  <Zap size={14} />
                  Send Email & WhatsApp Both
                </button>
                <button
                  onClick={() => handleSendInvitations('email')}
                  disabled={isSending}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-600/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 hover:bg-blue-100 dark:hover:bg-blue-600/30 text-xs font-semibold disabled:opacity-40 transition-all"
                >
                  <Mail size={14} />
                  Bulk Email Only
                </button>
                <button
                  onClick={() => handleSendInvitations('whatsapp')}
                  disabled={isSending}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/30 text-xs font-semibold disabled:opacity-40 transition-all"
                >
                  <MessageSquare size={14} />
                  Bulk WhatsApp Only (10s Delay)
                </button>
              </div>
            </div>
          )}

          {/* Always Visible Section: Already Invited Candidates */}
          {activeTab !== 'invited' && existingInvitedCandidates.length > 0 && (
            <div className="bg-slate-50 dark:bg-[#0f0f13] border border-slate-200 dark:border-white/[0.08] p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800 dark:text-gray-300 flex items-center gap-1.5">
                  <Users size={14} className="text-emerald-600 dark:text-emerald-400" />
                  Already invited candidates for this job posting ({existingInvitedCandidates.length})
                </span>
                <button
                  onClick={() => setActiveTab('invited')}
                  className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                >
                  View All & Manage &rarr;
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto custom-scrollbar pt-1">
                {existingInvitedCandidates.slice(0, 6).map((c, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 bg-white dark:bg-[#141419] border border-slate-200 dark:border-white/[0.06] rounded-lg text-xs">
                    <div className="truncate pr-2">
                      <p className="font-medium text-slate-900 dark:text-white truncate">{c.name || c.email || c.phone || 'Candidate'}</p>
                      {c.email && <p className="text-[11px] text-slate-500 dark:text-gray-400 truncate">{c.email}</p>}
                      {c.phone && <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-1"><Phone size={10} /> {c.phone}</p>}
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 whitespace-nowrap">
                      Invited
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Invited Candidates List */}
          {activeTab === 'invited' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-gray-400">
                <span>Already invited candidates for this job posting</span>
                <span className="font-semibold text-slate-900 dark:text-white">{existingInvitedCandidates.length} Total</span>
              </div>

              {existingInvitedCandidates.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 dark:bg-[#101014] rounded-2xl border border-slate-200 dark:border-white/[0.08] space-y-2">
                  <Users className="w-10 h-10 text-slate-400 dark:text-gray-600 mx-auto" />
                  <p className="text-xs text-slate-500 dark:text-gray-400">No candidates have been invited yet.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
                  {existingInvitedCandidates.map((c, i) => {
                    const isEditingThis = editingInvitedEmail === c.email;

                    return (
                      <div key={i} className="bg-slate-50 dark:bg-[#121216] border border-slate-200 dark:border-white/[0.08] p-3.5 rounded-xl text-xs space-y-2">
                        {isEditingThis ? (
                          // Inline Edit Mode
                          <div className="space-y-2">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                placeholder="Candidate Name"
                                className="bg-white dark:bg-[#18181f] border border-slate-200 dark:border-white/[0.1] rounded-lg p-2 text-xs text-slate-900 dark:text-white"
                              />
                              <input
                                type="email"
                                value={editEmail}
                                onChange={(e) => setEditEmail(e.target.value)}
                                placeholder="Candidate Email"
                                className="bg-white dark:bg-[#18181f] border border-slate-200 dark:border-white/[0.1] rounded-lg p-2 text-xs text-slate-900 dark:text-white"
                              />
                              <input
                                type="text"
                                value={editPhone}
                                onChange={(e) => setEditPhone(e.target.value)}
                                placeholder="WhatsApp Phone (+91...)"
                                className="bg-white dark:bg-[#18181f] border border-slate-200 dark:border-white/[0.1] rounded-lg p-2 text-xs text-slate-900 dark:text-white"
                              />
                            </div>
                            <div className="flex items-center justify-end gap-2 pt-1">
                              <button
                                onClick={() => setEditingInvitedEmail(null)}
                                className="px-2.5 py-1 rounded-lg text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white text-xs"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleSaveEditInvited(c.email)}
                                disabled={isSavingEdit}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white dark:text-black font-semibold text-xs hover:bg-emerald-500 dark:hover:bg-emerald-400"
                              >
                                <Save size={13} />
                                {isSavingEdit ? 'Saving...' : 'Save'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          // Normal Display Mode with Edit, Mail Reminder, and WhatsApp Reminder Buttons
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-0.5">
                              <p className="font-semibold text-slate-900 dark:text-white text-sm">{c.name || 'Candidate'}</p>
                              <p className="text-slate-500 dark:text-gray-400">{c.email}</p>
                              {c.phone ? (
                                <p className="text-emerald-600 dark:text-emerald-400 font-mono text-[11px] flex items-center gap-1">
                                  <Phone size={11} /> {c.phone}
                                </p>
                              ) : (
                                <p className="text-slate-400 dark:text-gray-500 text-[10px]">No phone number added</p>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Edit Button */}
                              <button
                                onClick={() => handleStartEditInvited(c)}
                                className="p-2 rounded-xl bg-slate-200/60 dark:bg-white/[0.06] hover:bg-slate-300 dark:hover:bg-white/[0.12] text-slate-700 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                                title="Edit Candidate Contact Info"
                              >
                                <Edit3 size={14} />
                              </button>

                              {/* Email Reminder Button */}
                              <button
                                onClick={() => handleSendEmailReminder(c)}
                                disabled={sendingReminderEmail === c.email}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-600/20 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-600/30 text-xs font-semibold transition-all"
                                title="Send Email Reminder"
                              >
                                <Mail size={14} />
                                <span className="hidden md:inline">
                                  {sendingReminderEmail === c.email ? 'Sending...' : 'Mail Reminder'}
                                </span>
                              </button>

                              {/* WhatsApp Reminder Button */}
                              <button
                                onClick={() => handleSendWAReminder(c)}
                                disabled={sendingReminderWA === c.email}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/30 text-xs font-semibold transition-all"
                                title="Send WhatsApp Reminder"
                              >
                                <MessageSquare size={14} />
                                <span className="hidden md:inline">
                                  {sendingReminderWA === c.email ? 'Sending...' : 'WA Reminder'}
                                </span>
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

          {/* TAB 4: Suggest AI Candidates */}
          {activeTab === 'suggest' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  value={suggestSearch}
                  onChange={(e) => setSuggestSearch(e.target.value)}
                  placeholder="Search AI candidate talent pool by name, skills..."
                  className="w-full bg-slate-50 dark:bg-[#121215] border border-slate-200 dark:border-white/[0.1] rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none"
                />
              </div>

              {loadingResumeDump ? (
                <div className="text-center py-12 text-xs text-slate-500 dark:text-gray-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600 dark:text-emerald-400" />
                  Fetching Resume Dump & computing AI match scores...
                </div>
              ) : suggestedCandidates.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 dark:bg-[#101014] rounded-2xl border border-slate-200 dark:border-white/[0.08] space-y-2">
                  <Sparkles className="w-10 h-10 text-slate-400 dark:text-gray-600 mx-auto" />
                  <p className="text-xs text-slate-500 dark:text-gray-400">No matching candidates found in Resume Dump.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
                  {suggestedCandidates.map(({ candidate: c, score, matchedSkills }) => {
                    const isSelected = candidateRoster.some(
                      (item) => (c.email && item.email.toLowerCase() === c.email.toLowerCase()) || (c.phone && item.phone === c.phone)
                    );

                    return (
                      <div
                        key={c.id}
                        className={`flex items-start justify-between bg-slate-50 dark:bg-[#121216] border p-4 rounded-xl text-xs transition-all ${
                          isSelected ? 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-500/5' : 'border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/20'
                        }`}
                      >
                        <div className="space-y-1 max-w-[80%]">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white text-sm">{c.name || 'Candidate'}</span>
                            <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 font-mono text-[10px] font-bold border border-emerald-300 dark:border-emerald-500/20">
                              {score}% Match
                            </span>
                          </div>
                          <p className="text-slate-500 dark:text-gray-400 text-xs">{c.email} {c.phone ? `• ${c.phone}` : ''}</p>
                          {c.skills && c.skills.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {c.skills.slice(0, 4).map((s, idx) => (
                                <span key={idx} className="px-2 py-0.5 bg-slate-100 dark:bg-white/[0.04] text-[10px] text-slate-700 dark:text-gray-300 rounded border border-slate-200 dark:border-white/[0.06]">
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => handleToggleSuggestedCandidate(c)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            isSelected
                              ? 'bg-emerald-600 dark:bg-emerald-500 text-white dark:text-black'
                              : 'bg-slate-200 dark:bg-white/[0.08] text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-white/[0.14]'
                          }`}
                        >
                          {isSelected ? 'Selected' : 'Select'}
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
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-[#0c0c0e]">
          <span className="text-xs text-slate-500 dark:text-gray-400">
            {candidateRoster.length > 0 ? `${candidateRoster.length} candidate(s) pending invitation` : ''}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => handleSendInvitations('both')}
              disabled={isSending || candidateRoster.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black font-semibold text-xs hover:bg-slate-800 dark:hover:bg-gray-200 disabled:opacity-40 transition-all shadow-lg"
            >
              <Mail size={14} />
              {isSending ? 'Dispatching Invites...' : 'Send Invitations'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
