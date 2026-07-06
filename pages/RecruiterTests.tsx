import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Trash2, FileText, Code, Eye, Clock, Sparkles, Copy, BarChart3 } from 'lucide-react';

const RecruiterTests: React.FC = () => {
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTests = async () => {
      if (!auth.currentUser) return;
      try {
        const q = query(
          collection(db, 'tests'),
          where('recruiterUID', '==', auth.currentUser.uid)
        );
        const snap = await getDocs(q);
        const fetchedTests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        fetchedTests.sort((a: any, b: any) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
          return dateB - dateA;
        });
        setTests(fetchedTests);
      } catch (error) {
        console.error("Error fetching tests:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchTests();
  }, []);

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this test?")) {
      await deleteDoc(doc(db, 'tests', id));
      setTests(tests.filter(t => t.id !== id));
    }
  };

  const codingCount = tests.filter(test => test.type === 'coding').length;
  const aptitudeCount = tests.filter(test => test.type !== 'coding').length;
  const automatedCount = tests.filter(test => test.nextInterviewId || test.externalInterviewLink).length;

  return (
    <div className="min-h-screen bg-white text-[#111] dark:bg-[#050505] dark:text-white px-0 py-2 sm:py-4">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-5 border-b border-black/[0.08] pb-6 dark:border-white/[0.11] md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex h-7 items-center gap-2 rounded-full border border-black/[0.08] bg-black/[0.03] px-3 text-xs font-medium text-gray-600 dark:border-white/[0.11] dark:bg-white/[0.05] dark:text-[#a1a1a1]">
              <BarChart3 size={13} /> Assessment workspace
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-5xl">Assessments</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500 dark:text-[#8f8f8f]">Create, manage, and review aptitude or coding assessments with secure access codes and next-round automation.</p>
          </div>
          <Link to="/recruiter/tests/create" className="inline-flex h-10 items-center justify-center gap-2 rounded-[6px] bg-black px-4 text-sm font-medium text-white transition-colors hover:bg-[#333] dark:bg-white dark:text-black dark:hover:bg-[#eaeaea]">
            <Plus size={16} /> Create Assessment
          </Link>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-4">
          {[
            ['Total', tests.length],
            ['Aptitude', aptitudeCount],
            ['Coding', codingCount],
            ['Automated', automatedCount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[10px] border border-black/[0.08] bg-white p-4 dark:border-white/[0.11] dark:bg-[#0a0a0a]">
              <p className="text-xs font-medium text-gray-500 dark:text-[#8f8f8f]">{label}</p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="rounded-[10px] border border-black/[0.08] py-20 text-center text-sm text-gray-500 dark:border-white/[0.11] dark:text-[#8f8f8f]">Loading assessments...</div>
        ) : tests.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-black/[0.16] bg-black/[0.02] py-20 text-center dark:border-white/[0.18] dark:bg-white/[0.03]">
            <p className="mb-4 text-sm text-gray-500 dark:text-[#8f8f8f]">No assessments created yet.</p>
            <Link to="/recruiter/tests/create" className="inline-flex h-9 items-center justify-center rounded-[6px] border border-black/[0.12] bg-white px-3 text-sm font-medium hover:bg-gray-50 dark:border-white/[0.14] dark:bg-[#0a0a0a] dark:hover:bg-white/[0.06]">Create your first assessment</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tests.map(test => (
              <div key={test.id} className="group rounded-[12px] border border-black/[0.08] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:border-black/[0.18] dark:border-white/[0.11] dark:bg-[#0a0a0a] dark:hover:border-white/[0.24]">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-black/[0.08] bg-black/[0.03] text-black dark:border-white/[0.11] dark:bg-white/[0.06] dark:text-white">
                    {test.type === 'coding' ? <Code size={18} /> : <FileText size={18} />}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => navigate(`/recruiter/tests/${test.id}/results`)} className="rounded-[6px] border border-transparent p-2 text-gray-500 transition-colors hover:border-black/[0.08] hover:bg-black/[0.03] hover:text-black dark:hover:border-white/[0.11] dark:hover:bg-white/[0.06] dark:hover:text-white" title="View Results">
                      <Eye size={18} />
                    </button>
                    <button onClick={() => handleDelete(test.id)} className="rounded-[6px] border border-transparent p-2 text-gray-500 transition-colors hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-500" title="Delete">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                <h3 className="mb-2 line-clamp-2 text-lg font-semibold tracking-[-0.02em]">{test.title}</h3>
                <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-[#8f8f8f]">
                  <span className="rounded-full border border-black/[0.08] px-2 py-1 capitalize dark:border-white/[0.11]">{test.type} Test</span>
                  <span>{test.questions?.length || 0} Questions</span>
                  {test.nextInterviewId && (
                    <span className="flex items-center gap-1 text-gray-900 dark:text-white"><Sparkles size={14} /> Automation</span>
                  )}
                  <span className="flex items-center gap-1"><Clock size={14} /> {test.duration || 'N/A'} min</span>
                </div>
                <div className="mb-4 flex items-center justify-between rounded-[8px] border border-black/[0.08] bg-black/[0.02] p-3 dark:border-white/[0.11] dark:bg-white/[0.04]">
                  <div>
                    <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.12em] text-gray-500 dark:text-[#8f8f8f]">Access Code</p>
                    <p className="font-mono text-lg font-semibold tracking-[0.22em] text-black dark:text-white">{test.accessCode || 'N/A'}</p>
                  </div>
                  {test.accessCode && (
                    <button onClick={() => navigator.clipboard.writeText(test.accessCode)} className="inline-flex items-center gap-1.5 rounded-[6px] border border-black/[0.08] bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:text-black dark:border-white/[0.11] dark:bg-[#0a0a0a] dark:text-[#a1a1a1] dark:hover:text-white">
                      <Copy size={13} /> Copy
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-black/[0.08] pt-4 dark:border-white/[0.08]">
                  <span className="text-xs text-gray-400">Created {test.createdAt?.toDate().toLocaleDateString() || 'recently'}</span>
                  <button onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/#/test/${test.id}`);
                    alert("Assessment link copied to clipboard!");
                  }} className="text-sm font-medium text-black underline-offset-4 hover:underline dark:text-white">Copy Link</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecruiterTests;
