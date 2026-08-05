import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, query, onSnapshot, orderBy, doc, getDoc, runTransaction, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { resolveJobOrInterviewDocument } from '../services/jobResolutionService';
import { InterviewSubmission } from '../types';
import { useAuth } from '../context/AuthContext';
import { useMessageBox } from '../components/MessageBox';
import { useTheme } from '../context/ThemeContext';
import { InterviewResponsesSkeleton } from '../components/ui/interview-loading-skeleton';

type CandidateDecisionStatus = 'Hold' | 'Shortlist' | 'Reject';

const getCandidateDecisionStatus = (status?: InterviewSubmission['status']): CandidateDecisionStatus => (
  status === 'Shortlist' || status === 'Reject' || status === 'Hold' ? status : 'Hold'
);

const InterviewResponses: React.FC = () => {
  const messageBox = useMessageBox();
  const { interviewId } = useParams<{ interviewId: string }>();
  const [submissions, setSubmissions] = useState<InterviewSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubmissions, setSelectedSubmissions] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [customScore, setCustomScore] = useState<number>(7);
  const [scoreOperator, setScoreOperator] = useState<'gte' | 'lte'>('gte');
  const [recruiterProfile, setRecruiterProfile] = useState<any>(null);

  const { user, userProfile } = useAuth();
  const { isDark } = useTheme();
  const [globalExpiry, setGlobalExpiry] = useState<any>(null);
  const [interviewTitle, setInterviewTitle] = useState('Interview Responses');

  useEffect(() => {
    if (!interviewId) return;
    resolveJobOrInterviewDocument(interviewId).then(resolved => {
      if (resolved && resolved.data) {
        setGlobalExpiry(resolved.data.clientAccessExpiresAt || null);
        setInterviewTitle(resolved.data.title || 'Interview Responses');
      }
    }).catch(err => console.error("Error loading interview details:", err));
  }, [interviewId]);

  const getExpirationDate = (field: any): Date | null => {
    if (!field) return null;
    if (field.toDate) return field.toDate();
    if (field instanceof Date) return field;
    return new Date(field);
  };

  const formatDatetimeLocal = (date: Date | null) => {
    if (!date) return '';
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  };

  const handleSetGlobalExpiry = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!interviewId) return;
    try {
      const dateVal = val ? new Date(val) : null;
      const interviewRef = doc(db, 'interviews', interviewId);
      
      // Update Interview Document
      await updateDoc(interviewRef, { clientAccessExpiresAt: dateVal });
      setGlobalExpiry(dateVal);
      
      // Batch update all currently loaded attempts/submissions in state
      if (submissions.length > 0) {
        const promises = submissions.map(sub => {
          const attemptRef = doc(db, 'interviews', interviewId, 'attempts', sub.id);
          return updateDoc(attemptRef, { clientAccessExpiresAt: dateVal });
        });
        await Promise.all(promises);
      }
      
      messageBox.showSuccess(dateVal ? `Global expiration set to ${dateVal.toLocaleString()} for all reports.` : "Global expiration removed.");
    } catch (err) {
      console.error("Error setting global expiration:", err);
      messageBox.showError("Failed to update global expiration.");
    }
  };

  const handleClearGlobalExpiry = async () => {
    if (!interviewId) return;
    try {
      const interviewRef = doc(db, 'interviews', interviewId);
      
      // Update Interview Document
      await updateDoc(interviewRef, { clientAccessExpiresAt: null });
      setGlobalExpiry(null);
      
      // Clear expiry on all currently loaded attempts
      if (submissions.length > 0) {
        const promises = submissions.map(sub => {
          const attemptRef = doc(db, 'interviews', interviewId, 'attempts', sub.id);
          return updateDoc(attemptRef, { clientAccessExpiresAt: null });
        });
        await Promise.all(promises);
      }
      
      messageBox.showSuccess("Global expiration removed from all reports.");
    } catch (err) {
      console.error("Error clearing global expiration:", err);
      messageBox.showError("Failed to clear global expiration.");
    }
  };

  useEffect(() => {
    if (user?.uid) {
      getDoc(doc(db, 'profiles', user.uid)).then(snap => {
        if (snap.exists()) setRecruiterProfile(snap.data());
      }).catch(console.error);
    }
  }, [user]);

  useEffect(() => {
    if (!interviewId) return;

    const submissionsQuery = query(
      collection(db, 'interviews', interviewId, 'attempts'),
      orderBy('submittedAt', 'desc')
    );

    const unsubscribe = onSnapshot(submissionsQuery, (querySnapshot) => {
      const submissionsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InterviewSubmission));
      setSubmissions(submissionsData);
      setLoading(false);
    }, (err) => {
        console.error("Error fetching submissions:", err);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [interviewId]);

  const getScoreValue = (score: unknown): number => {
    let value = 0;
    let denominator = 10;

    if (typeof score === 'number') {
      value = score;
      denominator = score > 10 ? 100 : 10;
    } else if (typeof score === 'string') {
      const [rawValue, rawDenominator] = score.split('/');
      const parsedValue = parseFloat(rawValue);
      const parsedDenominator = parseFloat(rawDenominator);

      value = isNaN(parsedValue) ? 0 : parsedValue;
      denominator = !isNaN(parsedDenominator) && parsedDenominator > 0
        ? parsedDenominator
        : value > 10
          ? 100
          : 10;
    }

    return denominator === 10 ? value : (value / denominator) * 10;
  };
  const getScoreDenom = (_score?: any): string => '10';

  const filteredAndSortedSubmissions = useMemo(() => {
    return submissions
      .filter(s => 
        s.candidateInfo?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.candidateInfo?.email?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => {
        const scoreA = getScoreValue(a.score);
        const scoreB = getScoreValue(b.score);
        return sortOrder === 'desc' ? scoreB - scoreA : scoreA - scoreB;
      });
  }, [submissions, searchTerm, sortOrder]);

  const handleSelectSubmission = (submissionId: string) => {
    setSelectedSubmissions(prev => 
        prev.includes(submissionId) 
            ? prev.filter(id => id !== submissionId)
            : [...prev, submissionId]
    );
  };

  const handleAutoSelect = (type: 'top10' | 'top20' | 'all' | 'none') => {
    const submittedCandidates = filteredAndSortedSubmissions.filter(s => s.submittedAt);
    switch (type) {
        case 'top10':
            setSelectedSubmissions(submittedCandidates.slice(0, 10).map(s => s.id));
            break;
        case 'top20':
            setSelectedSubmissions(submittedCandidates.slice(0, 20).map(s => s.id));
            break;
        case 'all':
            setSelectedSubmissions(submittedCandidates.map(s => s.id));
            break;
        case 'none':
            setSelectedSubmissions([]);
            break;
    }
  };

  const handleCustomScoreSelect = () => {
    const submittedCandidates = filteredAndSortedSubmissions.filter(s => s.submittedAt);
    if (scoreOperator === 'gte') {
        setSelectedSubmissions(submittedCandidates.filter(s => getScoreValue(s.score) >= customScore).map(s => s.id));
    } else {
        setSelectedSubmissions(submittedCandidates.filter(s => getScoreValue(s.score) <= customScore).map(s => s.id));
    }
  };

  const exportToCSV = () => {
    const submissionsToExport = filteredAndSortedSubmissions.filter(s => selectedSubmissions.includes(s.id));
    const jobNameForFile = submissionsToExport.length > 0 ? ((submissionsToExport[0] as any).jobTitle || "Job") : "Job";
    const safeJobNameFile = `${jobNameForFile}`.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 30);
    const headers = ["Job Name", "Candidate Name", "Contact", "Email", "Resume Link", "Overall Score", "Report Link"];
    
    const csvContent = [
      headers.join(","),
      ...submissionsToExport.map(sub => {
        const jobName = `"${((sub as any).jobTitle || "Unknown Role").replace(/"/g, '""')}"`;
        const name = `"${(sub.candidateInfo?.name || "Unknown").replace(/"/g, '""')}"`;
        const contact = `"${(sub.candidateInfo?.phone || "N/A").replace(/"/g, '""')}"`;
        const email = `"${(sub.candidateInfo?.email || "N/A").replace(/"/g, '""')}"`;
        const resumeURL = `"${(sub.candidateResumeURL || "N/A").replace(/"/g, '""')}"`;
        const score = `"${getScoreValue(sub.score).toFixed(0)}"`;
        const reportUrl = `"${window.location.origin}/#/report/${sub.interviewId}/${sub.id}"`;
        return [jobName, name, contact, email, resumeURL, score, reportUrl].join(",");
      })
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Responses_${safeJobNameFile}_${interviewId}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generateMailContent = () => {
    if (selectedSubmissions.length === 0) {
        return null;
    }

    const submissionsToExport = filteredAndSortedSubmissions.filter(s => selectedSubmissions.includes(s.id));
    if (submissionsToExport.length === 0) return null;

    const jobTitle = (submissionsToExport[0] as any).jobTitle || "the role";
    const jobTitleWithId = `${jobTitle} - ${interviewId}`;

    const subject = `Resumes for ${jobTitleWithId}`;

    let body = `Dear Sir / Mam,\n\n`;
    body += `Greetings of the day from DSource Training & Placement Services!\n\n`;
    body += `I am sharing resumes of the following candidates for the post of ${jobTitleWithId}:\n\n`;

    submissionsToExport.forEach((sub, index) => {
        const info = sub.candidateInfo as any;
        const currentSalary = info?.currentSalary || 'N/A';
        const expectedSalary = info?.expectedSalary || 'N/A';
        const reportUrl = `${window.location.origin}/#/report/${sub.interviewId}/${sub.id}`;
        
        body += `--- Candidate ${index + 1} ---\n`;
        body += `Name: ${info?.name || 'N/A'}\n`;
        body += `Email: ${info?.email || 'N/A'}\n`;
        body += `Phone: ${info?.phone || 'N/A'}\n`;
        body += `Overall Score: ${getScoreValue(sub.score).toFixed(1)}/10\n`;
        body += `Interview Availability: N/A\n`; // Placeholder as per example
        body += `Working Status: ${info?.workStatus === 'working' ? 'Working' : 'Not Working'}\n`;
        body += `Work Experience: ${info?.totalExperienceYears ? `${info.totalExperienceYears}y ${info.totalExperienceMonths || '0'}m` : 'N/A'}\n`;
        body += `Current Salary: ${currentSalary}\n`;
        body += `Expected Salary: ${expectedSalary}\n`;
        body += `Notice Period: N/A\n`; // Placeholder as per example
        body += `Resume Link: ${sub.candidateResumeURL || 'N/A'}\n`;
        body += `Report Link: ${reportUrl}\n`;
        body += `\n`; // Separator between candidates
    });

    body += `The candidates are made aware about the job profile, location & timing through the following link.\n`;
    
    const jobLink = `${window.location.origin}/#/interview/${interviewId}`;
    body += `The Job details shared with the candidates are on the following link:\n`;
    body += `Link: ${jobLink}\n\n`;

    // Recruiter details from AuthContext and Profile
    const recruiterName = recruiterProfile?.displayName || (userProfile as any)?.fullname || userProfile?.name || 'Team DSource';
    const recruiterPhone = recruiterProfile?.phoneNumber || (userProfile as any)?.phone || 'N/A';
    body += `Recruiter Name: ${recruiterName}\n`;
    body += `Contact Number: ${recruiterPhone}\n`;
    body += `Email id: ${user?.email || 'N/A'}\n\n`;

    body += `Do let us know the interview schedule for the shortlisted candidates.\n\n`;
    body += `Thanks & Regards.`;

    return { subject, body };
  };

  const handleComposeMail = () => {
    const content = generateMailContent();
    if (!content) return;
    
    const { subject, body } = content;
    const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      window.location.href = mailtoLink;
    } catch (e) {
      console.error("Failed to open mail client", e);
    }
  };

  const handleCopyMailContent = async () => {
    const content = generateMailContent();
    if (!content) return;
    
    const { subject, body } = content;
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      alert("Mail content copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy text: ", err);
      alert("Failed to copy mail content. Please try again.");
    }
  };

  const handleStatusChange = async (submissionId: string, newStatus: CandidateDecisionStatus) => {
    if (!interviewId) return;
    try {
      const submissionRef = doc(db, 'interviews', interviewId, 'attempts', submissionId);
      await runTransaction(db, async (transaction) => {
        const submissionSnapshot = await transaction.get(submissionRef);
        if (!submissionSnapshot.exists()) throw new Error('Candidate response no longer exists.');

        if (submissionSnapshot.data().status === 'Shortlist' && newStatus !== 'Shortlist') {
          throw new Error('A shortlisted candidate is permanent and cannot be changed.');
        }

        transaction.update(submissionRef, { status: newStatus });
      });

      messageBox.showSuccess(
        newStatus === 'Shortlist'
          ? 'Candidate shortlisted permanently and removed from future interview suggestions.'
          : `Candidate status updated to ${newStatus === 'Reject' ? 'Rejected' : 'Hold'}.`
      );
    } catch (err) {
      console.error("Error updating status:", err);
      const message = err instanceof Error ? err.message : '';
      messageBox.showError(
        message.includes('permanent')
          ? message
          : 'Failed to update candidate status.'
      );
    }
  };

  const handleShareClientLink = async () => {
    const link = `${window.location.origin}/#/client-view/${interviewId}`;
    try {
      await navigator.clipboard.writeText(link);
      messageBox.showSuccess("Client sharing link copied to clipboard!");
    } catch (err) {
      messageBox.showError("Failed to copy link.");
    }
  };

  const parseFeedback = (feedback: unknown) => {
    if (typeof feedback !== 'string') return { resumeAnalysis: 'N/A', answerQuality: 'N/A', overallEvaluation: 'N/A' };
    const resumeMatch = feedback.match(/\*\*Resume Analysis:\*\*([\s\S]*?)(?=\*\*Answer Quality:\*\*|$)/);
    const qualityMatch = feedback.match(/\*\*Answer Quality:\*\*([\s\S]*?)(?=\*\*Overall Evaluation:\*\*|$)/);
    const evalMatch = feedback.match(/\*\*Overall Evaluation:\*\*([\s\S]*)/);
    return {
        resumeAnalysis: resumeMatch ? resumeMatch[1].trim() : 'N/A',
        answerQuality: qualityMatch ? qualityMatch[1].trim() : 'N/A',
        overallEvaluation: evalMatch ? evalMatch[1].trim() : 'N/A'
    };
  };

  if (loading) return <InterviewResponsesSkeleton />;

  const totalResponses = submissions.length;
  const visibleResponses = filteredAndSortedSubmissions.length;
  const selectedCount = selectedSubmissions.length;
  const averageScore = totalResponses
    ? submissions.reduce((sum, submission) => sum + getScoreValue(submission.score), 0) / totalResponses
    : 0;
  const shortlistedCount = submissions.filter(submission => getCandidateDecisionStatus(submission.status) === 'Shortlist').length;
  const holdCount = submissions.filter(submission => getCandidateDecisionStatus(submission.status) === 'Hold').length;
  const rejectedCount = submissions.filter(submission => getCandidateDecisionStatus(submission.status) === 'Reject').length;
  const activeExpiry = getExpirationDate(globalExpiry);
  const actionButtonClass = "geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40";
  const primaryButtonClass = "geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border border-white bg-white px-3 font-medium text-black transition-colors hover:bg-[#eaeaea] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] bg-[#000] text-white">

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
              <span className="geist-label uppercase text-[#9ca3af]">Responses</span>
            </div>
            <h1 className="geist-page-title mt-2 max-w-5xl truncate text-white">{interviewTitle}</h1>
            <p className="geist-small mt-1 text-[#8f8f8f]">Review, shortlist, export, and share submitted responses.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              disabled={selectedCount === 0}
              onClick={handleComposeMail}
              className={primaryButtonClass}
            >
              <i className="fas fa-envelope text-[11px]"></i>
              Compose
            </button>
            <button
              disabled={selectedCount === 0}
              onClick={handleCopyMailContent}
              className={actionButtonClass}
            >
              <i className="fas fa-copy text-[11px]"></i>
              Copy mail
            </button>
            <button
              disabled={selectedCount === 0}
              onClick={exportToCSV}
              className={actionButtonClass}
            >
              <i className="fas fa-file-excel text-[11px]"></i>
              Export CSV{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </button>
            <button
              onClick={handleShareClientLink}
              className={actionButtonClass}
            >
              <i className="fas fa-share-alt text-[11px]"></i>
              Client link
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 border-b border-white/[0.11] lg:grid-cols-6">
        {[
          ['Responses', totalResponses],
          ['Visible', visibleResponses],
          ['Selected', selectedCount],
          ['Average', totalResponses ? averageScore.toFixed(1) : '0.0'],
          ['Shortlisted', shortlistedCount],
          ['Hold / Reject', `${holdCount} / ${rejectedCount}`],
        ].map(([label, value]) => (
          <div key={label} className="border-r border-white/[0.11] px-4 py-4 last:border-r-0 sm:px-6 lg:px-7">
            <p className="geist-label uppercase text-[#6b7280]">{label}</p>
            <p className="geist-metric mt-2 tabular-nums text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-3 border-b border-white/[0.11] px-4 py-3 sm:px-6 lg:grid-cols-[minmax(320px,1fr)_190px_minmax(360px,auto)] lg:items-center lg:px-7">
        <label className="relative min-w-0">
          <span className="sr-only">Search responses</span>
          <i className="fas fa-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-[#6b7280]"></i>
          <input
            type="text"
            placeholder="Search by name or email"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="geist-caption h-9 w-full rounded-[6px] border border-white/[0.11] bg-white/[0.03] pl-9 pr-3 text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-white/[0.28] focus:bg-white/[0.05]"
          />
        </label>

        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
          className="geist-caption h-9 w-full rounded-[6px] border border-white/[0.11] bg-[#050505] px-3 text-[#d4d4d4] outline-none transition-colors focus:border-white/[0.28]"
        >
          <option value="desc">Score: high to low</option>
          <option value="asc">Score: low to high</option>
        </select>

        <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-end">
          <p className="geist-small truncate text-[#8f8f8f]">
            {activeExpiry ? `Expires ${activeExpiry.toLocaleString()}` : 'Client access has no expiry'}
          </p>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div
              onClick={(e) => {
                const input = e.currentTarget.querySelector('input');
                if (input) {
                  try { input.showPicker(); } catch (err) {}
                }
              }}
              className="inline-flex h-9 items-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 transition-colors focus-within:border-white/[0.28] hover:bg-white/[0.05]"
            >
              <input
                type="datetime-local"
                value={formatDatetimeLocal(activeExpiry)}
                onChange={handleSetGlobalExpiry}
                className="geist-label min-w-[170px] cursor-pointer border-none bg-transparent p-0 text-[#d4d4d4] outline-none focus:ring-0"
                style={{ colorScheme: isDark ? 'dark' : 'light' }}
              />
            </div>
            {globalExpiry && (
              <button
                onClick={handleClearGlobalExpiry}
                className="geist-caption inline-flex h-9 items-center rounded-[6px] border border-[#3f1d1d] bg-[#180707] px-3 font-medium text-[#ff8f8f] transition-colors hover:bg-[#260b0b]"
                title="Remove global expiration limit"
              >
                Clear expiry
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-2 border-b border-white/[0.11] px-4 py-3 sm:px-6 lg:px-7">
        <span className="geist-label mr-1 uppercase text-[#6b7280]">Auto-select</span>
        <button onClick={() => handleAutoSelect('top10')} className={actionButtonClass}>Top 10</button>
        <button onClick={() => handleAutoSelect('top20')} className={actionButtonClass}>Top 20</button>

        <div className="inline-flex h-8 items-center overflow-hidden rounded-[6px] border border-white/[0.11] bg-white/[0.03]">
          <select
            value={scoreOperator}
            onChange={e => setScoreOperator(e.target.value as 'gte' | 'lte')}
            className="geist-caption h-full border-none bg-[#050505] px-2 text-[#d4d4d4] outline-none focus:ring-0"
          >
            <option value="gte">Score &gt;=</option>
            <option value="lte">Score &lt;=</option>
          </select>
          <input
            type="number"
            value={customScore}
            onChange={e => setCustomScore(Number(e.target.value))}
            className="geist-label h-full w-14 border-x border-white/[0.11] bg-transparent px-2 text-center text-white outline-none focus:ring-0"
            min="0"
            max="10"
            step="0.5"
          />
          <button onClick={handleCustomScoreSelect} className="geist-caption h-full px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white">
            Select
          </button>
        </div>

        <div className="grow"></div>
        <button onClick={() => handleAutoSelect('all')} className={actionButtonClass}>Select all</button>
        <button onClick={() => handleAutoSelect('none')} className="geist-caption inline-flex h-8 items-center justify-center rounded-[6px] border border-[#3f1d1d] bg-[#180707] px-3 font-medium text-[#ff8f8f] transition-colors hover:bg-[#260b0b]">Clear</button>
      </section>

      {filteredAndSortedSubmissions.length === 0 ? (
        <section className="border-b border-dashed border-white/[0.11] px-4 py-16 text-center sm:px-6 lg:px-7">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] text-[#8f8f8f]">
            <i className="fas fa-inbox"></i>
          </div>
          <p className="geist-caption mt-4 text-[#d4d4d4]">{searchTerm ? 'No matching responses found.' : 'No responses have been submitted for this interview yet.'}</p>
        </section>
      ) : (
        <section>
          <div className="hidden grid-cols-[32px_minmax(0,1fr)_92px_132px_auto] items-center gap-4 border-b border-white/[0.11] px-4 py-2 sm:px-6 lg:grid lg:px-7">
            <span className="geist-label uppercase text-[#6b7280]">Pick</span>
            <span className="geist-label uppercase text-[#6b7280]">Candidate</span>
            <span className="geist-label uppercase text-[#6b7280]">Score</span>
            <span className="geist-label uppercase text-[#6b7280]">Status</span>
            <span className="geist-label text-right uppercase text-[#6b7280]">Actions</span>
          </div>

          {filteredAndSortedSubmissions.map(submission => {
            const isSelected = selectedSubmissions.includes(submission.id);
            const status = getCandidateDecisionStatus(submission.status);
            const isPermanentlyShortlisted = status === 'Shortlist';
            const feedback = parseFeedback(submission.feedback);
            const feedbackPreview = feedback.overallEvaluation !== 'N/A'
              ? feedback.overallEvaluation
              : submission.feedback || 'No feedback summary available.';

            return (
              <article
                key={submission.id}
                className={`grid gap-3 border-b border-white/[0.08] px-4 py-3 transition-colors hover:bg-white/[0.025] sm:px-6 lg:grid-cols-[32px_minmax(0,1fr)_92px_132px_auto] lg:items-center lg:gap-4 lg:px-7 ${isSelected ? 'bg-white/[0.04]' : ''}`}
              >
                <div className="flex items-center justify-between lg:block">
                  <span className="geist-label uppercase text-[#6b7280] lg:hidden">Select</span>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleSelectSubmission(submission.id)}
                    className="h-4 w-4 rounded-[4px] border-white/[0.18] bg-transparent text-white focus:ring-white/30"
                  />
                </div>

                <div className="min-w-0">
                  <h3 className="geist-caption truncate font-semibold text-white">
                    {submission.candidateInfo?.name || 'Unknown Candidate'}
                  </h3>
                  <div className="geist-small mt-1 grid gap-x-3 gap-y-1 text-[#8f8f8f] sm:grid-cols-[minmax(180px,auto)_auto_minmax(160px,1fr)] sm:items-center">
                    {submission.candidateInfo?.email && <span className="min-w-0 truncate">{submission.candidateInfo.email}</span>}
                    {submission.candidateInfo?.phone && <span className="whitespace-nowrap">{submission.candidateInfo.phone}</span>}
                    <span className="min-w-0 truncate">
                      {submission.submittedAt?.toDate ? submission.submittedAt.toDate().toLocaleString('en-GB') : 'Submitted date N/A'}
                    </span>
                  </div>
                  <p className="geist-small mt-1 truncate text-[#6b7280]">{feedbackPreview}</p>
                </div>

                <div>
                  <p className="geist-label mb-1 uppercase text-[#6b7280] lg:hidden">Score</p>
                  <p className="geist-metric tabular-nums text-white">
                    {getScoreValue(submission.score).toFixed(1)}
                    <span className="text-sm text-[#6b7280]">/{getScoreDenom(submission.score)}</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:block lg:min-w-0">
                  <p className="geist-label uppercase text-[#6b7280] lg:hidden">Status</p>
                  <select
                    value={status}
                    disabled={isPermanentlyShortlisted}
                    title={isPermanentlyShortlisted ? 'Shortlisted candidates are permanent' : 'Update candidate status'}
                    onChange={(e) => {
                      const newStatus = e.target.value as CandidateDecisionStatus;
                      if (newStatus === 'Shortlist') {
                        e.currentTarget.value = status;
                        messageBox.showConfirm(
                          'Shortlisting is permanent. This candidate will be excluded from future interview suggestions and the status cannot be changed later.',
                          () => { void handleStatusChange(submission.id, newStatus); },
                          'Permanently shortlist candidate?'
                        );
                        return;
                      }
                      void handleStatusChange(submission.id, newStatus);
                    }}
                    className={`geist-caption h-8 w-full rounded-[6px] border bg-[#050505] px-3 font-medium outline-none transition-colors focus:border-white/[0.28] disabled:cursor-not-allowed disabled:opacity-80 ${
                      status === 'Shortlist'
                        ? 'border-[#173d25] text-[#7ee787]'
                        : status === 'Reject'
                          ? 'border-[#4d1d1d] text-[#ff8f8f]'
                          : 'border-[#4b3a16] text-[#ffd166]'
                    }`}
                  >
                    <option value="Hold">Hold</option>
                    <option value="Shortlist">Shortlisted</option>
                    <option value="Reject">Rejected</option>
                  </select>
                  {isPermanentlyShortlisted && (
                    <p className="geist-small mt-1 flex items-center gap-1 text-[#7ee787]">
                      <i className="fas fa-lock text-[9px]" aria-hidden="true"></i>
                      Permanent
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end lg:whitespace-nowrap">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const nextVal = !(submission as any).allowReattempt;
                        const submissionRef = doc(db, 'interviews', interviewId!, 'attempts', submission.id);
                        await updateDoc(submissionRef, { allowReattempt: nextVal });
                        messageBox.showSuccess(nextVal ? "Reattempt permission granted!" : "Reattempt permission removed.");
                      } catch (err) {
                        console.error("Error updating reattempt status:", err);
                        messageBox.showError("Failed to update reattempt status.");
                      }
                    }}
                    className={`geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border px-3 font-medium transition-colors ${
                      (submission as any).allowReattempt
                        ? 'border-[#32245a] bg-[#120b29] text-[#c4b5fd] hover:bg-[#1b103d]'
                        : 'border-white/[0.11] bg-white/[0.03] text-[#d4d4d4] hover:bg-white/[0.06] hover:text-white'
                    }`}
                    title={(submission as any).allowReattempt ? "Remove Reattempt Chance" : "Give Reattempt Chance"}
                  >
                    <i className="fas fa-redo text-[10px]"></i>
                    {(submission as any).allowReattempt ? 'Reattempt on' : 'Allow reattempt'}
                  </button>
                  <Link
                    to={`/report/${interviewId}/${submission.id}`}
                    className="geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    Report
                    <i className="fas fa-arrow-right text-[10px]"></i>
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      )}

    </div>
  );
};

export default InterviewResponses;
