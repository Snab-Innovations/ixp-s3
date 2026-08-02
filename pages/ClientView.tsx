import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { InterviewSubmission } from '../types';
import { useTheme } from '../context/ThemeContext';
import DayNightToggle from '../components/DayNightToggle';
import { poll, rds } from '../services/rdsApi';

const ClientView: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const { interviewId } = useParams<{ interviewId: string }>();
  const [submissions, setSubmissions] = useState<InterviewSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [jobTitle, setJobTitle] = useState<string>('Shortlisted Candidates');

  useEffect(() => {
    if (!interviewId) return;

    rds.getInterview(interviewId)
      .then(({ interview }) => {
        if (interview) setJobTitle(interview.title || 'Shortlisted Candidates');
      })
      .catch((err) => console.error('Error fetching interview details:', err));

    return poll(
      () => rds.listAttempts(interviewId),
      ({ attempts }) => {
        const submissionsData = (attempts || [])
          .filter((row: any) => row.status === 'Shortlist')
          .map((row: any) => ({ ...row, id: row.id } as InterviewSubmission));
        setSubmissions(submissionsData);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching submissions:', err);
        setLoading(false);
      },
      8000
    );
  }, [interviewId]);

  const getScoreValue = (score: unknown): number => {
    let value = 0;
    let denominator = 10;

    if (typeof score === 'number') {
      value = score;
      denominator = score > 10 ? 100 : 10;
    } else if (typeof score === 'string') {
      const [rawValue, rawDenominator] = score.split('/');
      const parsedValue = parseFloat(rawValue);
      const parsedDenominator = parseFloat(rawDenominator);

      value = isNaN(parsedValue) ? 0 : parsedValue;
      denominator = !isNaN(parsedDenominator) && parsedDenominator > 0
        ? parsedDenominator
        : value > 10
          ? 100
          : 10;
    }

    return denominator === 10 ? value : (value / denominator) * 10;
  };
  const getScoreDenom = (_score?: any): string => '10';

  const filteredAndSortedSubmissions = useMemo(() => {
    return submissions
      .filter(s => 
        s.candidateInfo?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.candidateInfo?.email?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => {
        const scoreA = getScoreValue(a.score);
        const scoreB = getScoreValue(b.score);
        return sortOrder === 'desc' ? scoreB - scoreA : scoreA - scoreB;
      });
  }, [submissions, searchTerm, sortOrder]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh] bg-gray-50 dark:bg-gray-900">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] text-gray-800 dark:text-gray-200">
        <div className="bg-white dark:bg-[#111] border-b border-gray-200 dark:border-white/10 sticky top-0 z-40 shadow-sm">
            <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Shortlisted Candidates</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Role: <span className="font-semibold text-primary">{jobTitle}</span></p>
                </div>
                <div className="flex flex-col md:flex-row items-center gap-4">
                    <div className="flex items-center gap-2 mr-2">
                        <img src="/logo-partnership-light.png" alt="DSource Partnership" className="h-8 md:h-10 object-contain dark:brightness-200" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    </div>
                    <div className="px-4 py-1.5 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 font-bold rounded-full text-sm flex items-center gap-2">
                        <i className="fas fa-check-circle"></i> {submissions.length} Shortlisted
                    </div>
                    <DayNightToggle />
                </div>
            </div>
        </div>

        <div className="max-w-6xl mx-auto space-y-8 p-4 md:p-8">
          <div className="flex flex-col md:flex-row gap-4">
            <input
              type="text"
              placeholder="Search by candidate name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full md:flex-1 p-3 border border-gray-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-500 shadow-sm"
            />
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
              className="w-full md:w-auto p-3 border border-gray-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-white/5 text-gray-900 dark:text-white cursor-pointer shadow-sm"
            >
              <option value="desc">Score: High to Low</option>
              <option value="asc">Score: Low to High</option>
            </select>
          </div>

          {filteredAndSortedSubmissions.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-[#111] rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm">
                <i className="fas fa-users text-5xl text-gray-300 dark:text-gray-600 mb-4"></i>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Candidates Found</h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                    {searchTerm ? 'No shortlisted candidates match your search.' : 'The recruiter has not shortlisted any candidates for this role yet.'}
                </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredAndSortedSubmissions.map(submission => (
                    <div 
                        key={submission.id} 
                        className="bg-white dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col overflow-hidden group"
                    >
                        <div className="p-6 flex-1 flex flex-col gap-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold text-xl text-gray-900 dark:text-white capitalize group-hover:text-primary transition-colors">{submission.candidateInfo?.name || 'Unknown Candidate'}</h3>
                                    {submission.candidateInfo?.email && (
                                        <div className="flex items-center gap-2 mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                                            <i className="fas fa-envelope text-gray-400"></i> {submission.candidateInfo.email}
                                        </div>
                                    )}
                                    {submission.candidateInfo?.phone && (
                                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
                                            <i className="fas fa-phone text-gray-400"></i> {submission.candidateInfo.phone}
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col items-end bg-gray-50 dark:bg-black/20 p-3 rounded-xl border border-gray-100 dark:border-white/5">
                                    <div className="text-2xl font-black text-primary">{getScoreValue(submission.score).toFixed(1)}<span className="text-sm text-gray-400 font-medium">/{getScoreDenom(submission.score)}</span></div>
                                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500 mt-0.5">AI Score</span>
                                </div>
                            </div>
                            
                            {submission.candidateInfo?.resumeText || submission.candidateResumeURL ? (
                                <div className="mt-2 flex items-center gap-3">
                                    <span className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs font-bold rounded-lg border border-blue-200 dark:border-blue-800/30 flex items-center gap-1.5">
                                        <i className="fas fa-file-alt"></i> Resume Attached
                                    </span>
                                    {submission.videoURLs && submission.videoURLs.some(v => v !== null) && (
                                        <span className="px-3 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 text-xs font-bold rounded-lg border border-purple-200 dark:border-purple-800/30 flex items-center gap-1.5">
                                            <i className="fas fa-video"></i> Video Answers
                                        </span>
                                    )}
                                </div>
                            ) : null}
                        </div>

                        <div className="p-4 border-t border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-black/20 flex gap-3">
                            <Link 
                                to={`/report/${interviewId}/${submission.id}`} 
                                className="flex-1 py-2.5 bg-primary text-primary-foreground text-center font-bold rounded-xl text-sm hover:bg-primary-dark transition-colors shadow-sm flex items-center justify-center gap-2"
                            >
                                <i className="fas fa-chart-pie"></i> View Detailed Report
                            </Link>
                            {submission.candidateResumeURL && !submission.candidateResumeURL.startsWith('data:text') && (
                                <a 
                                    href={submission.candidateResumeURL} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="px-5 py-2.5 bg-white dark:bg-white/10 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-white/10 text-center font-bold rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-white/20 transition-colors shadow-sm"
                                    title="Download Resume"
                                >
                                    <i className="fas fa-download"></i>
                                </a>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        )}
      </div>
    </div>
  );
};

export default ClientView;
