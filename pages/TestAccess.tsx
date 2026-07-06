import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import gsap from 'gsap';
import { useTheme } from '../context/ThemeContext';
import Logo from '../components/Logo';
import { Timer, MonitorOff, ShieldAlert, Copy } from 'lucide-react';

const TestAccess: React.FC = () => {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [accessCode, setAccessCode] = useState('');
  const [testDetails, setTestDetails] = useState<{ title: string, duration: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const containerRef = useRef(null);

  useEffect(() => {
    const fetchTestDetails = async () => {
      if (!testId) return;
      try {
        const testDoc = await getDoc(doc(db, 'tests', testId));
        if (testDoc.exists()) {
          const testData = testDoc.data() as any;
          setTestDetails({
            title: testData.title || 'Assessment',
            duration: testData.duration || 0
          });
        } else {
          setError('Assessment not found.');
        }
      } catch (err) {
        setError('Failed to fetch Assessment details.');
      }
    };
    fetchTestDetails();
  }, [testId]);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(containerRef.current, 
        { opacity: 0, y: 30 }, 
        { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }
      );
    }
  }, []);

  const handleStartTest = async () => {
    if (!accessCode.trim()) {
      setError('Please enter an access code.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      if (!testId) {
        throw new Error('Test ID is missing.');
      }
      const testDoc = await getDoc(doc(db, 'tests', testId));

      if (testDoc.exists()) {
        const testData = testDoc.data() as any;
        if (accessCode.trim().toUpperCase() === (testData.accessCode || '').toUpperCase()) {
          navigate(`/test/start/${testId}`);
        } else {
          setError('Invalid access code. Please try again.');
          gsap.fromTo(".access-container", { x: -10 }, { x: 10, repeat: 3, yoyo: true, duration: 0.1, ease: 'power1.inOut', onComplete: () => gsap.to(".access-container", {x: 0}) });
        }
      } else {
        setError('This assessment is no longer available.');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again later.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const rules = [
    { icon: Timer, text: `The test is timed for ${testDetails?.duration || 'a specific'} minutes.` },
    { icon: MonitorOff, text: 'Fullscreen mode will be enabled automatically.' },
    { icon: ShieldAlert, text: 'Switching tabs is not allowed and will be flagged.' },
    { icon: Copy, text: 'Copying and pasting content is disabled.' },
  ];

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-white p-4 text-[#111] dark:bg-[#050505] dark:text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,0,0,0.06),transparent_32rem)] dark:bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_32rem)]" />
      <div className="absolute top-6 left-6">
        <Logo className="w-[118px] sm:w-[140px] h-auto" isDark={isDark} />
      </div>
      
      <div ref={containerRef} className="access-container relative w-full max-w-lg space-y-6 rounded-[14px] border border-black/[0.08] bg-white p-6 shadow-[0_24px_80px_rgba(0,0,0,0.08)] dark:border-white/[0.11] dark:bg-[#0a0a0a] md:p-10">
        <div className="text-center">
          <div className="mx-auto mb-4 inline-flex h-7 items-center rounded-full border border-black/[0.08] bg-black/[0.03] px-3 text-xs font-medium text-gray-600 dark:border-white/[0.11] dark:bg-white/[0.05] dark:text-[#a1a1a1]">Secure assessment</div>
          <h1 className="mb-2 text-3xl font-semibold tracking-[-0.04em] text-gray-900 dark:text-white md:text-4xl">Assessment Access</h1>
          <p className="text-sm leading-6 text-gray-500 dark:text-[#8f8f8f]">
            You are about to start: <strong className="font-medium text-black dark:text-white">{testDetails?.title || '...'}</strong>
          </p>
        </div>

        {/* Rules Section */}
        <div className="rounded-[10px] border border-black/[0.08] bg-black/[0.02] p-5 dark:border-white/[0.11] dark:bg-white/[0.04]">
          <h3 className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-[#8f8f8f]">Rules of the Assessment</h3>
          <ul className="space-y-3">
            {rules.map((rule, index) => (
              <li key={index} className="flex items-start gap-3 text-sm text-gray-600 dark:text-[#a1a1a1]">
                <rule.icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-black dark:text-white" />
                <span>{rule.text}</span>
              </li>
            ))}
          </ul>
        </div>
        
        {error && (
          <p className="rounded-[8px] border border-red-500/20 bg-red-500/10 p-3 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
        )}

        {testDetails ? (
          <div className="space-y-4 border-t border-black/[0.08] pt-4 dark:border-white/[0.11]">
            <label className="block text-center text-sm font-medium text-gray-700 dark:text-[#a1a1a1]">Enter Access Code</label>
            <input
              type="text"
              placeholder="••••••"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              className="w-full rounded-[10px] border border-black/[0.08] bg-white px-4 py-4 text-center font-mono text-2xl tracking-[0.5em] text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-black/30 focus:ring-4 focus:ring-black/[0.04] dark:border-white/[0.11] dark:bg-[#050505] dark:text-white dark:placeholder:text-[#666] dark:focus:border-white/30 dark:focus:ring-white/[0.06]"
            />
            <button 
              onClick={handleStartTest}
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-[6px] bg-black px-4 py-3.5 text-sm font-medium text-white transition-colors hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-[#eaeaea]"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verifying...
                </>
              ) : 'Access Assessment'}
            </button>
          </div>
        ) : (
          !error && <p className="text-center text-gray-500">Loading assessment details...</p>
        )}
      </div>
    </div>
  );
};

export default TestAccess;
