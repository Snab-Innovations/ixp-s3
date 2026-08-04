import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { createPortal } from 'react-dom';
import { SKILL_OPTIONS, JOB_CATEGORIES } from './Profile';
import { parseJobDescriptionText, ParsedJdResult } from '../services/geminiService';
import * as pdfjsLib from 'pdfjs-dist';

interface EditJobModalProps {
  jobId: string;
  onClose: () => void;
}

export interface CandidateContact {
  email: string;
  phone: string;
  name?: string;
}

const EditJobModal: React.FC<EditJobModalProps> = ({ jobId, onClose }) => {
  const { user, userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  interface CustomField { id: number; key: string; value: string; }
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [accessCode, setAccessCode] = useState('');
  const [tempCustomField, setTempCustomField] = useState({ key: '', value: '' });
  const [manualQuestions, setManualQuestions] = useState<string[]>([]);
  const [currentManualQuestion, setCurrentManualQuestion] = useState('');

  // Candidates contacts state (email & phone)
  const [candidateEmails, setCandidateEmails] = useState<string[]>([]);
  const [candidateDataList, setCandidateDataList] = useState<CandidateContact[]>([]);
  const [currentEmail, setCurrentEmail] = useState('');
  const [currentPhone, setCurrentPhone] = useState('');

  // AI JD Auto-Fill state
  const [parsingJd, setParsingJd] = useState(false);
  const [jdImportMode, setJdImportMode] = useState<'upload' | 'paste'>('upload');
  const [pastedJdText, setPastedJdText] = useState('');

  const [eduInput, setEduInput] = useState('');
  const [skillSearch, setSkillSearch] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    companyName: '',
    qualifications: '',
    deadline: '',
    description: '',
    permission: 'anyone',
    skills: '',
    category: '',
    numQuestions: 5,
    employmentType: 'Full-time',
    minExperience: 0,
    maxExperience: 0,
    experience: 0,
    difficulty: 'Easy',
    location: '',
    salaryRange: '',
    genderRequirement: 'Any',
    strictness: 'Low',
  });

  const handleApplyParsedJdData = (parsed: ParsedJdResult) => {
    setFormData(prev => ({
      ...prev,
      title: parsed.title || parsed.vacancyName || parsed.designation || prev.title,
      description: parsed.description || prev.description,
      category: parsed.department || parsed.industry || parsed.roleCategory || prev.category,
      employmentType: parsed.employmentType || prev.employmentType,
      minExperience: parsed.minExperience !== undefined ? Number(parsed.minExperience) : prev.minExperience,
      maxExperience: parsed.maxExperience !== undefined ? Number(parsed.maxExperience) : prev.maxExperience,
      experience: parsed.minExperience !== undefined ? Number(parsed.minExperience) : prev.experience,
      skills: parsed.skills || (parsed.technicalSkills && parsed.softSkills ? `${parsed.technicalSkills}, ${parsed.softSkills}` : prev.skills),
      qualifications: parsed.qualification || parsed.education || prev.qualifications,
      location: (parsed as any).location || prev.location,
      salaryRange: (parsed as any).salaryRange || (parsed as any).salary || prev.salaryRange,
      genderRequirement: (parsed as any).genderRequirement || (parsed as any).gender || prev.genderRequirement,
    }));

    if (parsed.customFields && Array.from(parsed.customFields).length > 0) {
      const newFields = parsed.customFields.map((cf, idx) => ({
        id: Date.now() + idx,
        key: cf.key.trim(),
        value: cf.value.trim()
      }));

      setCustomFields(prev => {
        const existingKeys = new Set(prev.map(f => f.key.toLowerCase()));
        const filteredNew = newFields.filter(f => !existingKeys.has(f.key.toLowerCase()));
        return [...prev, ...filteredNew];
      });
    }
  };

  const handleParsePastedJDText = async () => {
    if (!pastedJdText.trim()) {
      alert('Please paste some Job Description text first.');
      return;
    }

    setParsingJd(true);
    try {
      const parsedData = await parseJobDescriptionText(pastedJdText.trim());
      handleApplyParsedJdData(parsedData);
      alert('✅ Job description parsed! All details & dynamic custom fields updated.');
    } catch (error: any) {
      console.error('Error parsing pasted JD:', error);
      alert(`❌ Failed to parse pasted JD text: ${error.message || 'AI parsing error'}`);
    } finally {
      setParsingJd(false);
    }
  };

  const handleJDUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsingJd(true);
    let text = '';
    try {
      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          text += textContent.items.map((item: any) => item.str).join(' ');
        }
      } else if (file.type === 'text/plain') {
        text = await file.text();
      } else {
        alert('Unsupported file type. Please upload a PDF or TXT file.');
        setParsingJd(false);
        return;
      }

      if (!text.trim()) {
        alert('Could not extract text from the document.');
        setParsingJd(false);
        return;
      }

      const parsedData = await parseJobDescriptionText(text);
      handleApplyParsedJdData(parsedData);
      alert('✅ Job description document parsed! All details & dynamic custom fields updated.');
    } catch (error) {
      console.error('Error parsing JD:', error);
      alert('❌ Failed to parse job description document.');
    } finally {
      setParsingJd(false);
      e.target.value = '';
    }
  };

  useEffect(() => {
    const fetchJob = async () => {
      try {
        if (!jobId || !user) return;

        const jobDocRef = doc(db, 'jobs', jobId);
        const interviewDocRef = doc(db, 'interviews', jobId);

        const [jobDocSnap, interviewDocSnap] = await Promise.all([
          getDoc(jobDocRef),
          getDoc(interviewDocRef)
        ]);

        if (jobDocSnap.exists() || interviewDocSnap.exists()) {
          const jobData = jobDocSnap.data() || {};
          const interviewData = interviewDocSnap.data() || {};
          const sourceData = jobDocSnap.exists() ? jobData : interviewData;

          if (sourceData.recruiterUID !== user.uid) {
            alert("You do not have permission to edit this item.");
            onClose();
            return;
          }

          setAccessCode(sourceData.accessCode || interviewData.accessCode || jobData.accessCode || '');

          let deadlineStr = '';
          const deadlineSource = jobData.applyDeadline || interviewData.deadline || jobData.deadline;
          if (deadlineSource) {
            if (deadlineSource.toDate) {
              deadlineStr = deadlineSource.toDate().toISOString().split('T')[0];
            } else if (typeof deadlineSource === 'string') {
              deadlineStr = deadlineSource;
            }
          }

          setFormData({
            title: jobData.title || interviewData.title?.replace(' Interview', '') || '',
            companyName: jobData.companyName || interviewData.companyName || 'N/A',
            qualifications: jobData.qualifications || interviewData.education || interviewData.qualification || '',
            deadline: deadlineStr,
            description: jobData.description || interviewData.description || '',
            permission: jobData.interviewPermission || jobData.permission || interviewData.permission || 'anyone',
            skills: jobData.skills || interviewData.skills || '',
            category: jobData.category || interviewData.department || '',
            numQuestions: jobData.numQuestions || interviewData.numQuestions || 5,
            employmentType: jobData.employmentType || interviewData.employmentType || 'Full-time',
            minExperience: jobData.minExperience ?? interviewData.minExperience ?? jobData.experience ?? interviewData.experience ?? 0,
            maxExperience: jobData.maxExperience ?? interviewData.maxExperience ?? jobData.experience ?? interviewData.experience ?? 0,
            experience: jobData.experience ?? interviewData.experience ?? 0,
            difficulty: jobData.difficulty || interviewData.difficulty || 'Easy',
            location: jobData.location || interviewData.location || '',
            salaryRange: jobData.salaryRange || jobData.salary || interviewData.salaryRange || interviewData.salary || '',
            genderRequirement: jobData.genderRequirement || jobData.gender || interviewData.genderRequirement || interviewData.gender || 'Any',
            strictness: jobData.strictness || interviewData.strictness || 'Low',
          });

          setCustomFields(jobData.customFields || interviewData.customFields || []);
          setManualQuestions(interviewData.manualQuestions || jobData.manualQuestions || []);

          // Parse candidates
          const emails = interviewData.candidateEmails || jobData.candidateEmails || [];
          setCandidateEmails(emails);

          const candDataRaw = interviewData.candidateData || interviewData.candidateDataList || jobData.candidateData || jobData.candidateDataList || [];
          if (Array.isArray(candDataRaw) && candDataRaw.length > 0) {
            setCandidateDataList(candDataRaw);
          } else if (emails.length > 0) {
            setCandidateDataList(emails.map((e: string) => ({ email: e, phone: '' })));
          }

        } else {
          alert("Job or Interview not found.");
          onClose();
        }
      } catch (err) {
        console.error("Error fetching job:", err);
        alert("Error loading job details");
        onClose();
      } finally {
        if (jobId && user) setLoading(false);
      }
    };

    fetchJob();
  }, [jobId, user, onClose]);

  const handleAddCustomField = () => {
    if (tempCustomField.key.trim() && tempCustomField.value.trim()) {
      setCustomFields([...customFields, { ...tempCustomField, id: Date.now() }]);
      setTempCustomField({ key: '', value: '' });
    }
  };

  const handleRemoveCustomField = (id: number) => {
    setCustomFields(customFields.filter(field => field.id !== id));
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = {
        ...prev,
        [name]: ['experience', 'minExperience', 'maxExperience', 'numQuestions'].includes(name) ? Number(value) : value
      };
      if (name === 'minExperience') {
        updated.experience = Number(value);
      }
      return updated;
    });
  };

  const handleAddManualQuestion = () => {
    if (currentManualQuestion.trim()) {
      setManualQuestions([...manualQuestions, currentManualQuestion.trim()]);
      setCurrentManualQuestion('');
    }
  };

  const handleRemoveManualQuestion = (index: number) => {
    setManualQuestions(manualQuestions.filter((_, i) => i !== index));
  };

  const handleAddCandidate = () => {
    const trimmedEmail = currentEmail.trim();
    const trimmedPhone = currentPhone.trim();

    if (!trimmedEmail && !trimmedPhone) return;

    const newContact: CandidateContact = {
      email: trimmedEmail,
      phone: trimmedPhone
    };

    if (trimmedEmail && !candidateEmails.includes(trimmedEmail)) {
      setCandidateEmails(prev => [...prev, trimmedEmail]);
    }

    setCandidateDataList(prev => {
      const exists = prev.some(c => (trimmedEmail && c.email === trimmedEmail) || (trimmedPhone && c.phone === trimmedPhone));
      if (!exists) {
        return [...prev, newContact];
      }
      return prev;
    });

    setCurrentEmail('');
    setCurrentPhone('');
  };

  const handleRemoveCandidate = (index: number) => {
    const target = candidateDataList[index];
    if (!target) return;

    setCandidateDataList(prev => prev.filter((_, i) => i !== index));
    if (target.email) {
      setCandidateEmails(prev => prev.filter(e => e !== target.email));
    }
  };

  const toggleSkill = (skillName: string) => {
    const trimmed = skillName.trim();
    if (!trimmed) return;

    const currentSkills = formData.skills 
      ? formData.skills.split(',').map(s => s.trim()).filter(s => s.length > 0) 
      : [];
    
    let newSkills: string[];
    if (currentSkills.includes(trimmed)) {
      newSkills = currentSkills.filter(s => s !== trimmed);
    } else {
      newSkills = [...currentSkills, trimmed];
    }
    setFormData({ ...formData, skills: newSkills.join(', ') });
  };

  const removeSkill = (skillName: string) => {
    const currentSkills = formData.skills 
      ? formData.skills.split(',').map(s => s.trim()).filter(s => s.length > 0) 
      : [];
    const newSkills = currentSkills.filter(s => s !== skillName.trim());
    setFormData({ ...formData, skills: newSkills.join(', ') });
  };

  const toggleEducation = (edu: string) => {
    const currentEducations = formData.qualifications
      ? formData.qualifications.split(',').map(e => e.trim()).filter(e => e)
      : [];

    let newEducations;
    if (currentEducations.includes(edu)) {
      newEducations = currentEducations.filter(e => e !== edu);
    } else {
      newEducations = [...currentEducations, edu];
    }
    setFormData({ ...formData, qualifications: newEducations.join(', ') });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !jobId) return;

    if (Number(formData.maxExperience) < Number(formData.minExperience)) {
      alert("❌ Maximum experience cannot be less than minimum experience.");
      return;
    }

    setSaving(true);

    try {
      const deadlineDate = formData.deadline ? new Date(formData.deadline) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const jobDocRef = doc(db, 'jobs', jobId);
      const interviewDocRef = doc(db, 'interviews', jobId);

      const allEmails = Array.from(new Set([
        ...candidateEmails,
        ...candidateDataList.map(c => c.email).filter(Boolean)
      ]));

      const minExp = Number(formData.minExperience) || 0;
      const maxExp = Number(formData.maxExperience) || 0;
      const expString = maxExp > minExp ? `${minExp} - ${maxExp} Years` : (minExp > 0 ? `${minExp} Years` : '0 - 2 Years');

      const jobPayload = {
        title: formData.title,
        companyName: formData.companyName,
        qualifications: formData.qualifications,
        description: formData.description,
        interviewPermission: formData.permission,
        permission: formData.permission,
        skills: formData.skills,
        numQuestions: Number(formData.numQuestions),
        customFields,
        category: formData.category,
        department: formData.category,
        employmentType: formData.employmentType,
        minExperience: minExp,
        maxExperience: maxExp,
        experience: expString,
        location: formData.location,
        salaryRange: formData.salaryRange,
        salary: formData.salaryRange,
        genderRequirement: formData.genderRequirement,
        gender: formData.genderRequirement,
        strictness: formData.strictness,
        applyDeadline: Timestamp.fromDate(deadlineDate),
        difficulty: formData.difficulty,
        updatedAt: serverTimestamp(),
        recruiterUID: user.uid,
        recruiterName: userProfile?.fullname || (userProfile as any)?.name || user.email,
        recruiterEmail: user.email,
        interviewLink: `${window.location.origin}/#/interview/${jobId}`,
        accessCode: accessCode,
        isMock: false,
      };

      const interviewPayload = {
        title: `${formData.title} Interview`,
        description: formData.description,
        department: formData.category,
        employmentType: formData.employmentType,
        minExperience: minExp,
        maxExperience: maxExp,
        experience: expString,
        skills: formData.skills,
        education: formData.qualifications,
        qualification: formData.qualifications,
        location: formData.location,
        salaryRange: formData.salaryRange,
        salary: formData.salaryRange,
        genderRequirement: formData.genderRequirement,
        gender: formData.genderRequirement,
        strictness: formData.strictness,
        deadline: formData.deadline,
        numQuestions: Number(formData.numQuestions),
        customFields,
        difficulty: formData.difficulty,
        manualQuestions,
        candidateEmails: allEmails,
        candidateData: candidateDataList,
        candidateDataList: candidateDataList,
        updatedAt: serverTimestamp(),
      };

      await setDoc(jobDocRef, jobPayload, { merge: true });
      await updateDoc(interviewDocRef, interviewPayload).catch(async () => {
        await setDoc(interviewDocRef, interviewPayload, { merge: true });
      });

      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to update job");
    } finally {
      setSaving(false);
    }
  };

  const selectedSkillsList = formData.skills
    ? formData.skills.split(',').map(s => s.trim()).filter(s => s.length > 0)
    : [];

  const inputClass = "w-full px-3.5 py-2.5 bg-white dark:bg-[#050505] text-gray-900 dark:text-white border border-gray-300 dark:border-white/[0.14] focus:border-indigo-500 dark:focus:border-white/[0.35] rounded-[6px] text-xs font-medium outline-none focus:ring-1 focus:ring-indigo-500/20 transition-colors placeholder-gray-400 dark:placeholder-[#6b7280]";
  const labelClass = "block text-[11px] font-medium text-gray-700 dark:text-[#a1a1aa] mb-1 uppercase tracking-wider geist-label";
  const panelClass = "p-4 rounded-[6px] border border-gray-200 dark:border-white/[0.11] bg-gray-50/60 dark:bg-white/[0.025] space-y-3";

  return createPortal(
    <div className="fixed inset-0 bg-black/60 dark:bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-5">
      <div className="bg-white dark:bg-[#000] text-gray-900 dark:text-white rounded-[8px] shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col border border-gray-200 dark:border-white/[0.14] overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-white/[0.11] flex justify-between items-center bg-gray-50 dark:bg-[#050505]">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-[#6b7280]">Job Setup</span>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mt-0.5">
              <i className="fa-solid fa-pen-to-square text-indigo-600 dark:text-white text-base"></i>
              Edit Job Details
            </h2>
          </div>
          <button 
            onClick={onClose} 
            className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-gray-300 dark:border-white/[0.11] text-gray-500 dark:text-[#8f8f8f] hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <i className="fas fa-times text-xs"></i>
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600 dark:border-white"></div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
            <div className="p-5 sm:p-6 space-y-5 overflow-y-auto custom-card-scrollbar bg-white dark:bg-[#000]">

              {/* AI JD Import & Auto-Fill Box */}
              <div className="p-4 rounded-[6px] border border-gray-200 dark:border-white/[0.11] bg-gray-50/80 dark:bg-white/[0.025] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-white/10 pb-2.5">
                  <div className="flex items-center gap-2 text-black dark:text-white font-bold text-xs">
                    <i className="fas fa-wand-magic-sparkles text-black dark:text-white"></i>
                    <span>AI JD Import & Auto-Fill</span>
                  </div>

                  <div className="flex rounded-[4px] border border-gray-200 dark:border-white/10 bg-gray-100/80 dark:bg-black/40 p-0.5 text-xs shadow-inner dark:shadow-none">
                    <button
                      type="button"
                      onClick={() => setJdImportMode('upload')}
                      className={`px-3 py-1 rounded-[4px] text-xs transition-all flex items-center gap-1.5 font-bold cursor-pointer ${jdImportMode === 'upload' ? 'bg-black text-white dark:bg-white dark:text-black shadow-sm' : 'text-gray-600 dark:text-[#8f8f8f] hover:text-gray-900 dark:hover:text-white'}`}
                    >
                      <i className="fas fa-file-pdf"></i> Upload File
                    </button>
                    <button
                      type="button"
                      onClick={() => setJdImportMode('paste')}
                      className={`px-3 py-1 rounded-[4px] text-xs transition-all flex items-center gap-1.5 font-bold cursor-pointer ${jdImportMode === 'paste' ? 'bg-black text-white dark:bg-white dark:text-black shadow-sm' : 'text-gray-600 dark:text-[#8f8f8f] hover:text-gray-900 dark:hover:text-white'}`}
                    >
                      <i className="fas fa-paste"></i> Paste JD Text
                    </button>
                  </div>
                </div>

                {jdImportMode === 'upload' ? (
                  <div className="flex items-center gap-3">
                    <label htmlFor="edit-jd-upload" className="flex-1 cursor-pointer p-3 border border-dashed border-gray-300 dark:border-white/20 rounded-[6px] text-center text-xs text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors font-medium">
                      {parsingJd ? (
                        <span><i className="fas fa-spinner fa-spin mr-1 text-black dark:text-white"></i> Parsing JD file...</span>
                      ) : (
                        <span><i className="fas fa-file-upload mr-1 text-black dark:text-white"></i> Upload JD PDF or TXT File to Auto-Fill All Fields</span>
                      )}
                    </label>
                    <input id="edit-jd-upload" type="file" accept=".pdf,.txt" className="hidden" onChange={handleJDUpload} disabled={parsingJd} />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      rows={3}
                      value={pastedJdText}
                      onChange={(e) => setPastedJdText(e.target.value)}
                      placeholder="Paste full Job Description text here..."
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={handleParsePastedJDText}
                      disabled={parsingJd || !pastedJdText.trim()}
                      className="w-full py-2 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black font-semibold text-xs rounded-[6px] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-sm"
                    >
                      {parsingJd ? <><i className="fas fa-spinner fa-spin"></i> Parsing...</> : <><i className="fas fa-wand-magic-sparkles"></i> Auto-Fill Details & Custom Fields</>}
                    </button>
                  </div>
                )}
              </div>

              {/* Basic Information */}
              <div className={panelClass}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2 border-b border-gray-200 dark:border-white/[0.11] pb-2">
                  <i className="fa-solid fa-briefcase text-black dark:text-white"></i> Basic Job Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Job Title *</label>
                    <input 
                      type="text" required 
                      className={inputClass}
                      value={formData.title}
                      onChange={handleFormChange} name="title"
                      placeholder="e.g. Senior Frontend Developer"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Company Name *</label>
                    <input 
                      type="text" required 
                      className={inputClass}
                      value={formData.companyName}
                      onChange={handleFormChange} name="companyName"
                      placeholder="e.g. TechCorp Solutions"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Job Category / Department</label>
                    <select 
                      name="category" 
                      value={formData.category} 
                      onChange={handleFormChange}
                      className={inputClass}
                    >
                      <option value="">Select a Category</option>
                      {JOB_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>Employment Type</label>
                    <select name="employmentType" value={formData.employmentType} onChange={handleFormChange} className={inputClass}>
                      <option value="Full-time">Full-time</option>
                      <option value="Part-time">Part-time</option>
                      <option value="Contract">Contract</option>
                      <option value="Internship">Internship</option>
                      <option value="Freelance">Freelance</option>
                      <option value="Remote">Remote</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Experience, Location & Compensation */}
              <div className={panelClass}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2 border-b border-gray-200 dark:border-white/[0.11] pb-2">
                  <i className="fa-solid fa-location-dot text-black dark:text-white"></i> Experience, Location & Salary
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className={labelClass}>Min Exp (Years)</label>
                    <input
                      type="number"
                      name="minExperience"
                      placeholder="0"
                      value={formData.minExperience}
                      onChange={handleFormChange}
                      min="0"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Max Exp (Years)</label>
                    <input
                      type="number"
                      name="maxExperience"
                      placeholder="0"
                      value={formData.maxExperience}
                      onChange={handleFormChange}
                      min="0"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Job Location</label>
                    <input 
                      type="text" 
                      name="location" 
                      placeholder="e.g. Mumbai / Remote"
                      value={formData.location}
                      onChange={handleFormChange} 
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Salary Range / CTC</label>
                    <input 
                      type="text" 
                      name="salaryRange" 
                      placeholder="e.g. ₹50,000 / month or 8-12 LPA"
                      value={formData.salaryRange}
                      onChange={handleFormChange} 
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className={labelClass}>Gender Requirement</label>
                    <select name="genderRequirement" value={formData.genderRequirement} onChange={handleFormChange} className={inputClass}>
                      <option value="Any">Any Gender</option>
                      <option value="Male Only">Male Only</option>
                      <option value="Female Only">Female Only</option>
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>AI Strictness Level</label>
                    <select name="strictness" value={formData.strictness} onChange={handleFormChange} className={inputClass}>
                      <option value="Low">Low Strictness</option>
                      <option value="Medium">Medium Strictness</option>
                      <option value="High">High Strictness</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Qualifications */}
              <div className={panelClass}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2 border-b border-gray-200 dark:border-white/[0.11] pb-2">
                  <i className="fa-solid fa-graduation-cap text-black dark:text-white"></i> Qualifications & Education
                </h3>
                <div className="flex flex-wrap gap-2 min-h-[40px] p-2.5 bg-white dark:bg-[#050505] border border-gray-300 dark:border-white/[0.14] rounded-[6px]">
                  {formData.qualifications ? formData.qualifications.split(',').map(e => e.trim()).filter(e => e).map(edu => (
                    <span key={edu} className="px-3 py-1 bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white border border-gray-300 dark:border-white/20 rounded-[4px] text-xs font-bold flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                      {edu}
                      <button type="button" onClick={() => toggleEducation(edu)} className="hover:text-red-500 transition-colors font-bold text-sm">&times;</button>
                    </span>
                  )) : <span className="text-gray-400 dark:text-[#6b7280] text-xs p-1 italic">No qualifications specified</span>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <select
                    className={inputClass}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        toggleEducation(e.target.value);
                        e.target.value = "";
                      }
                    }}
                  >
                    <option value="">-- Select Predefined Level --</option>
                    {["High School", "Diploma", "Bachelor's Degree", "B.E. / B.Tech", "M.E. / M.Tech", "Master's Degree", "MBA", "PhD"].map(edu => (
                      <option key={edu} value={edu}>{edu}</option>
                    ))}
                  </select>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      className={inputClass}
                      placeholder="Or type custom qualification..."
                      value={eduInput}
                      onChange={e => setEduInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (eduInput.trim()) {
                            toggleEducation(eduInput.trim());
                            setEduInput('');
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (eduInput.trim()) {
                          toggleEducation(eduInput.trim());
                          setEduInput('');
                        }
                      }}
                      className="px-4 py-2 bg-white dark:bg-[#262626] hover:bg-gray-100 dark:hover:bg-[#333333] text-gray-900 dark:text-white border border-gray-300 dark:border-white/20 rounded-[6px] font-bold text-xs transition-colors shrink-0 cursor-pointer shadow-sm"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Skills Section - Displays ALL Added Skills */}
              <div className={panelClass}>
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/[0.11] pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2">
                    <i className="fa-solid fa-code text-black dark:text-white"></i> Required Skills ({selectedSkillsList.length})
                  </h3>
                  {selectedSkillsList.length > 0 && (
                    <button 
                      type="button" 
                      onClick={() => setFormData({ ...formData, skills: '' })}
                      className="text-[11px] text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-semibold transition-colors"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {/* All Added/Selected Skills Badges Box */}
                <div>
                  <label className="block text-[11px] font-medium text-gray-700 dark:text-[#a1a1aa] mb-1">Added Skills</label>
                  <div className="flex flex-wrap gap-2 min-h-[44px] p-2.5 bg-white dark:bg-[#050505] border border-gray-300 dark:border-white/[0.14] rounded-[6px]">
                    {selectedSkillsList.length > 0 ? (
                      selectedSkillsList.map(skill => (
                        <span 
                          key={skill} 
                          className="px-3 py-1 bg-purple-50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-200 border border-purple-200 dark:border-purple-500/40 rounded-[4px] text-xs font-bold flex items-center gap-2 animate-in fade-in zoom-in duration-200"
                        >
                          <span>{skill}</span>
                          <button 
                            type="button" 
                            onClick={() => removeSkill(skill)} 
                            className="hover:text-red-500 dark:hover:text-red-400 transition-colors font-bold text-sm leading-none"
                            title="Remove skill"
                          >
                            &times;
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-400 dark:text-[#6b7280] text-xs p-1 italic">No skills added yet. Select from below or type custom skills to add.</span>
                    )}
                  </div>
                </div>

                {/* Add Custom Skill Input */}
                <div className="flex gap-2 pt-1">
                  <input 
                    type="text"
                    className={inputClass}
                    placeholder="Search or add custom skill (e.g. Docker, Python, AWS S3)..."
                    value={skillSearch}
                    onChange={e => setSkillSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (skillSearch.trim()) {
                          toggleSkill(skillSearch.trim());
                          setSkillSearch('');
                        }
                      }
                    }}
                  />
                  <button 
                    type="button"
                    onClick={() => {
                      if (skillSearch.trim()) {
                        toggleSkill(skillSearch.trim());
                        setSkillSearch('');
                      }
                    }}
                    className="px-4 py-2 bg-white dark:bg-[#262626] hover:bg-gray-100 dark:hover:bg-[#333333] text-gray-900 dark:text-white border border-gray-300 dark:border-white/20 rounded-[6px] font-bold text-xs transition-colors shrink-0 cursor-pointer shadow-sm"
                  >
                    Add Skill
                  </button>
                </div>

                {/* Predefined Suggestions Grid */}
                <div className="border border-gray-200 dark:border-white/[0.11] rounded-[6px] p-3 max-h-36 overflow-y-auto bg-white dark:bg-[#050505] custom-card-scrollbar">
                  <span className="block text-[10px] font-bold text-gray-500 dark:text-[#6b7280] uppercase tracking-wider mb-2">Predefined Suggestions</span>
                  <div className="flex flex-wrap gap-1.5">
                    {SKILL_OPTIONS.filter(s => s.toLowerCase().includes(skillSearch.toLowerCase())).map(skill => {
                      const isSelected = selectedSkillsList.includes(skill);
                      return (
                        <button
                          key={skill}
                          type="button"
                          onClick={() => toggleSkill(skill)}
                          className={`px-2.5 py-1 rounded-[4px] text-xs border transition-all ${
                            isSelected 
                              ? 'bg-purple-600 dark:bg-purple-500/30 border-purple-600 dark:border-purple-500/60 text-white dark:text-purple-200 font-bold' 
                              : 'bg-gray-100 dark:bg-white/[0.04] border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/[0.08] hover:text-gray-900 dark:hover:text-white'
                          }`}
                        >
                          {skill} {isSelected && '✓'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Interview Rules & Settings */}
              <div className={panelClass}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2 border-b border-gray-200 dark:border-white/[0.11] pb-2">
                  <i className="fa-solid fa-sliders text-black dark:text-white"></i> Interview Rules & Settings
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className={labelClass}>Deadline *</label>
                    <input 
                      type="date" required 
                      className={inputClass}
                      value={formData.deadline}
                      onChange={handleFormChange} name="deadline"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Access Permission</label>
                    <select 
                      className={inputClass}
                      value={formData.permission}
                      onChange={handleFormChange} name="permission"
                    >
                      <option value="anyone">Direct Start (Anyone with link/code)</option>
                      <option value="request">Request Permission Needed</option>
                      <option value="code_only">Access Code Only</option>
                      <option value="candidate_list">Invited Candidate Email Only</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Number of AI Questions</label>
                    <input type="number" name="numQuestions" value={formData.numQuestions} onChange={handleFormChange} min="1" max="15" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Difficulty Level</label>
                    <select name="difficulty" value={formData.difficulty} onChange={handleFormChange} className={inputClass}>
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className={panelClass}>
                <label className={labelClass}>Job Description *</label>
                <textarea 
                  required rows={4}
                  className={inputClass}
                  value={formData.description}
                  onChange={handleFormChange} name="description"
                  placeholder="Provide complete job details, responsibilities, and requirements..."
                />
              </div>

              {/* Custom Fields */}
              <div className={panelClass}>
                <div>
                  <label className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">Dynamic Custom Fields</label>
                  <p className="text-[11px] text-gray-500 dark:text-[#8f8f8f] mt-0.5">Add additional key-value specifications for candidates.</p>
                </div>
                <div className="flex gap-2">
                  <input type="text" className={inputClass} placeholder="Field Name (e.g. Shift Timing)" value={tempCustomField.key} onChange={e => setTempCustomField({ ...tempCustomField, key: e.target.value })} />
                  <input type="text" className={inputClass} placeholder="Field Value (e.g. Day Shift)" value={tempCustomField.value} onChange={e => setTempCustomField({ ...tempCustomField, value: e.target.value })} />
                  <button type="button" onClick={handleAddCustomField} className="px-4 py-2 bg-gray-100 dark:bg-[#262626] hover:bg-gray-200 dark:hover:bg-[#333333] text-gray-900 dark:text-white border border-gray-300 dark:border-white/20 rounded-[6px] font-bold text-xs transition-colors shrink-0">Add</button>
                </div>
                {customFields.length > 0 && (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 custom-card-scrollbar">
                    {customFields.map((field) => (
                      <div key={field.id} className="flex items-center justify-between p-2 bg-white dark:bg-[#050505] border border-gray-200 dark:border-white/[0.14] rounded-[6px] text-xs">
                        <div className="flex gap-2">
                          <strong className="text-gray-900 dark:text-white">{field.key}:</strong>
                          <span className="text-gray-700 dark:text-gray-300">{field.value}</span>
                        </div>
                        <button type="button" onClick={() => handleRemoveCustomField(field.id)} className="text-gray-400 dark:text-[#8f8f8f] hover:text-red-500 dark:hover:text-red-400 transition-colors p-1">
                          <i className="fa-solid fa-trash-can"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Manual Questions */}
              <div className="p-4 rounded-[6px] border border-blue-500/30 bg-blue-50/50 dark:bg-blue-500/5 space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <i className="fa-solid fa-clipboard-question text-blue-600 dark:text-blue-400"></i>
                    Manual Interview Questions (Optional)
                  </label>
                  <p className="text-[11px] text-gray-500 dark:text-[#8f8f8f] mt-0.5">Specify custom questions you want the AI voice avatar to ask.</p>
                </div>
                <div className="flex gap-2">
                  <input type="text" className={inputClass} placeholder="e.g. Explain your recent project architecture..." value={currentManualQuestion} onChange={e => setCurrentManualQuestion(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddManualQuestion())} />
                  <button type="button" onClick={handleAddManualQuestion} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-[6px] transition-colors shrink-0">Add</button>
                </div>
                {manualQuestions.length > 0 && (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 custom-card-scrollbar">
                    {manualQuestions.map((q, index) => (
                      <div key={index} className="flex items-center justify-between p-2.5 bg-white dark:bg-[#050505] border border-gray-200 dark:border-white/[0.14] rounded-[6px] text-xs">
                        <p className="text-gray-800 dark:text-gray-200 font-medium">{q}</p>
                        <button type="button" onClick={() => handleRemoveManualQuestion(index)} className="text-gray-400 dark:text-[#8f8f8f] hover:text-red-500 dark:hover:text-red-400 transition-colors p-1"><i className="fa-solid fa-trash-can"></i></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Candidate Invites */}
              <div className="p-4 rounded-[6px] border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/5 space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <i className="fa-solid fa-user-plus text-emerald-600 dark:text-emerald-400"></i>
                    Candidate Contact Invitations (Email & Phone)
                  </label>
                  <p className="text-[11px] text-gray-500 dark:text-[#8f8f8f] mt-0.5">Add candidate email addresses and/or WhatsApp numbers for automated invitations.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  <input type="email" className={`${inputClass} sm:col-span-2`} placeholder="candidate@example.com" value={currentEmail} onChange={e => setCurrentEmail(e.target.value)} />
                  <input type="tel" className={`${inputClass} sm:col-span-2`} placeholder="+91 9876543210 (Mobile)" value={currentPhone} onChange={e => setCurrentPhone(e.target.value)} />
                  <button type="button" onClick={handleAddCandidate} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-[6px] transition-colors shrink-0 sm:col-span-1">Add</button>
                </div>
                {candidateDataList.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1 max-h-40 overflow-y-auto custom-card-scrollbar">
                    {candidateDataList.map((cand, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-white dark:bg-[#050505] border border-gray-200 dark:border-white/[0.14] rounded-[6px] px-3 py-1.5 text-xs shadow-sm">
                        <i className="fa-solid fa-user text-emerald-600 dark:text-emerald-400"></i>
                        <span className="font-semibold text-gray-900 dark:text-white">{cand.email || 'No email'}</span>
                        {cand.phone && <span className="text-gray-500 dark:text-[#8f8f8f]">({cand.phone})</span>}
                        <button type="button" onClick={() => handleRemoveCandidate(idx)} className="text-gray-400 dark:text-[#8f8f8f] hover:text-red-500 dark:hover:text-red-400 transition-colors font-bold ml-1">&times;</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="flex gap-3 p-4 border-t border-gray-200 dark:border-white/[0.11] bg-gray-50 dark:bg-[#050505] mt-auto">
              <button 
                type="button"
                onClick={onClose}
                className="w-1/3 border border-gray-300 dark:border-white/[0.11] bg-transparent text-gray-700 dark:text-[#d4d4d4] font-medium py-2.5 px-4 rounded-[6px] hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-gray-900 dark:hover:text-white transition-colors text-xs"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={saving}
                className="w-2/3 border border-black dark:border-white bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black font-semibold py-2.5 px-4 rounded-[6px] transition-colors disabled:opacity-50 text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer"
              >
                {saving ? (
                  <><i className="fas fa-spinner fa-spin"></i> Saving Changes...</>
                ) : (
                  <><i className="fa-solid fa-check"></i> Save & Update Job Details</>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};

export default EditJobModal;
