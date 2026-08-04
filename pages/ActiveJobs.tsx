import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import Logo from '../components/Logo';
import { useTheme } from '../context/ThemeContext';
import { useMessageBox } from '../components/MessageBox';
import { 
  Briefcase, MapPin, DollarSign, Calendar, Clock, Sparkles, 
  Search, Filter, ChevronRight, ArrowRight, ShieldCheck, 
  GraduationCap, CheckCircle2, User, Eye, X, Send, Copy, Check, MessageSquare, Phone, Mail, Upload
} from 'lucide-react';

export interface ActiveJobItem {
  id: string;
  jobNo?: string;
  title: string;
  contactPerson?: string;
  description?: string;
  department?: string;
  roleCategory?: string;
  category?: string;
  location?: string;
  city?: string;
  state?: string;
  employmentType?: string;
  jobType?: string;
  salary?: string;
  salaryRange?: string;
  minSalary?: string | number;
  maxSalary?: string | number;
  minExperience?: string | number;
  maxExperience?: string | number;
  experience?: string | number;
  qualification?: string;
  education?: string;
  skills?: string[] | string;
  deadline?: any;
  applyDeadline?: any;
  interviewDates?: string;
  accessCode?: string;
  recruiterName?: string;
  createdBy?: any;
  createdAt?: any;
  isMock?: boolean;
}

const parseDeadlineMillis = (deadline: any): number => {
  if (!deadline) return 0;
  if (deadline instanceof Date) return deadline.getTime();
  if (typeof deadline === 'string') {
    const dateMatch = deadline.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateMatch) {
      const [, y, m, d] = dateMatch;
      return new Date(Number(y), Number(m) - 1, Number(d)).getTime();
    }
    const parsed = Date.parse(deadline);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof deadline.toMillis === 'function') return deadline.toMillis();
  if (typeof deadline.toDate === 'function') return deadline.toDate().getTime();
  if (typeof deadline.seconds === 'number') return deadline.seconds * 1000;
  return 0;
};

