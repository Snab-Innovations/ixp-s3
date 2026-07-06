import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, addDoc, collection, serverTimestamp, updateDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { uploadToCloudinary, generateInterviewQuestions, requestTranscription, fetchTranscriptText, generateFeedback } from '../services/api';
import { speak } from '../lib/tts';
import { Interview, InterviewState } from '../types';
import { createPortal } from 'react-dom';
import { LanguageSelector } from './LanguageSelector';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import DayNightToggle from '../components/DayNightToggle';
import * as pdfjsLib from 'pdfjs-dist';

// Setup PDF.js worker to enable PDF parsing
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// --- Types ---
type WizardStep = 'validating' | 'welcome' | 'enter-code' | 'collect-info' | 'show-jd' | 'instructions' | 'setup' | 'interview' | 'processing' | 'finish';
type CandidateInfo = { 
  name: string; 
  email: string; 
  phone: string; 
  gender: string;
  dob: string;
  age: string;
  maritalStatus: string;
  currentCity: string;
  nativePlace: string;
  qualificationBasic: string;
  qualificationPG: string;
  totalExperienceYears: string;
  totalExperienceMonths: string;
  currentCompanyName: string;
  designation: string;
  currentSalary: string;
  noticePeriodDays: string;
  reasonForJobChange: string;
  resumeUpdated: string;
  highlightedSkillsForJob: string;
  isFresher: boolean;
  language: string;
};

// --- Sarvam AI Transcription Helper ---
const transcribeWithSarvam = async (audioBlob: Blob, languageCode: string): Promise<string> => {
  // IMPORTANT: Storing API keys on the client-side is a major security risk.
  // This should be moved to a secure backend environment in a production application.
  // The key is now read from environment variables.
  const SARVAM_API_KEY = import.meta.env.VITE_SARVAM_API_KEY;

  const langMap: { [key: string]: string } = {
      en: 'en-IN',
      hi: 'hi-IN',
      mr: 'mr-IN'
  };
  const apiLangCode = langMap[languageCode] || 'en-IN';

  const formData = new FormData();
  // NOTE: The Sarvam API might expect a specific audio format like WAV.
  // MediaRecorder in most browsers produces WebM or Ogg. This might require server-side conversion if the API doesn't support it.
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('language_code', apiLangCode);
  formData.append('model', 'saaras:v3');

  try {
      const response = await fetch('https://api.sarvam.ai/speech-to-text', {
          method: 'POST',
          headers: { 'api-subscription-key': SARVAM_API_KEY },
          body: formData
      });
      const data = await response.json();
      if (response.ok) return data.transcript || "No speech detected.";
      throw new Error(data.message || "API Error during transcription");
  } catch (err) { 
      console.error("Transcription fetch error:", err);
      return `Error: ${(err as Error).message}`;
  }
}

const parsePdfToText = async (fileOrBlob: File | Blob): Promise<string> => {
  const MAX_PDF_PAGES = 3;
  const MAX_PDF_TEXT_CHARS = 6000;

  try {
    const arrayBuffer = await fileOrBlob.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    let fullText = '';
    const pagesToParse = Math.min(pdf.numPages, MAX_PDF_PAGES);

    for (let i = 1; i <= pagesToParse; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + ' ';

      if (fullText.length >= MAX_PDF_TEXT_CHARS) {
        break;
      }
    }

    return fullText.trim().slice(0, MAX_PDF_TEXT_CHARS);
  } catch (error) {
    console.error("PDF parsing error:", error);
    // Return empty string on failure, the base64 will be used as a fallback
    return '';
  }
};

const QUESTION_TIME_MS = 2 * 60 * 1000; // 2 minutes
const TRANSCRIPT_POLL_ATTEMPTS = 20;
const TRANSCRIPT_POLL_DELAY_MS = 3000;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const extractResumeText = async (fileOrBlob: File | Blob): Promise<string> => {
  if (fileOrBlob.type === 'application/pdf') {
    return parsePdfToText(fileOrBlob);
  }

  if (fileOrBlob.type.startsWith('text/')) {
    return (await fileOrBlob.text()).slice(0, 6000);
  }

  return '';
};

const getBlobAsBase64 = (blob: Blob): Promise<string> => (
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
  })
);

const getFileAsBase64 = (file: File): Promise<{ base64: string; url: string }> => (
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const url = reader.result as string;
      resolve({ base64: url.split(',')[1], url });
    };
    reader.onerror = error => reject(error);
  })
);

const getFullscreenElement = (): Element | null => {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };

  return doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement || null;
};

