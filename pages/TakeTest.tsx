import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { AlertTriangle, Clock, Code, Terminal, Play, FileCode, Settings, CheckCircle, Calculator as CalculatorIcon, Flag, X } from 'lucide-react';
import { sendInterviewInvitations } from '../services/brevoService';
import { grokGenerateJson } from '../services/grokService';
import { getCandidateRateLimitReachedMessage, isRateLimitReached, loadCompanyRateLimitStatus, assertCompanyRateLimit, RateLimitResource } from '../services/rateLimitService';
import { rds } from '../services/rdsApi';
import { useCompanyRateLimits } from '../hooks/useRecruiterRateLimits';

const TestInfoForm: React.FC<{ onSubmit: (info: {name: string, email: string}) => void }> = ({ onSubmit }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6 text-[#111] dark:bg-[#050505] dark:text-white">
      <div className="w-full max-w-md rounded-[14px] border border-black/[0.08] bg-white p-8 shadow-[0_24px_80px_rgba(0,0,0,0.08)] dark:border-white/[0.11] dark:bg-[#0a0a0a]">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-black/[0.08] bg-black text-white dark:border-white/[0.11] dark:bg-white dark:text-black">
          <CheckCircle size={18} />
        </div>
        <h2 className="mb-2 text-center text-3xl font-semibold tracking-[-0.04em] dark:text-white">Candidate Information</h2>
        <p className="mb-6 text-center text-sm leading-6 text-gray-500 dark:text-[#8f8f8f]">Please provide your details to begin the assessment.</p>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit({name, email}); }} className="space-y-4">
          <input type="text" placeholder="Full Name" required value={name} onChange={e => setName(e.target.value)} className="w-full rounded-[8px] border border-black/[0.08] bg-white px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-black/30 focus:ring-4 focus:ring-black/[0.04] dark:border-white/[0.11] dark:bg-[#050505] dark:text-white dark:placeholder:text-[#666] dark:focus:border-white/30 dark:focus:ring-white/[0.06]" />
          <input type="email" placeholder="Email Address" required value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-[8px] border border-black/[0.08] bg-white px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-black/30 focus:ring-4 focus:ring-black/[0.04] dark:border-white/[0.11] dark:bg-[#050505] dark:text-white dark:placeholder:text-[#666] dark:focus:border-white/30 dark:focus:ring-white/[0.06]" />
          <button type="submit" className="w-full rounded-[6px] bg-black p-3 text-sm font-medium text-white transition-colors hover:bg-[#333] dark:bg-white dark:text-black dark:hover:bg-[#eaeaea]">Start Assessment</button>
        </form>
      </div>
    </div>
  );
};

