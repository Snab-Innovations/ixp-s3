import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { ThemeProvider } from '../context/ThemeContext';
import { Interview } from '../types';
import DayNightToggle from '../components/DayNightToggle';
import gsap from 'gsap';
import { getRateLimitReachedMessage, isRateLimitReached, loadCompanyRateLimitStatus } from '../services/rateLimitService';

const InterviewAccess: React.FC = () => {
  const { interviewId } = useParams<{ interviewId: string }>();
  const navigate = useNavigate();
  const [accessCode, setAccessCode] = useState('');
  const [interviewTitle, setInterviewTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isExpired, setIsExpired] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);

  useEffect(() => {
    const fetchInterviewTitle = async () => {
      if (!interviewId) return;
      try {
        const interviewDoc = await getDoc(doc(db, 'interviews', interviewId));
        if (interviewDoc.exists()) {
           const interviewData = interviewDoc.data() as Interview;
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
      const interviewDoc = await getDoc(doc(db, 'interviews', interviewId));

      if (interviewDoc.exists()) {
        const interviewData = interviewDoc.data() as Interview;
        const rateLimitStatus = await loadCompanyRateLimitStatus();
        if (isRateLimitReached(rateLimitStatus, 'interviews')) {
          setIsRateLimited(true);
          setError(getRateLimitReachedMessage('interviews'));
          return;
        }
        if (accessCode.trim().toUpperCase() === interviewData.accessCode.toUpperCase()) {
          navigate(`/interview/start/${interviewId}`);
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

  return (
    <ThemeProvider>
      <div className="access-screen flex justify-center items-center min-h-screen bg-gray-100 dark:bg-gray-900 px-4 py-8 relative">
        <div className="absolute top-4 right-4 z-[10000]">
          <DayNightToggle />
        </div>
        <div className="access-container access-screen-card w-full max-w-md p-8 space-y-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg text-center">
        <div className="access-screen-header">
          <p className="access-screen-kicker">Interview access</p>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Enter access code</h1>
        </div>
        
        {error && (
          <p className="access-screen-alert text-red-500 bg-red-100 dark:bg-red-900/20 p-3 rounded-lg">{error}</p>
        )}

        {isExpired || isRateLimited ? (
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