// --- Component: Tic-Tac-Toe (Glassmorphic & Dark Mode) ---
const TicTacToe: React.FC = () => {
  const [board, setBoard] = useState<(string | null)[]>(Array(9).fill(null));
  const [isXNext, setIsXNext] = useState(true);
  const [winner, setWinner] = useState<string | null>(null);

  const checkWinner = (squares: (string | null)[]) => {
    const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    for (let i = 0; i < lines.length; i++) {
      const [a, b, c] = lines[i];
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) return squares[a];
    }
    return null;
  };

  const handleClick = (i: number) => {
    if (winner || board[i] || !isXNext) return;
    const newBoard = [...board];
    newBoard[i] = 'X';
    setBoard(newBoard);
    setIsXNext(false);
    const w = checkWinner(newBoard);
    if (w) setWinner(w);
  };

  useEffect(() => {
    if (!isXNext && !winner) {
      const timer = setTimeout(() => {
        const available = board.map((v, i) => v === null ? i : null).filter(v => v !== null);
        if (available.length > 0) {
          const random = available[Math.floor(Math.random() * available.length)];
          const newBoard = [...board];
          newBoard[random as number] = 'O';
          setBoard(newBoard);
          setIsXNext(true);
          const w = checkWinner(newBoard);
          if (w) setWinner(w);
        }
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isXNext, winner, board]);

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/80 dark:bg-gray-900/90 backdrop-blur-md rounded-xl transition-all duration-300">
      <h3 className="text-lg sm:text-2xl font-bold text-gray-800 dark:text-white mb-2 sm:mb-4">
        {winner ? (winner === 'X' ? 'You Won!' : 'AI Won!') : (isXNext ? 'Your Turn (X)' : 'AI Thinking...')}
      </h3>
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mb-3 sm:mb-6">
        {board.map((cell, i) => (
          <button
            key={i}
            onClick={() => handleClick(i)}
            disabled={!!cell || !!winner || !isXNext}
            className={`w-14 h-14 sm:w-20 sm:h-20 text-xl sm:text-3xl font-bold flex items-center justify-center rounded-lg sm:rounded-xl shadow-inner transition-all 
              ${cell === 'X' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400' :
                cell === 'O' ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400' :
                  'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700'}`}
          >
            {cell}
          </button>
        ))}
      </div>
      {winner ? (
        <button onClick={() => { setBoard(Array(9).fill(null)); setIsXNext(true); setWinner(null); }} className="bg-primary hover:bg-primary-dark text-white px-4 sm:px-6 py-2 rounded-lg font-bold shadow-lg transition-colors text-sm sm:text-base">
          Play Again
        </button>
      ) : (
        <p className="text-gray-500 dark:text-gray-400 animate-pulse font-medium text-xs sm:text-base">Uploading... Play while you wait!</p>
      )}
    </div>
  );
};

// --- Component: Candidate Info Form ---
const CandidateInfoForm: React.FC<{
  jobTitle?: string;
  interviewId: string;
  onBackToWelcome: () => void;
  onSubmit: (info: CandidateInfo, file: File | null, existingResumeUrl?: string, cloudinaryUrl?: string) => void;
  errorMsg: string | null;
  user: any;
  userProfile: any;
}> = ({ jobTitle, interviewId, onBackToWelcome, onSubmit, errorMsg: initialError, user, userProfile }) => {
  const [name, setName] = useState(userProfile?.fullname || userProfile?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(userProfile?.phone || '');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [uploadedResumeUrl, setUploadedResumeUrl] = useState<string | null>(null);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);
  const [showDuplicatePopup, setShowDuplicatePopup] = useState(false);
  const { isDark } = useTheme();
  const [language, setLanguage] = useState('en');

  // Debounced check in Firestore to see if this email or phone is already used
  useEffect(() => {
    if (!email.trim() && !phone.trim()) return;

    let isCancelled = false;
    const checkDuplicate = async () => {
      try {
        const attemptsRef = collection(db, 'interviews', interviewId, 'attempts');

        // Check email
        if (email.trim()) {
          const emailQuery = query(attemptsRef, where('candidateInfo.email', '==', email.trim()));
          const emailSnap = await getDocs(emailQuery);
          if (!emailSnap.empty && !isCancelled) {
            const hasReattempt = emailSnap.docs.some(doc => doc.data().allowReattempt === true);
            if (!hasReattempt) {
              setShowDuplicatePopup(true);
              return;
            }
          }
        }

        // Check phone
        if (phone.trim()) {
          const phoneQuery = query(attemptsRef, where('candidateInfo.phone', '==', phone.trim()));
          const phoneSnap = await getDocs(phoneQuery);
          if (!phoneSnap.empty && !isCancelled) {
            const hasReattempt = phoneSnap.docs.some(doc => doc.data().allowReattempt === true);
            if (!hasReattempt) {
              setShowDuplicatePopup(true);
              return;
            }
          }
        }
      } catch (err) {
        console.error("Auto duplicate check failed:", err);
      }
    };

    const timer = setTimeout(() => {
      checkDuplicate();
    }, 600);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [email, phone, interviewId]);

  // Pre-interview questionnaire states
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState('2000-01-01');
  const [maritalStatus, setMaritalStatus] = useState('');
  const [currentCity, setCurrentCity] = useState('');
  const [nativePlace, setNativePlace] = useState('');
  const [qualificationBasic, setQualificationBasic] = useState('');
  const [qualificationPG, setQualificationPG] = useState('');
  const [totalExperienceYears, setTotalExperienceYears] = useState('');
  const [totalExperienceMonths, setTotalExperienceMonths] = useState('');
  const [currentCompanyName, setCurrentCompanyName] = useState('');
  const [designation, setDesignation] = useState('');
  const [currentSalary, setCurrentSalary] = useState('');
  const [noticePeriodDays, setNoticePeriodDays] = useState('');
  const [reasonForJobChange, setReasonForJobChange] = useState('');
  const [resumeUpdated, setResumeUpdated] = useState('yes');
  const [highlightedSkillsForJob, setHighlightedSkillsForJob] = useState('');
  const [manualSkillInput, setManualSkillInput] = useState('');
  const [isFresher, setIsFresher] = useState(false);
  const [formStep, setFormStep] = useState(1);

  const existingResumeUrl = userProfile?.resumeURL || userProfile?.resumeUrl;

  useEffect(() => {
      setErrorMsg(initialError);
  }, [initialError]);

  const handleNext = () => {
    if (formStep === 1) {
      if (!name || !email || !phone || !gender || !dob || !maritalStatus || !currentCity || !nativePlace) {
        setErrorMsg("Please fill in all contact and personal details.");
        return;
      }
      setErrorMsg(null);
      setFormStep(2);
    } else if (formStep === 2) {
      if (!qualificationBasic) {
        setErrorMsg("Please provide your basic qualification.");
        return;
      }
      if (!isFresher) {
        if (!totalExperienceYears || !totalExperienceMonths || !currentCompanyName || !designation || !currentSalary || !noticePeriodDays || !reasonForJobChange) {
          setErrorMsg("Please fill in all professional details.");
          return;
        }
      }
      setErrorMsg(null);
      setFormStep(3);
    }
  };

  const handlePrevious = () => {
    setFormStep(prev => prev - 1);
    setErrorMsg(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resumeFile && !uploadedResumeUrl && !existingResumeUrl && !userProfile) {
      setErrorMsg("Please upload your resume.");
      return;
    }

    if (isUploadingResume) {
      setErrorMsg("Please wait until the resume finishes uploading.");
      return;
    }

    let calculatedAge = '';
    if (dob) {
      const today = new Date();
      const birthDate = new Date(dob);
      let ageNum = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          ageNum--;
      }
      calculatedAge = ageNum.toString();
    }

    setErrorMsg(null);

    onSubmit({ 
      name, email, phone, gender, dob, age: calculatedAge, maritalStatus, currentCity, nativePlace,
      qualificationBasic, qualificationPG, totalExperienceYears, totalExperienceMonths,
      currentCompanyName, designation, currentSalary, noticePeriodDays, reasonForJobChange,
      resumeUpdated, highlightedSkillsForJob, isFresher, language
    }, resumeFile, existingResumeUrl, uploadedResumeUrl || undefined);
  };

  return (
      <div className="candidate-form-shell w-11/12 md:max-w-2xl lg:max-w-3xl bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 relative">
        {showDuplicatePopup && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[11000] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 max-w-sm w-full border border-gray-100 dark:border-gray-700 shadow-2xl text-center animate-in scale-in duration-300">
              <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-950/40 text-red-500 flex items-center justify-center mb-5 mx-auto">
                <i className="fas fa-exclamation-triangle text-3xl"></i>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2.5">Attempt Blocked</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
                You have already taken this interview. Only one attempt is allowed.
              </p>
              <button 
                type="button"
                onClick={() => {
                  setShowDuplicatePopup(false);
                  onBackToWelcome();
                }}
                className="w-full py-3.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold rounded-xl shadow-lg shadow-red-500/20 active:scale-98 transition-all flex items-center justify-center"
              >
                OK
              </button>
            </div>
          </div>
        )}
        <div className="candidate-form-header text-center mb-6">
          <div className="candidate-form-kicker inline-block px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-full mb-3 border border-blue-100 dark:border-blue-800">
            {jobTitle || 'AI Interview'}
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Candidate details</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Confirm the required information to continue.</p>
        </div>
        
        {userProfile && (
          <div className="candidate-profile-card mb-6 p-5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/50 shadow-sm relative overflow-hidden">
             <div className="flex items-center gap-3 mb-4">
               <div className="candidate-profile-avatar bg-blue-600 dark:bg-blue-500 text-white w-10 h-10 rounded-xl shadow-md flex items-center justify-center font-black text-lg">
                 {name.charAt(0).toUpperCase()}
               </div>
               <div>
                 <p className="text-sm text-blue-900 dark:text-blue-200 font-bold mb-0">Profile loaded</p>
                 <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">These details will guide the interview.</p>
               </div>
             </div>

             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
               <div className="candidate-profile-meta bg-white/60 dark:bg-black/20 p-2.5 rounded-lg border border-blue-100/50 dark:border-white/5">
                 <p className="text-[10px] uppercase font-bold text-blue-500/80 dark:text-blue-400 mb-1">Stated Experience</p>
                 <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                   {userProfile.experience ? `${userProfile.experience} Years` : 'Fresher / 0 Years'}
                 </p>
               </div>
               
               <div className="candidate-profile-meta bg-white/60 dark:bg-black/20 p-2.5 rounded-lg border border-blue-100/50 dark:border-white/5">
                 <p className="text-[10px] uppercase font-bold text-blue-500/80 dark:text-blue-400 mb-1">Top Skills</p>
                 <div className="flex flex-wrap gap-1">
                   {userProfile.skills && userProfile.skills.length > 0 ? (
                     userProfile.skills.slice(0, 3).map((skill: string, i: number) => (
                       <span key={i} className="candidate-skill-chip px-1.5 py-0.5 bg-blue-100 dark:bg-blue-800/40 text-[10px] rounded font-medium text-blue-700 dark:text-blue-300 whitespace-nowrap">
                         {skill}
                       </span>
                     ))
                   ) : (
                     <span className="text-xs font-medium text-gray-500">Not specified</span>
                   )}
                   {userProfile.skills && userProfile.skills.length > 3 && (
                     <span className="text-[10px] text-gray-500 font-medium self-center">+{userProfile.skills.length - 3}</span>
                   )}
                 </div>
               </div>
             </div>
          </div>
        )}

        {errorMsg && <div className="candidate-form-alert mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">{errorMsg}</div>}
        
        <form onSubmit={handleSubmit} className="candidate-form-body space-y-4">
          {/* Step Indicator */}
          <div className="flex justify-between items-center mb-6">
             <div className={`h-2 flex-1 rounded-l-full ${formStep >= 1 ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}></div>
             <div className={`h-2 flex-1 mx-1 ${formStep >= 2 ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}></div>
             <div className={`h-2 flex-1 rounded-r-full ${formStep >= 3 ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}></div>
          </div>

          {formStep === 1 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Full Name <span className="text-red-500">*</span></label>
                  <input type="text" placeholder="John Doe" required value={name} onChange={e => setName(e.target.value)} className="w-full p-3 border border-gray-200 rounded-xl dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Email Address <span className="text-red-500">*</span></label>
                  <input type="email" placeholder="Email Address" required value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 border border-gray-200 rounded-xl dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Contact Number <span className="text-red-500">*</span></label>
                <input type="tel" required placeholder="Contact Number" value={phone} onChange={e => setPhone(e.target.value)} className="w-full p-3 border border-gray-200 rounded-xl dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              <div className="candidate-form-section bg-gray-50 dark:bg-gray-900/30 p-5 rounded-xl border border-gray-200 dark:border-gray-700 space-y-4 mt-6">
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider mb-3">Personal Details</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   <div>
                     <label className="text-xs font-bold text-gray-500 block mb-1">Gender <span className="text-red-500">*</span></label>
                     <select required value={gender} onChange={e => setGender(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm">
                        <option value="" disabled>Select</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                     </select>
                   </div>
                   <div>
                     <label className="text-xs font-bold text-gray-500 block mb-1">Date of Birth <span className="text-red-500">*</span></label>
                     <input type="date" required value={dob} onChange={e => setDob(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                   </div>
                   <div>
                     <label className="text-xs font-bold text-gray-500 block mb-1">Marital Status <span className="text-red-500">*</span></label>
                     <select required value={maritalStatus} onChange={e => setMaritalStatus(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm">
                        <option value="" disabled>Select</option>
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                        <option value="Divorced">Divorced</option>
                        <option value="Widowed">Widowed</option>
                     </select>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div>
                     <label className="text-xs font-bold text-gray-500 block mb-1">Current City <span className="text-red-500">*</span></label>
                     <input type="text" placeholder="e.g. Mumbai" required value={currentCity} onChange={e => setCurrentCity(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                   </div>
                   <div>
                     <label className="text-xs font-bold text-gray-500 block mb-1">Native Place <span className="text-red-500">*</span></label>
                     <input type="text" placeholder="e.g. Pune" required value={nativePlace} onChange={e => setNativePlace(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                   </div>
                </div>
              </div>
            </div>
          )}

          {formStep === 2 && (
            <div className="candidate-form-section bg-gray-50 dark:bg-gray-900/30 p-5 rounded-xl border border-gray-200 dark:border-gray-700 space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider mb-3">Qualifications</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                   <label className="text-xs font-bold text-gray-500 block mb-1">Basic Qualification (Year) <span className="text-red-500">*</span></label>
                   <input type="text" placeholder="e.g. B.Tech (2020)" value={qualificationBasic} onChange={e => setQualificationBasic(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                 </div>
                 <div>
                   <label className="text-xs font-bold text-gray-500 block mb-1">Post Graduation (Year)</label>
                   <input type="text" placeholder="e.g. MBA (2022)" value={qualificationPG} onChange={e => setQualificationPG(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                 </div>
              </div>

              <div className="flex items-center justify-between mb-3 mt-6">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider">Professional Details</h3>
                  <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={isFresher} onChange={e => setIsFresher(e.target.checked)} className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700" />
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">I am a Fresher</span>
                  </label>
              </div>
              
              {!isFresher && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">Total Work Experience <span className="text-red-500">*</span></label>
                        <div className="flex gap-2">
                           <input type="number" min="0" placeholder="Years" value={totalExperienceYears} onChange={e => setTotalExperienceYears(e.target.value)} className="w-1/2 p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                           <input type="number" min="0" max="11" placeholder="Months" value={totalExperienceMonths} onChange={e => setTotalExperienceMonths(e.target.value)} className="w-1/2 p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                        </div>
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">Current Company Name <span className="text-red-500">*</span></label>
                       <input type="text" placeholder="Company Name" value={currentCompanyName} onChange={e => setCurrentCompanyName(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                     </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">Designation <span className="text-red-500">*</span></label>
                       <input type="text" placeholder="e.g. Software Engineer" value={designation} onChange={e => setDesignation(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">Current Salary (CTC Per annum) <span className="text-red-500">*</span></label>
                       <input type="text" placeholder="e.g. 6.5 LPA" value={currentSalary} onChange={e => setCurrentSalary(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                     </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">Notice Period (in number of days) <span className="text-red-500">*</span></label>
                       <input type="number" min="0" placeholder="e.g. 30" value={noticePeriodDays} onChange={e => setNoticePeriodDays(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">Reason for job change <span className="text-red-500">*</span></label>
                       <select value={reasonForJobChange} onChange={e => setReasonForJobChange(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm">
                          <option value="" disabled>Select reason</option>
                          <option value="Salary Growth">Salary Growth</option>
                          <option value="Professional Development">Professional Development</option>
                          <option value="Job location not suitable">Job location not suitable</option>
                          <option value="Job Timing not suitable">Job Timing not suitable</option>
                          <option value="Company shut down / Layoff">Company shut down / Layoff</option>
                          <option value="Currently not working">Currently not working</option>
                          <option value="Prefer not to disclose">Prefer not to disclose</option>
                       </select>
                     </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {formStep === 3 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="candidate-form-section bg-gray-50 dark:bg-gray-900/30 p-5 rounded-xl border border-gray-200 dark:border-gray-700 space-y-4">
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider mb-3">Additional Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div>
                     <label className="text-xs font-bold text-gray-500 block mb-1">Upload updated resume: <span className="text-red-500">*</span></label>
                     <select required value={resumeUpdated} onChange={e => setResumeUpdated(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm">
                        <option value="" disabled>Select</option>
                        <option value="Yes">Yes, it is updated</option>
                        <option value="No">No, but I will update it later</option>
                     </select>
                   </div>
                   <div>
                     <label className="text-xs font-bold text-gray-500 block mb-1">Select skills as per the JD (Optional)</label>
                     <div className="flex flex-col gap-2">
                       <select 
                         className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm text-gray-500"
                         onChange={(e) => {
                           if (e.target.value) {
                             const currentSkills = highlightedSkillsForJob ? highlightedSkillsForJob.split(',').map(s => s.trim()).filter(s => s) : [];
                             if (!currentSkills.includes(e.target.value)) {
                               setHighlightedSkillsForJob([...currentSkills, e.target.value].join(', '));
                             }
                             e.target.value = "";
                           }
                         }}
                       >
                         <option value="">-- Add predefined skills --</option>
                         {["JavaScript", "TypeScript", "React", "Node.js", "Python", "Java", "C#", "C++", "SQL", "MongoDB", "AWS", "Docker", "Kubernetes", "Machine Learning", "Data Science", "UI/UX Design", "Project Management", "Digital Marketing", "Sales", "Customer Support", "Accounting", "Tally", "ERP", "SAP"].map(skill => (
                           <option key={skill} value={skill}>{skill}</option>
                         ))}
                       </select>
                       <div className="flex gap-2">
                         <input
                           type="text"
                           value={manualSkillInput}
                           onChange={e => setManualSkillInput(e.target.value)}
                           onKeyDown={e => {
                             if (e.key === 'Enter') {
                               e.preventDefault();
                               const val = manualSkillInput.trim();
                               if (val) {
                                 const currentSkills = highlightedSkillsForJob ? highlightedSkillsForJob.split(',').map(s => s.trim()).filter(s => s) : [];
                                 if (!currentSkills.includes(val)) {
                                   setHighlightedSkillsForJob([...currentSkills, val].join(', '));
                                 }
                                 setManualSkillInput('');
                               }
                             }
                           }}
                           placeholder="Or type a skill and click Add"
                           className="flex-1 p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                         />
                         <button
                           type="button"
                           onClick={() => {
                             const val = manualSkillInput.trim();
                             if (val) {
                               const currentSkills = highlightedSkillsForJob ? highlightedSkillsForJob.split(',').map(s => s.trim()).filter(s => s) : [];
                               if (!currentSkills.includes(val)) {
                                 setHighlightedSkillsForJob([...currentSkills, val].join(', '));
                               }
                               setManualSkillInput('');
                             }
                           }}
                           className="px-4 py-2.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-bold rounded-lg border border-blue-200 dark:border-blue-800 hover:bg-blue-200 dark:hover:bg-blue-800/50 transition-colors whitespace-nowrap text-sm"
                         >
                           Add
                         </button>
                       </div>
                       {highlightedSkillsForJob && (
                         <div className="flex flex-wrap gap-2 mt-1">
                           {highlightedSkillsForJob.split(',').map(s => s.trim()).filter(s => s).map(skill => (
                             <span key={skill} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                               {skill}
                               <button 
                                 type="button" 
                                 onClick={() => {
                                   const currentSkills = highlightedSkillsForJob.split(',').map(s => s.trim()).filter(s => s);
                                   setHighlightedSkillsForJob(currentSkills.filter(s => s !== skill).join(', '));
                                 }}
                                 className="text-gray-400 hover:text-red-500 focus:outline-none transition-colors"
                               >
                                 <i className="fas fa-times text-[10px]"></i>
                               </button>
                             </span>
                           ))}
                         </div>
                       )}
                     </div>
                   </div>
                </div>
              </div>
              
              {/* Hide Resume Upload entirely if the user is signed in (we use their Profile Box instead) */}
              {!userProfile && (
                <div className="candidate-resume-section bg-gray-50 dark:bg-gray-900/30 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Resume Data</label>
                  <label
                    htmlFor="resume-upload-input"
                    className={`candidate-upload-trigger w-full font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 border cursor-pointer ${isUploadingResume ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-600 border-yellow-200' : uploadedResumeUrl ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-200 dark:hover:bg-blue-800/60'} ${isUploadingResume ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    <i className={isUploadingResume ? "fas fa-spinner fa-spin" : uploadedResumeUrl ? "fas fa-check-circle" : "fas fa-cloud-upload-alt"}></i>
                    <span>{isUploadingResume ? 'Uploading to Cloudinary...' : uploadedResumeUrl ? 'Resume Uploaded Successfully' : resumeFile ? resumeFile.name : 'Browser/Upload Resume (PDF/Word)'}</span>
                  </label>
                  <input
                    id="resume-upload-input"
                    type="file"
                    accept=".pdf,.docx,.doc"
                    className="hidden"
                    disabled={isUploadingResume}
                    onChange={async (e) => {
                      if (e.target.files && e.target.files[0]) {
                        const file = e.target.files[0];
                        setResumeFile(file);
                        setIsUploadingResume(true);
                        try {
                          const url = await uploadToCloudinary(file, 'auto');
                          setUploadedResumeUrl(url);
                        } catch (err) {
                          setErrorMsg("Failed to immediately upload to Cloudinary. You can still proceed.");
                        } finally {
                          setIsUploadingResume(false);
                        }
                      }
                    }}
                  />
                  
                  {uploadedResumeUrl && (
                      <div className="mt-3 flex items-center justify-center flex-col">
                           <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Direct Cloudinary Link:</p>
                           <a href={uploadedResumeUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline text-center truncate px-2 w-full flex items-center justify-center gap-1">
                               <i className="fas fa-external-link-alt py-1"></i> View Uploaded Resume
                           </a>
                      </div>
                  )}
                  <p className="text-xs text-gray-400 mt-3 text-center">Required for AI generated questions.</p>
                  </div>
              )}

              {/* The label is now inside the LanguageSelector component */}
              <LanguageSelector selectedLanguage={language} onLanguageChange={setLanguage} className="pt-2" />
            </div>
          )}

          <div className="flex gap-4 mt-6">
            {formStep > 1 && (
              <button 
                type="button" 
                onClick={handlePrevious} 
                className="w-1/3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 p-3.5 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Previous
              </button>
            )}
            
            {formStep < 3 ? (
              <button 
                type="button" 
                onClick={handleNext} 
                className={`${formStep > 1 ? 'w-2/3' : 'w-full'} bg-blue-600 text-white p-3.5 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-all transform hover:-translate-y-0.5`}
              >
                Next Step
              </button>
            ) : (
              <button 
                type="submit" 
                className="w-2/3 bg-green-600 text-white p-3.5 rounded-xl font-bold hover:bg-green-700 shadow-lg shadow-green-500/30 transition-all transform hover:-translate-y-0.5"
              >
                Proceed to Interview
              </button>
            )}
          </div>
        </form>
      </div>
  );
};

