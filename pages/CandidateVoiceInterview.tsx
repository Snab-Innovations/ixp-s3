import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, RotateCcw, FastForward, 
  Sparkles, CheckCircle2, AlertCircle, Clock, Shield, MapPin, Briefcase, FileText, ArrowRight,
  UploadCloud, FileCheck, Trash2
} from 'lucide-react';
import { 
  getVoiceInterview, 
  detectCandidateVoiceIntent, 
  generateCrossQuestionOrAcknowledge, 
  evaluateVoiceInterviewSession, 
  saveVoiceInterviewResponse,
  DEFAULT_SCREENING_QUESTIONS,
  specializeQuestions
} from '../services/voiceInterviewService';
import { resolveJobOrInterviewDocument } from '../services/jobResolutionService';
import { speak, unlockTTSAudio } from '../lib/tts';
import { VoiceInterview, VoiceInterviewQuestion, VoiceInterviewTurn, VoiceInterviewResponse } from '../types';
import { db } from '../services/firebase';
import { AssemblyAiRealtimeSession } from '../services/assemblyAiStreaming';
import { VoiceCallRecorder } from '../services/voiceCallRecorder';
import { uploadToS3 } from '../services/s3Service';
import { fetchPollyAudioBlob } from '../services/pollyService';
import { readResumeText } from '../services/resumeService';

