import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { rds } from '../services/rdsApi';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  FileText,
  Filter,
  Mail,
  Search,
  ShieldCheck,
  Trophy,
  User,
  X,
  XCircle,
} from 'lucide-react';

type TimestampLike =
  | {
      toDate?: () => Date;
      toMillis?: () => number;
      seconds?: number;
    }
  | Date
  | string
  | null
  | undefined;

const toMillis = (value: TimestampLike): number => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
};

const formatDateTime = (value: TimestampLike): string => {
  const millis = toMillis(value);
  if (!millis) return 'Recently';

  return new Date(millis).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getScoreTone = (score: number) => {
  if (score >= 70) return 'text-[#83d0a3]';
  if (score >= 40) return 'text-[#f5c76b]';
  return 'text-[#ff8f8f]';
};

const getResultStatus = (submission: any, passingScore: number) => {
  if (submission.status === 'terminated') {
    return {
      label: 'Terminated',
      icon: XCircle,
      className: 'border-[#3f1d1d] bg-[#180707] text-[#ff8f8f]',
    };
  }

  if (submission.status === 'passed' || Number(submission.score) >= passingScore) {
    return {
      label: 'Passed',
      icon: Check,
      className: 'border-[#1f3a2a] bg-[#07180f] text-[#83d0a3]',
    };
  }

  return {
    label: 'Failed',
    icon: XCircle,
    className: 'border-[#3f1d1d] bg-[#180707] text-[#ff8f8f]',
  };
};

const getIntegrityState = (submission: any) => {
  const tabSwitchCount = Number(submission.tabSwitchCount) || 0;

  if (submission.status === 'terminated') {
    return {
      label: 'Terminated',
      icon: AlertTriangle,
      className: 'border-[#3f1d1d] bg-[#180707] text-[#ff8f8f]',
    };
  }

  if (tabSwitchCount > 0) {
    return {
      label: `${tabSwitchCount} switch${tabSwitchCount === 1 ? '' : 'es'}`,
      icon: AlertTriangle,
      className: 'border-[#3d2b12] bg-[#1a1205] text-[#f5c76b]',
    };
  }

  return {
    label: 'Clean',
    icon: ShieldCheck,
    className: 'border-[#1f3a2a] bg-[#07180f] text-[#83d0a3]',
  };
};

const getEmailState = (submission: any) => {
  if (submission.emailSent === true) {
    return {
      label: 'Sent',
      icon: Mail,
      className: 'border-[#1f3a2a] bg-[#07180f] text-[#83d0a3]',
    };
  }

  if (submission.emailSent === false) {
    return {
      label: 'Failed',
      icon: X,
      className: 'border-[#3f1d1d] bg-[#180707] text-[#ff8f8f]',
    };
  }

  return {
    label: 'Not sent',
    icon: Mail,
    className: 'border-white/[0.11] bg-white/[0.03] text-[#8f8f8f]',
  };
};

const Badge = ({
  icon: Icon,
  label,
  className,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  className: string;
}) => (
  <span className={`geist-small inline-flex h-7 items-center justify-center gap-1.5 rounded-[6px] border px-2.5 font-medium ${className}`}>
    <Icon size={13} strokeWidth={2.2} />
    <span>{label}</span>
  </span>
);

const TestResults: React.FC = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [test, setTest] = useState<any>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'score' | 'name'>('date');

  useEffect(() => {
    const fetchResults = async () => {
      if (!testId) return;

      try {
        try {
          const { test } = await rds.getTest(testId);
          if (test) {
            setTest(test);
          }
        } catch (error) {
          console.error('Error fetching test:', error);
        }

        const { submissions: fetchedSubmissions } = await rds.listTestSubmissions(testId);

        fetchedSubmissions.sort((a: any, b: any) => toMillis(b.submittedAt) - toMillis(a.submittedAt));
        setSubmissions(fetchedSubmissions);
      } catch (error) {
        console.error('Error fetching results:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [testId]);

  const filteredAndSortedSubmissions = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return submissions
      .filter((submission) => {
        if (!search) return true;
        return `${submission.candidateName || ''} ${submission.candidateEmail || ''}`.toLowerCase().includes(search);
      })
      .sort((a, b) => {
        if (sortBy === 'score') return (Number(b.score) || 0) - (Number(a.score) || 0);
        if (sortBy === 'name') return String(a.candidateName || '').localeCompare(String(b.candidateName || ''));
        return toMillis(b.submittedAt) - toMillis(a.submittedAt);
      });
  }, [submissions, searchTerm, sortBy]);

  const passingScore = Number(test?.passingScore ?? 70);
  const title = test?.title || 'Assessment results';

  return (
    <div className="-mx-4 -my-8 flex h-[calc(100vh-3.5rem)] min-h-0 flex-col overflow-hidden bg-[#000] text-white sm:-mx-6 lg:-mx-8">
      <section className="shrink-0 border-b border-white/[0.11] bg-[#000]">
        <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-7 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <button
              type="button"
              onClick={() => navigate('/recruiter/tests')}
              className="geist-caption inline-flex h-8 items-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <ArrowLeft size={14} />
              <span>Assessments</span>
            </button>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="geist-label inline-flex h-7 items-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-2.5 uppercase text-[#9ca3af]">
                <Trophy size={13} />
                Result review
              </span>
              {test?.type && (
                <span className="geist-label inline-flex h-7 items-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-2.5 uppercase text-[#6b7280]">
                  {test.type}
                </span>
              )}
            </div>

            <h1 className="geist-page-title mt-2 max-w-4xl truncate text-white" title={title}>
              {title}
            </h1>
            <p className="geist-small mt-1 max-w-2xl text-[#8f8f8f]">
              Review candidate answers, score outcomes, delivery status, and integrity signals.
            </p>
          </div>
        </div>
      </section>

      <section className="shrink-0 border-b border-white/[0.11]">
        <div className="flex flex-col gap-3 px-4 py-3 sm:px-6 lg:px-7 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]" size={14} />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search candidates..."
              className="geist-caption h-9 w-full rounded-[6px] border border-white/[0.11] bg-white/[0.03] pl-9 pr-3 text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-white/[0.28] focus:bg-white/[0.05]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="geist-label inline-flex items-center gap-1.5 uppercase text-[#6b7280]">
              <Filter size={13} />
              Sort
            </span>
            <div className="flex rounded-[6px] border border-white/[0.11] bg-white/[0.03] p-0.5">
              {[
                ['date', 'Newest'],
                ['score', 'Score'],
                ['name', 'Name'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSortBy(value as 'date' | 'score' | 'name')}
                  className={`geist-caption rounded-[4px] px-2.5 py-1 font-medium transition-colors ${sortBy === value ? 'bg-white/[0.09] text-white' : 'text-[#6b7280] hover:text-[#d4d4d4]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="geist-caption inline-flex h-8 items-center justify-center rounded-[6px] border border-[#3f1d1d] bg-[#180707] px-3 font-medium text-[#ff8f8f] transition-colors hover:bg-[#260b0b]"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="hidden shrink-0 items-center gap-4 border-b border-white/[0.11] px-4 py-2 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1.25fr)_90px_112px_132px_118px_150px_130px] lg:px-7">
              {[...Array(7)].map((_, index) => (
                <div key={index} className="h-3 rounded bg-white/[0.04]" />
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {[...Array(8)].map((_, index) => (
                <div key={index} className="grid gap-3 border-b border-white/[0.08] px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1.25fr)_90px_112px_132px_118px_150px_130px] lg:items-center lg:px-7">
                  <div className="space-y-2">
                    <div className="h-4 w-48 rounded bg-white/[0.04]" />
                    <div className="h-3 w-64 max-w-full rounded bg-white/[0.035]" />
                  </div>
                  {[...Array(6)].map((__, cellIndex) => (
                    <div key={cellIndex} className="h-7 rounded bg-white/[0.04]" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : submissions.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto border-b border-dashed border-white/[0.11] px-4 py-16 text-center sm:px-6 lg:px-7">
            <div>
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] text-[#8f8f8f]">
                <Clock size={18} />
              </div>
              <p className="geist-caption mt-4 text-[#d4d4d4]">No submissions yet.</p>
              <p className="geist-small mt-1 text-[#8f8f8f]">Results will appear here as candidates complete this assessment.</p>
            </div>
          </div>
        ) : filteredAndSortedSubmissions.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto border-b border-dashed border-white/[0.11] px-4 py-16 text-center sm:px-6 lg:px-7">
            <div>
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] text-[#8f8f8f]">
                <Search size={18} />
              </div>
              <p className="geist-caption mt-4 text-[#d4d4d4]">No candidates match your search.</p>
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="geist-caption mt-3 inline-flex h-8 items-center justify-center rounded-[6px] border border-[#3f1d1d] bg-[#180707] px-3 font-medium text-[#ff8f8f] transition-colors hover:bg-[#260b0b]"
              >
                Reset search
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="hidden shrink-0 items-center gap-4 border-b border-white/[0.11] bg-[#000] px-4 py-2 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1.25fr)_90px_112px_132px_118px_150px_130px] lg:px-7">
              <span className="geist-label uppercase text-[#6b7280]">Candidate</span>
              <span className="geist-label text-center uppercase text-[#6b7280]">Score</span>
              <span className="geist-label text-center uppercase text-[#6b7280]">Status</span>
              <span className="geist-label text-center uppercase text-[#6b7280]">Integrity</span>
              <span className="geist-label text-center uppercase text-[#6b7280]">Email</span>
              <span className="geist-label text-center uppercase text-[#6b7280]">Submitted</span>
              <span className="geist-label text-right uppercase text-[#6b7280]">Actions</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-color:#27272a_#000] [scrollbar-width:thin]">
              {filteredAndSortedSubmissions.map((submission) => {
                const score = Number(submission.score) || 0;
                const resultStatus = getResultStatus(submission, passingScore);
                const integrity = getIntegrityState(submission);
                const email = getEmailState(submission);

                return (
                  <article
                    key={submission.id}
                    className="grid gap-3 border-b border-white/[0.08] px-4 py-3 transition-colors hover:bg-white/[0.025] sm:px-6 lg:grid-cols-[minmax(0,1.25fr)_90px_112px_132px_118px_150px_130px] lg:items-center lg:gap-4 lg:px-7"
                  >
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setSelectedSubmission(submission)}
                        className="geist-caption block max-w-full truncate text-left font-semibold text-white hover:underline"
                        title={submission.candidateName || 'Candidate'}
                      >
                        {submission.candidateName || 'Unnamed candidate'}
                      </button>
                      {submission.candidateEmail && (
                        <div className="geist-small mt-1 flex min-w-0 items-center gap-1.5 text-[#8f8f8f]">
                          <Mail size={13} className="shrink-0" />
                          <span className="truncate">{submission.candidateEmail}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3 lg:justify-center">
                      <span className="geist-label uppercase text-[#6b7280] lg:hidden">Score</span>
                      <span className={`geist-metric tabular-nums ${getScoreTone(score)}`}>{score}%</span>
                    </div>

                    <div className="flex items-center justify-between gap-3 lg:justify-center">
                      <span className="geist-label uppercase text-[#6b7280] lg:hidden">Status</span>
                      <Badge {...resultStatus} />
                    </div>

                    <div className="flex items-center justify-between gap-3 lg:justify-center">
                      <span className="geist-label uppercase text-[#6b7280] lg:hidden">Integrity</span>
                      <Badge {...integrity} />
                    </div>

                    <div className="flex items-center justify-between gap-3 lg:justify-center">
                      <span className="geist-label uppercase text-[#6b7280] lg:hidden">Email</span>
                      <Badge {...email} />
                    </div>

                    <div className="flex items-center justify-between gap-3 lg:justify-center">
                      <span className="geist-label uppercase text-[#6b7280] lg:hidden">Submitted</span>
                      <span className="geist-small text-[#8f8f8f]">{formatDateTime(submission.submittedAt)}</span>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      {submission.candidateUID && (
                        <button
                          type="button"
                          onClick={() => navigate(`/profile/${submission.candidateUID}`)}
                          className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
                          title="View profile"
                          aria-label="View profile"
                        >
                          <User size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedSubmission(submission)}
                        className="geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border border-white bg-white px-3 font-medium text-black transition-colors hover:bg-[#eaeaea]"
                      >
                        <FileText size={14} />
                        <span>Solution</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      {selectedSubmission && test && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setSelectedSubmission(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[8px] border border-white/[0.14] bg-[#050505] text-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.11] px-5 py-4">
              <div className="min-w-0">
                <span className="geist-label uppercase text-[#6b7280]">Submitted solution</span>
                <h2 className="mt-1 truncate text-xl font-semibold text-white">
                  {selectedSubmission.candidateName || 'Unnamed candidate'}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`geist-label tabular-nums ${getScoreTone(Number(selectedSubmission.score) || 0)}`}>
                    {Number(selectedSubmission.score) || 0}% score
                  </span>
                  <span className="geist-small text-[#8f8f8f]">{formatDateTime(selectedSubmission.submittedAt)}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSubmission(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
                title="Close"
                aria-label="Close solution"
              >
                <X size={15} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 [scrollbar-color:#27272a_#050505] [scrollbar-width:thin]">
              <div className="space-y-4">
                {test.questions?.map((question: any, index: number) => (
                  <section key={index} className="rounded-[8px] border border-white/[0.11] bg-white/[0.03]">
                    <div className="border-b border-white/[0.08] px-4 py-3">
                      <p className="geist-label uppercase text-[#6b7280]">Question {index + 1}</p>
                      <h3 className="geist-caption mt-1 font-semibold text-white">
                        {test.type === 'aptitude' ? question.question : question.title}
                      </h3>
                    </div>

                    {test.type === 'aptitude' ? (
                      <div className="space-y-2 p-4">
                        {question.options?.map((option: string, optionIndex: number) => {
                          const isSelected = selectedSubmission.answers?.[index] === optionIndex;
                          const isCorrect = question.correctIndex === optionIndex;
                          const optionClass = isCorrect
                            ? 'border-[#1f3a2a] bg-[#07180f] text-[#83d0a3]'
                            : isSelected
                              ? 'border-[#3f1d1d] bg-[#180707] text-[#ff8f8f]'
                              : 'border-white/[0.08] bg-[#050505] text-[#a1a1a1]';

                          return (
                            <div
                              key={optionIndex}
                              className={`geist-caption flex items-center justify-between gap-3 rounded-[6px] border px-3 py-2 ${optionClass}`}
                            >
                              <span>{option}</span>
                              {isCorrect && <Check size={14} />}
                              {isSelected && !isCorrect && <XCircle size={14} />}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-4">
                        <pre className="overflow-x-auto rounded-[6px] border border-white/[0.11] bg-[#000] p-4 font-mono text-sm leading-6 text-[#d4d4d4]">
                          {selectedSubmission.answers?.[index] || '// No code submitted'}
                        </pre>
                      </div>
                    )}
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TestResults;