// --- Component: Virtual Avatar Instructions ---


const InterviewReadinessOnboarding: React.FC<{
  interview: Interview;
  state: InterviewState;
  onStart: () => void;
}> = ({ interview, state, onStart }) => {
  type NetworkState = {
    online: boolean;
    downlink: number | null;
    effectiveType: string | null;
    rtt: number | null;
    latency: number | null;
    quality: 'checking' | 'strong' | 'fair' | 'weak' | 'danger' | 'offline';
    message: string;
  };

  const micPrompt = 'My microphone is clear and I am ready to begin this AI interview.';
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const speechTimeoutRef = useRef<number | null>(null);
  const micStageArmedRef = useRef(false);
  const [activeStage, setActiveStage] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [voiceDetected, setVoiceDetected] = useState(false);
  const [networkState, setNetworkState] = useState<NetworkState>({
    online: navigator.onLine,
    downlink: null,
    effectiveType: null,
    rtt: null,
    latency: null,
    quality: navigator.onLine ? 'checking' : 'offline',
    message: navigator.onLine ? 'Checking your connection...' : 'You are offline.',
  });

  const stages = [
    {
      title: 'Check your camera',
      speech: [
        'First, let us check your camera.',
        'Keep your face inside the frame, sit straight, and look at the camera.',
      ],
    },
    {
      title: 'Check your microphone',
      speech: [
        'Now let us check your microphone.',
        'Please read the line on screen so I can confirm your microphone is working.',
      ],
    },
    {
      title: 'Check your internet',
      speech: [
        'Now I am checking your internet connection.',
        'If the connection is weak you can still continue.',
      ],
    },
    {
      title: 'Before you start',
      speech: [
        `Your AI interview for ${interview.title} is ready.`,
        'Answer clearly, stay in fullscreen, and speak one answer at a time.',
      ],
    },
  ] as const;

  const summaryPoints = [
    `Role: ${interview.title}`,
    `${state.questions.length} question${state.questions.length === 1 ? '' : 's'} will be asked.`,
    'Each answer gets 2 minutes.',
    'Stay focused and speak clearly.',
  ];

  const stopPreview = () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (speechTimeoutRef.current !== null) {
      window.clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }

    speak.stop();

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }

    analyserRef.current = null;

    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach(track => track.stop());
      previewStreamRef.current = null;
    }
  };

  const measureNetwork = async () => {
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    const effectiveType = typeof connection?.effectiveType === 'string' ? connection.effectiveType : null;
    const rtt = typeof connection?.rtt === 'number' ? connection.rtt : null;

    if (!navigator.onLine) {
      setNetworkState({
        online: false,
        downlink: null,
        effectiveType,
        rtt,
        latency: null,
        quality: 'offline',
        message: 'You are offline. Please check your internet connection.',
      });
      return;
    }

    setNetworkState(prev => ({
      ...prev,
      online: true,
      effectiveType,
      rtt,
      quality: 'checking',
      message: 'Testing your internet speed...',
    }));

    try {
      const start = performance.now();
      // Using a slightly larger image (approx ~20KB) to test speed more accurately.
      // 20KB = 160Kb. To get 2Mbps (2000Kbps), it should download in less than 80ms.
      const response = await fetch(`https://res.cloudinary.com/dvzxfbcsd/image/upload/v1700000000/sample.jpg?cacheBust=${Date.now()}`);
      
      const blob = await response.blob();
      const end = performance.now();
      const durationSec = (end - start) / 1000;
      
      const fileSizeBits = blob.size * 8;
      let calculatedMbps = (fileSizeBits / durationSec) / 1000000;
      
      // Fallback to navigator.connection if download was instant (cache hit etc)
      if (durationSec < 0.05 && connection?.downlink) {
          calculatedMbps = connection.downlink;
      }

      let quality: NetworkState['quality'] = 'strong';
      let message = 'Connection is strong and ready.';

      if (calculatedMbps < 2) {
        quality = 'weak';
        message = 'Connection is weak (below 2Mbps), but you can still proceed.';
      } else if (calculatedMbps < 5) {
        quality = 'fair';
        message = 'Connection is fair (above 2Mbps). You can proceed.';
      }

      setNetworkState({
        online: true,
        downlink: parseFloat(calculatedMbps.toFixed(2)),
        effectiveType,
        rtt,
        latency: Math.round(end - start),
        quality,
        message,
      });
    } catch (error) {
      console.error("Network speed test failed:", error);
      // If the fetch fails entirely, assume offline or very bad connection
      setNetworkState({
        online: false,
        downlink: null,
        effectiveType,
        rtt,
        latency: null,
        quality: 'weak',
        message: 'Could not measure speed accurately, but you can still proceed.',
      });
    }
  };

  const playStageAudio = () => {
    if (speechTimeoutRef.current !== null) {
      window.clearTimeout(speechTimeoutRef.current);
    }

    speak.stop();
    setIsSpeaking(true);

    const langMap: Record<string, string> = { en: 'en', hi: 'hi-IN', mr: 'mr-IN' };
    const ttsLang = langMap[state.language] || 'en';
    const stageText = stages[activeStage].speech.join(' ');

    speechTimeoutRef.current = window.setTimeout(() => {
      speak(stageText, {
        lang: ttsLang,
        onEnd: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    }, 800);
  };

  useEffect(() => {
    let isCancelled = false;

    const setupPreview = async () => {
      setPermissionError(null);
      setCameraReady(false);
      setMicReady(false);

      if (!navigator.mediaDevices?.getUserMedia) {
        setPermissionError('This browser does not support camera/microphone access. Please use Chrome/Safari or check your phone settings.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 960 },
            height: { ideal: 540 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (isCancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        previewStreamRef.current = stream;
        setCameraReady(stream.getVideoTracks().length > 0);
        setMicReady(stream.getAudioTracks().length > 0);

        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = stream;
          await previewVideoRef.current.play().catch(() => undefined);
        }

        const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextCtor && stream.getAudioTracks().length > 0) {
          const audioContext = new AudioContextCtor();
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          const source = audioContext.createMediaStreamSource(stream);
          source.connect(analyser);

          audioContextRef.current = audioContext;
          analyserRef.current = analyser;

          const data = new Uint8Array(analyser.frequencyBinCount);

          const animateLevel = () => {
            if (!analyserRef.current) return;

            analyserRef.current.getByteTimeDomainData(data);
            let sum = 0;

            for (let i = 0; i < data.length; i++) {
              const normalized = (data[i] - 128) / 128;
              sum += normalized * normalized;
            }

            const rms = Math.sqrt(sum / data.length);
            const level = Math.min(1, rms * 4.5);
            setMicLevel(level);

            if (micStageArmedRef.current && level > 0.12) {
              setVoiceDetected(true);
            }

            frameRef.current = requestAnimationFrame(animateLevel);
          };

          animateLevel();
        }
      } catch (error) {
        console.error('Onboarding media setup error:', error);
        if (!isCancelled) {
          setPermissionError('Camera and microphone access is required before the interview can begin.');
        }
      }
    };

    setupPreview();
    measureNetwork();

    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    const handleConnectivityChange = () => {
      measureNetwork();
    };

    window.addEventListener('online', handleConnectivityChange);
    window.addEventListener('offline', handleConnectivityChange);
    if (connection?.addEventListener) {
      connection.addEventListener('change', handleConnectivityChange);
    }

    return () => {
      isCancelled = true;
      window.removeEventListener('online', handleConnectivityChange);
      window.removeEventListener('offline', handleConnectivityChange);
      if (connection?.removeEventListener) {
        connection.removeEventListener('change', handleConnectivityChange);
      }
      stopPreview();
    };
  }, []);

  useEffect(() => {
    playStageAudio();

    return () => {
      if (speechTimeoutRef.current !== null) {
        window.clearTimeout(speechTimeoutRef.current);
        speechTimeoutRef.current = null;
      }
      speak.stop();
      setIsSpeaking(false);
    };
  }, [activeStage, state.language, interview.title, state.questions.length]);

  useEffect(() => {
    if (activeStage === 1) {
      setVoiceDetected(false);
      micStageArmedRef.current = false;
      const timer = window.setTimeout(() => {
        micStageArmedRef.current = true;
      }, 300);

      return () => {
        window.clearTimeout(timer);
        micStageArmedRef.current = false;
      };
    }

    if (activeStage === 2) {
      measureNetwork();
    }

    micStageArmedRef.current = false;
  }, [activeStage]);

  const canContinue = [
    cameraReady,
    micReady && voiceDetected,
    networkState.online && networkState.quality !== 'checking',
    cameraReady && micReady && networkState.online,
  ][activeStage];

  const waveformBars = Array.from({ length: 14 }, (_, index) => {
    const bias = 0.5 + ((index % 4) * 0.12);
    const height = Math.max(16, Math.min(96, (micLevel * 96 * bias) + 12));
    return `${height}%`;
  });

  const nextStage = () => setActiveStage(prev => Math.min(prev + 1, stages.length - 1));
  const previousStage = () => setActiveStage(prev => Math.max(prev - 1, 0));

  const handleStart = () => {
    stopPreview();
    onStart();
  };

  return (
    <div className="readiness-shell">
      <div className="readiness-frame">
        <div className="readiness-topbar">
          <div>
            <div className="readiness-label">Role: {interview.title}</div>
            <h2 className="readiness-heading">{stages[activeStage].title}</h2>
          </div>
          <div className="readiness-topbar-right">
            <button type="button" className="readiness-audio-btn" onClick={playStageAudio}>
              <i className={`fas ${isSpeaking ? 'fa-volume-up' : 'fa-rotate-right'}`}></i>
              {isSpeaking ? 'Reading' : 'Replay'}
            </button>
            <div className="readiness-step-text">Step {activeStage + 1} / {stages.length}</div>
          </div>
        </div>

        <div className="readiness-progress">
          {stages.map((stage, index) => (
            <span
              key={stage.title}
              className={`readiness-dot ${index === activeStage ? 'is-active' : ''} ${index < activeStage ? 'is-complete' : ''}`}
            ></span>
          ))}
        </div>

        {activeStage === 0 && (
          <div className="readiness-stage readiness-camera-stage">
            <div className="readiness-camera-panel">
              <div className="readiness-camera-frame">
                <video ref={previewVideoRef} autoPlay muted playsInline className="readiness-camera-video" />
                <div className="readiness-camera-mask">
                  <div className="readiness-camera-mask-box"></div>
                </div>
              </div>
            </div>

            <div className="readiness-content-panel">
              <p className="readiness-text">Keep the camera view simple and clear before the interview begins.</p>

              <div className="readiness-note-list">
                <div className="readiness-note-item">Face inside the frame</div>
                <div className="readiness-note-item">Sit straight</div>
                <div className="readiness-note-item">Look toward the camera</div>
              </div>

              <div className={`readiness-status ${cameraReady ? 'is-success' : 'is-danger'}`}>
                {cameraReady ? 'Camera is ready.' : permissionError || 'Waiting for camera access. If blocked, check your phone/browser settings to allow permissions.'}
              </div>
            </div>
          </div>
        )}

        {activeStage === 1 && (
          <div className="readiness-stage">
            <div className="readiness-content-panel readiness-content-panel-wide">
              <p className="readiness-text">Read this line once. The meter should move while you speak.</p>

              <div className="readiness-phrase-card">{micPrompt}</div>

              <div className="readiness-waveform">
                {waveformBars.map((height, index) => (
                  <span key={index} style={{ height }} className={voiceDetected ? 'is-live' : ''}></span>
                ))}
              </div>

              <div className="readiness-meter">
                <div className="readiness-meter-track">
                  <div
                    className={`readiness-meter-fill ${voiceDetected ? 'is-live' : ''}`}
                    style={{ width: `${Math.max(8, micLevel * 100)}%` }}
                  ></div>
                </div>
                <div className="readiness-meter-text">
                  <span>{voiceDetected ? 'Microphone detected' : 'Waiting for speech'}</span>
                  <strong>{Math.round(micLevel * 100)}%</strong>
                </div>
              </div>

              <div className={`readiness-status ${voiceDetected ? 'is-success' : 'is-neutral'}`}>
                {voiceDetected ? 'Microphone is working.' : 'Speak for a moment to continue.'}
              </div>
            </div>
          </div>
        )}

        {activeStage === 2 && (
          <div className="readiness-stage">
            <div className="readiness-content-panel readiness-content-panel-wide">
              <p className="readiness-text">We are checking the current connection quality.</p>

              <div className="readiness-network-grid">
                <div className="readiness-network-item">
                  <span>Status</span>
                  <strong>{networkState.online ? networkState.quality.toUpperCase() : 'OFFLINE'}</strong>
                </div>
                <div className="readiness-network-item">
                  <span>Downlink</span>
                  <strong>{networkState.downlink !== null ? `${networkState.downlink} Mbps` : 'Unavailable'}</strong>
                </div>
                <div className="readiness-network-item">
                  <span>Latency</span>
                  <strong>{networkState.latency !== null ? `${networkState.latency} ms` : 'Unavailable'}</strong>
                </div>
                <div className="readiness-network-item">
                  <span>Type</span>
                  <strong>{networkState.effectiveType || 'Unknown'}</strong>
                </div>
              </div>

              <div className={`readiness-status ${networkState.quality === 'offline' ? 'is-danger' : networkState.quality === 'weak' ? 'is-warning' : 'is-success'}`}>
                {networkState.message}
              </div>

              <button type="button" className="readiness-secondary-btn" onClick={measureNetwork}>
                Recheck connection
              </button>
            </div>
          </div>
        )}

        {activeStage === 3 && (
          <div className="readiness-stage">
            <div className="readiness-content-panel readiness-content-panel-wide">
              <p className="readiness-text">Everything is ready. Here is the interview format.</p>

              <div className="readiness-summary-list">
                {summaryPoints.map(point => (
                  <div key={point} className="readiness-summary-item">{point}</div>
                ))}
              </div>

              {/* YouTube video guide */}
              <div className="mt-6 w-full flex flex-col items-center justify-center">
                <div className="relative w-full max-w-xl aspect-video rounded-2xl overflow-hidden shadow-lg border border-gray-200 dark:border-white/10 bg-black">
                  <iframe 
                    className="absolute top-0 left-0 w-full h-full"
                    src="https://www.youtube.com/embed/9UhI3l23OLg?si=t-y4dcjI0sO0ADpC&autoplay=1&mute=1" 
                    title="YouTube video player" 
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                    referrerPolicy="strict-origin-when-cross-origin" 
                    allowFullScreen
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="readiness-actions">
          <div className="readiness-actions-left">
            {activeStage > 0 && (
              <button type="button" className="readiness-secondary-btn" onClick={previousStage}>
                Back
              </button>
            )}
          </div>
          <div className="readiness-actions-right">
            {activeStage < stages.length - 1 ? (
              <button type="button" className="readiness-primary-btn" disabled={!canContinue} onClick={nextStage}>
                Continue
              </button>
            ) : (
              <button type="button" className="readiness-primary-btn" disabled={!canContinue} onClick={handleStart}>
                Start interview
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Welcome Screen Component with AI Avatar ---
const InterviewWelcomeScreen: React.FC<{
  interview: any;
  onProceed: () => void;
}> = ({ interview, onProceed }) => {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    // Speak welcome message
    const welcomeText = `Hello! Welcome to your AI interview for the role of ${interview.title}. I am your AI Recruiter today. Let me explain the hiring process. First, you will enter your details and upload your resume. Second, you will review the job description. Third, we will verify your hardware including camera, microphone, and internet. Finally, we will begin the interview where I will ask you questions one by one. Let's get started!`;
    
    const timeout = setTimeout(() => {
      setIsSpeaking(true);
      speak(welcomeText, {
        onEnd: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    }, 800);

    return () => {
      clearTimeout(timeout);
      speak.stop();
    };
  }, [interview.title]);

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-6 text-center animate-in fade-in slide-in-from-bottom-6 duration-500">
      {/* Hologram Avatar card */}
      <div className="mb-6 max-w-sm mx-auto bg-slate-900 dark:bg-slate-950 rounded-2xl p-6 border border-gray-200/10 shadow-2xl relative overflow-hidden flex flex-col items-center justify-center">
        <style>{`
          @keyframes soundbar {
            0%, 100% { height: 20%; }
            50% { height: 100%; }
          }
        `}</style>
        
        {/* Holographic scanning effect */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle, rgba(59,130,246,0.15) 1px, transparent 1px)',
          backgroundSize: '16px 16px'
        }}></div>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-transparent to-purple-600/10 pointer-events-none"></div>

        <div className="relative w-24 h-24 md:w-32 md:h-32 flex items-center justify-center">
          <div className={`absolute inset-0 rounded-full border border-dashed border-blue-500/40 ${isSpeaking ? 'animate-spin' : 'animate-[spin_20s_linear_infinite]'} opacity-60`}></div>
          <div className={`absolute inset-3 rounded-full border border-purple-500/20 bg-purple-500/5 transition-all duration-700 ${
            isSpeaking ? 'scale-105 opacity-80 shadow-[0_0_25px_rgba(168,85,247,0.3)]' : 'scale-100 opacity-40 shadow-none'
          }`}></div>

          <svg className="absolute w-full h-full pointer-events-none z-10" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="welcomeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="32" fill="none" stroke="url(#welcomeGrad)" strokeWidth="1" strokeDasharray="5,15" className={`origin-center transition-all ${isSpeaking ? 'animate-[spin_4s_linear_infinite]' : 'animate-[spin_12s_linear_infinite]'}`} />
            <circle cx="50" cy="50" r="28" fill="none" stroke="#8b5cf6" strokeWidth="1.5" strokeDasharray="40,20" className={`origin-center transition-all ${isSpeaking ? 'animate-[spin_6s_linear_infinite_reverse] opacity-80' : 'animate-[spin_18s_linear_infinite_reverse] opacity-40'}`} />
          </svg>

          <div className={`relative w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden border-2 border-blue-500/50 flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.3)] z-20 transition-all duration-300 ${
            isSpeaking ? 'scale-105 border-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.5)]' : ''
          }`}>
            <img 
              src="/recruiter_avatar.png" 
              alt="AI Recruiter" 
              className={`w-full h-full object-cover transition-transform duration-300 ${isSpeaking ? 'scale-105' : 'scale-100'}`} 
            />
          </div>
        </div>

        {/* Small speech frequency wave bars under avatar */}
        <div className="h-4 flex items-end gap-0.5 mt-2.5 z-10">
          {isSpeaking ? (
            <>
              <span className="w-0.5 bg-blue-400 rounded-full animate-[soundbar_0.8s_ease-in-out_infinite]" style={{ height: '40%' }}></span>
              <span className="w-0.5 bg-blue-300 rounded-full animate-[soundbar_0.6s_ease-in-out_infinite_0.1s]" style={{ height: '80%' }}></span>
              <span className="w-0.5 bg-purple-400 rounded-full animate-[soundbar_0.7s_ease-in-out_infinite_0.3s]" style={{ height: '50%' }}></span>
              <span className="w-0.5 bg-purple-300 rounded-full animate-[soundbar_0.5s_ease-in-out_infinite_0.2s]" style={{ height: '100%' }}></span>
              <span className="w-0.5 bg-blue-400 rounded-full animate-[soundbar_0.9s_ease-in-out_infinite_0.4s]" style={{ height: '30%' }}></span>
            </>
          ) : (
            <div className="flex gap-0.5">
              <span className="w-0.5 h-1 bg-gray-500 rounded-full opacity-40"></span>
              <span className="w-0.5 h-1 bg-gray-500 rounded-full opacity-40"></span>
              <span className="w-0.5 h-1 bg-gray-500 rounded-full opacity-40"></span>
              <span className="w-0.5 h-1 bg-gray-500 rounded-full opacity-40"></span>
              <span className="w-0.5 h-1 bg-gray-500 rounded-full opacity-40"></span>
            </div>
          )}
        </div>

        <div className="mt-3 text-center z-10">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all duration-300 ${
            isSpeaking ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isSpeaking ? 'bg-blue-400 animate-ping' : 'bg-emerald-400'}`}></span>
            {isSpeaking ? 'AI Recruiter speaking' : 'AI Recruiter (Standby)'}
          </span>
        </div>
      </div>

      {/* Mobile-only Start Onboarding CTA (directly below avatar card for quick access) */}
      <div className="block md:hidden mb-6">
        <button 
          onClick={onProceed}
          className="w-full max-w-xs px-6 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold rounded-2xl shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mx-auto"
        >
          <span>Start Onboarding</span>
          <i className="fas fa-arrow-right text-sm"></i>
        </button>
      </div>

      {/* Greeting and description */}
      <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-2">
        Let's Start Your AI Assessment!
      </h2>
      <p className="text-lg text-blue-600 dark:text-blue-400 font-bold mb-6">
        Role: {interview.title}
      </p>

      {/* Process flow cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 text-left">
        <div className="bg-white dark:bg-white/5 p-5 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm transition-all hover:scale-[1.02]">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
            <i className="fas fa-user-edit text-lg"></i>
          </div>
          <h4 className="text-sm font-extrabold text-gray-900 dark:text-white mb-1">1. Access Details</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">Enter your information and upload your resume for the AI to analyze.</p>
        </div>

        <div className="bg-white dark:bg-white/5 p-5 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm transition-all hover:scale-[1.02]">
          <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-3">
            <i className="fas fa-file-invoice text-lg"></i>
          </div>
          <h4 className="text-sm font-extrabold text-gray-900 dark:text-white mb-1">2. JD & Guidelines</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">Review job responsibilities and standard rules of the assessment.</p>
        </div>

        <div className="bg-white dark:bg-white/5 p-5 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm transition-all hover:scale-[1.02]">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3">
            <i className="fas fa-video text-lg"></i>
          </div>
          <h4 className="text-sm font-extrabold text-gray-900 dark:text-white mb-1">3. System Check</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">Verify your internet speed, microphone, and camera setup.</p>
        </div>

        <div className="bg-white dark:bg-white/5 p-5 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm transition-all hover:scale-[1.02]">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
            <i className="fas fa-brain text-lg"></i>
          </div>
          <h4 className="text-sm font-extrabold text-gray-900 dark:text-white mb-1">4. Interview Session</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">Face our interactive AI, answer questions, and submit your responses.</p>
        </div>
      </div>

      {/* JD description summary */}
      {interview.description && (
        <div className="bg-blue-50/30 dark:bg-blue-950/10 rounded-2xl border border-blue-100/50 dark:border-blue-900/20 p-5 mb-8 text-left max-h-[160px] overflow-y-auto custom-scrollbar">
          <h4 className="text-xs font-bold text-blue-900 dark:text-blue-200 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <i className="fas fa-briefcase"></i> Job Overview
          </h4>
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-3 select-none">
            {interview.description}
          </p>
        </div>
      )}

      {/* Button to proceed */}
      <button 
        onClick={onProceed}
        className="px-10 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold rounded-2xl shadow-xl shadow-blue-500/25 hover:shadow-blue-500/35 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 mx-auto"
      >
        <span>Start Onboarding</span>
        <i className="fas fa-arrow-right"></i>
      </button>
    </div>
  );
};

// --- Access Code Verification Component ---
const AccessCodeVerificationScreen: React.FC<{
  interviewId: string;
  initialToken: string;
  onSuccess: () => void;
}> = ({ interviewId, initialToken, onSuccess }) => {
  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError("Please enter a valid access code.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const tokenDocRef = doc(db, 'interviewAccessTokens', token.trim());
      const tokenDoc = await getDoc(tokenDocRef);

      if (!tokenDoc.exists()) {
        throw new Error("Invalid or expired access code. Please check the code sent to your email.");
      }

      const tokenData = tokenDoc.data();
      if (tokenData.isUsed) {
        throw new Error("This access code has already been used. Please contact your recruiter.");
      }

      if (tokenData.nextInterviewId !== interviewId) {
        throw new Error("This access code is not valid for this assessment.");
      }

      // Mark token as used
      await updateDoc(tokenDocRef, { isUsed: true, usedAt: serverTimestamp() });
      
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to verify access code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 py-8 bg-white dark:bg-gray-800/60 rounded-3xl border border-gray-200 dark:border-gray-700/50 shadow-xl text-center animate-in fade-in slide-in-from-bottom-6 duration-500">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4 mx-auto">
        <i className="fas fa-key text-2xl"></i>
      </div>

      <h3 className="text-xl font-extrabold text-gray-900 dark:text-white mb-2">Access Code Verification</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
        This assessment is private. Please enter the unique access code sent to your email to proceed.
      </p>

      {error && (
        <div className="mb-4 p-3.5 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl text-xs font-semibold leading-relaxed">
          {error}
        </div>
      )}

      <form onSubmit={handleVerify} className="space-y-4">
        <div className="text-left">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">Access Code</label>
          <input 
            type="text" 
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="e.g. token_xyz123"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white font-mono"
            disabled={loading}
          />
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 active:scale-98 transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <i className="fas fa-circle-notch fa-spin text-sm"></i>
              Verifying...
            </>
          ) : (
            <>
              <span>Verify & Proceed</span>
              <i className="fas fa-arrow-right text-xs"></i>
            </>
          )}
        </button>
      </form>
    </div>
  );
};

// --- Main Wizard Component ---
const CandidateInterviewFlow: React.FC = () => {
  const { interviewId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, userProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // State
  const [step, setStep] = useState<WizardStep>('validating');
  const [interview, setInterview] = useState<Interview | null>(null);
  const [candidateInfo, setCandidateInfo] = useState<CandidateInfo>({ name: '', email: '', phone: '', language: 'en' });
  const [interviewState, setInterviewState] = useState<InterviewState>({
    jobId: '', jobTitle: '', jobDescription: '', candidateResumeURL: null, candidateResumeMimeType: null,
    questions: [], answers: [], videoURLs: [], transcriptIds: [], transcriptTexts: [], currentQuestionIndex: 0,
    language: 'en',
    pendingResponseCount: 0,
  });

  const [loadingMsg, setLoadingMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [tabSwitches, setTabSwitches] = useState(0);
  const [speedStatus, setSpeedStatus] = useState<string | null>(null);
  const [interviewTerminated, setInterviewTerminated] = useState(false);

  // 1. Validate Access & Fetch Interview Details
  useEffect(() => {
    const validateAndInit = async () => {
      if (!interviewId) {
        setErrorMsg("Interview ID not found in URL.");
        setStep('collect-info'); // Fallback to show error
        return;
      }
      try {
        const interviewDocRef = doc(db, 'interviews', interviewId);
        const interviewDoc = await getDoc(interviewDocRef);

        if (!interviewDoc.exists()) {
          throw new Error("This interview does not exist or has been closed.");
        }
        
        const interviewData = { id: interviewDoc.id, ...interviewDoc.data() } as any;



        // If we reach here, access is granted. Now load the interview data.
        const jobDocRef = doc(db, 'jobs', interviewId);
        const jobDoc = await getDoc(jobDocRef);
        const jobData = jobDoc.exists() ? jobDoc.data() : {};
        const combinedData = { ...interviewData, isMock: jobData.isMock || false };

        setInterview(combinedData as Interview);
        setInterviewState(prev => ({ ...prev, jobTitle: combinedData.title, jobDescription: combinedData.description, isMock: combinedData.isMock, strictness: combinedData.strictness || 'Medium' }));
        setStep('welcome');

      } catch (err: any) { 
        setErrorMsg(err.message); 
        setStep('collect-info'); // Fallback to show error
      }
    };
    validateAndInit();
  }, [interviewId, searchParams]);

  // 2. Handle Candidate Info Submission
  const handleInfoSubmit = async (submittedInfo: CandidateInfo, submittedFile: File | null, existingResumeUrl?: string, cloudinaryUrl?: string) => {
    setCandidateInfo(submittedInfo);

    setStep('setup');
    setLoadingMsg("Processing your information...");

    try {
      setLoadingMsg("Verifying attempt eligibility...");
      const attemptsRef = collection(db, 'interviews', interviewId!, 'attempts');
      
      let hasAttempted = false;
      let reattemptDocsToConsume: string[] = [];
      try {
        const emailQuery = query(attemptsRef, where('candidateInfo.email', '==', submittedInfo.email));
        const emailSnap = await getDocs(emailQuery);
        const emailReattempts = emailSnap.docs.filter(doc => doc.data().allowReattempt === true);
        
        let phoneReattempts: any[] = [];
        let phoneSnapDocs: any[] = [];
        if (submittedInfo.phone) {
          const phoneQuery = query(attemptsRef, where('candidateInfo.phone', '==', submittedInfo.phone));
          const phoneSnap = await getDocs(phoneQuery);
          phoneSnapDocs = phoneSnap.docs;
          phoneReattempts = phoneSnap.docs.filter(doc => doc.data().allowReattempt === true);
        }

        const totalAttemptsCount = emailSnap.size + phoneSnapDocs.length;
        const totalReattemptsCount = emailReattempts.length + phoneReattempts.length;

        if (totalAttemptsCount > 0) {
          if (totalReattemptsCount > 0) {
            // Collect the doc IDs of the attempts that granted the reattempt permission
            reattemptDocsToConsume = [
              ...emailReattempts.map(d => d.id),
              ...phoneReattempts.map(d => d.id)
            ];
          } else {
            hasAttempted = true;
          }
        }
      } catch (err: any) {
        console.error("Attempt verification failed:", err);
        // Map permission-denied to user-friendly already taken interview message
        if (err.message && (err.message.includes("permission") || err.code === "permission-denied" || err.message.includes("permissions"))) {
          throw new Error("You have already taken this interview. Only one attempt is allowed.");
        }
        throw err;
      }

      if (hasAttempted) {
        throw new Error("You have already taken this interview. Only one attempt is allowed.");
      }

      // Consume the reattempt permissions immediately if any exist
      if (reattemptDocsToConsume.length > 0) {
        setLoadingMsg("Consuming reattempt permission...");
        for (const docId of reattemptDocsToConsume) {
          try {
            await updateDoc(doc(db, 'interviews', interviewId!, 'attempts', docId), {
              allowReattempt: false
            });
          } catch (e) {
            console.error("Failed to consume reattempt on doc", docId, e);
          }
        }
      }

      let base64String = '';
      let resumeMimeType = '';
      let resumeUrlToSave = cloudinaryUrl || existingResumeUrl || '';
      let resumeTextContent = ''; // This will hold the parsed text content of the resume

      if (cloudinaryUrl) {
        setLoadingMsg("Fetching uploaded resume for AI...");
        try {
          const res = await fetch(cloudinaryUrl);
          const blob = await res.blob();
          const [blobBase64, parsedResumeText] = await Promise.all([
            getBlobAsBase64(blob),
            extractResumeText(blob)
          ]);

          base64String = blobBase64;
          resumeMimeType = blob.type || 'application/pdf';
          resumeTextContent = parsedResumeText;
        } catch (error) {
          console.error("Error fetching Cloudinary PDF:", error);
          throw new Error("Failed to process the uploaded resume.");
        }
      } else if (submittedFile) {
        setLoadingMsg("Uploading and parsing your resume...");
        const uploadPromise = uploadToCloudinary(submittedFile, 'auto').catch((error) => {
          console.error("Resume cloudinary upload failed:", error);
          return null;
        });

        const [{ base64, url }, parsedResumeText, cloudinaryResumeUrl] = await Promise.all([
          getFileAsBase64(submittedFile),
          extractResumeText(submittedFile),
          uploadPromise
        ]);

        base64String = base64;
        resumeMimeType = submittedFile.type;
        resumeTextContent = parsedResumeText;
        resumeUrlToSave = cloudinaryResumeUrl || url;
      } else if (userProfile) {
        setLoadingMsg("Synthesizing your profile data for AI...");
        const profileText = `[Candidate Profile Data]\nName: ${submittedInfo.name}\nEmail: ${submittedInfo.email}\nExperience: ${userProfile.experience || 0} Years\nSkills: ${(userProfile.skills || []).join(', ')}`;
        base64String = btoa(unescape(encodeURIComponent(profileText)));
        resumeMimeType = 'text/plain';
        resumeTextContent = profileText; // Use the generated text for AI context
        resumeUrlToSave = 'data:text/plain;base64,' + base64String;
      } else {
        throw new Error("No resume or profile data provided.");
      }

      setLoadingMsg("AI is generating tailored questions... (approx 30s)");
      const aiQuestions = await generateInterviewQuestions(
        interview!.title,
        interview!.description,
        (submittedInfo.experienceType === 'experienced' && submittedInfo.totalExperienceYears)
          ? `${submittedInfo.totalExperienceYears} years ${submittedInfo.totalExperienceMonths} months`
          : "0 years",
        base64String,
        resumeMimeType,
        submittedInfo.language,
        (interview as any).numQuestions || 5,
        resumeTextContent // Pass the parsed text to the AI
      );

      const manualQuestions = (interview as any).manualQuestions || [];
      const questions = [...manualQuestions, ...aiQuestions];

      setInterviewState((prev) => ({
        ...prev,
        questions,
        candidateResumeURL: resumeUrlToSave,
        candidateResumeMimeType: resumeMimeType,
        candidateResumeBase64: base64String,
        candidateResumeText: resumeTextContent, // Store parsed text in state
        language: submittedInfo.language,
        answers: Array(questions.length).fill(null),
        videoURLs: Array(questions.length).fill(null),
        transcriptIds: Array(questions.length).fill(null),
        transcriptTexts: Array(questions.length).fill(null),
        pendingResponseCount: 0,
      }));
      setStep('show-jd');
    } catch (err: any) {
        let displayError = "Failed to process resume. Please try again later.";
        try {
            // The error from the backend seems to be a JSON string in the message
            const errorObj = JSON.parse(err.message);
            if (errorObj.error && errorObj.error.message) {
                displayError = errorObj.error.message;
            }
        } catch (e) {
            // If parsing fails, use the original message if it's not too long/complex
            if (err.message && typeof err.message === 'string') {
                displayError = err.message.length > 220 ? `${err.message.slice(0, 220)}...` : err.message;
            }
        }
        setErrorMsg(displayError);
        setStep('collect-info');
    }
  };
  
  const checkSpeed = () => {
    setSpeedStatus("Checking...");
    const start = Date.now();
    const img = new Image();
    img.onload = () => {
      const duration = (Date.now() - start) / 1000;
      const speed = (50 * 8) / duration;
      setSpeedStatus(speed > 1000 ? "Excellent" : speed > 500 ? "Good" : "Weak");
    };
    img.src = "https://i.ibb.co/3y9DKsB6/Yellow-and-Black-Illustrative-Education-Logo-1.png?t=" + start;
  };

  // --- RENDER ---
  const Container = ({ children }: { children: React.ReactNode }) => (
    <div className="interview-flow-shell fixed inset-0 z-[9999] overflow-y-auto bg-gray-50 dark:bg-slate-950 text-gray-800 dark:text-gray-100 flex flex-col items-center justify-start py-12 px-4 transition-colors duration-500">
      <div className="absolute top-4 right-4 z-[10000]">
        <DayNightToggle />
      </div>      {children}
    </div>
  );

  if (!interview) {
    return (
      <Container>
        {errorMsg ? 
          <div className="interview-state-card interview-state-error text-red-500 bg-red-100 dark:bg-red-900/20 p-4 rounded-lg">{errorMsg}</div> : 
          <div className="interview-state-loader relative w-20 h-20">
            <div className="absolute inset-0 border-t-4 border-blue-500 rounded-full animate-spin"></div>
            <div className="absolute inset-3 border-t-4 border-purple-500 rounded-full animate-spin reverse"></div>
          </div>
        }
      </Container>
    );
  }

  if (step === 'validating') {
    return (
      <Container>
        <div className="interview-state-loader relative w-20 h-20">
          <div className="absolute inset-0 border-t-4 border-blue-500 rounded-full animate-spin"></div>
          <div className="absolute inset-3 border-t-4 border-purple-500 rounded-full animate-spin reverse"></div>
        </div>
      </Container>
    );
  }

  if (step === 'welcome') {
    return (
      <Container>
        <InterviewWelcomeScreen 
          interview={interview}
          onProceed={() => {
            if (interview?.requiresToken === true) {
              setStep('enter-code');
            } else {
              setStep('collect-info');
            }
          }}
        />
      </Container>
    );
  }

  if (step === 'enter-code') {
    return (
      <Container>
        <AccessCodeVerificationScreen 
          interviewId={interviewId!}
          initialToken={searchParams.get('token') || ''}
          onSuccess={() => setStep('collect-info')}
        />
      </Container>
    );
  }

  if (step === 'collect-info') {
    return (
      <Container>
        {step === 'collect-info' && (
          <CandidateInfoForm 
            jobTitle={interviewState.jobTitle}
            interviewId={interviewId!}
            onBackToWelcome={() => setStep('welcome')}
            onSubmit={handleInfoSubmit} 
            errorMsg={errorMsg}
            user={user}
            userProfile={userProfile}
          />
        )}
      </Container>
    );
  }

  if (step === 'show-jd') {
    const formatLanguageName = (langCode: string) => {
      const names: Record<string, string> = {
        en: 'English',
        hi: 'Hindi (हिंदी)',
        mr: 'Marathi (मराठी)'
      };
      return names[langCode] || langCode.toUpperCase();
    };

    return (
      <Container>
        <div className="w-full max-w-3xl mx-auto px-4 py-2 animate-in fade-in slide-in-from-bottom-6 duration-500">
          {/* Header Banner */}
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold border border-blue-100 dark:border-blue-800/50 mb-3 uppercase tracking-wider">
              <i className="fas fa-briefcase"></i> Job Description Review
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white leading-tight">
              {interview.title}
            </h2>
            {interview.department && (
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mt-1.5">
                Department: {interview.department}
              </p>
            )}
          </div>

          {/* Key Parameters Cards Grid - Capable for Mobile */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {/* Duration */}
            <div className="bg-white dark:bg-white/5 p-4 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm flex flex-col items-center text-center transition-all duration-300 hover:border-primary/20 hover:shadow-md">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2.5">
                <i className="fas fa-clock text-lg"></i>
              </div>
              <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Duration</span>
              <span className="text-sm font-extrabold text-gray-800 dark:text-gray-200 mt-0.5">{interview.duration} mins</span>
            </div>

            {/* Difficulty */}
            <div className="bg-white dark:bg-white/5 p-4 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm flex flex-col items-center text-center transition-all duration-300 hover:border-primary/20 hover:shadow-md">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2.5">
                <i className="fas fa-tachometer-alt text-lg"></i>
              </div>
              <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Difficulty</span>
              <span className="text-sm font-extrabold text-gray-800 dark:text-gray-200 mt-0.5">{interview.difficulty}</span>
            </div>

            {/* Strictness */}
            <div className="bg-white dark:bg-white/5 p-4 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm flex flex-col items-center text-center transition-all duration-300 hover:border-primary/20 hover:shadow-md">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-2.5">
                <i className="fas fa-shield-alt text-lg"></i>
              </div>
              <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Strictness</span>
              <span className="text-sm font-extrabold text-gray-800 dark:text-gray-200 mt-0.5">{interview.strictness || 'Medium'}</span>
            </div>

            {/* Language */}
            <div className="bg-white dark:bg-white/5 p-4 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm flex flex-col items-center text-center transition-all duration-300 hover:border-primary/20 hover:shadow-md">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-2.5">
                <i className="fas fa-globe text-lg"></i>
              </div>
              <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Language</span>
              <span className="text-sm font-extrabold text-gray-800 dark:text-gray-200 mt-0.5">{formatLanguageName(interviewState.language)}</span>
            </div>
          </div>

          {/* Job Description details box */}
          <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-200/60 dark:border-white/10 shadow-sm p-6 sm:p-8 mb-8">
            <h3 className="text-base font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-gray-100 dark:border-white/5 pb-3">
              <i className="fas fa-file-alt text-blue-500"></i> Role & Responsibilities
            </h3>
            
            <div className="max-h-[350px] overflow-y-auto pr-3 custom-scrollbar text-sm text-gray-600 dark:text-gray-300 leading-relaxed space-y-4 whitespace-pre-wrap select-text selection:bg-blue-500/35">
              {interview.description || "No job description details provided."}
            </div>
          </div>

          {/* Action Callouts & Next button */}
          <div className="bg-blue-50/50 dark:bg-blue-950/20 rounded-2xl border border-blue-100 dark:border-blue-900/30 p-5 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-center sm:text-left">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex-shrink-0 flex items-center justify-center mx-auto sm:mx-0">
                <i className="fas fa-info-circle text-lg"></i>
              </div>
              <div>
                <h4 className="text-sm font-bold text-blue-900 dark:text-blue-200">Ready to begin?</h4>
                <p className="text-xs text-blue-700/80 dark:text-blue-300/80 mt-0.5">Please review the details above. The next step will verify your audio and video.</p>
              </div>
            </div>
            
            <button 
              onClick={() => setStep('instructions')}
              className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 group whitespace-nowrap"
            >
              Proceed to Hardware Check
              <i className="fas fa-arrow-right text-sm transition-transform group-hover:translate-x-1"></i>
            </button>
          </div>
        </div>
      </Container>
    );
  }

  if (step === 'instructions') {
    return (
      <Container>
        <div className="flex items-center justify-center min-h-[70vh] w-full px-4">
          <InterviewReadinessOnboarding
            interview={interview}
            state={interviewState}
            onStart={() => setStep('interview')}
          />
        </div>
      </Container>
    );
  }

  if (step === 'setup' || step === 'processing') {
    return (
      <Container>
        <div className="interview-state-card flex flex-col items-center max-w-md text-center">
          <div className="interview-state-loader relative w-24 h-24 mb-6">
            <div className="absolute inset-0 border-4 border-gray-200 dark:border-gray-700 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
            <i className="fas fa-robot absolute inset-0 flex items-center justify-center text-3xl text-gray-400 dark:text-gray-500"></i>
          </div>
          <h3 className="text-xl font-bold text-gray-800 dark:text-white">{loadingMsg}</h3>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-sm">Please wait while the interview is prepared.</p>
        </div>
      </Container>
    );
  }

  if (step === 'interview') {
    return (
      <ActiveInterviewSession
        state={interviewState}
        setState={setInterviewState}
        onFinish={(result?: { terminated?: boolean }) => {
          setInterviewTerminated(Boolean(result?.terminated));
          setStep('finish');
        }}
        onTabSwitch={() => setTabSwitches(prev => prev + 1)}
      />
    );
  }

  if (step === 'finish') {
    return <InterviewSubmission state={interviewState} tabSwitches={tabSwitches} interviewId={interviewId!} candidateInfo={candidateInfo} terminated={interviewTerminated} />;
  }

  return null;
};

// --- Sub-Component: Active Interview (Immersive) ---
const ActiveInterviewSession: React.FC<{
  state: InterviewState;
  setState: React.Dispatch<React.SetStateAction<InterviewState>>;
  onFinish: (result?: { terminated?: boolean }) => void;
  onTabSwitch: () => void;
}> = ({ state, setState, onFinish, onTabSwitch }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const answerDeadlineRef = useRef<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_MS / 1000);
  const [countdown, setCountdown] = useState(5);
  const [processingVideo, setProcessingVideo] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const currentQ = state.questions[state.currentQuestionIndex];

  const [tabWarning, setTabWarning] = useState<string | null>(null);
  const tabWarningTimerRef = useRef<any>(null);

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
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const hasEnteredFullscreenRef = useRef(isFullscreen);
  const sessionReady = (isFullscreen || isMobile) && cameraReady && !isTerminated;

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

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      setIsStopping(true);
      answerDeadlineRef.current = null;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const syncTimeLeftFromDeadline = () => {
    const deadline = answerDeadlineRef.current;
    if (!deadline) return;

    const remainingSeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    setTimeLeft(remainingSeconds);

    if (remainingSeconds === 0 && mediaRecorderRef.current?.state !== 'inactive') {
      stopRecording();
    }
  };

  const processRecordedAnswer = async (blob: Blob, questionIndex: number, language: string) => {
    let videoUrl: string | null = null;
    let transcriptId: string | null = null;
    let transcriptText: string | null = null;

    try {
      videoUrl = await uploadToCloudinary(blob, 'video');
      if (videoUrl) {
        transcriptId = await requestTranscription(videoUrl, language);
      } else {
        transcriptText = '(Video upload failed.)';
      }
    } catch (error) {
      console.error("Upload/transcription error:", error);
      transcriptText = '(Video upload or transcription setup failed.)';
    } finally {
      setState(prev => {
        const nextVideoUrls = [...prev.videoURLs];
        const nextTranscriptIds = [...prev.transcriptIds];
        const nextTranscriptTexts = prev.transcriptTexts
          ? [...prev.transcriptTexts]
          : Array(prev.questions.length).fill(null);

        nextVideoUrls[questionIndex] = videoUrl;
        nextTranscriptIds[questionIndex] = transcriptId;

        if (transcriptText) {
          nextTranscriptTexts[questionIndex] = transcriptText;
        }

        return {
          ...prev,
          videoURLs: nextVideoUrls,
          transcriptIds: nextTranscriptIds,
          transcriptTexts: nextTranscriptTexts,
          pendingResponseCount: Math.max((prev.pendingResponseCount ?? 1) - 1, 0),
        };
      });
    }
  };

  // Anti-cheating & Fullscreen effect
  useEffect(() => {
    // Basic Anti-Copy
    const handleCopyCutPaste = (e: ClipboardEvent) => e.preventDefault();
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (['c', 'v', 'x', 's'].includes(e.key.toLowerCase())) e.preventDefault();
      }
      if (e.key === 'F12') e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'I', 'j', 'J', 'c', 'C'].includes(e.key)) e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && ['u', 'U'].includes(e.key)) e.preventDefault();
    };
    const blockDrag = (e: DragEvent) => e.preventDefault();

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
  }, []);

  useEffect(() => {
    if (isTerminated) return;

    const handleFullscreenChange = () => {
      if (isMobile) {
        setIsFullscreen(true);
        hasEnteredFullscreenRef.current = true;
        return;
      }
      const isFS = !!getFullscreenElement();
      setIsFullscreen(isFS);
      
      if (isFS) {
        hasEnteredFullscreenRef.current = true;
        setFullscreenError(null);
      } else if (hasEnteredFullscreenRef.current) {
        setFullscreenEscapes(prev => {
          const newCount = prev + 1;
          if (newCount >= 3) {
            setIsTerminated(true);
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
              mediaRecorderRef.current.stop();
            }
            onFinish({ terminated: true });
          }
          return newCount;
        });
      }
    };

    handleFullscreenChange();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange as EventListener);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange as EventListener);
    };
  }, [isTerminated, onFinish, isMobile]);


  // Tab Visibility
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        onTabSwitch();
        const warning = 'TAB SWITCH DETECTED - This activity has been recorded and will be flagged in your report.';
        setTabWarning(warning);
        // Auto-clear the warning banner after 5 seconds
        if (tabWarningTimerRef.current) clearTimeout(tabWarningTimerRef.current);
        tabWarningTimerRef.current = setTimeout(() => setTabWarning(null), 5000);
      }

      syncTimeLeftFromDeadline();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (tabWarningTimerRef.current) clearTimeout(tabWarningTimerRef.current);
    };
  }, [onTabSwitch]);

  // Camera
  useEffect(() => {
    let isCancelled = false;

    const setupCamera = async () => {
      setCameraReady(false);
      setCameraError(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("This browser does not support camera/microphone recording.");
        return;
      }

      try {
        // Low-spec optimization: 320x240 reduces GPU/RAM pressure significantly.
        // Low video resolution is sufficient for recording and transcription.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 20 } },
          audio: true
        });

        if (isCancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraReady(true);
      } catch (error) {
        console.error("Camera setup error:", error);
        if (!isCancelled) {
          setCameraError("Camera and microphone access is required to continue.");
        }
      }
    };
    setupCamera();
    return () => {
      isCancelled = true;
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      speak.stop();
    };
  }, []);

  // TTS auto-play - Kokoro TTS (English) / Web Speech API (Hindi, Marathi)
  // Reads the current question aloud as soon as it appears on screen.
  useEffect(() => {
    if (!currentQ || !sessionReady) return;

    // Map the short language code from candidate selection to BCP-47
    const langMap: Record<string, string> = { en: 'en', hi: 'hi-IN', mr: 'mr-IN' };
    const ttsLang = langMap[state.language] || 'en';

    // Small delay so the question text renders before audio starts
    const timeout = setTimeout(() => {
      setIsSpeaking(true);
      speak(currentQ, {
        lang: ttsLang,
        onEnd: () => {
          setIsSpeaking(false);
          console.log('[TTS] Finished reading question');
        },
        onError: (err) => {
          setIsSpeaking(false);
          console.warn('[TTS] Error reading question:', err);
        },
      });
    }, 400);

    return () => {
      clearTimeout(timeout);
      speak.stop();
      setIsSpeaking(false);
    };
  }, [currentQ, state.language, sessionReady]);



  // Auto-Logic
  useEffect(() => {
    if (!sessionReady || isRecording || processingVideo || isStopping) {
      return;
    }

    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(t);
    } else if (countdown === 0) {
      startRecording();
    }
  }, [countdown, sessionReady, isRecording, processingVideo, isStopping]);

  useEffect(() => {
    if (!isRecording || isTerminated) return;

    syncTimeLeftFromDeadline();
    const timer = window.setInterval(syncTimeLeftFromDeadline, 1000);
    document.addEventListener('visibilitychange', syncTimeLeftFromDeadline);
    window.addEventListener('focus', syncTimeLeftFromDeadline);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', syncTimeLeftFromDeadline);
      window.removeEventListener('focus', syncTimeLeftFromDeadline);
    };
  }, [isRecording, isTerminated]);

  const startRecording = () => {
    if (!sessionReady || !streamRef.current) return;
    if (typeof MediaRecorder === 'undefined') {
      setCameraError("This browser does not support in-browser recording.");
      return;
    }
    
    // Low-spec: 150kbps keeps upload and encode costs low on weaker devices.
    let options: any = { videoBitsPerSecond: 150_000 };
    if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
        options.mimeType = 'video/webm;codecs=vp8,opus';
    } else if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('video/mp4')) {
        options.mimeType = 'video/mp4';
    }

    const questionIndex = state.currentQuestionIndex;
    const isLastQuestion = questionIndex >= state.questions.length - 1;
    let recorder: MediaRecorder;

    try {
      recorder = new MediaRecorder(streamRef.current, options);
    } catch (error) {
      console.error("MediaRecorder setup error:", error);
      setCameraError("Recording could not be started on this browser/device.");
      return;
    }

    chunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onerror = (error) => {
      console.error("Recorder error:", error);
      answerDeadlineRef.current = null;
      setIsRecording(false);
      setIsStopping(false);
      setProcessingVideo(false);
      setCameraError("Recording failed. Please refresh and try again.");
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
      chunksRef.current = [];
      answerDeadlineRef.current = null;

      setState(prev => {
        const nextAnswers = [...prev.answers];
        const nextTranscriptTexts = prev.transcriptTexts
          ? [...prev.transcriptTexts]
          : Array(prev.questions.length).fill(null);

        nextAnswers[questionIndex] = "Answered";
        nextTranscriptTexts[questionIndex] = null;

        return {
          ...prev,
          answers: nextAnswers,
          transcriptTexts: nextTranscriptTexts,
          currentQuestionIndex: isLastQuestion ? questionIndex : questionIndex + 1,
          pendingResponseCount: (prev.pendingResponseCount ?? 0) + 1,
        };
      });

      void processRecordedAnswer(blob, questionIndex, state.language);
      setProcessingVideo(false);
      setIsStopping(false);
      if (isLastQuestion) {
        onFinish();
      } else {
        setCountdown(5);
        setTimeLeft(QUESTION_TIME_MS / 1000);
      }
    };
    mediaRecorderRef.current = recorder;
    try {
      recorder.start();
      answerDeadlineRef.current = Date.now() + QUESTION_TIME_MS;
      setTimeLeft(QUESTION_TIME_MS / 1000);
      setIsRecording(true);
      setCameraError(null);
    } catch (error) {
      console.error("Recorder start error:", error);
      setCameraError("Recording could not be started on this browser/device.");
    }
  };

  const renderFullscreenOverlay = () => {
    if (isMobile) return null;
    if (!isFullscreen && !isTerminated) {
      return createPortal(
        <div className="interview-room-overlay fixed inset-0 z-[10000] bg-black/95 flex items-center justify-center p-4 sm:p-6 text-white text-center">
          <div className="interview-room-overlay-card max-w-md w-full p-6 sm:p-8 bg-[#111] rounded-2xl border border-red-500/30 shadow-2xl relative overflow-hidden max-h-[90vh] overflow-y-auto">
            <i className="fas fa-exclamation-triangle text-5xl text-yellow-500 mb-4"></i>
            <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">Fullscreen Required</h2>
            <p className="interview-room-overlay-copy text-gray-300 mb-6 font-medium text-xs sm:text-sm leading-relaxed">
              {cameraError || fullscreenError || (
                hasEnteredFullscreenRef.current
                  ? `You have exited fullscreen mode. You have ${3 - fullscreenEscapes} escape(s) remaining before automatic termination.`
                  : "This assessment must be taken in fullscreen mode to ensure a secure environment. Please enter fullscreen to start."
              )}
            </p>
            <button 
              onClick={async () => {
                setFullscreenError(null);
                try {
                  const docEl = document.documentElement as HTMLElement & {
                    webkitRequestFullscreen?: () => Promise<void>;
                    msRequestFullscreen?: () => Promise<void>;
                  };

                  if (docEl.requestFullscreen) {
                    await docEl.requestFullscreen();
                  } else if (docEl.webkitRequestFullscreen) {
                    await docEl.webkitRequestFullscreen();
                  } else if (docEl.msRequestFullscreen) {
                    await docEl.msRequestFullscreen();
                  } else {
                    setFullscreenError("Fullscreen mode is not supported on this browser/device.");
                  }
                } catch (err) {
                  console.error("Fullscreen error:", err);
                  setFullscreenError("Fullscreen could not be enabled. Please allow fullscreen and try again.");
                }
              }}
              className="interview-room-primary-button w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg hover:shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-2"
            >
              <i className="fas fa-terminal text-lg"></i>
              {hasEnteredFullscreenRef.current ? "Return to Fullscreen" : "Enter Fullscreen & Start"}
            </button>
          </div>
        </div>,
        document.body
      );
    }
    return null;
  };

  // --- SPLIT-PANEL DASHBOARD LAYOUT ---
  return (
    <div
      className="interview-room-shell fixed inset-0 z-[9999] bg-gray-100 dark:bg-slate-950 text-gray-900 dark:text-white flex flex-col overflow-hidden select-none"
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      {renderFullscreenOverlay()}

      {cameraError && (
        <div className="interview-room-banner-wrap px-2 md:px-3 pt-2 md:pt-3">
          <div className="interview-room-banner w-full px-3 md:px-5 py-2.5 md:py-3 bg-red-50 dark:bg-red-900/30 rounded-lg md:rounded-xl border border-red-200 dark:border-red-700/50 shadow-sm text-red-700 dark:text-red-300 text-xs md:text-sm font-medium">
            {cameraError}
          </div>
        </div>
      )}

      {/* Main content: camera (left) + question (right) */}
      <div className="interview-room-grid flex-1 flex flex-col md:flex-row gap-2 md:gap-3 p-2 md:p-3 overflow-hidden min-h-0">

        {/* Left panel: AI Interviewer & camera feed */}
        <div className="interview-room-camera-column w-full md:w-5/12 flex flex-col gap-1.5 md:gap-3 shrink-0 md:shrink md:min-h-0">
          {/* AI Interviewer Avatar Card */}
          <div className="interview-room-avatar-card relative min-h-[150px] h-[28vh] md:h-auto md:flex-1 bg-slate-900 dark:bg-slate-950 rounded-xl md:rounded-2xl overflow-hidden border border-gray-200/10 dark:border-white/5 shadow-2xl flex flex-col items-center justify-center p-5">
            <style>{`
              @keyframes soundbar {
                0%, 100% { height: 20%; }
                50% { height: 100%; }
              }
            `}</style>
            
            {/* Holographic scanner grid backdrop */}
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
              backgroundImage: 'radial-gradient(circle, rgba(59,130,246,0.15) 1px, transparent 1px)',
              backgroundSize: '16px 16px'
            }}></div>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-transparent to-purple-600/10 pointer-events-none"></div>
            
            {/* Advanced AI Hologram Visualizer */}
            <div className="relative w-24 h-24 md:w-36 md:h-36 flex items-center justify-center">
              {/* Outer orbit/ring with rotating dash */}
              <div className={`absolute inset-0 rounded-full border border-dashed border-blue-500/40 ${isSpeaking ? 'animate-spin' : 'animate-[spin_20s_linear_infinite]'} opacity-60`}></div>
              
              {/* Middle glowing shell */}
              <div className={`absolute inset-3 rounded-full border border-purple-500/20 bg-purple-500/5 transition-all duration-700 ${
                isSpeaking ? 'scale-105 opacity-80 shadow-[0_0_25px_rgba(168,85,247,0.3)]' : 'scale-100 opacity-40 shadow-none'
              }`}></div>

              {/* Holographic sound waves / node mesh */}
              <svg className="absolute w-full h-full pointer-events-none z-10" viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>

                {/* Animated speech frequency wave arcs */}
                <circle cx="50" cy="50" r="32" fill="none" stroke="url(#avatarGrad)" strokeWidth="1" strokeDasharray="5,15" className={`origin-center transition-all ${isSpeaking ? 'animate-[spin_4s_linear_infinite]' : 'animate-[spin_12s_linear_infinite]'}`} />
                <circle cx="50" cy="50" r="28" fill="none" stroke="#8b5cf6" strokeWidth="1.5" strokeDasharray="40,20" className={`origin-center transition-all ${isSpeaking ? 'animate-[spin_6s_linear_infinite_reverse] opacity-80' : 'animate-[spin_18s_linear_infinite_reverse] opacity-40'}`} />

                {/* Neural grid nodes when speaking */}
                {isSpeaking ? (
                  <>
                    <path d="M 30,50 Q 50,20 70,50 Q 50,80 30,50" fill="none" stroke="#3b82f6" strokeWidth="0.5" opacity="0.3" className="animate-pulse" />
                    <path d="M 50,30 Q 80,50 50,70 Q 20,50 50,30" fill="none" stroke="#8b5cf6" strokeWidth="0.5" opacity="0.3" className="animate-pulse" />
                  </>
                ) : null}
              </svg>

              {/* Centered Hologram Core with Recruiter Image */}
              <div className={`relative w-16 h-16 md:w-22 md:h-22 rounded-full overflow-hidden border-2 border-blue-500/50 flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.3)] z-20 transition-all duration-300 ${
                isSpeaking ? 'scale-105 border-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.5)]' : ''
              }`}>
                <img 
                  src="/recruiter_avatar.png" 
                  alt="AI Recruiter" 
                  className={`w-full h-full object-cover transition-transform duration-300 ${isSpeaking ? 'scale-105' : 'scale-100'}`} 
                />
              </div>
            </div>

            {/* Small speech frequency wave bars under avatar */}
            <div className="h-4 flex items-end gap-0.5 mt-2.5 z-10">
              {isSpeaking ? (
                <>
                  <span className="w-0.5 bg-blue-400 rounded-full animate-[soundbar_0.8s_ease-in-out_infinite]" style={{ height: '40%' }}></span>
                  <span className="w-0.5 bg-blue-300 rounded-full animate-[soundbar_0.6s_ease-in-out_infinite_0.1s]" style={{ height: '80%' }}></span>
                  <span className="w-0.5 bg-purple-400 rounded-full animate-[soundbar_0.7s_ease-in-out_infinite_0.3s]" style={{ height: '50%' }}></span>
                  <span className="w-0.5 bg-purple-300 rounded-full animate-[soundbar_0.5s_ease-in-out_infinite_0.2s]" style={{ height: '100%' }}></span>
                  <span className="w-0.5 bg-blue-400 rounded-full animate-[soundbar_0.9s_ease-in-out_infinite_0.4s]" style={{ height: '30%' }}></span>
                </>
              ) : (
                <div className="flex gap-0.5">
                  <span className="w-0.5 h-1 bg-gray-500 rounded-full opacity-40"></span>
                  <span className="w-0.5 h-1 bg-gray-500 rounded-full opacity-40"></span>
                  <span className="w-0.5 h-1 bg-gray-500 rounded-full opacity-40"></span>
                  <span className="w-0.5 h-1 bg-gray-500 rounded-full opacity-40"></span>
                  <span className="w-0.5 h-1 bg-gray-500 rounded-full opacity-40"></span>
                </div>
              )}
            </div>

            {/* Speaking/Listening Status Indicator */}
            <div className="mt-3 md:mt-4 text-center z-10">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] md:text-xs font-bold transition-all duration-300 ${
                isSpeaking 
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isSpeaking ? 'bg-blue-400 animate-ping' : 'bg-emerald-400'}`}></span>
                {isSpeaking ? 'AI Speaking' : 'Listening...'}
              </span>
              <p className="text-[10px] md:text-xs text-slate-400 mt-1.5 font-bold uppercase tracking-widest">AI Recruiter</p>
            </div>
          </div>

          {/* Camera Card */}
          <div className="interview-room-camera-card relative min-h-[140px] h-[25vh] md:h-auto md:flex-1 md:min-h-[200px] bg-gray-900 rounded-xl md:rounded-2xl overflow-hidden border border-gray-700/50 shadow-xl">
            <video ref={videoRef} autoPlay muted playsInline className="interview-room-camera-video w-full h-full object-cover transform scale-x-[-1]" />

            {/* Countdown Overlay (scoped to camera) */}
            {sessionReady && countdown > 0 && (
              <div className="interview-room-countdown absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center z-20 rounded-xl md:rounded-2xl">
                <p className="text-white/80 text-xs md:text-sm font-light mb-1 tracking-widest uppercase">Get Ready</p>
                <span className="text-4xl md:text-6xl font-black text-white">{countdown}</span>
              </div>
            )}

            {/* TicTacToe during processing (scoped to camera) */}
            {processingVideo && <TicTacToe />}

            {/* Gradient bottom edge */}
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-gray-900/80 to-transparent pointer-events-none"></div>
          </div>

          {/* Status Bar Below Camera */}
          <div className="interview-room-meta flex items-center justify-between px-2 md:px-4 py-1.5 md:py-2.5 bg-white dark:bg-gray-800/60 rounded-lg md:rounded-xl border border-gray-200 dark:border-gray-700/50 shadow-sm">
            <div className="flex items-center gap-2 md:gap-3">
              {/* REC Indicator */}
              {isRecording ? (
                <div className="interview-room-badge is-recording flex items-center gap-1 md:gap-1.5 bg-red-500/15 text-red-600 dark:text-red-400 px-2 md:px-2.5 py-0.5 md:py-1 rounded-md md:rounded-lg text-[10px] md:text-[11px] font-bold uppercase tracking-wider">
                  <div className="w-1.5 md:w-2 h-1.5 md:h-2 bg-red-500 rounded-full"></div>
                  REC
                </div>
              ) : !cameraReady ? (
                <div className="interview-room-badge is-pending flex items-center gap-1 md:gap-1.5 bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 px-2 md:px-2.5 py-0.5 md:py-1 rounded-md md:rounded-lg text-[10px] md:text-[11px] font-bold uppercase tracking-wider">
                  <div className="w-1.5 md:w-2 h-1.5 md:h-2 bg-yellow-500 rounded-full"></div>
                  INITIALIZING
                </div>
              ) : (
                <div className="interview-room-badge flex items-center gap-1 md:gap-1.5 bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 px-2 md:px-2.5 py-0.5 md:py-1 rounded-md md:rounded-lg text-[10px] md:text-[11px] font-medium">
                  <div className="w-1.5 md:w-2 h-1.5 md:h-2 bg-gray-400 rounded-full"></div>
                  STANDBY
                </div>
              )}
            </div>
            <div className={`interview-room-badge ${isFullscreen ? 'is-good bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20' : 'is-pending bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20'} px-2 md:px-2.5 py-0.5 md:py-1 rounded-md md:rounded-lg text-[10px] md:text-[11px] font-mono font-semibold border`}>
              {isFullscreen ? 'FULLSCREEN ON' : 'FULLSCREEN OFF'}
            </div>
          </div>
        </div>

        {/* Right panel: question + controls */}
        <div className="interview-room-question-column w-full md:w-7/12 flex flex-col gap-2 md:gap-3 min-h-0 flex-1">
          {/* Question Card */}
          <div className="interview-room-question-card flex-1 flex flex-col bg-white dark:bg-gray-800/60 rounded-xl md:rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-xl overflow-hidden min-h-0">

            {/* Question Header: Counter + Timer */}
            <div className="interview-room-question-header flex items-center justify-between px-3 md:px-6 py-2.5 md:py-4 border-b border-gray-100 dark:border-gray-700/50 shrink-0">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="interview-room-question-icon w-6 h-6 md:w-8 md:h-8 rounded-md md:rounded-lg bg-blue-500/10 dark:bg-blue-500/15 flex items-center justify-center">
                  <i className="fas fa-list-ol text-blue-500 text-xs md:text-sm"></i>
                </div>
                <div>
                  <p className="text-[9px] md:text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-widest font-medium">Question</p>
                  <p className="text-sm md:text-lg font-bold text-gray-800 dark:text-white">
                    {state.currentQuestionIndex + 1} <span className="text-gray-400 dark:text-gray-500 text-xs md:text-sm font-normal">/ {state.questions.length}</span>
                  </p>
                </div>
              </div>
              {/* Timer */}
              <div className={`interview-room-timer flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl font-mono font-bold text-xs md:text-sm transition-colors ${timeLeft < 30
                ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
                : 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-700/50 dark:text-white dark:border-gray-600'
                } border shadow-sm`}>
                <div className={`w-1.5 md:w-2 h-1.5 md:h-2 rounded-full ${isRecording ? 'bg-red-500' : 'bg-gray-400 dark:bg-gray-500'}`}></div>
                <i className="fas fa-clock text-[10px] md:text-xs opacity-60"></i>
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
              </div>
            </div>

            {/* Question Body */}
            <div className="interview-room-question-body flex-1 overflow-y-auto px-3 md:px-6 py-3 md:py-6 flex items-start">
              <div className="w-full">
                <p className="interview-room-question-label text-[10px] md:text-xs text-blue-500 dark:text-blue-400 font-semibold uppercase tracking-widest mb-2 md:mb-3">
                  <i className="fas fa-microphone-alt mr-1"></i> Answer this question
                </p>
                <h2 className="text-base md:text-2xl font-semibold leading-relaxed text-gray-800 dark:text-gray-100">
                  {currentQ}
                </h2>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="interview-room-question-actions flex items-center justify-end gap-2 md:gap-3 px-3 md:px-6 py-2.5 md:py-4 border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30 shrink-0">

              {/* Next / Stop Button */}
              {isRecording ? (
                <button
                  onClick={stopRecording}
                  className="interview-room-primary-button flex items-center gap-2 px-4 md:px-6 py-2 md:py-2.5 rounded-lg md:rounded-xl font-bold text-xs md:text-sm bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/20 transform transition hover:scale-[1.02] active:scale-95"
                >
                  Next
                  <i className="fas fa-arrow-right"></i>
                </button>
              ) : processingVideo || isStopping ? (
                <div className="interview-room-state-chip flex items-center gap-2 px-4 md:px-6 py-2 md:py-2.5 rounded-lg md:rounded-xl text-xs md:text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                  <i className="fas fa-circle-notch fa-spin"></i>
                  Loading next...
                </div>
              ) : (
                <div className="interview-room-state-chip is-muted flex items-center gap-2 px-4 md:px-6 py-2 md:py-2.5 rounded-lg md:rounded-xl text-xs md:text-sm font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600">
                  <i className="fas fa-hourglass-half"></i>
                  Ready
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="interview-room-footer shrink-0 px-2 md:px-3 pb-2 md:pb-3">
        {/* Tab-switch warning banner (red, real-time) */}
        {tabWarning && (
          <div className="interview-room-warning w-full px-3 md:px-5 py-2 md:py-3 bg-red-50 dark:bg-red-900/30 rounded-lg md:rounded-xl border border-red-200 dark:border-red-700/50 shadow-sm flex items-center gap-2 md:gap-3">
            <div className="w-5 md:w-7 h-5 md:h-7 rounded-md md:rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
              <i className="fas fa-exclamation-triangle text-red-500 text-[10px] md:text-xs"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] md:text-[10px] text-red-600 dark:text-red-400 uppercase tracking-widest font-bold mb-0.5">Security Alert</p>
              <p className="text-xs md:text-sm text-red-700 dark:text-red-300 font-semibold truncate">{tabWarning}</p>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-mono font-bold shrink-0">
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
              FLAGGED
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Submission Screen ---
const InterviewSubmission: React.FC<{
  state: InterviewState;
  tabSwitches: number;
  interviewId: string;
  candidateInfo: CandidateInfo;
  terminated: boolean;
}> = ({ state, tabSwitches, interviewId, candidateInfo, terminated }) => {
  const { user } = useAuth();
  const [status, setStatus] = useState("Finalizing transcripts...");
  const [showCompletionPopup, setShowCompletionPopup] = useState(false);
  const [reportUrl, setReportUrl] = useState('');
  const [finalScores, setFinalScores] = useState<{ overall: string, resume: string, qna: string } | null>(null);
  const navigate = useNavigate();
  const [factIndex, setFactIndex] = useState(0);
  const hasSubmittedRef = useRef(false);
  const latestStateRef = useRef(state);
  const facts = [
    "The first computer bug was a real moth.", "Symbolics.com was the first domain.", "NASA's internet is 91 GB/s.",
    "The Firefox logo is a red panda.", "Email existed before the Web."
  ];

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    const i = setInterval(() => setFactIndex(p => (p + 1) % facts.length), 4000);
    return () => clearInterval(i);
  }, [facts.length]);

  useEffect(() => {
    // Guard: only run once - object deps (state, candidateInfo, terminated) cause
    // React to re-fire this effect on every render, creating duplicate reports.
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;

    const finalize = async () => {
      const waitForPendingResponses = async () => {
        let attempts = 0;

        while ((latestStateRef.current.pendingResponseCount ?? 0) > 0 && attempts < 180) {
          const pendingResponses = latestStateRef.current.pendingResponseCount ?? 0;
          setStatus(`Processing ${pendingResponses} recorded answer${pendingResponses === 1 ? '' : 's'}...`);
          await sleep(1000);
          attempts++;
        }
      };

      const resolveTranscriptText = async (transcriptId: string | null, existingText: string | null) => {
        if (!transcriptId) {
          return existingText || '(Transcript unavailable)';
        }

        if (existingText) {
          return existingText;
        }

        for (let attempts = 0; attempts < TRANSCRIPT_POLL_ATTEMPTS; attempts++) {
          await sleep(TRANSCRIPT_POLL_DELAY_MS);
          const res = await fetchTranscriptText(transcriptId);

          if (res.status === 'completed' || res.status === 'error') {
            return res.text || '(No speech detected)';
          }
        }

        return '(Transcription timeout)';
      };

      try {
        await waitForPendingResponses();
        setStatus("Finalizing transcripts...");
        const finalState = latestStateRef.current;
        const transcriptTexts = await Promise.all(
          finalState.questions.map((_, index) =>
            resolveTranscriptText(
              finalState.transcriptIds[index] ?? null,
              finalState.transcriptTexts?.[index] ?? null
            )
          )
        );
        
        setStatus("AI Analyzing performance...");
        let base64Resume = finalState.candidateResumeBase64;
        let resumeTextContent = finalState.candidateResumeText;
        
        if (!base64Resume) {
          // Fallback to fetch resume if not already base64'd (e.g. from Cloudinary URL)
          if (!finalState.candidateResumeURL) {
              throw new Error("Candidate resume URL is missing for feedback generation.");
          }

          const resp = await fetch(finalState.candidateResumeURL);
          const blob = await resp.blob();

          if (!resumeTextContent) {
            resumeTextContent = await extractResumeText(blob);
          }

          base64Resume = await getBlobAsBase64(blob);
        }

        const candidateExperience = (candidateInfo.experienceType === 'experienced' && candidateInfo.totalExperienceYears)
            ? `${candidateInfo.totalExperienceYears} years ${candidateInfo.totalExperienceMonths} months`
            : "0 years";

        const feedbackRaw = await generateFeedback(
          finalState.jobTitle,
          finalState.jobDescription,
          candidateExperience,
          base64Resume,
          finalState.candidateResumeMimeType!,
          finalState.questions,
          transcriptTexts,
          resumeTextContent,
          finalState.strictness || 'Medium'
        );

        // The AI prompt for generateFeedback should be structured to consistently return scores
        // in the format: "Overall Score: X/100", "Resume Score: Y/100", "Q&A Score: Z/100".
        // We now calculate the overall score on the client side.
        const parseScoreValue = (regex: RegExp): number => {
          const match = feedbackRaw.match(regex);
          if (match && match[1]) {
            return parseInt(match[1], 10);
          }
          return 0;
        };

        const resumeScoreNum = parseScoreValue(/Resume Score:\s*(\d{1,3})(?:\s*\/\s*100)?/i);
        const qnaScoreNum = parseScoreValue(/Q&A Score:\s*(\d{1,3})(?:\s*\/\s*100)?/i);

        // Calculate Overall Score based on the defined mathematical model
        const overallScoreNum = Math.round((resumeScoreNum * 0.4) + (qnaScoreNum * 0.6));

        setFinalScores({
          overall: (overallScoreNum / 10).toFixed(1),
          resume: (resumeScoreNum / 10).toFixed(1),
          qna: (qnaScoreNum / 10).toFixed(1)
        });

        setStatus("Saving Report...");
        const attemptData = {
            ...finalState,
            candidateResumeBase64: null, // Do not bloat Firebase storage
            transcriptTexts,
            pendingResponseCount: 0,
            feedback: feedbackRaw,
            score: `${overallScoreNum}/100`,
            resumeScore: `${resumeScoreNum}/100`,
            qnaScore: `${qnaScoreNum}/100`,
            candidateInfo,
            status: terminated ? 'Terminated' : 'Completed',
            submittedAt: serverTimestamp(), 
            candidateUID: user?.uid || null,
            interviewId: interviewId,
            jobId: interviewId,
            isMock: state.isMock || false,
            meta: { tabSwitchCount: tabSwitches }
        }
        const docRef = await addDoc(collection(db, 'interviews', interviewId, 'attempts'), attemptData);
        setReportUrl(`/report/${interviewId}/${docRef.id}`);
        setShowCompletionPopup(true);
        setStatus('Successfully Submitted!');
      } catch (err) { 
          console.error("Finalization error:", err);
          setStatus("An error occurred while saving your report. Please contact support."); 
      }
    };
    finalize();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
      <>
      <div className="interview-completion-shell min-h-screen bg-gray-50 dark:bg-transparent flex flex-col items-center justify-center p-4">
        <div className="interview-completion-spinner relative w-24 h-24 mb-8">
          <div className="absolute inset-0 border-4 border-green-100 dark:border-gray-800 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-t-green-500 border-r-green-400 border-b-transparent border-l-transparent rounded-full animate-spin"></div>
          <i className="fas fa-check absolute inset-0 flex items-center justify-center text-3xl text-green-500"></i>
        </div>
        <h2 className="interview-completion-title text-3xl font-bold text-gray-800 dark:text-white mb-2">
          {terminated ? 'Interview Terminated' : 'Interview Complete'}
        </h2>
        <p className={`interview-completion-status mb-12 ${terminated ? 'text-red-500 font-bold' : 'text-gray-500 dark:text-gray-400'}`}>
          {terminated ? 'Session revoked due to security violations.' : status}
        </p>

        <div className="interview-completion-fact bg-white dark:bg-gray-800 p-6 rounded-2xl max-w-lg text-center border border-gray-100 dark:border-gray-700 shadow-xl">
          <p className="text-xs font-bold text-blue-500 uppercase mb-3 tracking-widest">While we process</p>
          <p className="text-gray-700 dark:text-gray-300 italic text-lg transition-all duration-500">"{facts[factIndex]}"</p>
        </div>
      </div>

      {showCompletionPopup && createPortal(
        <div className="interview-completion-overlay fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4" onClick={() => navigate('/')}>
          <div className="interview-completion-modal bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg text-center p-8 m-4 animate-fade-in-up" onClick={e => e.stopPropagation()}>
            <div className="interview-completion-icon w-20 h-20 mx-auto bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center mb-4 border-4 border-green-200 dark:border-green-800">
                <i className="fas fa-award text-4xl text-green-500"></i>
            </div>
            <h3 className="font-bold text-2xl text-gray-900 dark:text-white mb-2">Thank You!</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Your interview has been successfully submitted. The recruiter will be in touch with the next steps.</p>
            
            <div className="interview-completion-next bg-blue-50 dark:bg-blue-900/30 p-6 rounded-xl border border-blue-100 dark:border-blue-800">
              <h4 className="font-semibold text-lg text-blue-800 dark:text-blue-300 mb-2">Performance Scores</h4>
              
              {finalScores && (
                <div className="flex justify-around items-center my-4 bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-blue-100 dark:border-blue-700">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{finalScores.overall} <span className="text-sm font-normal text-gray-500">/ 10</span></p>
                    <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-widest mt-1">Overall</p>
                  </div>
                  <div className="w-px h-12 bg-gray-200 dark:bg-gray-700"></div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{finalScores.resume} <span className="text-sm font-normal text-gray-500">/ 10</span></p>
                    <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-widest mt-1">Resume</p>
                  </div>
                  <div className="w-px h-12 bg-gray-200 dark:bg-gray-700"></div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{finalScores.qna} <span className="text-sm font-normal text-gray-500">/ 10</span></p>
                    <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-widest mt-1">Q&A</p>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <a href={`#${reportUrl}`} target="_blank" rel="noopener noreferrer" className="interview-completion-primary w-full bg-blue-600 text-white font-bold py-3 px-5 rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20 transform hover:-translate-y-0.5 flex justify-center items-center gap-2">
                  <i className="fa-solid fa-file-alt"></i> View Detailed Report
                </a>
                <button onClick={() => navigate('/submit-review')} className="interview-completion-primary w-full bg-gradient-to-r from-pink-500 to-orange-400 text-white font-bold py-3 px-5 rounded-lg hover:from-pink-600 hover:to-orange-500 transition-colors shadow-lg shadow-pink-500/20 transform hover:-translate-y-0.5 flex justify-center items-center gap-2">
                  <i className="fa-solid fa-star text-yellow-300"></i> Give Review
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button onClick={() => navigate('/')} className="interview-completion-secondary w-full text-center px-5 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Go to Homepage
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default CandidateInterviewFlow;
