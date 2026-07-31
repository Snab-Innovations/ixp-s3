import React, { useEffect, useMemo, useState } from 'react';
import { arrayUnion, collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Link, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import * as pdfjsLib from 'pdfjs-dist';
import * as mammoth from 'mammoth';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { useMessageBox } from '../components/MessageBox';
import { sendInterviewInvitations } from '../services/brevoService';
import { sendWhatsAppMessage, sendBulkWhatsAppInvites, sendInterviewWhatsAppInvite } from '../services/waSenderService';
import { evaluateResumeMatch } from '../services/api';
import { extractPhoneFromText, formatExtractedPhone } from '../services/resumeService';
import { InterviewCandidatesSkeleton } from '../components/ui/interview-loading-skeleton';
import { Interview } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

type CandidateDraft = { email: string; phone: string; matchScore?: string };
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
  const { user } = useAuth();
  const messageBox = useMessageBox();
  const [interview, setInterview] = useState<Interview | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [newEmails, setNewEmails] = useState<string[]>([]);
  const [parsedCandidates, setParsedCandidates] = useState<CandidateDraft[]>([]);
  const [parsingResumes, setParsingResumes] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [editingCandidateEmail, setEditingCandidateEmail] = useState<string | null>(null);
  const [editedEmailValue, setEditedEmailValue] = useState('');
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

  useEffect(() => {
    if (!interviewId || !user) {
      setLoading(false);
      return;
    }

    const unsubscribeInterview = onSnapshot(
      doc(db, 'interviews', interviewId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setInterview(null);
          setLoading(false);
          return;
        }

        const data = { id: snapshot.id, ...snapshot.data() } as Interview;
        if ((data as any).recruiterUID !== user.uid) {
          setInterview(null);
          setLoading(false);
          return;
        }
        setInterview(data);
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
    return explicitEmails.filter((email) => !submissions.some((submission) => (submission.candidateInfo?.email || '').toLowerCase() === email));
  }, [interview, submissions]);

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!interview) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setParsingResumes(true);
    const candidatesFound: CandidateDraft[] = [];
    let filesProcessed = 0;
    let filesWithErrors = 0;

    await Promise.all(
      Array.from(files).map(async (file) => {
        let text = '';
        try {
          if (file.type === 'application/pdf') {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              text += textContent.items.map((item: any) => item.str).join(' ');
            }
          } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            text = result.value;
          } else if (file.type === 'text/plain') {
            text = await file.text();
          } else {
            return;
          }

          const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
          const extractedPhone = formatExtractedPhone(extractPhoneFromText(text));

          if (emailMatch) {
            const lowerEmail = emailMatch[1].toLowerCase();
            const alreadyInvited = (interview.candidateEmails || []).some((email) => email.toLowerCase() === lowerEmail);
            const alreadyQueued = newEmails.some((email) => email.toLowerCase() === lowerEmail);
            if (!alreadyInvited && !alreadyQueued && !candidatesFound.some((candidate) => candidate.email === lowerEmail)) {
              let matchScore = 'N/A';
              if (text.length > 50) {
                try {
                  matchScore = await evaluateResumeMatch(interview.title, interview.description, text);
                } catch (error) {
                  console.error('Match score error:', error);
                }
              }
              candidatesFound.push({ email: lowerEmail, phone: extractedPhone || 'N/A', matchScore });
            }
          }
          filesProcessed++;
        } catch (error) {
          console.error(`Error parsing ${file.name}:`, error);
          filesWithErrors++;
        }
      })
    );

    if (candidatesFound.length > 0) {
      setNewEmails((prev) => [...prev, ...candidatesFound.map((candidate) => candidate.email)]);
      setParsedCandidates((prev) => [...prev, ...candidatesFound]);
    }
    messageBox.showInfo(`Processed ${filesProcessed} file(s). Found ${candidatesFound.length} new candidate(s). ${filesWithErrors > 0 ? `Failed to parse ${filesWithErrors} file(s).` : ''}`);
    setParsingResumes(false);
    e.target.value = '';
  };

  const handleSendInvites = async () => {
    if (!interview || (newEmails.length === 0 && parsedCandidates.length === 0)) return;
    setSendingEmails(true);
    try {
      const validEmails = newEmails.map((email) => email.toLowerCase()).filter(Boolean);
      const candidatesWithPhones = parsedCandidates.filter((candidate) => candidate.phone && candidate.phone !== 'N/A');

      await updateDoc(doc(db, 'interviews', interview.id), {
        candidateEmails: validEmails.length > 0 ? arrayUnion(...validEmails) : arrayUnion(),
        candidateData: arrayUnion(...parsedCandidates),
      });

      let emailCount = 0;
      if (validEmails.length > 0) {
        const result = await sendInterviewInvitations(validEmails, interview.title, interview.interviewLink || '', interview.accessCode);
        if (result.success) {
          emailCount = result.totalEmails;
        }
      }

      let waCount = 0;
      if (candidatesWithPhones.length > 0) {
        const waResult = await sendBulkWhatsAppInvites(
          candidatesWithPhones,
          interview.title,
          interview.interviewLink || '',
          interview.accessCode
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
    }
  };

  const handleSendBulkReminders = async () => {
    if (!interview) return;
    if (pendingEmails.length === 0) {
      messageBox.showInfo('No pending candidates found. Everyone invited has already submitted.');
      return;
    }

    setReminding(true);
    try {
      let emailCount = 0;
      let waCount = 0;

      const result = await sendInterviewInvitations(pendingEmails, interview.title, interview.interviewLink || '', interview.accessCode, true);
      if (result.success) emailCount = result.totalEmails;

      const candData = (interview as any).candidateData || [];
      const pendingWithPhones = pendingEmails.map((email) => {
        const match = candData.find((c: any) => c.email && c.email.toLowerCase() === email.toLowerCase());
        return { email, phone: match?.phone, name: email.split('@')[0] };
      }).filter((c) => c.phone && c.phone !== 'N/A');

      if (pendingWithPhones.length > 0) {
        const waResult = await sendBulkWhatsAppInvites(
          pendingWithPhones,
          interview.title,
          interview.interviewLink || '',
          interview.accessCode,
          true
        );
        if (waResult.success) waCount = waResult.totalSent;
      }

      messageBox.showSuccess(`Reminders dispatched: ${emailCount > 0 ? `${emailCount} Email(s)` : ''}${emailCount > 0 && waCount > 0 ? ' & ' : ''}${waCount > 0 ? `${waCount} WhatsApp Mobile invite(s)` : ''}!`);
    } catch (error) {
      console.error('Bulk remind error:', error);
      messageBox.showError('Failed to send reminders.');
    } finally {
      setReminding(false);
    }
  };

  const handleResend = async (email: string) => {
    if (!interview) return;
    setResendingEmail(email);
    try {
      let emailSent = false;
      let waSent = false;

      if (email && email.includes('@')) {
        const result = await sendInterviewInvitations([email], interview.title, interview.interviewLink || '', interview.accessCode);
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
          accessCode: interview.accessCode
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

  const handleEditAndResend = async (oldEmail: string, updatedEmail: string) => {
    if (!interview || !updatedEmail || oldEmail === updatedEmail) {
      setEditingCandidateEmail(null);
      return;
    }

    setResendingEmail(oldEmail);
    try {
      const updatedEmails = (interview.candidateEmails || []).filter((email) => email.toLowerCase() !== oldEmail.toLowerCase());
      updatedEmails.push(updatedEmail.toLowerCase());
      await updateDoc(doc(db, 'interviews', interview.id), { candidateEmails: updatedEmails });

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
      return [...prev, { email: email || '', phone: formattedPhone, matchScore: 'N/A' }];
    });
    setNewEmail('');
    setManualPhone('');
  };

  if (loading) {
    return <InterviewCandidatesSkeleton />;
  }

  if (!interview || !interviewId) {
    return (
      <div className="-mx-4 -my-8 flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center bg-[#000] p-8 text-center text-white sm:-mx-6 lg:-mx-8">
        <h1 className="geist-section-title text-white">Interview not found</h1>
        <Link to="/recruiter/interviews" className="geist-caption mt-4 inline-flex h-8 items-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white">
          Back to interviews
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
    <div className="-mx-4 -my-8 min-h-[calc(100vh-3.5rem)] bg-[#000] text-white sm:-mx-6 lg:-mx-8">
      <section className="sticky top-14 z-20 border-b border-white/[0.11] bg-[#000]">
        <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-7 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Link
                to="/recruiter/interviews"
                className="geist-caption inline-flex h-8 items-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <i className="fas fa-arrow-left text-[11px]"></i>
                Back to interviews
              </Link>
              <span className="geist-label uppercase text-[#9ca3af]">Candidates</span>
            </div>
            <h1 className="geist-page-title mt-2 max-w-5xl truncate text-white">{interview.title}</h1>
            <p className="geist-small mt-1 text-[#8f8f8f]">Invite candidates, send reminders, and manage roster status.</p>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
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

      <section className="grid gap-3 border-b border-white/[0.11] px-4 py-3 sm:px-6 lg:px-7">
          <div className="grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)_auto]">
            <label className="flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-[6px] border border-dashed border-white/[0.18] bg-white/[0.03] px-3 text-[#d4d4d4] transition-colors hover:bg-white/[0.06]">
              {parsingResumes ? (
                <>
                  <ButtonBusySkeleton className="w-4 bg-white/[0.16]" />
                  <ButtonBusySkeleton className="w-24 bg-white/[0.16]" />
                </>
              ) : (
                <>
                  <i className="fas fa-cloud-upload-alt text-[12px]"></i>
                  <span className="geist-caption font-medium">Upload resumes</span>
                </>
              )}
              <input type="file" multiple accept=".pdf,.txt,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={handleResumeUpload} disabled={parsingResumes} />
            </label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px_auto]">
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Candidate email" className="geist-caption h-9 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-white/[0.28]" />
              <input type="tel" value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} placeholder="Phone" className="geist-caption h-9 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-white/[0.28]" />
              <button onClick={queueManualCandidate} className={actionButtonClass}>
                <i className="fas fa-plus text-[11px]"></i>
                Add
              </button>
            </div>
            <button onClick={handleSendInvites} disabled={sendingEmails || queuedCount === 0} className={primaryButtonClass}>
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
                        <p className="geist-caption truncate font-medium text-white">{candidate.email || candidate.phone}</p>
                        <p className="geist-small mt-0.5 truncate text-[#8f8f8f]">
                          {candidate.phone && candidate.phone !== 'N/A' ? `Phone: ${candidate.phone}` : 'Phone not added'}
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

      <section className="grid gap-3 border-b border-white/[0.11] px-4 py-3 sm:px-6 lg:grid-cols-[minmax(320px,1fr)_170px_auto] lg:items-center lg:px-7">
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
        <button type="button" onClick={handleSendBulkReminders} disabled={reminding} className={actionButtonClass}>
          {reminding ? (
            <ButtonBusySkeleton className="w-28 bg-white/[0.16]" />
          ) : (
            <>
              <i className="fas fa-bell text-[11px]"></i>
              Pending reminders
            </>
          )}
        </button>
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
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                          <input type="email" value={editedEmailValue} onChange={(e) => setEditedEmailValue(e.target.value)} className="geist-caption h-8 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 text-white outline-none focus:border-white/[0.28]" autoFocus />
                          <button onClick={() => handleEditAndResend(candidate.email, editedEmailValue)} disabled={resendingEmail !== null} className={primaryButtonClass}>
                            {isResending ? (
                              <ButtonBusySkeleton className="w-12 bg-black/[0.18]" />
                            ) : (
                              <>
                                <i className="fas fa-save text-[11px]"></i>
                                Save
                              </>
                            )}
                          </button>
                          <button onClick={() => setEditingCandidateEmail(null)} disabled={resendingEmail !== null} className={actionButtonClass}>Cancel</button>
                        </div>
                      ) : (
                        <>
                          <p className="geist-caption truncate font-semibold text-white">{candidate.email}</p>
                          <p className="geist-small mt-1 truncate text-[#8f8f8f]">
                            {candidateData?.phone && candidateData.phone !== 'N/A' ? `Phone: ${candidateData.phone}` : 'Phone not added'}
                          </p>
                        </>
                      )}
                    </div>

                    <div>
                      <p className="geist-label mb-1 uppercase text-[#6b7280] lg:hidden">Status</p>
                      <span className={`geist-caption inline-flex h-7 items-center gap-1.5 rounded-[6px] border px-2 font-medium ${candidate.hasSubmitted ? 'border-[#173d25] bg-[#071a10] text-[#7ee787]' : 'border-[#4b3a16] bg-[#181104] text-[#ffd166]'}`}>
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
                          onClick={() =>
                            setWhatsappModal({
                              isOpen: true,
                              email: candidate.email,
                              phone: candidateData?.phone && candidateData.phone !== 'N/A' ? candidateData.phone : '',
                              message: buildWhatsAppMessage(interview),
                              interview,
                            })
                          }
                          className="geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border border-[#173d25] bg-[#071a10] px-3 font-medium text-[#7ee787] transition-colors hover:bg-[#0b2415]"
                        >
                          <i className="fab fa-whatsapp text-[11px]"></i>
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
    </div>
  );
};

export default InterviewCandidates;
