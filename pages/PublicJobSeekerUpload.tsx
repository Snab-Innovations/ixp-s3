import React, { useState } from 'react';
import { Sparkles, CheckCircle2, Upload, FileText, User, Mail, Phone, MapPin, Briefcase, GraduationCap, ArrowRight, RefreshCw, Plus, X, Tag, IndianRupee, Clock, UserCheck, DollarSign } from 'lucide-react';
import { LocationCityInput } from '../components/LocationCityInput';
import { EducationInput } from '../components/EducationInput';
import { parseResumeFileLocally, saveResumeDumpCandidate } from '../services/resumeService';
import { uploadToCloudinary } from '../services/api';
import { ALL_EDUCATION_DEGREES } from '../data/allEducationDegrees';
import { MAHARASHTRA_CITIES } from '../data/maharashtraCities';
import { useMessageBox } from '../components/MessageBox';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';

const matchEducationToAvailableFormat = (rawEdu: string): string => {
  if (!rawEdu || !rawEdu.trim()) return '';
  const text = rawEdu.toLowerCase().trim();

  // 1. Direct match
  const exact = ALL_EDUCATION_DEGREES.find(deg => deg.toLowerCase() === text);
  if (exact) return exact;

  // 2. Civil Engineering
  if (text.includes('civil')) {
    if (text.includes('diploma') || text.includes('polytechnic')) return "Diploma in Civil Engineering";
    if (text.includes('m.tech') || text.includes('m.e') || text.includes('master') || text.includes('structur')) return "M.Tech / M.E. - Structural Engineering";
    return "B.Tech / B.E. - Civil Engineering";
  }

  // 3. Mechanical
  if (text.includes('mechanic')) {
    if (text.includes('diploma') || text.includes('polytechnic')) return "Diploma in Mechanical Engineering";
    return "B.Tech / B.E. - Mechanical Engineering";
  }

  // 4. Computer Science / IT / CSE
  if (text.includes('computer') || text.includes('cse') || text.includes('it') || text.includes('software') || text.includes('information tech')) {
    if (text.includes('diploma') || text.includes('polytechnic')) return "Diploma in Computer Engineering / IT";
    if (text.includes('bca')) return "BCA - Bachelor of Computer Applications";
    if (text.includes('mca')) return "MCA - Master of Computer Applications";
    return "B.Tech / B.E. - Computer Science & Engineering (CSE)";
  }

  // 5. Electrical / Electronics / E&TC
  if (text.includes('electrical') || text.includes('electronic') || text.includes('telecom') || text.includes('e&tc') || text.includes('entc')) {
    if (text.includes('diploma') || text.includes('polytechnic')) return "Diploma in Electrical Engineering";
    return "B.Tech / B.E. - Electrical Engineering";
  }

  // 6. Automobile
  if (text.includes('auto') || text.includes('vehicle')) {
    if (text.includes('diploma')) return "Diploma in Automobile Engineering";
    return "B.Tech / B.E. - Automobile Engineering";
  }

  // 7. Management / MBA
  if (text.includes('mba') || text.includes('business admin') || text.includes('management')) {
    if (text.includes('hr') || text.includes('human resource')) return "MBA - Human Resources (HR)";
    if (text.includes('finance')) return "MBA - Finance Management";
    if (text.includes('market')) return "MBA - Marketing Management";
    return "MBA - Master of Business Administration";
  }

  // 8. Commerce / B.Com
  if (text.includes('b.com') || text.includes('commerce') || text.includes('account') || text.includes('finance')) {
    if (text.includes('m.com') || text.includes('master of commerce')) return "M.Com - Master of Commerce";
    return "B.Com - Bachelor of Commerce";
  }

  // 9. Arts / BA
  if (text.includes('b.a') || text.includes('bachelor of arts') || text.includes('humanities')) {
    return "B.A - Bachelor of Arts";
  }

  // 10. Science / B.Sc
  if (text.includes('b.sc') || text.includes('bachelor of science')) {
    return "B.Sc - Bachelor of Science";
  }

  // Fallback keyword match in available degrees
  const keywordMatch = ALL_EDUCATION_DEGREES.find(deg => {
    const degLower = deg.toLowerCase();
    return text.split(/\s+/).some(w => w.length > 3 && degLower.includes(w));
  });

  return keywordMatch || '';
};

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

  // Do NOT forcefully select any other city if not present/matched!
  return '';
};

