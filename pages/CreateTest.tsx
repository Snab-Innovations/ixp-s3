import React, { useState, useEffect } from 'react';
import { addDoc, collection, serverTimestamp, query, getDocs, orderBy } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Sparkles, Save, ArrowLeft, Plus, Trash, Link as LinkIcon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { grokGenerateJson } from '../services/grokService';

const CreateTest: React.FC = () => {
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') === 'coding' ? 'coding' : 'aptitude';
  const [type, setType] = useState<'aptitude' | 'coding'>(initialType);
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(10); // Default 10 minutes
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [passingScore, setPassingScore] = useState(70);
  const [nextInterviewId, setNextInterviewId] = useState('');
  const [recruiterInterviews, setRecruiterInterviews] = useState<any[]>([]);
  const [automationType, setAutomationType] = useState<'internal' | 'external'>('internal');
  const [externalLink, setExternalLink] = useState('');
  const [externalAccessCode, setExternalAccessCode] = useState('');

  // Manual Question State
  const [manualQ, setManualQ] = useState({ question: '', options: ['', '', '', ''], correct: 0 });
  const [manualCodeQ, setManualCodeQ] = useState({ title: '', description: '', testCases: '' });

  useEffect(() => {
    const requestedType = searchParams.get('type');
    if (requestedType === 'aptitude' || requestedType === 'coding') {
      setType(requestedType);
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchInterviews = async () => {
      if (!auth.currentUser) return;
      const q = query(
        collection(db, 'interviews'),
        orderBy('createdAt', 'desc') // Now fetches all interviews from all recruiters
      );
      const snap = await getDocs(q);
      const interviewsList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRecruiterInterviews(interviewsList);
    };
    fetchInterviews();
  }, []);

  const handleAiGenerate = async () => {
    if (!aiPrompt) return;
    setLoading(true);
    try {
      const prompt = type === 'aptitude'
        ? `Generate 5 aptitude multiple choice questions about "${aiPrompt}". Return ONLY a JSON object. Schema: {"questions":[{"question": "string", "options": ["string", "string", "string", "string"], "correctIndex": number}]}`
        : `Generate 1 coding problem about "${aiPrompt}". Return ONLY a JSON object. Schema: {"questions":[{"title": "string", "description": "string", "testCases": "string"}]}`;

      const parsed = await grokGenerateJson<{ questions?: any[]; problems?: any[] }>(
        'You are an expert assessment generator. Return only valid JSON.',
        prompt,
        0.6,
        type === 'aptitude' ? 1200 : 800
      );
      const generated: any[] = parsed.questions || parsed.problems || [];
      if (!Array.isArray(generated) || generated.length === 0) throw new Error('No questions returned from Grok');
      setQuestions([...questions, ...generated]);
    } catch (error) {
      console.error('AI Error:', error);
      alert('Failed to generate questions. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const addManualQuestion = () => {
    if (type === 'aptitude') {
      setQuestions([...questions, { ...manualQ, correctIndex: Number(manualQ.correct) }]);
      setManualQ({ question: '', options: ['', '', '', ''], correct: 0 });
    } else {
      setQuestions([...questions, manualCodeQ]);
      setManualCodeQ({ title: '', description: '', testCases: '' });
    }
  };

  const handleSave = async () => {
    if (!title || questions.length === 0) return alert("Add title and at least one question.");
    setLoading(true);
    try {
      const accessCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const testData: any = {
        recruiterUID: auth.currentUser?.uid,
        title,
        type,
        duration,
        questions,
        accessCode,
        passingScore: Number(passingScore),
        createdAt: serverTimestamp()
      };

      if (automationType === 'internal' && nextInterviewId) {
        testData.nextInterviewId = nextInterviewId;
      } else if (automationType === 'external' && externalLink) {
        testData.externalInterviewLink = externalLink;
        testData.externalAccessCode = externalAccessCode;
      }
      await addDoc(collection(db, 'tests'), testData);
      navigate('/recruiter/tests');
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fieldClass = "w-full rounded-[8px] border border-black/[0.08] bg-white px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-black/30 focus:ring-4 focus:ring-black/[0.04] dark:border-white/[0.11] dark:bg-[#050505] dark:placeholder:text-[#666] dark:focus:border-white/30 dark:focus:ring-white/[0.06]";
  const labelClass = "mb-2 block text-xs font-medium text-gray-600 dark:text-[#a1a1a1]";
  const sectionClass = "rounded-[12px] border border-black/[0.08] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/[0.11] dark:bg-[#0a0a0a]";

  return (
    <div className={`min-h-screen bg-white text-[#111] dark:bg-[#050505] ${isDark ? 'dark' : ''}`}>
      <div className="mx-auto max-w-5xl py-2 sm:py-4">
        <button onClick={() => navigate(-1)} className="mb-6 inline-flex h-9 items-center gap-2 rounded-[6px] border border-black/[0.08] px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-black/[0.03] hover:text-black dark:border-white/[0.11] dark:text-[#a1a1a1] dark:hover:bg-white/[0.05] dark:hover:text-white">
          <ArrowLeft size={18} /> Back
        </button>

        <div className="mb-8 border-b border-black/[0.08] pb-6 dark:border-white/[0.11]">
          <div className="mb-3 inline-flex h-7 items-center gap-2 rounded-full border border-black/[0.08] bg-black/[0.03] px-3 text-xs font-medium text-gray-600 dark:border-white/[0.11] dark:bg-white/[0.05] dark:text-[#a1a1a1]">
            <Sparkles size={13} /> Build workflow
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-5xl">Create Assessment</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500 dark:text-[#8f8f8f]">Configure the test, generate or add questions, and optionally connect passing candidates to the next interview round.</p>
        </div>

        <div className="space-y-6">
          <div className={sectionClass}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Assessment title</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} className={fieldClass} placeholder="e.g. Frontend React Quiz" />
            </div>
            <div>
              <label className={labelClass}>Assessment type</label>
              <select value={type} onChange={(e: any) => { setType(e.target.value); setQuestions([]); }} className={fieldClass}>
                <option value="aptitude">Aptitude (MCQ)</option>
                <option value="coding">Coding Challenge</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Duration (minutes)</label>
              <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} min="1"
                className={fieldClass} placeholder="e.g. 15" />
            </div>
          </div>
          </div>

          {/* Automation Settings */}
          <div className={sectionClass}>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-black dark:text-white">
              <LinkIcon size={18} /> Automation Settings (Optional)
            </h3>
            <div className="mb-4">
                <label className={labelClass}>Passing Score (%)</label>
                <input type="number" value={passingScore} onChange={e => setPassingScore(Number(e.target.value))} min="0" max="100"
                  className={`${fieldClass} md:w-1/2`} placeholder="e.g. 75" />
            </div>

            <div className="mb-4 flex rounded-[8px] border border-black/[0.08] bg-black/[0.03] p-1 dark:border-white/[0.11] dark:bg-white/[0.05]">
                <button type="button" onClick={() => setAutomationType('internal')} className={`flex-1 rounded-[6px] py-2 text-sm font-medium transition-all ${automationType === 'internal' ? 'bg-white text-black shadow-sm dark:bg-[#1a1a1a] dark:text-white' : 'text-gray-500 dark:text-[#8f8f8f]'}`}>
                    Link to Internal AI Interview
                </button>
                <button type="button" onClick={() => setAutomationType('external')} className={`flex-1 rounded-[6px] py-2 text-sm font-medium transition-all ${automationType === 'external' ? 'bg-white text-black shadow-sm dark:bg-[#1a1a1a] dark:text-white' : 'text-gray-500 dark:text-[#8f8f8f]'}`}>
                    Link to External URL
                </button>
            </div>

            {automationType === 'internal' && (
              <div className="animate-in fade-in duration-300">
                  <label className={labelClass}>Next Round Interview</label>
                  <select value={nextInterviewId} onChange={e => setNextInterviewId(e.target.value)}
                    className={fieldClass}>
                    <option value="">Select an interview to link...</option>
                    {recruiterInterviews.map(interview => (<option key={interview.id} value={interview.id}>{interview.title}</option>))}
                  </select>
                  <p className="mt-2 text-xs text-gray-500 dark:text-[#8f8f8f]">If a candidate passes, they will be automatically emailed a unique, secure link to the selected AI interview.</p>
              </div>
            )}

            {automationType === 'external' && (
              <div className="space-y-4 animate-in fade-in duration-300">
                  <div>
                      <label className={labelClass}>External Interview Link</label>
                      <input type="url" value={externalLink} onChange={e => setExternalLink(e.target.value)} className={fieldClass} placeholder="https://zoom.us/j/..." />
                  </div>
                  <div>
                      <label className={labelClass}>Access Code (Optional)</label>
                      <input type="text" value={externalAccessCode} onChange={e => setExternalAccessCode(e.target.value)} className={fieldClass} placeholder="e.g. 123456" />
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-[#8f8f8f]">If a candidate passes, they will be automatically emailed this link and access code.</p>
              </div>
            )}
          </div>

          {/* AI Generator */}
          <div className={sectionClass}>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-black dark:text-white">
              <Sparkles size={18} /> AI Generator
            </h3>
            <div className="flex gap-2">
              <input type="text" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder={`Enter topic for ${type} questions...`} className={`${fieldClass} flex-1`} />
              <button onClick={handleAiGenerate} disabled={loading} className="rounded-[6px] bg-black px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#333] disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-[#eaeaea]">
                {loading ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>

          {/* Manual Entry */}
          <div className={sectionClass}>
            <h3 className="mb-4 text-sm font-semibold">Add Manually</h3>
            {type === 'aptitude' ? (
              <div className="space-y-3">
                <input type="text" placeholder="Question" value={manualQ.question} onChange={e => setManualQ({ ...manualQ, question: e.target.value })} className={fieldClass} />
                <div className="grid grid-cols-2 gap-3">
                  {manualQ.options.map((opt, i) => (
                    <input key={i} type="text" placeholder={`Option ${i + 1}`} value={opt} onChange={e => {
                      const newOpts = [...manualQ.options]; newOpts[i] = e.target.value;
                      setManualQ({ ...manualQ, options: newOpts });
                    }} className={fieldClass} />
                  ))}
                </div>
                <select value={manualQ.correct} onChange={e => setManualQ({ ...manualQ, correct: Number(e.target.value) })} className={fieldClass}>
                  {manualQ.options.map((_, i) => <option key={i} value={i}>Correct Option: {i + 1}</option>)}
                </select>
                <button onClick={addManualQuestion} className="flex w-full items-center justify-center gap-2 rounded-[6px] border border-black/[0.08] bg-black/[0.03] py-2.5 text-sm font-medium transition-colors hover:bg-black/[0.06] dark:border-white/[0.11] dark:bg-white/[0.05] dark:hover:bg-white/[0.09]">
                  <Plus size={18} /> Add Question
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <input type="text" placeholder="Problem Title" value={manualCodeQ.title} onChange={e => setManualCodeQ({ ...manualCodeQ, title: e.target.value })} className={fieldClass} />
                <textarea placeholder="Problem Description" value={manualCodeQ.description} onChange={e => setManualCodeQ({ ...manualCodeQ, description: e.target.value })} className={`${fieldClass} h-32`} />
                <textarea placeholder="Test Cases (e.g. Input: 1 2, Output: 3)" value={manualCodeQ.testCases} onChange={e => setManualCodeQ({ ...manualCodeQ, testCases: e.target.value })} className={`${fieldClass} h-24`} />
                <button onClick={addManualQuestion} className="flex w-full items-center justify-center gap-2 rounded-[6px] border border-black/[0.08] bg-black/[0.03] py-2.5 text-sm font-medium transition-colors hover:bg-black/[0.06] dark:border-white/[0.11] dark:bg-white/[0.05] dark:hover:bg-white/[0.09]">
                  <Plus size={18} /> Add Problem
                </button>
              </div>
            )}
          </div>

          {/* Preview */}
          <div className={sectionClass}>
            <h3 className="mb-4 text-sm font-semibold">Questions ({questions.length})</h3>
            <div className="space-y-4">
              {questions.map((q, i) => (
                <div key={i} className="group relative rounded-[10px] border border-black/[0.08] bg-black/[0.02] p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
                  <button onClick={() => setQuestions(questions.filter((_, idx) => idx !== i))} className="absolute right-4 top-4 text-gray-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100">
                    <Trash size={18} />
                  </button>
                  {type === 'aptitude' ? (
                    <>
                      <p className="font-bold mb-2">{i + 1}. {q.question}</p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {q.options.map((opt: string, idx: number) => (
                          <div key={idx} className={`rounded-[6px] border p-2 ${idx === q.correctIndex ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-black/[0.06] bg-white dark:border-white/[0.08] dark:bg-[#0a0a0a]'}`}>
                            {opt}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="font-bold mb-1">{i + 1}. {q.title}</p>
                      <p className="line-clamp-2 text-sm text-gray-500 dark:text-[#8f8f8f]">{q.description}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <button onClick={handleSave} disabled={loading || questions.length === 0} className="mt-6 flex w-full items-center justify-center gap-2 rounded-[6px] bg-black py-3 text-sm font-medium text-white transition-colors hover:bg-[#333] disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-[#eaeaea]">
          <Save size={20} /> Save Assessment
        </button>
      </div>
    </div>
  );
};

export default CreateTest;
