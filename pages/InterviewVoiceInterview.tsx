import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { rds, poll } from '../services/rdsApi';
import { loadStoredCognitoSession } from '../services/authService';
import { Interview } from '../types';
import { InterviewOverviewSkeleton } from '../components/ui/interview-loading-skeleton';
import { Mic, ArrowLeft, Construction, Sparkles, AudioWaveform, Cpu, ShieldCheck } from 'lucide-react';
import InterviewManageTabs from './InterviewManageTabs';

const InterviewVoiceInterview: React.FC = () => {
  const { interviewId } = useParams<{ interviewId: string }>();
  const { user } = useAuth();
  const [interview, setInterview] = useState<Interview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!interviewId || !user) {
      setLoading(false);
      return;
    }

    const uid = loadStoredCognitoSession()?.firebaseUid || '';
    const stop = poll(
      () => rds.getInterview(interviewId),
      ({ interview }) => {
        if (!interview) {
          setInterview(null);
          setLoading(false);
          return;
        }

        if (interview.recruiterUID !== uid) {
          setInterview(null);
          setLoading(false);
          return;
        }

        setInterview(interview as Interview);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading interview voice page:', error);
        setLoading(false);
      },
      4000
    );

    return () => stop();
  }, [interviewId, user]);

  if (loading) {
    return <InterviewOverviewSkeleton />;
  }

  if (!interview || !interviewId) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center bg-white dark:bg-[#09090b] rounded-2xl border border-slate-200 dark:border-white/[0.11] shadow-sm my-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Interview not found</h1>
        <Link to="/recruiter/interviews" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline">
          <ArrowLeft size={16} /> Back to interviews
        </Link>
      </div>
    );
  }

  return (
    <div className="-mx-4 -my-8 sm:-mx-6 lg:-mx-8 min-h-[calc(100vh-3.5rem)] bg-slate-50 dark:bg-[#000] text-slate-900 dark:text-white font-sans flex flex-col justify-center items-center p-4 sm:p-8">
      <main className="max-w-4xl w-full">
        <section className="overflow-hidden rounded-3xl border border-slate-200 dark:border-white/[0.11] bg-white dark:bg-[#030303] shadow-lg">
          
          {/* Card Header */}
          <div className="border-b border-slate-200 dark:border-white/[0.11] bg-slate-50 dark:bg-[#08080a] px-6 py-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="geist-label uppercase text-slate-500 dark:text-[#6b7280]">Voice Interview</p>
              <h2 className="geist-section-title mt-1 text-slate-900 dark:text-white flex items-center gap-2">
                <Mic className="text-blue-600 dark:text-blue-400" size={18} />
                {interview.title}
              </h2>
            </div>
            
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
              <Construction size={14} className="text-amber-600 dark:text-amber-400" />
              Development in Progress
            </span>
          </div>

          {/* Banner Hero Body */}
          <div className="flex flex-col items-center justify-center p-8 sm:p-14 text-center">
            
            {/* Animated Mic Icon Box */}
            <div className="relative mb-6">
              <div className="absolute -inset-3 rounded-full bg-blue-500/20 blur-xl animate-pulse" />
              <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-inner">
                <Mic size={42} strokeWidth={1.75} />
              </div>
            </div>

            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 mb-4">
              <Construction size={15} className="text-amber-600 dark:text-amber-400" />
              Development in Progress
            </span>

            <h3 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight sm:text-3xl max-w-xl">
              Voice Interview Agent Under Active Engineering
            </h3>
            
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-[#8f8f8f]">
              We are currently engineering the AI conversational voice engine for <strong>{interview.title}</strong>. This feature is coming soon in an upcoming release.
            </p>

            {/* Feature Preview Grid */}
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full text-left">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0a0a0d] border border-slate-200 dark:border-white/[0.08] space-y-2">
                <div className="p-2 w-fit rounded-lg bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20">
                  <AudioWaveform size={18} />
                </div>
                <h4 className="font-bold text-slate-900 dark:text-white text-xs">Conversational AI Voice</h4>
                <p className="text-[11px] text-slate-500 dark:text-gray-400 leading-normal">
                  Human-like AI voice assistant asking role-specific technical questions adaptively.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0a0a0d] border border-slate-200 dark:border-white/[0.08] space-y-2">
                <div className="p-2 w-fit rounded-lg bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                  <Cpu size={18} />
                </div>
                <h4 className="font-bold text-slate-900 dark:text-white text-xs">Instant Audio Processing</h4>
                <p className="text-[11px] text-slate-500 dark:text-gray-400 leading-normal">
                  High-speed speech-to-text transcription with noise cancellation and sentiment analysis.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0a0a0d] border border-slate-200 dark:border-white/[0.08] space-y-2">
                <div className="p-2 w-fit rounded-lg bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20">
                  <ShieldCheck size={18} />
                </div>
                <h4 className="font-bold text-slate-900 dark:text-white text-xs">Fluency & Skill Metrics</h4>
                <p className="text-[11px] text-slate-500 dark:text-gray-400 leading-normal">
                  Comprehensive score breakdown of vocabulary, technical accuracy, and spoken confidence.
                </p>
              </div>
            </div>

            {/* Back Button */}
            <div className="mt-8 flex items-center justify-center gap-3">
              <Link
                to="/recruiter/interviews"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black font-bold text-xs hover:bg-slate-800 dark:hover:bg-[#eaeaea] transition-all shadow-md"
              >
                <ArrowLeft size={15} />
                Back to My Interviews
              </Link>
            </div>

          </div>
        </section>
      </main>
    </div>
  );
};

export default InterviewVoiceInterview;
