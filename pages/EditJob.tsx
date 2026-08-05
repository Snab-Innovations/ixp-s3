import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { createPortal } from 'react-dom';
import { SKILL_OPTIONS, JOB_CATEGORIES } from './Profile';
import { parseJobDescriptionText, ParsedJdResult, compileCompanyProfile } from '../services/geminiService';
import { resolveStrictListedCity } from '../data/maharashtraCities';
import * as pdfjsLib from 'pdfjs-dist';
import { resolveJobOrInterviewDocument } from '../services/jobResolutionService';

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
  const { isDark } = useTheme();
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
  const [suggestedRoleSkills, setSuggestedRoleSkills] = useState<string[]>([]);

  const handleGenerateSkillsForRole = () => {
    const combinedText = `${formData.title} ${formData.category} ${formData.description}`.toLowerCase();
    let skills: string[] = [];

    if (combinedText.includes('civil') || combinedText.includes('site') || combinedText.includes('construction') || combinedText.includes('rcc') || combinedText.includes('building') || combinedText.includes('architect')) {
      skills = ["Site Management", "Construction Site Management", "RCC & Finishing Work", "Quantity Surveying", "AutoCAD", "Bill Verification", "Safety Norms", "Material Management", "Civil Engineering", "Project Execution"];
    } else if (combinedText.includes('front') || combinedText.includes('react') || combinedText.includes('ui') || combinedText.includes('web') || combinedText.includes('frontend')) {
      skills = ["JavaScript", "TypeScript", "React.js", "HTML5 & CSS3", "Tailwind CSS", "Next.js", "Redux", "REST APIs", "Git & GitHub", "Responsive Design"];
    } else if (combinedText.includes('back') || combinedText.includes('node') || combinedText.includes('java') || combinedText.includes('python') || combinedText.includes('api') || combinedText.includes('backend')) {
      skills = ["Node.js", "Express.js", "Python", "Java", "SQL", "PostgreSQL", "MongoDB", "REST APIs", "Docker", "AWS", "Microservices"];
    } else if (combinedText.includes('data') || combinedText.includes('analytics') || combinedText.includes('machine learning') || combinedText.includes('ai') || combinedText.includes('python')) {
      skills = ["Python", "SQL", "Data Analysis", "Pandas & NumPy", "Machine Learning", "Tableau", "Power BI", "Statistics", "TensorFlow"];
    } else if (combinedText.includes('sale') || combinedText.includes('business') || combinedText.includes('marketing') || combinedText.includes('account executive') || combinedText.includes('growth')) {
      skills = ["Lead Generation", "B2B Sales", "Client Relationship Management", "CRM (Salesforce/HubSpot)", "Digital Marketing", "Negotiation", "Cold Outreach", "Market Research"];
    } else if (combinedText.includes('hr') || combinedText.includes('recruiter') || combinedText.includes('talent') || combinedText.includes('people') || combinedText.includes('human resource')) {
      skills = ["Talent Acquisition", "Resume Screening", "HR Operations", "Employee Relations", "Payroll Management", "Onboarding", "Interviewing"];
    } else if (combinedText.includes('finance') || combinedText.includes('account') || combinedText.includes('tax') || combinedText.includes('ca') || combinedText.includes('audit')) {
      skills = ["Financial Analysis", "Accounting", "GST & Taxation", "Tally Prime", "Auditing", "MS Excel", "Balance Sheet Preparation", "Budgeting"];
    } else if (combinedText.includes('design') || combinedText.includes('graphic') || combinedText.includes('figma') || combinedText.includes('ux')) {
      skills = ["Figma", "UI/UX Design", "Wireframing", "Prototyping", "Adobe Photoshop", "Illustrator", "User Research"];
    } else if (combinedText.includes('support') || combinedText.includes('customer') || combinedText.includes('helpdesk')) {
      skills = ["Customer Support", "Query Resolution", "Communication Skills", "Helpdesk Tools", "Ticket Management", "Call Handling"];
    } else {
      skills = ["Problem Solving", "Communication Skills", "Team Management", "Project Management", "Time Management", "Leadership", "Analytical Skills", "Domain Knowledge"];
    }

    setSuggestedRoleSkills(skills);
  };

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
    strictGenderMatch: false,
    strictLocationMatch: false,
    strictEducationMatch: false,
    strictExperienceMatch: false,
    strictness: 'Low',
  });

  const handleApplyParsedJdData = (parsed: ParsedJdResult) => {
    const fullJdText = `${parsed.title || ''} ${parsed.description || ''} ${parsed.skills || ''} ${parsed.qualification || ''} ${parsed.location || ''} ${parsed.gender || ''}`.toLowerCase();
    const hasMandatoryKeyword = /\b(mandatory|compulsory|must have|strictly|strict|non-negotiable|only|required)\b/i.test(fullJdText);

    const autoStrictGender = parsed.strictGenderMatch ?? (
      (parsed.gender && !['any', 'no preference', 'both', 'all'].includes(parsed.gender.toLowerCase())) &&
      (hasMandatoryKeyword || /\b(male only|female only|male candidate|female candidate|gender.*mandatory)\b/i.test(fullJdText))
    );

    const autoStrictLocation = parsed.strictLocationMatch ?? (
      Boolean(parsed.location || parsed.city) &&
      (hasMandatoryKeyword || /\b(local candidates? only|location.*mandatory|based in.*only|must be from)\b/i.test(fullJdText))
    );

    const autoStrictEdu = parsed.strictEducationMatch ?? (
      Boolean(parsed.qualification || parsed.education) &&
      (hasMandatoryKeyword || /\b(education.*mandatory|qualification.*mandatory|degree required)\b/i.test(fullJdText))
    );

    const autoStrictExp = parsed.strictExperienceMatch ?? (
      (Number(parsed.minExperience) > 0 || Number(parsed.maxExperience) > 0) &&
      (hasMandatoryKeyword || /\b(experience.*mandatory|exp.*mandatory|min.*yrs required)\b/i.test(fullJdText))
    );

    const rawLocCandidate = `${(parsed as any).location || ''} ${(parsed as any).city || ''} ${(parsed as any).state || ''} ${fullJdText}`;
    const resolvedStrictCity = resolveStrictListedCity(rawLocCandidate);

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
      location: resolvedStrictCity || prev.location || '',
      salaryRange: (parsed as any).salaryRange || (parsed as any).salary || prev.salaryRange,
      genderRequirement: (parsed as any).genderRequirement || (parsed as any).gender || prev.genderRequirement,
      strictGenderMatch: Boolean(autoStrictGender),
      strictLocationMatch: Boolean(autoStrictLocation),
      strictEducationMatch: Boolean(autoStrictEdu),
      strictExperienceMatch: Boolean(autoStrictExp),
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

  const [targetDocId, setTargetDocId] = useState<string>(jobId);
  const [targetCollection, setTargetCollection] = useState<'jobs' | 'interviews'>('jobs');

  useEffect(() => {
    const fetchJob = async () => {
      try {
        if (!jobId || !user) return;

        const resolved = await resolveJobOrInterviewDocument(jobId);

        if (resolved && resolved.data) {
          const sourceData = resolved.data;
          setTargetDocId(resolved.id);
          setTargetCollection(resolved.collectionName);

          const userTeamId = userProfile?.teamId || userProfile?.parentRecruiterId || userProfile?.primaryRecruiterUID;
          const roleLower = (userProfile?.role || '').toLowerCase();
          const isRecruiterRole = roleLower === 'recruiter' || roleLower === 'primary' || roleLower === 'subrecruiter' || roleLower === 'admin' || roleLower === 'owner';
          const isOwner = isRecruiterRole || sourceData.recruiterUID === user.uid || (userProfile && (userTeamId === sourceData.teamId || sourceData.recruiterUID === userTeamId));
          if (!isOwner) {
            alert("You do not have permission to edit this item.");
            onClose();
            return;
          }

          setAccessCode(sourceData.accessCode || '');

          let deadlineStr = '';
          const deadlineSource = sourceData.applyDeadline || sourceData.deadline;
          if (deadlineSource) {
            if (deadlineSource.toDate) {
              deadlineStr = deadlineSource.toDate().toISOString().split('T')[0];
            } else if (typeof deadlineSource === 'string') {
              deadlineStr = deadlineSource;
            }
          }

          const loadedCategory = 
            sourceData.category || 
            sourceData.department || 
            sourceData.roleCategory || 
            sourceData.jobCategory || 
            sourceData.industry || 
            '';

          setFormData({
            title: sourceData.title?.replace(' Interview', '') || '',
            companyName: sourceData.companyName || sourceData.company || 'N/A',
            qualifications: sourceData.qualifications || sourceData.education || sourceData.qualification || '',
            deadline: deadlineStr,
            description: sourceData.description || '',
            permission: sourceData.interviewPermission || sourceData.permission || 'anyone',
            skills: Array.isArray(sourceData.skills) ? sourceData.skills.join(', ') : (sourceData.skills || ''),
            category: loadedCategory,
            numQuestions: sourceData.numQuestions || 5,
            employmentType: sourceData.employmentType || 'Full-time',
            minExperience: sourceData.minExperience ?? sourceData.experience ?? 0,
            maxExperience: sourceData.maxExperience ?? sourceData.experience ?? 0,
            experience: sourceData.experience ?? 0,
            difficulty: sourceData.difficulty || 'Easy',
            location: sourceData.location || sourceData.city || '',
            salaryRange: sourceData.salaryRange || sourceData.salary || '',
            genderRequirement: sourceData.genderRequirement || sourceData.gender || 'Any',
            strictGenderMatch: sourceData.strictGenderMatch ?? false,
            strictLocationMatch: sourceData.strictLocationMatch ?? false,
            strictEducationMatch: sourceData.strictEducationMatch ?? false,
            strictExperienceMatch: sourceData.strictExperienceMatch ?? false,
            strictness: sourceData.strictness || 'Low',
          });

          setCustomFields(sourceData.customFields || []);
          setManualQuestions(sourceData.manualQuestions || []);

          // Parse candidates
          const emails = sourceData.candidateEmails || [];
          setCandidateEmails(emails);

          const candDataRaw = sourceData.candidateData || sourceData.candidateDataList || [];
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
    const target = e.target as HTMLInputElement;
    const { name, value, type } = target;
    const val = type === 'checkbox' ? target.checked : value;
    setFormData(prev => {
      const updated = {
        ...prev,
        [name]: ['experience', 'minExperience', 'maxExperience', 'numQuestions'].includes(name) ? Number(value) : val
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

    const currentSkills = Array.isArray(formData.skills)
      ? (formData.skills as string[]).map(s => String(s).trim()).filter(Boolean)
      : (typeof formData.skills === 'string' ? formData.skills.split(',').map(s => s.trim()).filter(s => s.length > 0) : []);
    
    let newSkills: string[];
    if (currentSkills.includes(trimmed)) {
      newSkills = currentSkills.filter(s => s !== trimmed);
    } else {
      newSkills = [...currentSkills, trimmed];
    }
    setFormData({ ...formData, skills: newSkills.join(', ') });
  };

  const removeSkill = (skillName: string) => {
    const currentSkills = Array.isArray(formData.skills)
      ? (formData.skills as string[]).map(s => String(s).trim()).filter(Boolean)
      : (typeof formData.skills === 'string' ? formData.skills.split(',').map(s => s.trim()).filter(s => s.length > 0) : []);
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
      const jobDocRef = doc(db, 'jobs', targetDocId);
      const interviewDocRef = doc(db, 'interviews', targetDocId);

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
        roleCategory: formData.category,
        jobCategory: formData.category,
        employmentType: formData.employmentType,
        minExperience: minExp,
        maxExperience: maxExp,
        experience: expString,
        location: formData.location,
        salaryRange: formData.salaryRange,
        salary: formData.salaryRange,
        genderRequirement: formData.genderRequirement,
        gender: formData.genderRequirement,
        strictGenderMatch: formData.strictGenderMatch,
        strictLocationMatch: formData.strictLocationMatch,
        strictEducationMatch: formData.strictEducationMatch,
        strictExperienceMatch: formData.strictExperienceMatch,
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
        category: formData.category,
        department: formData.category,
        roleCategory: formData.category,
        jobCategory: formData.category,
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

  const selectedSkillsList = Array.isArray(formData.skills)
    ? (formData.skills as string[]).map(s => String(s).trim()).filter(Boolean)
    : (typeof formData.skills === 'string' ? formData.skills.split(',').map(s => s.trim()).filter(s => s.length > 0) : []);

  const inputClass = isDark
    ? "w-full px-3.5 py-2.5 bg-[#0d0d0d] text-white border border-white/[0.14] focus:border-indigo-500 rounded-[6px] text-xs font-medium outline-none transition-colors placeholder-slate-500"
    : "w-full px-3.5 py-2.5 bg-slate-50 text-slate-900 border border-slate-300 focus:border-indigo-600 focus:bg-white rounded-[6px] text-xs font-medium outline-none transition-colors placeholder-slate-400";
  
  const labelClass = isDark
    ? "block text-[11px] font-mono font-bold text-slate-400 mb-1 uppercase tracking-wider"
    : "block text-[11px] font-mono font-bold text-slate-600 mb-1 uppercase tracking-wider";

  const panelClass = isDark
    ? "p-4 sm:p-5 rounded-[6px] border border-white/[0.1] bg-white/[0.02] space-y-3"
    : "p-4 sm:p-5 rounded-[6px] border border-slate-200 bg-slate-50/60 space-y-3";

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-3 sm:p-5 animate-in fade-in duration-200">
      <div className={`relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-[8px] border shadow-2xl overflow-hidden transition-colors ${
        isDark ? 'bg-[#000] border-white/[0.13] text-white' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        
        {/* Modal Header */}
        <div className={`px-6 py-4 border-b flex justify-between items-center transition-colors ${
          isDark ? 'bg-[#050505] border-white/[0.11]' : 'bg-slate-50/80 border-slate-200/80'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-[6px] border flex items-center justify-center ${
              isDark ? 'bg-white/10 border-white/20 text-white' : 'bg-slate-900 text-white border-slate-900 shadow-sm'
            }`}>
              <i className="fa-solid fa-pen-to-square text-sm"></i>
            </div>
            <div>
              <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>Job Setup</span>
              <h2 className={`text-base sm:text-lg font-bold leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Edit Job Details</h2>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className={`flex h-8 w-8 items-center justify-center rounded-[6px] transition-colors cursor-pointer ${
              isDark ? 'text-slate-400 hover:bg-white/10 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div>
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
                      {formData.category && !JOB_CATEGORIES.includes(formData.category) && (
                        <option key={formData.category} value={formData.category}>
                          {formData.category}
                        </option>
                      )}
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

                {/* Strict Mandatory AI Criteria Checkmarks */}
                <div className="mt-3 rounded-[8px] border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 p-3.5 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-square-check text-amber-600 dark:text-amber-400 text-xs"></i>
                    <span className="font-bold uppercase text-amber-900 dark:text-amber-300 text-[11px] tracking-wider">
                      Strict Mandatory AI Criteria Checkmarks
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                    <label className="flex items-center gap-2 cursor-pointer p-2 rounded-[6px] border border-amber-200 dark:border-amber-800/40 bg-white dark:bg-neutral-900/70 hover:border-amber-400 transition-all">
                      <input
                        type="checkbox"
                        name="strictGenderMatch"
                        checked={formData.strictGenderMatch}
                        onChange={handleFormChange}
                        className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500 accent-amber-600 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-semibold text-gray-900 dark:text-amber-100 block">Strict Gender</span>
                        <span className="text-[10px] text-gray-500 dark:text-amber-300/70 block">
                          {formData.genderRequirement === 'Any' ? 'Any -> All genders' : `Must be ${formData.genderRequirement}`}
                        </span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer p-2 rounded-[6px] border border-amber-200 dark:border-amber-800/40 bg-white dark:bg-neutral-900/70 hover:border-amber-400 transition-all">
                      <input
                        type="checkbox"
                        name="strictLocationMatch"
                        checked={formData.strictLocationMatch}
                        onChange={handleFormChange}
                        className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500 accent-amber-600 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-semibold text-gray-900 dark:text-amber-100 block">Strict Location</span>
                        <span className="text-[10px] text-gray-500 dark:text-amber-300/70 block truncate max-w-[100px]">
                          {formData.location ? `Must match ${formData.location}` : 'Must match City'}
                        </span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer p-2 rounded-[6px] border border-amber-200 dark:border-amber-800/40 bg-white dark:bg-neutral-900/70 hover:border-amber-400 transition-all">
                      <input
                        type="checkbox"
                        name="strictEducationMatch"
                        checked={formData.strictEducationMatch}
                        onChange={handleFormChange}
                        className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500 accent-amber-600 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-semibold text-gray-900 dark:text-amber-100 block">Strict Education</span>
                        <span className="text-[10px] text-gray-500 dark:text-amber-300/70 block truncate max-w-[100px]">
                          {formData.qualifications ? `Must match ${formData.qualifications}` : 'Must match Qualification'}
                        </span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer p-2 rounded-[6px] border border-amber-200 dark:border-amber-800/40 bg-white dark:bg-neutral-900/70 hover:border-amber-400 transition-all">
                      <input
                        type="checkbox"
                        name="strictExperienceMatch"
                        checked={formData.strictExperienceMatch}
                        onChange={handleFormChange}
                        className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500 accent-amber-600 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-semibold text-gray-900 dark:text-amber-100 block">Strict Experience</span>
                        <span className="text-[10px] text-gray-500 dark:text-amber-300/70 block">
                          {formData.minExperience || formData.maxExperience ? `${formData.minExperience}-${formData.maxExperience} Yrs` : 'Must fit Yrs range'}
                        </span>
                      </div>
                    </label>
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

                {/* Role-Based Skill Recommendations Button & Grid */}
                <div className={`p-4 rounded-[6px] border transition-colors mt-3 ${
                  isDark ? 'bg-[#050505] border-white/[0.1]' : 'bg-slate-50/70 border-slate-200/80'
                }`}>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <span className={`text-[11px] font-mono font-bold uppercase tracking-wider block ${
                        isDark ? 'text-slate-300' : 'text-slate-700'
                      }`}>
                        Role-Based Skill Recommendations
                      </span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Generate skills tailored for <strong className="text-slate-700 dark:text-slate-200">{formData.title || formData.category || 'this job role'}</strong>.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleGenerateSkillsForRole}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[6px] text-xs font-bold transition-all border cursor-pointer shrink-0 shadow-sm ${
                        isDark 
                          ? 'bg-white/10 border-white/20 text-white hover:bg-white/15' 
                          : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      <i className="fas fa-wand-magic-sparkles text-indigo-500"></i>
                      <span>Suggest Skills by Role</span>
                    </button>
                  </div>

                  {suggestedRoleSkills.length > 0 && (
                    <div className="pt-3 mt-3 border-t border-slate-200 dark:border-white/10">
                      <span className="block text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                        Suggested Skills (Click to Add):
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {suggestedRoleSkills.map(skill => {
                          const isSelected = selectedSkillsList.includes(skill);
                          return (
                            <button
                              key={skill}
                              type="button"
                              onClick={() => toggleSkill(skill)}
                              className={`px-3 py-1.5 rounded-[4px] text-xs font-semibold border transition-all cursor-pointer ${
                                isSelected 
                                  ? (isDark ? 'bg-white text-black border-white font-bold' : 'bg-slate-900 text-white border-slate-900 font-bold') 
                                  : (isDark ? 'bg-white/[0.05] border-white/10 text-slate-300 hover:bg-white/10' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100')
                              }`}
                            >
                              {skill} {isSelected && '✓'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
            <div className={`flex gap-3 p-4 border-t transition-colors ${
              isDark ? 'bg-[#050505] border-white/[0.1]' : 'bg-slate-50/80 border-slate-200/80'
            }`}>
              <button 
                type="button"
                onClick={onClose}
                className={`w-1/3 py-2.5 px-4 rounded-[6px] text-xs font-bold border transition-colors cursor-pointer ${
                  isDark 
                    ? 'border-white/[0.12] text-slate-300 hover:bg-white/10 hover:text-white' 
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 shadow-sm'
                }`}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={saving}
                className={`w-2/3 py-2.5 px-4 rounded-[6px] font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer ${
                  isDark 
                    ? 'bg-white text-black hover:bg-[#eaeaea]' 
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
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
