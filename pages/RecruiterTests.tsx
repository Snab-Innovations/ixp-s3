import React, { useEffect, useMemo, useState } from 'react';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  Code,
  Copy,
  ExternalLink,
  FileText,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useMessageBox } from '../components/MessageBox';
import { useCompanyRateLimits } from '../hooks/useRecruiterRateLimits';
import { getRateLimitReachedMessage, isRateLimitReached, RateLimitResource } from '../services/rateLimitService';

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

const formatDate = (value: TimestampLike): string => {
  const millis = toMillis(value);
  if (!millis) return 'Recently';
  return new Date(millis).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const chunkArray = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};

const getAssessmentLink = (testId: string) => `${window.location.origin}/#/test/${testId}`;

const getStats = (test: any, submissions: any[]) => {
  const passingScore = Number(test.passingScore ?? 70);
  const totalScore = submissions.reduce((sum, submission) => sum + (Number(submission.score) || 0), 0);

  return {
    submissions: submissions.length,
    averageScore: submissions.length ? Math.round(totalScore / submissions.length) : 0,
    passed: submissions.filter((submission) => submission.status === 'passed' || Number(submission.score) >= passingScore).length,
  };
};

const StatCell = ({ label, value, tone = 'text-white' }: { label: string; value: React.ReactNode; tone?: string }) => (
  <div className="border-r border-white/[0.11] px-4 py-4 last:border-r-0 sm:px-6 lg:px-7">
    <p className="geist-label uppercase text-[#6b7280]">{label}</p>
    <p className={`geist-metric mt-2 tabular-nums ${tone}`}>{value}</p>
  </div>
);

