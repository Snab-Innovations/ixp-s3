import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { useMessageBox } from '../components/MessageBox';
import { 
  Phone, Plus, Copy, ExternalLink, Briefcase, Users, CheckCircle2, 
  Sparkles, Clock, ArrowRight, Shield, Activity 
} from 'lucide-react';
import { VoiceInterview, VoiceInterviewResponse } from '../types';
import { saveVoiceInterview, DEFAULT_SCREENING_QUESTIONS } from '../services/voiceInterviewService';

export const RecruiterVoiceInterviews: React.FC = () => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const messageBox = useMessageBox();

  const [voiceInterviews, setVoiceInterviews] = useState<VoiceInterview[]>([]);
  const [recentResponses, setRecentResponses] = useState<VoiceInterviewResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New Voice Interview Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [creating, setCreating] = useState(false);

  const recruiterUID = user?.uid || '';
  const teamId = userProfile?.teamId || user?.uid || '';

  // Load Voice Interviews for this recruiter / team
  useEffect(() => {
    if (!recruiterUID) return;

    setLoading(true);

    // 1. Subscribe to voice interviews
    const qInterviews = query(
      collection(db, 'voiceInterviews'),
      where('recruiterUID', '==', recruiterUID)
    );

    const unsubInterviews = onSnapshot(qInterviews, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as VoiceInterview));
      setVoiceInterviews(list);
      setLoading(false);
    }, (err) => {
      console.warn('[Recruiter Voice] Error loading voice interviews:', err);
      setLoading(false);
    });

    // 2. Subscribe to recent voice responses
    const qResponses = query(
      collection(db, 'voiceInterviewResponses'),
      where('recruiterUID', '==', recruiterUID)
    );

    const unsubResponses = onSnapshot(qResponses, (snap) => {
      const resList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as VoiceInterviewResponse));
      resList.sort((a, b) => {
        const timeA = a.submittedAt?.toMillis?.() || 0;
        const timeB = b.submittedAt?.toMillis?.() || 0;
        return timeB - timeA;
      });
      setRecentResponses(resList);
    }, (err) => {
      console.warn('[Recruiter Voice] Error loading responses:', err);
    });

    return () => {
      unsubInterviews();
      unsubResponses();
    };
  }, [recruiterUID]);

  const handleCopyLink = (interviewId: string) => {
    const link = `${window.location.origin}/#/voice-interview/${interviewId}`;
    navigator.clipboard.writeText(link);
    messageBox.showSuccess('Candidate Voice Interview Link copied to clipboard!');
  };

  const handleCreateVoiceInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setCreating(true);
    try {
      const id = `voice_${Date.now()}`;
      const payload: VoiceInterview = {
        id,
        title: newTitle.trim(),
        jobTitle: newTitle.trim(),
        jobDescription: newDescription.trim(),
        location: newLocation.trim(),
        recruiterUID,
        teamId,
        questions: DEFAULT_SCREENING_QUESTIONS,
        status: 'active',
        createdAt: new Date()
      };

      await saveVoiceInterview(payload);
      setShowCreateModal(false);
      setNewTitle('');
      setNewDescription('');
      setNewLocation('');
      messageBox.showSuccess('Voice screening interview created successfully!');
      navigate(`/recruiter/interview/${id}/voice-interview`);
    } catch (err: any) {
      console.error('[Create Voice Interview] Error:', err);
      messageBox.showError(err.message || 'Failed to create voice interview.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] bg-[#000] text-white">
      {/* Top Header */}
      <section className="sticky top-14 z-20 border-b border-white/[0.11] bg-[#000]/95 backdrop-blur-md">
        <div className="px-4 py-5 sm:px-6 lg:px-7 max-w-7xl mx-auto">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="geist-label uppercase text-emerald-400 font-bold flex items-center gap-1.5">
                  <Phone size={13} /> Voice Screening Calls
                </span>
                <span className="geist-small px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                  AI Caller
                </span>
              </div>
              <h1 className="geist-page-title text-2xl sm:text-3xl font-extrabold text-white">
                Voice Interviews & Phone Screening
              </h1>
              <p className="geist-caption text-[#8f8f8f] mt-1">
                Audio-only automated phone screenings. AI screens candidate relocation readiness, notice period, salary CTC, and basic skills with voice repeat & skip intelligence.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="geist-caption inline-flex h-9 items-center gap-2 rounded-lg bg-white hover:bg-white/90 text-black font-extrabold px-4 transition-all shadow-md cursor-pointer shrink-0"
            >
              <Plus size={15} />
              <span>Schedule Voice Screening</span>
            </button>
          </div>
        </div>
      </section>

      {/* Metric Cards */}
      <div className="border-b border-white/[0.11] bg-[#050505]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-7 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-white/[0.08] bg-[#0c0c0c] p-4">
              <span className="geist-label uppercase text-[#6b7280]">Active Voice Screenings</span>
              <div className="geist-metric text-2xl font-extrabold text-white mt-1">
                {voiceInterviews.length}
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-[#0c0c0c] p-4">
              <span className="geist-label uppercase text-[#6b7280]">Total Completed Calls</span>
              <div className="geist-metric text-2xl font-extrabold text-white mt-1">
                {recentResponses.length}
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-[#0c0c0c] p-4">
              <span className="geist-label uppercase text-[#6b7280]">Shortlisted Candidates</span>
              <div className="geist-metric text-2xl font-extrabold text-emerald-400 mt-1">
                {recentResponses.filter(r => r.screeningReport?.recommendation === 'Shortlist').length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-7 py-6 space-y-6">
        <div>
          <h2 className="geist-section-title text-white">Your Voice Interview Screenings</h2>
          <p className="geist-small text-[#8f8f8f] mt-0.5">
            Share candidate voice screening links or open each interview workspace to view reports.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-[#9ca3af] flex items-center justify-center gap-2">
            <Activity className="animate-spin h-5 w-5" />
            <span className="geist-caption">Loading voice interviews...</span>
          </div>
        ) : voiceInterviews.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.12] bg-[#0c0c0c] p-12 text-center max-w-lg mx-auto space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.1] bg-white/[0.04] text-emerald-400">
              <Phone size={24} />
            </div>
            <h3 className="geist-heading text-lg font-bold text-white">No voice interviews created yet</h3>
            <p className="geist-caption text-[#8f8f8f] leading-relaxed">
              Create a voice screening interview to let candidates complete automated phone screening calls anytime without scheduling conflicts.
            </p>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="geist-caption inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white text-black font-extrabold hover:bg-white/90 transition-all cursor-pointer"
            >
              <Plus size={15} />
              <span>Schedule First Voice Interview</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {voiceInterviews.map((vi) => {
              const count = recentResponses.filter(r => r.voiceInterviewId === vi.id).length;
              return (
                <div
                  key={vi.id}
                  className="rounded-2xl border border-white/[0.1] bg-[#0c0c0c] p-5 flex flex-col justify-between hover:border-white/[0.25] transition-all group"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="geist-small px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-semibold text-[11px]">
                        Active Voice Screener
                      </span>
                      <span className="geist-small text-[#6b7280]">
                        {count} call{count === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div>
                      <h3 className="geist-heading text-base font-bold text-white group-hover:text-emerald-300 transition-colors">
                        {vi.title}
                      </h3>
                      {vi.location && (
                        <p className="geist-small text-[#8f8f8f] mt-1 flex items-center gap-1">
                          <Briefcase size={12} /> {vi.location}
                        </p>
                      )}
                    </div>

                    <p className="geist-small text-[#6b7280] line-clamp-2">
                      {vi.jobDescription || 'Standard phone screening for role.'}
                    </p>
                  </div>

                  <div className="pt-5 border-t border-white/[0.08] mt-4 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyLink(vi.id)}
                      className="geist-small inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.12] bg-white/[0.04] text-[#d4d4d4] hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                      title="Copy candidate call link"
                    >
                      <Copy size={13} className="text-emerald-400" />
                      <span>Copy Link</span>
                    </button>

                    <Link
                      to={`/recruiter/interview/${vi.id}/voice-interview`}
                      className="geist-small inline-flex items-center gap-1 text-white hover:text-emerald-400 font-semibold transition-colors"
                    >
                      <span>Manage & Reports</span>
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.12] bg-[#0c0c0c] p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="geist-subheading text-white flex items-center gap-2">
                <Phone size={16} className="text-emerald-400" /> Schedule Voice Screening
              </h3>
              <p className="geist-small text-[#8f8f8f] mt-1">
                Configure a new audio phone screening interview for applicants.
              </p>
            </div>

            <form onSubmit={handleCreateVoiceInterview} className="space-y-4">
              <div>
                <label className="geist-small block font-medium text-[#9ca3af] mb-1">
                  Job Role / Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sales Executive (Field & B2B)"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="geist-copy w-full rounded-lg border border-white/[0.12] bg-[#141414] px-3.5 py-2 text-white placeholder-[#6b7280] focus:border-white/[0.3] focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="geist-small block font-medium text-[#9ca3af] mb-1">
                  Location / City
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pune / Mumbai"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  className="geist-copy w-full rounded-lg border border-white/[0.12] bg-[#141414] px-3.5 py-2 text-white placeholder-[#6b7280] focus:border-white/[0.3] focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="geist-small block font-medium text-[#9ca3af] mb-1">
                  Job Description / Key Requirements
                </label>
                <textarea
                  rows={3}
                  placeholder="Paste brief job requirements or responsibilities..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="geist-copy w-full rounded-lg border border-white/[0.12] bg-[#141414] p-3 text-white placeholder-[#6b7280] focus:border-white/[0.3] focus:outline-none transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="geist-caption h-8 rounded-lg border border-white/[0.12] px-3 font-medium text-[#9ca3af] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="geist-caption h-8 rounded-lg bg-white text-black font-bold px-4 hover:bg-white/90 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Voice Interview'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecruiterVoiceInterviews;
