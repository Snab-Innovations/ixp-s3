import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import Logo from '../components/Logo';
import { useTheme } from '../context/ThemeContext';
import { useMessageBox } from '../components/MessageBox';
import { 
  Briefcase, MapPin, Calendar, Clock, Sparkles, 
  Search, Filter, ChevronRight, ArrowRight, ShieldCheck, 
  GraduationCap, CheckCircle2, User, Eye, X, Send, Copy, Check, MessageSquare, Phone, Mail, Upload,
  Layers, Tag
} from 'lucide-react';
import { getJobDescriptionSnippet, FormattedJobDescription } from '../utils/jobDescriptionFormatter';
import { splitEducationRequirements } from '../utils/educationMatcher';

export interface ActiveJobItem {
  id: string;
  jobNo?: string;
  title: string;
  company?: string;
  companyName?: string;
  entryBy?: string;
  recruiterName?: string;
  contactPerson?: string;
  description?: string;
  industrySector?: string;
  sector?: string;
  department?: string;
  departments?: string[];
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
  genderRequirement?: string;
  gender?: string;
  skills?: string[] | string;
  deadline?: any;
  deadlineDate?: any;
  applyDeadline?: any;
  interviewDates?: string;
  accessCode?: string;
  createdBy?: any;
  createdAt?: any;
  isMock?: boolean;
}

