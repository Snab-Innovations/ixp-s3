import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext'; // Assuming userProfile is available here
import { createPortal } from 'react-dom';
import { SKILL_OPTIONS, JOB_CATEGORIES } from './Profile';

interface EditJobModalProps {
  jobId: string;
  onClose: () => void;
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
  const [candidateEmails, setCandidateEmails] = useState<string[]>([]);
  const [currentEmail, setCurrentEmail] = useState('');

  const [eduInput, setEduInput] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    companyName: '',
    qualifications: '',
    deadline: '',
    description: '',
    permission: 'anyone',
    skills: '',
    category: '',
    // New fields
    numQuestions: 5,
    employmentType: 'Full-time',
    minExperience: 0,
    maxExperience: 0,
    experience: 0,
    difficulty: 'Medium',
  });
  const [skillSearch, setSkillSearch] = useState('');

  useEffect(() => {
    const fetchJob = async () => {
      try {
        if (!jobId || !user) {
            return;
        }
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

            setAccessCode(sourceData.accessCode || '');

            let deadlineStr = '';
            const deadlineSource = jobData.applyDeadline || interviewData.deadline;
            if (deadlineSource) {
                if (deadlineSource.toDate) { // Timestamp
                    deadlineStr = deadlineSource.toDate().toISOString().split('T')[0];
                } else if (typeof deadlineSource === 'string') { // String 'YYYY-MM-DD'
                    deadlineStr = deadlineSource;
                }
            }

          setFormData({
            title: jobData.title || interviewData.title?.replace(' Interview', '') || '',
            companyName: jobData.companyName || 'N/A', // Company name might not be on interview doc
            qualifications: jobData.qualifications || interviewData.education || '',
            deadline: deadlineStr,
            description: jobData.description || interviewData.description || '',
            permission: jobData.interviewPermission || 'anyone',
            skills: jobData.skills || interviewData.skills || '',
            category: jobData.category || interviewData.department || '',
            numQuestions: jobData.numQuestions || interviewData.numQuestions || 5,
            employmentType: interviewData.employmentType || 'Full-time',
            minExperience: interviewData.minExperience || interviewData.experience || 0,
            maxExperience: interviewData.maxExperience || interviewData.experience || 0,
            experience: interviewData.experience || 0,
            difficulty: jobData.difficulty || interviewData.difficulty || 'Medium',
          });
          setCustomFields(jobData.customFields || interviewData.customFields || []);
          setManualQuestions(interviewData.manualQuestions || []);
          setCandidateEmails(interviewData.candidateEmails || []);

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
    if (!user || !jobId) return; // Should not happen if button is enabled

    if (formData.maxExperience < formData.minExperience) {
      alert("❌ Maximum experience cannot be less than minimum experience.");
      return;
    }

    setSaving(true);

    try {
      const deadlineDate = new Date(formData.deadline);
      const jobDocRef = doc(db, 'jobs', jobId);
      const interviewDocRef = doc(db, 'interviews', jobId);

      const jobPayload = {
        title: formData.title,
        companyName: formData.companyName,
        qualifications: formData.qualifications,
        description: formData.description,
        interviewPermission: formData.permission,
        skills: formData.skills,
        numQuestions: Number(formData.numQuestions),
        customFields,
        category: formData.category,
        applyDeadline: Timestamp.fromDate(deadlineDate),
        difficulty: formData.difficulty,
        updatedAt: serverTimestamp(),
        // Fields needed if we are creating the job doc for the first time
        recruiterUID: user.uid,
        recruiterName: userProfile?.fullname || user.email,
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
        minExperience: Number(formData.minExperience),
        maxExperience: Number(formData.maxExperience),
        experience: Number(formData.minExperience), // keep backward compatibility
        skills: formData.skills,
        education: formData.qualifications,
        deadline: formData.deadline,
        numQuestions: Number(formData.numQuestions),
        customFields,
        difficulty: formData.difficulty,
        manualQuestions,
        candidateEmails,
        updatedAt: serverTimestamp(),
      };

      await setDoc(jobDocRef, jobPayload, { merge: true });
      await updateDoc(interviewDocRef, interviewPayload);

      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to update job");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <style>{`
        .geist-edit-modal {
          font-family: var(--font-geist-sans, ui-sans-serif, system-ui, sans-serif);
        }
        .geist-edit-modal label {
          display: block;
          margin-bottom: 6px;
          color: #a1a1aa !important;
          font-family: var(--font-geist-sans, ui-sans-serif, system-ui, sans-serif);
          font-size: 12px !important;
          line-height: 16px !important;
          font-weight: 500 !important;
        }
        .geist-edit-modal input:not([type="file"]),
        .geist-edit-modal select,
        .geist-edit-modal textarea {
          width: 100%;
          min-height: 36px;
          border-radius: 6px !important;
          border: 1px solid rgba(255, 255, 255, 0.11) !important;
          background: #050505 !important;
          color: #ededed !important;
          padding: 8px 10px !important;
          font-size: 13px !important;
          line-height: 18px !important;
          outline: none !important;
          box-shadow: none !important;
          color-scheme: dark;
        }
        .geist-edit-modal textarea {
          min-height: 116px;
          resize: vertical;
        }
        .geist-edit-modal input:focus,
        .geist-edit-modal select:focus,
        .geist-edit-modal textarea:focus {
          border-color: rgba(255, 255, 255, 0.28) !important;
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.16) !important;
        }
        .geist-edit-modal input::placeholder,
        .geist-edit-modal textarea::placeholder {
          color: #6b7280 !important;
        }
        .geist-edit-modal .rounded-xl,
        .geist-edit-modal .rounded-2xl,
        .geist-edit-modal .rounded-full,
        .geist-edit-modal .rounded-lg {
          border-radius: 6px !important;
        }
        .geist-edit-modal .form-panel {
          border: 1px solid rgba(255, 255, 255, 0.11) !important;
          background: rgba(255, 255, 255, 0.025) !important;
        }
        .geist-edit-modal form button {
          min-height: 32px;
          border-radius: 6px !important;
          font-size: 13px !important;
          line-height: 18px !important;
          font-weight: 500 !important;
        }
        .geist-edit-modal .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .geist-edit-modal .custom-scrollbar::-webkit-scrollbar-track {
          background: #000;
        }
        .geist-edit-modal .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 999px;
          border: 2px solid #000;
        }
      `}</style>
      <div className="geist-edit-modal bg-[#000] text-white rounded-[8px] shadow-2xl w-full max-w-5xl max-h-[88vh] flex flex-col border border-white/[0.11] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.11] flex justify-between items-center bg-[#050505]">
          <div>
            <p className="geist-label uppercase text-[#6b7280]">Interview setup</p>
            <h2 className="geist-section-title mt-1 text-white flex items-center gap-2">
              Edit job
            </h2>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-white/[0.11] text-[#8f8f8f] hover:bg-white/[0.06] hover:text-white transition-colors">
            <i className="fas fa-times text-xs"></i>
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div></div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
            <div className="p-5 space-y-5 overflow-y-auto custom-scrollbar bg-[#000]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Job Title</label>
            <input 
              type="text" required 
              className="mt-1 w-full px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white"
              value={formData.title}
              onChange={handleFormChange} name="title"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Company</label>
            <input 
              type="text" required 
              className="mt-1 w-full px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white"
              value={formData.companyName}
              onChange={handleFormChange} name="companyName"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Qualifications</label>
          <div className="flex flex-wrap gap-2 mb-2 min-h-[44px] p-2 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl">
            {formData.qualifications ? formData.qualifications.split(',').map(e => e.trim()).filter(e => e).map(edu => (
              <span key={edu} className="px-3 py-1 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 rounded-lg text-sm flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                {edu}
                <button type="button" onClick={() => toggleEducation(edu)} className="hover:text-black dark:hover:text-white transition-colors">&times;</button>
              </span>
            )) : <span className="text-gray-400 dark:text-gray-500 text-sm p-1.5 italic">No qualifications selected</span>}
          </div>

          <div className="flex flex-col gap-2">
            <select
              className="w-full px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all text-sm"
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  toggleEducation(e.target.value);
                  e.target.value = "";
                }
              }}
            >
              <option value="">-- Select Predefined Level --</option>
              {["High School", "Bachelor's", "Master's", "PhD"].map(edu => (
                <option key={edu} value={edu}>{edu}</option>
              ))}
            </select>

            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 min-w-0 px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all text-sm"
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
                className="px-4 py-3 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white border border-gray-200 dark:border-white/10 rounded-xl hover:bg-gray-200 dark:hover:bg-white/10 transition-colors font-medium text-sm shrink-0"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Deadline</label>
            <input 
              type="date" required 
              className="mt-1 w-full px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white dark:[color-scheme:dark]"
              value={formData.deadline}
              onChange={handleFormChange} name="deadline"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Interview Access</label>
            <select 
              className="mt-1 w-full px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white"
              value={formData.permission}
              onChange={handleFormChange} name="permission"
            >
              <option value="anyone">Direct Start (No Request)</option>
              <option value="request">Request Permission Needed</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Job Description</label>
          <textarea 
            required rows={5}
            className="mt-1 w-full px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white"
            value={formData.description}
            onChange={handleFormChange} name="description"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Job Category</label>
          <select 
            name="category" 
            value={formData.category} 
            onChange={handleFormChange}
            className="mt-1 w-full px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white"
          >
            <option value="">Select a Category</option>
            {JOB_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Employment Type</label>
              <select name="employmentType" value={formData.employmentType} onChange={handleFormChange} className="mt-1 w-full px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white">
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Contract">Contract</option>
                <option value="Internship">Internship</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Required Experience (Years)</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  name="minExperience"
                  placeholder="Min"
                  value={formData.minExperience}
                  onChange={handleFormChange}
                  min="0"
                  className="w-1/2 px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white"
                />
                <span className="text-gray-400 dark:text-gray-500 font-medium">to</span>
                <input
                  type="number"
                  name="maxExperience"
                  placeholder="Max"
                  value={formData.maxExperience}
                  onChange={handleFormChange}
                  min="0"
                  className="w-1/2 px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white"
                />
              </div>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Number of AI Questions</label>
              <input type="number" name="numQuestions" value={formData.numQuestions} onChange={handleFormChange} min="1" max="15" className="mt-1 w-full px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Difficulty Level</label>
              <select name="difficulty" value={formData.difficulty} onChange={handleFormChange} className="mt-1 w-full px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white">
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
        </div>

        <div className="form-panel space-y-4 p-4 bg-gray-50/50 dark:bg-gray-800/20 border border-gray-100 dark:border-white/10 rounded-2xl">
            <div>
                <label className="text-sm font-semibold text-gray-900 dark:text-white">Custom Fields</label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Add other relevant info (e.g., Salary Range).</p>
            </div>
            <div className="flex gap-2">
                <input type="text" className="flex-1 px-4 py-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-sm" placeholder="Field Name" value={tempCustomField.key} onChange={e => setTempCustomField({ ...tempCustomField, key: e.target.value })} />
                <input type="text" className="flex-1 px-4 py-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-sm" placeholder="Field Value" value={tempCustomField.value} onChange={e => setTempCustomField({ ...tempCustomField, value: e.target.value })} />
                <button type="button" onClick={handleAddCustomField} className="px-4 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white border border-gray-200 dark:border-white/10 rounded-xl hover:bg-gray-200 dark:hover:bg-white/10 transition-colors font-medium text-sm">Add</button>
            </div>
            {customFields.length > 0 && (
                <div className="space-y-2 mt-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                    {customFields.map((field) => (
                        <div key={field.id} className="flex items-center justify-between p-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl animate-in fade-in">
                            <div className="flex gap-2 text-sm">
                                <strong className="text-gray-800 dark:text-gray-200">{field.key}:</strong>
                                <span className="text-gray-600 dark:text-gray-400">{field.value}</span>
                            </div>
                            <button type="button" onClick={() => handleRemoveCustomField(field.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                                <i className="fa-solid fa-trash-can text-xs"></i>
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Required Skills</label>

          <div className="flex gap-2 mb-2">
             <input 
               type="text"
               className="flex-1 px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white"
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
               className="px-6 py-3 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white border border-gray-200 dark:border-white/10 rounded-xl hover:bg-gray-200 dark:hover:bg-white/10 transition-colors font-medium"
             >
               Add
             </button>
          </div>

          <div className="border border-gray-200 dark:border-white/10 rounded-xl p-3 max-h-40 overflow-y-auto bg-gray-50 dark:bg-[#1a1a1a] custom-scrollbar">
            <div className="flex flex-wrap gap-2">
              {SKILL_OPTIONS.filter(s => s.toLowerCase().includes(skillSearch.toLowerCase())).map(skill => {
                 const isSelected = formData.skills.split(',').map(s => s.trim()).includes(skill);
                 return (
                   <button
                     key={skill}
                     type="button"
                     onClick={() => toggleSkill(skill)}
                     className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                       isSelected 
                         ? 'bg-primary/20 border-primary/50 text-gray-900 dark:text-white font-medium' 
                         : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white'
                     }`}
                   >
                     {skill} {isSelected && '✓'}
                   </button>
                 );
              })}
            </div>
          </div>
        </div>

        {/* Manual Questions */}
        <div className="form-panel space-y-4 p-4 bg-blue-50/50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/20 rounded-2xl">
            <div>
              <label className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <i className="fa-solid fa-clipboard-question text-blue-500"></i>
                Manual Interview Questions (Optional)
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Add specific questions you want the AI to ask.</p>
            </div>
            <div className="flex gap-2">
              <input type="text" className="flex-1 px-4 py-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-sm" placeholder="e.g. Tell us about your experience with React..." value={currentManualQuestion} onChange={e => setCurrentManualQuestion(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddManualQuestion())} />
              <button type="button" onClick={handleAddManualQuestion} className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors font-medium text-sm">Add</button>
            </div>
            {manualQuestions.length > 0 && (
              <div className="space-y-2 mt-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                {manualQuestions.map((q, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl animate-in fade-in">
                    <p className="text-sm text-gray-700 dark:text-gray-300">{q}</p>
                    <button type="button" onClick={() => handleRemoveManualQuestion(index)} className="text-gray-400 hover:text-red-500 transition-colors p-1"><i className="fa-solid fa-trash-can text-xs"></i></button>
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* Candidate Emails */}
        <div className="form-panel space-y-4 p-4 bg-green-50/50 dark:bg-green-500/5 border border-green-100 dark:border-green-500/20 rounded-2xl">
            <div>
              <label className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <i className="fa-solid fa-envelope text-green-500"></i>
                Candidate Emails (Optional)
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Add emails to send interview invites.</p>
            </div>
            <div className="flex gap-2">
              <input type="email" className="flex-1 px-4 py-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-sm" placeholder="candidate@example.com" value={currentEmail} onChange={e => setCurrentEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddEmail())} />
              <button type="button" onClick={handleAddEmail} className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl transition-colors font-medium text-sm">Add</button>
            </div>
            {candidateEmails.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {candidateEmails.map((email) => (
                  <div key={email} className="flex items-center gap-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-full px-3 py-1 text-sm animate-in fade-in">
                    <span className="text-gray-700 dark:text-gray-300">{email}</span>
                    <button type="button" onClick={() => handleRemoveEmail(email)} className="text-gray-400 hover:text-red-500 transition-colors">&times;</button>
                  </div>
                ))}
              </div>
            )}
        </div>

            </div>
            <div className="flex gap-3 p-4 border-t border-white/[0.11] bg-[#050505] mt-auto">
            <button 
              type="button"
              onClick={onClose}
              className="w-1/3 border border-white/[0.11] bg-transparent text-[#d4d4d4] font-medium py-2 px-4 rounded-[6px] hover:bg-white/[0.06] hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={saving}
              className="w-2/3 border border-white bg-white hover:bg-[#ededed] text-black font-medium py-2 px-4 rounded-[6px] transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Update Job'}
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
