import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { rds } from '../services/rdsApi';
import { loadStoredCognitoSession } from '../services/authService';

interface Interview {
  id: string;
  jobTitle: string;
  submittedAt: any;
  status: string;
  score: string;
  resumeScore: string;
  qnaScore: string;
}

const CandidateInterviews: React.FC = () => {
  const { user } = useAuth();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');

  useEffect(() => {
    if (!user) return;

    const fetchInterviews = async () => {
      try {
        const { interviews } = await rds.listInterviews({
          candidateUID: loadStoredCognitoSession()?.firebaseUid || ''
        });
        setInterviews(
          (interviews || [])
            .sort((a: any, b: any) =>
              (b.submittedAt ? new Date(b.submittedAt).getTime() : 0) -
              (a.submittedAt ? new Date(a.submittedAt).getTime() : 0)
            )
            .map(i => i as Interview)
        );
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchInterviews();
  }, [user]);

  const stats = {
    total: interviews.length,
    hired: interviews.filter(i => i.status === 'Hired').length,
    rejected: interviews.filter(i => i.status === 'Rejected').length,
    pending: interviews.filter(i => !['Hired', 'Rejected'].includes(i.status)).length
  };

  const filteredInterviews = interviews
    .filter(i =>
      (i.jobTitle || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const aDate = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const bDate = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return sortOrder === 'newest' ? bDate - aDate : aDate - bDate;
    });

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'Hired': return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20';
      case 'Rejected': return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20';
      case 'Interview Scheduled': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20';
      default: return 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    }
  };

  if (loading)
    return (
      <div className="text-center py-10 text-slate-400">
        Loading interviews...
      </div>
    );

  return (
    <div className="min-h-screen px-4 sm:px-6 pb-10 bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-white transition-colors">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">My Interview History</h2>
          <p className="text-gray-500 dark:text-slate-400 mt-2">Track your progress and review detailed performance reports.</p>
        </div>
      </div>

      {/* Stats Overview - Modern Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
            <i className="fas fa-clipboard-list text-6xl text-blue-500"></i>
          </div>
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Total Interviews</p>
          <h3 className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{stats.total}</h3>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
            <i className="fas fa-clock text-6xl text-yellow-500"></i>
          </div>
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Pending</p>
          <h3 className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{stats.pending}</h3>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
            <i className="fas fa-check-circle text-6xl text-green-500"></i>
          </div>
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Hired</p>
          <h3 className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{stats.hired}</h3>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
            <i className="fas fa-times-circle text-6xl text-red-500"></i>
          </div>
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Rejected</p>
          <h3 className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{stats.rejected}</h3>
        </div>
      </div>

      {/* Search & Sort */}
      <div className="bg-white dark:bg-slate-900 p-2 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 mb-8 flex flex-col md:flex-row gap-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <i className="fas fa-search absolute left-3 top-3 text-gray-400 dark:text-slate-500"></i>
            <input
              type="text"
              placeholder="Search by job title..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border-none bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:ring-0"
            />
          </div>
          <div className="relative">
             <i className="far fa-calendar-alt absolute left-3 top-3 text-gray-400 dark:text-slate-500"></i>
             <select
               className="w-full pl-10 pr-4 py-2.5 border-none bg-transparent text-gray-900 dark:text-white cursor-pointer appearance-none focus:ring-0"
               value={sortOrder}
               onChange={e => setSortOrder(e.target.value)}
             >
               <option value="newest" className="bg-white dark:bg-slate-950">Newest First</option>
               <option value="oldest" className="bg-white dark:bg-slate-950">Oldest First</option>
             </select>
          </div>
        </div>
      </div>

      {/* Empty */}
      {filteredInterviews.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 text-gray-500 dark:text-slate-400">
          No interviews found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          {filteredInterviews.map(interview => (
            <div
              key={interview.id}
              className="group relative bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-6 hover:border-primary/50 dark:hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 flex flex-col h-full"
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white group-hover:text-primary transition-colors line-clamp-1" title={interview.jobTitle}>
                    {interview.jobTitle}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 flex items-center gap-2">
                    <i className="far fa-calendar-alt"></i>
                    {interview.submittedAt
                      ? new Date(interview.submittedAt).toLocaleDateString('en-GB')
                      : 'N/A'}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusStyle(interview.status)}`}>
                  {interview.status || 'Pending'}
                </span>
              </div>

              {/* Scores Visualization */}
              <div className="my-6 flex items-center gap-5">
                <div className="relative w-20 h-20 flex-shrink-0">
                    {/* Circular Progress Mockup */}
                    {(() => {
                      const scoreStr = String(interview.score || '0');
                      const val = parseInt(scoreStr.split('/')[0]) || 0;
                      const den = parseInt(scoreStr.split('/')[1]) || 10;
                      const pct = den > 0 ? (val / den) * 100 : 0;
                      return (
                        <>
                          <svg className="w-full h-full transform -rotate-90">
                            <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-gray-100 dark:text-slate-800" />
                            <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray={`${(pct / 100) * 226} 226`} className="text-primary" strokeLinecap="round" />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center flex-col">
                            <span className="text-xl font-bold text-gray-900 dark:text-white">{val}/{den}</span>
                          </div>
                        </>
                      );
                    })()}
                </div>
                <div className="flex-1 grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-gray-100 dark:border-slate-800">
                        <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">Resume</p>
                        <p className="font-bold text-gray-900 dark:text-white">{interview.resumeScore}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-gray-100 dark:border-slate-800">
                        <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">Q&A</p>
                        <p className="font-bold text-gray-900 dark:text-white">{interview.qnaScore}</p>
                    </div>
                </div>
              </div>

              {/* Action */}
              <Link
                to={`/report/${interview.id}`}
                className="mt-auto flex items-center justify-center w-full py-3 rounded-xl bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-medium group-hover:bg-primary group-hover:text-white transition-all"
              >
                View Full Report →
              </Link>
            </div>
          ))}

        </div>
      )}
    </div>
  );
};

export default CandidateInterviews;