const formatDeadlineDate = (deadline: any): string => {
  const millis = parseDeadlineMillis(deadline);
  if (!millis) return 'Open Application';
  const date = new Date(millis);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const ActiveJobsPage: React.FC = () => {
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const messageBox = useMessageBox();

  const [jobs, setJobs] = useState<ActiveJobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedJobType, setSelectedJobType] = useState<string>('All');
  const [selectedJobModal, setSelectedJobModal] = useState<ActiveJobItem | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Contact Us Modal States
  const [showContactModal, setShowContactModal] = useState(false);
  const [submittingContact, setSubmittingContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: ''
  });

  const handleCopyCode = (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleOpenContactModal = () => {
    setContactForm({
      name: '',
      email: '',
      phone: '',
      subject: 'General Job & Recruitment Inquiry',
      message: ''
    });
    setShowContactModal(true);
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.name.trim() || !contactForm.email.trim() || !contactForm.message.trim()) {
      messageBox.showError('Please fill in your Name, Email, and Message.');
      return;
    }

    setSubmittingContact(true);
    try {
      await addDoc(collection(db, 'contactSubmissions'), {
        ...contactForm,
        createdAt: serverTimestamp(),
        status: 'new'
      });
      messageBox.showSuccess('Your message has been sent successfully! Our team will get back to you soon.');
      setShowContactModal(false);
      setContactForm({ name: '', email: '', phone: '', subject: '', message: '' });
    } catch (err) {
      console.error('Failed to submit contact message:', err);
      messageBox.showError('Failed to send message. Please try again.');
    } finally {
      setSubmittingContact(false);
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'interviews'));
    const unsub = onSnapshot(q, (snapshot) => {
      const fetched: ActiveJobItem[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        const contactPerson = data.contactPerson || 
                              data.contactPersonName || 
                              data.uploadedBy || 
                              data.createdBy?.name || 
                              data.recruiterName || 
                              'Hiring Team';

        return {
          id: doc.id,
          title: data.title || 'Untitled Role',
          contactPerson: contactPerson,
          description: data.description || data.jobDescription || '',
          department: data.department || data.roleCategory || data.category || 'General',
          roleCategory: data.roleCategory || data.category || data.department || 'Engineering',
          location: data.location || (data.city && data.state ? `${data.city}, ${data.state}` : data.city || data.state || 'Nashik, Maharashtra'),
          employmentType: data.employmentType || data.jobType || 'Full-Time',
          salary: data.salary || data.salaryRange || (data.minSalary && data.maxSalary ? `₹${data.minSalary} - ₹${data.maxSalary} / month` : 'Competitive Salary'),
          minSalary: data.minSalary,
          maxSalary: data.maxSalary,
          minExperience: data.minExperience,
          maxExperience: data.maxExperience,
          experience: data.experience || (data.minExperience ? `${data.minExperience || 0} - ${data.maxExperience || 2} Years` : 'Freshers & Experienced'),
          qualification: data.qualification || data.education || 'Diploma / Graduate',
          skills: data.skills || [],
          deadline: data.deadline || data.applyDeadline || data.interviewDates,
          accessCode: data.accessCode || doc.id.slice(0, 6).toUpperCase(),
          createdBy: data.createdBy,
          createdAt: data.createdAt,
          isMock: Boolean(data.isMock),
        };
      });

      const now = Date.now();
      const activeOnly = fetched.filter((job) => {
        if (job.isMock) return false;
        const millis = parseDeadlineMillis(job.deadline);
        if (!millis) return true;
        const endOfDay = new Date(millis);
        endOfDay.setHours(23, 59, 59, 999);
        return endOfDay.getTime() >= now;
      });

      setJobs(activeOnly);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching active jobs:', error);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j) => {
      if (j.roleCategory) set.add(j.roleCategory);
      if (j.department) set.add(j.department);
    });
    return ['All', ...Array.from(set).slice(0, 8)];
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        job.title.toLowerCase().includes(q) ||
        (job.location && job.location.toLowerCase().includes(q)) ||
        (job.description && job.description.toLowerCase().includes(q)) ||
        (job.accessCode && job.accessCode.toLowerCase().includes(q)) ||
        (typeof job.skills === 'string' && job.skills.toLowerCase().includes(q)) ||
        (Array.isArray(job.skills) && job.skills.some((s) => s.toLowerCase().includes(q)));

      const matchesCat = selectedCategory === 'All' || 
        job.roleCategory?.toLowerCase() === selectedCategory.toLowerCase() ||
        job.department?.toLowerCase() === selectedCategory.toLowerCase();

      const matchesType = selectedJobType === 'All' ||
        job.employmentType?.toLowerCase() === selectedJobType.toLowerCase();

      return matchesSearch && matchesCat && matchesType;
    });
  }, [jobs, searchQuery, selectedCategory, selectedJobType]);

  return (
    <div className={`min-h-screen font-sans transition-colors duration-300 ${isDark ? 'bg-[#030303] text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* NAVBAR WITH LOGO AND CONTACT US */}
      <nav className={`fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 py-4 border-b transition-colors backdrop-blur-md ${
        isDark ? 'border-white/10 bg-[#030303]/80' : 'border-slate-200 bg-white/80'
      }`}>
        <Link to="/" className="flex items-center group">
          <Logo className="w-[140px] sm:w-[165px] h-auto" isDark={isDark} />
        </Link>

        <div className="flex items-center gap-3">
          <Link
            to="/upload-resume"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              isDark 
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' 
                : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            <Upload size={14} />
            <span>Upload Resume / CV</span>
          </Link>
          <button
            onClick={() => handleOpenContactModal()}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${
              isDark 
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' 
                : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            <MessageSquare size={14} />
            <span>Contact Us</span>
          </button>
        </div>
      </nav>

      {/* Hero Header */}
      <section className={`relative pt-32 pb-16 px-4 md:px-8 border-b transition-colors ${isDark ? 'border-white/[0.08] bg-[#030303]' : 'border-slate-200 bg-white'}`}>
        <div className={`absolute inset-0 pointer-events-none ${isDark ? 'bg-gradient-to-b from-blue-600/10 via-indigo-600/5 to-transparent' : 'bg-gradient-to-b from-blue-500/5 via-indigo-500/5 to-transparent'}`} />
        <div className="max-w-6xl mx-auto relative z-10 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${isDark ? 'border-blue-500/30 bg-blue-500/10 text-blue-400' : 'border-blue-200 bg-blue-50 text-blue-600'}">
            <Sparkles size={14} className="animate-pulse" />
            <span>Active Job Openings ({jobs.length})</span>
          </div>

          <h1 className={`text-3xl sm:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent ${isDark ? 'bg-gradient-to-r from-white via-slate-200 to-slate-400' : 'bg-gradient-to-r from-slate-900 via-slate-800 to-slate-600'}`}>
            Explore Posted Jobs & AI Interviews
          </h1>

          <p className={`max-w-2xl mx-auto text-sm sm:text-base ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Browse active positions from verified hiring recruiters. Copy access codes or launch AI interviews immediately.
          </p>

          {/* Search & Filter Bar */}
          <div className={`max-w-3xl mx-auto mt-8 flex flex-col sm:flex-row items-center gap-3 p-2.5 rounded-2xl border shadow-2xl transition-colors ${isDark ? 'bg-[#0d0d0d] border-white/[0.12]' : 'bg-white border-slate-200 shadow-slate-200/50'}`}>
            <div className="relative flex-1 w-full">
              <Search size={18} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-400' : 'text-slate-400'}`} />
              <input
                type="text"
                placeholder="Search job title, access code, or skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full h-11 pl-10 pr-4 rounded-xl text-sm outline-none transition-colors ${
                  isDark 
                    ? 'bg-transparent text-white placeholder-slate-500 focus:ring-1 focus:ring-blue-500/50' 
                    : 'bg-slate-50 text-slate-900 placeholder-slate-400 focus:ring-1 focus:ring-blue-500'
                }`}
              />
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              <select
                value={selectedJobType}
                onChange={(e) => setSelectedJobType(e.target.value)}
                className={`h-11 px-3 rounded-xl text-xs font-semibold outline-none cursor-pointer border transition-colors ${
                  isDark
                    ? 'bg-white/[0.05] border-white/[0.1] text-slate-300 hover:bg-white/[0.08]'
                    : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <option value="All">All Types</option>
                <option value="Full-Time">Full-Time</option>
                <option value="Part-Time">Part-Time</option>
                <option value="Contract">Contract</option>
                <option value="Remote">Remote</option>
              </select>

              <div className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shrink-0 shadow-md">
                {filteredJobs.length} Jobs
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Jobs Listing */}
      <section className="max-w-6xl mx-auto px-4 md:px-8 py-12">
        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-8 custom-scrollbar">
          <span className={`text-xs font-semibold uppercase tracking-wider mr-2 shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Filter:</span>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                  : isDark
                  ? 'bg-white/[0.04] text-slate-400 border border-white/[0.08] hover:bg-white/[0.08] hover:text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 hover:text-slate-900 shadow-sm'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid gap-6 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={`h-64 rounded-2xl animate-pulse p-6 space-y-4 border ${isDark ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-white border-slate-200'}`}>
                <div className={`h-6 rounded w-2/3 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
                <div className={`h-4 rounded w-1/3 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
                <div className={`h-16 rounded w-full ${isDark ? 'bg-white/5' : 'bg-slate-100'}`} />
                <div className={`h-10 rounded w-1/2 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
              </div>
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className={`text-center py-20 rounded-3xl border p-8 space-y-4 ${isDark ? 'bg-[#0a0a0a] border-white/[0.08]' : 'bg-white border-slate-200 shadow-lg'}`}>
            <div className="w-16 h-16 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center mx-auto">
              <Briefcase size={32} />
            </div>
            <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>No active jobs found</h3>
            <p className={`text-sm max-w-md mx-auto ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              There are currently no open positions matching your search or filters. Try adjusting your keywords or clearing filters.
            </p>
            <button
              onClick={() => { setSearchQuery(''); setSelectedCategory('All'); setSelectedJobType('All'); }}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${isDark ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {filteredJobs.map((job) => {
              const deadlineStr = formatDeadlineDate(job.deadline);
              const skillsList = Array.isArray(job.skills) 
                ? job.skills 
                : typeof job.skills === 'string' 
                ? job.skills.split(',').map(s => s.trim()).filter(Boolean) 
                : [];

              return (
                <div
                  key={job.id}
                  className={`group relative flex flex-col justify-between rounded-2xl border p-6 transition-all duration-300 shadow-xl overflow-hidden ${
                    isDark 
                      ? 'bg-[#0d0d0d] border-white/[0.1] hover:border-blue-500/40 hover:bg-[#111111]' 
                      : 'bg-white border-slate-200 hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/10'
                  }`}
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-all pointer-events-none" />

                  <div>
                    {/* Top Row: Job No, Role Category & Active Indicator */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {job.jobNo && (
                          <span className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-extrabold uppercase tracking-wider ${
                            isDark ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border border-emerald-300 text-emerald-700'
                          }`}>
                            Job No: {job.jobNo}
                          </span>
                        )}
                        <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                          isDark ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400' : 'bg-blue-50 border border-blue-200 text-blue-600'
                        }`}>
                          {job.roleCategory || job.department || 'Active Role'}
                        </span>
                      </div>

                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-500 shrink-0 font-semibold">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Active</span>
                      </span>
                    </div>

                    {/* Job Title */}
                    <div className="flex items-start justify-between gap-3">
                      <h2 className={`text-xl font-bold transition-colors line-clamp-1 ${
                        isDark ? 'text-white group-hover:text-blue-400' : 'text-slate-900 group-hover:text-blue-600'
                      }`}>
                        {job.title}
                      </h2>
                    </div>

                    {/* HIGH VISIBILITY ACCESS CODE BADGE */}
                    {job.accessCode && (
                      <div className="mt-2.5 inline-flex items-center gap-2">
                        <div 
                          onClick={(e) => handleCopyCode(e, job.accessCode!)}
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-mono font-black tracking-wider cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-md group/code ${
                            isDark 
                              ? 'bg-gradient-to-r from-blue-600/20 via-indigo-600/20 to-blue-500/20 border-blue-500/40 text-blue-300' 
                              : 'bg-blue-50 border-blue-300 text-blue-700'
                          }`}
                          title="Click to copy Job Access Code"
                        >
                          <span className={`text-[10px] font-sans uppercase font-extrabold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Access Code:</span>
                          <span className="text-sm font-extrabold font-mono tracking-widest">{job.accessCode}</span>
                          {copiedCode === job.accessCode ? (
                            <Check size={14} className="text-emerald-500 ml-0.5" />
                          ) : (
                            <Copy size={13} className="text-blue-500 group-hover/code:scale-110 transition-transform ml-0.5" />
                          )}
                        </div>
                        {copiedCode === job.accessCode && (
                          <span className="text-xs font-bold text-emerald-500 animate-pulse">Copied!</span>
                        )}
                      </div>
                    )}

                    {/* Location & Contact Person */}
                    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      <div className="flex items-center gap-1.5">
                        <MapPin size={14} className={isDark ? 'text-slate-500' : 'text-slate-400'} />
                        <span>{job.location}</span>
                      </div>
                      {job.contactPerson && (
                        <div className="flex items-center gap-1.5">
                          <User size={14} className="text-blue-500" />
                          <span>Contact Person: <strong className={isDark ? 'text-slate-200' : 'text-slate-900'}>{job.contactPerson}</strong></span>
                        </div>
                      )}
                    </div>

                    {/* Salary & Experience Details Grid */}
                    <div className={`grid grid-cols-2 gap-2 my-4 p-3.5 rounded-xl border text-xs transition-colors ${
                      isDark ? 'bg-white/[0.03] border-white/[0.06]' : 'bg-slate-100/70 border-slate-200'
                    }`}>
                      <div>
                        <span className={`block text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Salary</span>
                        <span className="font-bold text-emerald-500 truncate block mt-0.5">{job.salary}</span>
                      </div>
                      <div>
                        <span className={`block text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Experience</span>
                        <span className={`font-semibold truncate block mt-0.5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{job.experience}</span>
                      </div>
                      {job.qualification && (
                        <div className={`col-span-2 pt-1.5 border-t ${isDark ? 'border-white/[0.04]' : 'border-slate-200'}`}>
                          <span className={`block text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Education</span>
                          <span className={`font-medium truncate block mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{job.qualification}</span>
                        </div>
                      )}
                    </div>

                    {/* Description Snippet */}
                    {job.description && (
                      <p className={`text-xs line-clamp-2 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        {job.description}
                      </p>
                    )}

                    {/* Skill Tags */}
                    {skillsList.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-4">
                        {skillsList.slice(0, 4).map((skill, idx) => (
                          <span key={idx} className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                            isDark 
                              ? 'bg-white/[0.05] border-white/[0.08] text-slate-300' 
                              : 'bg-slate-100 border-slate-200 text-slate-700'
                          }`}>
                            {skill}
                          </span>
                        ))}
                        {skillsList.length > 4 && (
                          <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            +{skillsList.length - 4} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Bottom Action Row */}
                  <div className={`flex flex-wrap items-center justify-between gap-3 pt-5 mt-5 border-t ${isDark ? 'border-white/[0.08]' : 'border-slate-200'}`}>
                    <div className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                      <Calendar size={13} />
                      <span>Closes: <strong className={isDark ? 'text-slate-400' : 'text-slate-700'}>{deadlineStr}</strong></span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedJobModal(job)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 border ${
                          isDark
                            ? 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.1] text-slate-300'
                            : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                        }`}
                      >
                        <Eye size={13} />
                        <span>Details</span>
                      </button>

                      <button
                        onClick={() => navigate(`/interview/${job.id}`)}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-lg shadow-blue-600/25 transition-all flex items-center gap-1.5 group/btn"
                      >
                        <span>Apply Now</span>
                        <ArrowRight size={13} className="group-hover/btn:translate-x-0.5 transition-transform" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* JOB DETAILS MODAL */}
      {selectedJobModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setSelectedJobModal(null)}>
          <div 
            className={`max-w-2xl w-full max-h-[85vh] rounded-3xl border p-6 sm:p-8 shadow-2xl overflow-y-auto space-y-6 transition-colors ${
              isDark ? 'bg-[#0d0d0d] border-white/[0.15] text-white' : 'bg-white border-slate-200 text-slate-900'
            }`} 
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className={`flex items-start justify-between gap-4 border-b pb-5 ${isDark ? 'border-white/[0.1]' : 'border-slate-200'}`}>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {selectedJobModal.jobNo && (
                    <span className={`px-2.5 py-1 rounded text-[11px] font-mono font-extrabold uppercase tracking-wider ${
                      isDark ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border border-emerald-300 text-emerald-700'
                    }`}>
                      Job No: {selectedJobModal.jobNo}
                    </span>
                  )}
                  <span className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider ${
                    isDark ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400' : 'bg-blue-50 border border-blue-200 text-blue-600'
                  }`}>
                    {selectedJobModal.roleCategory || selectedJobModal.department}
                  </span>
                </div>
                <h2 className={`text-2xl font-extrabold mt-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>{selectedJobModal.title}</h2>
                <div className={`flex flex-wrap items-center gap-3 text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  <span>{selectedJobModal.location}</span>
                  {selectedJobModal.contactPerson && (
                    <>
                      <span>·</span>
                      <span className="text-blue-500 font-semibold">Contact Person: {selectedJobModal.contactPerson}</span>
                    </>
                  )}
                </div>
              </div>

              <button onClick={() => setSelectedJobModal(null)} className={`p-1 transition-colors ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}>
                <X size={20} />
              </button>
            </div>

            {/* Access Code Highlight Banner */}
            {selectedJobModal.accessCode && (
              <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md ${
                isDark 
                  ? 'bg-gradient-to-r from-blue-600/15 via-indigo-600/15 to-blue-500/15 border-blue-500/30' 
                  : 'bg-blue-50 border-blue-200'
              }`}>
                <div>
                  <span className={`block text-[10px] uppercase font-extrabold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Job Access Code
                  </span>
                  <span className="font-mono text-xl font-black text-blue-500 dark:text-blue-300 tracking-widest block mt-0.5">
                    {selectedJobModal.accessCode}
                  </span>
                </div>

                <button
                  onClick={(e) => handleCopyCode(e, selectedJobModal.accessCode!)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md shrink-0"
                >
                  {copiedCode === selectedJobModal.accessCode ? (
                    <>
                      <Check size={14} />
                      <span>Copied Code!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>Copy Access Code</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Overview Key Metrics Grid */}
            <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-2xl border text-xs ${
              isDark ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-slate-100/70 border-slate-200'
            }`}>
              <div>
                <span className={`block text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Contact Person</span>
                <span className={`font-semibold block mt-0.5 truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{selectedJobModal.contactPerson}</span>
              </div>
              <div>
                <span className={`block text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Salary</span>
                <span className="font-bold text-emerald-500 block mt-0.5 truncate">{selectedJobModal.salary}</span>
              </div>
              <div>
                <span className={`block text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Experience</span>
                <span className={`font-semibold block mt-0.5 truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{selectedJobModal.experience}</span>
              </div>
              {selectedJobModal.qualification && (
                <div className={`col-span-2 sm:col-span-3 pt-2 border-t ${isDark ? 'border-white/[0.05]' : 'border-slate-200'}`}>
                  <span className={`block text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Education / Qualification</span>
                  <span className={`font-medium block mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{selectedJobModal.qualification}</span>
                </div>
              )}
            </div>

            {/* Description */}
            {selectedJobModal.description && (
              <div className="space-y-2">
                <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Job Description</h3>
                <div className={`text-sm whitespace-pre-line leading-relaxed p-4 rounded-2xl border ${
                  isDark ? 'bg-white/[0.02] border-white/[0.06] text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  {selectedJobModal.description}
                </div>
              </div>
            )}

            {/* Modal Action Footer */}
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t ${isDark ? 'border-white/[0.1]' : 'border-slate-200'}`}>
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Deadline: <strong className={isDark ? 'text-white' : 'text-slate-900'}>{formatDeadlineDate(selectedJobModal.deadline)}</strong>
              </span>

              <button
                onClick={() => { setSelectedJobModal(null); navigate(`/interview/${selectedJobModal.id}`); }}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-bold text-white shadow-xl shadow-blue-600/30 transition-all flex items-center justify-center gap-2"
              >
                <span>Launch Interview & Apply</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTACT US FORM MODAL */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setShowContactModal(false)}>
          <div 
            className={`max-w-lg w-full rounded-3xl border p-6 sm:p-8 shadow-2xl space-y-6 transition-colors ${
              isDark ? 'bg-[#0d0d0d] border-white/[0.15] text-white' : 'bg-white border-slate-200 text-slate-900'
            }`} 
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className={`flex items-center justify-between border-b pb-4 ${isDark ? 'border-white/[0.1]' : 'border-slate-200'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
                  <MessageSquare size={20} />
                </div>
                <div>
                  <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    Contact Us
                  </h3>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Send us your query or feedback
                  </p>
                </div>
              </div>

              <button onClick={() => setShowContactModal(false)} className={`p-1 transition-colors ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}>
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleContactSubmit} className="space-y-4">
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter your full name"
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  className={`w-full h-10 px-3.5 rounded-xl text-sm outline-none border transition-colors ${
                    isDark ? 'bg-white/[0.04] border-white/[0.1] text-white focus:border-emerald-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-500'
                  }`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    className={`w-full h-10 px-3.5 rounded-xl text-sm outline-none border transition-colors ${
                      isDark ? 'bg-white/[0.04] border-white/[0.1] text-white focus:border-emerald-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-500'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Phone / Mobile
                  </label>
                  <input
                    type="tel"
                    placeholder="Mobile number"
                    value={contactForm.phone}
                    onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                    className={`w-full h-10 px-3.5 rounded-xl text-sm outline-none border transition-colors ${
                      isDark ? 'bg-white/[0.04] border-white/[0.1] text-white focus:border-emerald-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-500'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Subject
                </label>
                <input
                  type="text"
                  placeholder="Subject"
                  value={contactForm.subject}
                  onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                  className={`w-full h-10 px-3.5 rounded-xl text-sm outline-none border transition-colors ${
                    isDark ? 'bg-white/[0.04] border-white/[0.1] text-white focus:border-emerald-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-500'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Message / Inquiry <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Write your message or question here..."
                  value={contactForm.message}
                  onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                  className={`w-full p-3 rounded-xl text-sm outline-none border resize-none transition-colors ${
                    isDark ? 'bg-white/[0.04] border-white/[0.1] text-white focus:border-emerald-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-500'
                  }`}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowContactModal(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingContact}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {submittingContact ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i>
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      <span>Send Message</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Page Footer */}
      <footer className={`border-t py-8 text-center text-xs transition-colors ${isDark ? 'border-white/[0.08] text-slate-500' : 'border-slate-200 text-slate-600 bg-white'}`}>
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} InterviewXpert. All rights reserved. Powered by AI Hiring Engine.</p>
          <div className="flex items-center gap-4">
            <Link to="/career-hub" className="hover:text-blue-500 transition-colors">Career Hub</Link>
            <Link to="/blogs" className="hover:text-blue-500 transition-colors">Blogs</Link>
            <Link to="/contact" className="hover:text-blue-500 transition-colors">Contact Us</Link>
            <Link to="/privacy-policy" className="hover:text-blue-500 transition-colors">Privacy Policy</Link>
            <Link to="/terms-of-service" className="hover:text-blue-500 transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default ActiveJobsPage;
