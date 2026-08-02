import React, { useEffect, useState } from 'react';
import { rds } from '../services/rdsApi';
import { Interview } from '../types';
import { useTheme } from '../context/ThemeContext';

interface InterviewReportModalProps {
    interview: Interview | null;
    isOpen: boolean;
    onClose: () => void;
}

const InterviewReportModal: React.FC<InterviewReportModalProps> = ({ interview, isOpen, onClose }) => {
    const { isDark } = useTheme();
    const [companyName, setCompanyName] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!interview) return;
            setLoading(true);
            try {
                if (interview.jobId) {
                    const { jobs } = await rds.listJobs();
                    const job = (jobs || []).find((j: any) => j.id === interview.jobId);
                    if (job?.companyName) {
                        setCompanyName(job.companyName);
                    }
                }
            } catch (e) {
                console.error("Error fetching interview details:", e);
            }
            setLoading(false);
        };

        if (isOpen && interview) {
            fetchDetails();
        }
    }, [isOpen, interview]);

    if (!isOpen || !interview) return null;

    const scoreColor = (score: string | number) => {
        const s = parseInt(score.toString());
        if (s >= 75) return isDark ? 'text-emerald-400 bg-emerald-900/30 border-emerald-800' : 'text-emerald-600 bg-emerald-50 border-emerald-100';
        if (s >= 50) return isDark ? 'text-amber-400 bg-amber-900/30 border-amber-800' : 'text-amber-600 bg-amber-50 border-amber-100';
        return isDark ? 'text-red-400 bg-red-900/30 border-red-800' : 'text-red-600 bg-red-50 border-red-100';
    };

    const scoreBarColor = (score: string | number) => {
        const s = parseInt(score.toString());
        if (s >= 75) return 'bg-emerald-500';
        if (s >= 50) return 'bg-amber-500';
        return 'bg-red-500';
    };

    const formatFeedback = (text: string) => {
        return text
            .replace(/\*\*(.*?)\*\*/g, `<strong class="font-semibold ${isDark ? 'text-white' : 'text-gray-900'}">$1</strong>`)
            .split('\n').map((line, i) => <p key={i} className={`mb-3 ${isDark ? 'text-gray-300' : 'text-gray-600'} leading-relaxed`} dangerouslySetInnerHTML={{ __html: line }} />);
    };

    return (
        <div className={`fixed inset-0 ${isDark ? 'bg-black/80' : 'bg-white/80'} backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto`} onClick={onClose}>
            <div className={`${isDark ? 'bg-[#111] border-white/10' : 'bg-white border-gray-100'} rounded-2xl shadow-2xl border w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200`} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={`p-6 border-b ${isDark ? 'border-white/10 bg-[#111]/95' : 'border-gray-100 bg-white/95'} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sticky top-0 backdrop-blur-sm z-10`}>
                    <div>
                        <h1 className={`text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>{interview.jobTitle}</h1>
                        <div className={`flex flex-wrap items-center gap-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            <span className="font-medium text-blue-500">{interview.candidateName}</span>
                            <span>•</span>
                            <span>{companyName || 'Interview Report'}</span>
                            <span>•</span>
                            <span>{interview.submittedAt ? new Date(interview.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className={`w-10 h-10 rounded-full ${isDark ? 'bg-white/10 text-gray-400 hover:bg-white/20' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'} flex items-center justify-center transition-colors`}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {loading ? (
                    <div className={`flex items-center justify-center py-20 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        <div className={`animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 ${isDark ? 'border-white' : 'border-gray-900'}`}></div>
                    </div>
                ) : (
                    <div className="p-6 md:p-8 space-y-10">
                        {/* Key Metrics */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {[
                                { label: 'Overall Score', value: interview.score, icon: 'fa-chart-pie', type: 'score' },
                                { label: 'Resume Match', value: interview.resumeScore, icon: 'fa-file-contract', type: 'score' },
                                { label: 'Q&A Quality', value: interview.qnaScore, icon: 'fa-comments', type: 'score' },
                                { label: 'Tab Switches', value: interview.meta?.tabSwitchCount || 0, icon: 'fa-window-restore', type: 'count' }
                            ].map((metric, i) => (
                                <div key={i} className={`${isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-100'} p-4 rounded-xl border`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs font-bold uppercase tracking-wider`}>{metric.label}</h3>
                                        <i className={`fas ${metric.icon} ${isDark ? 'text-gray-600' : 'text-gray-300'}`}></i>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <span className={`text-3xl font-bold tracking-tighter ${isDark ? 'text-white' : 'text-gray-900'}`}>{metric.value}</span>
                                        {metric.type === 'score' ? (
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border ${scoreColor(metric.value)}`}>
                                                {parseInt(metric.value.toString()) >= 70 ? 'Excellent' : parseInt(metric.value.toString()) >= 40 ? 'Good' : 'Poor'}
                                            </span>
                                        ) : (
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border ${metric.value === 0 ? (isDark ? 'text-emerald-400 bg-emerald-900/30 border-emerald-800' : 'text-emerald-600 bg-emerald-50 border-emerald-100') : (isDark ? 'text-red-400 bg-red-900/30 border-red-800' : 'text-red-600 bg-red-50 border-red-100')}`}>
                                                {metric.value === 0 ? 'Clean' : 'Flagged'}
                                            </span>
                                        )}
                                    </div>
                                    {metric.type === 'score' && (
                                        <div className={`w-full ${isDark ? 'bg-gray-800' : 'bg-gray-200'} h-1 rounded-full mt-3 overflow-hidden`}>
                                            <div className={`h-full rounded-full transition-all duration-1000 ${scoreBarColor(metric.value)}`} style={{ width: `${metric.value}%` }}></div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* AI Feedback */}
                        <div className={`${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-100'} rounded-xl border overflow-hidden`}>
                            <div className={`${isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50/50 border-gray-100'} px-6 py-4 border-b`}>
                                <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'} flex items-center gap-3`}>
                                    <i className={`fas fa-magic ${isDark ? 'text-purple-400' : 'text-purple-600'}`}></i> AI Evaluation Report
                                </h2>
                            </div>
                            <div className={`p-6 leading-relaxed text-base ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                {formatFeedback(interview.feedback)}
                            </div>
                        </div>

                        {/* Q&A Transcript */}
                        <div className="space-y-4">
                            <div className={`flex items-center justify-between border-b ${isDark ? 'border-white/10' : 'border-gray-200'} pb-3`}>
                                <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Interview Transcript</h2>
                                <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{interview.questions.length} Questions</span>
                            </div>

                            <div className="grid gap-4">
                                {interview.questions.map((q, i) => (
                                    <div key={i} className={`group ${isDark ? 'bg-white/5 border-white/10 hover:border-white/20' : 'bg-gray-50 border-gray-200 hover:border-gray-300'} rounded-xl border p-4 transition-colors`}>
                                        <div className="flex items-start gap-3">
                                            <span className={`flex-shrink-0 w-7 h-7 rounded-lg ${isDark ? 'bg-white text-gray-900' : 'bg-gray-900 text-white'} flex items-center justify-center text-sm font-bold`}>
                                                {i + 1}
                                            </span>
                                            <div className="flex-1">
                                                <h3 className={`text-base font-medium ${isDark ? 'text-white' : 'text-gray-900'} mb-3`}>{q}</h3>
                                                <div className={`relative pl-3 border-l-2 ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
                                                    <p className={`${isDark ? 'text-gray-300 bg-white/5' : 'text-gray-600 bg-white'} text-sm leading-relaxed whitespace-pre-wrap font-mono p-3 rounded-r-lg rounded-bl-lg`}>
                                                        {interview.transcriptTexts[i] || <span className={`${isDark ? 'text-gray-500' : 'text-gray-400'} italic`}>No audio transcription available.</span>}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Integrity Warning */}
                        {interview.meta && interview.meta.tabSwitchCount > 0 && (
                            <div className={`text-center p-4 rounded-xl border ${isDark ? 'bg-red-900/30 border-red-800' : 'bg-red-50 border-red-100'}`}>
                                <i className={`fas fa-shield-alt ${isDark ? 'text-red-400' : 'text-red-400'} text-xl mb-1`}></i>
                                <h4 className={`${isDark ? 'text-red-300' : 'text-red-800'} font-bold text-sm`}>Integrity Note</h4>
                                <p className={`${isDark ? 'text-red-400' : 'text-red-600'} text-xs`}>
                                    The candidate switched tabs <span className="font-bold">{interview.meta.tabSwitchCount}</span> time(s) during the session.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default InterviewReportModal;
