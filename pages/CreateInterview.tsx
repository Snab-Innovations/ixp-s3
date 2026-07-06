import React, { useState } from 'react';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { SKILL_OPTIONS } from './Profile';
import * as pdfjsLib from 'pdfjs-dist';

import { sendInterviewInvitations } from '../services/brevoService';

// Setup PDF.js worker to enable PDF parsing
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const SkeletonBlock = ({ className = '' }: { className?: string }) => (
  <span className={`block animate-pulse rounded-[4px] bg-white/[0.12] ${className}`} aria-hidden="true" />
);

export const CreateInterviewSkeleton = () => (
  <div className="-mx-4 -my-8 min-h-[calc(100dvh-3.5rem)] bg-[#000] text-white sm:-mx-6 lg:-mx-8">
    <header className="border-b border-white/[0.11]">
      <div className="px-4 py-5 sm:px-6 lg:px-7">
        <SkeletonBlock className="h-4 w-32 bg-white/[0.08]" />
        <SkeletonBlock className="mt-2 h-8 w-56" />
        <SkeletonBlock className="mt-2 h-4 w-[32rem] max-w-full bg-white/[0.08]" />
      </div>
    </header>

    <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,0.42fr)_1px_minmax(0,1fr)]">
      <aside className="border-b border-white/[0.11] bg-[#020202] px-4 py-5 sm:px-6 lg:min-h-[calc(100dvh-8.5rem)] lg:border-b-0 lg:px-7">
        <SkeletonBlock className="h-4 w-20 bg-white/[0.08]" />
        <SkeletonBlock className="mt-2 h-6 w-64 max-w-full" />
        <SkeletonBlock className="mt-2 h-4 w-full bg-white/[0.08]" />
        <SkeletonBlock className="mt-1.5 h-4 w-4/5 bg-white/[0.08]" />
        <div className="mt-5 min-h-28 rounded-[6px] border border-dashed border-white/[0.18] bg-white/[0.025] px-4 py-4">
          <SkeletonBlock className="h-4 w-44" />
          <SkeletonBlock className="mt-2 h-3 w-64 max-w-full bg-white/[0.08]" />
          <SkeletonBlock className="mt-2 h-3 w-36 bg-white/[0.08]" />
        </div>
        <div className="mt-7 border-t border-white/[0.11] pt-5">
          <SkeletonBlock className="h-4 w-16 bg-white/[0.08]" />
          <div className="mt-3 divide-y divide-white/[0.11] border border-white/[0.11]">
            {[0, 1, 2].map((item) => (
              <div key={item} className="px-3 py-3">
                <SkeletonBlock className="h-4 w-24" />
                <SkeletonBlock className="mt-2 h-3 w-44 bg-white/[0.08]" />
              </div>
            ))}
          </div>
        </div>
      </aside>

      <div className="hidden bg-white/[0.11] lg:block" />

      <div className="min-w-0">
        {[0, 1, 2].map((section) => (
          <section key={section} className="border-b border-white/[0.11] px-4 py-5 sm:px-6 lg:px-7">
            <SkeletonBlock className="h-4 w-20 bg-white/[0.08]" />
            <SkeletonBlock className="mt-2 h-6 w-40" />
            <SkeletonBlock className="mt-2 h-4 w-[28rem] max-w-full bg-white/[0.08]" />
            <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div>
                <SkeletonBlock className="h-3 w-28 bg-white/[0.08]" />
                <SkeletonBlock className="mt-2 h-9 w-full" />
              </div>
              <div>
                <SkeletonBlock className="h-3 w-32 bg-white/[0.08]" />
                <SkeletonBlock className="mt-2 h-9 w-full" />
              </div>
              <div className="xl:col-span-2">
                <SkeletonBlock className="h-3 w-24 bg-white/[0.08]" />
                <SkeletonBlock className="mt-2 h-28 w-full" />
              </div>
            </div>
          </section>
        ))}
        <div className="sticky bottom-0 border-t border-white/[0.11] bg-[#000]/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SkeletonBlock className="h-3 w-64 max-w-full bg-white/[0.08]" />
            <SkeletonBlock className="h-10 w-64 bg-white/[0.9]" />
          </div>
        </div>
      </div>
    </div>
  </div>
);

