import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { rds, poll } from '../services/rdsApi';
import { loadStoredCognitoSession } from '../services/authService';
import { Interview } from '../types';
import { InterviewOverviewSkeleton } from '../components/ui/interview-loading-skeleton';

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
      <div className="mx-auto max-w-3xl p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Interview not found</h1>
        <Link to="/recruiter/interviews" className="mt-4 inline-flex text-sm font-bold text-primary hover:underline">
          Back to interviews
        </Link>
      </div>
    );
  }

  return (
    <div className="-mx-4 -my-8 min-h-[calc(100vh-3.5rem)] bg-[#000] text-white sm:-mx-6 lg:-mx-8">
      <section className="sticky top-14 z-20 border-b border-white/[0.11] bg-[#000]">
        <div className="px-4 py-5 sm:px-6 lg:px-7">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Link
                  to="/recruiter/interviews"
                  className="geist-caption inline-flex h-8 items-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <i className="fas fa-arrow-left text-[11px]"></i>
                  <span>Back to interviews</span>
                </Link>
                <span className="geist-label uppercase text-[#9ca3af]">Voice Interview</span>
              </div>
              <h1 className="geist-page-title mt-2 max-w-5xl truncate text-white">{interview.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="geist-small rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-2 py-1 font-medium text-[#d4d4d4]">
                  {interview.department || 'No department'}
                </span>
                <span className="geist-small rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-2 py-1 font-medium text-[#d4d4d4]">
                  {interview.duration ? `${interview.duration} minutes` : 'No duration'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="px-4 py-6 sm:px-6 lg:px-7">
        <section className="overflow-hidden border border-white/[0.11] bg-[#030303]">
          <div className="border-b border-white/[0.11] px-4 py-4 sm:px-6 lg:px-7">
            <p className="geist-label uppercase text-[#6b7280]">Voice Interview</p>
            <h2 className="geist-section-title mt-1 text-white">Voice interview workspace</h2>
            <p className="geist-small mt-1 text-[#8f8f8f]">This feature is temporarily paused.</p>
          </div>
          <div className="flex min-h-[360px] items-center justify-center px-4 py-12 text-center sm:px-6 lg:px-7">
            <div className="max-w-md">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.11] bg-white/[0.04] text-[#d4d4d4]">
                <i className="fas fa-microphone text-lg"></i>
              </div>
              <h3 className="geist-section-title mt-5 text-white">Under development</h3>
              <p className="geist-caption mt-2 leading-6 text-[#8f8f8f]">
                Voice Interview is not available yet. We will enable this workspace when the feature is ready to ship.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default InterviewVoiceInterview;