const parseDeadlineMillis = (deadline: any): number => {
  if (!deadline) return 0;
  if (deadline instanceof Date) return deadline.getTime();
  if (typeof deadline === 'number') return deadline;
  if (typeof deadline?.toMillis === 'function') return deadline.toMillis();
  if (typeof deadline?.toDate === 'function') return deadline.toDate().getTime();
  if (typeof deadline?.seconds === 'number') return deadline.seconds * 1000;
  if (typeof deadline === 'string') {
    const trimmed = deadline.trim();
    if (!trimmed || ['open', 'open application', 'anytime', 'no deadline', 'within 48 hours', 'unspecified'].includes(trimmed.toLowerCase())) {
      return 0;
    }
    const isoDateMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (isoDateMatch) {
      const [, y, m, d] = isoDateMatch;
      return new Date(Number(y), Number(m) - 1, Number(d)).getTime();
    }
    const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmyMatch) {
      const [, d, m, y] = dmyMatch;
      return new Date(Number(y), Number(m) - 1, Number(d)).getTime();
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
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
  const [selectedSector, setSelectedSector] = useState<string>('All');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [selectedExperience, setSelectedExperience] = useState<string>('All');
  const [selectedLocation, setSelectedLocation] = useState<string>('All');
  const [selectedGender, setSelectedGender] = useState<string>('All');
  const [selectedJobModal, setSelectedJobModal] = useState<ActiveJobItem | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

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
    let interviewsList: ActiveJobItem[] = [];
    let jobsList: ActiveJobItem[] = [];

    const mergeAndSetJobs = () => {
      const map = new Map<string, ActiveJobItem>();
      interviewsList.forEach((job) => {
        const key = job.jobNo || job.accessCode || job.id;
        map.set(key, job);
        map.set(job.id, job);
      });
      jobsList.forEach((job) => {
        const key = job.jobNo || job.accessCode || job.id;
        const existing = map.get(key) || map.get(job.id);
        if (existing) {
          map.set(key, { ...existing, ...job, id: existing.id || job.id });
        } else {
          map.set(key, job);
        }
      });

      const uniqueFetched = Array.from(new Set(map.values()));
      const now = Date.now();
      const activeOnly = uniqueFetched.filter((job) => {
        if (job.isMock) return false;
        const statusLower = String((job as any).status || '').trim().toLowerCase();
        if (['inactive', 'expired', 'closed', 'disabled', 'deactivated', 'draft'].includes(statusLower)) {
          return false;
        }
        const rawDeadline = job.deadlineDate || job.deadline || job.applyDeadline || job.interviewDates || (job as any).interviewDeadline || (job as any).endDate;
        const millis = parseDeadlineMillis(rawDeadline);
        if (!millis) return true;
        const endOfDay = new Date(millis);
        endOfDay.setHours(23, 59, 59, 999);
        return endOfDay.getTime() >= now;
      });

      setJobs(activeOnly);
      setLoading(false);
    };

    const qInterviews = query(collection(db, 'interviews'));
    const unsubInterviews = onSnapshot(qInterviews, (snapshot) => {
      interviewsList = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const jobNo = data.jobNo ? String(data.jobNo).trim() : '';
        const accessCode = jobNo || data.accessCode || docSnap.id.slice(0, 6).toUpperCase();
        const resolvedEntryBy = (
          data.entryBy ||
          data.entry_by ||
          data.uploadedBy ||
          data.uploaded_by ||
          data.contactPerson ||
          data.contactPersonName ||
          (typeof data.createdBy === 'string' ? data.createdBy : data.createdBy?.name) ||
          data.recruiterName ||
          'Recruiter'
        ).toString().trim();

        return {
          id: docSnap.id,
          jobNo,
          title: data.title || 'Untitled Role',
          entryBy: resolvedEntryBy,
          recruiterName: resolvedEntryBy,
          contactPerson: resolvedEntryBy,
          description: data.description || data.jobDescription || '',
          industrySector: data.industrySector || data.sector || data.industryName || data.industry || 'General Industry',
          sector: data.sector || data.industrySector || data.industryName || 'General Industry',
          department: data.department || data.roleCategory || data.category || 'General',
          departments: data.departments || [data.department || data.roleCategory || data.category || 'General'],
          roleCategory: data.roleCategory || data.category || data.department || 'General',
          location: data.location || (data.city && data.state ? `${data.city}, ${data.state}` : data.city || data.state || 'Nashik, Maharashtra'),
          city: data.city || data.location || 'Nashik',
          genderRequirement: data.genderRequirement || data.gender || data.genderPreference || 'Any',
          gender: data.gender || data.genderRequirement || 'Any',
          employmentType: data.employmentType || data.jobType || 'Full-Time',
          salary: data.salary || data.salaryRange || '',
          minSalary: data.minSalary,
          maxSalary: data.maxSalary,
          minExperience: data.minExperience,
          maxExperience: data.maxExperience,
          experience: data.experience || (data.minExperience ? `${data.minExperience || 0} - ${data.maxExperience || 2} Years` : 'Freshers & Experienced'),
          qualification: data.qualification || data.education || data.qualifications || 'Diploma / Graduate',
          education: data.education || data.qualification || data.qualifications || 'Diploma / Graduate',
          skills: data.skills || [],
          deadline: data.deadlineDate || data.deadline || data.applyDeadline || data.interviewDates || data.interviewDeadline || data.endDate || '',
          deadlineDate: data.deadlineDate || data.deadline || data.applyDeadline || data.interviewDates || data.interviewDeadline || data.endDate || '',
          accessCode,
          status: data.status || 'Active',
          createdBy: data.createdBy,
          createdAt: data.createdAt,
          isMock: Boolean(data.isMock),
        };
      });
      mergeAndSetJobs();
    }, (error) => {
      console.error('Error fetching active jobs:', error);
      setLoading(false);
    });

    const qJobs = query(collection(db, 'jobs'));
    const unsubJobs = onSnapshot(qJobs, (snapshot) => {
      jobsList = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const jobNo = data.jobNo ? String(data.jobNo).trim() : '';
        const accessCode = jobNo || data.accessCode || docSnap.id.slice(0, 6).toUpperCase();
        const resolvedEntryBy = (
          data.entryBy ||
          data.entry_by ||
          data.uploadedBy ||
          data.uploaded_by ||
          data.contactPerson ||
          data.contactPersonName ||
          (typeof data.createdBy === 'string' ? data.createdBy : data.createdBy?.name) ||
          data.recruiterName ||
          'Recruiter'
        ).toString().trim();

        return {
          id: docSnap.id,
          jobNo,
          title: data.title || 'Untitled Role',
          entryBy: resolvedEntryBy,
          recruiterName: resolvedEntryBy,
          contactPerson: resolvedEntryBy,
          description: data.description || data.jobDescription || '',
          industrySector: data.industrySector || data.sector || data.industryName || data.industry || 'General Industry',
          sector: data.sector || data.industrySector || data.industryName || 'General Industry',
          department: data.department || data.roleCategory || data.category || 'General',
          departments: data.departments || [data.department || data.roleCategory || data.category || 'General'],
          roleCategory: data.roleCategory || data.category || data.department || 'General',
          location: data.location || (data.city && data.state ? `${data.city}, ${data.state}` : data.city || data.state || 'Nashik, Maharashtra'),
          city: data.city || data.location || 'Nashik',
          genderRequirement: data.genderRequirement || data.gender || data.genderPreference || 'Any',
          gender: data.gender || data.genderRequirement || 'Any',
          employmentType: data.employmentType || data.jobType || 'Full-Time',
          salary: data.salary || data.salaryRange || '',
          minSalary: data.minSalary,
          maxSalary: data.maxSalary,
          minExperience: data.minExperience,
          maxExperience: data.maxExperience,
          experience: data.experience || (data.minExperience ? `${data.minExperience || 0} - ${data.maxExperience || 2} Years` : 'Freshers & Experienced'),
          qualification: data.qualification || data.education || data.qualifications || 'Diploma / Graduate',
          education: data.education || data.qualification || data.qualifications || 'Diploma / Graduate',
          skills: data.skills || [],
          deadline: data.deadlineDate || data.deadline || data.applyDeadline || data.interviewDates || data.interviewDeadline || data.endDate || '',
          deadlineDate: data.deadlineDate || data.deadline || data.applyDeadline || data.interviewDates || data.interviewDeadline || data.endDate || '',
          accessCode,
          status: data.status || 'Active',
          createdBy: data.createdBy,
          createdAt: data.createdAt,
          isMock: Boolean(data.isMock),
        };
      });
      mergeAndSetJobs();
    }, (error) => {
      console.warn('Jobs collection fetch note in ActiveJobs:', error);
    });

    return () => {
      unsubInterviews();
      unsubJobs();
    };
  }, []);

  const sectorsList = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j) => {
      if (j.industrySector && j.industrySector.trim()) set.add(j.industrySector.trim());
      else if (j.sector && j.sector.trim()) set.add(j.sector.trim());
    });
    return ['All', ...Array.from(set).sort()];
  }, [jobs]);

  const departmentsList = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j) => {
      if (j.department && j.department.trim()) set.add(j.department.trim());
      if (j.roleCategory && j.roleCategory.trim()) set.add(j.roleCategory.trim());
    });
    return ['All', ...Array.from(set).sort()];
  }, [jobs]);

  const locationsList = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j) => {
      if (j.city && j.city.trim()) {
        set.add(j.city.trim());
      } else if (j.location && j.location.trim()) {
        const parts = j.location.split(',');
        const primary = parts[0]?.trim();
        if (primary) set.add(primary);
      }
    });
    return ['All', ...Array.from(set).sort()];
  }, [jobs]);

  const experienceOptions = [
    'All',
    'Fresher / 0 - 1 Yr',
    '1 - 3 Yrs',
    '3 - 5 Yrs',
    '5+ Yrs'
  ];

  const genderOptions = [
    'All',
    'Female Only',
    'Male Only',
    'Open / Any'
  ];

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const q = searchQuery.toLowerCase().trim();
      const qDigits = q.replace(/\D/g, '');
      const rawJobNo = String(job.jobNo || '').toLowerCase().trim();
      const rawCode = String(job.accessCode || '').toLowerCase().trim();
      const rawId = String(job.id || '').toLowerCase().trim();

      const matchesJobNo = (rawJobNo && (rawJobNo.includes(q) || (qDigits && rawJobNo.includes(qDigits)))) ||
        (rawCode && (rawCode.includes(q) || (qDigits && rawCode.includes(qDigits)))) ||
        rawId.includes(q);

      const matchesSearch = !q || 
        matchesJobNo ||
        job.title.toLowerCase().includes(q) ||
        (job.location && job.location.toLowerCase().includes(q)) ||
        (job.city && job.city.toLowerCase().includes(q)) ||
        (job.description && job.description.toLowerCase().includes(q)) ||
        (job.department && job.department.toLowerCase().includes(q)) ||
        (job.industrySector && job.industrySector.toLowerCase().includes(q)) ||
        (typeof job.skills === 'string' && job.skills.toLowerCase().includes(q)) ||
        (Array.isArray(job.skills) && job.skills.some((s) => s.toLowerCase().includes(q)));

      const jobSec = (job.industrySector || job.sector || '').toLowerCase();
      const matchesSector = selectedSector === 'All' || jobSec.includes(selectedSector.toLowerCase());

      const jobDept = (job.department || job.roleCategory || '').toLowerCase();
      const matchesDept = selectedDepartment === 'All' || jobDept.includes(selectedDepartment.toLowerCase());

      const jobLoc = `${job.location || ''} ${job.city || ''}`.toLowerCase();
      const matchesLocation = selectedLocation === 'All' || jobLoc.includes(selectedLocation.toLowerCase());

      let matchesExperience = true;
      if (selectedExperience !== 'All') {
        const expStr = String(job.experience || '').toLowerCase();
        const minExp = Number(job.minExperience || 0);
        const maxExp = Number(job.maxExperience || 0);

        if (selectedExperience === 'Fresher / 0 - 1 Yr') {
          matchesExperience = expStr.includes('fresh') || expStr.includes('0') || minExp === 0 || maxExp <= 1;
        } else if (selectedExperience === '1 - 3 Yrs') {
          matchesExperience = expStr.includes('1') || expStr.includes('2') || expStr.includes('3') || (minExp >= 1 && minExp <= 3);
        } else if (selectedExperience === '3 - 5 Yrs') {
          matchesExperience = expStr.includes('3') || expStr.includes('4') || expStr.includes('5') || (minExp >= 3 && minExp <= 5);
        } else if (selectedExperience === '5+ Yrs') {
          matchesExperience = minExp >= 5 || maxExp >= 5 || expStr.includes('5+') || expStr.includes('6') || expStr.includes('7') || expStr.includes('8') || expStr.includes('10');
        }
      }

      let matchesGender = true;
      if (selectedGender !== 'All') {
        const gStr = (job.genderRequirement || job.gender || '').toLowerCase();
        if (selectedGender === 'Female Only') {
          matchesGender = gStr.includes('female');
        } else if (selectedGender === 'Male Only') {
          matchesGender = gStr.includes('male') && !gStr.includes('female');
        } else if (selectedGender === 'Open / Any') {
          matchesGender = gStr.includes('any') || gStr.includes('open') || gStr === '' || (!gStr.includes('female') && !gStr.includes('male'));
        }
      }

      return matchesSearch && matchesSector && matchesDept && matchesLocation && matchesExperience && matchesGender;
    });
  }, [jobs, searchQuery, selectedSector, selectedDepartment, selectedLocation, selectedExperience, selectedGender]);

  return (
    <div className={`min-h-screen font-sans transition-colors duration-300 ${isDark ? 'bg-[#030303] text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <nav className={`fixed top-0 inset-x-0 z-50 flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b transition-colors backdrop-blur-md ${
        isDark ? 'border-white/10 bg-[#030303]/85' : 'border-slate-200 bg-white/85'
      }`}>
        <Link to="/" className="flex items-center group">
          <Logo className="w-[130px] sm:w-[165px] h-auto" isDark={isDark} />
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <Link
            to="/upload-resume"
            className={`inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-sm font-extrabold whitespace-nowrap transition-all shadow-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${
              isDark 
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-black shadow-emerald-500/20 hover:shadow-emerald-500/35' 
                : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-600/25 hover:shadow-emerald-600/40'
            }`}
          >
            <Upload size={14} className="animate-pulse shrink-0" />
            <span className="hidden xs:inline">Upload Resume / CV</span>
            <span className="xs:hidden">Upload CV</span>
          </Link>
          <button
            type="button"
            onClick={() => handleOpenContactModal()}
            className={`inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-sm font-extrabold whitespace-nowrap transition-all border shadow-sm hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${
              isDark 
                ? 'border-white/20 bg-white/10 text-white hover:bg-white/15' 
                : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
            }`}
          >
            <MessageSquare size={14} className="text-emerald-500 shrink-0" />
            <span>Contact</span>
          </button>
        </div>
      </nav>

      <section className={`relative pt-24 sm:pt-32 pb-10 sm:pb-14 px-4 sm:px-6 lg:px-8 border-b transition-colors ${isDark ? 'border-white/[0.08] bg-[#030303]' : 'border-slate-200 bg-white'}`}>
        <div className={`absolute inset-0 pointer-events-none ${isDark ? 'bg-gradient-to-b from-emerald-600/10 via-teal-600/5 to-transparent' : 'bg-gradient-to-b from-emerald-500/5 via-teal-500/5 to-transparent'}`} />
        <div className="max-w-6xl mx-auto relative z-10 text-center space-y-3.5">
          <div className={`inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-[11px] sm:text-xs font-bold uppercase tracking-wider border ${isDark ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            <Sparkles size={14} className="animate-pulse" />
            <span>Active Job Openings ({jobs.length})</span>
          </div>

          <h1 className={`text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight bg-clip-text text-transparent leading-tight ${isDark ? 'bg-gradient-to-r from-white via-slate-100 to-slate-400' : 'bg-gradient-to-r from-slate-900 via-slate-800 to-slate-600'}`}>
            Explore Posted Jobs & AI Interviews
          </h1>

          <p className={`max-w-2xl mx-auto text-xs sm:text-sm md:text-base leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Browse open positions from verified recruiters. Filter by Sector, Department, Location, Experience & Gender.
          </p>

          <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 sm:gap-3.5 w-full max-w-md sm:max-w-none mx-auto">
            <Link
              to="/upload-resume"
              className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-extrabold transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${
                isDark 
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-black shadow-emerald-500/25 hover:shadow-emerald-500/40' 
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-600/30 hover:shadow-emerald-600/50'
              }`}
            >
              <Upload size={15} className="animate-pulse shrink-0" />
              <span>Upload Resume / CV for Direct Job Match</span>
            </Link>
            <button
              type="button"
              onClick={() => handleOpenContactModal()}
              className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-extrabold transition-all border shadow-sm hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${
                isDark 
                  ? 'border-white/20 bg-white/10 text-white hover:bg-white/15' 
                  : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
              }`}
            >
              <MessageSquare size={15} className="text-emerald-500 shrink-0" />
              <span>Contact Support Team</span>
            </button>
          </div>

          <div className={`max-w-5xl mx-auto mt-6 p-3 sm:p-4 rounded-2xl sm:rounded-3xl border shadow-2xl transition-all space-y-3 ${
            isDark ? 'bg-[#0d0d0d] border-white/[0.12] shadow-emerald-500/5' : 'bg-white border-slate-200 shadow-slate-200/80'
          }`}>
            <div className="relative w-full">
              <Search size={20} className={`absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
              <input
                type="text"
                placeholder="Search job title, access code, sector, city, or skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full h-12 sm:h-13 pl-11 sm:pl-12 pr-10 rounded-xl sm:rounded-2xl text-xs sm:text-sm md:text-base font-semibold outline-none transition-all border ${
                  isDark 
                    ? 'bg-white/[0.04] border-white/[0.1] text-white placeholder-slate-500 focus:border-emerald-500 focus:bg-white/[0.07] focus:ring-2 focus:ring-emerald-500/20' 
                    : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20'
                }`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 w-full pt-1">
              <div className="relative">
                <select
                  value={selectedSector}
                  onChange={(e) => setSelectedSector(e.target.value)}
                  className={`w-full h-10 sm:h-11 px-2.5 sm:px-3 rounded-xl text-[11px] sm:text-xs font-bold outline-none cursor-pointer border transition-colors truncate ${
                    isDark
                      ? 'bg-white/[0.05] border-white/[0.1] text-slate-300 hover:bg-white/[0.08] focus:border-emerald-500'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200 focus:border-emerald-500'
                  }`}
                  title="Filter by Industry Sector"
                >
                  <option value="All">All Sectors ({sectorsList.length - 1})</option>
                  {sectorsList.filter(s => s !== 'All').map(sec => (
                    <option key={sec} value={sec}>{sec}</option>
                  ))}
                </select>
              </div>

              <div className="relative">
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className={`w-full h-10 sm:h-11 px-2.5 sm:px-3 rounded-xl text-[11px] sm:text-xs font-bold outline-none cursor-pointer border transition-colors truncate ${
                    isDark
                      ? 'bg-white/[0.05] border-white/[0.1] text-slate-300 hover:bg-white/[0.08] focus:border-emerald-500'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200 focus:border-emerald-500'
                  }`}
                  title="Filter by Functional Department"
                >
                  <option value="All">All Depts ({departmentsList.length - 1})</option>
                  {departmentsList.filter(d => d !== 'All').map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              <div className="relative">
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className={`w-full h-10 sm:h-11 px-2.5 sm:px-3 rounded-xl text-[11px] sm:text-xs font-bold outline-none cursor-pointer border transition-colors truncate ${
                    isDark
                      ? 'bg-white/[0.05] border-white/[0.1] text-slate-300 hover:bg-white/[0.08] focus:border-emerald-500'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200 focus:border-emerald-500'
                  }`}
                  title="Filter by City / Location"
                >
                  <option value="All">All Cities ({locationsList.length - 1})</option>
                  {locationsList.filter(loc => loc !== 'All').map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>

              <div className="relative">
                <select
                  value={selectedExperience}
                  onChange={(e) => setSelectedExperience(e.target.value)}
                  className={`w-full h-10 sm:h-11 px-2.5 sm:px-3 rounded-xl text-[11px] sm:text-xs font-bold outline-none cursor-pointer border transition-colors truncate ${
                    isDark
                      ? 'bg-white/[0.05] border-white/[0.1] text-slate-300 hover:bg-white/[0.08] focus:border-emerald-500'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200 focus:border-emerald-500'
                  }`}
                  title="Filter by Experience"
                >
                  <option value="All">All Exp</option>
                  {experienceOptions.filter(e => e !== 'All').map(exp => (
                    <option key={exp} value={exp}>{exp}</option>
                  ))}
                </select>
              </div>

              <div className="relative col-span-2 sm:col-span-1">
                <select
                  value={selectedGender}
                  onChange={(e) => setSelectedGender(e.target.value)}
                  className={`w-full h-10 sm:h-11 px-2.5 sm:px-3 rounded-xl text-[11px] sm:text-xs font-bold outline-none cursor-pointer border transition-colors truncate ${
                    isDark
                      ? 'bg-white/[0.05] border-white/[0.1] text-slate-300 hover:bg-white/[0.08] focus:border-emerald-500'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200 focus:border-emerald-500'
                  }`}
                  title="Filter by Gender Requirement"
                >
                  <option value="All">All Genders</option>
                  {genderOptions.filter(g => g !== 'All').map(gen => (
                    <option key={gen} value={gen}>{gen}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
              <span>Showing <strong>{filteredJobs.length}</strong> matching positions</span>
              {(selectedSector !== 'All' || selectedDepartment !== 'All' || selectedLocation !== 'All' || selectedExperience !== 'All' || selectedGender !== 'All' || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSector('All');
                    setSelectedDepartment('All');
                    setSelectedLocation('All');
                    setSelectedExperience('All');
                    setSelectedGender('All');
                    setSearchQuery('');
                  }}
                  className="text-emerald-500 hover:text-emerald-400 font-bold underline cursor-pointer"
                >
                  Reset Filters
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {(selectedSector !== 'All' || selectedDepartment !== 'All' || selectedLocation !== 'All' || selectedExperience !== 'All' || selectedGender !== 'All' || searchQuery) && (
          <div className="flex items-center gap-2 flex-wrap mb-6 p-2.5 rounded-2xl border text-xs bg-emerald-500/[0.04] border-emerald-500/20">
            <span className="font-extrabold text-emerald-500 text-[11px]">Active Filters:</span>
            {selectedSector !== 'All' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-blue-500/15 text-blue-400 font-bold text-[11px]">
                Sector: {selectedSector}
                <button onClick={() => setSelectedSector('All')} className="hover:text-white"><X size={11} /></button>
              </span>
            )}
            {selectedDepartment !== 'All' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-400 font-bold text-[11px]">
                Dept: {selectedDepartment}
                <button onClick={() => setSelectedDepartment('All')} className="hover:text-white"><X size={11} /></button>
              </span>
            )}
            {selectedLocation !== 'All' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-teal-500/15 text-teal-400 font-bold text-[11px]">
                City: {selectedLocation}
                <button onClick={() => setSelectedLocation('All')} className="hover:text-white"><X size={11} /></button>
              </span>
            )}
            {selectedExperience !== 'All' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-purple-500/15 text-purple-400 font-bold text-[11px]">
                Exp: {selectedExperience}
                <button onClick={() => setSelectedExperience('All')} className="hover:text-white"><X size={11} /></button>
              </span>
            )}
            {selectedGender !== 'All' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-pink-500/15 text-pink-400 font-bold text-[11px]">
                Gender: {selectedGender}
                <button onClick={() => setSelectedGender('All')} className="hover:text-white"><X size={11} /></button>
              </span>
            )}
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-500/15 text-amber-400 font-bold text-[11px]">
                Search: "{searchQuery}"
                <button onClick={() => setSearchQuery('')} className="hover:text-white"><X size={11} /></button>
              </span>
            )}
            <button
              onClick={() => {
                setSelectedSector('All');
                setSelectedDepartment('All');
                setSelectedLocation('All');
                setSelectedExperience('All');
                setSelectedGender('All');
                setSearchQuery('');
              }}
              className="ml-auto text-[11px] font-bold text-rose-400 hover:text-rose-300 underline"
            >
              Reset All
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4.5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className={`h-64 rounded-2xl animate-pulse p-5 space-y-3.5 border ${isDark ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-white border-slate-200'}`}>
                <div className={`h-5 rounded w-2/3 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
                <div className={`h-3.5 rounded w-1/3 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
                <div className={`h-14 rounded w-full ${isDark ? 'bg-white/5' : 'bg-slate-100'}`} />
                <div className={`h-8 rounded w-1/2 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
              </div>
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className={`text-center py-16 rounded-3xl border p-8 space-y-4 max-w-lg mx-auto ${isDark ? 'bg-[#0a0a0a] border-white/[0.08]' : 'bg-white border-slate-200 shadow-lg'}`}>
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center mx-auto">
              <Briefcase size={28} />
            </div>
            <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>No active jobs found</h3>
            <p className={`text-xs max-w-sm mx-auto ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              There are currently no open positions matching your search or filters. Try adjusting your keywords or clearing filters.
            </p>
            <button
              onClick={() => { setSearchQuery(''); setSelectedSector('All'); setSelectedDepartment('All'); setSelectedJobType('All'); }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${isDark ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4.5">
            {filteredJobs.map((job) => {
              const deadlineStr = formatDeadlineDate(job.deadline);
              const skillsList = Array.isArray(job.skills) 
                ? job.skills 
                : typeof job.skills === 'string' 
                ? job.skills.split(',').map(s => s.trim()).filter(Boolean) 
                : [];

              const educationOptions = splitEducationRequirements(job.qualification || job.education || 'Diploma / Graduate');

              return (
                <div
                  key={job.id}
                  className={`group relative flex flex-col justify-between rounded-2xl border p-4.5 sm:p-5 transition-all duration-300 shadow-md hover:shadow-xl overflow-hidden ${
                    isDark 
                      ? 'bg-[#0d0d0d] border-white/[0.08] hover:border-emerald-500/40 hover:bg-[#111111]' 
                      : 'bg-white border-slate-200 hover:border-emerald-500/50 hover:shadow-emerald-500/10'
                  }`}
                >
                  <div className="absolute top-0 right-0 w-28 h-28 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all pointer-events-none" />

                  <div className="space-y-3 relative z-10">
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {job.jobNo && (
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-black uppercase tracking-wider ${
                            isDark ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border border-emerald-300 text-emerald-700'
                          }`}>
                            Job: {job.jobNo}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide border truncate max-w-[150px] ${
                          isDark ? 'bg-white/[0.04] border-white/10 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                        }`} title={job.industrySector || job.sector || 'General Sector'}>
                          <Layers size={10} className="inline mr-1 text-emerald-500 shrink-0" />
                          {job.industrySector || job.sector || 'General Sector'}
                        </span>
                      </div>

                      {job.accessCode && (
                        <div 
                          onClick={(e) => handleCopyCode(e, job.accessCode!)}
                          className={`text-[10px] font-mono font-extrabold px-2 py-0.5 rounded-lg border flex items-center gap-1 cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-xs shrink-0 ${
                            isDark ? 'bg-white/[0.05] border-white/10 text-slate-300 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                          }`}
                          title="Click to copy Access Code"
                        >
                          <span>Code: {job.accessCode}</span>
                          {copiedCode === job.accessCode ? (
                            <Check size={11} className="text-emerald-500" />
                          ) : (
                            <Copy size={10} className="text-slate-400" />
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <h2 className={`text-[15px] sm:text-base font-black transition-colors tracking-tight line-clamp-1 ${
                        isDark ? 'text-white group-hover:text-emerald-400' : 'text-slate-900 group-hover:text-emerald-600'
                      }`}>
                        {job.title}
                      </h2>

                      <div className="flex items-center gap-1.5 text-[11px] font-semibold mt-1 flex-wrap">
                        <span className="text-slate-400 font-medium inline-flex items-center gap-1 truncate max-w-[140px]">
                          <User className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">Posted by: <strong className={isDark ? 'text-slate-300' : 'text-slate-700'}>{job.entryBy || job.recruiterName || 'Recruiter'}</strong></span>
                        </span>
                        <span className="text-slate-400 select-none">•</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold inline-flex items-center gap-1 truncate max-w-[150px]">
                          <Briefcase className="w-3 h-3 text-emerald-500 shrink-0" />
                          <span className="truncate">{job.department || 'Accounts / Finance / Taxation'}</span>
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                      <div className={`p-2 rounded-xl border text-[10px] flex items-center gap-1.5 ${
                        isDark ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' : 'bg-emerald-50/70 border-emerald-200 text-emerald-900 font-bold'
                      }`}>
                        <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                        <div className="truncate min-w-0">
                          <span className="text-[9px] text-slate-400 block font-medium uppercase tracking-wider leading-none">Location</span>
                          <span className="truncate block font-bold leading-tight mt-0.5">{job.location || 'Ambad, Nashik'}</span>
                        </div>
                      </div>

                      <div className={`p-2 rounded-xl border text-[10px] flex items-center gap-1.5 ${
                        isDark ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300 font-bold' : 'bg-emerald-50/70 border-emerald-200 text-emerald-900 font-bold'
                      }`}>
                        <Briefcase className="w-3 h-3 text-emerald-500 shrink-0" />
                        <div className="truncate min-w-0">
                          <span className="text-[9px] text-slate-400 block font-medium uppercase tracking-wider leading-none">Experience</span>
                          <span className="truncate block font-bold leading-tight mt-0.5">{job.experience || '2 - 3 Yrs'}</span>
                        </div>
                      </div>

                      <div className={`p-2 rounded-xl border text-[10px] flex items-center gap-1.5 ${
                        isDark ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300 font-bold' : 'bg-emerald-50/70 border-emerald-200 text-emerald-900 font-bold'
                      }`}>
                        <User className="w-3 h-3 text-emerald-500 shrink-0" />
                        <div className="truncate min-w-0">
                          <span className="text-[9px] text-slate-400 block font-medium uppercase tracking-wider leading-none">Gender Req.</span>
                          <span className="truncate block font-bold leading-tight mt-0.5">
                            {job.genderRequirement && job.genderRequirement !== 'Any' ? job.genderRequirement : (job.gender && job.gender !== 'Any' ? job.gender : 'Female Only')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className={`p-2.5 rounded-xl border text-[10px] space-y-1.5 ${
                      isDark ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-slate-50/80 border-slate-200/90'
                    }`}>
                      <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-bold text-[9.5px] uppercase tracking-wider">
                        <GraduationCap className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span>Accepted Degrees / Trades:</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1">
                        {educationOptions.slice(0, 3).map((option, idx) => (
                          <span key={option + idx} className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-all inline-flex items-center ${
                            isDark
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-bold'
                              : 'bg-emerald-100/90 border-emerald-300 text-emerald-950 font-bold'
                          }`}>
                            <span className="truncate max-w-[160px]">{option}</span>
                          </span>
                        ))}
                        {educationOptions.length > 3 && (
                          <span className={`text-[9.5px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            +{educationOptions.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>

                    {job.description && (
                      <p className={`text-[11px] line-clamp-2 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        {getJobDescriptionSnippet(job.description, 120)}
                      </p>
                    )}

                    {skillsList.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {skillsList.slice(0, 3).map((skill, idx) => (
                          <span key={idx} className={`px-1.5 py-0.5 rounded text-[9.5px] font-medium border ${
                            isDark 
                              ? 'bg-white/[0.04] border-white/[0.06] text-slate-300' 
                              : 'bg-slate-100 border-slate-200 text-slate-700'
                          }`}>
                            {skill}
                          </span>
                        ))}
                        {skillsList.length > 3 && (
                          <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            +{skillsList.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className={`flex items-center justify-between gap-2 pt-3 mt-3 border-t relative z-10 ${isDark ? 'border-white/[0.06]' : 'border-slate-200'}`}>
                    <div className={`flex items-center gap-1 text-[10.5px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      <Calendar size={12} className="shrink-0" />
                      <span className="truncate">Closes: <strong className={isDark ? 'text-slate-300' : 'text-slate-700'}>{deadlineStr}</strong></span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setSelectedJobModal(job)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 border ${
                          isDark
                            ? 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.08] text-slate-300'
                            : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                        }`}
                      >
                        <Eye size={12} />
                        <span>Details</span>
                      </button>

                      <button
                        onClick={() => navigate(`/interview/${job.id}`)}
                        className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-[11px] font-bold text-white shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1 group/btn cursor-pointer"
                      >
                        <span>Apply</span>
                        <ArrowRight size={11} className="group-hover/btn:translate-x-0.5 transition-transform" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {selectedJobModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setSelectedJobModal(null)}>
          <div 
            className={`max-w-2xl w-full max-h-[85vh] rounded-3xl border p-6 sm:p-8 shadow-2xl overflow-y-auto space-y-6 transition-colors ${
              isDark ? 'bg-[#0d0d0d] border-white/[0.15] text-white' : 'bg-white border-slate-200 text-slate-900'
            }`} 
            onClick={e => e.stopPropagation()}
          >
            <div className={`flex items-start justify-between gap-4 border-b pb-5 ${isDark ? 'border-white/[0.1]' : 'border-slate-200'}`}>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {selectedJobModal.jobNo && (
                    <span className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-extrabold uppercase tracking-wider ${
                      isDark ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border border-emerald-300 text-emerald-700'
                    }`}>
                      Job No: {selectedJobModal.jobNo}
                    </span>
                  )}
                  <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider border ${
                    isDark ? 'bg-white/[0.05] border-white/10 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}>
                    {selectedJobModal.industrySector || selectedJobModal.sector || 'General Sector'}
                  </span>
                </div>
                <h2 className={`text-2xl font-extrabold mt-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>{selectedJobModal.title}</h2>
                <div className={`flex flex-wrap items-center gap-3 text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  <span>Posted by: <strong className={isDark ? 'text-slate-300' : 'text-slate-800'}>{selectedJobModal.entryBy || selectedJobModal.recruiterName || 'Recruiter'}</strong></span>
                  <span>·</span>
                  <span className="text-emerald-500 font-bold">{selectedJobModal.department || 'General'}</span>
                </div>
              </div>

              <button onClick={() => setSelectedJobModal(null)} className={`p-1 transition-colors ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}>
                <X size={20} />
              </button>
            </div>

            {selectedJobModal.accessCode && (
              <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md ${
                isDark 
                  ? 'bg-gradient-to-r from-emerald-600/15 via-teal-600/15 to-emerald-500/15 border-emerald-500/30' 
                  : 'bg-emerald-50 border-emerald-200'
              }`}>
                <div>
                  <span className={`block text-[10px] uppercase font-extrabold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Job Access Code
                  </span>
                  <span className="font-mono text-xl font-black text-emerald-500 dark:text-emerald-300 tracking-widest block mt-0.5">
                    {selectedJobModal.accessCode}
                  </span>
                </div>

                <button
                  onClick={(e) => handleCopyCode(e, selectedJobModal.accessCode!)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md shrink-0"
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

            <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl border text-xs ${
              isDark ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-slate-100/70 border-slate-200'
            }`}>
              <div>
                <span className={`block text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Location</span>
                <span className={`font-semibold block mt-0.5 truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{selectedJobModal.location || 'Ambad, Nashik'}</span>
              </div>
              <div>
                <span className={`block text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Experience</span>
                <span className={`font-semibold block mt-0.5 truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{selectedJobModal.experience || '2 - 3 Yrs'}</span>
              </div>
              <div>
                <span className={`block text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Gender Req.</span>
                <span className={`font-semibold block mt-0.5 truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{selectedJobModal.genderRequirement || selectedJobModal.gender || 'Female Only / Open'}</span>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border space-y-2 text-xs ${
              isDark ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center gap-1.5 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                <GraduationCap className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Accepted Degrees / Trades:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {splitEducationRequirements(selectedJobModal.qualification || selectedJobModal.education || 'Any Qualification').map((opt, i) => (
                  <span key={opt + i} className={`px-2.5 py-1 rounded-xl text-xs font-semibold border ${
                    isDark ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-emerald-100 border-emerald-300 text-emerald-900 font-bold'
                  }`}>
                    {opt}
                  </span>
                ))}
              </div>
            </div>

            {selectedJobModal.description && (
              <div className="space-y-2">
                <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Job Description & Responsibilities</h3>
                <div className={`text-xs whitespace-pre-line leading-relaxed p-4 rounded-2xl border max-h-60 overflow-y-auto ${
                  isDark ? 'bg-white/[0.02] border-white/[0.06] text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  <FormattedJobDescription description={selectedJobModal.description} className="max-w-full text-xs" />
                </div>
              </div>
            )}

            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t ${isDark ? 'border-white/[0.1]' : 'border-slate-200'}`}>
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Deadline: <strong className={isDark ? 'text-white' : 'text-slate-900'}>{formatDeadlineDate(selectedJobModal.deadline)}</strong>
              </span>

              <button
                onClick={() => { setSelectedJobModal(null); navigate(`/interview/${selectedJobModal.id}`); }}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-sm font-bold text-white shadow-xl shadow-emerald-600/30 transition-all flex items-center justify-center gap-2"
              >
                <span>Launch Interview & Apply</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

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
          <p>
            © {new Date().getFullYear()} InterviewXpert. All rights reserved. Powered by{' '}
            <a 
              href="https://snab.co.in" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline transition-colors"
            >
              SNAB Innovations
            </a>
          </p>
          <div className="flex items-center gap-4">
            <Link to="/career-hub" className="hover:text-emerald-500 transition-colors">Career Hub</Link>
            <Link to="/blogs" className="hover:text-emerald-500 transition-colors">Blogs</Link>
            <Link to="/contact" className="hover:text-emerald-500 transition-colors">Contact Us</Link>
            <Link to="/privacy-policy" className="hover:text-emerald-500 transition-colors">Privacy Policy</Link>
            <Link to="/terms-of-service" className="hover:text-emerald-500 transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default ActiveJobsPage;
