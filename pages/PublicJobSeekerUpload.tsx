import React, { useState, useEffect, useMemo } from 'react';
import { 
  Sparkles, CheckCircle2, Upload, FileText, User, Mail, Phone, MapPin, 
  Briefcase, GraduationCap, ArrowRight, RefreshCw, Plus, X, Tag, IndianRupee, 
  Clock, UserCheck, Search, Filter, Check, ChevronRight, AlertCircle, 
  ExternalLink, Eye, ShieldCheck, SlidersHorizontal, RotateCcw, Edit3, ChevronDown, ChevronUp, Ban, Sun, Moon,
  Layers, Menu, Save
} from 'lucide-react';
import { collection, query, where, getDocs, onSnapshot, doc, updateDoc, arrayUnion, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { LocationCityInput } from '../components/LocationCityInput';
import { EducationInput } from '../components/EducationInput';
import { parseResumeFileLocally, fastParseResumeFileLocally, readResumeText, saveResumeDumpCandidate } from '../services/resumeService';
import { uploadToCloudinary } from '../services/api';
import { ALL_EDUCATION_DEGREES } from '../data/allEducationDegrees';
import { MAHARASHTRA_CITIES } from '../data/maharashtraCities';
import { ALL_JOB_DOMAINS, ALL_JOB_SECTORS, ALL_JOB_DEPARTMENTS, detectDomainFromText, detectDomainsFromText, detectSectorsFromText, detectDepartmentsFromText } from '../data/jobDomains';
import { useMessageBox } from '../components/MessageBox';
import { useTheme } from '../context/ThemeContext';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import { calculateJobMatchScore, JobMatchResult, CandidateMatchProfile } from '../services/jobMatchService';
import { FormattedJobDescription } from '../utils/jobDescriptionFormatter';
import { splitEducationRequirements, checkSingleRequirementMatch } from '../utils/educationMatcher';

const matchExtractedLocationToPresentCity = (rawLocation: string): string => {
  if (!rawLocation || typeof rawLocation !== 'string') return '';
  const clean = rawLocation.trim().toLowerCase();
  if (!clean) return '';

  const cityMatch = MAHARASHTRA_CITIES.find(city => {
    const cityLower = city.toLowerCase();
    return clean.includes(cityLower) || cityLower.includes(clean);
  });
  if (cityMatch) return cityMatch;

  if (clean.includes('nasik') || clean.includes('nashik')) return 'Nashik';
  if (clean.includes('mumbai') || clean.includes('bombay')) return 'Mumbai';
  if (clean.includes('pune') || clean.includes('poona')) return 'Pune';
  if (clean.includes('nagpur')) return 'Nagpur';
  if (clean.includes('thane')) return 'Thane';
  if (clean.includes('aurangabad') || clean.includes('sambhajinagar')) return 'Chhatrapati Sambhajinagar (Aurangabad)';
  if (clean.includes('solapur') || clean.includes('sholapur')) return 'Solapur';
  if (clean.includes('kolhapur')) return 'Kolhapur';
  if (clean.includes('amravati')) return 'Amravati';
  if (clean.includes('jalgaon')) return 'Jalgaon';
  if (clean.includes('nanded')) return 'Nanded';
  if (clean.includes('sangli')) return 'Sangli';
  if (clean.includes('latur')) return 'Latur';
  if (clean.includes('dhule')) return 'Dhule';
  if (clean.includes('ahmednagar')) return 'Ahmednagar';
  if (clean.includes('satara')) return 'Satara';

  return '';
};

export default function PublicJobSeekerUpload() {
  const messageBox = useMessageBox();
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  // Mobile Navbar Drawer State
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Form State
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [candidatePhone, setCandidatePhone] = useState('');
  const [candidateGender, setCandidateGender] = useState('');
  const [candidateMaritalStatus, setCandidateMaritalStatus] = useState('');
  const [candidateLocation, setCandidateLocation] = useState('');
  const [candidateState, setCandidateState] = useState('Maharashtra');
  const [candidateSectors, setCandidateSectors] = useState<string[]>([]);
  const [candidateDepartments, setCandidateDepartments] = useState<string[]>([]);
  const [candidateDomains, setCandidateDomains] = useState<string[]>([]);
  const [candidateDomain, setCandidateDomain] = useState('');
  const [candidateExp, setCandidateExp] = useState('');

  const toggleSector = (sectorName: string) => {
    setCandidateSectors(prev => {
      let updated: string[];
      if (prev.some(s => s.toLowerCase() === sectorName.toLowerCase())) {
        updated = prev.filter(s => s.toLowerCase() !== sectorName.toLowerCase());
      } else {
        if (prev.length >= 5) {
          messageBox.showError("You can select a maximum of 5 Target Industry Sectors.");
          return prev;
        }
        updated = [...prev, sectorName];
      }
      const combined = Array.from(new Set([...updated, ...candidateDepartments]));
      setCandidateDomains(combined);
      setCandidateDomain(combined.join(', '));
      return updated;
    });
  };

  const toggleDepartment = (deptName: string) => {
    setCandidateDepartments(prev => {
      let updated: string[];
      if (prev.some(d => d.toLowerCase() === deptName.toLowerCase())) {
        updated = prev.filter(d => d.toLowerCase() !== deptName.toLowerCase());
      } else {
        if (prev.length >= 5) {
          messageBox.showError("You can select a maximum of 5 Functional Departments.");
          return prev;
        }
        updated = [...prev, deptName];
      }
      const combined = Array.from(new Set([...candidateSectors, ...updated]));
      setCandidateDomains(combined);
      setCandidateDomain(combined.join(', '));
      return updated;
    });
  };

  const toggleDomain = (domainName: string) => {
    setCandidateDomains(prev => {
      let updated: string[];
      if (prev.includes(domainName)) {
        updated = prev.filter(d => d !== domainName);
      } else {
        updated = [...prev, domainName];
      }
      setCandidateDomain(updated.join(', '));
      return updated;
    });
  };
  const [candidateEducation, setCandidateEducation] = useState('');
  const [candidateEmploymentStatus, setCandidateEmploymentStatus] = useState('Working');
  const [candidateNoticePeriodVal, setCandidateNoticePeriodVal] = useState('30');
  const [candidateNoticePeriodUnit, setCandidateNoticePeriodUnit] = useState<'Days' | 'Months'>('Days');
  const [candidateCurrentSalary, setCandidateCurrentSalary] = useState('');
  const [candidateExpectedSalary, setCandidateExpectedSalary] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extraBioText, setExtraBioText] = useState('');

  // Email Autocheck State for existing candidates
  const [existingEmailCandidate, setExistingEmailCandidate] = useState<any | null>(null);
  const [isCheckingEmailBlur, setIsCheckingEmailBlur] = useState(false);

  // Skills Auto-Fetch & Editing State
  const [extractedSkills, setExtractedSkills] = useState<string[]>([]);
  const [newSkillInput, setNewSkillInput] = useState('');
  const [isParsingResume, setIsParsingResume] = useState(false);
  const [parsedProfileData, setParsedProfileData] = useState<{ profile: any; resumeText: string } | null>(null);

  // Email Lookup State for Existing Submitted Candidates
  const [showEmailLookup, setShowEmailLookup] = useState(false);
  const [lookupEmailInput, setLookupEmailInput] = useState('');
  const [isSearchingEmail, setIsSearchingEmail] = useState(false);

  // Processing & Success State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittedSuccess, setIsSubmittedSuccess] = useState(false);
  const [submittedCandidateData, setSubmittedCandidateData] = useState<CandidateMatchProfile | null>(null);
  const [originalCandidateData, setOriginalCandidateData] = useState<CandidateMatchProfile | null>(null);

  // Criteria Editor Toggle on Results View
  const [showCriteriaEditor, setShowCriteriaEditor] = useState(false);
  const [resultSkillInput, setResultSkillInput] = useState('');

  // Active Jobs & Matching State
  const [activeJobs, setActiveJobs] = useState<any[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [selectedJobForModal, setSelectedJobForModal] = useState<JobMatchResult | null>(null);
  const [matchFilter, setMatchFilter] = useState<'EligibleOnly' | 'All' | 'HighMatch' | 'LocalCity'>('EligibleOnly');

  // Candidate Application Modal & State
  const [applyingJobModal, setApplyingJobModal] = useState<JobMatchResult | null>(null);
  const [applyName, setApplyName] = useState('');
  const [applyEmail, setApplyEmail] = useState('');
  const [applyPhone, setApplyPhone] = useState('');
  const [isSubmittingApplication, setIsSubmittingApplication] = useState(false);

  // Auto-Restore Draft Form State & Submitted Match Results on Page Refresh
  useEffect(() => {
    try {
      const savedDraft = sessionStorage.getItem('dsource_candidate_draft_form');
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed.name) setCandidateName(parsed.name);
        if (parsed.email) setCandidateEmail(parsed.email);
        if (parsed.phone) setCandidatePhone(parsed.phone);
        if (parsed.gender) setCandidateGender(parsed.gender);
        if (parsed.location) setCandidateLocation(parsed.location);
        if (Array.isArray(parsed.domains)) {
          setCandidateDomains(parsed.domains);
          setCandidateDomain(parsed.domains.join(', '));
        } else if (parsed.domain) {
          const doms = parsed.domain.split(', ').filter(Boolean);
          setCandidateDomains(doms);
          setCandidateDomain(parsed.domain);
        }
        if (parsed.exp) setCandidateExp(parsed.exp);
        if (parsed.education) setCandidateEducation(parsed.education);
        if (parsed.status) setCandidateEmploymentStatus(parsed.status);
        if (parsed.noticeVal) setCandidateNoticePeriodVal(parsed.noticeVal);
        if (parsed.noticeUnit) setCandidateNoticePeriodUnit(parsed.noticeUnit);
        if (parsed.currentSalary) setCandidateCurrentSalary(parsed.currentSalary);
        if (parsed.expectedSalary) setCandidateExpectedSalary(parsed.expectedSalary);
        if (Array.isArray(parsed.skills) && parsed.skills.length > 0) setExtractedSkills(parsed.skills);
        if (parsed.extraBioText) setExtraBioText(parsed.extraBioText);
      }

      const savedSubmitted = sessionStorage.getItem('dsource_candidate_submitted_data');
      if (savedSubmitted) {
        const parsedSubmitted = JSON.parse(savedSubmitted);
        if (parsedSubmitted && (parsedSubmitted.email || parsedSubmitted.name)) {
          setSubmittedCandidateData(parsedSubmitted);
          setOriginalCandidateData(parsedSubmitted);
          if (Array.isArray(parsedSubmitted.domains)) {
            setCandidateDomains(parsedSubmitted.domains);
            setCandidateDomain(parsedSubmitted.domains.join(', '));
          } else if (parsedSubmitted.domain) {
            setCandidateDomains(parsedSubmitted.domain.split(', ').filter(Boolean));
            setCandidateDomain(parsedSubmitted.domain);
          }
          setIsSubmittedSuccess(true);
        }
      }
    } catch (err) {
      console.warn("Auto restore candidate draft error:", err);
    }
  }, []);

  // Persist Form Draft Inputs on Every Field Update
  useEffect(() => {
    try {
      if (candidateName || candidateEmail || candidatePhone || selectedFile) {
        const draft = {
          name: candidateName,
          email: candidateEmail,
          phone: candidatePhone,
          gender: candidateGender,
          location: candidateLocation,
          domains: candidateDomains,
          domain: candidateDomains.join(', '),
          exp: candidateExp,
          education: candidateEducation,
          status: candidateEmploymentStatus,
          noticeVal: candidateNoticePeriodVal,
          noticeUnit: candidateNoticePeriodUnit,
          currentSalary: candidateCurrentSalary,
          expectedSalary: candidateExpectedSalary,
          skills: extractedSkills,
          extraBioText: extraBioText,
        };
        sessionStorage.setItem('dsource_candidate_draft_form', JSON.stringify(draft));
      }
    } catch (err) {
      console.warn("Save candidate draft error:", err);
    }
  }, [
    candidateName, candidateEmail, candidatePhone, candidateGender, candidateLocation, candidateDomains,
    candidateExp, candidateEducation, candidateEmploymentStatus, candidateNoticePeriodVal,
    candidateNoticePeriodUnit, candidateCurrentSalary, candidateExpectedSalary, extractedSkills, extraBioText
  ]);

  // Persist Matched Candidate Results State on Form Submission
  useEffect(() => {
    if (submittedCandidateData) {
      try {
        sessionStorage.setItem('dsource_candidate_submitted_data', JSON.stringify(submittedCandidateData));
      } catch (err) {
        console.warn("Save submitted data error:", err);
      }
    }
  }, [submittedCandidateData]);

  const handleOpenApplyModal = (matchResult: JobMatchResult) => {
    setApplyingJobModal(matchResult);
    setApplyName(submittedCandidateData?.name || candidateName || '');
    setApplyEmail(submittedCandidateData?.email || candidateEmail || '');
    setApplyPhone(submittedCandidateData?.phone || candidatePhone || '');
  };

  const handleConfirmApplicationAndStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyingJobModal) return;

    const name = applyName.trim();
    const email = applyEmail.trim().toLowerCase();
    const phone = applyPhone.trim();

    if (!name) {
      messageBox.showError("Please enter your Full Name.");
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      messageBox.showError("Please enter a valid Email Address.");
      return;
    }
    if (!phone) {
      messageBox.showError("Please enter your Mobile / WhatsApp Phone Number.");
      return;
    }

    setIsSubmittingApplication(true);
    const job = applyingJobModal.job;

    try {
      // 1. Record candidate application in Firestore interviews collection
      const intRef = doc(db, 'interviews', job.id);
      await updateDoc(intRef, {
        candidateEmails: arrayUnion(email),
        candidateData: arrayUnion({
          name,
          email,
          phone,
          appliedAt: new Date().toISOString(),
          status: 'interested',
          source: 'public_job_match'
        })
      });

      // 2. Add application document to candidateApplications collection
      try {
        await addDoc(collection(db, 'candidateApplications'), {
          interviewId: job.id,
          jobTitle: job.title || '',
          candidateName: name,
          candidateEmail: email,
          candidatePhone: phone,
          recruiterUID: job.recruiterUID || job.createdBy?.uid || '',
          status: 'pending',
          appliedAt: serverTimestamp(),
          source: 'public_job_match'
        });
      } catch (appErr) {
        console.warn("candidateApplications save fallback:", appErr);
      }

      sessionStorage.setItem(`direct_bypass_${job.id}`, 'true');
      const codeParam = job.accessCode ? `?code=${encodeURIComponent(job.accessCode)}&direct=true` : '?direct=true';
      messageBox.showSuccess(`Application registered for ${job.title}! Opening your interview directly...`);
      setApplyingJobModal(null);
      navigate(`/interview/${job.id}${codeParam}`);
    } catch (err: any) {
      console.error("Application Submit Error:", err);
      sessionStorage.setItem(`direct_bypass_${job.id}`, 'true');
      const codeParam = job.accessCode ? `?code=${encodeURIComponent(job.accessCode)}&direct=true` : '?direct=true';
      navigate(`/interview/${job.id}${codeParam}`);
    } finally {
      setIsSubmittingApplication(false);
    }
  };

  // Check email on blur/typing to automatically inform candidate if they already submitted
  const handleCheckEmailExists = async (emailVal: string) => {
    const cleanEmail = emailVal.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setExistingEmailCandidate(null);
      return;
    }

    setIsCheckingEmailBlur(true);
    try {
      const q = query(collection(db, 'resumeDumpCandidates'), where('email', '==', cleanEmail));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const found = snap.docs[0].data();
        setExistingEmailCandidate({ id: snap.docs[0].id, ...found });
      } else {
        setExistingEmailCandidate(null);
      }
    } catch (err) {
      console.warn("Email exists check warning:", err);
    } finally {
      setIsCheckingEmailBlur(false);
    }
  };

  // Load existing profile from email match
  const handleLoadExistingProfile = (candData: any) => {
    const existingDoms: string[] = Array.isArray(candData.domains)
      ? candData.domains
      : (candData.domain ? candData.domain.split(', ').filter(Boolean) : (candidateDomains.length > 0 ? candidateDomains : detectDomainsFromText(candData.resumeText || candData.title || '')));
    
    if (existingDoms.length > 0) {
      setCandidateDomains(existingDoms);
      setCandidateDomain(existingDoms.join(', '));
    }

    const profileObj: CandidateMatchProfile = {
      name: candData.name || candData.profile?.name || candidateName || 'Job Seeker',
      email: candData.email || candidateEmail.trim().toLowerCase(),
      phone: candData.phone || candData.profile?.phone || candidatePhone,
      gender: candData.gender || candData.profile?.gender || candidateGender || 'Any',
      location: candData.location || candData.profile?.location || candidateLocation || 'Nashik',
      domain: existingDoms.join(', '),
      domains: existingDoms,
      experience: candData.experienceYears || candData.totalExperienceYears || candData.experience || candidateExp || 0,
      totalExperienceYears: candData.experienceYears || candData.totalExperienceYears || candData.experience || candidateExp || 0,
      education: candData.highestEducation || candData.education || (candData.profile?.education ? candData.profile.education[0]?.degree : candidateEducation) || 'Graduate',
      highestEducation: candData.highestEducation || (candData.profile?.education ? candData.profile.education[0]?.degree : candidateEducation) || 'Graduate',
      employmentStatus: candData.employmentStatus || candidateEmploymentStatus || 'Working',
      noticePeriod: candData.noticePeriod || `${candidateNoticePeriodVal} ${candidateNoticePeriodUnit}`,
      currentSalary: candData.currentSalary || candidateCurrentSalary || 'As per Industry',
      expectedSalary: candData.expectedSalary || candidateExpectedSalary || 'As per Industry',
      skills: candData.skills || candData.profile?.skills || extractedSkills || [],
      resumeText: candData.resumeText || candData.additionalText || '',
      resumeUrl: candData.resumeUrl || ''
    };

    setSubmittedCandidateData(profileObj);
    setOriginalCandidateData({ ...profileObj });
    setIsSubmittedSuccess(true);
    messageBox.showSuccess(`Welcome back, ${profileObj.name}! Your existing profile has been loaded and matched with active job openings.`);
  };

  // Fetch active jobs from Firestore interviews and jobs collection
  useEffect(() => {
    let activeInterviewsList: any[] = [];
    let activeJobsList: any[] = [];

    const mergeJobs = () => {
      const allRaw = [...activeInterviewsList, ...activeJobsList];
      const seenIds = new Set<string>();
      const combined: any[] = [];

      for (const item of allRaw) {
        if (!item || !item.id || seenIds.has(item.id)) continue;
        seenIds.add(item.id);

        const statusLower = String(item.status || '').trim().toLowerCase();
        if (['inactive', 'expired', 'closed', 'disabled', 'deactivated', 'draft'].includes(statusLower)) {
          continue;
        }
        if (item.isMock) continue;

        combined.push(item);
      }

      setActiveJobs(combined);
      setJobsLoading(false);
    };

    const qInterviews = query(collection(db, 'interviews'));
    const parseExpMinMax = (data: any) => {
      let min = 0;
      let max = 0;
      if (data.minExperience !== undefined && data.minExperience !== null && !isNaN(Number(data.minExperience))) {
        min = Math.max(0, Number(data.minExperience));
      }
      if (data.maxExperience !== undefined && data.maxExperience !== null && !isNaN(Number(data.maxExperience))) {
        max = Math.max(0, Number(data.maxExperience));
      }
      const rawStr = String(data.experience || data.minExperience || '').trim();
      if (min === 0 && rawStr) {
        const rangeMatch = rawStr.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/i);
        if (rangeMatch) {
          min = parseFloat(rangeMatch[1]) || 0;
          max = parseFloat(rangeMatch[2]) || 0;
        } else {
          const singleMatch = rawStr.match(/(\d+(?:\.\d+)?)/);
          if (singleMatch && !/fresher|0\s*yr/i.test(rawStr)) {
            min = parseFloat(singleMatch[1]) || 0;
          }
        }
      }
      return { minExperience: min, maxExperience: max, experience: rawStr || (min > 0 ? (max > min ? `${min} - ${max} Yrs` : `${min}+ Yrs`) : 'Fresher / Any Experience') };
    };

    const unsubInterviews = onSnapshot(qInterviews, (snapshot) => {
      activeInterviewsList = snapshot.docs.map((doc) => {
        const data = doc.data();
        const jobNo = data.jobNo ? String(data.jobNo).trim() : '';
        const accessCode = jobNo || data.accessCode || doc.id.slice(0, 6).toUpperCase();
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
        const parsedExp = parseExpMinMax(data);

        return {
          id: doc.id,
          jobNo,
          title: data.title || 'Untitled Job Role',
          company: data.company || data.companyName || 'DSource Partner',
          recruiterName: resolvedEntryBy,
          entryBy: resolvedEntryBy,
          description: data.description || data.jobDescription || '',
          industrySector: data.industrySector || data.sector || data.industryName || data.industry || '',
          sector: data.sector || data.industrySector || data.industryName || '',
          department: data.department || data.roleCategory || data.category || 'General',
          departments: data.departments || [data.department || data.roleCategory || data.category || 'General'],
          roleCategory: data.roleCategory || data.roleName || '',
          location: data.location || (data.city && data.state ? `${data.city}, ${data.state}` : data.city || 'Nashik, Maharashtra'),
          city: data.city || data.location || 'Nashik',
          genderRequirement: data.genderRequirement || data.gender || data.genderPreference || 'Any',
          gender: data.gender || data.genderRequirement || 'Any',
          employmentType: data.employmentType || data.jobType || 'Full-Time',
          salary: data.salary || data.salaryRange || (data.minSalary && data.maxSalary ? `₹${data.minSalary} - ₹${data.maxSalary} / month` : 'Competitive CTC'),
          minSalary: data.minSalary,
          maxSalary: data.maxSalary,
          minExperience: parsedExp.minExperience,
          maxExperience: parsedExp.maxExperience,
          experience: parsedExp.experience,
          qualification: data.qualification || data.education || data.qualifications || 'Diploma / Graduate',
          education: data.education || data.qualification || data.qualifications || 'Diploma / Graduate',
          skills: data.skills || [],
          accessCode,
          status: data.status || 'Active',
          deadline: data.deadline || data.applyDeadline,
          isMock: Boolean(data.isMock)
        };
      });
      mergeJobs();
    }, (error) => {
      console.error('Error fetching interviews for matching:', error);
      setJobsLoading(false);
    });

    const qJobs = query(collection(db, 'jobs'));
    const unsubJobs = onSnapshot(qJobs, (snapshot) => {
      activeJobsList = snapshot.docs.map((doc) => {
        const data = doc.data();
        const jobNo = data.jobNo ? String(data.jobNo).trim() : '';
        const accessCode = jobNo || data.accessCode || doc.id.slice(0, 6).toUpperCase();
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
        const parsedExp = parseExpMinMax(data);

        return {
          id: doc.id,
          jobNo,
          title: data.title || 'Untitled Job Role',
          company: data.company || data.companyName || 'DSource Partner',
          recruiterName: resolvedEntryBy,
          entryBy: resolvedEntryBy,
          description: data.description || data.jobDescription || '',
          industrySector: data.industrySector || data.sector || data.industryName || data.industry || '',
          sector: data.sector || data.industrySector || data.industryName || '',
          department: data.department || data.roleCategory || data.category || 'General',
          departments: data.departments || [data.department || data.roleCategory || data.category || 'General'],
          roleCategory: data.roleCategory || data.roleName || '',
          location: data.location || (data.city && data.state ? `${data.city}, ${data.state}` : data.city || 'Nashik, Maharashtra'),
          city: data.city || data.location || 'Nashik',
          genderRequirement: data.genderRequirement || data.gender || data.genderPreference || 'Any',
          gender: data.gender || data.genderRequirement || 'Any',
          employmentType: data.employmentType || data.jobType || 'Full-Time',
          salary: data.salary || data.salaryRange || (data.minSalary && data.maxSalary ? `₹${data.minSalary} - ₹${data.maxSalary} / month` : 'Competitive CTC'),
          minSalary: data.minSalary,
          maxSalary: data.maxSalary,
          minExperience: parsedExp.minExperience,
          maxExperience: parsedExp.maxExperience,
          experience: parsedExp.experience,
          qualification: data.qualification || data.education || data.qualifications || 'Diploma / Graduate',
          education: data.education || data.qualification || data.qualifications || 'Diploma / Graduate',
          skills: data.skills || [],
          accessCode,
          status: data.status || 'Active',
          deadline: data.deadline || data.applyDeadline,
          isMock: Boolean(data.isMock)
        };
      });
      mergeJobs();
    }, (error) => {
      console.warn('Jobs collection fetch note:', error);
    });

    return () => {
      unsubInterviews();
      unsubJobs();
    };
  }, []);

  // Compute matched jobs dynamically whenever submittedCandidateData changes
  const matchedJobsList: JobMatchResult[] = useMemo(() => {
    if (!submittedCandidateData || activeJobs.length === 0) return [];
    
    const results = activeJobs.map(job => calculateJobMatchScore(job, submittedCandidateData));
    
    // STRICT ELIGIBILITY: Filter out any job where candidate criteria is unmet (education qualification/specialization mismatch, experience mismatch, gender mismatch, etc.)
    const eligibleResults = results.filter(r => r.eduMatch.isMatch && r.expMatch.isMatch && r.genderMatch.isMatch && r.overallScore > 0);

    eligibleResults.sort((a, b) => b.overallScore - a.overallScore);

    if (matchFilter === 'EligibleOnly') {
      return eligibleResults;
    }
    if (matchFilter === 'HighMatch') {
      const high = eligibleResults.filter(r => r.overallScore >= 60);
      return high.length > 0 ? high : eligibleResults;
    }
    if (matchFilter === 'LocalCity' && submittedCandidateData.location) {
      const candCity = submittedCandidateData.location.toLowerCase();
      const local = eligibleResults.filter(r => 
        r.locationMatch.isMatch || 
        (r.job.location && r.job.location.toLowerCase().includes(candCity)) ||
        (r.job.city && r.job.city.toLowerCase().includes(candCity))
      );
      return local.length > 0 ? local : eligibleResults;
    }

    return eligibleResults;
  }, [submittedCandidateData, activeJobs, matchFilter]);

  // Combine domains: Domains present in active posted jobs appear FIRST, remaining domains follow afterwards
  const availableDomainsList = useMemo(() => {
    // 1. Find all active job departments/categories & matched domain names from active posted jobs
    const activeDeptsSet = new Set<string>();
    activeJobs.forEach(job => {
      const dept = (job.department || job.category || job.roleCategory || '').trim();
      if (dept && dept.toLowerCase() !== 'general') {
        activeDeptsSet.add(dept.toLowerCase());
      }
      if (job.title) {
        ALL_JOB_DOMAINS.forEach(d => {
          if (d.keywords.some(k => job.title.toLowerCase().includes(k))) {
            activeDeptsSet.add(d.name.toLowerCase());
          }
        });
      }
    });

    const activeDomainObjs: JobDomain[] = [];
    const addedSet = new Set<string>();

    // Add standard domains that have active posted jobs FIRST
    ALL_JOB_DOMAINS.forEach(d => {
      const nameLower = d.name.toLowerCase();
      const isPresentInJobs = activeDeptsSet.has(nameLower) || d.keywords.some(k => activeDeptsSet.has(k));
      if (isPresentInJobs) {
        activeDomainObjs.push(d);
        addedSet.add(nameLower);
      }
    });

    // Add any custom job departments present in active jobs that are not in standard domains
    activeJobs.forEach(job => {
      const dept = (job.department || job.category || job.roleCategory || '').trim();
      if (dept && dept.toLowerCase() !== 'general' && !addedSet.has(dept.toLowerCase())) {
        addedSet.add(dept.toLowerCase());
        activeDomainObjs.push({
          id: dept.toLowerCase().replace(/[^a-z0-9]/g, '_'),
          name: dept,
          category: 'Active Job Roles',
          keywords: [dept.toLowerCase()]
        });
      }
    });

    // Add remaining standard domains AFTERWARDS
    const remainingDomainObjs: JobDomain[] = [];
    ALL_JOB_DOMAINS.forEach(d => {
      if (!addedSet.has(d.name.toLowerCase())) {
        remainingDomainObjs.push(d);
      }
    });

    return [...activeDomainObjs, ...remainingDomainObjs];
  }, [activeJobs]);

  const [isSavingCriteria, setIsSavingCriteria] = useState(false);

  const handleSaveUpdatedCriteriaToResumeDump = async () => {
    if (!submittedCandidateData) return;
    setIsSavingCriteria(true);
    try {
      const activeDoms = submittedCandidateData.domains || candidateDomains;
      const targetDomainStr = activeDoms.join(', ');

      const updatedProfile = {
        name: submittedCandidateData.name || candidateName || 'Job Seeker',
        email: (submittedCandidateData.email || candidateEmail).trim().toLowerCase(),
        phone: submittedCandidateData.phone || candidatePhone,
        gender: submittedCandidateData.gender || candidateGender,
        location: submittedCandidateData.location || candidateLocation,
        domains: activeDoms,
        preferredDomains: activeDoms,
        domain: targetDomainStr,
        experienceYears: submittedCandidateData.experience || 0,
        totalExperienceYears: submittedCandidateData.experience || 0,
        experience: submittedCandidateData.experience || 0,
        highestEducation: submittedCandidateData.education || submittedCandidateData.highestEducation || 'Graduate',
        education: [
          { degree: submittedCandidateData.education || submittedCandidateData.highestEducation || 'Graduate', institution: 'Candidate Specified', year: '' }
        ],
        skills: submittedCandidateData.skills || extractedSkills || [],
        employmentStatus: submittedCandidateData.employmentStatus || 'Working',
        noticePeriod: submittedCandidateData.noticePeriod || '30 Days',
        currentSalary: submittedCandidateData.currentSalary || 'As per industry',
        expectedSalary: submittedCandidateData.expectedSalary || 'As per industry',
        isPublicUpload: true,
        isPublicCandidate: true,
        isGlobalPublicCandidate: true,
      };

      await saveResumeDumpCandidate({
        recruiterUID: 'DSOURCE_PUBLIC_JOB_SEEKER_POOL',
        teamId: 'DSOURCE_TALENT_ROSTER',
        createdBy: {
          uid: 'PUBLIC_CANDIDATE',
          name: updatedProfile.name,
          email: updatedProfile.email,
          role: 'job_seeker'
        },
        profile: updatedProfile,
        resumeText: submittedCandidateData.resumeText || extraBioText || '',
        resumeUrl: submittedCandidateData.resumeUrl || 'https://via.placeholder.com/150',
        fileName: submittedCandidateData.fileName || 'resume.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        additionalText: extraBioText.trim(),
        source: 'public_job_seeker_upload'
      });

      // Update sessionStorage so state persists on page refresh
      sessionStorage.setItem('dsource_candidate_submitted_data', JSON.stringify(submittedCandidateData));

      messageBox.showSuccess(`Updated domains (${targetDomainStr || 'Selected'}) & criteria saved to your profile and resume dump!`);
    } catch (err: any) {
      console.error("Save updated criteria error:", err);
      messageBox.showError("Failed to save updated criteria. Please try again.");
    } finally {
      setIsSavingCriteria(false);
    }
  };

  // Dynamic Live Criteria Updates
  const handleUpdateCandidateCriteria = (field: string, value: any) => {
    setSubmittedCandidateData(prev => {
      if (!prev) return null;
      const updated = { ...prev, [field]: value };

      if (field === 'experience') {
        const numVal = parseFloat(value) || 0;
        updated.experience = numVal;
        updated.experienceYears = numVal;
        updated.totalExperienceYears = numVal;
      }
      if (field === 'education') {
        updated.highestEducation = value;
      }
      if (field === 'domains' || field === 'domain') {
        if (Array.isArray(value)) {
          updated.domains = value;
          updated.preferredDomains = value;
          updated.domain = value.join(', ');
        } else if (typeof value === 'string') {
          const list = value.split(', ').filter(Boolean);
          updated.domains = list;
          updated.preferredDomains = list;
          updated.domain = value;
        }
      }

      return updated;
    });
  };

  const handleAddSkillToResults = () => {
    const trimmed = resultSkillInput.trim();
    if (!trimmed || !submittedCandidateData) return;
    const currentSkills = submittedCandidateData.skills || [];
    if (currentSkills.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      messageBox.showError(`"${trimmed}" is already added.`);
      return;
    }
    handleUpdateCandidateCriteria('skills', [...currentSkills, trimmed]);
    setResultSkillInput('');
    messageBox.showSuccess(`Added "${trimmed}" to skill criteria.`);
  };

  const handleRemoveSkillFromResults = (skillToRemove: string) => {
    if (!submittedCandidateData) return;
    const currentSkills = submittedCandidateData.skills || [];
    handleUpdateCandidateCriteria('skills', currentSkills.filter(s => s !== skillToRemove));
  };

  const handleResetToOriginalCriteria = () => {
    if (originalCandidateData) {
      setSubmittedCandidateData({ ...originalCandidateData });
      messageBox.showSuccess("Reset criteria to original resume profile.");
    }
  };

  // Handle file selection & fast local text analysis with email-first lookup
  const handleFileSelection = async (file: File) => {
    setSelectedFile(file);
    setIsParsingResume(true);
    try {
      // 1. Fast read raw text from resume (< 100ms)
      const rawResumeText = await readResumeText(file, file.name);
      if (!rawResumeText) throw new Error('No readable text was found in this resume.');

      // 2. Extract email immediately via regex to perform instant returning candidate check
      const rawEmailMatch = rawResumeText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
      const cleanExtractedEmail = rawEmailMatch ? rawEmailMatch[1].trim().toLowerCase() : '';

      // 3. If email is already present in database, SKIP ALL AI PARSING and load existing profile instantly!
      if (cleanExtractedEmail) {
        try {
          const q = query(collection(db, 'resumeDumpCandidates'), where('email', '==', cleanExtractedEmail));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const matchedCand: any = { id: snap.docs[0].id, ...snap.docs[0].data() };
            setCandidateEmail(cleanExtractedEmail);
            handleLoadExistingProfile(matchedCand);
            messageBox.showSuccess(`Welcome back, ${matchedCand.name || matchedCand.profile?.name || 'Job Seeker'}! We found your existing profile registered under ${cleanExtractedEmail}. Showing your best matched job openings.`);
            setIsParsingResume(false);
            return;
          }
        } catch (lookupErr) {
          console.warn("Fast email registration check error:", lookupErr);
        }
      }

      // 4. For new candidates, perform high-speed skill & profile parsing
      const ingested = await fastParseResumeFileLocally(file, {}, extraBioText);
      setParsedProfileData(ingested);

      if (ingested.profile) {
        if (ingested.profile.name && !candidateName.trim()) setCandidateName(ingested.profile.name);
        if (cleanExtractedEmail && !candidateEmail.trim()) {
          setCandidateEmail(cleanExtractedEmail);
          handleCheckEmailExists(cleanExtractedEmail);
        } else if (ingested.profile.email && !candidateEmail.trim()) {
          const emailVal = ingested.profile.email.trim().toLowerCase();
          setCandidateEmail(emailVal);
          handleCheckEmailExists(emailVal);
        }

        if (ingested.profile.phone && !candidatePhone.trim()) setCandidatePhone(ingested.profile.phone);

        if (ingested.profile.education && ingested.profile.education.length > 0) {
          const degree = ingested.profile.education[0]?.degree;
          if (degree && !candidateEducation.trim()) {
            setCandidateEducation(degree);
          }
        }

        // Note: Location, Experience, Industry Sectors, and Functional Departments are intentionally NOT autofilled so that candidate must fill/select them manually.

        if (Array.isArray(ingested.profile.skills) && ingested.profile.skills.length > 0) {
          setExtractedSkills(ingested.profile.skills);
          messageBox.showSuccess(`Resume attached! Skills auto-detected. Please fill in your Location, Experience, Industry Sectors, and Departments below.`);
        } else {
          messageBox.showSuccess("Resume attached. Please fill in your Location, Experience, Industry Sectors, and Departments below.");
        }
      }
    } catch (err: any) {
      console.error("Resume Local Parsing Error:", err);
      messageBox.showInfo("Resume attached. Please fill in your mandatory Location, Experience, Industry Sectors, and Departments below.");
    } finally {
      setIsParsingResume(false);
    }
  };

  // Handle Returning Candidate Email Lookup
  const handleLookupEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = lookupEmailInput.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      messageBox.showError("Please enter a valid email address.");
      return;
    }

    setIsSearchingEmail(true);
    try {
      const q = query(collection(db, 'resumeDumpCandidates'), where('email', '==', cleanEmail));
      const snap = await getDocs(q);

      if (snap.empty) {
        messageBox.showError(`No registered resume profile found for "${cleanEmail}". Please submit your resume below to get instant job recommendations.`);
        setIsSearchingEmail(false);
        return;
      }

      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const matchedCand: any = docs[0];
      handleLoadExistingProfile(matchedCand);
    } catch (err: any) {
      console.error("Email Lookup Error:", err);
      messageBox.showError("Failed to lookup email. Please try again or fill out the form below.");
    } finally {
      setIsSearchingEmail(false);
    }
  };

  const handleAddSkill = () => {
    const trimmed = newSkillInput.trim();
    if (!trimmed) return;
    if (extractedSkills.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      messageBox.showError(`"${trimmed}" is already added.`);
      return;
    }
    setExtractedSkills(prev => [...prev, trimmed]);
    setNewSkillInput('');
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setExtractedSkills(prev => prev.filter(s => s !== skillToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!candidateName.trim()) {
      messageBox.showError("Please enter your Full Name.");
      return;
    }
    const cleanSubmitEmail = candidateEmail.trim().toLowerCase();
    if (!cleanSubmitEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanSubmitEmail)) {
      messageBox.showError("Please enter a valid Email Address.");
      return;
    }

    // Check if candidate email is ALREADY REGISTERED - do not duplicate, show matched jobs directly!
    try {
      const q = query(collection(db, 'resumeDumpCandidates'), where('email', '==', cleanSubmitEmail));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const matchedCand: any = { id: snap.docs[0].id, ...snap.docs[0].data() };
        messageBox.showSuccess(`Welcome back, ${matchedCand.name || matchedCand.profile?.name || 'Job Seeker'}! We found your existing profile registered under ${cleanSubmitEmail}. Showing your best matched job openings.`);
        handleLoadExistingProfile(matchedCand);
        return;
      }
    } catch (lookupErr) {
      console.warn("Submit auto email lookup warning:", lookupErr);
    }

    if (!candidatePhone.trim()) {
      messageBox.showError("Please enter your Phone / WhatsApp Contact Number.");
      return;
    }
    if (!candidateGender.trim()) {
      messageBox.showError("Please select your Gender.");
      return;
    }
    if (!candidateLocation.trim()) {
      messageBox.showError("Please select or type your Location / Target City.");
      return;
    }
    if (!candidateExp.trim()) {
      messageBox.showError("Please enter your Experience in Years (Enter 0 if you are a Fresher).");
      return;
    }
    if (!candidateEducation.trim()) {
      messageBox.showError("Please select your Highest Education Qualification.");
      return;
    }
    if (!candidateEmploymentStatus.trim()) {
      messageBox.showError("Please select your Current Working / Employment Status.");
      return;
    }
    if (!candidateNoticePeriodVal.trim()) {
      messageBox.showError("Please enter your Notice Period.");
      return;
    }
    if (!candidateCurrentSalary.trim()) {
      messageBox.showError("Please enter your Current Salary.");
      return;
    }
    if (!candidateExpectedSalary.trim()) {
      messageBox.showError("Please enter your Expected Salary.");
      return;
    }
    if (candidateSectors.length < 2) {
      messageBox.showError("Please select at least 2 Target Industry Sectors (Min 2, Max 5).");
      return;
    }
    if (candidateSectors.length > 5) {
      messageBox.showError("Please select a maximum of 5 Target Industry Sectors.");
      return;
    }
    if (candidateDepartments.length < 2) {
      messageBox.showError("Please select at least 2 Functional Departments (Min 2, Max 5).");
      return;
    }
    if (candidateDepartments.length > 5) {
      messageBox.showError("Please select a maximum of 5 Functional Departments.");
      return;
    }
    if (!selectedFile && !existingEmailCandidate) {
      messageBox.showError("Please attach your Resume file (PDF, DOCX, TXT).");
      return;
    }

    setIsSubmitting(true);
    try {
      let resumeUrl = existingEmailCandidate?.resumeUrl || '';
      if (selectedFile) {
        try {
          resumeUrl = await uploadToCloudinary(selectedFile);
        } catch (uploadErr) {
          console.warn("Cloudinary upload fallback to blob URL:", uploadErr);
          resumeUrl = URL.createObjectURL(selectedFile);
        }
      }

      const finalProfile = parsedProfileData?.profile ? { ...parsedProfileData.profile } : {};
      const finalResumeText = parsedProfileData?.resumeText || extraBioText || '';

      const targetDomainsList = candidateDomains.length > 0
        ? candidateDomains
        : detectDomainsFromText(`${candidateName} ${extractedSkills.join(' ')} ${finalResumeText}`);
      const targetDomainStr = targetDomainsList.join(', ');

      finalProfile.name = candidateName.trim();
      finalProfile.email = candidateEmail.trim().toLowerCase();
      finalProfile.phone = candidatePhone.trim();
      finalProfile.gender = candidateGender;
      finalProfile.maritalStatus = candidateMaritalStatus;
      finalProfile.location = candidateLocation.trim();
      finalProfile.domain = targetDomainStr;
      finalProfile.domains = targetDomainsList;
      finalProfile.preferredDomains = targetDomainsList;
      finalProfile.skills = extractedSkills;

      const expNum = parseFloat(candidateExp) || 0;
      finalProfile.experienceYears = expNum;
      finalProfile.totalExperienceYears = expNum;
      finalProfile.experience = expNum;

      finalProfile.employmentStatus = candidateEmploymentStatus;
      finalProfile.isWorking = candidateEmploymentStatus === 'Working' || candidateEmploymentStatus === 'Currently Working';
      finalProfile.noticePeriodVal = candidateNoticePeriodVal.trim();
      finalProfile.noticePeriodUnit = candidateNoticePeriodUnit;
      finalProfile.noticePeriod = `${candidateNoticePeriodVal.trim()} ${candidateNoticePeriodUnit}`;
      finalProfile.noticePeriodDays = candidateNoticePeriodUnit === 'Months'
        ? String(Math.round((parseFloat(candidateNoticePeriodVal) || 0) * 30))
        : candidateNoticePeriodVal.trim();
      finalProfile.currentSalary = candidateCurrentSalary.trim();
      finalProfile.expectedSalary = candidateExpectedSalary.trim();

      const selectedDegree = candidateEducation.trim();
      const existingEdu = finalProfile.education || [];
      finalProfile.education = [
        { degree: selectedDegree, institution: 'Candidate Specified Qualification', year: '' },
        ...existingEdu.filter((e: any) => e.degree?.toLowerCase() !== selectedDegree.toLowerCase())
      ];

      finalProfile.isPublicUpload = true;
      finalProfile.isPublicCandidate = true;
      finalProfile.isGlobalPublicCandidate = true;

      await saveResumeDumpCandidate({
        recruiterUID: 'DSOURCE_PUBLIC_JOB_SEEKER_POOL',
        teamId: 'DSOURCE_TALENT_ROSTER',
        createdBy: {
          uid: 'PUBLIC_CANDIDATE',
          name: candidateName.trim(),
          email: candidateEmail.trim().toLowerCase(),
          role: 'job_seeker'
        },
        profile: finalProfile,
        resumeText: finalResumeText,
        resumeUrl: resumeUrl || 'https://via.placeholder.com/150',
        fileName: selectedFile ? selectedFile.name : (existingEmailCandidate?.fileName || 'resume.pdf'),
        mimeType: selectedFile ? selectedFile.type : 'application/pdf',
        fileSize: selectedFile ? selectedFile.size : 1024,
        additionalText: extraBioText.trim(),
        source: 'public_job_seeker_upload'
      });

      const formattedStatus = candidateEmploymentStatus === 'Working' ? 'Currently Working' : candidateEmploymentStatus;

      const profileMatchCandidate: CandidateMatchProfile = {
        name: candidateName.trim(),
        email: candidateEmail.trim().toLowerCase(),
        phone: candidatePhone.trim(),
        gender: candidateGender,
        maritalStatus: candidateMaritalStatus,
        location: candidateLocation.trim(),
        domain: targetDomainStr,
        domains: targetDomainsList,
        preferredDomains: targetDomainsList,
        experience: expNum,
        totalExperienceYears: expNum,
        education: selectedDegree,
        highestEducation: selectedDegree,
        employmentStatus: formattedStatus,
        noticePeriod: `${candidateNoticePeriodVal.trim()} ${candidateNoticePeriodUnit}`,
        currentSalary: candidateCurrentSalary.trim(),
        expectedSalary: candidateExpectedSalary.trim(),
        fileName: selectedFile ? selectedFile.name : (existingEmailCandidate?.fileName || 'resume.pdf'),
        skills: extractedSkills,
        resumeText: finalResumeText,
        resumeUrl
      };

      setSubmittedCandidateData(profileMatchCandidate);
      setOriginalCandidateData({ ...profileMatchCandidate });
      setIsSubmittedSuccess(true);
      messageBox.showSuccess("Your profile has been saved & matched with current job openings!");
    } catch (err: any) {
      console.error("Public Job Seeker Resume Upload Error:", err);
      messageBox.showError(err.message || "Failed to upload resume. Please check connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setCandidateName('');
    setCandidateEmail('');
    setCandidatePhone('');
    setCandidateGender('');
    setCandidateMaritalStatus('');
    setCandidateLocation('');
    setCandidateExp('');
    setCandidateEducation('');
    setCandidateEmploymentStatus('Working');
    setCandidateNoticePeriodVal('30');
    setCandidateNoticePeriodUnit('Days');
    setCandidateCurrentSalary('');
    setCandidateExpectedSalary('');
    setSelectedFile(null);
    setExtraBioText('');
    setExtractedSkills([]);
    setNewSkillInput('');
    setParsedProfileData(null);
    setIsSubmittedSuccess(false);
    setSubmittedCandidateData(null);
    setOriginalCandidateData(null);
    setExistingEmailCandidate(null);
  };

  return (
    <div className={`min-h-screen font-sans transition-colors duration-300 ${
      isDark ? 'bg-[#0a0a0a] text-white' : 'bg-slate-50 text-slate-900'
    }`}>
      {/* Sleek Responsive Top Navbar */}
      <header className={`sticky top-0 z-40 backdrop-blur-md border-b transition-colors ${
        isDark ? 'bg-[#0d0d0d]/95 border-white/[0.08]' : 'bg-white/95 border-slate-200 shadow-sm'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <Logo className="h-8 sm:h-9 w-auto object-contain" isDark={isDark} />
            <div className="border-l pl-2.5 sm:pl-3 border-slate-200 dark:border-white/10">
              <span className="font-extrabold text-sm sm:text-base tracking-tight block text-slate-900 dark:text-white">DSource</span>
              <span className="text-[10px] sm:text-[11px] font-mono text-emerald-500 font-bold block -mt-0.5 uppercase tracking-wider">Candidate Match Portal</span>
            </div>
          </div>

          {/* Desktop Right Nav Items */}
          <div className="hidden md:flex items-center gap-2.5">
            <button
              onClick={toggleTheme}
              className={`p-2.5 rounded-xl border transition-all cursor-pointer shadow-sm ${
                isDark ? 'bg-white/10 border-white/15 text-amber-400 hover:bg-white/15' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
              title={isDark ? "Switch to Light Theme" : "Switch to Dark Theme"}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-indigo-600" />}
            </button>

            <button
              onClick={() => setShowEmailLookup(!showEmailLookup)}
              className={`inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-sm cursor-pointer border ${
                isDark 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20' 
                  : 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              <Mail className="w-4 h-4" />
              <span>Already Submitted Resume?</span>
            </button>

            <Link
              to="/jobs"
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl border transition-all shadow-sm ${
                isDark 
                  ? 'bg-white/10 border-white/15 text-white hover:bg-white/15' 
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Briefcase className="w-4 h-4 text-emerald-500" />
              <span>View Openings</span>
            </Link>
          </div>

          {/* Mobile Right Controls: Theme Toggle & Hamburger Menu */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-xl border transition-all ${
                isDark ? 'bg-white/10 border-white/15 text-amber-400' : 'bg-slate-100 border-slate-200 text-slate-700'
              }`}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-indigo-600" />}
            </button>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={`p-2 rounded-xl border transition-all ${
                isDark ? 'bg-white/10 border-white/15 text-white' : 'bg-slate-100 border-slate-200 text-slate-800'
              }`}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Collapsible Navigation Menu Drawer */}
        {mobileMenuOpen && (
          <div className={`md:hidden border-t px-4 py-3 space-y-2.5 animate-in slide-in-from-top-2 duration-200 ${
            isDark ? 'bg-[#0d0d0d] border-white/10' : 'bg-white border-slate-200'
          }`}>
            <button
              onClick={() => {
                setShowEmailLookup(!showEmailLookup);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between text-xs font-bold px-3.5 py-2.5 rounded-xl border transition-all ${
                isDark 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                  : 'bg-emerald-50 border-emerald-300 text-emerald-800'
              }`}
            >
              <span className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <span>Already Submitted Resume? (Lookup)</span>
              </span>
              <ChevronRight className="w-4 h-4" />
            </button>

            <Link
              to="/jobs"
              onClick={() => setMobileMenuOpen(false)}
              className={`w-full flex items-center justify-between text-xs font-semibold px-3.5 py-2.5 rounded-xl border transition-all ${
                isDark 
                  ? 'bg-white/10 border-white/15 text-white' 
                  : 'bg-slate-100 border-slate-200 text-slate-800'
              }`}
            >
              <span className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-emerald-500" />
                <span>Browse All Active Job Openings</span>
              </span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </header>

      {/* Main Single-Page Responsive Container */}
      <main className="max-w-5xl mx-auto px-3 sm:px-6 py-5 sm:py-10">

        {/* Existing Submitted Candidate Email Lookup Modal Popup */}
        {showEmailLookup && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
            <div className={`border rounded-3xl max-w-lg w-full p-5 sm:p-7 shadow-2xl space-y-5 relative transition-colors ${
              isDark ? 'bg-[#0d0d0f] border-white/15 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}>
              {/* Modal Header */}
              <div className="flex items-start justify-between border-b border-slate-200 dark:border-white/10 pb-4 relative">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center shrink-0 shadow-inner">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-black tracking-tight">
                      Find Submitted Profile
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Retrieve your saved candidate details and job recommendations.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowEmailLookup(false)}
                  className="text-slate-400 hover:text-slate-900 dark:hover:text-white p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body & Form */}
              <form onSubmit={handleLookupEmailSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2">
                    Registered Email Address <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                    <input
                      type="email"
                      required
                      autoFocus
                      value={lookupEmailInput}
                      onChange={(e) => setLookupEmailInput(e.target.value)}
                      placeholder="e.g. yourname@gmail.com"
                      className={`w-full pl-10 pr-4 py-3 rounded-xl border text-xs sm:text-sm outline-none focus:border-emerald-500 font-medium transition-all ${
                        isDark 
                          ? 'bg-[#141414] border-white/10 text-white placeholder-slate-500' 
                          : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                      }`}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    Enter the email address you previously used to upload your resume.
                  </p>
                </div>

                {/* Modal Footer Actions */}
                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowEmailLookup(false)}
                    className={`px-4 py-2.5 rounded-xl font-bold text-xs border transition-all cursor-pointer ${
                      isDark 
                        ? 'bg-white/10 hover:bg-white/15 text-white border-white/10' 
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    }`}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSearchingEmail || !lookupEmailInput.trim()}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/30 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                  >
                    {isSearchingEmail ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Searching...</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-3.5 h-3.5" />
                        <span>Find My Profile</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {!isSubmittedSuccess ? (
          <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Header Title */}
            <div className="text-center space-y-2.5">
              <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border ${
                isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}>
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                <span>DSource Automated Candidate Match Portal</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
                Upload Resume & Get Best-Matched Jobs
              </h1>
              <p className={`text-xs sm:text-base max-w-2xl mx-auto leading-relaxed ${
                isDark ? 'text-slate-400' : 'text-slate-600'
              }`}>
                Our AI resume parser extracts your skills, location, experience, and education, pre-fills your profile, and matches you against active openings based on skills, location, gender, experience, and qualification fit!
              </p>
            </div>

            {/* Existing Email Live Alert Banner inside Form */}
            {existingEmailCandidate && (
              <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-950 text-white border border-emerald-400/50 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-300">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-400/30">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm font-extrabold text-emerald-300 block">Registered Candidate Profile Found!</span>
                    <span className="text-xs text-slate-200 block">
                      Welcome back, <strong>{existingEmailCandidate.name || existingEmailCandidate.email}</strong>
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleLoadExistingProfile(existingEmailCandidate)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer shrink-0"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Load Profile & Show Matched Jobs</span>
                </button>
              </div>
            )}

            {/* SINGLE-PAGE ALL-IN-ONE RESPONSIVE FORM */}
            <form
              onSubmit={handleSubmit}
              className="space-y-4 sm:space-y-6"
            >
              {/* CARD BLOCK 1: RESUME FILE UPLOAD & SKILLS EXTRACTION */}
              <div className={`rounded-3xl p-4 sm:p-6 border shadow-lg space-y-3.5 ${
                isDark ? 'bg-[#0d0d0d] border-white/[0.1]' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2.5">
                  <label className="block text-xs sm:text-sm font-extrabold uppercase tracking-wider flex items-center gap-2">
                    <Upload className="w-4 h-4 text-emerald-500" />
                    <span>1. Resume File & AI Skills Extraction <span className="text-red-500">*</span></span>
                  </label>
                  {isParsingResume && (
                    <span className="text-xs text-emerald-500 font-semibold flex items-center gap-1.5 animate-pulse">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>AI Parsing...</span>
                    </span>
                  )}
                </div>

                <div
                  className={`relative flex flex-col items-center justify-center p-6 sm:p-8 border-2 border-dashed rounded-2xl transition-all cursor-pointer text-center ${
                    selectedFile
                      ? isDark ? 'border-emerald-500 bg-emerald-500/10' : 'border-emerald-500 bg-emerald-50/80'
                      : isDark 
                      ? 'border-white/20 hover:border-emerald-500 bg-white/[0.02] hover:bg-white/[0.05]' 
                      : 'border-slate-300 hover:border-emerald-500 hover:bg-slate-50'
                  }`}
                  onClick={() => document.getElementById('public-resume-input')?.click()}
                >
                  <input
                    id="public-resume-input"
                    type="file"
                    accept=".pdf,.docx,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelection(file);
                    }}
                  />
                  <div className={`h-12 w-12 rounded-full flex items-center justify-center mb-2 shadow-inner ${
                    isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {isParsingResume ? <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" /> : <Upload className="w-6 h-6" />}
                  </div>

                  {selectedFile ? (
                    <div className="space-y-1">
                      <span className="font-bold text-xs sm:text-sm text-emerald-500 block">
                        ✓ File Attached: {selectedFile.name}
                      </span>
                      <span className="text-xs text-slate-400 block">
                        Size: {(selectedFile.size / 1024).toFixed(1)} KB (Skills auto-parsed below)
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <span className="font-bold text-xs sm:text-sm block">
                        Click or tap to upload resume file (PDF, DOCX, TXT)
                      </span>
                      <span className="text-xs text-slate-400 block">
                        Auto-extracts skills, location, experience & qualification fit!
                      </span>
                    </div>
                  )}
                </div>

                {/* Auto-Fetched Skills Tags Roster */}
                {(extractedSkills.length > 0 || selectedFile) && (
                  <div className={`p-4 rounded-2xl border space-y-3 ${
                    isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-4 h-4 text-emerald-500" />
                        <span className="font-extrabold text-xs uppercase tracking-wider">
                          Extracted Technical Skills ({extractedSkills.length})
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        * Auto-extracted from your resume. Add or remove skills below.
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                      {extractedSkills.map((skill) => (
                        <span
                          key={skill}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            isDark 
                              ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' 
                              : 'bg-emerald-100 border-emerald-300 text-emerald-900'
                          }`}
                        >
                          <span>{skill}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveSkill(skill)}
                            className="hover:text-red-500 transition-colors ml-0.5 p-0.5 cursor-pointer"
                            title="Remove Skill"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={newSkillInput}
                        onChange={(e) => setNewSkillInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSkill();
                          }
                        }}
                        placeholder="Add key skill (e.g. React, Java, AutoCAD)..."
                        className={`flex-1 px-3.5 py-2 rounded-xl text-xs outline-none focus:border-emerald-500 border ${
                          isDark ? 'bg-[#141414] border-white/10 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={handleAddSkill}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shrink-0 cursor-pointer shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* CARD BLOCK 2: PERSONAL INFORMATION & CONTACT */}
              <div className={`rounded-3xl p-4 sm:p-6 border shadow-lg space-y-4 ${
                isDark ? 'bg-[#0d0d0d] border-white/[0.1]' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2.5 font-extrabold text-xs sm:text-sm uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-emerald-500" />
                    <span>2. Personal Details & Contact</span>
                  </div>
                  <span className="text-[11px] text-red-500">* Mandatory</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                      <input
                        type="text"
                        required
                        value={candidateName}
                        onChange={(e) => setCandidateName(e.target.value)}
                        placeholder="e.g. Rahul Sharma"
                        className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-xs sm:text-sm outline-none focus:border-emerald-500 transition-all ${
                          isDark ? 'bg-[#141414] border-white/10 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                      <input
                        type="email"
                        required
                        value={candidateEmail}
                        onChange={(e) => {
                          setCandidateEmail(e.target.value);
                          handleCheckEmailExists(e.target.value);
                        }}
                        onBlur={(e) => handleCheckEmailExists(e.target.value)}
                        placeholder="e.g. rahul.sharma@example.com"
                        className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-xs sm:text-sm outline-none focus:border-emerald-500 transition-all ${
                          isDark ? 'bg-[#141414] border-white/10 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                      WhatsApp Phone <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                      <input
                        type="tel"
                        required
                        value={candidatePhone}
                        onChange={(e) => setCandidatePhone(e.target.value)}
                        placeholder="e.g. +91 9876543210"
                        className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-xs sm:text-sm outline-none focus:border-emerald-500 transition-all ${
                          isDark ? 'bg-[#141414] border-white/10 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                      Gender <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {['Male', 'Female', 'Other'].map(g => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setCandidateGender(g)}
                          className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                            candidateGender === g
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                              : isDark ? 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                      Marital Status
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {['Single / Unmarried', 'Married'].map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setCandidateMaritalStatus(m)}
                          className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                            candidateMaritalStatus === m
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                              : isDark ? 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD BLOCK 3: TARGET LOCATION, EXPERIENCE & QUALIFICATION */}
              <div className={`rounded-3xl p-4 sm:p-6 border shadow-lg space-y-4 ${
                isDark ? 'bg-[#0d0d0d] border-white/[0.1]' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2.5 font-extrabold text-xs sm:text-sm uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-500" />
                    <span>3. Target Location & Qualification</span>
                  </div>
                  <span className="text-[11px] text-red-500">* Mandatory</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                      Location / Target City <span className="text-red-500">*</span>
                    </label>
                    <LocationCityInput
                      value={candidateLocation}
                      onChange={setCandidateLocation}
                      selectedState={candidateState}
                      onStateChange={setCandidateState}
                      placeholder="Search city (e.g. Nashik, Pune, Mumbai)..."
                      className={`w-full rounded-xl border p-2.5 text-xs sm:text-sm outline-none focus:border-emerald-500 ${
                        isDark ? 'bg-[#141414] border-white/10 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                      }`}
                    />

                    {/* Quick Fast Feed City Presets */}
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {['Nashik', 'Pune', 'Mumbai', 'Thane', 'Nagpur', 'Chhatrapati Sambhajinagar'].map(city => (
                        <button
                          key={city}
                          type="button"
                          onClick={() => {
                            setCandidateLocation(city);
                            setCandidateState('Maharashtra');
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer inline-flex items-center gap-1 ${
                            candidateLocation.toLowerCase().includes(city.toLowerCase())
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                              : isDark ? 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          <MapPin className="w-3 h-3" />
                          <span>{city}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                      Experience (Years) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Briefcase className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="60"
                        required
                        value={candidateExp}
                        onChange={(e) => setCandidateExp(e.target.value)}
                        placeholder="e.g. 0 (Fresher) or 2.5 Yrs"
                        className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-xs sm:text-sm outline-none focus:border-emerald-500 transition-all ${
                          isDark ? 'bg-[#141414] border-white/10 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                        }`}
                      />
                    </div>
                    {/* Quick Experience Pills */}
                    <div className="flex flex-wrap gap-1 pt-2">
                      {['0', '1', '2', '3', '5'].map(yr => (
                        <button
                          key={yr}
                          type="button"
                          onClick={() => setCandidateExp(yr)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                            candidateExp === yr
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                              : isDark ? 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {yr === '0' ? 'Fresher' : `${yr} Yr`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                      Highest Education Qualification <span className="text-red-500">*</span>
                    </label>
                    <EducationInput
                      value={candidateEducation}
                      onChange={setCandidateEducation}
                      placeholder="Select degree (B.Tech, Diploma, BCA)..."
                      className={`w-full rounded-xl border p-2.5 text-xs sm:text-sm outline-none focus:border-emerald-500 ${
                        isDark ? 'bg-[#141414] border-white/10 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* CARD BLOCK 4: EMPLOYMENT STATUS, NOTICE PERIOD & SALARY */}
              <div className={`rounded-3xl p-4 sm:p-6 border shadow-lg space-y-4 ${
                isDark ? 'bg-[#0d0d0d] border-white/[0.1]' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2.5 font-extrabold text-xs sm:text-sm uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-500" />
                    <span>4. Employment Status, Notice Period & Salary</span>
                  </div>
                  <span className="text-[11px] text-red-500">* Mandatory</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                      Working Status <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={candidateEmploymentStatus}
                      onChange={(e) => setCandidateEmploymentStatus(e.target.value)}
                      className={`w-full px-3 py-2.5 rounded-xl border text-xs sm:text-sm outline-none focus:border-emerald-500 font-semibold cursor-pointer ${
                        isDark ? 'bg-[#141414] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                    >
                      <option value="Working">Currently Working (Employed)</option>
                      <option value="Not Working">Not Working (Unemployed)</option>
                      <option value="Serving Notice">Serving Notice Period</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>Notice Period <span className="text-red-500">*</span></span>
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Clock className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                        <input
                          type="number"
                          min="0"
                          max="365"
                          required
                          value={candidateNoticePeriodVal}
                          onChange={(e) => setCandidateNoticePeriodVal(e.target.value)}
                          placeholder="30"
                          className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-xs sm:text-sm outline-none focus:border-emerald-500 ${
                            isDark ? 'bg-[#141414] border-white/10 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                          }`}
                        />
                      </div>
                      <select
                        value={candidateNoticePeriodUnit}
                        onChange={(e) => setCandidateNoticePeriodUnit(e.target.value as 'Days' | 'Months')}
                        className={`px-3 py-2.5 rounded-xl border text-xs font-bold outline-none cursor-pointer ${
                          isDark ? 'bg-[#141414] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      >
                        <option value="Days">Days</option>
                        <option value="Months">Months</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                      Current Salary <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <IndianRupee className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                      <input
                        type="text"
                        required
                        value={candidateCurrentSalary}
                        onChange={(e) => setCandidateCurrentSalary(e.target.value)}
                        placeholder="e.g. 4.5 LPA (0 if fresher)"
                        className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-xs sm:text-sm outline-none focus:border-emerald-500 transition-all ${
                          isDark ? 'bg-[#141414] border-white/10 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">
                      Expected Salary <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <IndianRupee className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                      <input
                        type="text"
                        required
                        value={candidateExpectedSalary}
                        onChange={(e) => setCandidateExpectedSalary(e.target.value)}
                        placeholder="e.g. 6.5 LPA"
                        className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-xs sm:text-sm outline-none focus:border-emerald-500 transition-all ${
                          isDark ? 'bg-[#141414] border-white/10 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD BLOCK 5: TARGET INDUSTRY SECTORS (MULTI-SELECT: MIN 2, MAX 5) */}
              <div className={`rounded-3xl p-4 sm:p-6 border shadow-lg space-y-4 ${
                isDark ? 'bg-[#0d0d0d] border-white/[0.1]' : 'bg-white border-slate-200'
              }`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 border-b border-slate-200 dark:border-white/10 pb-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider">
                      5. Select Target Industry Sectors <span className="text-red-500">*</span>
                    </label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Select minimum 2 and maximum 5 target industry sectors:
                    </p>
                  </div>
                  <span className={`text-xs font-extrabold px-3 py-1 rounded-full border shrink-0 ${
                    candidateSectors.length >= 2 && candidateSectors.length <= 5
                      ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
                      : 'text-amber-500 bg-amber-500/10 border-amber-500/20'
                  }`}>
                    {candidateSectors.length} / 5 Selected (Min 2, Max 5)
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      Industry Sectors ({ALL_JOB_SECTORS.length}) <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      {candidateSectors.length} Active (Min 2, Max 5)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 sm:gap-2">
                    {ALL_JOB_SECTORS.map((sectorName) => {
                      const isSelected = candidateSectors.some(s => s.toLowerCase() === sectorName.toLowerCase());
                      return (
                        <button
                          key={sectorName}
                          type="button"
                          onClick={() => toggleSector(sectorName)}
                          className={`flex items-center justify-between p-2 sm:p-2.5 rounded-xl border text-[10px] sm:text-[11px] leading-tight transition-all text-left cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm ring-1 ring-emerald-400 font-bold'
                              : isDark
                              ? 'bg-[#141414] border-white/10 text-slate-300 hover:border-emerald-500/40 hover:bg-[#1a1a1a] font-semibold'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-emerald-400 hover:bg-emerald-50/50 font-semibold'
                          }`}
                        >
                          <span className="break-words font-semibold text-[10px] sm:text-[11px] min-w-0 flex-1 pr-1">{sectorName}</span>
                          <div className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border transition-all ${
                            isSelected
                              ? 'bg-white text-emerald-600 border-white'
                              : isDark
                              ? 'border-white/20 bg-white/5'
                              : 'border-slate-300 bg-white'
                          }`}>
                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* CARD BLOCK 6: TARGET FUNCTIONAL DEPARTMENTS (MULTI-SELECT: MIN 2, MAX 5) */}
              <div className={`rounded-3xl p-4 sm:p-6 border shadow-lg space-y-4 ${
                isDark ? 'bg-[#0d0d0d] border-white/[0.1]' : 'bg-white border-slate-200'
              }`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 border-b border-slate-200 dark:border-white/10 pb-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider">
                      6. Select Functional Departments ({ALL_JOB_DEPARTMENTS.length}) <span className="text-red-500">*</span>
                    </label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Select minimum 2 and maximum 5 functional departments:
                    </p>
                  </div>
                  <span className={`text-xs font-extrabold px-3 py-1 rounded-full border shrink-0 ${
                    candidateDepartments.length >= 2 && candidateDepartments.length <= 5
                      ? 'text-teal-500 bg-teal-500/10 border-teal-500/20'
                      : 'text-amber-500 bg-amber-500/10 border-amber-500/20'
                  }`}>
                    {candidateDepartments.length} / 5 Selected (Min 2, Max 5)
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                      Functional Departments ({ALL_JOB_DEPARTMENTS.length}) <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      {candidateDepartments.length} Active (Min 2, Max 5)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 sm:gap-2">
                    {ALL_JOB_DEPARTMENTS.map((deptName) => {
                      const isSelected = candidateDepartments.some(d => d.toLowerCase() === deptName.toLowerCase());
                      return (
                        <button
                          key={deptName}
                          type="button"
                          onClick={() => toggleDepartment(deptName)}
                          className={`flex items-center justify-between p-2 sm:p-2.5 rounded-xl border text-[10px] sm:text-[11px] leading-tight transition-all text-left cursor-pointer ${
                            isSelected
                              ? 'bg-teal-600 text-white border-teal-500 shadow-sm ring-1 ring-teal-400 font-bold'
                              : isDark
                              ? 'bg-[#141414] border-white/10 text-slate-300 hover:border-teal-500/40 hover:bg-[#1a1a1a] font-semibold'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-teal-400 hover:bg-teal-50/50 font-semibold'
                          }`}
                        >
                          <span className="break-words font-semibold text-[10px] sm:text-[11px] min-w-0 flex-1 pr-1">{deptName}</span>
                          <div className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border transition-all ${
                            isSelected
                              ? 'bg-white text-teal-600 border-white'
                              : isDark
                              ? 'border-white/20 bg-white/5'
                              : 'border-slate-300 bg-white'
                          }`}>
                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* CARD BLOCK 7: NOTES & PREFERRED DOMAIN ROLES */}
              <div className={`rounded-3xl p-4 sm:p-6 border shadow-lg space-y-2.5 ${
                isDark ? 'bg-[#0d0d0d] border-white/[0.1]' : 'bg-white border-slate-200'
              }`}>
                <label className="block text-xs font-bold uppercase tracking-wider">
                  7. Preferred Domain Roles & Additional Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={extraBioText}
                  onChange={(e) => setExtraBioText(e.target.value)}
                  placeholder="Mention preferred job roles, expected CTC, or work availability..."
                  className={`w-full p-3 rounded-xl border text-xs sm:text-sm outline-none focus:border-emerald-500 transition-all ${
                    isDark ? 'bg-[#141414] border-white/10 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                  }`}
                />
              </div>

              {/* Single Primary Action Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || isParsingResume}
                className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm sm:text-base flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-emerald-600/25 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Processing Profile & Matching Active Jobs...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    <span>Submit Resume & Get Matched Jobs</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* Post-Submission / Email Lookup Results View */
          <div className="space-y-6 sm:space-y-8 animate-in zoom-in-95 duration-300">
            {/* Compact Profile Matched Bar - Adaptive Day & Dark App Theme */}
            <div className={`border rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-200 backdrop-blur-xl transition-colors ${
              isDark 
                ? 'bg-gradient-to-r from-slate-900 via-slate-900 to-[#072418] text-white border-emerald-500/30 shadow-emerald-950/20' 
                : 'bg-gradient-to-r from-white via-emerald-50/40 to-teal-50/30 text-slate-900 border-emerald-200 shadow-emerald-500/5'
            }`}>
              <div className="flex items-center gap-3 truncate">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0 font-extrabold text-sm shadow-md shadow-emerald-600/30">
                  {submittedCandidateData?.name ? submittedCandidateData.name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
                </div>
                <div className="truncate text-xs space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] uppercase tracking-wider font-extrabold ${
                      isDark ? 'text-emerald-400' : 'text-emerald-700'
                    }`}>
                      Profile Matched:
                    </span>
                    <span className={`font-extrabold text-sm ${
                      isDark ? 'text-white' : 'text-slate-900'
                    }`}>
                      {submittedCandidateData?.name}
                    </span>
                  </div>
                  <div className="text-[11px] flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 font-semibold ${
                      isDark ? 'text-slate-200' : 'text-slate-600'
                    }`}>
                      <MapPin className={`w-3 h-3 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                      <span>{submittedCandidateData?.location || 'Nashik'}</span>
                    </span>
                    <span className={isDark ? 'text-slate-500' : 'text-slate-300'}>•</span>
                    <span className={`inline-flex items-center gap-1 font-semibold ${
                      isDark ? 'text-slate-200' : 'text-slate-600'
                    }`}>
                      <Briefcase className={`w-3 h-3 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                      <span>{submittedCandidateData?.experience || 0} Yrs Exp</span>
                    </span>
                    <span className={isDark ? 'text-slate-500' : 'text-slate-300'}>•</span>
                    <span className={`inline-flex items-center gap-1 font-bold ${
                      isDark ? 'text-emerald-300' : 'text-emerald-700'
                    }`}>
                      <GraduationCap className={`w-3 h-3 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                      <span>{submittedCandidateData?.highestEducation || 'Graduate'}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setShowCriteriaEditor(true)}
                  className={`px-3.5 py-2 rounded-xl font-black text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-md active:scale-[0.98] ${
                    isDark 
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20' 
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Edit Criteria</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetForm}
                  className={`px-3 py-2 rounded-xl font-bold text-xs border transition-all cursor-pointer ${
                    isDark 
                      ? 'bg-white/10 hover:bg-white/15 text-white border-white/15 hover:border-white/30' 
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300 shadow-sm'
                  }`}
                >
                  Change Resume
                </button>
              </div>
            </div>

            {/* Live Preferences Customizer Modal Popup */}
            {showCriteriaEditor && submittedCandidateData && (
              <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
                <div className={`border rounded-3xl max-w-3xl w-full p-5 sm:p-7 shadow-2xl space-y-5 relative max-h-[92vh] overflow-y-auto transition-colors ${
                  isDark ? 'bg-[#0d0d0f] border-white/15 text-white' : 'bg-white border-slate-200 text-slate-900'
                }`}>
                  {/* Modal Header */}
                  <div className="flex items-start justify-between border-b border-slate-200 dark:border-white/10 pb-4 relative">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center shrink-0 shadow-inner">
                        <SlidersHorizontal className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-lg sm:text-xl font-black tracking-tight">
                          Customize Match Criteria Live
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Edit your target sectors, departments, location, experience, gender, and education to refresh matched jobs.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowCriteriaEditor(false)}
                      className="text-slate-400 hover:text-slate-900 dark:hover:text-white p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Multi-Domain Interactive Live Selection Grid */}
                  <div className="space-y-4 pb-3 border-b border-slate-200 dark:border-white/10">
                    {/* Sectors Live */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                          Target Industry Sectors ({ALL_JOB_SECTORS.length})
                        </label>
                        <span className="text-[11px] font-extrabold text-emerald-500 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                          {(submittedCandidateData.domains || candidateDomains).length} Criteria Active
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5 max-h-44 overflow-y-auto pr-1">
                        {ALL_JOB_SECTORS.map((sectorName) => {
                          const activeDomains = submittedCandidateData.domains || candidateDomains;
                          const isSelected = activeDomains.some(d => d.toLowerCase() === sectorName.toLowerCase());

                          const handleToggleSectorLive = () => {
                            let updated: string[];
                            if (isSelected) {
                              updated = activeDomains.filter(d => d.toLowerCase() !== sectorName.toLowerCase());
                            } else {
                              updated = [...activeDomains, sectorName];
                            }
                            setCandidateDomains(updated);
                            setCandidateDomain(updated.join(', '));
                            handleUpdateCandidateCriteria('domains', updated);
                          };

                          return (
                            <button
                              key={sectorName}
                              type="button"
                              onClick={handleToggleSectorLive}
                              className={`flex items-center justify-between p-2 rounded-lg border text-[11px] transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm font-bold'
                                  : isDark
                                  ? 'bg-[#141414] border-white/10 text-slate-300 hover:border-emerald-500/40 hover:bg-[#1a1a1a] font-semibold'
                                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-emerald-400 hover:bg-emerald-50/50 font-semibold'
                              }`}
                            >
                              <span className="truncate pr-1">{sectorName}</span>
                              <div className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border transition-all ${
                                isSelected
                                  ? 'bg-white text-emerald-600 border-white'
                                  : isDark
                                  ? 'border-white/20 bg-white/5'
                                  : 'border-slate-300 bg-white'
                              }`}>
                                {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Departments Live */}
                    <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10">
                      <div className="flex items-center justify-between">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                          Target Functional Departments ({ALL_JOB_DEPARTMENTS.length})
                        </label>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5 max-h-44 overflow-y-auto pr-1">
                        {ALL_JOB_DEPARTMENTS.map((deptName) => {
                          const activeDomains = submittedCandidateData.domains || candidateDomains;
                          const isSelected = activeDomains.some(d => d.toLowerCase() === deptName.toLowerCase());

                          const handleToggleDeptLive = () => {
                            let updated: string[];
                            if (isSelected) {
                              updated = activeDomains.filter(d => d.toLowerCase() !== deptName.toLowerCase());
                            } else {
                              updated = [...activeDomains, deptName];
                            }
                            setCandidateDomains(updated);
                            setCandidateDomain(updated.join(', '));
                            handleUpdateCandidateCriteria('domains', updated);
                          };

                          return (
                            <button
                              key={deptName}
                              type="button"
                              onClick={handleToggleDeptLive}
                              className={`flex items-center justify-between p-2 rounded-lg border text-[11px] transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-teal-600 text-white border-teal-500 shadow-sm font-bold'
                                  : isDark
                                  ? 'bg-[#141414] border-white/10 text-slate-300 hover:border-teal-500/40 hover:bg-[#1a1a1a] font-semibold'
                                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-teal-400 hover:bg-teal-50/50 font-semibold'
                              }`}
                            >
                              <span className="truncate pr-1">{deptName}</span>
                              <div className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border transition-all ${
                                isSelected
                                  ? 'bg-white text-teal-600 border-white'
                                  : isDark
                                  ? 'border-white/20 bg-white/5'
                                  : 'border-slate-300 bg-white'
                              }`}>
                                {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">

                    {/* Location Selector */}
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                        Target City / Location
                      </label>
                      <LocationCityInput
                        value={submittedCandidateData.location || ''}
                        onChange={(val) => handleUpdateCandidateCriteria('location', val)}
                        placeholder="e.g. Nashik, Pune, Mumbai..."
                        className={`w-full rounded-xl border p-2.5 text-xs outline-none focus:border-emerald-500 font-semibold ${
                          isDark ? 'bg-[#141414] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>

                    {/* Experience Selector */}
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                        Experience (Years)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="60"
                        value={submittedCandidateData.experience || 0}
                        onChange={(e) => handleUpdateCandidateCriteria('experience', parseFloat(e.target.value) || 0)}
                        className={`w-full p-2.5 rounded-xl border text-xs font-semibold outline-none focus:border-emerald-500 ${
                          isDark ? 'bg-[#141414] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>

                    {/* Gender Selector */}
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                        Gender
                      </label>
                      <select
                        value={submittedCandidateData.gender || 'Any'}
                        onChange={(e) => handleUpdateCandidateCriteria('gender', e.target.value)}
                        className={`w-full px-3 py-2.5 rounded-xl border text-xs font-semibold outline-none focus:border-emerald-500 cursor-pointer ${
                          isDark ? 'bg-[#141414] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Any">Prefer Not To Say / Any</option>
                      </select>
                    </div>

                    {/* Highest Qualification */}
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                        Highest Education
                      </label>
                      <EducationInput
                        value={submittedCandidateData.highestEducation || submittedCandidateData.education || ''}
                        onChange={(val) => handleUpdateCandidateCriteria('education', val)}
                        placeholder="Select degree..."
                        className={`w-full rounded-xl border p-2.5 text-xs outline-none focus:border-emerald-500 font-semibold ${
                          isDark ? 'bg-[#141414] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Quick City Presets */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {['Nashik', 'Pune', 'Mumbai', 'Thane', 'Nagpur', 'Chhatrapati Sambhajinagar', 'Remote'].map((city) => (
                      <button
                        key={city}
                        type="button"
                        onClick={() => handleUpdateCandidateCriteria('location', city)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer inline-flex items-center gap-1 ${
                          (submittedCandidateData.location || '').toLowerCase().includes(city.toLowerCase())
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : isDark ? 'bg-white/10 text-slate-300 border-white/10' : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        <MapPin className="w-3 h-3" />
                        <span>{city}</span>
                      </button>
                    ))}
                  </div>

                  {/* Add Custom Skill Filter */}
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-200 dark:border-white/10">
                    <input
                      type="text"
                      value={resultSkillInput}
                      onChange={(e) => setResultSkillInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSkillToResults();
                        }
                      }}
                      placeholder="Add target skill (e.g. AutoCAD, Python, Java, Tally)..."
                      className={`flex-1 px-3 py-2 rounded-xl text-xs outline-none focus:border-emerald-500 border ${
                        isDark ? 'bg-[#141414] border-white/10 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleAddSkillToResults}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>

                  {/* Modal Action Footer */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-white/10">
                    <button
                      type="button"
                      disabled={isSavingCriteria}
                      onClick={handleSaveUpdatedCriteriaToResumeDump}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-800 dark:text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 border border-slate-200 dark:border-white/10"
                    >
                      {isSavingCriteria ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving to Resume Dump...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>Save to Resume Dump</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowCriteriaEditor(false)}
                      className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-emerald-600/30 cursor-pointer active:scale-[0.98]"
                    >
                      <span>Done & View Matches</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Recommended Jobs Header & Filter Tabs */}
            <div className="space-y-3">
              <div>
                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider mb-1.5 border shadow-sm ${
                  isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}>
                  <Sparkles className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                  <span>AI Job Recommendations</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
                  <span>Best Matched Job Openings</span>
                  <span className="text-sm font-bold text-slate-400">({matchedJobsList.length})</span>
                </h3>
              </div>

              {/* Segmented Filter Tabs */}
              <div className={`flex items-center gap-1 p-1 rounded-2xl shadow-sm border overflow-x-auto ${
                isDark ? 'bg-[#0f0f10] border-white/10' : 'bg-slate-100/90 border-slate-200'
              }`}>
                <button
                  type="button"
                  onClick={() => setMatchFilter('EligibleOnly')}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer ${
                    matchFilter === 'EligibleOnly' 
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 scale-[1.02]' 
                      : isDark ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 font-semibold'
                  }`}
                >
                  Eligible
                </button>
                <button
                  type="button"
                  onClick={() => setMatchFilter('HighMatch')}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer ${
                    matchFilter === 'HighMatch' 
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 scale-[1.02]' 
                      : isDark ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 font-semibold'
                  }`}
                >
                  High Match (&ge; 75%)
                </button>
                <button
                  type="button"
                  onClick={() => setMatchFilter('LocalCity')}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer inline-flex items-center gap-1.5 ${
                    matchFilter === 'LocalCity' 
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 scale-[1.02]' 
                      : isDark ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 font-semibold'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{submittedCandidateData?.location || 'Location'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMatchFilter('All')}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer ${
                    matchFilter === 'All' 
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 scale-[1.02]' 
                      : isDark ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 font-semibold'
                  }`}
                >
                  All ({matchedJobsList.length})
                </button>
              </div>
            </div>

            {/* Jobs List Grid */}
            {jobsLoading ? (
              <div className={`py-12 text-center space-y-3 rounded-3xl border ${
                isDark ? 'bg-[#0d0d0d] border-white/10' : 'bg-white border-slate-200'
              }`}>
                <RefreshCw className="w-8 h-8 animate-spin text-emerald-500 mx-auto" />
                <p className="text-sm font-bold text-slate-400">Scoring active job openings...</p>
              </div>
            ) : matchedJobsList.length === 0 ? (
              <div className={`py-10 text-center space-y-3 rounded-3xl border px-4 ${
                isDark ? 'bg-[#0d0d0d] border-white/10' : 'bg-white border-slate-200'
              }`}>
                <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
                <h4 className="text-base font-bold">No Job Matches Found for this Filter</h4>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  Switch filter to "All" or edit your preferences to view more openings.
                </p>
                <button
                  type="button"
                  onClick={() => setMatchFilter('All')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                >
                  View All Openings
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                {matchedJobsList.map((matchItem) => {
                  const { job, overallScore, matchGrade, badgeColor, skillMatch, locationMatch, genderMatch, expMatch, eduMatch, failReasons } = matchItem;
                  const isDisqualified = !expMatch.isMatch || !genderMatch.isMatch || overallScore === 0;

                  return (
                    <div
                      key={job.id}
                      className={`group relative flex flex-col justify-between rounded-3xl border p-5 sm:p-6 transition-all duration-300 shadow-lg overflow-hidden backdrop-blur-xl ${
                        isDark 
                          ? 'bg-[#0d0d0f] border-white/[0.09] hover:border-emerald-500/50 hover:bg-[#121215] hover:shadow-2xl hover:shadow-emerald-950/40' 
                          : 'bg-white border-slate-200/90 hover:border-emerald-500/50 hover:shadow-2xl hover:shadow-emerald-500/10'
                      } ${isDisqualified ? 'opacity-85' : ''}`}
                    >
                      {/* Ambient hover glow gradient */}
                      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.04] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                      <div className="space-y-3.5 relative z-10">
                        {/* Top Header Badge Row */}
                        <div className="flex items-start justify-between gap-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-black shadow-md flex items-center gap-1.5 ${
                            isDisqualified 
                              ? badgeColor 
                              : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-500/20'
                          }`}>
                            {isDisqualified ? <Ban className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                            <span>{overallScore}% Match • {matchGrade}</span>
                          </span>

                          <span className={`text-[11px] font-mono font-extrabold px-2.5 py-1 rounded-xl border ${
                            isDark ? 'bg-white/[0.06] border-white/10 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'
                          }`}>
                            Code: {job.accessCode}
                          </span>
                        </div>

                        {/* Title & Recruiter / Department */}
                        <div>
                          <h4 className={`text-lg sm:text-xl font-black transition-colors tracking-tight line-clamp-1 ${
                            isDark ? 'text-white group-hover:text-emerald-400' : 'text-slate-900 group-hover:text-emerald-600'
                          }`}>
                            {job.title}
                          </h4>
                          <div className="flex items-center gap-2 text-xs font-semibold mt-1">
                            <span className="text-slate-400 font-medium inline-flex items-center gap-1">
                              <User className="w-3.5 h-3.5 text-slate-400" />
                              <span>{job.entryBy || job.recruiterName || 'Recruiter'}</span>
                            </span>
                            <span className="text-slate-400 select-none">•</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold inline-flex items-center gap-1">
                              <Briefcase className="w-3.5 h-3.5 text-emerald-500" />
                              <span>{job.department}</span>
                            </span>
                          </div>
                        </div>

                        {/* 3-Column Attribute Badges */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5">
                          {/* Location Badge */}
                          <div className={`p-2.5 rounded-2xl border text-[11px] flex items-center gap-2 ${
                            locationMatch.isMatch 
                              ? isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-emerald-50/70 border-emerald-200 text-emerald-900 font-bold'
                              : isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-amber-50/70 border-amber-200 text-amber-900 font-bold'
                          }`}>
                            <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span className="truncate">{job.location}</span>
                          </div>

                          {/* Experience Badge */}
                          <div className={`p-2.5 rounded-2xl border text-[11px] flex items-center gap-2 ${
                            expMatch.isMatch 
                              ? isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-bold' : 'bg-emerald-50/70 border-emerald-200 text-emerald-900 font-bold'
                              : isDark ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 font-extrabold' : 'bg-rose-100 border-rose-300 text-rose-900 font-extrabold'
                          }`}>
                            {expMatch.isMatch ? (
                              <Briefcase className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            ) : (
                              <Ban className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            )}
                            <span className="truncate">
                              {expMatch.isMatch ? `Req: ${expMatch.requiredExp}` : `Min ${expMatch.requiredExp} Req`}
                            </span>
                          </div>

                          {/* Gender Badge */}
                          <div className={`p-2.5 rounded-2xl border text-[11px] flex items-center gap-2 ${
                            genderMatch.isMatch 
                              ? isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-bold' : 'bg-emerald-50/70 border-emerald-200 text-emerald-900 font-bold'
                              : isDark ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 font-extrabold' : 'bg-rose-100 border-rose-300 text-rose-900 font-extrabold'
                          }`}>
                            <User className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span className="truncate font-semibold">
                              {genderMatch.requiredGender === 'Any' ? 'Gender: Any' : `${genderMatch.requiredGender}`}
                            </span>
                          </div>
                        </div>

                        {/* Education Qualification with Differentiators and Green Highlight for Matches */}
                        <div className={`p-3 rounded-2xl border text-[11px] space-y-2 ${
                          isDark ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-slate-50/80 border-slate-200/90'
                        }`}>
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-extrabold text-[10px] uppercase tracking-wider">
                              <GraduationCap className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              <span>Required Qualification</span>
                            </div>
                            {eduMatch.isMatch ? (
                              <span className={`text-[9px] font-black px-2.5 py-0.5 rounded-full border shadow-sm shrink-0 inline-flex items-center gap-1 ${
                                isDark ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-emerald-100 border-emerald-300 text-emerald-800'
                              }`}>
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                                <span>Fit</span>
                              </span>
                            ) : (
                              <span className={`text-[9px] font-black px-2.5 py-0.5 rounded-full border shadow-sm shrink-0 ${
                                isDark ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-amber-100 border-amber-300 text-amber-800'
                              }`}>
                                Mismatch
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {(eduMatch.allOptions && eduMatch.allOptions.length > 0
                              ? eduMatch.allOptions
                              : splitEducationRequirements(job.qualification || job.education || 'Any Qualification')
                            ).map((option, idx, arr) => {
                              const isOptionMatched = eduMatch.matchedOptions?.includes(option) ||
                                (submittedCandidateData?.highestEducation && checkSingleRequirementMatch(submittedCandidateData.highestEducation, option));
                              
                              return (
                                <React.Fragment key={option + idx}>
                                  <span className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold border transition-all inline-flex items-center gap-1.5 ${
                                    isOptionMatched
                                      ? isDark
                                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-black shadow-sm ring-1 ring-emerald-500/30'
                                        : 'bg-emerald-100/90 border-emerald-400 text-emerald-950 font-black shadow-sm ring-1 ring-emerald-300'
                                      : isDark
                                      ? 'bg-white/[0.04] border-white/10 text-slate-400'
                                      : 'bg-white border-slate-200 text-slate-600'
                                  }`}>
                                    {isOptionMatched && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 stroke-[3]" />}
                                    <span>{option}</span>
                                  </span>
                                  {idx < arr.length - 1 && (
                                    <span className="text-[11px] font-extrabold text-slate-400 dark:text-slate-500 select-none px-0.5">
                                      •
                                    </span>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </div>
                        </div>

                        {/* Skills Display */}
                        {skillMatch.matchedSkills.length > 0 ? (
                          <div className="space-y-1.5 pt-0.5">
                            <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                              <Tag className="w-3 h-3 text-emerald-500" />
                              <span>Matched Skills</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {skillMatch.matchedSkills.map(s => (
                                <span key={s} className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black border flex items-center gap-1 ${
                                  isDark ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : 'bg-emerald-100/80 border-emerald-300 text-emerald-900'
                                }`}>
                                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                                  <span>{s}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : skillMatch.missingSkills.length > 0 && (
                          <div className="space-y-1.5 pt-0.5">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                              <Tag className="w-3 h-3 text-slate-400" />
                              <span>Key Job Skills</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {skillMatch.missingSkills.slice(0, 3).map(s => (
                                <span key={s} className={`px-2.5 py-0.5 rounded-lg text-[10px] border font-medium ${
                                  isDark ? 'bg-white/[0.04] border-white/10 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-500'
                                }`}>
                                  {s}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Fail Reasons if strict criteria fail */}
                        {failReasons.length > 0 && (
                          <div className={`p-2.5 rounded-xl border text-[11px] space-y-0.5 ${
                            isDisqualified 
                              ? isDark ? 'bg-rose-950/40 border-rose-800/60 text-rose-200' : 'bg-rose-50 border-rose-200 text-rose-950' 
                              : isDark ? 'bg-amber-950/40 border-amber-800/60 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-900'
                          }`}>
                            <span className="font-bold block flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>{isDisqualificationReason(failReasons[0]) ? 'Reason: ' : 'Note: '} {failReasons[0]}</span>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Card Action Footer */}
                      <div className="pt-4 border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-2.5 relative z-10">
                        <button
                          type="button"
                          onClick={() => setSelectedJobForModal(matchItem)}
                          className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                            isDark ? 'bg-white/[0.06] border-white/10 text-white hover:bg-white/[0.12]' : 'bg-slate-100 border-slate-200 text-slate-800 hover:bg-slate-200'
                          }`}
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-400" />
                          <span>View Details</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenApplyModal(matchItem)}
                          disabled={isDisqualified}
                          className={`flex-1 py-2.5 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            isDisqualified 
                              ? 'bg-slate-200 dark:bg-white/5 text-slate-400 dark:text-slate-500 cursor-not-allowed border border-slate-300 dark:border-white/10' 
                              : 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/30 hover:shadow-emerald-500/40 active:scale-[0.98]'
                          }`}
                        >
                          <span>{isDisqualified ? 'Criteria Unmet' : 'Apply & Start'}</span>
                          {!isDisqualified && <ArrowRight className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal Dialog for View Job Details */}
      {selectedJobForModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className={`border rounded-3xl max-w-2xl w-full p-5 sm:p-8 shadow-2xl space-y-5 relative max-h-[90vh] overflow-y-auto transition-colors ${
            isDark ? 'bg-[#0d0d0d] border-white/15 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <button
              onClick={() => setSelectedJobForModal(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white p-1 rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Top Match Header */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-extrabold ${selectedJobForModal.badgeColor}`}>
                  {selectedJobForModal.overallScore}% Match • {selectedJobForModal.matchGrade}
                </span>
                <span className={`text-xs font-mono px-2.5 py-1 rounded-lg border ${
                  isDark ? 'bg-white/10 border-white/10 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'
                }`}>
                  Code: {selectedJobForModal.job.accessCode}
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-extrabold">
                {selectedJobForModal.job.title}
              </h3>
              <p className="text-xs text-slate-400 font-semibold">
                Posted by: {selectedJobForModal.job.recruiterName} • {selectedJobForModal.job.department}
              </p>
            </div>

            {/* Breakdown Highlights */}
            <div className={`grid grid-cols-3 gap-2.5 p-3 rounded-2xl text-xs border ${
              isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'
            }`}>
              <div>
                <span className="text-slate-400 block text-[11px]">Location</span>
                <strong className="block truncate">{selectedJobForModal.job.location}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Experience</span>
                <strong className="block truncate">{selectedJobForModal.expMatch.requiredExp}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Gender Req.</span>
                <strong className="block truncate">{selectedJobForModal.genderMatch.requiredGender}</strong>
              </div>
            </div>

            {/* Strict Disqualification Warning */}
            {(!selectedJobForModal.expMatch.isMatch || !selectedJobForModal.genderMatch.isMatch) && (
              <div className={`p-3.5 rounded-2xl border text-xs font-semibold space-y-1 ${
                isDark ? 'bg-rose-950/50 border-rose-800 text-rose-200' : 'bg-rose-50 border-rose-300 text-rose-950'
              }`}>
                <div className="font-extrabold text-rose-400 flex items-center gap-1">
                  <Ban className="w-4 h-4 text-rose-500" />
                  <span>Not Recommended due to Criteria Mismatch</span>
                </div>
                <p className="text-[11px]">
                  {!selectedJobForModal.expMatch.isMatch && (
                    <span>Requires minimum <strong>{selectedJobForModal.expMatch.requiredExp}</strong> experience (Your experience is <strong>{selectedJobForModal.expMatch.candidateExp} Yrs</strong>). </span>
                  )}
                  {!selectedJobForModal.genderMatch.isMatch && (
                    <span>Requires <strong>{selectedJobForModal.genderMatch.requiredGender}</strong> (Candidate gender is <strong>{selectedJobForModal.genderMatch.candidateGender}</strong>).</span>
                  )}
                </p>
              </div>
            )}

            {/* Full Job Description */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Job Description & Responsibilities</h4>
              <div className={`p-3 rounded-2xl border max-h-56 overflow-y-auto ${
                isDark ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}>
                <FormattedJobDescription
                  description={selectedJobForModal.job.description}
                  className="max-w-full text-xs"
                />
              </div>
            </div>

            {/* Education & Qualification with Differentiators */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Qualification & Education Requirements</h4>
              <div className={`p-3 rounded-2xl border text-xs space-y-2 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Accepted Degrees / Trades:</span>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                    selectedJobForModal.eduMatch.isMatch
                      ? isDark ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' : 'bg-emerald-100 border-emerald-300 text-emerald-800'
                      : isDark ? 'bg-amber-500/20 border-amber-500/30 text-amber-300' : 'bg-amber-100 border-amber-300 text-amber-800'
                  }`}>
                    {selectedJobForModal.eduMatch.isMatch ? '✓ Qualification Fits' : 'Mismatch'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(selectedJobForModal.eduMatch.allOptions && selectedJobForModal.eduMatch.allOptions.length > 0
                    ? selectedJobForModal.eduMatch.allOptions
                    : splitEducationRequirements(selectedJobForModal.job.qualification || selectedJobForModal.job.education || 'Any Qualification')
                  ).map((option, idx, arr) => {
                    const isOptionMatched = selectedJobForModal.eduMatch.matchedOptions?.includes(option) ||
                      (submittedCandidateData?.highestEducation && checkSingleRequirementMatch(submittedCandidateData.highestEducation, option));

                    return (
                      <React.Fragment key={option + idx}>
                        <span className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all inline-flex items-center gap-1.5 ${
                          isOptionMatched
                            ? isDark
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-bold shadow-sm ring-1 ring-emerald-500/30'
                              : 'bg-emerald-100 border-emerald-400 text-emerald-900 font-bold shadow-sm ring-1 ring-emerald-300'
                            : isDark
                            ? 'bg-white/5 border-white/10 text-slate-400'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}>
                          {isOptionMatched && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 stroke-[3]" />}
                          <span>{option}</span>
                        </span>
                        {idx < arr.length - 1 && (
                          <span className="text-xs font-extrabold text-slate-400 dark:text-slate-500 select-none px-0.5">
                            •
                          </span>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-white/10">
              <button
                onClick={() => setSelectedJobForModal(null)}
                className={`px-4 py-2 rounded-xl border font-bold text-xs transition-colors cursor-pointer ${
                  isDark ? 'bg-white/10 border-white/10 text-slate-300 hover:bg-white/15' : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Close
              </button>
              <button
                onClick={() => {
                  const match = selectedJobForModal;
                  setSelectedJobForModal(null);
                  handleOpenApplyModal(match);
                }}
                disabled={!selectedJobForModal.expMatch.isMatch || !selectedJobForModal.genderMatch.isMatch}
                className={`px-5 py-2 rounded-xl font-extrabold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                  (!selectedJobForModal.expMatch.isMatch || !selectedJobForModal.genderMatch.isMatch)
                    ? 'bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-slate-500 cursor-not-allowed border border-slate-300 dark:border-white/10'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                }`}
              >
                <span>{(!selectedJobForModal.expMatch.isMatch || !selectedJobForModal.genderMatch.isMatch) ? 'Criteria Unmet' : 'Apply & Start Interview'}</span>
                {(selectedJobForModal.expMatch.isMatch && selectedJobForModal.genderMatch.isMatch) && <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Apply & Start Pre-Interview Confirmation Modal */}
      {applyingJobModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className={`border rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 relative transition-colors ${
            isDark ? 'bg-[#0d0d0d] border-emerald-500/40 text-white' : 'bg-white border-emerald-500/30 text-slate-900'
          }`}>
            <button
              onClick={() => setApplyingJobModal(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white p-1 rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider border border-emerald-500/30">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Job Application & Interview Entry</span>
              </div>
              <h3 className="text-xl font-extrabold tracking-tight">
                Apply for {applyingJobModal.job.title}
              </h3>
              <p className="text-xs text-slate-400">
                Confirm your details to register your application interest with the recruiter before starting your interview.
              </p>
            </div>

            <form onSubmit={handleConfirmApplicationAndStart} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={applyName}
                    onChange={(e) => setApplyName(e.target.value)}
                    placeholder="Enter your full name..."
                    className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-xs font-semibold outline-none focus:border-emerald-500 ${
                      isDark ? 'bg-[#141414] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={applyEmail}
                    onChange={(e) => setApplyEmail(e.target.value)}
                    placeholder="Enter your email address..."
                    className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-xs font-semibold outline-none focus:border-emerald-500 ${
                      isDark ? 'bg-[#141414] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1">
                  Mobile / WhatsApp Number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                  <input
                    type="tel"
                    required
                    value={applyPhone}
                    onChange={(e) => setApplyPhone(e.target.value)}
                    placeholder="Enter mobile number..."
                    className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-xs font-semibold outline-none focus:border-emerald-500 ${
                      isDark ? 'bg-[#141414] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300 space-y-1">
                <span className="font-extrabold block">✓ Direct Recruiter Notification</span>
                <p className="text-slate-300 text-[10px]">
                  Your application will be marked in the hiring manager's portal. Green status will be marked upon interview completion!
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setApplyingJobModal(null)}
                  className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                    isDark ? 'bg-white/10 border-white/10 text-slate-300 hover:bg-white/15' : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingApplication}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingApplication ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <span>Confirm & Start</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const isDisqualificationReason = (reason: string): boolean => {
  if (!reason) return false;
  const lower = reason.toLowerCase();
  return lower.includes('requires female') || lower.includes('requires male') || lower.includes('minimum') || lower.includes('disqualif');
};
