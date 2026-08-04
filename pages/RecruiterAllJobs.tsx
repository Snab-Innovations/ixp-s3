import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { rds, poll } from '../services/rdsApi';
import { Interview } from '../types';
import { 
  Briefcase, 
  Search, 
  Plus, 
  ArrowLeft, 
  Eye, 
  Edit3, 
  UserPlus, 
  MapPin, 
  Building2, 
  Calendar, 
  DollarSign, 
  Award, 
  Users, 
  X, 
  CheckCircle2, 
  Send,
  Trash2,
  Copy
} from 'lucide-react';
import EditJobModal from './EditJob';
import InviteCandidateModal from '../components/InviteCandidateModal';
import { useMessageBox } from '../components/MessageBox';
import { sendInterviewInvitations } from '../services/brevoService';
import { sendBulkWhatsAppInvites } from '../services/waSenderService';

export default function RecruiterAllJobs() {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const messageBox = useMessageBox();

  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Expired'>('All');
  const [selectedDept, setSelectedDept] = useState<string>('All Departments');
  const [selectedJobType, setSelectedJobType] = useState<string>('All Job Types');

  // Modal States
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [inviteJob, setInviteJob] = useState<Interview | null>(null);
  const [detailJob, setDetailJob] = useState<Interview | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [isDeletingJob, setIsDeletingJob] = useState<boolean>(false);

  // Invite Modal Form State
  const [inviteEmails, setInviteEmails] = useState<string>('');
  const [invitePhones, setInvitePhones] = useState<string>('');
  const [isSendingInvites, setIsSendingInvites] = useState<boolean>(false);

  useEffect(() => {
    if (!user) return;
    const recruiterUID = user.uid;
    const teamId = userProfile?.teamId || userProfile?.parentRecruiterId || recruiterUID;

    const stop = poll(
      () => rds.listInterviews({ teamId }),
      (data) => {
        setInterviews(data.interviews || []);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching jobs:', err);
        setLoading(false);
      },
      8000
    );

    return () => stop();
  }, [user, userProfile]);

  // Extract unique departments for dropdown
  const departments = useMemo(() => {
    const set = new Set<string>();
    interviews.forEach((job) => {
      if (job.department && job.department.trim()) {
        set.add(job.department.trim());
      }
    });
    return Array.from(set);
  }, [interviews]);

  // Extract unique employment types for dropdown
  const jobTypes = useMemo(() => {
    const set = new Set<string>();
    interviews.forEach((job) => {
      if (job.employmentType && job.employmentType.trim()) {
        set.add(job.employmentType.trim());
      }
    });
    return Array.from(set);
  }, [interviews]);

  // Helper to check if job is active
  const isJobActive = (job: Interview): boolean => {
    const deadline = (job as any).deadline;
    if (!deadline) return true;
    try {
      const deadlineDate = new Date(deadline);
      return deadlineDate.getTime() >= Date.now();
    } catch {
      return true;
    }
  };

  // Delete Job Handler
  const handleDeleteJob = async (jobId: string) => {
    if (!window.confirm('Are you sure you want to delete this job posting? This action cannot be undone.')) {
      return;
    }
    setIsDeletingJob(true);
    try {
      await rds.deleteInterview(jobId);
      messageBox.showSuccess('Job posting deleted successfully.');
      setDetailJob(null);
      setInterviews((prev) => prev.filter((j) => j.id !== jobId));
    } catch (err: any) {
      console.error('Error deleting job:', err);
      messageBox.showError('Failed to delete job: ' + (err.message || 'Unknown error'));
    } finally {
      setIsDeletingJob(false);
    }
  };

  // Filtered jobs logic
  const filteredJobs = useMemo(() => {
    return interviews.filter((job) => {
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        (job.title || '').toLowerCase().includes(query) ||
        (job.jobNumber || (job as any).jobNo || '').toLowerCase().includes(query) ||
        (job.department || '').toLowerCase().includes(query) ||
        (job.skills || '').toLowerCase().includes(query) ||
        (job.location || '').toLowerCase().includes(query) ||
        (job.description || '').toLowerCase().includes(query);

      const active = isJobActive(job);
      const matchesStatus =
        statusFilter === 'All' ||
        (statusFilter === 'Active' && active) ||
        (statusFilter === 'Expired' && !active);

      const matchesDept =
        selectedDept === 'All Departments' || job.department === selectedDept;

      const matchesType =
        selectedJobType === 'All Job Types' || job.employmentType === selectedJobType;

      return matchesSearch && matchesStatus && matchesDept && matchesType;
    });
  }, [interviews, searchQuery, statusFilter, selectedDept, selectedJobType]);

  // Stats calculation
  const totalJobsCount = interviews.length;
  const activeJobsCount = interviews.filter(isJobActive).length;
  const totalInvitedCount = interviews.reduce((sum, job) => {
    const emailCount = job.candidateEmails?.length || 0;
    const candidateDataCount = job.candidateData?.length || 0;
    return sum + Math.max(emailCount, candidateDataCount);
  }, 0);
  const totalDeptsCount = departments.length || (interviews.length > 0 ? 1 : 0);

  // Send Invitations Handler
  const handleSendInvitations = async () => {
    if (!inviteJob) return;

    const parsedEmails = inviteEmails
      .split(/[\n,;]+/)
      .map((e) => e.trim())
      .filter((e) => e && e.includes('@'));

    const parsedPhones = invitePhones
      .split(/[\n,;]+/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 7);

    if (parsedEmails.length === 0 && parsedPhones.length === 0) {
      messageBox.showError('Please enter at least one valid email or phone number.');
      return;
    }

    setIsSendingInvites(true);

    try {
      const interviewLink = inviteJob.interviewLink || `${window.location.origin}/#/interview/${inviteJob.id}`;
      const accessCode = inviteJob.accessCode || 'IXP' + inviteJob.id.slice(0, 6).toUpperCase();

      let emailSentCount = 0;
      let waSentCount = 0;

      if (parsedEmails.length > 0) {
        const res = await sendInterviewInvitations(
          parsedEmails,
          inviteJob.title,
          interviewLink,
          accessCode,
          false
        );
        if (res.success) emailSentCount = res.totalEmails;
      }

      if (parsedPhones.length > 0) {
        const candidatesWithPhone = parsedPhones.map((phone) => ({ phone }));
        const waRes = await sendBulkWhatsAppInvites(
          candidatesWithPhone,
          inviteJob.title,
          interviewLink,
          accessCode,
          false
        );
        if (waRes.success) waSentCount = waRes.totalSent;
      }

      // Update Postgres with newly added candidate emails
      const updatedEmails = Array.from(new Set([...(inviteJob.candidateEmails || []), ...parsedEmails]));
      await rds.updateInterview(inviteJob.id, { candidateEmails: updatedEmails });

      messageBox.showSuccess(
        `Invitations dispatched successfully! (${emailSentCount} via Email, ${waSentCount} via WhatsApp)`
      );
      setInviteJob(null);
      setInviteEmails('');
      setInvitePhones('');
    } catch (err: any) {
      console.error('Error sending invitations:', err);
      messageBox.showError('Failed to send invitations: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSendingInvites(false);
    }
  };

  return (
    <div className="-mx-4 -my-8 min-h-[calc(100vh-3.5rem)] bg-slate-50/50 dark:bg-black text-slate-900 dark:text-white sm:-mx-6 lg:-mx-8 transition-colors">
      {/* Top Header Section */}
      <section className="border-b border-slate-200 dark:border-white/[0.11] bg-white dark:bg-black">
        <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-7 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link
              to="/recruiter/jobs"
              className="geist-caption inline-flex h-8 items-center gap-2 rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-slate-100 dark:bg-white/[0.03] px-3 font-medium text-slate-700 dark:text-[#d4d4d4] transition-colors hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white"
            >
              <ArrowLeft size={14} />
              <span>Dashboard</span>
            </Link>
            <h1 className="geist-page-title mt-2 text-slate-900 dark:text-white">All Job Postings</h1>
            <p className="geist-small mt-1 text-slate-500 dark:text-[#8f8f8f]">
              Manage and view all job openings, invite candidates, view detailed descriptions, and edit roles.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/recruiter/interview/create')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black font-semibold text-sm hover:bg-slate-800 dark:hover:bg-gray-200 transition-all shadow-md dark:shadow-white/10"
            >
              <Plus size={16} />
              <span>Create Job</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="px-4 py-5 sm:px-6 lg:px-7 space-y-6">

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border border-slate-200 dark:border-white/[0.12] rounded-2xl bg-white dark:bg-black p-5 shadow-sm dark:shadow-2xl">
          <div className="p-3 border-r border-slate-200 dark:border-white/[0.08] last:border-r-0">
            <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-gray-400">TOTAL JOBS</p>
            <p className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-1.5">{loading ? '...' : totalJobsCount}</p>
          </div>
          <div className="p-3 border-r border-slate-200 dark:border-white/[0.08] last:border-r-0">
            <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-gray-400">ACTIVE JOBS</p>
            <p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-1.5">{loading ? '...' : activeJobsCount}</p>
          </div>
          <div className="p-3 border-r border-slate-200 dark:border-white/[0.08] last:border-r-0">
            <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-gray-400">INVITED CANDIDATES</p>
            <p className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-1.5">{loading ? '...' : totalInvitedCount}</p>
          </div>
          <div className="p-3">
            <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-gray-400">DEPARTMENTS</p>
            <p className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-1.5">{loading ? '...' : totalDeptsCount}</p>
          </div>
        </div>

        {/* Controls & Filter Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-black border border-slate-200 dark:border-white/[0.12] p-3.5 rounded-2xl shadow-sm dark:shadow-xl">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-400 w-4 h-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search jobs by title, job #, skills, location..."
              className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/[0.14] rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-slate-400 dark:focus:border-white/50 transition-colors"
            />
          </div>

          {/* Filter Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Status Pills */}
            <div className="flex items-center bg-slate-100 dark:bg-black p-1 rounded-xl border border-slate-200 dark:border-white/[0.12]">
              {(['All', 'Active', 'Expired'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    statusFilter === status
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-black font-bold shadow-md'
                      : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            {/* Department Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase text-slate-500 dark:text-gray-400 hidden sm:inline">DEPT</span>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/[0.14] text-xs text-slate-900 dark:text-white rounded-xl px-3 py-2.5 focus:outline-none focus:border-slate-400 dark:focus:border-white/50"
              >
                <option value="All Departments" className="bg-white dark:bg-black text-slate-900 dark:text-white">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept} className="bg-white dark:bg-black text-slate-900 dark:text-white">
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            {/* Job Type Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase text-slate-500 dark:text-gray-400 hidden sm:inline">TYPE</span>
              <select
                value={selectedJobType}
                onChange={(e) => setSelectedJobType(e.target.value)}
                className="bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/[0.14] text-xs text-slate-900 dark:text-white rounded-xl px-3 py-2.5 focus:outline-none focus:border-slate-400 dark:focus:border-white/50"
              >
                <option value="All Job Types" className="bg-white dark:bg-black text-slate-900 dark:text-white">All Job Types</option>
                {jobTypes.map((type) => (
                  <option key={type} value={type} className="bg-white dark:bg-black text-slate-900 dark:text-white">
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Job Cards Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-64 rounded-2xl bg-slate-100 dark:bg-black border border-slate-200 dark:border-white/[0.08] animate-pulse p-6 space-y-4" />
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-black rounded-2xl border border-slate-200 dark:border-white/[0.12] space-y-3 shadow-sm">
            <Briefcase className="w-12 h-12 text-slate-400 dark:text-gray-600 mx-auto" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">No Job Postings Found</h3>
            <p className="text-xs text-slate-500 dark:text-gray-400 max-w-sm mx-auto">
              No job postings match your current filter criteria. Try clearing search or status filters.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredJobs.map((job) => {
              const active = isJobActive(job);
              const skillsList = (job.skills || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
              const invitedCount = Math.max(
                job.candidateEmails?.length || 0,
                job.candidateData?.length || 0
              );

              return (
                <div
                  key={job.id}
                  onClick={() => setDetailJob(job)}
                  className="group relative flex flex-col justify-between bg-white dark:bg-black hover:bg-slate-50/80 dark:hover:bg-[#050508] border border-slate-200 dark:border-white/[0.12] hover:border-slate-300 dark:hover:border-white/35 rounded-2xl p-5 cursor-pointer transition-all duration-300 shadow-sm hover:shadow-md dark:shadow-2xl dark:hover:shadow-black"
                >
                  <div className="space-y-3">
                    {/* Top Row: Department, Job Number & Active Status Badge */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-black text-slate-700 dark:text-gray-300 border border-slate-200 dark:border-white/[0.12]">
                          {job.department || 'General'}
                        </span>
                        {(job.jobNumber || (job as any).jobNo) && (
                          <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold bg-blue-50 dark:bg-black text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/35">
                            #{job.jobNumber || (job as any).jobNo}
                          </span>
                        )}
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          active
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
                            : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            active ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-amber-500 dark:bg-amber-400'
                          }`}
                        />
                        {active ? 'Active' : 'Expired'}
                      </span>
                    </div>

                    {/* Job Title */}
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-primary transition-colors leading-snug">
                      {job.title}
                    </h3>

                    {/* Metadata Subtitle line */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-gray-400">
                      {job.company && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 size={13} className="text-slate-400 dark:text-gray-500" />
                          {job.company}
                        </span>
                      )}
                      {job.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={13} className="text-slate-400 dark:text-gray-500" />
                          {job.location}
                        </span>
                      )}
                      {job.employmentType && (
                        <span className="inline-flex items-center gap-1 text-slate-500 dark:text-gray-400">
                          • {job.employmentType}
                        </span>
                      )}
                    </div>

                    {/* Description Excerpt */}
                    {job.description && (
                      <p className="text-xs text-slate-600 dark:text-gray-400 line-clamp-2 leading-relaxed">
                        {job.description}
                      </p>
                    )}

                    {/* Key Attributes Metadata Grid */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-black p-3 rounded-xl text-[11px] border border-slate-200 dark:border-white/[0.1]">
                      <div>
                        <span className="text-slate-500 dark:text-gray-500">Exp: </span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {job.minExperience || job.experience || 0} yrs
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-gray-500">Salary: </span>
                        <span className="font-semibold text-slate-900 dark:text-white truncate inline-block max-w-[100px] align-bottom">
                          {job.salaryRange || 'As per JD'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-gray-500">Invited: </span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {invitedCount} candidates
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-gray-500">Deadline: </span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {(job as any).deadline ? new Date((job as any).deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Skill Tags */}
                    {skillsList.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {skillsList.slice(0, 3).map((skill, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 text-[10px] font-medium bg-slate-100 dark:bg-black border border-slate-200 dark:border-white/[0.1] text-slate-700 dark:text-gray-300 rounded-lg"
                          >
                            {skill}
                          </span>
                        ))}
                        {skillsList.length > 3 && (
                          <span className="text-[10px] font-medium text-slate-500 dark:text-gray-500">
                            +{skillsList.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions Row */}
                  <div
                    className="flex items-center gap-2 pt-5 border-t border-slate-100 dark:border-white/[0.08] mt-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => setInviteJob(job)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black font-semibold text-xs hover:bg-slate-800 dark:hover:bg-gray-200 transition-all shadow-sm"
                    >
                      <UserPlus size={14} />
                      Invite Candidate
                    </button>
                    <button
                      onClick={() => setDetailJob(job)}
                      className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/[0.12] bg-slate-100 dark:bg-white/[0.04] text-xs font-medium text-slate-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/[0.08] hover:text-slate-900 dark:hover:text-white transition-all"
                      title="View Details"
                    >
                      <Eye size={14} />
                      Details
                    </button>
                    <button
                      onClick={() => setEditingJobId(job.id)}
                      className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/[0.12] bg-slate-100 dark:bg-white/[0.04] text-xs font-medium text-slate-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/[0.08] hover:text-slate-900 dark:hover:text-white transition-all"
                      title="Edit Job"
                    >
                      <Edit3 size={14} />
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Job Details Modal */}
      {detailJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#0a0a0c] border border-slate-200 dark:border-white/[0.12] rounded-2xl p-6 shadow-2xl space-y-5 text-left custom-scrollbar text-slate-900 dark:text-white">

            {/* Top Header */}
            <div className="flex items-start justify-between border-b border-slate-200 dark:border-white/[0.1] pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400">
                  <span className="px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-gray-300 font-medium border border-slate-200 dark:border-white/[0.08]">
                    {detailJob.department || 'General'}
                  </span>
                  {detailJob.employmentType && <span>• {detailJob.employmentType}</span>}
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1.5">{detailJob.title}</h2>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {detailJob.company || 'Company'} • {detailJob.location || 'Location'}
                </p>
              </div>
              <button
                onClick={() => setDetailJob(null)}
                className="p-1.5 rounded-xl text-slate-400 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Metrics Header Box */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-[#121216] border border-slate-200 dark:border-white/[0.08] p-4 rounded-xl text-xs">
              <div>
                <p className="text-[10px] font-mono uppercase text-slate-500 dark:text-gray-500">EXPERIENCE</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                  {detailJob.minExperience || detailJob.experience || 0} Years
                </p>
              </div>
              <div>
                <p className="text-[10px] font-mono uppercase text-slate-500 dark:text-gray-500">SALARY</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                  {detailJob.salaryRange || 'As per JD'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-mono uppercase text-slate-500 dark:text-gray-500">ACCESS CODE</p>
                <p className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  {detailJob.accessCode || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-mono uppercase text-slate-500 dark:text-gray-500">DEADLINE</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                  {(detailJob as any).deadline ? new Date((detailJob as any).deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                </p>
              </div>
            </div>

            {/* Section: JOB DESCRIPTION */}
            <div className="space-y-2">
              <h4 className="text-xs font-mono uppercase text-slate-500 dark:text-gray-400 tracking-wider">JOB DESCRIPTION</h4>
              <div className="bg-slate-50 dark:bg-[#121216] border border-slate-200 dark:border-white/[0.08] p-4 rounded-xl text-xs text-slate-800 dark:text-gray-300 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
                {detailJob.description || 'No description provided.'}
              </div>
            </div>

            {/* Section: QUALIFICATIONS */}
            {((detailJob as any).qualification || (detailJob as any).education || detailJob.education) && (
              <div className="space-y-2">
                <h4 className="text-xs font-mono uppercase text-slate-500 dark:text-gray-400 tracking-wider">QUALIFICATIONS</h4>
                <div className="bg-slate-50 dark:bg-[#121216] border border-slate-200 dark:border-white/[0.08] p-3.5 rounded-xl text-xs text-slate-800 dark:text-gray-300">
                  {(detailJob as any).qualification || (detailJob as any).education || detailJob.education}
                </div>
              </div>
            )}

            {/* Section: REQUIRED SKILLS */}
            {detailJob.skills && (
              <div className="space-y-2">
                <h4 className="text-xs font-mono uppercase text-slate-500 dark:text-gray-400 tracking-wider">REQUIRED SKILLS</h4>
                <div className="flex flex-wrap gap-2">
                  {detailJob.skills.split(',').map((skill, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 text-xs bg-slate-100 dark:bg-[#121216] border border-slate-200 dark:border-white/[0.1] text-slate-800 dark:text-gray-200 rounded-lg font-medium"
                    >
                      {skill.trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Section: Interview Link Bar */}
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#121216] border border-slate-200 dark:border-white/[0.1] p-2 rounded-xl">
              <input
                type="text"
                readOnly
                value={detailJob.interviewLink || `${window.location.origin}/#/interview/${detailJob.id}`}
                className="flex-1 bg-transparent px-2 text-xs font-mono text-slate-800 dark:text-gray-300 focus:outline-none"
              />
              <button
                onClick={() => {
                  const link = detailJob.interviewLink || `${window.location.origin}/#/interview/${detailJob.id}`;
                  navigator.clipboard.writeText(link);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-200/60 dark:bg-white/[0.08] hover:bg-slate-300 dark:hover:bg-white/[0.14] text-xs font-medium text-slate-900 dark:text-white transition-colors"
              >
                {copiedLink ? <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={14} />}
                {copiedLink ? 'Copied!' : 'Copy Link'}
              </button>
            </div>

            {/* Bottom Actions Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 dark:border-white/[0.1] pt-4">
              <button
                onClick={() => handleDeleteJob(detailJob.id)}
                disabled={isDeletingJob}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors w-full sm:w-auto justify-center"
              >
                <Trash2 size={15} />
                {isDeletingJob ? 'Deleting...' : 'Delete Job'}
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  onClick={() => {
                    navigate(`/recruiter/interview/${detailJob.id}/responses`);
                    setDetailJob(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-600/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 hover:bg-blue-100 dark:hover:bg-blue-600/30 text-xs font-semibold transition-all"
                >
                  <Eye size={14} />
                  See Responses
                </button>
                <button
                  onClick={() => {
                    setEditingJobId(detailJob.id);
                    setDetailJob(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-white/[0.12] bg-slate-100 dark:bg-white/[0.06] text-xs font-semibold text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-white/[0.12] transition-all"
                >
                  <Edit3 size={14} />
                  Edit Job
                </button>
                <button
                  onClick={() => {
                    setInviteJob(detailJob);
                    setDetailJob(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black font-semibold text-xs hover:bg-slate-800 dark:hover:bg-gray-200 transition-all shadow-md"
                >
                  <UserPlus size={14} />
                  Invite Candidate
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Edit Job Modal */}
      {editingJobId && (
        <EditJobModal jobId={editingJobId} onClose={() => setEditingJobId(null)} />
      )}

      {/* Invite Candidate Modal */}
      {inviteJob && (
        <InviteCandidateModal
          job={inviteJob}
          onClose={() => setInviteJob(null)}
        />
      )}
    </div>
  );
}