export const CandidateVoiceInterview: React.FC = () => {
  const { voiceInterviewId } = useParams<{ voiceInterviewId: string }>();

  // Data states
  const [voiceInterview, setVoiceInterview] = useState<VoiceInterview | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Candidate Details state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [currentCity, setCurrentCity] = useState('');
  const [dumpFoundNotice, setDumpFoundNotice] = useState<string | null>(null);

  // Resume Upload State
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeFileName, setResumeFileName] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [parsingResume, setParsingResume] = useState(false);
  const [resumeSuccessMsg, setResumeSuccessMsg] = useState<string | null>(null);

  // Call states: 'details' | 'ready' | 'calling' | 'completed'
  const [callState, setCallState] = useState<'details' | 'ready' | 'calling' | 'completed'>('details');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [candidateListening, setCandidateListening] = useState(false);
  const [isProcessingAnswer, setIsProcessingAnswer] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [activeCrossQuestion, setActiveCrossQuestion] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [dialogueHistory, setDialogueHistory] = useState<VoiceInterviewTurn[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const [savingReport, setSavingReport] = useState(false);
  const [uploadingRecording, setUploadingRecording] = useState(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [remainingWaitSeconds, setRemainingWaitSeconds] = useState<number | null>(null);
  const [completedResponse, setCompletedResponse] = useState<VoiceInterviewResponse | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState('');

  // Always-fresh refs to prevent stale closure bugs in Web Speech API & timeouts
  const callStateRef = useRef<'details' | 'ready' | 'calling' | 'completed'>('details');
  const isMicMutedRef = useRef(false);
  const isAudioMutedRef = useRef(false);
  const aiSpeakingRef = useRef(false);
  const isProcessingAnswerRef = useRef(false);
  const currentQuestionIndexRef = useRef(0);
  const activeCrossQuestionRef = useRef<string | null>(null);
  const accumulatedAnswerRef = useRef<string>('');
  const liveTranscriptRef = useRef<string>('');
  const voiceInterviewRef = useRef<VoiceInterview | null>(null);

  const assemblySessionRef = useRef<AssemblyAiRealtimeSession | null>(null);
  const callRecorderRef = useRef<VoiceCallRecorder | null>(null);
  const noReplyTimerRef = useRef<any>(null);
  const countdownIntervalRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const isSpeechActiveRef = useRef(false);
  const callTimerRef = useRef<any>(null);
  const dialogueHistoryRef = useRef<VoiceInterviewTurn[]>([]);
  const answersSummaryRef = useRef<Array<{ question: string; answer: string; crossQuestions?: Array<{ question: string; answer: string }> }>>([]);
  const silenceTimerRef = useRef<any>(null);
  const webSpeechNetworkFailuresRef = useRef<number>(0);

  // Keep refs in sync with state
  useEffect(() => { callStateRef.current = callState; }, [callState]);
  useEffect(() => { isMicMutedRef.current = isMicMuted; }, [isMicMuted]);
  useEffect(() => { isAudioMutedRef.current = isAudioMuted; }, [isAudioMuted]);
  useEffect(() => { aiSpeakingRef.current = aiSpeaking; }, [aiSpeaking]);
  useEffect(() => { currentQuestionIndexRef.current = currentQuestionIndex; }, [currentQuestionIndex]);
  useEffect(() => { activeCrossQuestionRef.current = activeCrossQuestion; }, [activeCrossQuestion]);
  useEffect(() => { voiceInterviewRef.current = voiceInterview; }, [voiceInterview]);

  const updateLiveTranscript = (text: string) => {
    liveTranscriptRef.current = text;
    setLiveTranscript(text);
  };

  // Load Voice Interview or Job Document
  useEffect(() => {
    if (!voiceInterviewId) {
      setErrorMsg('Invalid voice interview link.');
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        // 1. Try finding in voiceInterviews collection
        try {
          const existingVoice = await getVoiceInterview(voiceInterviewId);
          if (existingVoice) {
            setVoiceInterview(existingVoice);
            setLoading(false);
            return;
          }
        } catch (voiceErr) {
          console.warn('[Voice Interview] Note: voiceInterviews query caught error, trying job resolver fallback:', voiceErr);
        }

        // 2. Try resolving as standard job / interview ID
        const resolvedJob = await resolveJobOrInterviewDocument(voiceInterviewId);
        if (resolvedJob && resolvedJob.data) {
          const jd = resolvedJob.data as any;
          const questions = (jd.questions && jd.questions.length > 0)
            ? jd.questions.map((q: any, i: number) => ({
                id: `q_${i}`,
                question: typeof q === 'string' ? q : (q.text || q.question || 'Describe your experience.'),
                category: 'skills'
              }))
            : DEFAULT_SCREENING_QUESTIONS;

          setVoiceInterview({
            id: voiceInterviewId,
            jobId: resolvedJob.id,
            interviewId: resolvedJob.id,
            title: jd.title || jd.jobTitle || 'Phone Screening Call',
            jobTitle: jd.title || jd.jobTitle || 'Role',
            jobDescription: jd.description || jd.jobDescription || '',
            companyName: jd.company || jd.companyName || 'Hiring Team',
            location: jd.location || '',
            recruiterUID: jd.recruiterUID || jd.recruiterId || '',
            questions,
            status: 'active',
            createdAt: new Date()
          });
          setLoading(false);
          return;
        }

        setErrorMsg('Voice interview not found or has expired.');
      } catch (err: any) {
        console.error('[Voice Interview] Load error:', err);
        setErrorMsg('Failed to load voice interview details.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [voiceInterviewId]);

  // Lookup Candidate in Resume Dump when email is typed
  useEffect(() => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@') || !trimmed.includes('.')) return;

    const timer = setTimeout(async () => {
      try {
        let snap = await getDocs(query(collection(db, 'resumeDumpCandidates'), where('email', '==', trimmed), limit(1)));
        if (snap.empty) {
          snap = await getDocs(query(collection(db, 'resumeDumpCandidates'), where('profile.email', '==', trimmed), limit(1)));
        }
        if (snap.empty) {
          snap = await getDocs(query(collection(db, 'resumeDump'), where('email', '==', trimmed), limit(1)));
        }

        if (!snap.empty) {
          const raw = snap.docs[0].data();
          const p = (raw.profile && typeof raw.profile === 'object') ? raw.profile : raw;
          if (p.name && !name) setName(p.name);
          if (p.phone && !phone) setPhone(p.phone);
          if ((p.location || p.city) && !currentCity) setCurrentCity(p.location || p.city);
          setDumpFoundNotice('Found your profile in candidate database! Information auto-filled.');
        }
      } catch (_) {}
    }, 400);

    return () => clearTimeout(timer);
  }, [email]);

  // Handle Resume Upload & Auto-Fill
  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsingResume(true);
    setResumeSuccessMsg(null);
    setErrorMsg(null);

    try {
      // 1. Extract raw text from PDF/DOCX/TXT
      const extractedText = await readResumeText(file, file.name);
      setResumeFile(file);
      setResumeFileName(file.name);
      setResumeText(extractedText);

      // 2. Intelligent regex extraction to auto-fill candidate inputs
      const emailMatch = extractedText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
      if (emailMatch && (!email || !email.trim())) {
        setEmail(emailMatch[1].trim().toLowerCase());
      }

      const phoneMatch = extractedText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\+?91[-.\s]?[6-9]\d{9}/);
      if (phoneMatch && (!phone || !phone.trim())) {
        setPhone(phoneMatch[0].trim());
      }

      // Check for candidate's current city in resume
      const popularCities = ['Nashik', 'Pune', 'Mumbai', 'Bengaluru', 'Bangalore', 'Hyderabad', 'Delhi', 'Noida', 'Gurugram', 'Gurgaon', 'Chennai', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Indore', 'Nagpur', 'Chandigarh'];
      for (const city of popularCities) {
        if (new RegExp(`\\b${city}\\b`, 'i').test(extractedText)) {
          if (!currentCity || !currentCity.trim()) {
            setCurrentCity(city);
          }
          break;
        }
      }

      // 3. Upload to AWS S3 bucket
      const s3Name = `resumes/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      uploadToS3(file, 'raw', s3Name)
        .then(uploadedUrl => {
          setResumeUrl(uploadedUrl);
        })
        .catch(err => {
          console.warn('[Voice Interview] Resume upload warning:', err);
        });

      setResumeSuccessMsg(`Resume "${file.name}" uploaded! Candidate details auto-filled.`);
    } catch (err: any) {
      console.error('[Voice Interview] Error parsing resume:', err);
      setErrorMsg('Could not read resume file. Please upload a valid PDF, DOCX, or TXT file.');
    } finally {
      setParsingResume(false);
    }
  };

  const handleRemoveResume = () => {
    setResumeFile(null);
    setResumeFileName('');
    setResumeUrl('');
    setResumeText('');
    setResumeSuccessMsg(null);
  };

  // Call duration counter
  useEffect(() => {
    if (callState === 'calling') {
      callTimerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [callState]);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Setup Web Speech Recognition with accumulated transcript and silence detection
  const initSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API not available in this browser.');
      return null;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    const preferredLang = navigator.language || 'en-IN';
    rec.lang = preferredLang.startsWith('en') ? preferredLang : 'en-US';

    rec.onstart = () => {
      isSpeechActiveRef.current = true;
      setCandidateListening(true);
    };

    rec.onresult = (event: any) => {
      // If AI is speaking or an answer is currently being processed, ignore mic feedback
      if (aiSpeakingRef.current || isProcessingAnswerRef.current) return;

      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finalTranscript += res[0].transcript + ' ';
        } else {
          interimTranscript += res[0].transcript + ' ';
        }
      }

      const cleanTranscript = (finalTranscript + interimTranscript).trim();

      if (cleanTranscript) {
        accumulatedAnswerRef.current = cleanTranscript;
        updateLiveTranscript(cleanTranscript);
        setCandidateListening(true);

        // Reset silence detection timer
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        // Natural pause detection: when candidate stops speaking for 1.7s, submit the answer automatically!
        silenceTimerRef.current = setTimeout(() => {
          if (
            !aiSpeakingRef.current &&
            !isProcessingAnswerRef.current &&
            accumulatedAnswerRef.current.trim().length > 1
          ) {
            submitCandidateAnswer();
          }
        }, 1700);
      }
    };

    rec.onerror = (e: any) => {
      const err = e.error || 'unknown';
      console.warn('[Speech Recognition] Notice:', err);

      if (err === 'not-allowed' || err === 'service-not-allowed') {
        setErrorMsg('Microphone access was denied. Please allow microphone permissions in your browser to proceed.');
        return;
      }

      if (err === 'network') {
        webSpeechNetworkFailuresRef.current += 1;
        isSpeechActiveRef.current = false;
        recognitionRef.current = null;

        if (webSpeechNetworkFailuresRef.current <= 2) {
          console.info(`[Speech Recognition] Network notice. Retrying speech engine (attempt ${webSpeechNetworkFailuresRef.current}/2)...`);
          setTimeout(() => {
            if (callStateRef.current === 'calling' && !aiSpeakingRef.current && !isMicMutedRef.current) {
              startListening();
            }
          }, 800);
        } else {
          console.warn('[Speech Recognition] Web Speech service unavailable on this network. Using AssemblyAI/typed fallback.');
        }
        return;
      }

      if (err === 'no-speech' || err === 'aborted') {
        return;
      }
    };

    rec.onend = () => {
      isSpeechActiveRef.current = false;

      // If candidate finished speaking their answer and the browser ended recognition, process answer immediately!
      if (
        callStateRef.current === 'calling' &&
        !aiSpeakingRef.current &&
        !isProcessingAnswerRef.current &&
        accumulatedAnswerRef.current.trim().length > 1
      ) {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        submitCandidateAnswer();
        return;
      }

      // Automatically keep recognition running during the call if not muted and not speaking
      if (callStateRef.current === 'calling' && !isMicMutedRef.current && !aiSpeakingRef.current) {
        try {
          rec.start();
          isSpeechActiveRef.current = true;
          setCandidateListening(true);
        } catch (_) {}
      } else {
        setCandidateListening(false);
      }
    };

    return rec;
  };

  // Web Speech API Secondary Fallback
  const startWebSpeechFallback = () => {
    try {
      if (!recognitionRef.current) {
        recognitionRef.current = initSpeechRecognition();
      }
      if (recognitionRef.current && !isSpeechActiveRef.current) {
        recognitionRef.current.start();
        isSpeechActiveRef.current = true;
        setCandidateListening(true);
      }
    } catch (err: any) {
      console.warn('[Speech Fallback] Notice:', err);
    }
  };

  // Clear 8-second no-reply countdown timer
  const clearNoReplyTimer = () => {
    if (noReplyTimerRef.current) {
      clearTimeout(noReplyTimerRef.current);
      noReplyTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setRemainingWaitSeconds(null);
  };

  // Start 8-second timer waiting for candidate to respond to question
  const startNoReplyCountdown = () => {
    clearNoReplyTimer();
    setRemainingWaitSeconds(8);

    let secondsLeft = 8;
    countdownIntervalRef.current = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft >= 0) {
        setRemainingWaitSeconds(secondsLeft);
      } else {
        clearNoReplyTimer();
      }
    }, 1000);

    noReplyTimerRef.current = setTimeout(() => {
      clearNoReplyTimer();
      // If candidate did not reply within 8 seconds, automatically advance to next question
      if (
        callStateRef.current === 'calling' &&
        !aiSpeakingRef.current &&
        !isProcessingAnswerRef.current &&
        accumulatedAnswerRef.current.trim().length === 0
      ) {
        console.info('[Voice Interview] No reply received for 8 seconds. Automatically advancing to next question...');
        handleCandidateUtterance('I did not provide an answer for this question, please move forward to the next question');
      }
    }, 8000);
  };

  // Pause candidate mic during AI speech (keeps audio capture and WebSocket warm with rolling pre-roll)
  const pauseListening = () => {
    clearNoReplyTimer();
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (assemblySessionRef.current) {
      assemblySessionRef.current.pause();
    }
    if (recognitionRef.current && isSpeechActiveRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (_) {}
    }
    isSpeechActiveRef.current = false;
    setCandidateListening(false);
  };

  // Resume candidate mic with ZERO delay (flushes rolling pre-roll buffer so the very first words are never dropped!)
  const resumeListening = () => {
    if (aiSpeakingRef.current || isMicMutedRef.current || callStateRef.current !== 'calling') return;
    accumulatedAnswerRef.current = '';
    updateLiveTranscript('');

    if (assemblySessionRef.current) {
      assemblySessionRef.current.resume();
      isSpeechActiveRef.current = true;
      setCandidateListening(true);
    } else {
      startListening();
    }
  };

  // Primary Start Listening: Powered by AssemblyAI Real-Time Engine with 16kHz PCM and pre-roll buffers
  const startListening = async () => {
    if (aiSpeakingRef.current || isProcessingAnswerRef.current || isMicMutedRef.current) return;

    try {
      if (!assemblySessionRef.current) {
        assemblySessionRef.current = new AssemblyAiRealtimeSession({
          onTranscript: (text: string, isEndOfTurn: boolean, isFormatted?: boolean) => {
            if (aiSpeakingRef.current || isProcessingAnswerRef.current) return;
            // Candidate has replied: clear the 8-second no-reply countdown
            clearNoReplyTimer();

            accumulatedAnswerRef.current = text;
            updateLiveTranscript(text);
            setCandidateListening(true);

            // Wait 8 seconds after candidate answer: if candidate stays silent for 8s, submit answer automatically!
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = setTimeout(() => {
              if (
                !aiSpeakingRef.current &&
                !isProcessingAnswerRef.current &&
                accumulatedAnswerRef.current.trim().length > 1
              ) {
                submitCandidateAnswer();
              }
            }, 8000);
          },
          onError: (err) => {
            console.warn('[AssemblyAI Stream] Engine notice:', err);
            if (webSpeechNetworkFailuresRef.current < 2) {
              startWebSpeechFallback();
            }
          }
        });
      }

      await assemblySessionRef.current.start();
      isSpeechActiveRef.current = true;
      setCandidateListening(true);
      webSpeechNetworkFailuresRef.current = 0;
    } catch (assemblyErr) {
      console.warn('[AssemblyAI Stream] Primary start failed, checking fallback:', assemblyErr);
      if (webSpeechNetworkFailuresRef.current < 2) {
        startWebSpeechFallback();
      }
    }
  };

  // Full teardown at end of call or unmount
  const stopListening = () => {
    clearNoReplyTimer();
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    // Stop AssemblyAI session
    if (assemblySessionRef.current) {
      try {
        assemblySessionRef.current.stop();
      } catch (_) {}
      assemblySessionRef.current = null;
    }

    // Stop Web Speech fallback if running
    if (recognitionRef.current && isSpeechActiveRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
    }

    isSpeechActiveRef.current = false;
    setCandidateListening(false);
  };

  // Speak AI audio (returns Promise that resolves when audio finishes speaking)
  const speakAiResponse = async (text: string): Promise<void> => {
    pauseListening();
    clearNoReplyTimer();
    setAiSpeaking(true);
    aiSpeakingRef.current = true;

    const finishSpeaking = () => {
      setAiSpeaking(false);
      aiSpeakingRef.current = false;
      if (callStateRef.current === 'calling' && !isMicMutedRef.current) {
        resumeListening();
        // Start 8-second countdown waiting for candidate reply
        startNoReplyCountdown();
      }
    };

    if (isAudioMutedRef.current) {
      await new Promise(r => setTimeout(r, 1200));
      finishSpeaking();
      return;
    }

    // 1. Digital call stream injection: fetch Polly audio blob and play directly through Call Recorder
    try {
      const pollyBlob = await fetchPollyAudioBlob(text);
      if (pollyBlob && callRecorderRef.current) {
        await callRecorderRef.current.playAiAudioBlob(pollyBlob, isAudioMutedRef.current);
        finishSpeaking();
        return;
      }
    } catch (pollyErr) {
      console.warn('[Call Recorder] Polly speech synthesis notice:', pollyErr);
    }

    // 2. Fallback to lib/tts speak
    return new Promise((resolve) => {
      try {
        unlockTTSAudio();
        speak(text, {
          lang: 'en-US',
          rate: 0.98,
          onEnd: () => {
            finishSpeaking();
            resolve();
          },
          onError: () => {
            finishSpeaking();
            resolve();
          }
        });
      } catch (err) {
        console.warn('[Voice AI] TTS error:', err);
        finishSpeaking();
        resolve();
      }
    });
  };

  // Start Call Handler
  const handleStartCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !phone.trim()) {
      setErrorMsg('Please enter your Name, Email, and Phone number to begin the screening call.');
      return;
    }

    setErrorMsg(null);
    setCallState('calling');
    callStateRef.current = 'calling';
    unlockTTSAudio();

    // 1. Pre-warm the streaming audio session
    try {
      await startListening();
    } catch (_) {}
    pauseListening();

    // 2. Start recording the ENTIRE call (AI question audio + candidate microphone audio)
    try {
      const micStream = assemblySessionRef.current?.getMediaStream() || 
        await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const recorder = new VoiceCallRecorder();
      await recorder.init(micStream);
      recorder.start();
      callRecorderRef.current = recorder;
    } catch (recErr) {
      console.warn('[Call Recorder] Failed to initialize recorder:', recErr);
    }

    // Specialize interview questions with exact location (e.g. Nashik) and candidate context/resume
    const baseQuestions = voiceInterviewRef.current?.questions && voiceInterviewRef.current.questions.length > 0 
      ? voiceInterviewRef.current.questions 
      : DEFAULT_SCREENING_QUESTIONS;

    const specializedQuestions = specializeQuestions(
      baseQuestions,
      {
        title: voiceInterviewRef.current?.jobTitle || voiceInterviewRef.current?.title,
        location: voiceInterviewRef.current?.location,
        description: voiceInterviewRef.current?.jobDescription,
        companyName: voiceInterviewRef.current?.companyName
      },
      {
        name: name.trim(),
        currentCity: currentCity.trim(),
        resumeText: resumeText
      }
    );

    if (voiceInterviewRef.current) {
      voiceInterviewRef.current.questions = specializedQuestions;
    }
    setVoiceInterview(prev => prev ? { ...prev, questions: specializedQuestions } : null);

    const firstQuestion = specializedQuestions[0]?.question || 'Please tell me about your background.';
    const greeting = `Hello ${name.trim()}! Thank you for joining this phone screening call for the ${voiceInterviewRef.current?.title || 'position'}. I will ask you a few quick screening questions. You can speak naturally. If you need me to repeat a question at any time, simply say 'repeat question', or say 'skip' to move to the next. Let us start with our first question: ${firstQuestion}`;

    const turn: VoiceInterviewTurn = {
      speaker: 'ai',
      text: greeting,
      timestamp: new Date().toLocaleTimeString(),
      questionId: questions[0].id
    };

    setDialogueHistory([turn]);
    dialogueHistoryRef.current = [turn];

    await speakAiResponse(greeting);
  };

  // Submit Candidate Answer (called on silence timeout, recognition end, 'Done' button, or typed fallback)
  const submitCandidateAnswer = async (overrideText?: string) => {
    if (isProcessingAnswerRef.current || aiSpeakingRef.current) return;

    clearNoReplyTimer();
    const spokenText = (overrideText || accumulatedAnswerRef.current || liveTranscriptRef.current).trim();
    if (!spokenText || spokenText.length < 1) return;

    isProcessingAnswerRef.current = true;
    setIsProcessingAnswer(true);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    // Pause candidate mic so AI response doesn't record itself
    pauseListening();

    try {
      await handleCandidateUtterance(spokenText);
    } finally {
      isProcessingAnswerRef.current = false;
      setIsProcessingAnswer(false);
      // Automatically resume listening for the next question as soon as AI completes speaking!
      if (callStateRef.current === 'calling' && !aiSpeakingRef.current && !isMicMutedRef.current) {
        resumeListening();
        startNoReplyCountdown();
      }
    }
  };

  // Candidate Spoken Utterance Handler (with Intent Detection, Contextual Acknowledgment & Next Question)
  const handleCandidateUtterance = async (candidateText: string) => {
    const questions = voiceInterviewRef.current?.questions && voiceInterviewRef.current.questions.length > 0 
      ? voiceInterviewRef.current.questions 
      : DEFAULT_SCREENING_QUESTIONS;

    const currentIdx = currentQuestionIndexRef.current;
    const currentQ = questions[currentIdx] || questions[0];

    // 1. Log Candidate Turn
    const candTurn: VoiceInterviewTurn = {
      speaker: 'candidate',
      text: candidateText,
      timestamp: new Date().toLocaleTimeString(),
      questionId: currentQ?.id
    };

    const updatedHistory = [...dialogueHistoryRef.current, candTurn];
    setDialogueHistory(updatedHistory);
    dialogueHistoryRef.current = updatedHistory;

    // Clear transcript for next turn
    accumulatedAnswerRef.current = '';
    updateLiveTranscript('');

    // 2. Intent Recognition: Did candidate ask to Repeat or Skip?
    const { intent } = detectCandidateVoiceIntent(candidateText);

    // CASE A: REPEAT INTENT
    if (intent === 'repeat') {
      const activeText = activeCrossQuestionRef.current || currentQ.question;
      const repeatSpeech = `Certainly! Let me repeat that for you: ${activeText}`;
      
      const aiTurn: VoiceInterviewTurn = {
        speaker: 'ai',
        text: repeatSpeech,
        timestamp: new Date().toLocaleTimeString(),
        intent: 'repeat',
        questionId: currentQ.id
      };
      const histWithRepeat = [...updatedHistory, aiTurn];
      setDialogueHistory(histWithRepeat);
      dialogueHistoryRef.current = histWithRepeat;

      await speakAiResponse(repeatSpeech);
      return;
    }

    // CASE B: SKIP INTENT
    if (intent === 'skip') {
      const isLast = currentIdx >= questions.length - 1;
      if (isLast) {
        const finishSpeech = "Understood. That covers all of our questions today. Thank you for your time!";
        const aiTurn: VoiceInterviewTurn = {
          speaker: 'ai',
          text: finishSpeech,
          timestamp: new Date().toLocaleTimeString(),
          intent: 'skip',
          questionId: currentQ.id
        };
        const histWithSkip = [...updatedHistory, aiTurn];
        setDialogueHistory(histWithSkip);
        dialogueHistoryRef.current = histWithSkip;
        await speakAiResponse(finishSpeech);
        await finishAndSaveCall();
        return;
      }

      const nextIdx = currentIdx + 1;
      const nextQ = questions[nextIdx];
      currentQuestionIndexRef.current = nextIdx;
      setCurrentQuestionIndex(nextIdx);
      activeCrossQuestionRef.current = null;
      setActiveCrossQuestion(null);

      const skipSpeech = `No problem, let us move to the next question: ${nextQ.question}`;
      const aiTurn: VoiceInterviewTurn = {
        speaker: 'ai',
        text: skipSpeech,
        timestamp: new Date().toLocaleTimeString(),
        intent: 'skip',
        questionId: nextQ.id
      };
      const histWithSkip = [...updatedHistory, aiTurn];
      setDialogueHistory(histWithSkip);
      dialogueHistoryRef.current = histWithSkip;

      await speakAiResponse(skipSpeech);
      return;
    }

    // CASE C: CANDIDATE ANSWERED
    // If currently answering a cross-question:
    if (activeCrossQuestionRef.current) {
      answersSummaryRef.current.push({
        question: activeCrossQuestionRef.current,
        answer: candidateText
      });
      activeCrossQuestionRef.current = null;
      setActiveCrossQuestion(null);

      // Advance to next main question or finish
      const isLast = currentIdx >= questions.length - 1;
      if (isLast) {
        const closingSpeech = "Got it, thank you for providing that detail! That concludes all our screening questions today. Thank you so much for your time.";
        const aiTurn: VoiceInterviewTurn = {
          speaker: 'ai',
          text: closingSpeech,
          timestamp: new Date().toLocaleTimeString(),
          questionId: currentQ.id
        };
        const finalHist = [...updatedHistory, aiTurn];
        setDialogueHistory(finalHist);
        dialogueHistoryRef.current = finalHist;

        await speakAiResponse(closingSpeech);
        await finishAndSaveCall();
        return;
      }

      const nextIdx = currentIdx + 1;
      const nextQ = questions[nextIdx];
      currentQuestionIndexRef.current = nextIdx;
      setCurrentQuestionIndex(nextIdx);

      const aiSpeech = `Got it, thank you. Let us move to the next question: ${nextQ.question}`;
      const aiTurn: VoiceInterviewTurn = {
        speaker: 'ai',
        text: aiSpeech,
        timestamp: new Date().toLocaleTimeString(),
        questionId: nextQ.id
      };
      const nextHist = [...updatedHistory, aiTurn];
      setDialogueHistory(nextHist);
      dialogueHistoryRef.current = nextHist;

      await speakAiResponse(aiSpeech);
      return;
    }

    // Main Question answered:
    answersSummaryRef.current.push({
      question: currentQ.question,
      answer: candidateText
    });

    // Smart contextual acknowledgment based on screening category
    let acknowledgment = "Got it, thank you.";
    const cat = (currentQ.category || '').toLowerCase();
    if (cat.includes('relocation') || cat.includes('location')) {
      acknowledgment = "Got it, thank you for confirming your relocation and location preference.";
    } else if (cat.includes('notice') || cat.includes('availab')) {
      acknowledgment = "Understood, thank you for sharing your availability and notice period.";
    } else if (cat.includes('salary') || cat.includes('ctc') || cat.includes('compensat')) {
      acknowledgment = "Noted on your compensation expectations, thank you.";
    } else if (cat.includes('skill') || cat.includes('tech')) {
      acknowledgment = "Great, thank you for explaining your core skills.";
    } else if (cat.includes('motivat') || cat.includes('general')) {
      acknowledgment = "Thank you for explaining your background and interest in this role.";
    }

    // Check if we should ask a brief follow-up cross-question for the skills question
    const isSkillsQ = cat.includes('skill') || currentQ.question.toLowerCase().includes('skill');
    const isAnswerBrief = candidateText.trim().split(/\s+/).length < 7;
    if (isSkillsQ && isAnswerBrief && !activeCrossQuestionRef.current) {
      const followUp = "Could you share a quick example of a project where you applied those skills?";
      activeCrossQuestionRef.current = followUp;
      setActiveCrossQuestion(followUp);

      const crossSpeech = `${acknowledgment} ${followUp}`;
      const aiTurn: VoiceInterviewTurn = {
        speaker: 'ai',
        text: crossSpeech,
        timestamp: new Date().toLocaleTimeString(),
        isCrossQuestion: true,
        questionId: currentQ.id
      };
      const crossHist = [...updatedHistory, aiTurn];
      setDialogueHistory(crossHist);
      dialogueHistoryRef.current = crossHist;

      await speakAiResponse(crossSpeech);
      return;
    }

    // Advance to next question or conclude
    const isLast = currentIdx >= questions.length - 1;
    if (isLast) {
      const closingSpeech = `${acknowledgment} That concludes all of our screening questions today! Thank you so much for your time.`;
      const aiTurn: VoiceInterviewTurn = {
        speaker: 'ai',
        text: closingSpeech,
        timestamp: new Date().toLocaleTimeString(),
        questionId: currentQ.id
      };
      const finalHist = [...updatedHistory, aiTurn];
      setDialogueHistory(finalHist);
      dialogueHistoryRef.current = finalHist;

      await speakAiResponse(closingSpeech);
      await finishAndSaveCall();
      return;
    }

    const nextIdx = currentIdx + 1;
    const nextQ = questions[nextIdx];
    currentQuestionIndexRef.current = nextIdx;
    setCurrentQuestionIndex(nextIdx);

    const transitionSpeech = `${acknowledgment} Let us move to the next question: ${nextQ.question}`;
    const aiTurn: VoiceInterviewTurn = {
      speaker: 'ai',
      text: transitionSpeech,
      timestamp: new Date().toLocaleTimeString(),
      questionId: nextQ.id
    };
    const nextHist = [...updatedHistory, aiTurn];
    setDialogueHistory(nextHist);
    dialogueHistoryRef.current = nextHist;

    await speakAiResponse(transitionSpeech);
  };

  // Button actions for candidate convenience
  const handleManualRepeat = () => {
    submitCandidateAnswer();
    handleCandidateUtterance('can you please repeat the question');
  };

  const handleManualSkip = () => {
    handleCandidateUtterance('skip this question');
  };

  // End Call & Generate Report
  const finishAndSaveCall = async () => {
    stopListening();
    clearNoReplyTimer();
    setCallState('completed');
    setSavingReport(true);
    setUploadingRecording(true);

    const endMsg = 'Thank you very much for completing this phone screening call. We have recorded your responses, and our hiring team will review your screening report and be in touch soon. Have a great day!';
    speakAiResponse(endMsg).catch(() => {});

    // 1. Stop call recorder and upload full recording to AWS S3
    let audioRecordingUrl = '';
    if (callRecorderRef.current) {
      try {
        const audioBlob = await callRecorderRef.current.stop();
        if (audioBlob && audioBlob.size > 0) {
          console.info(`[Voice Interview] Uploading call audio to AWS S3 (${(audioBlob.size / 1024).toFixed(1)} KB)...`);
          const fileName = `voice_call_${voiceInterviewId || 'screening'}_${Date.now()}.webm`;
          audioRecordingUrl = await uploadToS3(audioBlob, 'auto', fileName);
          console.info(`[Voice Interview] Uploaded successfully to AWS S3:`, audioRecordingUrl);
          setRecordedAudioUrl(audioRecordingUrl);
        }
      } catch (uploadErr) {
        console.warn('[Voice Interview] S3 call recording upload warning:', uploadErr);
      } finally {
        callRecorderRef.current.destroy();
        callRecorderRef.current = null;
      }
    }
    setUploadingRecording(false);

    try {
      const screeningReport = await evaluateVoiceInterviewSession(
        voiceInterview?.jobTitle || voiceInterview?.title || 'Job Screening',
        dialogueHistoryRef.current,
        { 
          name: name.trim(), 
          email: email.trim(), 
          phone: phone.trim(),
          currentCity: currentCity.trim(),
          resumeText: resumeText || ''
        },
        {
          jobDescription: voiceInterview?.jobDescription,
          location: voiceInterview?.location,
          companyName: voiceInterview?.companyName
        }
      );

      const responsePayload: VoiceInterviewResponse = {
        id: `vresp_${Date.now()}`,
        voiceInterviewId: voiceInterview?.id || voiceInterviewId || 'voice_default',
        jobId: voiceInterview?.jobId || voiceInterview?.interviewId,
        recruiterUID: voiceInterview?.recruiterUID || 'SYSTEM',
        candidateInfo: {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          currentCity: currentCity.trim(),
          resumeUrl: resumeUrl || undefined,
          resumeFileName: resumeFileName || undefined,
          resumeText: resumeText || undefined
        },
        candidateResumeUrl: resumeUrl || undefined,
        candidateResumeFileName: resumeFileName || undefined,
        dialogueHistory: dialogueHistoryRef.current,
        answersSummary: answersSummaryRef.current,
        screeningReport,
        callDurationSeconds: callDuration,
        audioRecordingUrl: audioRecordingUrl || undefined,
        status: screeningReport.recommendation === 'Shortlist' ? 'Shortlist' : 'Completed',
        submittedAt: new Date()
      };

      await saveVoiceInterviewResponse(responsePayload);
      setCompletedResponse(responsePayload);
    } catch (err) {
      console.error('[Voice Interview] Evaluation error:', err);
    } finally {
      setSavingReport(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070707] text-white flex flex-col items-center justify-center p-4">
        <div className="h-10 w-10 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4" />
        <p className="geist-caption text-[#9ca3af]">Connecting to Voice Interview Screener...</p>
      </div>
    );
  }

  if (errorMsg && callState !== 'calling' && callState !== 'completed') {
    return (
      <div className="min-h-screen bg-[#070707] text-white flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center space-y-3">
          <AlertCircle size={32} className="mx-auto text-red-400" />
          <h2 className="geist-heading text-white">Voice Interview Unavailable</h2>
          <p className="geist-caption text-red-300">{errorMsg}</p>
          <Link
            to="/jobs"
            className="geist-small inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black font-semibold hover:bg-white/90 transition-all mt-2"
          >
            Explore Other Jobs
          </Link>
        </div>
      </div>
    );
  }

  const questions = voiceInterview?.questions && voiceInterview.questions.length > 0 
    ? voiceInterview.questions 
    : DEFAULT_SCREENING_QUESTIONS;

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col justify-between selection:bg-white selection:text-black">
      {/* Top Header */}
      <header className="border-b border-white/[0.1] bg-[#000]/80 backdrop-blur-md px-4 py-3.5 sm:px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-black font-extrabold shadow-lg shadow-emerald-500/20">
              <Phone size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="geist-caption font-bold text-white tracking-wide">AI Voice Screener</span>
                <span className="geist-small px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
                  Audio Call
                </span>
              </div>
              <p className="geist-small text-[#6b7280]">
                {voiceInterview?.title || 'Phone Screening'} • {voiceInterview?.companyName || 'DSource'}
              </p>
            </div>
          </div>
          {callState === 'calling' && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 px-3 py-1 rounded-full text-emerald-400 font-mono text-xs font-bold">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{formatTime(callDuration)}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 flex flex-col justify-center">
        {/* STEP 1: Candidate Verification & Call Intro */}
        {callState === 'details' && (
          <div className="w-full rounded-2xl border border-white/[0.12] bg-[#0c0c0c] p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex h-14 w-14 rounded-2xl bg-white/[0.05] border border-white/[0.1] items-center justify-center text-white mb-2 shadow-inner">
                <Mic size={24} className="text-emerald-400" />
              </div>
              <h1 className="geist-page-title text-2xl sm:text-3xl font-extrabold text-white">
                {voiceInterview?.title}
              </h1>
              <p className="geist-caption text-[#9ca3af] max-w-lg mx-auto">
                No video required. You will have a brief, conversational phone screening with our AI recruiter to discuss your availability, relocation, and skills.
              </p>
            </div>

            {dumpFoundNotice && (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3.5 flex items-center gap-2.5 geist-small text-emerald-400">
                <CheckCircle2 size={16} className="shrink-0" />
                <span>{dumpFoundNotice}</span>
              </div>
            )}

            <form onSubmit={handleStartCall} className="space-y-4">
              {/* Resume Upload Input */}
              <div className="rounded-xl border border-dashed border-white/[0.18] bg-white/[0.02] p-4 text-center hover:border-emerald-500/50 transition-colors">
                <input
                  type="file"
                  id="voice-resume-file"
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                  onChange={handleResumeUpload}
                  disabled={parsingResume}
                />
                {resumeFileName ? (
                  <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-3 text-left">
                      <div className="p-2 rounded bg-emerald-500/20 text-emerald-400">
                        <FileCheck size={20} />
                      </div>
                      <div>
                        <div className="geist-caption font-bold text-white text-sm">
                          {resumeFileName}
                        </div>
                        <span className="geist-small text-emerald-400 text-xs">
                          Resume uploaded & analyzed • Questions tailored to your profile
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveResume}
                      className="p-1.5 text-[#6b7280] hover:text-red-400 transition-colors"
                      title="Remove resume"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ) : (
                  <label htmlFor="voice-resume-file" className="cursor-pointer block space-y-2 py-1">
                    <div className="mx-auto w-11 h-11 rounded-full bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-white">
                      {parsingResume ? (
                        <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <UploadCloud size={22} className="text-emerald-400" />
                      )}
                    </div>
                    <div>
                      <span className="geist-caption font-bold text-white text-sm hover:underline">
                        {parsingResume ? 'Reading and parsing resume...' : 'Upload Resume (PDF / DOCX / TXT)'}
                      </span>
                      <p className="geist-small text-[#6b7280] text-xs mt-0.5">
                        Optional: Auto-fills your details & personalizes voice screening questions
                      </p>
                    </div>
                  </label>
                )}
              </div>

              {resumeSuccessMsg && (
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-center gap-2.5 geist-small text-emerald-400">
                  <CheckCircle2 size={16} className="shrink-0" />
                  <span>{resumeSuccessMsg}</span>
                </div>
              )}

              <div>
                <label className="geist-small block font-medium text-[#9ca3af] mb-1">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="geist-copy w-full rounded-lg border border-white/[0.12] bg-[#141414] px-3.5 py-2.5 text-white placeholder-[#6b7280] focus:border-white/[0.35] focus:outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="geist-small block font-medium text-[#9ca3af] mb-1">
                    Email Address <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. rahul@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="geist-copy w-full rounded-lg border border-white/[0.12] bg-[#141414] px-3.5 py-2.5 text-white placeholder-[#6b7280] focus:border-white/[0.35] focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="geist-small block font-medium text-[#9ca3af] mb-1">
                    Phone / WhatsApp <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. +91 9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="geist-copy w-full rounded-lg border border-white/[0.12] bg-[#141414] px-3.5 py-2.5 text-white placeholder-[#6b7280] focus:border-white/[0.35] focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="geist-small block font-medium text-[#9ca3af] mb-1">
                  Current City / Location (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Mumbai, Maharashtra"
                  value={currentCity}
                  onChange={(e) => setCurrentCity(e.target.value)}
                  className="geist-copy w-full rounded-lg border border-white/[0.12] bg-[#141414] px-3.5 py-2.5 text-white placeholder-[#6b7280] focus:border-white/[0.35] focus:outline-none transition-colors"
                />
              </div>

              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs text-[#9ca3af] space-y-1.5 leading-relaxed">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <Shield size={14} className="text-emerald-400" /> Screening Tips:
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[#6b7280]">
                  <li>Ensure your microphone and speaker are enabled.</li>
                  <li>Speak clearly at your normal speaking speed.</li>
                  <li>You can say <strong>"repeat question"</strong> or <strong>"skip"</strong> at any time.</li>
                </ul>
              </div>

              <button
                type="submit"
                className="w-full geist-caption h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-500/25 transition-all text-sm cursor-pointer"
              >
                <Phone size={18} />
                <span>Start Voice Screening Call</span>
              </button>
            </form>
          </div>
        )}

        {/* STEP 2: ACTIVE CALLER SCREEN */}
        {callState === 'calling' && (
          <div className="w-full rounded-3xl border border-white/[0.12] bg-[#0c0c0c] p-6 sm:p-10 shadow-2xl flex flex-col items-center text-center space-y-8 relative overflow-hidden">
            {/* Animated Background Glow */}
            <div className={`absolute -top-32 -left-32 w-80 h-80 rounded-full blur-3xl pointer-events-none transition-opacity duration-700 ${
              aiSpeaking ? 'bg-blue-500/15 opacity-100' : 'bg-emerald-500/15 opacity-60'
            }`} />

            {/* Caller Header & Active Question Banner */}
            <div className="w-full max-w-xl space-y-3">
              <div className="flex items-center justify-between geist-small">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold uppercase tracking-wider text-xs">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live Phone Screening
                </span>
                <span className="text-[#9ca3af] font-mono text-xs">
                  {formatTime(callDuration)}
                </span>
              </div>

              {/* Current Question Display Card */}
              <div className="rounded-2xl border border-white/[0.12] bg-white/[0.04] p-4 text-left space-y-1.5 shadow-lg">
                <div className="flex items-center justify-between text-xs text-[#9ca3af]">
                  <span className="font-semibold text-emerald-400 uppercase tracking-wide">
                    {activeCrossQuestion ? 'Clarification Follow-Up' : `Question ${currentQuestionIndex + 1} of ${questions.length}`}
                  </span>
                  <span className="text-[#6b7280]">
                    {voiceInterview?.title}
                  </span>
                </div>
                <h3 className="geist-subheading text-white text-base sm:text-lg font-medium leading-relaxed">
                  {activeCrossQuestion || questions[currentQuestionIndex]?.question || 'Loading question...'}
                </h3>
              </div>
            </div>

            {/* Visual Equalizer / Avatar */}
            <div className="relative flex items-center justify-center my-2">
              {/* Pulsing Rings */}
              <div className={`absolute w-36 h-36 rounded-full border transition-all duration-700 ${
                aiSpeaking 
                  ? 'border-blue-500/30 animate-ping' 
                  : candidateListening 
                    ? 'border-emerald-500/30 animate-ping' 
                    : 'border-white/10'
              }`} />
              <div className={`h-28 w-28 rounded-full border-2 flex items-center justify-center shadow-2xl relative z-10 transition-all ${
                aiSpeaking 
                  ? 'bg-gradient-to-tr from-blue-950 to-blue-900 border-blue-400/40 shadow-blue-500/20' 
                  : 'bg-gradient-to-tr from-[#181818] to-[#252525] border-white/[0.2] shadow-emerald-500/10'
              }`}>
                {aiSpeaking ? (
                  <Volume2 size={40} className="text-blue-400 animate-pulse" />
                ) : (
                  <Mic size={40} className={`text-emerald-400 ${candidateListening ? 'animate-bounce' : ''}`} />
                )}
              </div>
            </div>

            {/* Realtime Live Spoken Transcript Teleprompter */}
            <div className="w-full max-w-xl space-y-2.5">
              <div className="flex items-center justify-between text-xs px-1">
                <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-xs">
                  {aiSpeaking ? (
                    <span className="text-blue-400 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-blue-400 animate-ping" />
                      AI Recruiter Speaking
                    </span>
                  ) : isProcessingAnswer ? (
                    <span className="text-amber-400 flex items-center gap-1.5">
                      <span className="h-3 w-3 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin" />
                      Processing Response...
                    </span>
                  ) : candidateListening ? (
                    <span className="text-emerald-400 flex items-center gap-1.5">
                      <Mic size={14} className="text-emerald-400 animate-pulse" />
                      Listening to You (Speak Now)
                    </span>
                  ) : (
                    <span className="text-[#9ca3af] flex items-center gap-1.5">
                      <Mic size={14} />
                      Microphone Ready
                    </span>
                  )}
                </span>

                {remainingWaitSeconds !== null && !aiSpeaking && !isProcessingAnswer && (
                  <span className={`text-xs font-mono flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border ${
                    liveTranscript 
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25' 
                      : 'bg-amber-500/10 text-amber-300 border-amber-500/25 animate-pulse'
                  }`}>
                    <Clock size={12} />
                    <span>{liveTranscript ? `Submitting in ${remainingWaitSeconds}s` : `Waiting for reply (${remainingWaitSeconds}s)`}</span>
                  </span>
                )}

                {liveTranscript && (
                  <span className="text-xs text-emerald-400/90 font-mono flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                    Real-Time Audio Captured
                  </span>
                )}
              </div>

              {/* Dedicated Realtime Transcript Box */}
              <div className={`min-h-[90px] p-4 rounded-2xl border transition-all text-left flex flex-col justify-center relative overflow-hidden ${
                liveTranscript 
                  ? 'bg-emerald-950/25 border-emerald-500/50 shadow-xl shadow-emerald-500/10' 
                  : 'bg-white/[0.03] border-white/[0.1]'
              }`}>
                {liveTranscript ? (
                  <div className="space-y-1.5">
                    <p className="geist-copy text-white text-base sm:text-lg font-medium leading-relaxed">
                      "{liveTranscript}"
                      <span className="inline-block w-2 h-4 ml-1 bg-emerald-400 animate-pulse align-middle" />
                    </p>
                    <p className="text-xs text-emerald-400/90 font-mono flex items-center justify-between">
                      <span>✓ Captured live</span>
                      <span>Pause 8s or tap Done Speaking ➔</span>
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-2 space-y-1.5">
                    <p className="geist-caption text-[#d4d4d4] text-sm">
                      {aiSpeaking 
                        ? 'AI recruiter is asking the question. Listen carefully...' 
                        : isProcessingAnswer 
                          ? 'Evaluating your response and preparing the next question...' 
                          : remainingWaitSeconds !== null
                            ? `Please speak your answer now. If no reply is detected in ${remainingWaitSeconds}s, AI will move to the next question.`
                            : 'Speak your answer into your microphone. Your words will appear here in real time.'}
                    </p>
                    {!aiSpeaking && !isProcessingAnswer && (
                      <div className="flex items-center justify-center gap-1 pt-1">
                        <span className="h-3 w-1 bg-emerald-400/40 rounded-full animate-pulse" />
                        <span className="h-6 w-1 bg-emerald-400/70 rounded-full animate-pulse delay-75" />
                        <span className="h-8 w-1 bg-emerald-400 rounded-full animate-pulse delay-150" />
                        <span className="h-5 w-1 bg-emerald-400/70 rounded-full animate-pulse delay-200" />
                        <span className="h-2 w-1 bg-emerald-400/40 rounded-full animate-pulse delay-300" />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Optional Inline Text Input for 100% Reliability */}
              {!aiSpeaking && (
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="text-[#6b7280]">Audio auto-detects 1.7s pause</span>
                  <button
                    type="button"
                    onClick={() => setShowTextInput(!showTextInput)}
                    className="text-xs text-[#9ca3af] hover:text-white underline transition-colors cursor-pointer"
                  >
                    {showTextInput ? 'Hide text fallback' : 'Microphone issue? Type answer instead'}
                  </button>
                </div>
              )}

              {showTextInput && !aiSpeaking && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (typedAnswer.trim()) {
                      submitCandidateAnswer(typedAnswer.trim());
                      setTypedAnswer('');
                      setShowTextInput(false);
                    }
                  }}
                  className="flex gap-2 pt-1"
                >
                  <input
                    type="text"
                    value={typedAnswer}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    placeholder="Type your response here..."
                    className="flex-1 rounded-xl bg-white/[0.05] border border-white/[0.18] px-3.5 py-2.5 text-sm text-white placeholder-[#6b7280] focus:border-emerald-400 focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-sm transition-all"
                  >
                    Send
                  </button>
                </form>
              )}
            </div>

            {/* Primary Action Button: Done Speaking / Ask Next Question */}
            {!aiSpeaking && (
              <div className="w-full max-w-sm pt-1">
                <button
                  type="button"
                  onClick={() => submitCandidateAnswer()}
                  disabled={isProcessingAnswer}
                  className="w-full geist-small flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-black font-extrabold text-sm shadow-xl shadow-emerald-500/25 transition-all cursor-pointer disabled:opacity-50"
                >
                  <span>{liveTranscript ? 'Done Speaking (Ask Next Question)' : 'I am Done Answering (Next)'}</span>
                  <ArrowRight size={17} />
                </button>
              </div>
            )}

            {/* Secondary Call Controls */}
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 pt-1">
              <button
                type="button"
                onClick={handleManualRepeat}
                disabled={aiSpeaking || isProcessingAnswer}
                className="geist-small flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-white/[0.12] bg-white/[0.05] hover:bg-white/[0.1] text-white font-medium transition-colors disabled:opacity-40"
                title="Repeat the question"
              >
                <RotateCcw size={15} />
                <span>Repeat Question</span>
              </button>

              <button
                type="button"
                onClick={handleManualSkip}
                disabled={aiSpeaking || isProcessingAnswer}
                className="geist-small flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-white/[0.12] bg-white/[0.05] hover:bg-white/[0.1] text-white font-medium transition-colors disabled:opacity-40"
                title="Skip this question"
              >
                <FastForward size={15} />
                <span>Skip Question</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const nextMute = !isMicMuted;
                  setIsMicMuted(nextMute);
                  if (nextMute) pauseListening();
                  else resumeListening();
                }}
                className={`geist-small flex items-center gap-1.5 px-3.5 py-2 rounded-xl border transition-colors ${
                  isMicMuted 
                    ? 'border-red-500/30 bg-red-500/10 text-red-400' 
                    : 'border-white/[0.12] bg-white/[0.05] text-white hover:bg-white/[0.1]'
                }`}
              >
                {isMicMuted ? <MicOff size={15} /> : <Mic size={15} />}
                <span>{isMicMuted ? 'Mic Muted' : 'Mute Mic'}</span>
              </button>

              <button
                type="button"
                onClick={finishAndSaveCall}
                className="geist-small flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold transition-all shadow-lg shadow-red-600/30 cursor-pointer"
              >
                <PhoneOff size={16} />
                <span>End Call</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: CALL COMPLETED SCREEN */}
        {callState === 'completed' && (
          <div className="w-full rounded-2xl border border-white/[0.12] bg-[#0c0c0c] p-6 sm:p-10 shadow-2xl text-center space-y-6">
            <div className="inline-flex h-16 w-16 rounded-full bg-emerald-500/15 border-2 border-emerald-500/30 items-center justify-center text-emerald-400 shadow-xl">
              <CheckCircle2 size={32} />
            </div>

            <div>
              <h2 className="geist-page-title text-2xl sm:text-3xl font-extrabold text-white">
                Screening Call Completed!
              </h2>
              <p className="geist-caption text-[#9ca3af] mt-2 max-w-md mx-auto">
                Thank you, <span className="text-white font-medium">{name}</span>. Your screening conversation has been recorded and evaluated for the hiring team.
              </p>
            </div>

            {savingReport ? (
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center gap-3 text-sm text-[#9ca3af]">
                <span className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <span>Finalizing your screening evaluation report...</span>
              </div>
            ) : completedResponse ? (
              <div className="rounded-xl border border-white/[0.1] bg-white/[0.02] p-5 text-left space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
                  <div>
                    <span className="geist-label uppercase text-[#6b7280]">Screening Call Score</span>
                    <div className="geist-heading text-2xl font-extrabold text-white mt-0.5">
                      {completedResponse.screeningReport.overallScore} / 10
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="geist-label uppercase text-[#6b7280]">Call Duration</span>
                    <div className="geist-caption font-mono text-white mt-0.5">
                      {formatTime(completedResponse.callDurationSeconds)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <div className="geist-small text-[#6b7280]">Relocation Readiness</div>
                    <div className="geist-caption font-semibold text-white mt-0.5">
                      {completedResponse.screeningReport.relocationStatus}
                    </div>
                    {completedResponse.screeningReport.relocationDetails && (
                      <div className="text-[11px] text-[#9ca3af] mt-1 leading-normal">
                        {completedResponse.screeningReport.relocationDetails}
                      </div>
                    )}
                  </div>
                  <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <div className="geist-small text-[#6b7280]">Notice Period & Salary</div>
                    <div className="geist-caption font-semibold text-white mt-0.5">
                      {completedResponse.screeningReport.noticePeriod || 'Not specified'}
                    </div>
                    {completedResponse.screeningReport.salaryExpectation && (
                      <div className="text-[11px] text-[#9ca3af] mt-1 leading-normal">
                        CTC: {completedResponse.screeningReport.salaryExpectation}
                      </div>
                    )}
                  </div>
                </div>

                <p className="geist-small text-[#9ca3af] italic leading-relaxed pt-1">
                  "{completedResponse.screeningReport.summary}"
                </p>

                {(completedResponse.audioRecordingUrl || recordedAudioUrl) && (
                  <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-4 space-y-2 pt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wide">
                        <Volume2 size={15} /> Full Call Audio Recording (AWS S3)
                      </span>
                      <a
                        href={completedResponse.audioRecordingUrl || recordedAudioUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:underline font-mono text-[11px]"
                      >
                        Download Audio ↗
                      </a>
                    </div>
                    <audio 
                      controls 
                      src={completedResponse.audioRecordingUrl || recordedAudioUrl || ''} 
                      className="w-full h-10 mt-1 accent-emerald-500 rounded-lg" 
                    />
                  </div>
                )}
              </div>
            ) : null}

            {completedResponse ? (
              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to={`/voice-report/${completedResponse.id}`}
                  target="_blank"
                  className="geist-caption inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold transition-all shadow-md cursor-pointer"
                >
                  <FileText size={16} />
                  <span>View Full Screening Report ↗</span>
                </Link>
                <Link
                  to="/jobs"
                  className="geist-caption inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white font-bold transition-all border border-white/[0.12]"
                >
                  <span>Explore Other Open Jobs</span>
                  <Briefcase size={15} />
                </Link>
              </div>
            ) : (
              <div className="pt-2">
                <Link
                  to="/jobs"
                  className="geist-caption inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-extrabold hover:bg-white/90 transition-all shadow-md"
                >
                  <span>Explore Other Open Jobs</span>
                  <Briefcase size={15} />
                </Link>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.08] py-3 text-center geist-small text-[#6b7280]">
        Powered by DSource AI Voice Interviewer • Secure & Audio-Encrypted
      </footer>
    </div>
  );
};

export default CandidateVoiceInterview;