const CreateInterview: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');
  const [candidateEmails, setCandidateEmails] = useState<string[]>([]);
  const [currentEmail, setCurrentEmail] = useState('');
  const [parsingJd, setParsingJd] = useState(false);
  const [parsingResumes, setParsingResumes] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [manualQuestions, setManualQuestions] = useState<string[]>([]);
  const [currentManualQuestion, setCurrentManualQuestion] = useState('');
  interface CustomField { id: number; key: string; value: string; }
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [tempCustomField, setTempCustomField] = useState({ key: '', value: '' });

  const [eduInput, setEduInput] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    department: '',
    employmentType: '',
    minExperience: 0,
    maxExperience: 0,
    experience: 0,
    skills: '',
    education: '',
    deadline: '',
    numQuestions: 5,
    difficulty: 'Medium',
    strictness: 'Medium',
  });

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
    const currentEducations = formData.education
      ? formData.education.split(',').map(e => e.trim()).filter(e => e)
      : [];

    let newEducations;
    if (currentEducations.includes(edu)) {
      newEducations = currentEducations.filter(e => e !== edu);
    } else {
      newEducations = [...currentEducations, edu];
    }
    setFormData({ ...formData, education: newEducations.join(', ') });
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

  const handleAddCustomField = () => {
    if (tempCustomField.key.trim() && tempCustomField.value.trim()) {
      setCustomFields([...customFields, { ...tempCustomField, id: Date.now() }]);
      setTempCustomField({ key: '', value: '' });
    }
  };

  const handleRemoveCustomField = (id: number) => {
    setCustomFields(customFields.filter(field => field.id !== id));
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

      const xaiKey = import.meta.env.VITE_XAI_API_KEY;
      if (!xaiKey) throw new Error('XAI API key missing');
      const prompt = `You are an expert HR assistant. Parse the following job description text and extract the fields into a raw JSON object. Schema: {"title": "string", "description": "string", "department": "string", "employmentType": "string", "experience": "number", "skills": "string", "education": "string"}. Return ONLY valid JSON. Text: --- ${text} ---`;

      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${xaiKey}` },
        body: JSON.stringify({
          model: 'grok-4-1-fast-non-reasoning',
          messages: [
            { role: 'system', content: 'You are an expert HR assistant. Return only valid JSON.' },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
      });
      const aiData = await res.json();
      const aiResponseText = aiData.choices?.[0]?.message?.content || '';
      if (!aiResponseText) throw new Error('Grok did not return a response.');
      const parsedData = JSON.parse(aiResponseText);

      setFormData(prev => ({
        ...prev,
        title: parsedData.title || prev.title,
        description: parsedData.description || prev.description,
        department: parsedData.department || prev.department,
        employmentType: parsedData.employmentType || prev.employmentType,
        experience: parsedData.experience || prev.experience,
        skills: parsedData.skills || prev.skills,
        education: parsedData.education || prev.education,
      }));
      alert('✅ Job description parsed and form autofilled!');
    } catch (error) {
      console.error('Error parsing JD:', error);
      alert('❌ Failed to parse job description. Please fill the form manually.');
    } finally {
      setParsingJd(false);
      e.target.value = '';
    }
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setParsingResumes(true);
    const newEmailsFound: string[] = [];
    let filesProcessed = 0;
    let filesWithErrors = 0;

    for (const file of Array.from(files) as File[]) {
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
          continue; // Skip unsupported file types
        }

        const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
        const foundEmails = text.match(emailRegex);

        if (foundEmails) {
          foundEmails.forEach(email => {
            const lowerEmail = email.toLowerCase();
            if (!candidateEmails.includes(lowerEmail) && !newEmailsFound.includes(lowerEmail)) {
              newEmailsFound.push(lowerEmail);
            }
          });
        }
        filesProcessed++;
      } catch (error) {
        console.error(`Error parsing ${file.name}:`, error);
        filesWithErrors++;
      }
    }

    if (newEmailsFound.length > 0) setCandidateEmails(prev => [...prev, ...newEmailsFound]);
    alert(`Processed ${filesProcessed} file(s). Found ${newEmailsFound.length} new email(s). ${filesWithErrors > 0 ? `Failed to parse ${filesWithErrors} file(s).` : ''}`);
    setParsingResumes(false);
    e.target.value = ''; // Reset file input to allow re-uploading the same file
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (formData.maxExperience < formData.minExperience) {
      alert("❌ Maximum experience cannot be less than minimum experience.");
      return;
    }

    setLoading(true);

    try {
      // 1. Generate Interview ID, Link, and Access Code locally
      const newRand = Math.random().toString(36).substring(2, 15);
      const newInterviewLink = `${window.location.origin}/#/interview/${newRand}`;
      const newAccessCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      // 2. Save to Firestore
      await setDoc(doc(db, 'interviews', newRand), {
        ...formData,
        manualQuestions,
        customFields,
        candidateEmails,
        interviewLink: newInterviewLink,
        accessCode: newAccessCode,
        recruiterUID: user.uid,
        createdAt: serverTimestamp(),
        isMock: false,
      });

      // 3. Send invitation emails if candidates are present
      if (candidateEmails.length > 0) {
        setSendingEmails(true);
        try {
          const result = await sendInterviewInvitations(
            candidateEmails,
            formData.title,
            newInterviewLink,
            newAccessCode
          );

          if (result.success) {
            console.log(`[Brevo] Successfully sent ${result.totalEmails} invitation email(s)!`);
          } else {
            console.warn(`[Brevo] Partial failure sending emails: ${result.error}`);
            alert(`⚠️ Interview created, but failed to send some emails: ${result.error}`);
          }
        } catch (err: any) {
          console.error('[Brevo] Email sending error:', err);
          alert(`⚠️ Interview created, but error sending emails: ${err.message}`);
        } finally {
          setSendingEmails(false);
        }
      }

      alert(candidateEmails.length > 0 
        ? "✅ Interview created and invitations sent successfully!" 
        : "✅ Interview created successfully!");
      
      navigate('/recruiter/interviews');
    } catch (err) {
      console.error(err);
      alert("❌ Failed to create interview");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "geist-caption h-9 w-full rounded-[6px] border border-white/[0.11] bg-[#050505] px-3 text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-white/[0.28] focus:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:dark]";
  const textareaClass = "geist-caption min-h-[132px] w-full resize-y rounded-[6px] border border-white/[0.11] bg-[#050505] px-3 py-2.5 text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-white/[0.28] focus:bg-white/[0.04]";
  const selectClass = `${inputClass} appearance-none`;
  const labelClass = "geist-label mb-1.5 block text-[#a1a1aa]";
  const secondaryButtonClass = "geist-caption inline-flex h-9 shrink-0 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40";
  const primaryButtonClass = "geist-caption inline-flex h-10 items-center justify-center rounded-[6px] border border-white bg-white px-4 font-medium text-black transition-colors hover:bg-[#eaeaea] disabled:cursor-not-allowed disabled:opacity-50";
  const panelHeaderClass = "geist-label uppercase text-[#6b7280]";
  const panelTitleClass = "geist-section-title mt-1 text-white";
  const helperTextClass = "geist-small mt-1 max-w-2xl text-[#8f8f8f]";

  return (
    <div className="-mx-4 -my-8 min-h-[calc(100dvh-3.5rem)] bg-[#000] text-white sm:-mx-6 lg:-mx-8">
      <header className="border-b border-white/[0.11]">
        <div className="px-4 py-5 sm:px-6 lg:px-7">
          <p className="geist-label uppercase text-[#6b7280]">Interview setup</p>
          <h1 className="geist-page-title mt-2 text-white">Create interview</h1>
          <p className="geist-small mt-1 max-w-2xl text-[#8f8f8f]">
            Build a structured interview brief, tune the question rules, and prepare candidate invitations from one focused workspace.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,0.42fr)_1px_minmax(0,1fr)]">
        <aside className="border-b border-white/[0.11] bg-[#020202] px-4 py-5 sm:px-6 lg:border-b-0 lg:px-7">
          <div className="lg:sticky lg:top-[5.25rem]">
            <p className={panelHeaderClass}>Source</p>
            <h2 className={panelTitleClass}>Start from a job description</h2>
            <p className={helperTextClass}>
              Upload a PDF or TXT brief to fill role details faster, then review each field before creating the interview.
            </p>

            <label
              htmlFor="jd-upload"
              className={`geist-caption mt-5 flex min-h-28 cursor-pointer flex-col justify-center rounded-[6px] border border-dashed bg-white/[0.025] px-4 py-4 text-[#d4d4d4] transition-colors hover:border-white/[0.3] hover:bg-white/[0.045] ${parsingJd ? 'cursor-not-allowed border-white/[0.12]' : 'border-white/[0.18]'}`}
            >
              {parsingJd ? (
                <span className="flex flex-col gap-2" role="status" aria-label="Parsing job description">
                  <SkeletonBlock className="h-4 w-44" />
                  <SkeletonBlock className="h-3 w-64 max-w-full bg-white/[0.08]" />
                  <SkeletonBlock className="h-3 w-36 bg-white/[0.08]" />
                </span>
              ) : (
                <>
                  <span className="font-medium text-white">Upload job description</span>
                  <span className="geist-small mt-1 text-[#8f8f8f]">PDF or TXT. The form remains editable after import.</span>
                </>
              )}
            </label>
            <input id="jd-upload" type="file" accept=".pdf,.txt" className="hidden" onChange={handleJDUpload} disabled={parsingJd} />

            <div className="mt-7 border-t border-white/[0.11] pt-5">
              <p className={panelHeaderClass}>Flow</p>
              <div className="mt-3 divide-y divide-white/[0.11] border border-white/[0.11]">
                {[
                  ['Brief', 'Role details and requirements'],
                  ['Questions', 'Difficulty and manual prompts'],
                  ['Invites', 'Candidate emails and resume parsing'],
                ].map(([title, copy]) => (
                  <div key={title} className="px-3 py-3">
                    <p className="geist-caption font-medium text-white">{title}</p>
                    <p className="geist-small mt-0.5 text-[#8f8f8f]">{copy}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <div className="hidden bg-white/[0.11] lg:block" />

        <form onSubmit={handleSubmit} className="min-w-0">
          <section className="border-b border-white/[0.11] px-4 py-5 sm:px-6 lg:px-7">
            <p className={panelHeaderClass}>Brief</p>
            <h2 className={panelTitleClass}>Role details</h2>
            <p className={helperTextClass}>Keep the requirements specific so the generated interview stays relevant.</p>

            <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div>
                <label className={labelClass}>Job title / role</label>
                <input name="title" type="text" required className={inputClass} value={formData.title} onChange={handleFormChange} placeholder="Senior Frontend Engineer" />
              </div>

              <div>
                <label className={labelClass}>Company department</label>
                <input name="department" type="text" required className={inputClass} value={formData.department} onChange={handleFormChange} placeholder="Engineering" />
              </div>

              <div className="xl:col-span-2">
                <label className={labelClass}>Job description</label>
                <textarea name="description" required rows={5} className={textareaClass} value={formData.description} onChange={handleFormChange} placeholder="Describe the role, responsibilities, and what you are looking for." />
              </div>

              <div>
                <label className={labelClass}>Employment type</label>
                <select name="employmentType" required className={selectClass} value={formData.employmentType} onChange={handleFormChange}>
                  <option value="">Select type</option>
                  <option value="Full-time">Full-time</option>
                  <option value="Part-time">Part-time</option>
                  <option value="Contract">Contract</option>
                  <option value="Internship">Internship</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>Required experience</label>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                  <input name="minExperience" type="number" min="0" required placeholder="Min" className={inputClass} value={formData.minExperience} onChange={handleFormChange} />
                  <span className="geist-small text-[#6b7280]">to</span>
                  <input name="maxExperience" type="number" min="0" required placeholder="Max" className={inputClass} value={formData.maxExperience} onChange={handleFormChange} />
                </div>
              </div>

              <div className="xl:col-span-2">
                <label className={labelClass}>Minimum education level</label>
                <div className="min-h-10 rounded-[6px] border border-white/[0.11] bg-white/[0.025] p-2">
                  <div className="flex flex-wrap gap-2">
                    {formData.education ? formData.education.split(',').map(e => e.trim()).filter(e => e).map(edu => (
                      <span key={edu} className="geist-small inline-flex h-7 items-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.05] px-2.5 text-[#d4d4d4]">
                        {edu}
                        <button type="button" onClick={() => toggleEducation(edu)} className="text-[#8f8f8f] transition-colors hover:text-white">&times;</button>
                      </span>
                    )) : <span className="geist-caption text-[#6b7280]">No education level selected</span>}
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)_auto]">
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
                    <option value="">Select predefined level</option>
                    {["High School", "Bachelor's", "Master's", "PhD"].map(edu => (
                      <option key={edu} value={edu}>{edu}</option>
                    ))}
                  </select>

                  <input
                    type="text"
                    className={inputClass}
                    placeholder="Or type custom education"
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
          </section>

          <section className="border-b border-white/[0.11] px-4 py-5 sm:px-6 lg:px-7">
            <p className={panelHeaderClass}>Skills</p>
            <h2 className={panelTitleClass}>Required capabilities</h2>
            <p className={helperTextClass}>Select existing skills or add a custom requirement.</p>

            <div className="mt-5 min-h-10 rounded-[6px] border border-white/[0.11] bg-white/[0.025] p-2">
              <div className="flex flex-wrap gap-2">
                {formData.skills ? formData.skills.split(',').map(s => s.trim()).filter(s => s).map(skill => (
                  <span key={skill} className="geist-small inline-flex h-7 items-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.05] px-2.5 text-[#d4d4d4]">
                    {skill}
                    <button type="button" onClick={() => toggleSkill(skill)} className="text-[#8f8f8f] transition-colors hover:text-white">&times;</button>
                  </span>
                )) : <span className="geist-caption text-[#6b7280]">No skills selected</span>}
              </div>
            </div>

            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                className={inputClass}
                placeholder="Search or add custom skill"
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

            <div className="mt-3 max-h-44 overflow-y-auto rounded-[6px] border border-white/[0.11] bg-[#050505] p-2 custom-scrollbar">
              <div className="flex flex-wrap gap-2">
                {SKILL_OPTIONS.filter(s => s.toLowerCase().includes(skillSearch.toLowerCase())).map(skill => {
                  const isSelected = formData.skills.split(',').map(s => s.trim()).includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className={`geist-small inline-flex h-7 items-center rounded-[6px] border px-2.5 transition-colors ${isSelected
                        ? 'border-white/[0.28] bg-white text-black'
                        : 'border-white/[0.11] bg-white/[0.03] text-[#8f8f8f] hover:bg-white/[0.06] hover:text-white'
                        }`}
                    >
                      {skill}{isSelected && ' ✓'}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="border-b border-white/[0.11] px-4 py-5 sm:px-6 lg:px-7">
            <p className={panelHeaderClass}>Questions</p>
            <h2 className={panelTitleClass}>Interview rules</h2>
            <p className={helperTextClass}>Set the generated question count, report behavior, and any manual prompts.</p>

            <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div>
                <label className={labelClass}>AI-generated questions</label>
                <div className="flex h-9 items-center rounded-[6px] border border-white/[0.11] bg-[#050505]">
                  <button type="button" disabled={formData.numQuestions <= 1} onClick={() => setFormData(prev => ({ ...prev, numQuestions: Math.max(1, prev.numQuestions - 1) }))} className="h-full w-10 border-r border-white/[0.11] text-[#8f8f8f] transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-30">-</button>
                  <input name="numQuestions" type="number" min="1" max="25" className="geist-caption h-full min-w-0 flex-1 border-none bg-transparent px-3 text-center font-medium text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={formData.numQuestions} onChange={handleFormChange} />
                  <button type="button" disabled={formData.numQuestions >= 25} onClick={() => setFormData(prev => ({ ...prev, numQuestions: Math.min(25, prev.numQuestions + 1) }))} className="h-full w-10 border-l border-white/[0.11] text-[#8f8f8f] transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-30">+</button>
                </div>
              </div>

              <div>
                <label className={labelClass}>Difficulty level</label>
                <select name="difficulty" value={formData.difficulty} onChange={handleFormChange} className={selectClass}>
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>Report check strictness</label>
                <select name="strictness" value={formData.strictness} onChange={handleFormChange} className={selectClass}>
                  <option value="Low">Low (Ignore minor issues)</option>
                  <option value="Medium">Medium (Balanced)</option>
                  <option value="Hard">Hard (Strict feedback)</option>
                </select>
              </div>
            </div>

            <div className="mt-5 rounded-[6px] border border-white/[0.11] bg-white/[0.025] p-3">
              <label className={labelClass}>Manual interview questions</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Tell us about your experience with React"
                  value={currentManualQuestion}
                  onChange={e => setCurrentManualQuestion(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddManualQuestion();
                    }
                  }}
                />
                <button type="button" onClick={handleAddManualQuestion} className={secondaryButtonClass}>Add</button>
              </div>

              {manualQuestions.length > 0 && (
                <div className="mt-3 max-h-60 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                  {manualQuestions.map((q, index) => (
                    <div key={index} className="flex items-start justify-between gap-3 rounded-[6px] border border-white/[0.11] bg-[#050505] px-3 py-2.5">
                      <p className="geist-caption min-w-0 text-[#d4d4d4]">{q}</p>
                      <button type="button" onClick={() => handleRemoveManualQuestion(index)} className="geist-small shrink-0 text-[#8f8f8f] transition-colors hover:text-white">Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 rounded-[6px] border border-white/[0.11] bg-white/[0.025] p-3">
              <label className={labelClass}>Custom fields</label>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <input type="text" className={inputClass} placeholder="Field name, e.g. Salary range" value={tempCustomField.key} onChange={e => setTempCustomField({ ...tempCustomField, key: e.target.value })} />
                <input type="text" className={inputClass} placeholder="Field value, e.g. $80k - $120k" value={tempCustomField.value} onChange={e => setTempCustomField({ ...tempCustomField, value: e.target.value })} />
                <button type="button" onClick={handleAddCustomField} className={secondaryButtonClass}>Add</button>
              </div>

              {customFields.length > 0 && (
                <div className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                  {customFields.map((field) => (
                    <div key={field.id} className="flex items-center justify-between gap-3 rounded-[6px] border border-white/[0.11] bg-[#050505] px-3 py-2.5">
                      <p className="geist-caption min-w-0 truncate text-[#d4d4d4]"><span className="font-medium text-white">{field.key}:</span> {field.value}</p>
                      <button type="button" onClick={() => handleRemoveCustomField(field.id)} className="geist-small shrink-0 text-[#8f8f8f] transition-colors hover:text-white">Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="px-4 py-5 sm:px-6 lg:px-7">
            <p className={panelHeaderClass}>Invites</p>
            <h2 className={panelTitleClass}>Candidate access</h2>
            <p className={helperTextClass}>Add candidate emails directly or extract them from uploaded resumes.</p>

            <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div>
                <label className={labelClass}>Application deadline</label>
                <input name="deadline" type="date" className={inputClass} value={formData.deadline} onChange={handleFormChange} />
              </div>

              <div>
                <label className={labelClass}>Candidate emails</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="email"
                    value={currentEmail}
                    onChange={(e) => setCurrentEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddEmail();
                      }
                    }}
                    placeholder="candidate@company.com"
                    className={inputClass}
                  />
                  <button type="button" onClick={handleAddEmail} className={secondaryButtonClass}>Add</button>
                </div>
              </div>
            </div>

            {candidateEmails.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {candidateEmails.map(email => (
                  <span key={email} className="geist-small inline-flex h-7 items-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.05] px-2.5 text-[#d4d4d4]">
                    {email}
                    <button type="button" onClick={() => handleRemoveEmail(email)} className="text-[#8f8f8f] transition-colors hover:text-white">&times;</button>
                  </span>
                ))}
              </div>
            )}

            <div className="mt-5 rounded-[6px] border border-white/[0.11] bg-white/[0.025] p-3">
              <label
                htmlFor="resume-upload"
                className={`geist-caption flex cursor-pointer items-center justify-between gap-3 rounded-[6px] border border-dashed bg-[#050505] px-3 py-3 text-[#d4d4d4] transition-colors hover:border-white/[0.3] hover:bg-white/[0.045] ${parsingResumes ? 'cursor-not-allowed border-white/[0.12]' : 'border-white/[0.18]'}`}
              >
                {parsingResumes ? (
                  <span className="flex w-full items-center justify-between gap-3" role="status" aria-label="Parsing resumes">
                    <span className="flex min-w-0 flex-1 flex-col gap-2">
                      <SkeletonBlock className="h-4 w-48 max-w-full" />
                      <SkeletonBlock className="h-3 w-28 bg-white/[0.08]" />
                    </span>
                    <SkeletonBlock className="h-3 w-16 bg-white/[0.08]" />
                  </span>
                ) : (
                  <>
                    <span className="font-medium text-white">Upload resumes to find emails</span>
                    <span className="geist-small text-[#8f8f8f]">PDF or TXT</span>
                  </>
                )}
              </label>
              <input id="resume-upload" type="file" multiple accept=".pdf,.txt" className="hidden" onChange={handleResumeUpload} disabled={parsingResumes} />
              <p className="geist-small mt-2 text-[#8f8f8f]">Extracted emails are added to the invite queue for review before sending.</p>
            </div>
          </section>

          <div className="sticky bottom-0 border-t border-white/[0.11] bg-[#000]/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="geist-small text-[#8f8f8f]">Access codes are generated when the interview is created.</p>
              <button type="submit" disabled={loading || sendingEmails} className={primaryButtonClass}>
                {loading || sendingEmails ? (
                  <span className="flex w-56 max-w-full flex-col items-center gap-1.5" role="status" aria-label={loading ? 'Saving interview' : 'Sending invitations'}>
                    <SkeletonBlock className="h-3.5 w-40 bg-black/[0.18]" />
                    <SkeletonBlock className="h-2.5 w-28 bg-black/[0.12]" />
                  </span>
                ) : 'Create interview and send invitations'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateInterview;
