import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { ThemeProvider } from '../context/ThemeContext';
import { Interview } from '../types';
import DayNightToggle from '../components/DayNightToggle';
import gsap from 'gsap';
import { ChevronDown } from 'lucide-react';
import { getRateLimitReachedMessage, isRateLimitReached, loadCompanyRateLimitStatus } from '../services/rateLimitService';
import { stageCandidateConsent } from '../services/candidateConsent';

import { resolveJobOrInterviewDocument } from '../services/jobResolutionService';

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

  // Candidate Consent States
  const [isConsented, setIsConsented] = useState(false);
  const [isLearnMoreOpen, setIsLearnMoreOpen] = useState(false);

  useEffect(() => {
    const fetchInterviewTitle = async () => {
      if (!interviewId || hasFetchedInterview.current) return;
      hasFetchedInterview.current = true;
      try {
        const resolved = await resolveJobOrInterviewDocument(interviewId);
        if (resolved && resolved.data) {
          const interviewData = resolved.data as Interview;
          setInterview(interviewData);
          setInterviewTitle(interviewData.title || 'Job Interview');

          // Auto-bypass Access Code screen if candidate applied via Job Match Portal
          const hashParts = window.location.hash.split('?');
          const queryStr = hashParts.length > 1 ? hashParts[1] : '';
          const urlParams = new URLSearchParams(queryStr || window.location.search);
          const urlCode = urlParams.get('code');
          const isDirect = urlParams.get('direct') === 'true' || sessionStorage.getItem(`direct_bypass_${interviewId}`) === 'true';

          if (urlCode || isDirect) {
            const validCode = urlCode || interviewData.accessCode || '';
            setAccessCode(validCode);
            setShowConsent(true); // Direct bypass access code screen!
          }

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

  const handleConsent = async () => {
    if (!interviewId || !isConsented) return;

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
              Review and consent to start candidate onboarding for <strong>{interviewTitle}</strong>.
            </p>
          ) : null}
        </div>
        
        {error && (
          <p className="access-screen-alert text-red-500 bg-red-100 dark:bg-red-900/20 p-3 rounded-lg text-sm font-medium">{error}</p>
        )}

        {showConsent && !isExpired && !isRateLimited ? (
          <div className="text-left space-y-4">
            {/* Checkbox (primary, one line) */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 transition-colors dark:border-blue-900/60 dark:bg-blue-950/30">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isConsented}
                  onChange={(e) => setIsConsented(e.target.checked)}
                  className="mt-1 size-5 shrink-0 accent-blue-600 cursor-pointer rounded"
                />
                <span className="text-sm font-medium leading-relaxed text-gray-800 dark:text-gray-200">
                  I consent to this interview being recorded, analyzed by AI, and shared with the recruiting company, as described in{' '}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setIsLearnMoreOpen((prev) => !prev);
                    }}
                    className="inline-flex items-center gap-1 font-bold text-blue-600 underline hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 focus:outline-none"
                  >
                    <span>Learn more</span>
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${isLearnMoreOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  .
                </span>
              </label>
            </div>

            {/* "Learn more" expandable panel content */}
            {isLearnMoreOpen && (
              <div className="rounded-xl border border-gray-200 bg-gray-50/90 p-5 space-y-4 text-xs sm:text-sm text-gray-700 dark:border-white/10 dark:bg-gray-800/90 dark:text-gray-300 shadow-inner">
                <h4 className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white border-b border-gray-200 dark:border-white/10 pb-2">
                  What you're agreeing to
                </h4>

                <div className="space-y-3 leading-relaxed">
                  <p>
                    <strong className="text-gray-900 dark:text-white">1. Recording</strong> — Your audio and video will be continuously recorded for the full duration of this interview session.
                  </p>

                  <p>
                    <strong className="text-gray-900 dark:text-white">2. AI processing</strong> — Your recording, transcript, and behavioral/biometric indicators (such as gaze and posture) will be analyzed by AI to assess your skills, communication, reasoning, and behavior against the job rubric.
                  </p>

                  <p>
                    <strong className="text-gray-900 dark:text-white">3. Sharing</strong> — Your recording, transcript, and the AI-generated assessment report will be shared with the recruiting company for their exclusive review as part of this hiring process.
                  </p>

                  <p>
                    <strong className="text-gray-900 dark:text-white">4. Consent record</strong> — When you submit this consent, we log your IP address, timestamp, and the exact text shown above as proof that consent was given. This record is used only to verify consent and is handled under our{' '}
                    <a
                      href="/privacy-policy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline font-semibold hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Privacy Policy
                    </a>
                    .
                  </p>
                </div>

                <div className="pt-3 border-t border-gray-200 dark:border-white/10 text-xs italic text-gray-500 dark:text-gray-400">
                  You may withdraw consent before the interview begins by closing this window. Once the interview starts, this consent applies for its full duration.
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setShowConsent(false);
                  setError('');
                  setIsConsented(false);
                  setIsLearnMoreOpen(false);
                }}
                disabled={isLoading}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConsent}
                disabled={!isConsented || isLoading}
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
