import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { ThemeProvider } from '../context/ThemeContext';
import { Interview } from '../types';
import DayNightToggle from '../components/DayNightToggle';
import gsap from 'gsap';
import { getRateLimitReachedMessage, isRateLimitReached, loadCompanyRateLimitStatus } from '../services/rateLimitService';
import { stageCandidateConsent } from '../services/candidateConsent';

const CANDIDATE_CONSENT_ITEMS = [
  {
    id: 'continuous_recording',
    title: 'Continuous recording and monitoring',
    text: 'Your audio and video will be continuously recorded and monitored for the entire, uninterrupted duration of the interview session.',
  },
  {
    id: 'ai_processing',
    title: 'AI processing and assessment',
    text: 'Your recorded media, spoken transcripts, biometric indicators such as gaze and posture, and session metadata will be processed by AI to evaluate your skills, communication, reasoning, and behavioral metrics against the job rubric.',
  },
  {
    id: 'recruiting_company_sharing',
    title: 'Sharing with the recruiting company',
    text: 'Your sensitive data and the AI-generated performance and integrity report will be shared with the recruiting company for its exclusive review.',
  },
] as const;

type CandidateConsentItemId = typeof CANDIDATE_CONSENT_ITEMS[number]['id'];

const InterviewAccess: React.FC = () => {
  const { interviewId } = useParams<{ interviewId: string }>();
  const navigate = useNavigate();
  const hasFetchedInterview = useRef(false);
  const [accessCode, setAccessCode] = useState('');
  const [interviewTitle, setInterviewTitle] = useState('');
  const [interview, setInterview] = useState<Interview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isExpired, setIsExpired] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [consentSelections, setConsentSelections] = useState<Record<CandidateConsentItemId, boolean>>({
    continuous_recording: false,
    ai_processing: false,
    recruiting_company_sharing: false,
  });

  const hasAcceptedAll = CANDIDATE_CONSENT_ITEMS.every((item) => consentSelections[item.id]);

  useEffect(() => {
    const fetchInterviewTitle = async () => {
      if (!interviewId || hasFetchedInterview.current) return;
      hasFetchedInterview.current = true;
      try {
        const interviewDoc = await getDoc(doc(db, 'interviews', interviewId));
        if (interviewDoc.exists()) {
           const interviewData = interviewDoc.data() as Interview;
           setInterview(interviewData);
           setInterviewTitle(interviewData.title);
           const rateLimitStatus = await loadCompanyRateLimitStatus();
           if (isRateLimitReached(rateLimitStatus, 'interviews')) {
             setIsRateLimited(true);
             setError(getRateLimitReachedMessage('interviews'));
           }
          
          if ((interviewData as any).deadline) {
            const deadlineDate = new Date((interviewData as any).deadline);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (deadlineDate < today) {
              setIsExpired(true);
            }
          }
        } else {
          setError('Interview not found.');
        }
      } catch (err) {
        setError('Failed to fetch interview details.');
      }
    };
    fetchInterviewTitle();
  }, [interviewId]);

  const handleStartInterview = async () => {
    if (!accessCode.trim()) {
      setError('Please enter an access code.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      if (!interviewId) {
        throw new Error('Interview ID is missing.');
      }
      if (interview) {
        if (accessCode.trim().toUpperCase() === interview.accessCode.toUpperCase()) {
          setShowConsent(true);
        } else {
          setError('Invalid access code. Please try again.');
          gsap.fromTo(".access-container", { x: -10 }, { x: 10, repeat: 3, yoyo: true, duration: 0.1, ease: 'power1.inOut', onComplete: () => gsap.to(".access-container", {x: 0}) });
        }
      } else {
        setError('This interview is no longer available.');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again later.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const setAllConsents = (checked: boolean) => {
    setConsentSelections({
      continuous_recording: checked,
      ai_processing: checked,
      recruiting_company_sharing: checked,
    });
  };

  const handleConsent = async () => {
    if (!interviewId || !hasAcceptedAll) return;

    setIsLoading(true);
    setError('');
    try {
      await stageCandidateConsent(interviewId, interviewTitle);
      navigate(`/interview/start/${interviewId}`);
    } catch {
      setError('Consent could not be prepared. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ThemeProvider>
      <div className="access-screen flex justify-center items-center min-h-screen bg-gray-100 dark:bg-gray-900 px-4 py-8 relative">
        <div className="absolute top-4 right-4 z-[10000]">
          <DayNightToggle />
        </div>
        <div className={`access-container access-screen-card w-full ${showConsent ? 'max-w-2xl' : 'max-w-md'} p-6 sm:p-8 space-y-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg text-center`}>
        <div className="access-screen-header">
          <p className="access-screen-kicker">{showConsent ? 'Before you continue' : 'Interview access'}</p>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {showConsent ? 'Interview consent' : 'Enter access code'}
          </h1>
          {showConsent ? (
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              Review and accept each item to start candidate onboarding for <strong>{interviewTitle}</strong>.
            </p>
          ) : null}
        </div>
        
        {error && (
          <p className="access-screen-alert text-red-500 bg-red-100 dark:bg-red-900/20 p-3 rounded-lg">{error}</p>
        )}

        {showConsent && !isExpired && !isRateLimited ? (
          <div className="text-left">
            <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/70 dark:bg-blue-950/30">
              <input
                type="checkbox"
                checked={hasAcceptedAll}
                onChange={(event) => setAllConsents(event.target.checked)}
                className="size-5 shrink-0 accent-blue-600"
              />
              <span>
                <span className="block text-sm font-bold text-gray-900 dark:text-white">Select all consents</span>
                <span className="block text-xs leading-5 text-gray-600 dark:text-gray-400">Select or clear every item below.</span>
              </span>
            </label>

            <fieldset className="flex flex-col gap-3">
              <legend className="sr-only">Interview consent items</legend>
              {CANDIDATE_CONSENT_ITEMS.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4 transition hover:border-blue-300 dark:border-white/10 dark:hover:border-blue-700"
                >
                  <input
                    type="checkbox"
                    checked={consentSelections[item.id]}
                    onChange={(event) => setConsentSelections((current) => ({
                      ...current,
                      [item.id]: event.target.checked,
                    }))}
                    className="mt-0.5 size-5 shrink-0 accent-blue-600"
                  />
                  <span>
                    <span className="block text-sm font-bold text-gray-900 dark:text-white">{item.title}</span>
                    <span className="mt-1 block text-sm leading-6 text-gray-600 dark:text-gray-300">{item.text}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setShowConsent(false);
                  setError('');
                  setAllConsents(false);
                }}
                disabled={isLoading}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConsent}
                disabled={!hasAcceptedAll || isLoading}
                className="access-screen-submit w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-lg shadow-primary/20 transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50 dark:text-black"
              >
                {isLoading ? 'Continuing...' : 'I consent and continue'}
              </button>
            </div>
          </div>
        ) : isExpired || isRateLimited ? (
          <div className="access-screen-expired space-y-4 py-4">
            <div className="access-screen-icon mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <p className="text-lg font-bold text-gray-800 dark:text-gray-200">
              {isRateLimited ? 'Company interview limit reached' : 'Link expired'}
            </p>
            <p className="text-gray-600 dark:text-gray-400 pb-2">
              {isRateLimited ? 'This interview cannot start until an administrator adds a top-up or resets the company limit.' : 'Contact support if you need a new access link.'}
            </p>
            <div className="access-screen-support bg-gray-50 dark:bg-[#1a1a1a] p-4 rounded-xl border border-gray-200 dark:border-white/10">
              <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Support</p>
              <p className="text-lg font-black text-primary">9762588623 / 8484888632</p>
            </div>
          </div>
        ) : interviewTitle ? (
          <div className="access-screen-body space-y-6">
            <p className="text-gray-600 dark:text-gray-300">
              Continue to the <strong>{interviewTitle}</strong> interview.
            </p>
            <div className="flex flex-col space-y-4">
              <input
                type="text"
                placeholder="Enter access code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                className="access-screen-input w-full px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all text-center tracking-widest font-mono"
              />
              <button 
                onClick={handleStartInterview}
                disabled={isLoading}
                className="access-screen-submit w-full bg-primary hover:bg-primary-dark text-white dark:text-black font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-primary/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
              {isLoading ? 'Verifying...' : 'Start Interview'}
              </button>
            </div>
          </div>
        ) : (
          !error && <p>Loading interview details...</p>
        )}
      </div>
    </div>
    </ThemeProvider>
  );
};

export default InterviewAccess;
