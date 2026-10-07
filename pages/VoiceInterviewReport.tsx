import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  Phone, Mail, MapPin, Briefcase, Calendar, Clock, Volume2, Download, 
  Share2, Copy, Check, ArrowLeft, Sparkles, Shield, AlertTriangle, 
  CheckCircle2, XCircle, FileText, ExternalLink, Printer, Search, 
  MessageSquare, Activity, User, Building, Award, Mic
} from 'lucide-react';
import { 
  getVoiceInterviewResponse, 
  getVoiceInterview 
} from '../services/voiceInterviewService';
import { resolveJobOrInterviewDocument } from '../services/jobResolutionService';
import { VoiceInterviewResponse, VoiceInterview, VoiceInterviewTurn } from '../types';
import DayNightToggle from '../components/DayNightToggle';
import { useMessageBox } from '../components/MessageBox';

export const VoiceInterviewReport: React.FC = () => {
  const { responseId } = useParams<{ responseId: string }>();
  const messageBox = useMessageBox();

  const [response, setResponse] = useState<VoiceInterviewResponse | null>(null);
  const [interview, setInterview] = useState<VoiceInterview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [transcriptSearch, setTranscriptSearch] = useState('');

  // Load report data
  useEffect(() => {
    if (!responseId) {
      setError('Report ID is missing.');
      setLoading(false);
      return;
    }

    const loadReport = async () => {
      try {
        setLoading(true);
        setError(null);

        const resp = await getVoiceInterviewResponse(responseId);
        if (!resp) {
          setError('Voice screening report not found or link has expired.');
          setLoading(false);
          return;
        }

        setResponse(resp);

        // Load interview / job details for company and role info
        if (resp.voiceInterviewId) {
          try {
            const vData = await getVoiceInterview(resp.voiceInterviewId);
            if (vData) {
              setInterview(vData);
            } else if (resp.jobId) {
              const jData = await resolveJobOrInterviewDocument(resp.jobId);
              if (jData && jData.data) {
                const jd = jData.data as any;
                setInterview({
                  id: resp.voiceInterviewId,
                  title: jd.title || jd.jobTitle || 'Screening Interview',
                  jobTitle: jd.title || jd.jobTitle || 'Role',
                  companyName: jd.company || jd.companyName || 'Hiring Team',
                  location: jd.location || '',
                  jobDescription: jd.description || '',
                  recruiterUID: jd.recruiterUID || '',
                  questions: [],
                  status: 'active',
                  createdAt: new Date()
                });
              }
            }
          } catch (loadErr) {
            console.warn('[Voice Report] Parent interview load warning:', loadErr);
          }
        }
      } catch (err: any) {
        console.error('[Voice Report] Load error:', err);
        setError('Failed to load voice screening report.');
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [responseId]);

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      messageBox.showSuccess('Shareable report link copied to clipboard!');
      setTimeout(() => setCopied(false), 2500);
    } catch (_) {
      messageBox.showError('Could not copy link to clipboard.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatDuration = (secs?: number) => {
    if (!secs) return '0:00';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return 'Recent';
    if (ts.toDate) return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    if (ts instanceof Date) return ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return 'Recent';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#070707] text-slate-900 dark:text-white flex flex-col items-center justify-center p-4">
        <div className="h-10 w-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="font-medium text-slate-600 dark:text-neutral-400">Loading Voice Screening Assessment Report...</p>
      </div>
    );
  }

  if (error || !response) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#070707] text-slate-900 dark:text-white flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md p-8 bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/[0.1] rounded-2xl shadow-xl text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
            <XCircle size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Report Not Found</h2>
          <p className="text-sm text-slate-600 dark:text-neutral-400">{error || 'This voice screening report does not exist or has expired.'}</p>
          <Link
            to="/recruiter/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black font-bold text-sm shadow hover:opacity-90 transition-opacity"
          >
            <ArrowLeft size={16} /> Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const { screeningReport, candidateInfo, dialogueHistory, callDurationSeconds, audioRecordingUrl, candidateResumeUrl, candidateResumeFileName } = response;
  const rec = screeningReport?.recommendation || 'Hold';

  const resumeLink = candidateInfo?.resumeUrl || candidateResumeUrl;
  const resumeName = candidateInfo?.resumeFileName || candidateResumeFileName || 'Candidate_Resume.pdf';

  // Filter dialogue history if searching
  const filteredDialogue = dialogueHistory?.filter(turn => {
    if (!transcriptSearch.trim()) return true;
    return turn.text.toLowerCase().includes(transcriptSearch.toLowerCase());
  }) || [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070707] text-slate-900 dark:text-white transition-colors duration-200">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-[#0b0b0b]/90 backdrop-blur-md border-b border-slate-200 dark:border-white/[0.1] px-4 sm:px-8 py-3.5 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to="/recruiter/jobs"
              className="p-2 rounded-xl text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
              title="Back"
            >
              <ArrowLeft size={18} />
            </Link>
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-tight text-slate-900 dark:text-white text-base sm:text-lg flex items-center gap-2">
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center"><Mic size={18} /></span>
                InterviewXpert
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30">
                Voice Screening Report
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <DayNightToggle />

            <button
              type="button"
              onClick={handlePrint}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-white/[0.08] text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              title="Print or Save PDF"
            >
              <Printer size={14} />
              <span>Print / PDF</span>
            </button>

            <button
              type="button"
              onClick={handleCopyShareLink}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
            >
              {copied ? <Check size={14} /> : <Share2 size={14} />}
              <span>{copied ? 'Link Copied!' : 'Share Report'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Candidate & Role Hero Header */}
        <section className="bg-white dark:bg-[#0f0f0f] border border-slate-200 dark:border-white/[0.1] rounded-2xl p-5 sm:p-7 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs font-mono font-bold tracking-wider text-slate-500 dark:text-neutral-400 uppercase">
                  Candidate Screening File
                </span>
                <span className={`text-xs px-3 py-1 rounded-full font-extrabold tracking-wide border shadow-xs ${
                  rec === 'Shortlist'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/40'
                    : rec === 'Reject'
                      ? 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400 border-red-300 dark:border-red-500/40'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400 border-amber-300 dark:border-amber-500/40'
                }`}>
                  {rec === 'Shortlist' ? '✓ Shortlist Candidate' : rec === 'Reject' ? '✕ Reject' : '⏸ On Hold'}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {candidateInfo?.name || 'Candidate'}
              </h1>

              <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs sm:text-sm text-slate-600 dark:text-neutral-400">
                <span className="flex items-center gap-1.5 font-medium">
                  <Mail size={14} className="text-slate-400" /> {candidateInfo?.email || 'N/A'}
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <Phone size={14} className="text-slate-400" /> {candidateInfo?.phone || 'N/A'}
                </span>
                {candidateInfo?.currentCity && (
                  <span className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                    <MapPin size={14} /> Based in: {candidateInfo.currentCity}
                  </span>
                )}
              </div>
            </div>

            {/* Target Role & Call Meta */}
            <div className="bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/[0.08] rounded-xl p-4 min-w-[240px] space-y-1.5">
              <div className="text-xs text-slate-500 dark:text-neutral-400 uppercase font-semibold flex items-center gap-1">
                <Briefcase size={13} className="text-slate-400" /> Position Evaluated
              </div>
              <div className="font-bold text-slate-900 dark:text-white text-base">
                {interview?.jobTitle || interview?.title || 'Job Screening'}
              </div>
              <div className="text-xs text-slate-600 dark:text-neutral-400">
                {interview?.companyName || 'Hiring Organization'}
                {interview?.location && ` • ${interview.location}`}
              </div>
              <div className="pt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-neutral-500 border-t border-slate-200 dark:border-white/[0.06] mt-2">
                <span>Duration: {formatDuration(callDurationSeconds)}</span>
                <span>{formatTimestamp(response.submittedAt)}</span>
              </div>
            </div>
          </div>

          {/* Attached Resume Banner */}
          {resumeLink && (
            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-white/[0.08]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-blue-50/80 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-500/25 rounded-xl p-3.5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-blue-600 text-white shadow-xs shrink-0">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white text-sm truncate max-w-md">
                      {resumeName}
                    </div>
                    <span className="text-xs text-slate-600 dark:text-neutral-400">
                      Candidate uploaded resume for voice screening
                    </span>
                  </div>
                </div>

                <a
                  href={resumeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-xs transition-colors"
                >
                  <Download size={14} />
                  <span>View / Download Resume ↗</span>
                </a>
              </div>
            </div>
          )}
        </section>

        {/* 4-KPI Metric Cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Overall Score */}
          <div className="bg-white dark:bg-[#0f0f0f] border border-slate-200 dark:border-white/[0.1] rounded-2xl p-4 sm:p-5 text-center shadow-xs">
            <span className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wider block">
              Overall Score
            </span>
            <div className="text-3xl font-black text-slate-900 dark:text-white mt-1">
              {screeningReport?.overallScore || 'N/A'}
              <span className="text-base font-normal text-slate-400 dark:text-neutral-500"> /10</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-neutral-400 mt-1">
              Communication: {screeningReport?.communicationRating || 'N/A'}/10
            </div>
          </div>

          {/* Relocation */}
          <div className="bg-white dark:bg-[#0f0f0f] border border-slate-200 dark:border-white/[0.1] rounded-2xl p-4 sm:p-5 text-center shadow-xs">
            <span className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wider block">
              Relocation
            </span>
            <div className={`text-base sm:text-lg font-bold mt-1.5 ${
              screeningReport?.relocationStatus === 'Already local' || screeningReport?.relocationStatus === 'Ready to relocate'
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-amber-700 dark:text-amber-400'
            }`}>
              {screeningReport?.relocationStatus || 'Negotiable'}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-neutral-400 mt-1 truncate">
              {interview?.location || 'Office Location'}
            </div>
          </div>

          {/* Notice Period */}
          <div className="bg-white dark:bg-[#0f0f0f] border border-slate-200 dark:border-white/[0.1] rounded-2xl p-4 sm:p-5 text-center shadow-xs">
            <span className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wider block">
              Notice Period
            </span>
            <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-1.5">
              {screeningReport?.noticePeriod || 'Standard'}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-neutral-400 mt-1">
              Availability to join
            </div>
          </div>

          {/* Salary CTC */}
          <div className="bg-white dark:bg-[#0f0f0f] border border-slate-200 dark:border-white/[0.1] rounded-2xl p-4 sm:p-5 text-center shadow-xs">
            <span className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wider block">
              Salary CTC
            </span>
            <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-neutral-200 mt-1.5 leading-snug">
              {screeningReport?.salaryExpectation || 'Flexible / Open'}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-neutral-400 mt-1">
              Candidate expectations
            </div>
          </div>
        </section>

        {/* Detailed AI Report Assessments */}
        <section className="space-y-4">
          {/* Executive Summary */}
          <div className="bg-white dark:bg-[#0f0f0f] border border-slate-200 dark:border-white/[0.1] rounded-2xl p-5 sm:p-6 shadow-xs space-y-2">
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Sparkles size={16} className="text-emerald-600 dark:text-emerald-400" />
              Recruiter Executive Summary
            </h3>
            <p className="text-sm text-slate-700 dark:text-neutral-300 leading-relaxed font-normal">
              "{screeningReport?.summary}"
            </p>
          </div>

          {/* Relocation & Location Assessment Card */}
          {screeningReport?.relocationDetails && (
            <div className="bg-white dark:bg-[#0f0f0f] border border-slate-200 dark:border-white/[0.1] rounded-2xl p-5 sm:p-6 shadow-xs space-y-2">
              <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <MapPin size={16} className="text-emerald-600 dark:text-emerald-400" />
                Relocation & Location Assessment
              </h3>
              <p className="text-sm text-slate-700 dark:text-neutral-300 leading-relaxed">
                {screeningReport.relocationDetails}
              </p>
            </div>
          )}

          {/* Technical Competency & JD Alignment Card */}
          {screeningReport?.skillsFeedback && (
            <div className="bg-white dark:bg-[#0f0f0f] border border-slate-200 dark:border-white/[0.1] rounded-2xl p-5 sm:p-6 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                  <Activity size={16} className="text-emerald-600 dark:text-emerald-400" />
                  Technical Competency & JD Alignment
                </h3>
                <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30">
                  Skill Score: {screeningReport?.skillsRating || 'N/A'}/10
                </span>
              </div>
              <p className="text-sm text-slate-700 dark:text-neutral-300 leading-relaxed">
                {screeningReport.skillsFeedback}
              </p>
            </div>
          )}

          {/* Strengths & Considerations Side-by-Side */}
          {((screeningReport?.strengths && screeningReport.strengths.length > 0) ||
            (screeningReport?.concerns && screeningReport.concerns.length > 0)) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Strengths */}
              {screeningReport?.strengths && screeningReport.strengths.length > 0 && (
                <div className="bg-white dark:bg-[#0f0f0f] border border-emerald-200 dark:border-emerald-500/25 rounded-2xl p-5 shadow-xs space-y-3">
                  <h4 className="font-bold text-emerald-800 dark:text-emerald-400 text-sm flex items-center gap-2">
                    <CheckCircle2 size={16} /> Key Candidate Strengths
                  </h4>
                  <ul className="space-y-2 text-xs sm:text-sm text-slate-700 dark:text-neutral-300">
                    {screeningReport.strengths.map((str, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">•</span>
                        <span>{str}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Concerns */}
              {screeningReport?.concerns && screeningReport.concerns.length > 0 && (
                <div className="bg-white dark:bg-[#0f0f0f] border border-amber-200 dark:border-amber-500/25 rounded-2xl p-5 shadow-xs space-y-3">
                  <h4 className="font-bold text-amber-800 dark:text-amber-400 text-sm flex items-center gap-2">
                    <Shield size={16} /> Considerations & Risk Factors
                  </h4>
                  <ul className="space-y-2 text-xs sm:text-sm text-slate-700 dark:text-neutral-300">
                    {screeningReport.concerns.map((con, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-amber-600 dark:text-amber-400 font-bold mt-0.5">•</span>
                        <span>{con}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Recommendation Justification */}
          {screeningReport?.recommendationReason && (
            <div className="bg-white dark:bg-[#0f0f0f] border border-slate-200 dark:border-white/[0.1] rounded-2xl p-4 sm:p-5 text-xs sm:text-sm text-slate-700 dark:text-neutral-300 leading-relaxed shadow-xs">
              <strong className="text-slate-900 dark:text-white">Recommendation Rationale: </strong>
              {screeningReport.recommendationReason}
            </div>
          )}
        </section>

        {/* Audio Recording Player (AWS S3) */}
        {audioRecordingUrl && (
          <section className="bg-white dark:bg-[#0f0f0f] border border-emerald-300 dark:border-emerald-500/30 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-xs">
                  <Volume2 size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">
                    Full Phone Call Audio Recording
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-neutral-400">
                    Dual-channel master recording (AI Screener + Candidate Voice) saved on AWS S3
                  </p>
                </div>
              </div>
              <a
                href={audioRecordingUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={`voice_interview_${response.id}.webm`}
                className="shrink-0 text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
              >
                Download Master Audio ↗
              </a>
            </div>

            <audio
              controls
              src={audioRecordingUrl}
              className="w-full h-11 rounded-xl accent-emerald-600 dark:accent-emerald-400 mt-2"
              preload="metadata"
            />
          </section>
        )}

        {/* Full Phone Call Transcript Section */}
        <section className="bg-white dark:bg-[#0f0f0f] border border-slate-200 dark:border-white/[0.1] rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-white/[0.08] pb-4">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg flex items-center gap-2">
                <MessageSquare size={18} className="text-emerald-600 dark:text-emerald-400" />
                Full Phone Call Transcript
              </h3>
              <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5">
                Complete verbatim turn-by-turn phone screening transcript
              </p>
            </div>

            {/* Transcript Search Bar */}
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search transcript..."
                value={transcriptSearch}
                onChange={(e) => setTranscriptSearch(e.target.value)}
                className="w-full pl-8.5 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/[0.12] bg-slate-50 dark:bg-[#141414] text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          {/* Transcript Dialogue List */}
          <div className="space-y-3.5 pt-1">
            {filteredDialogue.length > 0 ? (
              filteredDialogue.map((turn, i) => {
                const isAi = turn.speaker === 'ai';
                return (
                  <div
                    key={i}
                    className={`rounded-xl p-4 sm:p-4.5 transition-colors shadow-xs ${
                      isAi
                        ? 'bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/[0.08] border-l-4 border-l-blue-600 dark:border-l-blue-500'
                        : 'bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/30 border-l-4 border-l-emerald-600 dark:border-l-emerald-500'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {isAi ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300">
                            🤖 AI Recruiter Screener
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-300">
                            👤 Candidate ({candidateInfo?.name || 'Applicant'})
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-neutral-400">
                        {turn.timestamp}
                      </span>
                    </div>

                    {/* Speech Text: Deep crisp black text in day mode, clean light text in night mode */}
                    <p className={`text-xs sm:text-sm leading-relaxed ${
                      isAi
                        ? 'text-slate-800 dark:text-neutral-200'
                        : 'text-slate-950 dark:text-emerald-100 font-medium'
                    }`}>
                      {turn.text}
                    </p>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-xs text-slate-500 dark:text-neutral-500">
                {transcriptSearch ? 'No matches found in transcript.' : 'Transcript not available for this session.'}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-white/[0.08] py-6 text-center text-xs text-slate-500 dark:text-neutral-500 mt-12 bg-white dark:bg-[#090909]">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>InterviewXpert AI Voice Screener • Assessment Report ID: {response.id}</span>
          <span className="font-mono text-[11px]">Secure & Audio-Encrypted</span>
        </div>
      </footer>
    </div>
  );
};

export default VoiceInterviewReport;
