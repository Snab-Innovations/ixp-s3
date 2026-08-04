import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { createPortal } from 'react-dom';
import { SKILL_OPTIONS, JOB_CATEGORIES } from './Profile';
import { parseJobDescriptionText, ParsedJdResult } from '../services/geminiService';
import * as pdfjsLib from 'pdfjs-dist';
import { rds } from '../services/rdsApi';

interface EditJobModalProps {
  jobId: string;
  onClose: () => void;
}

interface CustomField {
  id: number;
  key: string;
  value: string;
}

const EditJobModal: React.FC<EditJobModalProps> = ({ jobId, onClose }) => {
  const { user, userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [accessCode, setAccessCode] = useState('');
  const [tempCustomField, setTempCustomField] = useState({ key: '', value: '' });
  const [manualQuestions, setManualQuestions] = useState<string[]>([]);
  const [currentManualQuestion, setCurrentManualQuestion] = useState('');
  const [candidateEmails, setCandidateEmails] = useState<string[]>([]);
  const [currentEmail, setCurrentEmail] = useState('');
  const [parsingJd, setParsingJd] = useState(false);
  const [jdImportMode, setJdImportMode] = useState<'upload' | 'paste'>('upload');
  const [pastedJdText, setPastedJdText] = useState('');
  const [eduInput, setEduInput] = useState('');
  const [skillSearch, setSkillSearch] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    jobNumber: '',
    companyName: '',
    department: '',
    category: '',
    description: '',
    employmentType: 'Full-time',
    minExperience: 0,
    maxExperience: 0,
    experience: 0,
    salaryRange: '',
    genderRequirement: 'Any',
    detailedJdUrl: '',
    aboutCompany: '',
    qualifications: '',
    skills: '',
    deadline: '',
    permission: 'anyone',
    numQuestions: 5,
    difficulty: 'Easy',
    strictness: 'Low',
  });

  const handleApplyParsedJdData = (parsed: ParsedJdResult) => {
    setFormData(prev => ({
      ...prev,
      title: parsed.title || parsed.vacancyName || parsed.designation || prev.title,
      jobNumber: parsed.jobNumber || prev.jobNumber || '',
      description: parsed.description || prev.description,
      department: parsed.department || parsed.industry || parsed.roleCategory || prev.department,
      category: parsed.department || parsed.industry || parsed.roleCategory || prev.category,
      employmentType: parsed.employmentType || prev.employmentType,
      minExperience: parsed.minExperience !== undefined ? Number(parsed.minExperience) : prev.minExperience,
      maxExperience: parsed.maxExperience !== undefined ? Number(parsed.maxExperience) : prev.maxExperience,
      experience: parsed.minExperience !== undefined ? Number(parsed.minExperience) : prev.experience,
      skills: parsed.skills || (parsed.technicalSkills && parsed.softSkills ? `${parsed.technicalSkills}, ${parsed.softSkills}` : prev.skills),
      qualifications: parsed.qualification || parsed.education || prev.qualifications,
      salaryRange: parsed.salaryRange || (parsed.minSalary && parsed.maxSalary ? `${parsed.minSalary} - ${parsed.maxSalary}` : prev.salaryRange || ''),
      genderRequirement: parsed.gender || prev.genderRequirement || 'Any',
      detailedJdUrl: parsed.detailedJdUrl || prev.detailedJdUrl || '',
      aboutCompany: parsed.aboutCompany || parsed.companyProfile || prev.aboutCompany || '',
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

        const { interview } = await rds.getInterview(jobId);
        if (!interview) {
          alert("Job or Interview not found.");
          onClose();
          return;
        }

        const teamId = userProfile?.teamId || userProfile?.parentRecruiterId || user.uid;
        const canEdit =
          interview.recruiterUID === user.uid ||
          interview.teamId === user.uid ||
          interview.teamId === teamId;
        if (!canEdit) {
          alert("You do not have permission to edit this item.");
          onClose();
          return;
        }

        setAccessCode(interview.accessCode || '');

        let deadlineStr = '';
        const deadlineSource = interview.deadline || interview.applyDeadline;
        if (deadlineSource) {
          if (typeof deadlineSource === 'string') {
            deadlineStr = deadlineSource.includes('T')
              ? deadlineSource.split('T')[0]
              : deadlineSource;
          } else if (deadlineSource?.toDate) {
            deadlineStr = deadlineSource.toDate().toISOString().split('T')[0];
          }
        }

        setFormData({
          title: (interview.title || '').replace(/ Interview$/i, ''),
          jobNumber: interview.jobNumber || (interview as any).jobNo || '',
          companyName: interview.companyName || userProfile?.company || 'N/A',
          department: interview.department || interview.category || '',
          category: interview.department || interview.category || '',
          qualifications: interview.education || interview.qualifications || '',
          deadline: deadlineStr,
          description: interview.description || '',
          permission: interview.interviewPermission || (interview as any).permission || 'anyone',
          skills: interview.skills || '',
          salaryRange: (interview as any).salaryRange || (interview as any).salary || '',
          genderRequirement: (interview as any).genderRequirement || (interview as any).gender || 'Any',
          detailedJdUrl: (interview as any).detailedJdUrl || '',
          aboutCompany: (interview as any).aboutCompany || '',
          numQuestions: interview.numQuestions || 5,
          employmentType: interview.employmentType || 'Full-time',
          minExperience: interview.minExperience || interview.experience || 0,
          maxExperience: interview.maxExperience || interview.experience || 0,
          experience: interview.experience || 0,
          difficulty: interview.difficulty || 'Easy',
          strictness: (interview as any).strictness || 'Low',
        });
        setCustomFields(interview.customFields || []);
        setManualQuestions(interview.manualQuestions || []);
        setCandidateEmails(interview.candidateEmails || []);
      } catch (err) {
        console.error("Error fetching job:", err);
        alert("Error loading job details");
        onClose();
      } finally {
        if (jobId && user) setLoading(false);
      }
    };

    fetchJob();
  }, [jobId, user, userProfile, onClose]);

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

  const handleAddEmail = () => {
    if (currentEmail && !candidateEmails.includes(currentEmail)) {
      setCandidateEmails([...candidateEmails, currentEmail]);
      setCurrentEmail('');
    }
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setCandidateEmails(candidateEmails.filter(email => email !== emailToRemove));
  };

  const toggleSkill = (skill: string) => {
    const currentSkills = formData.skills 
      ? formData.skills.split(',').map(s => s.trim()).filter(s => s) 
      : [];
    
    let newSkills;
    if (currentSkills.includes(skill)) {
      newSkills = currentSkills.filter(s => s !== skill);
    } else {
      newSkills = [...currentSkills, skill];
    }
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

    if (formData.maxExperience < formData.minExperience) {
      alert("❌ Maximum experience cannot be less than minimum experience.");
      return;
    }

    setSaving(true);

    try {
      await rds.updateInterview(jobId, {
        title: formData.title,
        jobNumber: formData.jobNumber || undefined,
        description: formData.description,
        department: formData.department || formData.category,
        employmentType: formData.employmentType,
        minExperience: Number(formData.minExperience),
        maxExperience: Number(formData.maxExperience),
        experience: Number(formData.minExperience),
        salaryRange: formData.salaryRange,
        genderRequirement: formData.genderRequirement,
        skills: formData.skills,
        education: formData.qualifications,
        deadline: formData.deadline || null,
        numQuestions: Number(formData.numQuestions),
        difficulty: formData.difficulty,
        strictness: formData.strictness,
        detailedJdUrl: formData.detailedJdUrl,
        aboutCompany: formData.aboutCompany,
        customFields,
        manualQuestions,
        candidateEmails,
        raw: {
          companyName: formData.companyName,
          interviewPermission: formData.permission,
          category: formData.department || formData.category,
          applyDeadline: formData.deadline || null,
          recruiterName: userProfile?.name || user.email,
          recruiterEmail: user.email,
          accessCode,
          jobNumber: formData.jobNumber || undefined,
          detailedJdUrl: formData.detailedJdUrl,
          aboutCompany: formData.aboutCompany,
        },
      });

      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to update job posting");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "geist-caption h-9 w-full rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-slate-50 dark:bg-[#050505] px-3 text-slate-900 dark:text-white outline-none transition-colors placeholder:text-slate-400 dark:placeholder:text-[#6b7280] focus:border-slate-400 dark:focus:border-white/[0.28] focus:bg-white dark:focus:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50";
  const textareaClass = "geist-caption min-h-[100px] w-full resize-y rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-slate-50 dark:bg-[#050505] px-3 py-2.5 text-slate-900 dark:text-white outline-none transition-colors placeholder:text-slate-400 dark:placeholder:text-[#6b7280] focus:border-slate-400 dark:focus:border-white/[0.28] focus:bg-white dark:focus:bg-white/[0.04]";
  const selectClass = `${inputClass} appearance-none`;
  const labelClass = "geist-label mb-1.5 block text-slate-600 dark:text-[#a1a1aa]";
  const secondaryButtonClass = "geist-caption inline-flex h-9 shrink-0 items-center justify-center rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-slate-100 dark:bg-white/[0.03] px-3 font-medium text-slate-700 dark:text-[#d4d4d4] transition-colors hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white disabled:cursor-not-allowed disabled:opacity-40";
  const panelHeaderClass = "geist-label uppercase text-slate-500 dark:text-[#6b7280]";
  const panelTitleClass = "geist-section-title mt-1 text-slate-900 dark:text-white";
  const helperTextClass = "geist-small mt-1 max-w-2xl text-slate-500 dark:text-[#8f8f8f]";

  return createPortal(
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="geist-edit-modal bg-white dark:bg-[#000] text-slate-900 dark:text-white rounded-[12px] shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col border border-slate-200 dark:border-white/[0.11] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.11] flex justify-between items-center bg-slate-50 dark:bg-[#050505] shrink-0">
          <div>
            <p className="geist-label uppercase text-slate-500 dark:text-[#6b7280]">Interview setup</p>
            <h2 className="geist-section-title mt-0.5 text-slate-900 dark:text-white flex items-center gap-2 text-lg">
              <i className="fas fa-[#ffffff] fa-pen-to-square text-xs text-slate-400 dark:text-[#8f8f8f]"></i>
              Edit Job Posting
            </h2>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-slate-200 dark:border-white/[0.11] text-slate-400 dark:text-[#8f8f8f] hover:bg-slate-200/60 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <i className="fas fa-times text-xs"></i>
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 space-y-3">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-slate-900 dark:border-white"></div>
            <p className="geist-caption text-slate-500 dark:text-[#8f8f8f]">Loading job posting details...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-5 space-y-7 bg-white dark:bg-[#000]">

              {/* AI JD Import & Auto-Fill Banner */}
              <div className="rounded-[8px] border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/5 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200 dark:border-blue-500/20 pb-2">
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold text-xs">
                    <i className="fas fa-wand-magic-sparkles"></i>
                    <span>AI Auto-Parse & Update Fields</span>
                  </div>

                  <div className="flex rounded-[6px] border border-white/10 bg-black/60 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setJdImportMode('upload')}
                      className={`px-3 py-1 rounded-[4px] text-xs transition-colors flex items-center gap-1.5 cursor-pointer ${jdImportMode === 'upload' ? 'bg-blue-600 text-white font-bold' : 'text-gray-400 hover:text-white'}`}
                    >
                      <i className="fas fa-file-pdf"></i> Upload File
                    </button>
                    <button
                      type="button"
                      onClick={() => setJdImportMode('paste')}
                      className={`px-3 py-1 rounded-[4px] text-xs transition-colors flex items-center gap-1.5 cursor-pointer ${jdImportMode === 'paste' ? 'bg-blue-600 text-white font-bold' : 'text-gray-400 hover:text-white'}`}
                    >
                      <i className="fas fa-paste"></i> Paste Text
                    </button>
                  </div>
                </div>

                {jdImportMode === 'upload' ? (
                  <div className="flex items-center gap-3">
                    <label htmlFor="edit-jd-upload" className="flex-1 cursor-pointer p-3 border border-dashed border-white/20 rounded-[6px] text-center text-xs text-gray-300 hover:bg-white/5 transition-colors">
                      {parsingJd ? (
                        <span className="flex items-center justify-center gap-2 text-blue-400"><i className="fas fa-spinner fa-spin"></i> Parsing document with AI...</span>
                      ) : (
                        <span className="flex items-center justify-center gap-2"><i className="fas fa-file-upload text-blue-400"></i> Upload JD PDF/TXT File to Auto-Fill All Fields</span>
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
                      placeholder="Paste updated Job Description text here to re-extract all fields..."
                      className={textareaClass}
                    />
                    <button
                      type="button"
                      onClick={handleParsePastedJDText}
                      disabled={parsingJd || !pastedJdText.trim()}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-[6px] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {parsingJd ? <><i className="fas fa-spinner fa-spin"></i> Extracting...</> : <><i className="fas fa-wand-magic-sparkles"></i> Re-Extract & Fill All Fields</>}
                    </button>
                  </div>
                )}
              </div>

              {/* Section 1: Role Details */}
              <section className="rounded-[8px] border border-slate-200 dark:border-white/[0.11] bg-slate-50/50 dark:bg-white/[0.025] p-5 space-y-4">
                <div>
                  <p className={panelHeaderClass}>Brief</p>
                  <h3 className={panelTitleClass}>Role Details</h3>
                  <p className={helperTextClass}>Core requirements and descriptions for this job position.</p>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div>
                    <label className={labelClass}>Job title / role <span className="text-red-500 dark:text-red-400">*</span></label>
                    <input name="title" type="text" required className={inputClass} value={formData.title} onChange={handleFormChange} placeholder="Senior Frontend Engineer" />
                  </div>

                  <div>
                    <label className={labelClass}>Job Number / Vacancy ID</label>
                    <input name="jobNumber" type="text" className={inputClass} value={formData.jobNumber} onChange={handleFormChange} placeholder="e.g. 23632 or JOB-101" />
                  </div>

                  <div>
                    <label className={labelClass}>Company Department <span className="text-red-500 dark:text-red-400">*</span></label>
                    <input name="department" type="text" required className={inputClass} value={formData.department} onChange={handleFormChange} placeholder="Engineering" />
                  </div>

                  <div>
                    <label className={labelClass}>Employment Type <span className="text-red-500 dark:text-red-400">*</span></label>
                    <select name="employmentType" required className={selectClass} value={formData.employmentType} onChange={handleFormChange}>
                      <option value="Full-time">Full-time</option>
                      <option value="Part-time">Part-time</option>
                      <option value="Contract">Contract</option>
                      <option value="Internship">Internship</option>
                    </select>
                  </div>

                  <div className="xl:col-span-2">
                    <label className={labelClass}>Job Description <span className="text-red-500 dark:text-red-400">*</span></label>
                    <textarea name="description" required rows={5} className={textareaClass} value={formData.description} onChange={handleFormChange} placeholder="Describe the role responsibilities, deliverables, and expectations." />
                  </div>

                  <div>
                    <label className={labelClass}>Required Experience (Years) <span className="text-red-500 dark:text-red-400">*</span></label>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                      <input name="minExperience" type="number" min="0" required placeholder="Min" className={inputClass} value={formData.minExperience} onChange={handleFormChange} />
                      <span className="geist-small text-slate-500 dark:text-[#6b7280]">to</span>
                      <input name="maxExperience" type="number" min="0" required placeholder="Max" className={inputClass} value={formData.maxExperience} onChange={handleFormChange} />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Salary / Compensation <span className="text-red-500 dark:text-red-400">*</span></label>
                    <input name="salaryRange" type="text" required className={inputClass} value={formData.salaryRange} onChange={handleFormChange} placeholder="e.g. 20,000 - 22,000 / per month or 4 - 6 LPA" />
                  </div>

                  <div>
                    <label className={labelClass}>Gender Requirement</label>
                    <select name="genderRequirement" className={selectClass} value={formData.genderRequirement} onChange={handleFormChange}>
                      <option value="Any">Any</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>

                  <div className="xl:col-span-2">
                    <label className={labelClass}>For detailed JD click (Link)</label>
                    <input name="detailedJdUrl" type="url" className={inputClass} value={formData.detailedJdUrl} onChange={handleFormChange} placeholder="e.g. https://drive.google.com/file/... or https://example.com/jd.pdf" />
                  </div>

                  <div className="xl:col-span-2">
                    <label className={labelClass}>About Company</label>
                    <textarea name="aboutCompany" rows={3} className={textareaClass} value={formData.aboutCompany} onChange={handleFormChange} placeholder="Overview of company products, services, culture, or background details..." />
                  </div>

                  <div className="xl:col-span-2">
                    <label className={labelClass}>Minimum Education Level</label>
                    <div className="min-h-10 rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-white dark:bg-[#050505] p-2">
                      <div className="flex flex-wrap gap-2 mb-2">
                        {formData.qualifications ? formData.qualifications.split(',').map(e => e.trim()).filter(Boolean).map(edu => (
                          <span key={edu} className="geist-small inline-flex h-7 items-center gap-2 rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-slate-100 dark:bg-white/[0.05] px-2.5 text-slate-800 dark:text-[#d4d4d4]">
                            {edu}
                            <button type="button" onClick={() => toggleEducation(edu)} className="text-slate-400 dark:text-[#8f8f8f] hover:text-slate-900 dark:hover:text-white">&times;</button>
                          </span>
                        )) : <span className="geist-caption text-slate-400 dark:text-[#6b7280] italic px-1">No education filters selected</span>}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2 mt-2">
                        <select
                          className={selectClass}
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              toggleEducation(e.target.value);
                              e.target.value = "";
                            }
                          }}
                        >
                          <option value="">-- Select Predefined Level --</option>
                          {["High School", "Bachelor's", "Master's", "PhD", "Diploma Mechanical", "Diploma Electrical", "B.Tech / B.E."].map(edu => (
                            <option key={edu} value={edu}>{edu}</option>
                          ))}
                        </select>

                        <div className="flex gap-2 min-w-[220px]">
                          <input
                            type="text"
                            className={inputClass}
                            placeholder="Add custom qualification..."
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
                            className={secondaryButtonClass}
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Section 2: Skills & Evaluation Settings */}
              <section className="rounded-[8px] border border-slate-200 dark:border-white/[0.11] bg-slate-50/50 dark:bg-white/[0.025] p-5 space-y-4">
                <div>
                  <p className={panelHeaderClass}>Evaluation</p>
                  <h3 className={panelTitleClass}>Skills & AI Rules</h3>
                  <p className={helperTextClass}>Tune the required skill keywords, question difficulty, evaluation strictness, and deadlines.</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Key Skills & Topics <span className="text-red-500 dark:text-red-400">*</span></label>
                    <div className="flex flex-wrap gap-2 mb-2 min-h-10 p-2 rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-white dark:bg-[#050505]">
                      {formData.skills ? formData.skills.split(',').map(s => s.trim()).filter(Boolean).map(skill => (
                        <span key={skill} className="geist-small inline-flex h-7 items-center gap-2 rounded-[6px] border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 px-2.5 font-medium text-blue-700 dark:text-blue-300">
                          {skill}
                          <button type="button" onClick={() => toggleSkill(skill)} className="text-blue-600 dark:text-blue-400 hover:text-slate-900 dark:hover:text-white">&times;</button>
                        </span>
                      )) : <span className="geist-caption text-slate-400 dark:text-[#6b7280] italic px-1">No skills selected</span>}
                    </div>

                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        className={inputClass}
                        placeholder="Search or add custom skill..."
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
                        className={secondaryButtonClass}
                      >
                        Add
                      </button>
                    </div>

                    <div className="max-h-36 overflow-y-auto rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-white dark:bg-[#050505] p-3">
                      <div className="flex flex-wrap gap-1.5">
                        {SKILL_OPTIONS.filter(s => s.toLowerCase().includes(skillSearch.toLowerCase())).map(skill => {
                          const isSelected = formData.skills.split(',').map(s => s.trim()).includes(skill);
                          return (
                            <button
                              key={skill}
                              type="button"
                              onClick={() => toggleSkill(skill)}
                              className={`geist-caption px-2.5 py-1 rounded-[4px] border transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-blue-100 dark:bg-blue-500/20 border-blue-300 dark:border-blue-500/40 text-blue-800 dark:text-blue-300 font-semibold'
                                  : 'bg-slate-100 dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-[#8f8f8f] hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white'
                              }`}
                            >
                              {skill} {isSelected && '✓'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label className={labelClass}>Number of AI Questions</label>
                      <input type="number" name="numQuestions" value={formData.numQuestions} onChange={handleFormChange} min="1" max="15" className={inputClass} />
                    </div>

                    <div>
                      <label className={labelClass}>Interview Difficulty</label>
                      <select name="difficulty" value={formData.difficulty} onChange={handleFormChange} className={selectClass}>
                        <option value="Easy">Easy</option>
                        <option value="Medium">Medium</option>
                        <option value="Hard">Hard</option>
                      </select>
                    </div>

                    <div>
                      <label className={labelClass}>AI Evaluation Strictness</label>
                      <select name="strictness" value={formData.strictness} onChange={handleFormChange} className={selectClass}>
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </div>

                    <div>
                      <label className={labelClass}>Application Deadline</label>
                      <input type="date" name="deadline" value={formData.deadline} onChange={handleFormChange} className={inputClass} />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Interview Access Mode</label>
                    <select name="permission" value={formData.permission} onChange={handleFormChange} className={selectClass}>
                      <option value="anyone">Direct Start (Anyone with link & access code)</option>
                      <option value="request">Request Permission Required (Recruiter approves before interview)</option>
                    </select>
                  </div>
                </div>
              </section>

              {/* Section 3: Dynamic Custom Attributes */}
              <section className="rounded-[8px] border border-slate-200 dark:border-white/[0.11] bg-slate-50/50 dark:bg-white/[0.025] p-5 space-y-3">
                <div>
                  <p className={panelHeaderClass}>Attributes</p>
                  <h3 className={panelTitleClass}>Custom Job Fields</h3>
                  <p className={helperTextClass}>Add extra specific job information (e.g. Job Timing, Weekly Off, Bond/Agreement, Facilities, Shift details).</p>
                </div>

                <div className="flex gap-2">
                  <input type="text" className={inputClass} placeholder="Field Name (e.g. Job Timing)" value={tempCustomField.key} onChange={e => setTempCustomField({ ...tempCustomField, key: e.target.value })} />
                  <input type="text" className={inputClass} placeholder="Field Value (e.g. 9 AM - 6 PM)" value={tempCustomField.value} onChange={e => setTempCustomField({ ...tempCustomField, value: e.target.value })} />
                  <button type="button" onClick={handleAddCustomField} className={secondaryButtonClass}>Add</button>
                </div>

                {customFields.length > 0 && (
                  <div className="space-y-2 mt-2 max-h-44 overflow-y-auto pr-1">
                    {customFields.map((field) => (
                      <div key={field.id} className="flex items-center justify-between p-2.5 rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-white dark:bg-[#050505]">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-semibold text-slate-900 dark:text-white">{field.key}:</span>
                          <span className="text-slate-700 dark:text-[#d4d4d4]">{field.value}</span>
                        </div>
                        <button type="button" onClick={() => handleRemoveCustomField(field.id)} className="text-slate-400 dark:text-[#8f8f8f] hover:text-red-600 dark:hover:text-red-400 p-1 cursor-pointer">
                          <i className="fas fa-trash-can text-xs"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Section 4: Manual Custom Questions */}
              <section className="rounded-[8px] border border-slate-200 dark:border-white/[0.11] bg-slate-50/50 dark:bg-white/[0.025] p-5 space-y-3">
                <div>
                  <p className={panelHeaderClass}>Custom</p>
                  <h3 className={panelTitleClass}>Manual Interview Questions</h3>
                  <p className={helperTextClass}>Add specific custom questions you want the AI to mandatory ask the candidate.</p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    className={inputClass}
                    placeholder="e.g. Are you willing to relocate to Nashik?"
                    value={currentManualQuestion}
                    onChange={e => setCurrentManualQuestion(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddManualQuestion())}
                  />
                  <button type="button" onClick={handleAddManualQuestion} className={secondaryButtonClass}>Add</button>
                </div>

                {manualQuestions.length > 0 && (
                  <div className="space-y-2 mt-2 max-h-44 overflow-y-auto pr-1">
                    {manualQuestions.map((q, index) => (
                      <div key={index} className="flex items-center justify-between p-2.5 rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-white dark:bg-[#050505]">
                        <p className="geist-caption text-slate-800 dark:text-[#d4d4d4]">{q}</p>
                        <button type="button" onClick={() => handleRemoveManualQuestion(index)} className="text-slate-400 dark:text-[#8f8f8f] hover:text-red-600 dark:hover:text-red-400 p-1 cursor-pointer">
                          <i className="fas fa-trash-can text-xs"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Section 5: Candidate Invites */}
              <section className="rounded-[8px] border border-slate-200 dark:border-white/[0.11] bg-slate-50/50 dark:bg-white/[0.025] p-5 space-y-3">
                <div>
                  <p className={panelHeaderClass}>Invites</p>
                  <h3 className={panelTitleClass}>Candidate Emails</h3>
                  <p className={helperTextClass}>Add candidate emails to automatically dispatch invitation notifications.</p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="email"
                    className={inputClass}
                    placeholder="candidate@example.com"
                    value={currentEmail}
                    onChange={e => setCurrentEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddEmail())}
                  />
                  <button type="button" onClick={handleAddEmail} className={secondaryButtonClass}>Add</button>
                </div>

                {candidateEmails.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {candidateEmails.map((email) => (
                      <div key={email} className="geist-caption inline-flex items-center gap-2 rounded-[6px] border border-slate-200 dark:border-white/[0.11] bg-slate-100 dark:bg-white/[0.04] px-3 py-1 text-slate-800 dark:text-[#d4d4d4]">
                        <span>{email}</span>
                        <button type="button" onClick={() => handleRemoveEmail(email)} className="text-slate-400 dark:text-[#8f8f8f] hover:text-slate-900 dark:hover:text-white cursor-pointer">&times;</button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-200 dark:border-white/[0.11] bg-slate-50 dark:bg-[#050505] shrink-0">
              <button 
                type="button"
                onClick={onClose}
                className={secondaryButtonClass}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={saving}
                className="geist-caption inline-flex h-9 items-center justify-center rounded-[6px] border border-slate-900 dark:border-white bg-slate-900 dark:bg-white px-5 font-semibold text-white dark:text-black hover:bg-slate-800 dark:hover:bg-[#eaeaea] transition-colors disabled:opacity-50 cursor-pointer"
              >
                {saving ? (
                  <span className="flex items-center gap-2"><i className="fas fa-spinner fa-spin"></i> Saving Changes...</span>
                ) : (
                  'Update Job Posting'
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
