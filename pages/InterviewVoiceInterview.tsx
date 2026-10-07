import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { Link, useParams } from 'react-router-dom';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { useMessageBox } from '../components/MessageBox';
import { subscribeToJobOrInterview } from '../services/jobResolutionService';
import { 
  getVoiceInterview, 
  saveVoiceInterview, 
  generateScreeningQuestionsFromJd, 
  subscribeVoiceInterviewResponses,
  DEFAULT_SCREENING_QUESTIONS 
} from '../services/voiceInterviewService';
import { Interview, VoiceInterview, VoiceInterviewQuestion, VoiceInterviewResponse } from '../types';
import { InterviewOverviewSkeleton } from '../components/ui/interview-loading-skeleton';
import { 
  Phone, Copy, ExternalLink, Sparkles, Plus, Trash2, Edit2, CheckCircle2, 
  Clock, MapPin, User, MessageSquare, ChevronRight, X, Shield, Activity, FileText, Volume2,
  Share2, Download
} from 'lucide-react';

export const InterviewVoiceInterview: React.FC = () => {
  const { interviewId } = useParams<{ interviewId: string }>();
  const { user, userProfile } = useAuth();
  const messageBox = useMessageBox();

  const [interview, setInterview] = useState<Interview | null>(null);
  const [voiceConfig, setVoiceConfig] = useState<VoiceInterview | null>(null);
  const [responses, setResponses] = useState<VoiceInterviewResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'responses' | 'questions'>('responses');

  // Question editing state
  const [questions, setQuestions] = useState<VoiceInterviewQuestion[]>(DEFAULT_SCREENING_QUESTIONS);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionCategory, setNewQuestionCategory] = useState<VoiceInterviewQuestion['category']>('skills');

  // Detailed Report Modal state
  const [selectedResponse, setSelectedResponse] = useState<VoiceInterviewResponse | null>(null);

  // Candidate Link
  const candidateLink = `${window.location.origin}/#/voice-interview/${interviewId}`;

  // Load Job / Interview details
  useEffect(() => {
    if (!interviewId || !user) {
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToJobOrInterview(
      interviewId,
      async (data) => {
        if (!data) {
          setInterview(null);
          setLoading(false);
          return;
        }

        const isOwner = data.recruiterUID === user.uid || (userProfile && (userProfile.teamId === data.teamId || userProfile.role === 'admin'));
        if (!isOwner) {
          setInterview(null);
          setLoading(false);
          return;
        }

        setInterview(data as Interview);

        // Fetch or initialize voice interview configuration
        try {
          const existingVoice = await getVoiceInterview(interviewId);
          if (existingVoice && existingVoice.questions && existingVoice.questions.length > 0) {
            setVoiceConfig(existingVoice);
            setQuestions(existingVoice.questions);
          } else {
            // Default setup from job
            const initialQuestions = (data.questions && data.questions.length > 0)
              ? data.questions.map((q: any, idx: number) => ({
                  id: `q_${idx}`,
                  question: typeof q === 'string' ? q : (q.text || q.question || 'Describe your experience.'),
                  category: 'skills' as const
                }))
              : DEFAULT_SCREENING_QUESTIONS;

            const initialVoice: VoiceInterview = {
              id: interviewId,
              jobId: interviewId,
              interviewId: interviewId,
              title: data.title || 'Phone Screening',
              jobTitle: data.title || 'Role',
              jobDescription: data.description || '',
              companyName: data.company || 'Hiring Team',
              location: data.location || '',
              recruiterUID: user.uid,
              teamId: userProfile?.teamId || user.uid,
              questions: initialQuestions,
              status: 'active',
              createdAt: new Date()
            };

            await saveVoiceInterview(initialVoice);
            setVoiceConfig(initialVoice);
            setQuestions(initialQuestions);
          }
        } catch (err) {
          console.warn('[Voice Interview] Config init error:', err);
        }

        setLoading(false);
      },
      (error) => {
        console.error('Error loading interview voice page:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [interviewId, user]);

  // Subscribe to voice responses for this interview
  useEffect(() => {
    if (!interviewId) return;

    const unsub = subscribeVoiceInterviewResponses(interviewId, (data) => {
      setResponses(data);
    });

    return () => unsub?.();
  }, [interviewId]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(candidateLink);
    messageBox.showSuccess('Candidate Voice Interview Link copied to clipboard!');
  };

  const handleGenerateAiQuestions = async () => {
    if (!interview) return;
    setGeneratingQuestions(true);
    try {
      const generated = await generateScreeningQuestionsFromJd(
        interview.title || 'Job Role',
        interview.description || '',
        interview.location || ''
      );

      setQuestions(generated);

      if (voiceConfig) {
        const updated = { ...voiceConfig, questions: generated };
        await saveVoiceInterview(updated);
        setVoiceConfig(updated);
      }

      messageBox.showSuccess('Screening questions generated based on your Job Description!');
    } catch (err: any) {
      console.error('Error generating questions:', err);
      messageBox.showError('Failed to generate questions.');
    } finally {
      setGeneratingQuestions(false);
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim()) return;

    const newQ: VoiceInterviewQuestion = {
      id: `custom_${Date.now()}`,
      question: newQuestionText.trim(),
      category: newQuestionCategory,
      isCustom: true
    };

    const nextList = [...questions, newQ];
    setQuestions(nextList);

    if (voiceConfig) {
      const updated = { ...voiceConfig, questions: nextList };
      await saveVoiceInterview(updated);
      setVoiceConfig(updated);
    }

    setNewQuestionText('');
    setShowAddModal(false);
    messageBox.showSuccess('New screening question added.');
  };

  const handleDeleteQuestion = async (qId: string) => {
    const nextList = questions.filter(q => q.id !== qId);
    if (nextList.length === 0) {
      messageBox.showError('You must have at least one screening question.');
      return;
    }
    setQuestions(nextList);

    if (voiceConfig) {
      const updated = { ...voiceConfig, questions: nextList };
      await saveVoiceInterview(updated);
      setVoiceConfig(updated);
    }
    messageBox.showSuccess('Question removed.');
  };

  if (loading) {
    return <InterviewOverviewSkeleton />;
  }

  if (!interview || !interviewId) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center text-white">
        <h1 className="text-2xl font-bold">Interview not found</h1>
        <Link to="/recruiter/all-jobs" className="mt-4 inline-flex text-sm font-bold text-emerald-400 hover:underline">
          Back to jobs
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] bg-[#000] text-white">
      {/* Top Header */}
      <section className="sticky top-14 z-20 border-b border-white/[0.11] bg-[#000]/95 backdrop-blur-md">
        <div className="px-4 py-5 sm:px-6 lg:px-7">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="mb-2.5 flex flex-wrap items-center gap-2">
                <Link
                  to="/recruiter/all-jobs"
                  className="geist-caption inline-flex h-8 items-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <i className="fas fa-arrow-left text-[11px]"></i>
                  <span>Back to jobs</span>
                </Link>
                <span className="geist-label uppercase text-emerald-400 font-bold flex items-center gap-1.5">
                  <Phone size={12} /> Voice Screening Call Hub
                </span>
              </div>
              <h1 className="geist-page-title mt-1.5 max-w-5xl truncate text-white">{interview.title}</h1>
              <p className="geist-caption text-[#8f8f8f] mt-1">
                Audio-only phone screening. AI evaluates relocation, notice period, salary, and core skills with voice repeat & skip intelligence.
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleCopyLink}
                className="geist-caption inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.05] hover:bg-white/[0.1] px-3.5 font-medium text-white transition-colors cursor-pointer"
              >
                <Copy size={14} className="text-emerald-400" />
                <span>Copy Candidate Link</span>
              </button>
              <a
                href={candidateLink}
                target="_blank"
                rel="noopener noreferrer"
                className="geist-caption inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold px-3.5 transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
              >
                <Phone size={14} />
                <span>Test Screening Call</span>
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Metrics Row */}
      <div className="border-b border-white/[0.11] bg-[#050505]">
        <div className="grid grid-cols-1 divide-y divide-white/[0.11] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="min-h-[76px] px-4 py-4 sm:px-6 lg:px-7">
            <p className="geist-label uppercase text-[#6b7280]">Screening Status</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="geist-metric tabular-nums text-white">Active (Receiving Calls)</span>
            </div>
          </div>

          <div className="min-h-[76px] px-4 py-4 sm:px-6 lg:px-7">
            <p className="geist-label uppercase text-[#6b7280]">Total Screening Calls</p>
            <div className="mt-1.5 flex items-baseline gap-2.5">
              <span className="geist-metric tabular-nums text-white">{responses.length}</span>
              <span className="geist-small text-[#6b7280]">Completed Calls</span>
            </div>
          </div>

          <div className="min-h-[76px] px-4 py-4 sm:px-6 lg:px-7">
            <p className="geist-label uppercase text-[#6b7280]">Shortlisted Candidates</p>
            <div className="mt-1.5 flex items-baseline gap-2.5">
              <span className="geist-metric tabular-nums text-emerald-400">
                {responses.filter(r => r.status === 'Shortlist' || r.screeningReport?.recommendation === 'Shortlist').length}
              </span>
              <span className="geist-small text-[#6b7280]">Recommended</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-white/[0.11] bg-[#080808] px-4 sm:px-6 lg:px-7">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('responses')}
            className={`geist-caption py-3 border-b-2 font-medium transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'responses'
                ? 'border-white text-white font-semibold'
                : 'border-transparent text-[#6b7280] hover:text-[#d4d4d4]'
            }`}
          >
            <User size={14} />
            <span>Screening Responses ({responses.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('questions')}
            className={`geist-caption py-3 border-b-2 font-medium transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'questions'
                ? 'border-white text-white font-semibold'
                : 'border-transparent text-[#6b7280] hover:text-[#d4d4d4]'
            }`}
          >
            <Sparkles size={14} />
            <span>Screening Questions ({questions.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: SCREENING RESPONSES */}
      {activeTab === 'responses' && (
        <div className="p-4 sm:p-6 lg:p-7 space-y-4">
          {responses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.015] p-12 text-center max-w-xl mx-auto space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.1] bg-white/[0.04] text-emerald-400">
                <Phone size={24} />
              </div>
              <h3 className="geist-heading text-lg font-bold text-white">No screening calls recorded yet</h3>
              <p className="geist-caption text-[#8f8f8f] leading-relaxed">
                Share your Candidate Voice Interview Link with applicants or job seekers. When candidates call in, their screening conversations and reports will appear here in real-time.
              </p>
              <button
                type="button"
                onClick={handleCopyLink}
                className="geist-caption inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white text-black font-extrabold hover:bg-white/90 transition-all cursor-pointer"
              >
                <Copy size={14} />
                <span>Copy Candidate Voice Link</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto border border-white/[0.11] rounded-xl bg-[#080808]">
              <table className="w-full divide-y divide-white/[0.11]">
                <thead className="bg-[#0c0c0c]">
                  <tr>
                    <th className="geist-label px-4 py-3 text-left uppercase text-[#6b7280]">Candidate</th>
                    <th className="geist-label px-4 py-3 text-left uppercase text-[#6b7280]">Score</th>
                    <th className="geist-label px-4 py-3 text-left uppercase text-[#6b7280]">Relocation</th>
                    <th className="geist-label px-4 py-3 text-left uppercase text-[#6b7280]">Notice Period</th>
                    <th className="geist-label px-4 py-3 text-left uppercase text-[#6b7280]">Recommendation</th>
                    <th className="geist-label px-4 py-3 text-right uppercase text-[#6b7280]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.08]">
                  {responses.map((resp) => {
                    const rec = resp.screeningReport?.recommendation || 'Hold';
                    return (
                      <tr key={resp.id} className="hover:bg-white/[0.025] transition-colors">
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="geist-caption font-bold text-white">
                              {resp.candidateInfo?.name || 'Candidate'}
                            </span>
                            {resp.audioRecordingUrl && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium" title="Full Audio Recording Available">
                                <Volume2 size={10} /> Call Audio
                              </span>
                            )}
                            {(resp.candidateInfo?.resumeUrl || resp.candidateResumeUrl) && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 font-medium" title="Resume Attached">
                                <FileText size={10} /> Resume
                              </span>
                            )}
                          </div>
                          <div className="geist-small text-[#6b7280] mt-0.5">
                            {resp.candidateInfo?.email} • {resp.candidateInfo?.phone}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="geist-caption font-extrabold text-white">
                            {resp.screeningReport?.overallScore || 'N/A'}/10
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="geist-small px-2 py-0.5 rounded bg-white/[0.06] text-[#d4d4d4]">
                            {resp.screeningReport?.relocationStatus || 'Not specified'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="geist-small text-[#9ca3af]">
                            {resp.screeningReport?.noticePeriod || 'N/A'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`geist-small px-2.5 py-0.5 rounded-full font-bold ${
                            rec === 'Shortlist'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : rec === 'Reject'
                                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          }`}>
                            {rec}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              to={`/voice-report/${resp.id}`}
                              target="_blank"
                              className="geist-small inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors font-medium text-xs cursor-pointer"
                              title="Open shareable report in new tab"
                            >
                              <ExternalLink size={12} />
                              <span>Open Report ↗</span>
                            </Link>
                            <button
                              type="button"
                              onClick={() => setSelectedResponse(resp)}
                              className="geist-small inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/[0.12] bg-white/[0.04] text-white hover:bg-white/[0.08] transition-colors font-medium text-xs cursor-pointer"
                            >
                              <FileText size={12} className="text-slate-300" />
                              <span>Quick View</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: QUESTIONS CONFIGURATION */}
      {activeTab === 'questions' && (
        <div className="p-4 sm:p-6 lg:p-7 max-w-4xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="geist-section-title text-white">Screening Questions</h2>
              <p className="geist-small text-[#8f8f8f] mt-0.5">
                Questions asked by the AI during the phone screening call.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleGenerateAiQuestions}
                disabled={generatingQuestions}
                className="geist-caption inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-white/[0.12] bg-white/[0.05] hover:bg-white/[0.1] text-white font-medium transition-colors disabled:opacity-50 cursor-pointer"
              >
                {generatingQuestions ? (
                  <>
                    <Activity size={14} className="animate-spin text-emerald-400" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} className="text-emerald-400" />
                    <span>Regenerate with AI</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="geist-caption inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white text-black font-extrabold hover:bg-white/90 transition-all cursor-pointer"
              >
                <Plus size={14} />
                <span>Add Question</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {questions.map((q, idx) => (
              <div 
                key={q.id || idx}
                className="rounded-xl border border-white/[0.1] bg-[#0c0c0c] p-4 flex items-start justify-between gap-3 hover:border-white/[0.2] transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-md bg-white/[0.08] text-white flex items-center justify-center geist-small font-bold shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="geist-caption text-white font-medium">{q.question}</p>
                    <span className="geist-small uppercase mt-1 inline-block text-[10px] px-2 py-0.5 rounded bg-white/[0.06] text-[#9ca3af]">
                      Category: {q.category || 'skills'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteQuestion(q.id)}
                  className="text-[#6b7280] hover:text-red-400 p-1.5 transition-colors"
                  title="Remove question"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ADD QUESTION MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.12] bg-[#0c0c0c] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="geist-subheading text-white">Add Screening Question</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-[#6b7280] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleAddQuestion} className="space-y-4">
              <div>
                <label className="geist-small block font-medium text-[#9ca3af] mb-1">
                  Question Text
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Are you willing to relocate to Bengaluru for this role?"
                  value={newQuestionText}
                  onChange={(e) => setNewQuestionText(e.target.value)}
                  className="geist-copy w-full rounded-lg border border-white/[0.12] bg-[#141414] p-3 text-white placeholder-[#6b7280] focus:border-white/[0.3] focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="geist-small block font-medium text-[#9ca3af] mb-1">
                  Category
                </label>
                <select
                  value={newQuestionCategory}
                  onChange={(e) => setNewQuestionCategory(e.target.value as any)}
                  className="geist-copy w-full rounded-lg border border-white/[0.12] bg-[#141414] px-3 py-2 text-white focus:border-white/[0.3] focus:outline-none transition-colors"
                >
                  <option value="relocation">Relocation</option>
                  <option value="notice_period">Notice Period</option>
                  <option value="salary">Salary Expectation</option>
                  <option value="skills">Technical / Core Skills</option>
                  <option value="general">Motivation / General</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="geist-caption h-8 rounded-lg border border-white/[0.12] px-3 font-medium text-[#9ca3af] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="geist-caption h-8 rounded-lg bg-white text-black font-bold px-4 hover:bg-white/90"
                >
                  Save Question
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAILED SCREENING REPORT MODAL */}
      {selectedResponse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-2xl border border-white/[0.12] bg-[#0c0c0c] p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-white/[0.1] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="geist-label uppercase text-emerald-400 font-bold">Voice Screening Report</span>
                  <span className={`geist-small px-2 py-0.5 rounded-full font-bold ${
                    selectedResponse.screeningReport?.recommendation === 'Shortlist'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  }`}>
                    {selectedResponse.screeningReport?.recommendation || 'Evaluated'}
                  </span>
                </div>
                <h3 className="geist-heading text-xl sm:text-2xl text-white mt-1">
                  {selectedResponse.candidateInfo?.name}
                </h3>
                <p className="geist-caption text-[#8f8f8f]">
                  {selectedResponse.candidateInfo?.email} • {selectedResponse.candidateInfo?.phone}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/voice-report/${selectedResponse.id}`}
                  target="_blank"
                  className="geist-small inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors font-bold text-xs"
                >
                  <ExternalLink size={13} /> Open Full Page ↗
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}/#/voice-report/${selectedResponse.id}`;
                    navigator.clipboard.writeText(url);
                    messageBox.showSuccess('Shareable report link copied to clipboard!');
                  }}
                  className="geist-small inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.12] bg-white/[0.04] text-white hover:bg-white/[0.08] transition-colors text-xs font-medium cursor-pointer"
                  title="Copy shareable link"
                >
                  <Share2 size={13} /> Share Link
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedResponse(null)}
                  className="text-[#6b7280] hover:text-white p-1"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Candidate Resume Attached Card */}
            {(selectedResponse.candidateInfo?.resumeUrl || selectedResponse.candidateResumeUrl) && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-blue-500/25 bg-blue-950/20 p-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-lg bg-blue-600 text-white shadow-xs shrink-0">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="geist-caption font-bold text-white text-sm truncate max-w-sm">
                      {selectedResponse.candidateInfo?.resumeFileName || selectedResponse.candidateResumeFileName || 'Candidate Resume'}
                    </div>
                    <span className="geist-small text-[#9ca3af] text-xs">
                      Resume submitted by candidate for voice screening
                    </span>
                  </div>
                </div>
                <a
                  href={selectedResponse.candidateInfo?.resumeUrl || selectedResponse.candidateResumeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-xs transition-colors"
                >
                  <Download size={13} />
                  <span>Download Resume ↗</span>
                </a>
              </div>
            )}

            {/* Score Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-center">
                <span className="geist-label text-[#6b7280] uppercase">Overall Score</span>
                <div className="geist-heading text-xl font-bold text-white mt-0.5">
                  {selectedResponse.screeningReport?.overallScore || 'N/A'}/10
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-center">
                <span className="geist-label text-[#6b7280] uppercase">Relocation</span>
                <div className="geist-caption font-bold text-emerald-400 mt-0.5">
                  {selectedResponse.screeningReport?.relocationStatus || 'Negotiable'}
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-center">
                <span className="geist-label text-[#6b7280] uppercase">Notice Period</span>
                <div className="geist-caption font-bold text-white mt-0.5">
                  {selectedResponse.screeningReport?.noticePeriod || 'N/A'}
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-center">
                <span className="geist-label text-[#6b7280] uppercase">Salary CTC</span>
                <div className="geist-caption font-bold text-[#d4d4d4] mt-0.5">
                  {selectedResponse.screeningReport?.salaryExpectation || 'Flexible'}
                </div>
              </div>
            </div>

            {/* AI Summary */}
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-2">
              <h4 className="geist-caption font-bold text-white flex items-center gap-1.5">
                <Sparkles size={14} className="text-emerald-400" /> Recruiter Executive Summary
              </h4>
              <p className="geist-caption text-[#d4d4d4] leading-relaxed">
                "{selectedResponse.screeningReport?.summary}"
              </p>
            </div>

            {/* Relocation Assessment */}
            {selectedResponse.screeningReport?.relocationDetails && (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-1.5">
                <h4 className="geist-caption font-bold text-white flex items-center gap-1.5">
                  <MapPin size={14} className="text-emerald-400" /> Relocation & Location Assessment
                </h4>
                <p className="geist-caption text-[#d4d4d4] leading-relaxed">
                  {selectedResponse.screeningReport.relocationDetails}
                </p>
              </div>
            )}

            {/* Technical Skills & JD Competency */}
            {selectedResponse.screeningReport?.skillsFeedback && (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="geist-caption font-bold text-white flex items-center gap-1.5">
                    <Activity size={14} className="text-emerald-400" /> Technical Competency & JD Alignment
                  </h4>
                  <span className="geist-caption font-bold text-emerald-400 text-xs">
                    Score: {selectedResponse.screeningReport?.skillsRating || 'N/A'}/10
                  </span>
                </div>
                <p className="geist-caption text-[#d4d4d4] leading-relaxed">
                  {selectedResponse.screeningReport.skillsFeedback}
                </p>
              </div>
            )}

            {/* Strengths & Concerns */}
            {((selectedResponse.screeningReport?.strengths && selectedResponse.screeningReport.strengths.length > 0) ||
              (selectedResponse.screeningReport?.concerns && selectedResponse.screeningReport.concerns.length > 0)) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {selectedResponse.screeningReport?.strengths && selectedResponse.screeningReport.strengths.length > 0 && (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/15 p-3.5 space-y-2">
                    <h5 className="geist-small font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 size={13} /> Key Candidate Strengths
                    </h5>
                    <ul className="space-y-1.5 text-xs text-[#d4d4d4]">
                      {selectedResponse.screeningReport.strengths.map((str, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-emerald-400 mt-0.5">•</span>
                          <span>{str}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedResponse.screeningReport?.concerns && selectedResponse.screeningReport.concerns.length > 0 && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-950/15 p-3.5 space-y-2">
                    <h5 className="geist-small font-bold text-amber-400 flex items-center gap-1.5">
                      <Shield size={13} /> Considerations & Risk Factors
                    </h5>
                    <ul className="space-y-1.5 text-xs text-[#d4d4d4]">
                      {selectedResponse.screeningReport.concerns.map((con, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-amber-400 mt-0.5">•</span>
                          <span>{con}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Recommendation Justification */}
            {selectedResponse.screeningReport?.recommendationReason && (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 text-xs text-[#9ca3af] leading-relaxed">
                <span className="font-bold text-white">Hiring Recommendation Rationale: </span>
                {selectedResponse.screeningReport.recommendationReason}
              </div>
            )}

            {/* Audio Recording Player */}
            {selectedResponse.audioRecordingUrl && (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="geist-caption font-bold text-white flex items-center gap-2">
                    <Volume2 size={15} className="text-emerald-400" /> Full Call Audio Recording (AWS S3)
                  </h4>
                  <a 
                    href={selectedResponse.audioRecordingUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    download={`voice-interview-${selectedResponse.id}.webm`}
                    className="text-xs text-emerald-400 hover:underline font-mono inline-flex items-center gap-1"
                  >
                    Download Audio ↗
                  </a>
                </div>
                <audio 
                  controls 
                  src={selectedResponse.audioRecordingUrl} 
                  className="w-full h-10 mt-1 accent-emerald-500 rounded-lg" 
                  preload="metadata"
                />
              </div>
            )}

            {/* Dialogue Transcript */}
            <div className="space-y-3">
              <h4 className="geist-caption font-bold text-white flex items-center gap-2">
                <MessageSquare size={14} className="text-emerald-400" /> Full Phone Call Transcript
              </h4>
              <div className="max-h-72 overflow-y-auto space-y-2.5 rounded-xl border border-white/[0.08] bg-[#050505] p-4">
                {selectedResponse.dialogueHistory && selectedResponse.dialogueHistory.length > 0 ? (
                  selectedResponse.dialogueHistory.map((turn, i) => (
                    <div 
                      key={i}
                      className={`p-3.5 rounded-xl text-xs leading-relaxed shadow-xs ${
                        turn.speaker === 'ai' 
                          ? 'bg-white/[0.04] text-neutral-200 border-l-3 border-blue-500' 
                          : 'bg-emerald-950/30 text-emerald-100 font-medium border-l-3 border-emerald-500'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold mb-1.5 opacity-90">
                        <span className={turn.speaker === 'ai' ? 'text-blue-400' : 'text-emerald-400'}>
                          {turn.speaker === 'ai' ? '🤖 AI Recruiter Screener' : '👤 Candidate'}
                        </span>
                        <span className="font-mono text-[10px] text-neutral-400">{turn.timestamp}</span>
                      </div>
                      <p className="leading-relaxed">{turn.text}</p>
                    </div>
                  ))
                ) : (
                  <p className="geist-small text-[#6b7280]">Transcript not available for this session.</p>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedResponse(null)}
                className="geist-caption px-4 py-2 rounded-lg bg-white text-black font-bold hover:bg-white/90"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InterviewVoiceInterview;
