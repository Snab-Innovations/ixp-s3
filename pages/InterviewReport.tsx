import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { rds } from '../services/rdsApi';
import { jsPDF } from 'jspdf';

const InterviewReport: React.FC = () => {
  const { interviewId } = useParams();
  const [interview, setInterview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInterview = async () => {
      if (!interviewId) return;
      try {
        const { interview } = await rds.getInterview(interviewId);
        if (interview) {
          setInterview(interview);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchInterview();
  }, [interviewId]);

  const getScore = (s: any) => {
    if (typeof s === 'string' && s.includes('/')) return s.split('/')[0];
    return String(s || '0');
  };
  const getDenom = (s: any) => {
    if (typeof s === 'string' && s.includes('/')) return s.split('/')[1];
    return '10';
  };
  const getPct = (s: any) => {
    const val = Number(getScore(s));
    const den = Number(getDenom(s));
    return den > 0 ? (val / den) * 100 : 0;
  };

  const downloadPDF = () => {
    if (!interview) return;

    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const contentW = pageW - margin * 2;
    let y = 0;

    const checkPage = (needed: number) => {
      if (y + needed > pageH - margin) { pdf.addPage(); y = margin; }
    };

    // ── HEADER BANNER ────────────────────────────────────────────────────────
    pdf.setFillColor(37, 99, 235);
    pdf.rect(0, 0, pageW, 32, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(20);
    pdf.setTextColor(255, 255, 255);
    pdf.text('InterviewXpert', margin, 13);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text('AI-Powered Interview Report', margin, 21);
    const dateStr = interview.submittedAt
      ? new Date(interview.submittedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    pdf.text(dateStr, pageW - margin - pdf.getTextWidth(dateStr), 21);
    y = 40;

    // ── JOB INFO CARD ────────────────────────────────────────────────────────
    pdf.setFillColor(239, 246, 255);
    pdf.roundedRect(margin, y, contentW, 24, 3, 3, 'F');
    pdf.setDrawColor(191, 219, 254);
    pdf.roundedRect(margin, y, contentW, 24, 3, 3, 'S');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(30, 58, 138);
    pdf.text(interview.jobTitle || 'Interview Report', margin + 5, y + 10);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(71, 85, 105);
    pdf.text(`Date: ${dateStr}`, margin + 5, y + 18);
    y += 30;

    // ── SCORE CARDS ──────────────────────────────────────────────────────────
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(15, 23, 42);
    pdf.text('Performance Scores', margin, y);
    y += 6;

    const cardW = (contentW - 8) / 3;
    const scores = [
      { label: 'Overall Score', value: getScore(interview.score),       denom: getDenom(interview.score),       pct: getPct(interview.score),       color: [37, 99, 235]   as [number,number,number] },
      { label: 'Resume Match',  value: getScore(interview.resumeScore), denom: getDenom(interview.resumeScore), pct: getPct(interview.resumeScore), color: [168, 85, 247]  as [number,number,number] },
      { label: 'Q&A Score',     value: getScore(interview.qnaScore),    denom: getDenom(interview.qnaScore),    pct: getPct(interview.qnaScore),    color: [249, 115, 22]  as [number,number,number] },
    ];
    scores.forEach((s, i) => {
      const cx = margin + i * (cardW + 4);
      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(cx, y, cardW, 24, 2, 2, 'F');
      pdf.setDrawColor(226, 232, 240);
      pdf.roundedRect(cx, y, cardW, 24, 2, 2, 'S');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text(s.label, cx + 4, y + 8);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.setTextColor(...s.color);
      pdf.text(`${s.value}`, cx + 4, y + 19);
      pdf.setFontSize(10);
      pdf.setTextColor(148, 163, 184);
      pdf.text(`/${s.denom}`, cx + 4 + pdf.getTextWidth(`${s.value}`) + 1, y + 19);
    });
    y += 30;

    // ── STRENGTHS & WEAKNESSES ───────────────────────────────────────────────
    const strengths: string[] = interview.strengths || ['Strong communication skills', 'Good technical foundation', 'Relevant project experience'];
    const weaknesses: string[] = interview.weaknesses || ['Elaborate more on system design', 'Use more specific metrics', 'Improve pacing of speech'];

    const colW2 = (contentW - 6) / 2;

    // Strengths column
    const sLines = strengths.flatMap(s => pdf.splitTextToSize(`• ${s}`, colW2 - 8));
    const wLines = weaknesses.flatMap(w => pdf.splitTextToSize(`• ${w}`, colW2 - 8));
    const maxLines = Math.max(sLines.length, wLines.length);
    const boxH = 10 + maxLines * 5 + 6;
    checkPage(boxH + 14);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(15, 23, 42);
    pdf.text('Strengths & Areas for Improvement', margin, y);
    y += 6;

    // Strengths box
    pdf.setFillColor(240, 253, 244);
    pdf.roundedRect(margin, y, colW2, boxH, 2, 2, 'F');
    pdf.setDrawColor(187, 247, 208);
    pdf.roundedRect(margin, y, colW2, boxH, 2, 2, 'S');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(20, 83, 45);
    pdf.text('Key Strengths', margin + 4, y + 7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(51, 65, 85);
    let sy = y + 13;
    sLines.forEach((line: string) => { pdf.text(line, margin + 4, sy); sy += 5; });

    // Weaknesses box
    const wx = margin + colW2 + 6;
    pdf.setFillColor(255, 247, 237);
    pdf.roundedRect(wx, y, colW2, boxH, 2, 2, 'F');
    pdf.setDrawColor(254, 215, 170);
    pdf.roundedRect(wx, y, colW2, boxH, 2, 2, 'S');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(124, 45, 18);
    pdf.text('Areas for Improvement', wx + 4, y + 7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(51, 65, 85);
    let wy = y + 13;
    wLines.forEach((line: string) => { pdf.text(line, wx + 4, wy); wy += 5; });
    y += boxH + 8;

    // ── AI FEEDBACK ──────────────────────────────────────────────────────────
    const feedbackText = interview.feedback || 'No AI feedback available for this interview.';
    const fbLines = pdf.splitTextToSize(feedbackText, contentW - 12);
    const fbBoxH = 10 + fbLines.length * 5 + 6;
    checkPage(fbBoxH + 14);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(15, 23, 42);
    pdf.text('AI Feedback Summary', margin, y);
    y += 6;

    pdf.setFillColor(239, 246, 255);
    pdf.roundedRect(margin, y, contentW, fbBoxH, 2, 2, 'F');
    pdf.setDrawColor(191, 219, 254);
    pdf.roundedRect(margin, y, contentW, fbBoxH, 2, 2, 'S');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(30, 58, 138);
    pdf.text('AI Evaluation', margin + 5, y + 7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(51, 65, 85);
    let fby = y + 13;
    fbLines.forEach((line: string) => { pdf.text(line, margin + 5, fby); fby += 5; });
    y += fbBoxH + 8;

    // ── FOOTER ───────────────────────────────────────────────────────────────
    const totalPages = (pdf as any).internal.getNumberOfPages();
    for (let pg = 1; pg <= totalPages; pg++) {
      pdf.setPage(pg);
      pdf.setFillColor(248, 250, 252);
      pdf.rect(0, pageH - 10, pageW, 10, 'F');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(148, 163, 184);
      pdf.text('Generated by InterviewXpert | AI-Powered Hiring Platform', margin, pageH - 3.5);
      pdf.text(`Page ${pg} of ${totalPages}`, pageW - margin - 18, pageH - 3.5);
    }

    pdf.save(`InterviewReport_${(interview.jobTitle || 'report').replace(/\s+/g, '-').toLowerCase()}.pdf`);
  };

  if (loading) return <div className="text-center py-20 dark:text-slate-400">Loading report...</div>;
  if (!interview) return <div className="text-center py-20 dark:text-slate-400">Report not found.</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-white transition-colors duration-300 px-4 sm:px-6 py-8">
      <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <Link to="/" className="inline-flex items-center text-sm text-gray-500 dark:text-slate-400 hover:text-primary mb-2 transition-colors">
            <i className="fas fa-arrow-left mr-2"></i> Back to Portal
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{interview.jobTitle}</h1>
          <p className="text-gray-500 dark:text-slate-400 mt-1">
            Interviewed on {interview.submittedAt ? new Date(interview.submittedAt).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}
          </p>
        </div>
        <button 
          onClick={downloadPDF}
          className="inline-flex items-center justify-center px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-xl font-semibold shadow-lg shadow-primary/30 transition-all transform hover:-translate-y-0.5"
        >
          <i className="fas fa-download mr-2"></i> Download PDF
        </button>
      </div>

      {/* Score Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Overall Score */}
        <div className="bg-white dark:bg-black/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <i className="fas fa-trophy text-8xl text-blue-500"></i>
          </div>
          <h3 className="text-gray-500 dark:text-slate-400 font-medium uppercase tracking-wider text-sm mb-4">Overall Score</h3>
          <div className="relative w-32 h-32 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-gray-100 dark:text-slate-800" />
              <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="12" fill="transparent" strokeDasharray={`${(parseInt(getScore(interview.score)) / parseInt(getDenom(interview.score))) * 351} 351`} className="text-blue-500" strokeLinecap="round" />
            </svg>
            <span className="absolute text-3xl font-bold text-gray-900 dark:text-white">{getScore(interview.score)}/{getDenom(interview.score)}</span>
          </div>
          <div className="mt-4 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-bold">
            {getPct(interview.score) >= 70 ? 'Excellent' : getPct(interview.score) >= 40 ? 'Good' : 'Needs Improvement'}
          </div>
        </div>

        {/* Resume Score */}
        <div className="bg-white dark:bg-black/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 flex flex-col justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <i className="fas fa-file-alt text-8xl text-purple-500"></i>
          </div>
          <h3 className="text-gray-500 dark:text-slate-400 font-medium uppercase tracking-wider text-sm mb-2">Resume Match</h3>
          <div className="text-4xl font-bold text-gray-900 dark:text-white mb-4">{getScore(interview.resumeScore)}/{getDenom(interview.resumeScore)}</div>
          <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-3 mb-2">
            <div className="bg-purple-500 h-3 rounded-full transition-all duration-1000" style={{ width: `${getPct(interview.resumeScore)}%` }}></div>
          </div>
          <p className="text-sm text-gray-500 dark:text-slate-400">ATS Compatibility Score</p>
        </div>

        {/* Q&A Score */}
        <div className="bg-white dark:bg-black/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 flex flex-col justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <i className="fas fa-comments text-8xl text-orange-500"></i>
          </div>
          <h3 className="text-gray-500 dark:text-slate-400 font-medium uppercase tracking-wider text-sm mb-2">Q&A Performance</h3>
          <div className="text-4xl font-bold text-gray-900 dark:text-white mb-4">{getScore(interview.qnaScore)}/{getDenom(interview.qnaScore)}</div>
          <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-3 mb-2">
            <div className="bg-orange-500 h-3 rounded-full transition-all duration-1000" style={{ width: `${getPct(interview.qnaScore)}%` }}></div>
          </div>
          <p className="text-sm text-gray-500 dark:text-slate-400">Technical & Behavioral</p>
        </div>
      </div>

      {/* Detailed Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Strengths */}
        <div className="bg-white dark:bg-black/80 backdrop-blur-sm p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400">
              <i className="fas fa-check"></i>
            </div>
            Key Strengths
          </h3>
          <ul className="space-y-4">
            {(interview.strengths || ['Strong communication skills', 'Good technical foundation', 'Relevant project experience']).map((item: string, i: number) => (
              <li key={i} className="flex items-start gap-3 text-gray-700 dark:text-slate-300">
                <i className="fas fa-check-circle text-green-500 mt-1"></i>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Areas for Improvement */}
        <div className="bg-white dark:bg-black/80 backdrop-blur-sm p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
              <i className="fas fa-chart-line"></i>
            </div>
            Areas for Improvement
          </h3>
          <ul className="space-y-4">
            {(interview.weaknesses || ['Elaborate more on system design', 'Use more specific metrics in answers', 'Improve pacing of speech']).map((item: string, i: number) => (
              <li key={i} className="flex items-start gap-3 text-gray-700 dark:text-slate-300">
                <i className="fas fa-arrow-up text-orange-500 mt-1"></i>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* AI Feedback Summary */}
        <div className="lg:col-span-2 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-black/80 dark:to-slate-900/80 backdrop-blur-sm p-8 rounded-2xl border border-blue-100 dark:border-slate-700">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <i className="fas fa-robot text-blue-600 dark:text-blue-400"></i> AI Feedback Summary
          </h3>
          <p className="text-gray-700 dark:text-slate-300 leading-relaxed">
            {interview.feedback || "The candidate demonstrated a solid understanding of the core concepts. Their resume is well-structured but could benefit from more quantifiable achievements. During the Q&A, they answered technical questions confidently but hesitated slightly on behavioral scenarios. Overall, a strong candidate with potential for growth in this role."}
          </p>
        </div>
      </div>
      </div>
    </div>
  );
};

export default InterviewReport;
