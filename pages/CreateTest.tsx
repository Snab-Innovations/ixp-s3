import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  Check,
  Code,
  FileText,
  Link as LinkIcon,
  Plus,
  Save,
  Sparkles,
  Trash,
} from 'lucide-react';
import { grokGenerateJson } from '../services/grokService';
import { useMessageBox } from '../components/MessageBox';

const FieldSection = ({
  label,
  title,
  description,
  children,
}: {
  label: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) => (
  <section className="border-b border-white/[0.11] px-4 py-5 sm:px-6 lg:px-7">
    <p className="geist-label uppercase text-[#6b7280]">{label}</p>
    <h2 className="geist-section-title mt-1 text-white">{title}</h2>
    <p className="geist-small mt-1 max-w-2xl text-[#8f8f8f]">{description}</p>
    <div className="mt-5">{children}</div>
  </section>
);

const EmptyQuestions = ({ type }: { type: 'aptitude' | 'coding' }) => (
  <div className="flex min-h-40 items-center justify-center rounded-[6px] border border-dashed border-white/[0.14] bg-white/[0.025] px-4 py-8 text-center">
    <div>
      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] text-[#8f8f8f]">
        {type === 'coding' ? <Code size={16} /> : <FileText size={16} />}
      </div>
      <p className="geist-caption mt-3 font-medium text-[#d4d4d4]">No questions added.</p>
      <p className="geist-small mt-1 text-[#8f8f8f]">Generate with AI or add one manually before saving.</p>
    </div>
  </div>
);

const CreateTest: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showError, showSuccess } = useMessageBox();
  const initialType = searchParams.get('type') === 'coding' ? 'coding' : 'aptitude';
  const [type, setType] = useState<'aptitude' | 'coding'>(initialType);
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(10);
  const [questions, setQuestions] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [passingScore, setPassingScore] = useState(70);
  const [nextInterviewId, setNextInterviewId] = useState('');
  const [recruiterInterviews, setRecruiterInterviews] = useState<any[]>([]);
  const [automationType, setAutomationType] = useState<'internal' | 'external'>('internal');
  const [externalLink, setExternalLink] = useState('');
  const [externalAccessCode, setExternalAccessCode] = useState('');

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
      try {
        const q = query(collection(db, 'interviews'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        setRecruiterInterviews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error('Error loading interviews:', error);
      }
    };

    fetchInterviews();
  }, []);

  const completionItems = useMemo(() => {
    return [
      { label: 'Details', complete: Boolean(title.trim()) && duration > 0 },
      { label: 'Scoring', complete: passingScore >= 0 && passingScore <= 100 },
      { label: 'Questions', complete: questions.length > 0 },
      {
        label: 'Routing',
        complete: automationType === 'internal' ? Boolean(nextInterviewId) : Boolean(externalLink.trim()),
        optional: true,
      },
    ];
  }, [automationType, duration, externalLink, nextInterviewId, passingScore, questions.length, title]);

  const handleTypeChange = (nextType: 'aptitude' | 'coding') => {
    if (nextType === type) return;
    setType(nextType);
    setQuestions([]);
    setManualQ({ question: '', options: ['', '', '', ''], correct: 0 });
    setManualCodeQ({ title: '', description: '', testCases: '' });
  };

  const handleAiGenerate = async () => {
    const trimmedPrompt = aiPrompt.trim();
    if (!trimmedPrompt) {
      showError('Topic is required.');
      return;
    }

    setGenerating(true);
    try {
      const prompt = type === 'aptitude'
        ? `Generate 5 aptitude multiple choice questions about "${trimmedPrompt}". Return ONLY a JSON object. Schema: {"questions":[{"question":"string","options":["string","string","string","string"],"correctIndex":number}]}`
        : `Generate 1 coding problem about "${trimmedPrompt}". Return ONLY a JSON object. Schema: {"questions":[{"title":"string","description":"string","testCases":"string"}]}`;

      const parsed = await grokGenerateJson<{ questions?: any[]; problems?: any[] }>(
        'You are an expert assessment generator. Return only valid JSON.',
        prompt,
        0.6,
        type === 'aptitude' ? 1200 : 800
      );
      const generated: any[] = parsed.questions || parsed.problems || [];
      if (!Array.isArray(generated) || generated.length === 0) throw new Error('No questions returned');
      setQuestions((currentQuestions) => [...currentQuestions, ...generated]);
      showSuccess('Questions generated.');
    } catch (error) {
      console.error('AI Error:', error);
      showError('Failed to generate questions.');
    } finally {
      setGenerating(false);
    }
  };

  const addManualQuestion = () => {
    if (type === 'aptitude') {
      const hasQuestion = manualQ.question.trim();
      const hasOptions = manualQ.options.every(option => option.trim());
      if (!hasQuestion || !hasOptions) {
        showError('Question and all four options are required.');
        return;
      }

      setQuestions((currentQuestions) => [
        ...currentQuestions,
        {
          question: manualQ.question.trim(),
          options: manualQ.options.map(option => option.trim()),
          correctIndex: Number(manualQ.correct),
        },
      ]);
      setManualQ({ question: '', options: ['', '', '', ''], correct: 0 });
      return;
    }

    if (!manualCodeQ.title.trim() || !manualCodeQ.description.trim()) {
      showError('Problem title and description are required.');
      return;
    }

    setQuestions((currentQuestions) => [
      ...currentQuestions,
      {
        title: manualCodeQ.title.trim(),
        description: manualCodeQ.description.trim(),
        testCases: manualCodeQ.testCases.trim(),
      },
    ]);
    setManualCodeQ({ title: '', description: '', testCases: '' });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!title.trim()) {
      showError('Assessment title is required.');
      return;
    }
    if (questions.length === 0) {
      showError('At least one question is required.');
      return;
    }

    setSaving(true);
    try {
      const accessCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const testData: any = {
        recruiterUID: auth.currentUser?.uid,
        title: title.trim(),
        type,
        duration: Number(duration),
        questions,
        accessCode,
        passingScore: Number(passingScore),
        createdAt: serverTimestamp(),
      };

      if (automationType === 'internal' && nextInterviewId) {
        testData.nextInterviewId = nextInterviewId;
      } else if (automationType === 'external' && externalLink.trim()) {
        testData.externalInterviewLink = externalLink.trim();
        testData.externalAccessCode = externalAccessCode.trim();
      }

      await addDoc(collection(db, 'tests'), testData);
      showSuccess('Assessment created.');
      navigate('/recruiter/tests');
    } catch (error) {
      console.error(error);
      showError('Failed to create assessment.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "geist-caption h-9 w-full rounded-[6px] border border-white/[0.11] bg-[#050505] px-3 text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-white/[0.28] focus:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:dark]";
  const textareaClass = "geist-caption min-h-[112px] w-full resize-y rounded-[6px] border border-white/[0.11] bg-[#050505] px-3 py-2.5 text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-white/[0.28] focus:bg-white/[0.04]";
  const selectClass = `${inputClass} appearance-none`;
  const labelClass = "geist-label mb-1.5 block text-[#a1a1aa]";
  const helperClass = "geist-small mt-1 text-[#8f8f8f]";
  const secondaryButtonClass = "geist-caption inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40";
  const primaryButtonClass = "geist-caption inline-flex h-10 items-center justify-center gap-2 rounded-[6px] border border-white bg-white px-4 font-medium text-black transition-colors hover:bg-[#eaeaea] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="-mx-4 -my-8 min-h-[calc(100dvh-3.5rem)] bg-[#000] text-white sm:-mx-6 lg:-mx-8">
      <header className="border-b border-white/[0.11]">
        <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-7 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <button
              type="button"
              onClick={() => navigate('/recruiter/tests')}
              className={secondaryButtonClass}
            >
              <ArrowLeft size={14} />
              <span>Assessments</span>
            </button>
            <p className="geist-label mt-4 uppercase text-[#6b7280]">Assessment setup</p>
            <h1 className="geist-page-title mt-2 text-white">Create assessment</h1>
            <p className="geist-small mt-1 max-w-2xl text-[#8f8f8f]">
              Build a focused screen, set pass criteria, and route qualified candidates into the next interview round.
            </p>
          </div>
          <button
            type="submit"
            form="create-assessment-form"
            disabled={saving || generating || questions.length === 0}
            className={primaryButtonClass}
          >
            <Save size={16} />
            <span>{saving ? 'Saving' : 'Create Assessment'}</span>
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,0.4fr)_1px_minmax(0,1fr)]">
        <aside className="border-b border-white/[0.11] bg-[#020202] px-4 py-5 sm:px-6 lg:border-b-0 lg:px-7">
          <div className="lg:sticky lg:top-[5.25rem]">
            <p className="geist-label uppercase text-[#6b7280]">Flow</p>
            <h2 className="geist-section-title mt-1 text-white">Assessment workflow</h2>
            <p className="geist-small mt-1 max-w-2xl text-[#8f8f8f]">
              Configure the assessment, generate or write prompts, then save it for candidate access.
            </p>

            <div className="mt-5 divide-y divide-white/[0.11] border border-white/[0.11]">
              {completionItems.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 px-3 py-3">
                  <div>
                    <p className="geist-caption font-medium text-white">{item.label}</p>
                    {item.optional && <p className="geist-small mt-0.5 text-[#6b7280]">Optional</p>}
                  </div>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border ${item.complete ? 'border-[#173d25] bg-[#071a10] text-[#7ee787]' : 'border-white/[0.11] bg-white/[0.03] text-[#6b7280]'}`}>
                    {item.complete ? <Check size={13} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-7 border-t border-white/[0.11] pt-5">
              <p className="geist-label uppercase text-[#6b7280]">Draft</p>
              <dl className="mt-3 divide-y divide-white/[0.11] border border-white/[0.11]">
                {[
                  ['Type', type === 'coding' ? 'Coding' : 'Aptitude'],
                  ['Duration', `${duration || 0} min`],
                  ['Passing Score', `${passingScore || 0}%`],
                  ['Questions', String(questions.length)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <dt className="geist-small text-[#8f8f8f]">{label}</dt>
                    <dd className="geist-label tabular-nums text-white">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </aside>

        <div className="hidden bg-white/[0.11] lg:block" />

        <form id="create-assessment-form" onSubmit={handleSave} className="min-w-0">
          <FieldSection
            label="Details"
            title="Assessment profile"
            description="Name the assessment and choose the test format candidates will complete."
          >
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div>
                <label className={labelClass}>Assessment Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={event => setTitle(event.target.value)}
                  className={inputClass}
                  placeholder="Frontend React Screen"
                  required
                />
              </div>

              <div>
                <label className={labelClass}>Assessment Type</label>
                <div className="grid grid-cols-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] p-0.5">
                  {[
                    { value: 'aptitude' as const, label: 'Aptitude', icon: FileText },
                    { value: 'coding' as const, label: 'Coding', icon: Code },
                  ].map((option) => {
                    const Icon = option.icon;
                    const isSelected = type === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleTypeChange(option.value)}
                        className={`geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[4px] font-medium transition-colors ${isSelected ? 'bg-white text-black' : 'text-[#8f8f8f] hover:bg-white/[0.06] hover:text-white'}`}
                      >
                        <Icon size={14} />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className={labelClass}>Duration</label>
                <div className="flex h-9 items-center rounded-[6px] border border-white/[0.11] bg-[#050505]">
                  <button type="button" disabled={duration <= 1} onClick={() => setDuration(Math.max(1, duration - 5))} className="h-full w-10 border-r border-white/[0.11] text-[#8f8f8f] transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-30">-</button>
                  <input
                    type="number"
                    min="1"
                    value={duration}
                    onChange={event => setDuration(Number(event.target.value))}
                    className="geist-caption h-full min-w-0 flex-1 border-none bg-transparent px-3 text-center font-medium tabular-nums text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <button type="button" onClick={() => setDuration(duration + 5)} className="h-full w-10 border-l border-white/[0.11] text-[#8f8f8f] transition-colors hover:bg-white/[0.06] hover:text-white">+</button>
                </div>
                <p className={helperClass}>Candidate time limit in minutes.</p>
              </div>

              <div>
                <label className={labelClass}>Passing Score</label>
                <div className="flex h-9 items-center rounded-[6px] border border-white/[0.11] bg-[#050505]">
                  <input
                    type="number"
                    value={passingScore}
                    onChange={event => setPassingScore(Number(event.target.value))}
                    min="0"
                    max="100"
                    className="geist-caption h-full min-w-0 flex-1 border-none bg-transparent px-3 font-medium tabular-nums text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span className="geist-label border-l border-white/[0.11] px-3 text-[#8f8f8f]">%</span>
                </div>
                <p className={helperClass}>Scores at or above this value can trigger the next round.</p>
              </div>
            </div>
          </FieldSection>

          <FieldSection
            label="Automation"
            title="Next-round routing"
            description="Optionally send passing candidates to an internal interview or an external link."
          >
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className={labelClass}>Routing Type</label>
                <div className="grid grid-cols-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] p-0.5">
                  {[
                    ['internal', 'Internal Interview'],
                    ['external', 'External URL'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAutomationType(value as 'internal' | 'external')}
                      className={`geist-caption h-8 rounded-[4px] font-medium transition-colors ${automationType === value ? 'bg-white text-black' : 'text-[#8f8f8f] hover:bg-white/[0.06] hover:text-white'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {automationType === 'internal' ? (
                <div>
                  <label className={labelClass}>Next Interview</label>
                  <select value={nextInterviewId} onChange={event => setNextInterviewId(event.target.value)} className={selectClass}>
                    <option value="">Select an interview</option>
                    {recruiterInterviews.map(interview => (
                      <option key={interview.id} value={interview.id}>{interview.title}</option>
                    ))}
                  </select>
                  <p className={helperClass}>Passing candidates receive the selected interview link and access code.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
                  <div>
                    <label className={labelClass}>External Interview Link</label>
                    <div className="relative">
                      <LinkIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]" size={14} />
                      <input
                        type="url"
                        value={externalLink}
                        onChange={event => setExternalLink(event.target.value)}
                        className={`${inputClass} pl-9`}
                        placeholder="https://meet.example.com/session"
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Access Code</label>
                    <input
                      type="text"
                      value={externalAccessCode}
                      onChange={event => setExternalAccessCode(event.target.value)}
                      className={inputClass}
                      placeholder="RND-204"
                    />
                  </div>
                </div>
              )}
            </div>
          </FieldSection>

          <FieldSection
            label="Generator"
            title="Generate questions"
            description="Use AI to draft a starter set, then edit the list by adding or removing questions."
          >
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative">
                <Bot className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]" size={14} />
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={event => setAiPrompt(event.target.value)}
                  placeholder={type === 'aptitude' ? 'React fundamentals and browser APIs' : 'Array manipulation in JavaScript'}
                  className={`${inputClass} pl-9`}
                />
              </div>
              <button type="button" onClick={handleAiGenerate} disabled={generating || saving} className={secondaryButtonClass}>
                <Sparkles size={14} />
                <span>{generating ? 'Generating' : 'Generate'}</span>
              </button>
            </div>
          </FieldSection>

          <FieldSection
            label="Manual"
            title={type === 'aptitude' ? 'Add MCQ question' : 'Add coding problem'}
            description={type === 'aptitude' ? 'Write the question, four answer options, and mark the correct option.' : 'Define a coding prompt and optional sample test cases.'}
          >
            {type === 'aptitude' ? (
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className={labelClass}>Question</label>
                  <input
                    type="text"
                    placeholder="Which hook memoizes an expensive calculation?"
                    value={manualQ.question}
                    onChange={event => setManualQ({ ...manualQ, question: event.target.value })}
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {manualQ.options.map((option, index) => (
                    <div key={index}>
                      <label className={labelClass}>Option {index + 1}</label>
                      <input
                        type="text"
                        placeholder={index === 0 ? 'useMemo' : `Answer option ${index + 1}`}
                        value={option}
                        onChange={event => {
                          const nextOptions = [...manualQ.options];
                          nextOptions[index] = event.target.value;
                          setManualQ({ ...manualQ, options: nextOptions });
                        }}
                        className={inputClass}
                      />
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div>
                    <label className={labelClass}>Correct Option</label>
                    <select value={manualQ.correct} onChange={event => setManualQ({ ...manualQ, correct: Number(event.target.value) })} className={selectClass}>
                      {manualQ.options.map((_, index) => <option key={index} value={index}>Option {index + 1}</option>)}
                    </select>
                  </div>
                  <button type="button" onClick={addManualQuestion} className={`${secondaryButtonClass} self-end`}>
                    <Plus size={14} />
                    <span>Add Question</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className={labelClass}>Problem Title</label>
                  <input
                    type="text"
                    placeholder="Merge Overlapping Intervals"
                    value={manualCodeQ.title}
                    onChange={event => setManualCodeQ({ ...manualCodeQ, title: event.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Description</label>
                  <textarea
                    placeholder="Given a list of intervals, merge all overlapping intervals and return the result."
                    value={manualCodeQ.description}
                    onChange={event => setManualCodeQ({ ...manualCodeQ, description: event.target.value })}
                    className={textareaClass}
                    rows={5}
                  />
                </div>
                <div>
                  <label className={labelClass}>Test Cases</label>
                  <textarea
                    placeholder={"Input: [[1,3],[2,6],[8,10]]\nOutput: [[1,6],[8,10]]"}
                    value={manualCodeQ.testCases}
                    onChange={event => setManualCodeQ({ ...manualCodeQ, testCases: event.target.value })}
                    className={textareaClass}
                    rows={4}
                  />
                </div>
                <div className="flex justify-end">
                  <button type="button" onClick={addManualQuestion} className={secondaryButtonClass}>
                    <Plus size={14} />
                    <span>Add Problem</span>
                  </button>
                </div>
              </div>
            )}
          </FieldSection>

          <FieldSection
            label="Review"
            title={`Questions (${questions.length})`}
            description="Review the current assessment prompt set before creating candidate access."
          >
            {questions.length === 0 ? (
              <EmptyQuestions type={type} />
            ) : (
              <div className="divide-y divide-white/[0.08] border border-white/[0.11]">
                {questions.map((question, index) => (
                  <article key={index} className="group px-3 py-3 transition-colors hover:bg-white/[0.025]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="geist-label uppercase text-[#6b7280]">Question {index + 1}</p>
                        <h3 className="geist-caption mt-1 font-semibold text-white">
                          {type === 'aptitude' ? question.question : question.title}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setQuestions((currentQuestions) => currentQuestions.filter((_, questionIndex) => questionIndex !== index))}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-[#3f1d1d] bg-[#180707] text-[#ff8f8f] opacity-100 transition-colors hover:bg-[#260b0b] hover:text-[#ffc3c3] sm:opacity-0 sm:group-hover:opacity-100"
                        title="Remove question"
                      >
                        <Trash size={14} />
                      </button>
                    </div>

                    {type === 'aptitude' ? (
                      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                        {question.options?.map((option: string, optionIndex: number) => (
                          <div
                            key={optionIndex}
                            className={`geist-caption rounded-[6px] border px-3 py-2 ${optionIndex === question.correctIndex ? 'border-[#173d25] bg-[#071a10] text-[#7ee787]' : 'border-white/[0.08] bg-white/[0.025] text-[#d4d4d4]'}`}
                          >
                            {option}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-[6px] border border-white/[0.08] bg-white/[0.025] px-3 py-2">
                        <p className="geist-caption line-clamp-3 text-[#d4d4d4]">{question.description}</p>
                        {question.testCases && <p className="geist-small mt-2 whitespace-pre-wrap font-mono text-[#8f8f8f]">{question.testCases}</p>}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </FieldSection>

          <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-white/[0.11] bg-[#000]/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-7">
            <button type="button" onClick={() => navigate('/recruiter/tests')} className={secondaryButtonClass}>
              Cancel
            </button>
            <button type="submit" disabled={saving || generating || questions.length === 0} className={primaryButtonClass}>
              <Save size={16} />
              <span>{saving ? 'Saving' : 'Create Assessment'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateTest;