const Calculator: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [display, setDisplay] = useState('0');
  const [history, setHistory] = useState('');
  const [firstOperand, setFirstOperand] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [waitingForSecondOperand, setWaitingForSecondOperand] = useState(false);

  const handleDigit = (digit: string) => {
    if (history.includes('=')) {
      handleClear();
      setDisplay(digit);
      return;
    }
    if (waitingForSecondOperand) {
      setDisplay(digit);
      setWaitingForSecondOperand(false);
    } else {
      setDisplay(display === '0' ? digit : display.length < 12 ? display + digit : display);
    }
  };

  const handleDecimal = () => {
    if (history.includes('=')) {
      handleClear();
      setDisplay('0.');
      return;
    }
    if (waitingForSecondOperand) {
      setDisplay('0.');
      setWaitingForSecondOperand(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const handleOperator = (nextOperator: string) => {
    const inputValue = parseFloat(display);
    if (operator && !waitingForSecondOperand) {
      const result = calculate(firstOperand!, inputValue, operator);
      setDisplay(String(result));
      if (typeof result === 'number') {
        setFirstOperand(result);
      } else {
        setFirstOperand(null);
      }
      setHistory(`${result} ${nextOperator}`);
    } else {
      setFirstOperand(inputValue);
      setHistory(`${inputValue} ${nextOperator}`);
    }
    setWaitingForSecondOperand(true);
    setOperator(nextOperator);
  };

  const calculate = (first: number, second: number, op: string) => {
    switch (op) {
      case '+':
        return first + second;
      case '-':
        return first - second;
      case '*':
        return first * second;
      case '/':
        return second === 0 ? 'Error' : first / second;
      default:
        return second;
    }
  };

  const handleEquals = () => {
    if (operator && firstOperand !== null) {
      const inputValue = parseFloat(display);
      if (waitingForSecondOperand) return;
      const result = calculate(firstOperand, inputValue, operator);
      setHistory(`${firstOperand} ${operator} ${inputValue} =`);
      setDisplay(String(result));
      setFirstOperand(null);
      setOperator(null);
    }
  };

  const handleClear = () => {
    setDisplay('0');
    setHistory('');
    setFirstOperand(null);
    setOperator(null);
    setWaitingForSecondOperand(false);
  };

  const handleBackspace = () => {
    if (history.includes('=')) return;
    if (waitingForSecondOperand) return;
    setDisplay(d => d.length > 1 ? d.slice(0, -1) : '0');
  };

  const handleToggleSign = () => {
    if (display !== '0') {
      setDisplay(String(parseFloat(display) * -1));
    }
  };

  const handleButtonClick = (btnValue: string) => {
    if (['7', '8', '9', '4', '5', '6', '1', '2', '3', '0'].includes(btnValue)) {
      handleDigit(btnValue);
    } else if (btnValue === '.') {
      handleDecimal();
    } else if (['/', '*', '-', '+'].includes(btnValue)) {
      handleOperator(btnValue);
    } else if (btnValue === '=') {
      handleEquals();
    } else if (btnValue === 'AC') {
      handleClear();
    } else if (btnValue === 'backspace') {
      handleBackspace();
    } else if (btnValue === '+/-') {
      handleToggleSign();
    }
  };

  const getButtonClass = (type: 'operator' | 'number' | 'special') => {
    switch (type) {
      case 'operator':
        return 'bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white';
      case 'special':
        return 'bg-gray-300 dark:bg-gray-400 hover:bg-gray-400 dark:hover:bg-gray-500 active:bg-gray-500 text-black';
      case 'number':
      default:
        return 'bg-gray-600 dark:bg-gray-700 hover:bg-gray-500 dark:hover:bg-gray-600 active:bg-gray-600 text-white';
    }
  };

  const buttonGrid = [
    { label: 'AC', type: 'special', value: 'AC' },
    { label: '+/-', type: 'special', value: '+/-' },
    { label: '⌫', type: 'special', value: 'backspace' },
    { label: '÷', type: 'operator', value: '/' },
    { label: '7', type: 'number', value: '7' },
    { label: '8', type: 'number', value: '8' },
    { label: '9', type: 'number', value: '9' },
    { label: '×', type: 'operator', value: '*' },
    { label: '4', type: 'number', value: '4' },
    { label: '5', type: 'number', value: '5' },
    { label: '6', type: 'number', value: '6' },
    { label: '−', type: 'operator', value: '-' },
    { label: '1', type: 'number', value: '1' },
    { label: '2', type: 'number', value: '2' },
    { label: '3', type: 'number', value: '3' },
    { label: '+', type: 'operator', value: '+' },
    { label: '0', type: 'number', value: '0', className: 'col-span-2' },
    { label: '.', type: 'number', value: '.' },
    { label: '=', type: 'operator', value: '=' },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="bg-black rounded-2xl shadow-2xl border border-gray-800 w-80 select-none animate-in fade-in-90 slide-in-from-bottom-10 duration-300"
      >
        <div className="p-3 flex items-center justify-between">
          <span className="text-xs text-gray-400 font-bold">Calculator</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-300">
              <X size={16} />
          </button>
        </div>
        <div className="p-6 pt-0">
          <div className="text-right font-sans mb-4 h-24 flex flex-col justify-end">
            <div className="text-gray-400 text-xl h-8 truncate">{history}</div>
            <div className="text-white text-6xl font-light break-all leading-tight">{display}</div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {buttonGrid.map(btn => (
              <button
                key={btn.label}
                onClick={() => handleButtonClick(btn.value)}
                className={`h-16 rounded-full text-2xl font-medium transition-colors transform active:scale-95 disabled:opacity-50 ${getButtonClass(btn.type as any)} ${btn.className || ''} ${btn.label === '0' ? 'text-left pl-6' : ''}`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const TakeTest: React.FC = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user, userProfile } = useAuth();
  const { status: liveRateLimitStatus } = useCompanyRateLimits();
  const [test, setTest] = useState<any>(null);
  const [answers, setAnswers] = useState<any>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [codeLang, setCodeLang] = useState('javascript');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [resultData, setResultData] = useState<any>(null);
  const [showPromoPopup, setShowPromoPopup] = useState(false);
  const [markedQuestions, setMarkedQuestions] = useState<Record<number, boolean>>({});
  const [showCalculator, setShowCalculator] = useState(false);
  const [rateLimitError, setRateLimitError] = useState('');
  const [activeCodeTab, setActiveCodeTab] = useState<'problem' | 'code'>('problem');
  
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
  });
  
  const [isFullscreen, setIsFullscreen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
  });
  const [fullscreenEscapes, setFullscreenEscapes] = useState(0);
  const [isTerminated, setIsTerminated] = useState(false);
  const hasEnteredFullscreenRef = useRef(isFullscreen);
  const activeRateLimitResource: RateLimitResource = test?.type === 'coding' ? 'codingAssessments' : 'assessments';
  const activeLimitReached = Boolean(test && isRateLimitReached(liveRateLimitStatus, activeRateLimitResource));

  useEffect(() => {
    if (!activeLimitReached || resultData || submitting) return;
    setIsTerminated(true);
    setRateLimitError(getCandidateRateLimitReachedMessage(activeRateLimitResource));
    hasEnteredFullscreenRef.current = false;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [activeLimitReached, activeRateLimitResource, resultData, submitting]);

  useEffect(() => {
    const checkMobile = () => {
      const isMob = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
      setIsMobile(isMob);
      if (isMob) {
        setIsFullscreen(true);
        hasEnteredFullscreenRef.current = true;
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  const [step, setStep] = useState<'collect-info' | 'test' | 'finish'>(user ? 'test' : 'collect-info');
  const [candidateInfo, setCandidateInfo] = useState({
    name: userProfile?.name || user?.displayName || '',
    email: user?.email || ''
  });

  const handleSubmitRef = useRef<(reason?: string) => void>(() => { });

  useEffect(() => {
    // If user is logged in, skip the info collection step.
    // This handles cases where user/profile data loads after initial render.
    if (user && step === 'collect-info') {
      setCandidateInfo({
        name: userProfile?.name || user.displayName || '',
        email: user.email || ''
      });
      setStep('test');
    }
  }, [user, userProfile, step]);

  useEffect(() => {
    const fetchTest = async () => {
      if (!testId) return;
      const { test: testData } = await rds.getTest(testId);
      if (testData) {
        const resource: RateLimitResource = testData.type === 'coding' ? 'codingAssessments' : 'assessments';
        const rateLimitStatus = await loadCompanyRateLimitStatus();
        if (isRateLimitReached(rateLimitStatus, resource)) {
          setRateLimitError(getCandidateRateLimitReachedMessage(resource));
          return;
        }
        setTest(testData);
        if (testData.duration && !isNaN(Number(testData.duration))) {
          setTimeLeft(testData.duration * 60);
        }
      }
    };
    fetchTest();
  }, [testId]);

  // Fullscreen effect
  useEffect(() => {
    if (step !== 'test' || isTerminated) return;

    const handleFullscreenChange = () => {
      if (isMobile) {
        setIsFullscreen(true);
        hasEnteredFullscreenRef.current = true;
        return;
      }
      const isFS = !!document.fullscreenElement;
      setIsFullscreen(isFS);
      
      if (isFS) {
        hasEnteredFullscreenRef.current = true;
      } else if (hasEnteredFullscreenRef.current) {
        setFullscreenEscapes(prev => {
          const newCount = prev + 1;
          if (newCount >= 3) {
            setIsTerminated(true);
            handleSubmitRef.current?.('terminated');
          }
          return newCount;
        });
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [step, isTerminated, isMobile]);

  // Timer effect
  useEffect(() => {
    if (step !== 'test' || timeLeft === null || timeLeft <= 0 || submitting || !isFullscreen || isTerminated) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [step, timeLeft, submitting, isFullscreen, isTerminated]);

  // Tab switch detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitchCount(prev => prev + 1);
        setShowWarning(true);
        setTimeout(() => setShowWarning(false), 3000);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Anti-cheating: Disable Copy, Cut, Paste, Context Menu, and Keyboard Shortcuts
  useEffect(() => {
    if (step !== 'test') return;

    const handleCopyCutPaste = (e: ClipboardEvent) => {
      e.preventDefault();
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+S
      if (e.ctrlKey || e.metaKey) {
        if (['c', 'v', 'x', 's'].includes(e.key.toLowerCase())) {
          e.preventDefault();
        }
      }
      // Prevent F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
      if (e.key === 'F12') {
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'I', 'j', 'J', 'c', 'C'].includes(e.key)) {
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && ['u', 'U'].includes(e.key)) {
        e.preventDefault();
      }
    };

    const blockDrag = (e: DragEvent) => {
      e.preventDefault();
    };

    document.addEventListener('copy', handleCopyCutPaste);
    document.addEventListener('cut', handleCopyCutPaste);
    document.addEventListener('paste', handleCopyCutPaste);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('dragstart', blockDrag);

    return () => {
      document.removeEventListener('copy', handleCopyCutPaste);
      document.removeEventListener('cut', handleCopyCutPaste);
      document.removeEventListener('paste', handleCopyCutPaste);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('dragstart', blockDrag);
    };
  }, [step]);

  const handleAnswer = (val: any) => {
    setAnswers({ ...answers, [currentQ]: val });
  };

  const handleMarkForReview = () => {
    setMarkedQuestions(prev => ({
      ...prev,
      [currentQ]: !prev[currentQ]
    }));
  };


  const handleSubmit = async (reason?: string) => {
    if (!test || !test.questions) return;
    setSubmitting(true);

    let score = 0;
    let feedback = '';

    if (reason === 'terminated') {
      score = 0;
      feedback = 'Test terminated automatically due to security violations (left fullscreen too many times).';
    } else if (test.type === 'aptitude') {
      let correctCount = 0;
      test.questions.forEach((q: any, i: number) => {
        if (answers[i] === q.correctIndex) correctCount++;
      });
      score = Math.round((correctCount / test.questions.length) * 100);
    } else {
      // AI Grading for Coding (GLM 4.7 Flash via Bedrock Mantle)
      try {
        const prompt = `Evaluate this code submission for the problem: "${test.questions[currentQ].title}".
        Description: ${test.questions[currentQ].description}
        Language: ${codeLang}
        Code:
        ${answers[currentQ] || ''}
        
        Return ONLY a JSON object: { "score": number (0-100), "feedback": "string" }. Score based on correctness and logic.`;

        const evalData = await grokGenerateJson<{ score: number; feedback: string }>(
          "You are a code evaluation assistant. Return only valid JSON.",
          prompt,
          0.2,
          300
        );
        score = evalData.score;
        feedback = evalData.feedback;
      } catch (e) {
        console.error("Grading failed", e);
        score = 0; // Fallback
      }
    }

    // Fetch the full test data again to get passingScore and nextInterviewId
    const { test: fullTestData } = await rds.getTest(testId!);

    console.log('[Assessment] Score:', score, '| Passing Score:', fullTestData.passingScore);
    console.log('[Assessment] Next Interview ID:', fullTestData.nextInterviewId || 'none');
    console.log('[Assessment] External Link:', fullTestData.externalInterviewLink || 'none');

    let submissionStatus = (fullTestData.passingScore && score >= fullTestData.passingScore) ? 'passed' : 'failed';
    if (reason === 'terminated') submissionStatus = 'terminated';
    console.log('[Assessment] Status:', submissionStatus);

    // If passed and there's a next step, generate token and send email
    let emailSent = false;
    let emailError = '';

    if (submissionStatus === 'passed') {
      console.log('[Assessment] Candidate PASSED! Checking for next round...');

      // Internal AI Interview flow
      if (fullTestData.nextInterviewId) {
        console.log('[Assessment] Internal interview flow. Interview ID:', fullTestData.nextInterviewId);
        try {
          // Step 1: Fetch the interview details FIRST (read-only, allowed by rules)
          let interviewData: any = null;
          try {
            const { interview } = await rds.getInterview(fullTestData.nextInterviewId);
            interviewData = interview;
          } catch (interviewErr) {
            console.error('[Assessment] Interview document not found for ID:', fullTestData.nextInterviewId);
            emailError = 'Interview not found in database';
          }
          if (interviewData) {
            const nextRoundAccessCode = interviewData?.accessCode || '';
            const interviewTitle = interviewData?.title || test.title;
            // Build the interview link directly (no token needed for access-code-based interviews)
            const interviewLink = `${window.location.origin}/#/interview/${fullTestData.nextInterviewId}`;
            console.log('[Assessment] Interview title:', interviewTitle, '| Access code:', nextRoundAccessCode);
            console.log('[Assessment] Interview link:', interviewLink);

            // Step 2: Try to create a one-time access token (optional, may fail for anonymous users)
            let finalLink = interviewLink;
            try {
              const { token } = await rds.createAccessToken({
                testId,
                nextInterviewId: fullTestData.nextInterviewId,
                candidateEmail: candidateInfo.email,
                candidateName: candidateInfo.name,
              });
              finalLink = `${interviewLink}?token=${token.id}`;
              console.log('[Assessment] Token created. Final link:', finalLink);
            } catch (tokenErr) {
              console.warn('[Assessment] Token creation failed (permissions), using direct link instead:', tokenErr);
              // Continue with the direct interview link — the candidate can still use the access code
            }

            // Step 3: SEND THE EMAIL (this is the critical part)
            console.log('[Assessment] Sending email to:', candidateInfo.email);
            const emailResult = await sendInterviewInvitations(
              [candidateInfo.email],
              interviewTitle,
              finalLink,
              nextRoundAccessCode
            );

            console.log('[Assessment] Email result:', JSON.stringify(emailResult));
            emailSent = emailResult.success;
            if (!emailResult.success) emailError = emailResult.error || 'Failed to send email';
          }
        } catch (error: any) {
          console.error('[Assessment] Error in internal interview email flow:', error);
          emailError = error.message;
        }

      // External Link flow
      } else if (fullTestData.externalInterviewLink) {
        console.log('[Assessment] External link flow. Link:', fullTestData.externalInterviewLink);
        try {
          const emailResult = await sendInterviewInvitations(
            [candidateInfo.email],
            test.title,
            fullTestData.externalInterviewLink,
            fullTestData.externalAccessCode || ''
          );

          console.log('[Assessment] Email result:', JSON.stringify(emailResult));
          emailSent = emailResult.success;
          if (!emailResult.success) emailError = emailResult.error || 'Failed to send email';
        } catch (error: any) {
          console.error('[Assessment] Error in external interview email flow:', error);
          emailError = error.message;
        }
      } else {
        console.log('[Assessment] No next round configured (no nextInterviewId or externalInterviewLink).');
      }
    } else {
      console.log('[Assessment] Candidate did NOT pass. No email will be sent.');
    }

    console.log('[Assessment] Final email status - Sent:', emailSent, '| Error:', emailError || 'none');

    await assertCompanyRateLimit(test.type === 'coding' ? 'codingAssessments' : 'assessments');
    await rds.createTestSubmission({
      testId,
      candidateUID: user?.uid || candidateInfo.email,
      candidateName: candidateInfo.name,
      candidateEmail: candidateInfo.email,
      answers,
      score,
      feedback,
      status: submissionStatus,
      tabSwitchCount,
      emailSent,
      emailError,
      recruiterUID: fullTestData.recruiterUID || null,
      type: fullTestData.type === 'coding' ? 'coding' : 'aptitude',
    });

    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(e => console.error(e));
    }

    setResultData({
      score,
      feedback,
      questions: test.questions,
      userAnswers: answers,
      type: test.type,
      status: submissionStatus,
      passingScore: fullTestData.passingScore
    });
    setSubmitting(false);

    // trigger promotional popup
    setTimeout(() => {
      setShowPromoPopup(true);
    }, 1500);
  };

  // Update ref in effect to avoid render side-effects
  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  }, [handleSubmit]);

  // Auto-submit on timeout
  useEffect(() => {
    if (timeLeft === 0 && step === 'test') {
      handleSubmitRef.current?.();
    }
  }, [timeLeft, step]);

  if (rateLimitError) return (
    <div className={`min-h-screen flex items-center justify-center p-6 ${isDark ? 'bg-[#050505] text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div role="alert" className="w-full max-w-md rounded-[14px] border border-red-500/25 bg-white p-7 text-center shadow-[0_24px_80px_rgba(0,0,0,0.1)] dark:bg-[#0a0a0a]">
        <AlertTriangle className="mx-auto mb-3 text-red-500" size={28} />
        <h1 className="text-xl font-semibold">Assessment unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-[#a1a1a1]">{rateLimitError}</p>
        <button onClick={() => navigate('/')} className="mt-5 rounded-[6px] bg-black px-4 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-black">Return home</button>
      </div>
    </div>
  );

  if (step === 'collect-info') {
    return <TestInfoForm onSubmit={(info) => {
      setCandidateInfo(info);
      setStep('test');
    }} />;
  }

  const renderFullscreenOverlay = () => {
    if (isMobile) return null;
    if (step === 'test' && !isFullscreen && !isTerminated && !submitting && !resultData) {
      return createPortal(
        <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-md flex items-center justify-center p-6 text-white text-center">
          <div className="relative max-w-md overflow-hidden rounded-[14px] border border-white/[0.11] bg-[#0a0a0a] p-8 shadow-2xl">
            <div className="absolute left-0 top-0 h-px w-full bg-white/20"></div>
            <AlertTriangle size={48} className="mx-auto text-yellow-500 mb-4 animate-pulse" />
            <h2 className="mb-4 text-2xl font-semibold tracking-[-0.03em]">Fullscreen Required</h2>
            <p className="mb-6 text-sm font-medium leading-relaxed text-[#a1a1a1]">
              {hasEnteredFullscreenRef.current 
                ? `You have exited fullscreen mode. The timer is paused. You have ${3 - fullscreenEscapes} escape(s) remaining before automatic termination.`
                : "This assessment must be taken in fullscreen mode to ensure a secure environment. Please enter fullscreen to start."}
            </p>
            <button 
              onClick={async () => {
                try {
                  const docEl = document.documentElement as any;
                  if (docEl.requestFullscreen) {
                    await docEl.requestFullscreen();
                  } else if (docEl.webkitRequestFullscreen) {
                    await docEl.webkitRequestFullscreen();
                  } else if (docEl.msRequestFullscreen) {
                    await docEl.msRequestFullscreen();
                  } else {
                    // Fallback for iOS/mobile devices that don't support fullscreen API
                    setIsFullscreen(true);
                    hasEnteredFullscreenRef.current = true;
                    return;
                  }
                } catch (err) {
                  console.error("Fullscreen error:", err);
                  // If browser denies request or it fails for whatever reason on mobile/desktop, grant fallback
                  // so the user is not permanently stuck.
                  setIsFullscreen(true);
                  hasEnteredFullscreenRef.current = true;
                }
              }}
              className="flex w-full items-center justify-center gap-2 rounded-[6px] bg-white px-6 py-3.5 text-sm font-medium text-black transition-colors hover:bg-[#eaeaea] active:scale-95"
            >
              <Terminal size={18} />
              {hasEnteredFullscreenRef.current ? "Return to Fullscreen" : "Enter Fullscreen & Start"}
            </button>
          </div>
        </div>,
        document.body
      );
    }
    return null;
  };

  if (resultData || step === 'finish') {
    return (
      <div className={`flex min-h-screen flex-col items-center justify-center bg-white p-6 text-[#111] dark:bg-[#050505] dark:text-white ${isDark ? 'dark' : ''}`}>
        <div className="w-full max-w-3xl rounded-[14px] border border-black/[0.08] bg-white p-8 shadow-[0_24px_80px_rgba(0,0,0,0.08)] dark:border-white/[0.11] dark:bg-[#0a0a0a]">
          <div className="text-center mb-8">
            <div className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle size={40} />
            </div>
            <h2 className="mb-2 text-4xl font-semibold tracking-[-0.04em]">Assessment Completed</h2>
            <p className="text-sm text-gray-500 dark:text-[#8f8f8f]">You scored <span className="font-mono text-2xl font-semibold text-black dark:text-white">{resultData.score}%</span></p>
            {resultData.status === 'terminated' ? (
              <div className="mt-4 rounded-[10px] border border-red-500/20 bg-red-500/10 p-4 text-sm font-medium text-red-600 dark:text-red-400">
                Assessment terminated due to security rule violations (left fullscreen).
              </div>
            ) : resultData.passingScore && (
              <div className={`mt-4 rounded-[10px] border p-4 text-sm font-medium ${resultData.status === 'passed' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                {resultData.status === 'passed' 
                  ? `Congratulations, you passed! (Passing score: ${resultData.passingScore}%)`
                  : `You did not meet the passing score of ${resultData.passingScore}%.`
                }
              </div>
            )}
            {resultData.status === 'passed' && (
              <p className="mt-3 text-sm text-gray-500 dark:text-[#8f8f8f]">An email with instructions for the next round has been sent to you.</p>
            )}
          </div>

          {resultData.type === 'coding' && resultData.feedback && (
            <div className="mb-8 rounded-[10px] border border-black/[0.08] bg-black/[0.02] p-6 dark:border-white/[0.11] dark:bg-white/[0.04]">
              <h3 className="mb-2 text-sm font-semibold text-black dark:text-white">AI Feedback</h3>
              <p className="text-sm leading-relaxed text-gray-700 dark:text-[#d4d4d4]">{resultData.feedback}</p>
            </div>
          )}

          {resultData.type === 'aptitude' && (
            <div className="space-y-4 mb-8 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
              <h3 className="border-b border-black/[0.08] pb-2 text-sm font-semibold dark:border-white/[0.11]">Answer Key</h3>
              {resultData.questions.map((q: any, i: number) => {
                const isCorrect = resultData.userAnswers[i] === q.correctIndex;
                return (
                  <div key={i} className={`rounded-[10px] border p-4 ${isCorrect ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-red-500/20 bg-red-500/10'}`}>
                    <p className="font-medium mb-2 text-sm"><span className="opacity-50 mr-2">Q{i + 1}.</span> {q.question}</p>
                    <div className="flex flex-col sm:flex-row sm:justify-between text-xs gap-2">
                      <span className={`font-medium ${isCorrect ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        Your Answer: {q.options[resultData.userAnswers[i]] || 'Skipped'}
                      </span>
                      {!isCorrect && (
                        <span className="text-gray-500 dark:text-[#8f8f8f]">Correct: {q.options[q.correctIndex]}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-center mt-6">
            <button onClick={() => navigate('/')} className="rounded-[6px] bg-black px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-[#333] dark:bg-white dark:text-black dark:hover:bg-[#eaeaea]">
              Return to Portal
            </button>
          </div>

          {/* Promotional Popup for the main platform */}
          {showPromoPopup && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.5s_ease-out]">
              <div className="relative w-full max-w-md transform overflow-hidden rounded-[14px] border border-black/[0.08] bg-white p-8 shadow-2xl animate-[slideInUp_0.4s_ease-out] dark:border-white/[0.11] dark:bg-[#0a0a0a]">
                <div className="relative z-10 text-center">
                  <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-black text-white dark:bg-white dark:text-black">
                    <i className="fa-solid fa-rocket text-2xl"></i>
                  </div>
                  <h3 className="mb-3 text-2xl font-semibold tracking-[-0.03em] text-gray-900 dark:text-white">Assessment Submitted</h3>
                  <p className="mb-6 text-sm leading-relaxed text-gray-600 dark:text-[#a1a1a1]">
                    Your response has been recorded. If this assessment qualifies you for a next round, the recruiter will contact you using the details you provided.
                  </p>
                  
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => navigate('/')}
                      className="w-full rounded-[6px] bg-black py-3.5 text-sm font-medium text-white transition-colors hover:bg-[#333] dark:bg-white dark:text-black dark:hover:bg-[#eaeaea]"
                    >
                      Return to Portal
                    </button>
                    <button 
                      onClick={() => navigate('/submit-review')}
                      className="flex w-full items-center justify-center gap-2 rounded-[6px] border border-black/[0.08] bg-white py-3.5 text-sm font-medium text-black transition-colors hover:bg-black/[0.03] dark:border-white/[0.11] dark:bg-[#050505] dark:text-white dark:hover:bg-white/[0.06]"
                    >
                      <i className="fa-solid fa-star"></i> Give Review
                    </button>
                    <button 
                      onClick={() => setShowPromoPopup(false)}
                      className="w-full rounded-[6px] py-3 text-sm font-medium text-gray-500 transition-colors hover:bg-black/[0.03] hover:text-black dark:text-[#8f8f8f] dark:hover:bg-white/[0.05] dark:hover:text-white"
                    >
                      Maybe Later
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    );
  }

  if (!test) return (
    <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-[#050505] text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className="h-12 w-12 animate-spin rounded-full border-2 border-black/10 border-t-black dark:border-white/10 dark:border-t-white"></div>
    </div>
  );

  if (!test.questions || test.questions.length === 0) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${isDark ? 'bg-[#050505] text-white' : 'bg-gray-50 text-gray-900'}`}>
        <p className="text-xl mb-4">This test has no questions.</p>
        <button onClick={() => navigate('/')} className="text-black underline-offset-4 hover:underline dark:text-white">Go Back</button>
      </div>
    );
  }

  const question = test.questions?.[currentQ];

  if (!question) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-[#050505] text-white' : 'bg-gray-50 text-gray-900'}`}>
        <p>Error loading question.</p>
        <button onClick={() => navigate('/')} className="ml-4 text-black underline-offset-4 hover:underline dark:text-white">Go Back</button>
      </div>
    );
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div 
      className={`min-h-screen select-none bg-white text-[#111] dark:bg-[#050505] dark:text-white ${isDark ? 'dark' : ''} flex flex-col`}
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      {renderFullscreenOverlay()}
      {showCalculator && <Calculator onClose={() => setShowCalculator(false)} />}

      {/* Header */}
      <div className="flex flex-col items-center justify-between gap-4 border-b border-black/[0.08] bg-white p-4 dark:border-white/[0.11] dark:bg-[#050505] sm:flex-row sm:p-5">
        <div className="text-center sm:text-left">
          <h1 className="text-lg font-semibold tracking-[-0.02em] sm:text-xl">{test.title}</h1>
          <p className="text-sm text-gray-500 dark:text-[#8f8f8f]">Question {currentQ + 1} of {test.questions.length}</p>
        </div>
        <div className="flex items-center flex-wrap justify-center gap-2 sm:gap-4">
          {timeLeft !== null && (
            <div className={`flex items-center gap-2 rounded-[6px] border px-3 py-1.5 text-xs font-medium sm:text-sm ${timeLeft < 60 ? 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400' : 'border-black/[0.08] bg-black/[0.03] text-gray-600 dark:border-white/[0.11] dark:bg-white/[0.05] dark:text-[#d4d4d4]'}`}>
              <Clock size={16} /> <span className="hidden sm:inline">Time:</span> {formatTime(timeLeft)}
            </div>
          )}
          <div className="hidden items-center gap-2 rounded-[6px] border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 md:flex sm:text-sm">
            <AlertTriangle size={16} /> No Copy Paste
          </div>
          <button onClick={() => setShowCalculator(true)} className="flex cursor-pointer items-center gap-2 rounded-[6px] border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-black/[0.03] hover:text-black dark:border-white/[0.11] dark:bg-[#0a0a0a] dark:text-[#d4d4d4] dark:hover:bg-white/[0.06] dark:hover:text-white sm:text-sm">
            <CalculatorIcon size={16} /> <span className="hidden sm:inline">Calculator</span>
          </button>
        </div>
      </div>

      {showWarning && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg animate-bounce">
          <AlertTriangle size={16} className="inline mr-2" />
          Tab switching is monitored.
        </div>
      )}

      {/* Content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 md:p-6 min-h-0">
        {/* Main Question Area */}
        <div className="lg:col-span-9 flex flex-col min-h-0">
          {test.type === 'aptitude' ? ( // APTITUDE VIEW
            <div className="rounded-[12px] border border-black/[0.08] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/[0.11] dark:bg-[#0a0a0a] md:p-8">
              <h2 className="mb-6 text-xl font-semibold tracking-[-0.02em]">{question.question || 'Question text missing'}</h2>
              <div className="space-y-3">
                {question.options?.map((opt: string, i: number) => (
                  <button
                    key={i}
                    onClick={() => handleAnswer(i)}
                    className={`w-full rounded-[10px] border p-4 text-left text-sm transition-all ${answers[currentQ] === i
                      ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black'
                      : 'border-black/[0.08] bg-black/[0.02] hover:bg-black/[0.05] dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-white/[0.08]'
                      }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ) : ( // CODING VIEW
            <>
              {/* Desktop Grid View */}
              <div className="hidden lg:grid grid-cols-5 gap-6 h-full min-h-0">
                <div className="lg:col-span-2 h-full">
                  <div className="flex h-full flex-col overflow-hidden rounded-[12px] border border-black/[0.08] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/[0.11] dark:bg-[#0a0a0a]">
                    <div className="flex items-center gap-2 border-b border-black/[0.08] bg-black/[0.02] p-4 dark:border-white/[0.11] dark:bg-white/[0.04]">
                      <FileCode size={18} className="text-black dark:text-white" />
                      <h2 className="font-semibold text-gray-800 dark:text-white">Problem Description</h2>
                    </div>
                    <div className="p-6 overflow-y-auto flex-1 prose dark:prose-invert max-w-none">
                      <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{question.title || 'Problem Title'}</h3>
                      <div className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap mb-6 text-sm leading-relaxed">
                        {question.description || 'No description provided.'}
                      </div>
                      <div className="mt-6">
                        <h4 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-[#8f8f8f]">Test Cases</h4>
                        <div className="rounded-[8px] border border-black/[0.08] bg-black/[0.02] p-4 font-mono text-sm text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300">
                          {question.testCases || 'No test cases provided.'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-3 h-full">
                  <div className="flex h-full flex-col overflow-hidden rounded-[12px] border border-white/[0.11] bg-[#0a0a0a] shadow-2xl">
                    <div className="flex items-center justify-between border-b border-white/[0.11] bg-[#111] px-4 py-2">
                      <div className="flex items-center gap-4">
                        <select value={codeLang} onChange={e => setCodeLang(e.target.value)} className="cursor-pointer rounded-[6px] border border-white/[0.11] bg-white/[0.06] px-2 py-1 text-xs text-gray-200 outline-none transition-colors hover:bg-white/[0.1]">
                          <option value="javascript">JavaScript</option>
                          <option value="python">Python</option>
                          <option value="java">Java</option>
                          <option value="cpp">C++</option>
                        </select>
                      </div>
                      <button className="rounded-[6px] p-1.5 text-gray-400 transition-colors hover:bg-white/[0.08] hover:text-white" title="Settings"><Settings size={14} /></button>
                    </div>
                    <div className="relative flex-1"><textarea value={answers[currentQ] || ''} onChange={e => handleAnswer(e.target.value)} onPaste={e => e.preventDefault()} className="h-full w-full resize-none bg-[#0a0a0a] p-4 font-mono text-sm leading-6 text-gray-300 outline-none" placeholder={`// Write your ${codeLang} solution here...`} spellCheck={false} style={{ tabSize: 2 }} /></div>
                    <div className="border-t border-white/[0.11] bg-[#111]"><div className="flex items-center justify-between px-4 py-2"><div className="flex items-center gap-2 text-xs text-gray-400"><Terminal size={12} /><span>Console</span></div><button className="flex items-center gap-2 rounded-[6px] border border-white/[0.11] bg-white px-4 py-1.5 text-xs font-medium text-black transition-colors hover:bg-[#eaeaea]"><Play size={12} /> Run</button></div></div>
                  </div>
                </div>
              </div>

              {/* Mobile Tab View */}
              <div className="lg:hidden flex flex-col h-full">
                <div className="flex-shrink-0">
                  <div className="flex border-b border-black/[0.08] dark:border-white/[0.11]">
                    <button onClick={() => setActiveCodeTab('problem')} className={`px-4 py-2 text-sm font-medium ${activeCodeTab === 'problem' ? 'border-b-2 border-black text-black dark:border-white dark:text-white' : 'text-gray-500'}`}>Problem</button>
                    <button onClick={() => setActiveCodeTab('code')} className={`px-4 py-2 text-sm font-medium ${activeCodeTab === 'code' ? 'border-b-2 border-black text-black dark:border-white dark:text-white' : 'text-gray-500'}`}>Code</button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 py-4">
                  {activeCodeTab === 'problem' ? (
                    <div className="flex h-full flex-col overflow-hidden rounded-[12px] border border-black/[0.08] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/[0.11] dark:bg-[#0a0a0a]">
                      <div className="p-4 overflow-y-auto flex-1 prose dark:prose-invert max-w-none">
                        <h3 className="text-lg font-bold mb-2 text-gray-900 dark:text-white">{question.title || 'Problem Title'}</h3>
                        <div className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap mb-4 text-sm leading-relaxed">{question.description || 'No description provided.'}</div>
                        <h4 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-[#8f8f8f]">Test Cases</h4>
                        <div className="rounded-[8px] border border-black/[0.08] bg-black/[0.02] p-3 font-mono text-xs text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300">{question.testCases || 'No test cases provided.'}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col overflow-hidden rounded-[12px] border border-white/[0.11] bg-[#0a0a0a] shadow-2xl">
                      <div className="flex items-center justify-between border-b border-white/[0.11] bg-[#111] px-4 py-2">
                        <select value={codeLang} onChange={e => setCodeLang(e.target.value)} className="cursor-pointer rounded-[6px] border border-white/[0.11] bg-white/[0.06] px-2 py-1 text-xs text-gray-200 outline-none transition-colors hover:bg-white/[0.1]">
                          <option value="javascript">JavaScript</option>
                          <option value="python">Python</option>
                          <option value="java">Java</option>
                          <option value="cpp">C++</option>
                        </select>
                        <button className="flex items-center gap-2 rounded-[6px] bg-white px-3 py-1 text-xs font-medium text-black transition-colors hover:bg-[#eaeaea]"><Play size={12} /> Run</button>
                      </div>
                      <div className="relative flex-1"><textarea value={answers[currentQ] || ''} onChange={e => handleAnswer(e.target.value)} onPaste={e => e.preventDefault()} className="h-full w-full resize-none bg-[#0a0a0a] p-4 font-mono text-sm leading-6 text-gray-300 outline-none" placeholder={`// Write your ${codeLang} solution here...`} spellCheck={false} style={{ tabSize: 2 }} /></div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Question Palette */}
        <div className="flex flex-col rounded-[12px] border border-black/[0.08] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/[0.11] dark:bg-[#0a0a0a] lg:col-span-3">
          <h3 className="mb-4 text-center text-sm font-semibold">Question Palette</h3>
          <div className="grid grid-cols-6 sm:grid-cols-5 gap-2 flex-1">
            {test.questions.map((_: any, i: number) => {
              const isAnswered = answers[i] !== undefined && answers[i] !== '';
              const isMarked = markedQuestions[i];
              const isCurrent = currentQ === i;

              let statusClass = 'border-black/[0.08] bg-black/[0.02] text-gray-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-[#8f8f8f]';
              if (isCurrent) statusClass = 'border-black bg-black text-white ring-2 ring-black/10 dark:border-white dark:bg-white dark:text-black dark:ring-white/20';
              else if (isAnswered) statusClass = 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';

              return (
                <button
                  key={i}
                  onClick={() => setCurrentQ(i)}
                  className={`relative flex aspect-square w-full items-center justify-center rounded-[8px] border text-sm font-medium transition-all ${statusClass}`}
                >
                  {i + 1}
                  {isMarked && <Flag size={10} className="absolute -top-1 -right-1 text-red-500" fill="currentColor" />}
                </button>
              );
            })}
          </div>
          <div className="mt-4 space-y-1 text-xs text-gray-500 dark:text-[#8f8f8f]">
            <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full border border-emerald-500/20 bg-emerald-500/10"></div> Answered</div>
            <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full border border-black/[0.08] bg-black/[0.02] dark:border-white/[0.08] dark:bg-white/[0.04]"></div> Not Answered</div>
            <div className="flex items-center gap-2"><Flag size={10} className="text-red-500" fill="currentColor" /> Marked for Review</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-center gap-4 border-t border-black/[0.08] bg-white p-4 dark:border-white/[0.11] dark:bg-[#050505] md:justify-end md:p-5">
        <button onClick={handleMarkForReview} className={`order-last flex items-center gap-2 rounded-[6px] px-6 py-2.5 text-sm font-medium transition-colors md:order-first ${markedQuestions[currentQ] ? 'border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'text-gray-500 hover:bg-black/[0.03] hover:text-black dark:hover:bg-white/[0.05] dark:hover:text-white'}`}>
          <Flag size={16} /> Mark for Review
        </button>
        <div className="flex-grow md:flex-grow-0"></div>
        <div className="flex items-center gap-3">
          {currentQ > 0 && <button onClick={() => setCurrentQ(c => c - 1)} className="rounded-[6px] border border-black/[0.08] bg-white px-6 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-black/[0.03] hover:text-black dark:border-white/[0.11] dark:bg-[#0a0a0a] dark:text-[#d4d4d4] dark:hover:bg-white/[0.06] dark:hover:text-white">Previous</button>}
          {currentQ < test.questions.length - 1 ? (
            <button onClick={() => setCurrentQ(c => c + 1)} className="rounded-[6px] bg-black px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#333] dark:bg-white dark:text-black dark:hover:bg-[#eaeaea]">Next</button>
          ) : (
            <button onClick={() => handleSubmit()} disabled={submitting} className="rounded-[6px] bg-black px-8 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#333] disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-[#eaeaea]">{submitting ? 'Submitting...' : 'Submit Test'}</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TakeTest;
