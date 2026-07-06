import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { ArrowLeft, AlertTriangle, User, FileText, X, Check, XCircle, Search, Mail, Filter, Trophy } from 'lucide-react';

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
        // Fetch Test Details
        const testSnap = await getDoc(doc(db, 'tests', testId));
        if (testSnap.exists()) {
          setTest({ id: testSnap.id, ...testSnap.data() });
        }

        const q = query(
          collection(db, 'testSubmissions'),
          where('testId', '==', testId)
        );
        const snap = await getDocs(q);
        const fetchedSubmissions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        fetchedSubmissions.sort((a: any, b: any) => {
          const dateA = a.submittedAt?.toDate ? a.submittedAt.toDate() : new Date(0);
          const dateB = b.submittedAt?.toDate ? b.submittedAt.toDate() : new Date(0);
          return dateB - dateA;
        });
        setSubmissions(fetchedSubmissions);
      } catch (error) {
        console.error("Error fetching results:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, [testId]);

  const filteredAndSortedSubmissions = submissions
    .filter(sub => {
      const search = searchTerm.toLowerCase();
      return (
        (sub.candidateName || '').toLowerCase().includes(search) || 
        (sub.candidateEmail || '').toLowerCase().includes(search)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'score') {
        return b.score - a.score;
      } else if (sortBy === 'name') {
        const nameA = a.candidateName || '';
        const nameB = b.candidateName || '';
        return nameA.localeCompare(nameB);
      } else {
        const dateA = a.submittedAt?.toDate ? a.submittedAt.toDate() : new Date(0);
        const dateB = b.submittedAt?.toDate ? b.submittedAt.toDate() : new Date(0);
        return dateB - dateA;
      }
    });

  const averageScore = submissions.length
    ? Math.round(submissions.reduce((total, sub) => total + (Number(sub.score) || 0), 0) / submissions.length)
    : 0;
  const passedCount = submissions.filter(sub => (sub.status === 'passed') || (test?.passingScore && sub.score >= test.passingScore)).length;
  const flaggedCount = submissions.filter(sub => sub.tabSwitchCount > 0).length;

  return (
    <div className="min-h-screen bg-white text-[#111] dark:bg-[#050505] dark:text-white">
      <div className="mx-auto max-w-6xl py-2 sm:py-4">
        <button onClick={() => navigate('/recruiter/tests')} className="mb-6 inline-flex h-9 items-center gap-2 rounded-[6px] border border-black/[0.08] px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-black/[0.03] hover:text-black dark:border-white/[0.11] dark:text-[#a1a1a1] dark:hover:bg-white/[0.05] dark:hover:text-white">
          <ArrowLeft size={18} /> Back to Assessments
        </button>

        <div className="mb-8 border-b border-black/[0.08] pb-6 dark:border-white/[0.11]">
          <div className="mb-3 inline-flex h-7 items-center gap-2 rounded-full border border-black/[0.08] bg-black/[0.03] px-3 text-xs font-medium text-gray-600 dark:border-white/[0.11] dark:bg-white/[0.05] dark:text-[#a1a1a1]">
            <Trophy size={13} /> Results
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-5xl">{test?.title || 'Assessment Results'}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500 dark:text-[#8f8f8f]">Review candidate submissions, scores, security flags, and submitted answers.</p>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
          {[
            ['Submissions', submissions.length],
            ['Average score', `${averageScore}%`],
            ['Passed', passedCount],
            ['Flagged', flaggedCount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[10px] border border-black/[0.08] bg-white p-4 dark:border-white/[0.11] dark:bg-[#0a0a0a]">
              <p className="text-xs font-medium text-gray-500 dark:text-[#8f8f8f]">{label}</p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input 
              type="text" 
              placeholder="Search by name or email..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-[8px] border border-black/[0.08] bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-black/30 focus:ring-4 focus:ring-black/[0.04] dark:border-white/[0.11] dark:bg-[#0a0a0a] dark:placeholder:text-[#666] dark:focus:border-white/30 dark:focus:ring-white/[0.06]"
            />
          </div>
          <div className="flex items-center gap-2 rounded-[8px] border border-black/[0.08] bg-white px-4 py-2 dark:border-white/[0.11] dark:bg-[#0a0a0a]">
            <Filter size={18} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-500 whitespace-nowrap">Sort by:</span>
            <select 
              value={sortBy} 
              onChange={(e: any) => setSortBy(e.target.value)}
              className="cursor-pointer border-none bg-transparent text-sm font-medium outline-none dark:text-white"
            >
              <option value="date">Newest First</option>
              <option value="score">Highest Score</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="rounded-[10px] border border-black/[0.08] py-20 text-center text-sm text-gray-500 dark:border-white/[0.11] dark:text-[#8f8f8f]">Loading results...</div>
        ) : filteredAndSortedSubmissions.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-black/[0.16] bg-black/[0.02] py-20 text-center dark:border-white/[0.18] dark:bg-white/[0.03]">
            <p className="text-sm text-gray-500 dark:text-[#8f8f8f]">No submissions found matching your criteria.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[12px] border border-black/[0.08] bg-white dark:border-white/[0.11] dark:bg-[#0a0a0a]">
            {filteredAndSortedSubmissions.map((sub, i) => (
              <div key={sub.id} className={`flex flex-col gap-4 p-5 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03] md:flex-row md:items-center md:justify-between ${i !== filteredAndSortedSubmissions.length - 1 ? 'border-b border-black/[0.06] dark:border-white/[0.08]' : ''}`}>
                <div>
                  <h3 className="mb-1 text-base font-semibold text-gray-900 dark:text-white">{sub.candidateName}</h3>
                  {sub.candidateEmail && (
                    <div className="mb-2 flex items-center gap-1 text-sm text-gray-600 dark:text-[#a1a1a1]">
                       <Mail size={14} /> {sub.candidateEmail}
                    </div>
                  )}
                  <p className="text-sm text-gray-500">Submitted: {sub.submittedAt?.toDate().toLocaleString()}</p>
                  {sub.tabSwitchCount > 0 && (
                    <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle size={14} /> Tab switched {sub.tabSwitchCount} time(s)
                    </div>
                  )}
                  {sub.feedback && <p className="text-sm text-gray-400 mt-1 italic">"{sub.feedback}"</p>}
                </div>
                <div className="flex items-center gap-4">
                <div className="flex flex-col items-end gap-2">
                  <div className={`font-mono text-2xl font-semibold ${sub.score >= 70 ? 'text-emerald-500' : sub.score >= 40 ? 'text-amber-500' : 'text-red-500'}`}>{sub.score}%</div>
                  {sub.emailSent !== undefined && (
                    <div className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${sub.emailSent ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                      {sub.emailSent ? (
                        <><Check size={10} strokeWidth={3} /> Email Sent</>
                      ) : (
                        <><X size={10} strokeWidth={3} /> Email Failed</>
                      )}
                    </div>
                  )}
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => navigate(`/profile/${sub.candidateUID}`)}
                      className="rounded-[6px] border border-black/[0.08] bg-white p-2 text-gray-600 transition-colors hover:bg-black/[0.04] hover:text-black dark:border-white/[0.11] dark:bg-[#050505] dark:text-[#a1a1a1] dark:hover:bg-white/[0.06] dark:hover:text-white"
                      title="View Profile"
                    >
                      <User size={18} />
                    </button>
                    <button 
                      onClick={() => setSelectedSubmission(sub)}
                      className="rounded-[6px] border border-black/[0.08] bg-black p-2 text-white transition-colors hover:bg-[#333] dark:border-white/[0.11] dark:bg-white dark:text-black dark:hover:bg-[#eaeaea]"
                      title="View Solution"
                    >
                      <FileText size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Solution Modal */}
        {selectedSubmission && test && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedSubmission(null)}>
            <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[12px] border border-black/[0.08] bg-white text-gray-900 shadow-2xl dark:border-white/[0.11] dark:bg-[#0a0a0a] dark:text-white" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-black/[0.08] bg-black/[0.02] p-4 dark:border-white/[0.11] dark:bg-white/[0.04]">
                <div>
                  <h3 className="text-lg font-semibold">{selectedSubmission.candidateName}'s Solution</h3>
                  <p className="text-xs text-gray-500">Score: {selectedSubmission.score}%</p>
                </div>
                <button onClick={() => setSelectedSubmission(null)} className="rounded-[6px] p-1 transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.08]">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto">
                {test.questions?.map((q: any, i: number) => (
                  <div key={i} className="mb-8 last:mb-0">
                    <h4 className="mb-3 flex gap-2 font-semibold text-gray-800 dark:text-gray-200">
                      <span className="text-gray-400">Q{i+1}.</span> 
                      {test.type === 'aptitude' ? q.question : q.title}
                    </h4>
                    
                    {test.type === 'aptitude' ? (
                      <div className="space-y-2">
                        {q.options?.map((opt: string, optIdx: number) => {
                          const isSelected = selectedSubmission.answers?.[i] === optIdx;
                          const isCorrect = q.correctIndex === optIdx;
                          let itemClass = `flex items-center justify-between rounded-[8px] border p-3 text-sm `;
                          
                          if (isCorrect) itemClass += "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
                          else if (isSelected && !isCorrect) itemClass += "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400";
                          else itemClass += "border-black/[0.08] bg-black/[0.02] text-gray-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-[#a1a1a1]";

                          return (
                            <div key={optIdx} className={itemClass}>
                              <span>{opt}</span>
                              {isCorrect && <Check size={16} />}
                              {isSelected && !isCorrect && <XCircle size={16} />}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="bg-[#1e1e1e] p-4 rounded-xl overflow-x-auto border border-gray-700">
                        <pre className="text-sm font-mono text-gray-300">{selectedSubmission.answers?.[i] || '// No code submitted'}</pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TestResults;