export default function PublicJobSeekerUpload() {
  const messageBox = useMessageBox();

  // Form State
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [candidatePhone, setCandidatePhone] = useState('');
  const [candidateGender, setCandidateGender] = useState('');
  const [candidateLocation, setCandidateLocation] = useState('');
  const [candidateExp, setCandidateExp] = useState('');
  const [candidateEducation, setCandidateEducation] = useState('');
  const [candidateEmploymentStatus, setCandidateEmploymentStatus] = useState('Working'); // 'Working' | 'Not Working' | 'Serving Notice'
  const [candidateNoticePeriodVal, setCandidateNoticePeriodVal] = useState('');
  const [candidateNoticePeriodUnit, setCandidateNoticePeriodUnit] = useState<'Days' | 'Months'>('Days');
  const [candidateCurrentSalary, setCandidateCurrentSalary] = useState('');
  const [candidateExpectedSalary, setCandidateExpectedSalary] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extraBioText, setExtraBioText] = useState('');

  // Skills Auto-Fetch & Editing State
  const [extractedSkills, setExtractedSkills] = useState<string[]>([]);
  const [newSkillInput, setNewSkillInput] = useState('');
  const [isParsingResume, setIsParsingResume] = useState(false);
  const [parsedProfileData, setParsedProfileData] = useState<{ profile: any; resumeText: string } | null>(null);

  // Processing & Success State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittedSuccess, setIsSubmittedSuccess] = useState(false);
  const [submittedCandidateData, setSubmittedCandidateData] = useState<any>(null);

  // Handle file selection & local text analysis (NO cloud upload yet!)
  const handleFileSelection = async (file: File) => {
    setSelectedFile(file);
    setIsParsingResume(true);
    try {
      // Analyze resume text locally without cloud storage upload
      const ingested = await parseResumeFileLocally(file, {}, extraBioText);
      setParsedProfileData(ingested);

      if (ingested.profile) {
        // Auto-fill contact details if empty
        if (ingested.profile.name && !candidateName.trim()) setCandidateName(ingested.profile.name);
        if (ingested.profile.email && !candidateEmail.trim()) setCandidateEmail(ingested.profile.email);
        if (ingested.profile.phone && !candidatePhone.trim()) setCandidatePhone(ingested.profile.phone);

        // Auto-fill location ONLY if detected from resume and matches present cities
        if (ingested.profile.location) {
          const matchedCity = matchExtractedLocationToPresentCity(ingested.profile.location);
          if (matchedCity && !candidateLocation.trim()) {
            setCandidateLocation(matchedCity);
          }
        }

        // Auto-fetch & populate extracted skills
        if (Array.isArray(ingested.profile.skills) && ingested.profile.skills.length > 0) {
          setExtractedSkills(ingested.profile.skills);
          messageBox.showSuccess(`AI analyzed resume & auto-fetched ${ingested.profile.skills.length} skills!`);
        } else {
          messageBox.showSuccess("Resume parsed locally. Please verify your details below.");
        }
      }
    } catch (err: any) {
      console.error("Resume Local Parsing Error:", err);
      messageBox.showInfo("Resume attached. You can fill or verify your details below.");
    } finally {
      setIsParsingResume(false);
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
    if (!candidateEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail.trim())) {
      messageBox.showError("Please enter a valid Email Address.");
      return;
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
      messageBox.showError("Please select or type your Location / City.");
      return;
    }
    if (!candidateExp.trim()) {
      messageBox.showError("Please specify your Experience in Years.");
      return;
    }
    if (!candidateEducation.trim()) {
      messageBox.showError("Please select or type your Highest Education Qualification.");
      return;
    }
    if (!candidateEmploymentStatus.trim()) {
      messageBox.showError("Please select your Current Working / Employment Status.");
      return;
    }
    if (!candidateNoticePeriodVal.trim()) {
      messageBox.showError("Please enter your Notice Period (in days or months).");
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

    if (!selectedFile) {
      messageBox.showError("Please attach your Resume file (PDF, DOCX, TXT).");
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Upload Resume file to Cloudinary / AWS S3 only on form submission
      let resumeUrl = '';
      try {
        resumeUrl = await uploadToCloudinary(selectedFile);
      } catch (uploadErr) {
        console.warn("Cloudinary upload fallback to blob URL:", uploadErr);
        resumeUrl = URL.createObjectURL(selectedFile);
      }

      // 2. Prepare profile object
      const finalProfile = parsedProfileData?.profile ? { ...parsedProfileData.profile } : {};
      const finalResumeText = parsedProfileData?.resumeText || extraBioText || '';

      finalProfile.name = candidateName.trim();
      finalProfile.email = candidateEmail.trim().toLowerCase();
      finalProfile.phone = candidatePhone.trim();
      finalProfile.gender = candidateGender;
      finalProfile.location = candidateLocation.trim();
      finalProfile.skills = extractedSkills;

      const expNum = parseFloat(candidateExp) || 0;
      finalProfile.experienceYears = expNum;

      // Salary & Notice Period & Employment Status fields
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

      if (!finalProfile.workExperience || finalProfile.workExperience.length === 0) {
        finalProfile.workExperience = [
          {
            title: 'Candidate Specified Experience',
            company: 'Professional Background',
            startDate: '',
            endDate: 'Present',
            highlights: [extraBioText.trim() || `Candidate indicated ${expNum} years of relevant experience.`],
            skills: extractedSkills
          }
        ];
      }

      const selectedDegree = candidateEducation.trim();
      const existingEdu = finalProfile.education || [];
      finalProfile.education = [
        { degree: selectedDegree, institution: 'Candidate Specified Qualification', year: '' },
        ...existingEdu.filter((e: any) => e.degree?.toLowerCase() !== selectedDegree.toLowerCase())
      ];

      // 3. Save candidate into DSource talent roster in Firestore
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
        resumeUrl,
        fileName: selectedFile.name,
        mimeType: selectedFile.type,
        fileSize: selectedFile.size,
        additionalText: extraBioText.trim(),
        source: 'public_job_seeker_upload'
      });

      const formattedStatus = candidateEmploymentStatus === 'Working' ? 'Currently Working' : candidateEmploymentStatus;

      setSubmittedCandidateData({
        name: candidateName.trim(),
        email: candidateEmail.trim().toLowerCase(),
        phone: candidatePhone.trim(),
        location: candidateLocation.trim(),
        experience: expNum,
        education: selectedDegree,
        employmentStatus: formattedStatus,
        noticePeriod: `${candidateNoticePeriodVal.trim()} ${candidateNoticePeriodUnit}`,
        currentSalary: candidateCurrentSalary.trim(),
        expectedSalary: candidateExpectedSalary.trim(),
        fileName: selectedFile.name,
        skills: extractedSkills
      });

      setIsSubmittedSuccess(true);
      messageBox.showSuccess("Your resume & profile have been uploaded & submitted to DSource Talent Pool!");
    } catch (err: any) {
      console.error("Public Job Seeker Resume Upload Error:", err);
      messageBox.showError(err.message || "Failed to upload resume. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setCandidateName('');
    setCandidateEmail('');
    setCandidatePhone('');
    setCandidateLocation('');
    setCandidateExp('');
    setCandidateEducation('');
    setCandidateEmploymentStatus('Working');
    setCandidateNoticePeriodVal('');
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
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans transition-colors duration-200">
      {/* Top Navbar Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Logo className="h-9 w-auto object-contain" isDark={false} />
          <div className="hidden sm:block border-l border-slate-200 pl-3">
            <span className="font-bold text-base tracking-tight text-slate-900 block">DSource</span>
            <span className="text-[11px] font-mono text-emerald-600 font-semibold block -mt-0.5">Candidate Career Roster</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/jobs"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 transition-all shadow-sm"
          >
            <Briefcase className="w-4 h-4 text-emerald-600" />
            <span>View DSource Openings</span>
          </Link>
        </div>
      </header>

      {/* Main Hero Container */}
      <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {!isSubmittedSuccess ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Header Banner */}
            <div className="text-center space-y-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>DSource Automated Candidate Roster</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                Submit Your Resume to DSource Talent Pool
              </h1>
              <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
                Upload your candidate profile once. Our automated AI parser extracts your skills, experience, and education, pre-fills your profile, and saves your resume into DSource's recruiter database for immediate job matching!
              </p>
            </div>

            {/* Upload Form Card */}
            <form
              onSubmit={handleSubmit}
              className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6"
            >
              {/* Step 1: File Dropzone First to Auto-Fetch Skills & Education */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase text-slate-700 flex items-center gap-1.5">
                    <Upload className="w-4 h-4 text-emerald-600" />
                    <span>Upload Resume File (PDF, DOCX, TXT) <span className="text-red-500">*</span></span>
                  </label>
                  {isParsingResume && (
                    <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1.5 animate-pulse">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>AI Extracting Profile & Skills...</span>
                    </span>
                  )}
                </div>

                <div
                  className={`relative flex flex-col items-center justify-center p-6 sm:p-8 border-2 border-dashed rounded-2xl transition-all cursor-pointer text-center ${
                    selectedFile
                      ? 'border-emerald-500 bg-emerald-50/70'
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
                  <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3 shadow-inner">
                    {isParsingResume ? <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" /> : <Upload className="w-6 h-6" />}
                  </div>

                  {selectedFile ? (
                    <div className="space-y-1">
                      <span className="font-bold text-sm text-emerald-800 block">
                        ✓ File Attached: {selectedFile.name}
                      </span>
                      <span className="text-xs text-slate-500 block">
                        Size: {(selectedFile.size / 1024).toFixed(1)} KB (File will be stored securely upon clicking Submit)
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <span className="font-bold text-sm text-slate-800 block">
                        Click to browse or drag & drop your resume file
                      </span>
                      <span className="text-xs text-slate-500 block">
                        PDF, DOCX, and TXT formats supported (Auto-fetches skills & location)
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 2: Auto-Fetched Skills Roster */}
              {(extractedSkills.length > 0 || selectedFile) && (
                <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-emerald-600" />
                      <span className="font-extrabold text-xs uppercase tracking-wider text-slate-900">
                        Fetched Skills & Technical Competencies ({extractedSkills.length})
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      * Auto-extracted from your resume. You can add or remove skills below.
                    </span>
                  </div>

                  {/* Skills Tags */}
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                    {extractedSkills.map((skill) => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 border border-emerald-300 text-emerald-900 shadow-sm"
                      >
                        <span>{skill}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSkill(skill)}
                          className="hover:text-red-600 transition-colors ml-0.5 p-0.5 cursor-pointer"
                          title="Remove Skill"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                    {extractedSkills.length === 0 && (
                      <span className="text-xs text-slate-400 italic">No skills extracted yet. Type below to add your skills.</span>
                    )}
                  </div>

                  {/* Add Custom Skill */}
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
                      placeholder="Add another key skill (e.g. React, Java, AutoCAD, Python)..."
                      className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 outline-none focus:border-emerald-500 placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={handleAddSkill}
                      className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 transition-colors flex items-center gap-1 shrink-0 cursor-pointer shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Skill</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Contact & Qualification Details */}
              <div className="border-t border-slate-200 pt-5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-900 font-extrabold text-base sm:text-lg">
                  <User className="w-5 h-5 text-emerald-600" />
                  <h2>Personal & Qualification Details</h2>
                </div>
                <span className="text-xs text-red-500 font-semibold">* Mandatory Fields</span>
              </div>

              {/* Personal Details Row */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
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
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs sm:text-sm text-slate-900 outline-none focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={candidateEmail}
                      onChange={(e) => setCandidateEmail(e.target.value)}
                      placeholder="e.g. rahul.sharma@example.com"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs sm:text-sm text-slate-900 outline-none focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
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
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs sm:text-sm text-slate-900 outline-none focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
                    Gender <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={candidateGender}
                    onChange={(e) => setCandidateGender(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs sm:text-sm text-slate-900 outline-none focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all font-semibold"
                  >
                    <option value="">-- Select Gender --</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Any">Prefer Not To Say / Any</option>
                  </select>
                </div>
              </div>

              {/* Location, Exp, Education Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
                    Location / City <span className="text-red-500">*</span>
                  </label>
                  <LocationCityInput
                    value={candidateLocation}
                    onChange={setCandidateLocation}
                    placeholder="Search city (e.g. Nashik, Pune, Mumbai)..."
                    className="w-full rounded-xl bg-slate-50 border border-slate-300 p-2.5 text-xs sm:text-sm text-slate-900 outline-none focus:border-emerald-500 focus:bg-white placeholder:text-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
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
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs sm:text-sm text-slate-900 outline-none focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
                    Highest Education <span className="text-red-500">*</span>
                  </label>
                  <EducationInput
                    value={candidateEducation}
                    onChange={setCandidateEducation}
                    placeholder="Select or type degree..."
                    className="w-full rounded-xl bg-slate-50 border border-slate-300 p-2.5 text-xs sm:text-sm text-slate-900 outline-none focus:border-emerald-500 focus:bg-white placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Working Status & Notice Period Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Current Working / Not Working */}
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>Working Status <span className="text-red-500">*</span></span>
                    <span className="text-[11px] text-slate-400 font-normal">Currently employed?</span>
                  </label>
                  <div className="relative">
                    <UserCheck className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                    <select
                      required
                      value={candidateEmploymentStatus}
                      onChange={(e) => setCandidateEmploymentStatus(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs sm:text-sm text-slate-900 outline-none focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all font-semibold"
                    >
                      <option value="Working">Currently Working (Employed)</option>
                      <option value="Not Working">Not Working (Unemployed)</option>
                      <option value="Serving Notice">Serving Notice Period</option>
                    </select>
                  </div>
                </div>

                {/* Notice Period in Days / Month */}
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>Notice Period <span className="text-red-500">*</span></span>
                    <span className="text-[11px] text-slate-400 font-normal">In Days or Months</span>
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
                        placeholder="e.g. 30 or 1"
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs sm:text-sm text-slate-900 outline-none focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
                      />
                    </div>
                    <select
                      value={candidateNoticePeriodUnit}
                      onChange={(e) => setCandidateNoticePeriodUnit(e.target.value as 'Days' | 'Months')}
                      className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs sm:text-sm text-slate-900 font-bold outline-none focus:border-emerald-500 focus:bg-white shrink-0 cursor-pointer"
                    >
                      <option value="Days">Days</option>
                      <option value="Months">Months</option>
                    </select>
                  </div>
                  {/* Quick Select Presets */}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="text-[10px] font-semibold text-slate-400">Quick select:</span>
                    {[
                      { label: 'Immediate (0d)', val: '0', unit: 'Days' },
                      { label: '15 Days', val: '15', unit: 'Days' },
                      { label: '30 Days (1 Mo)', val: '30', unit: 'Days' },
                      { label: '60 Days (2 Mo)', val: '60', unit: 'Days' },
                      { label: '90 Days (3 Mo)', val: '90', unit: 'Days' }
                    ].map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setCandidateNoticePeriodVal(p.val);
                          setCandidateNoticePeriodUnit(p.unit as 'Days' | 'Months');
                        }}
                        className={`text-[10px] px-2 py-0.5 rounded-md border font-medium transition-all ${
                          candidateNoticePeriodVal === p.val && candidateNoticePeriodUnit === p.unit
                            ? 'bg-emerald-100 border-emerald-400 text-emerald-800 font-bold'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Salary Fields Row: Current Salary & Expected Salary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Current Salary */}
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>Current Salary <span className="text-red-500">*</span></span>
                    <span className="text-[11px] text-slate-400 font-normal">CTC per Annum / Month</span>
                  </label>
                  <div className="relative">
                    <IndianRupee className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={candidateCurrentSalary}
                      onChange={(e) => setCandidateCurrentSalary(e.target.value)}
                      placeholder="e.g. 4.5 LPA or 35,000 / month (0 if fresher)"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs sm:text-sm text-slate-900 outline-none focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
                    />
                  </div>
                </div>

                {/* Expected Salary */}
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>Expected Salary <span className="text-red-500">*</span></span>
                    <span className="text-[11px] text-slate-400 font-normal">Desired CTC</span>
                  </label>
                  <div className="relative">
                    <IndianRupee className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={candidateExpectedSalary}
                      onChange={(e) => setCandidateExpectedSalary(e.target.value)}
                      placeholder="e.g. 6.5 LPA or 50,000 / month"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs sm:text-sm text-slate-900 outline-none focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
                    />
                  </div>
                </div>
              </div>

              {/* Extra Bio / Notes */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
                  Preferred Domain Roles & Additional Notes (Optional)
                </label>
                <textarea
                  rows={3}
                  value={extraBioText}
                  onChange={(e) => setExtraBioText(e.target.value)}
                  placeholder="Mention preferred job roles, expected CTC, or work availability..."
                  className="w-full p-3 rounded-xl bg-slate-50 border border-slate-300 text-xs sm:text-sm text-slate-900 outline-none focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || isParsingResume}
                className="w-full py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm sm:text-base flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-emerald-600/25 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Uploading Resume & Saving Candidate Profile...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    <span>Submit Resume to DSource Talent Pool</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* Success Confirmation View */
          <div className="bg-white border border-emerald-300 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-6 text-center animate-in zoom-in-95 duration-300">
            <div className="h-16 w-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                Resume Submitted to DSource!
              </h2>
              <p className="text-slate-600 text-sm sm:text-base max-w-lg mx-auto leading-relaxed">
                Thank you, <strong>{submittedCandidateData?.name}</strong>! Your profile & resume have been registered in DSource's recruiter roster.
              </p>
            </div>

            {/* Profile Summary Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left max-w-lg mx-auto space-y-3 text-xs sm:text-sm">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="font-bold text-slate-700">DSource Talent Roster Status</span>
                <span className="font-mono text-emerald-700 font-extrabold">VERIFIED</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-800">
                <div><strong>Email:</strong> {submittedCandidateData?.email}</div>
                <div><strong>Phone:</strong> {submittedCandidateData?.phone}</div>
                <div><strong>Location:</strong> {submittedCandidateData?.location}</div>
                <div><strong>Experience:</strong> {submittedCandidateData?.experience} Years</div>
                <div><strong>Working Status:</strong> {submittedCandidateData?.employmentStatus}</div>
                <div><strong>Notice Period:</strong> {submittedCandidateData?.noticePeriod}</div>
                <div><strong>Current Salary:</strong> {submittedCandidateData?.currentSalary}</div>
                <div><strong>Expected Salary:</strong> {submittedCandidateData?.expectedSalary}</div>
                <div className="col-span-2"><strong>Highest Education:</strong> {submittedCandidateData?.education}</div>
              </div>

              {submittedCandidateData?.skills && submittedCandidateData.skills.length > 0 && (
                <div className="pt-2 border-t border-slate-200">
                  <span className="font-bold block mb-1.5 text-slate-900">Registered Skills ({submittedCandidateData.skills.length}):</span>
                  <div className="flex flex-wrap gap-1">
                    {submittedCandidateData.skills.map((s: string) => (
                      <span key={s} className="px-2 py-0.5 rounded bg-emerald-100 border border-emerald-300 text-[11px] font-bold text-emerald-900">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
              <button
                onClick={handleResetForm}
                className="px-5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 font-bold text-xs sm:text-sm hover:bg-slate-100 transition-colors shadow-sm cursor-pointer"
              >
                Submit Another Resume
              </button>
              <Link
                to="/jobs"
                className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-extrabold text-xs sm:text-sm hover:bg-emerald-500 transition-colors flex items-center gap-1.5 shadow-md cursor-pointer"
              >
                <span>Browse DSource Job Openings</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