const RecruiterTests: React.FC = () => {
  const [tests, setTests] = useState<any[]>([]);
  const [submissionsMap, setSubmissionsMap] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'All' | 'aptitude' | 'coding'>('All');
  const navigate = useNavigate();
  const { showConfirm, showError, showSuccess } = useMessageBox();
  const { status: rateLimitStatus } = useCompanyRateLimits();
  const assessmentLimitReached = isRateLimitReached(rateLimitStatus, 'assessments');
  const codingLimitReached = isRateLimitReached(rateLimitStatus, 'codingAssessments');

  const guardCreateLink = (event: React.MouseEvent, resource: RateLimitResource) => {
    if (!isRateLimitReached(rateLimitStatus, resource)) return;
    event.preventDefault();
    showError(getRateLimitReachedMessage(resource));
  };

  useEffect(() => {
    const fetchTests = async () => {
      if (!auth.currentUser) {
        setLoading(false);
        return;
      }

      try {
        const q = query(
          collection(db, 'tests'),
          where('recruiterUID', '==', auth.currentUser.uid)
        );
        const snap = await getDocs(q);
        const fetchedTests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        fetchedTests.sort((a: any, b: any) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setTests(fetchedTests);

        const nextSubmissionsMap: Record<string, any[]> = Object.fromEntries(fetchedTests.map((test: any) => [test.id, []]));
        const idChunks = chunkArray(fetchedTests.map((test: any) => test.id), 10);

        for (const idChunk of idChunks) {
          const submissionsQuery = query(collection(db, 'testSubmissions'), where('testId', 'in', idChunk));
          const submissionsSnap = await getDocs(submissionsQuery);
          submissionsSnap.docs.forEach((submissionDoc) => {
            const submission = { id: submissionDoc.id, ...submissionDoc.data() } as any;
            if (!nextSubmissionsMap[submission.testId]) nextSubmissionsMap[submission.testId] = [];
            nextSubmissionsMap[submission.testId].push(submission);
          });
        }

        setSubmissionsMap(nextSubmissionsMap);
      } catch (error) {
        console.error('Error fetching assessments:', error);
        showError('Unable to load assessments.');
      } finally {
        setLoading(false);
      }
    };

    fetchTests();
  }, [showError]);

  const handleDelete = async (id: string) => {
    showConfirm('Delete this assessment and remove it from your workspace?', async () => {
      try {
        await deleteDoc(doc(db, 'tests', id));
        setTests((currentTests) => currentTests.filter(test => test.id !== id));
        setSubmissionsMap((currentMap) => {
          const nextMap = { ...currentMap };
          delete nextMap[id];
          return nextMap;
        });
        showSuccess('Assessment deleted.');
      } catch (error) {
        console.error('Error deleting assessment:', error);
        showError('Unable to delete assessment.');
      }
    });
  };

  const copyToClipboard = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showSuccess(successMessage);
    } catch (error) {
      console.error('Clipboard copy failed:', error);
      showError('Unable to copy to clipboard.');
    }
  };

  const filteredTests = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();
    return tests.filter((test) => {
      const matchesSearch = !search || `${test.title || ''} ${test.accessCode || ''} ${test.id || ''}`.toLowerCase().includes(search);
      const matchesType = typeFilter === 'All' || test.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [tests, searchQuery, typeFilter]);

  const overviewStats = useMemo(() => {
    const allStats = tests.map((test) => getStats(test, submissionsMap[test.id] || []));
    return {
      coding: tests.filter(test => test.type === 'coding').length,
      aptitude: tests.filter(test => test.type !== 'coding').length,
      submissions: allStats.reduce((sum, stats) => sum + stats.submissions, 0),
      passed: allStats.reduce((sum, stats) => sum + stats.passed, 0),
      averageScore: allStats.length && allStats.some(stats => stats.submissions > 0)
        ? Math.round(allStats.reduce((sum, stats) => sum + (stats.averageScore * stats.submissions), 0) / Math.max(allStats.reduce((sum, stats) => sum + stats.submissions, 0), 1))
        : 0,
    };
  }, [tests, submissionsMap]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col overflow-y-hidden bg-[#000] text-white">
      <section className="shrink-0 border-b border-white/[0.11] bg-[#000]">
        <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-7 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link to="/recruiter/dashboard" className="geist-caption inline-flex h-8 items-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white">
              <ArrowLeft size={14} />
              <span>Dashboard</span>
            </Link>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="geist-label inline-flex h-7 items-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-2.5 uppercase text-[#9ca3af]">
                <BarChart3 size={13} />
                Assessment workspace
              </span>
            </div>
            <h1 className="geist-page-title mt-2 text-white">Assessments</h1>
            <p className="geist-small mt-1 max-w-2xl text-[#8f8f8f]">
              Review assessment health, share secure links, and move candidates into the next round from one workspace.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/recruiter/tests/create?type=aptitude" onClick={(event) => guardCreateLink(event, 'assessments')} aria-disabled={assessmentLimitReached} className={`geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border px-3 font-medium transition-colors ${assessmentLimitReached ? 'cursor-not-allowed border-red-500/30 bg-red-500/10 text-red-400' : 'border-white/[0.11] bg-white/[0.03] text-[#d4d4d4] hover:bg-white/[0.06] hover:text-white'}`}>
              <FileText size={14} />
              <span>Aptitude</span>
            </Link>
            <Link to="/recruiter/tests/create?type=coding" onClick={(event) => guardCreateLink(event, 'codingAssessments')} aria-disabled={codingLimitReached} className={`geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border px-3 font-medium transition-colors ${codingLimitReached ? 'cursor-not-allowed border-red-500/30 bg-red-500/10 text-red-400' : 'border-white/[0.11] bg-white/[0.03] text-[#d4d4d4] hover:bg-white/[0.06] hover:text-white'}`}>
              <Code size={14} />
              <span>Coding</span>
            </Link>
            <Link to="/recruiter/tests/create" onClick={(event) => guardCreateLink(event, 'assessments')} aria-disabled={assessmentLimitReached} className={`geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border px-3 font-medium transition-colors ${assessmentLimitReached ? 'cursor-not-allowed border-red-500/30 bg-red-500/10 text-red-400' : 'border-white bg-white text-black hover:bg-[#eaeaea]'}`}>
              <Plus size={14} />
              <span>{assessmentLimitReached ? 'Limit reached' : 'Create Assessment'}</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="grid shrink-0 grid-cols-2 border-b border-white/[0.11] lg:grid-cols-6">
        <StatCell label="Total" value={tests.length} />
        <StatCell label="Aptitude" value={overviewStats.aptitude} />
        <StatCell label="Coding" value={overviewStats.coding} />
        <StatCell label="Submissions" value={overviewStats.submissions} tone="text-[#83d0a3]" />
        <StatCell label="Passed" value={overviewStats.passed} tone="text-[#8bbde8]" />
        <StatCell label="Avg score" value={`${overviewStats.averageScore}%`} tone="text-[#f5c76b]" />
      </section>

      <section className="shrink-0 border-b border-white/[0.11]">
        <div className="flex flex-col gap-3 px-4 py-3 sm:px-6 lg:px-7 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]" size={14} />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search assessments..."
              className="geist-caption h-9 w-full rounded-[6px] border border-white/[0.11] bg-white/[0.03] pl-9 pr-3 text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-white/[0.28] focus:bg-white/[0.05]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="geist-label uppercase text-[#6b7280]">Type</span>
            <div className="flex rounded-[6px] border border-white/[0.11] bg-white/[0.03] p-0.5">
              {(['All', 'aptitude', 'coding'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeFilter(type)}
                  className={`geist-caption rounded-[4px] px-2.5 py-1 font-medium capitalize transition-colors ${typeFilter === type ? 'bg-white/[0.09] text-white' : 'text-[#6b7280] hover:text-[#d4d4d4]'}`}
                >
                  {type}
                </button>
              ))}
            </div>
            {(searchQuery || typeFilter !== 'All') && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setTypeFilter('All'); }}
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
            <div className="hidden shrink-0 items-center gap-4 border-b border-white/[0.11] px-4 py-2 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1.2fr)_140px_150px_120px_130px_120px] lg:px-7">
              {[...Array(6)].map((_, index) => (
                <div key={index} className="h-3 rounded bg-white/[0.04]" />
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {[...Array(7)].map((_, index) => (
                <div key={index} className="grid gap-3 border-b border-white/[0.08] px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_140px_150px_120px_130px_120px] lg:items-center lg:px-7">
                  <div className="space-y-2">
                    <div className="h-4 w-52 rounded bg-white/[0.04]" />
                  </div>
                  {[...Array(5)].map((__, cellIndex) => (
                    <div key={cellIndex} className="h-6 rounded bg-white/[0.04]" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : tests.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto border-b border-dashed border-white/[0.11] px-4 py-16 text-center sm:px-6 lg:px-7">
            <div>
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] text-[#8f8f8f]">
                <Sparkles size={18} />
              </div>
              <p className="geist-caption mt-4 text-[#d4d4d4]">No assessments created yet.</p>
              <p className="geist-small mt-1 text-[#8f8f8f]">Start with an aptitude screen or coding challenge, then connect passers to an interview.</p>
              <Link to="/recruiter/tests/create" className="geist-caption mt-4 inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border border-white bg-white px-3 font-medium text-black transition-colors hover:bg-[#eaeaea]">
                <Plus size={14} />
                <span>Create your first assessment</span>
              </Link>
            </div>
          </div>
        ) : filteredTests.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto border-b border-dashed border-white/[0.11] px-4 py-16 text-center sm:px-6 lg:px-7">
            <div>
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] text-[#8f8f8f]">
                <Search size={18} />
              </div>
              <p className="geist-caption mt-4 text-[#d4d4d4]">No assessments match your filters.</p>
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setTypeFilter('All'); }}
                className="geist-caption mt-3 inline-flex h-8 items-center justify-center rounded-[6px] border border-[#3f1d1d] bg-[#180707] px-3 font-medium text-[#ff8f8f] transition-colors hover:bg-[#260b0b]"
              >
                Reset filters
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="hidden shrink-0 items-center gap-4 border-b border-white/[0.11] bg-[#000] px-4 py-2 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1.2fr)_140px_150px_120px_130px_120px] lg:px-7">
              <span className="geist-label uppercase text-[#6b7280]">Assessment</span>
              <span className="geist-label text-center uppercase text-[#6b7280]">Copy link</span>
              <span className="geist-label text-center uppercase text-[#6b7280]">Copy pass</span>
              <span className="geist-label text-center uppercase text-[#6b7280]">Type</span>
              <span className="geist-label text-center uppercase text-[#6b7280]">Created</span>
              <span className="geist-label text-right uppercase text-[#6b7280]">Actions</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-color:#27272a_#000] [scrollbar-width:thin]">
              {filteredTests.map((test) => {
                const isCoding = test.type === 'coding';

                return (
                  <article
                    key={test.id}
                    className="grid gap-3 border-b border-white/[0.08] px-4 py-3 transition-colors hover:bg-white/[0.025] sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_140px_150px_120px_130px_120px] lg:items-center lg:gap-4 lg:px-7"
                  >
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => navigate(`/recruiter/tests/${test.id}/results`)}
                        className="geist-caption block max-w-full truncate text-left font-semibold text-white hover:underline"
                        title={test.title}
                      >
                        {test.title}
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-3 lg:justify-center">
                      <span className="geist-label uppercase text-[#6b7280] lg:hidden">Copy link</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(getAssessmentLink(test.id), 'Assessment link copied.')}
                        className="geist-caption inline-flex h-8 min-w-[112px] items-center justify-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
                      >
                        <ExternalLink size={13} />
                        <span>Copy link</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-3 lg:justify-center">
                      <span className="geist-label uppercase text-[#6b7280] lg:hidden">Copy pass</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(test.accessCode || '', 'Access code copied.')}
                        className="geist-label inline-flex h-8 min-w-[124px] items-center justify-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={!test.accessCode}
                      >
                        <span className="tabular-nums">{test.accessCode || 'No pass'}</span>
                        <Copy size={12} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-3 lg:justify-center">
                      <span className="geist-label uppercase text-[#6b7280] lg:hidden">Type</span>
                      <span className="geist-small inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-2.5 font-medium capitalize text-[#d4d4d4]">
                        {isCoding ? <Code size={13} /> : <FileText size={13} />}
                        {test.type || 'aptitude'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 lg:justify-center">
                      <span className="geist-label uppercase text-[#6b7280] lg:hidden">Created</span>
                      <span className="geist-small text-[#8f8f8f]">{formatDate(test.createdAt)}</span>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/recruiter/tests/${test.id}/results`)}
                        className="geist-caption inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
                      >
                        Results
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(test.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[#3f1d1d] bg-[#180707] text-[#ff8f8f] transition-colors hover:bg-[#260b0b] hover:text-[#ffc3c3]"
                        title="Delete assessment"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default RecruiterTests;
