import React, { useState, useEffect } from 'react';
import { rds } from '../services/rdsApi';
import { loadStoredCognitoSession } from '../services/authService';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
import { useMessageBox } from '../components/MessageBox';
import { sendWhatsAppMessage } from '../services/waSenderService';

export const SKILL_OPTIONS = [
  "HTML", "CSS", "React", "Node.js", "JavaScript", "TypeScript", "Java",
  "Python", "C++", "C#", "MongoDB", "SQL", "PostgreSQL", "Firebase",
  "AWS", "Docker", "Git", "TensorFlow", "DSA", "Data Analysis",
  "Machine Learning", "Next.js", "Vue.js", "Angular", "Express.js",
  "Redux", "Tailwind CSS", "SASS", "GraphQL", "Linux"
];

export const JOB_CATEGORIES = [
  "Software Development", "Data Science & Analytics", "Design & Creative",
  "Marketing & Sales", "Finance & Accounting", "Human Resources",
  "Engineering", "Product Management", "Customer Support",
  "Legal", "Healthcare", "Education", "Operations & Admin"
];

interface ExperienceItem { id: number; role: string; company: string; duration: string; description: string; }
interface EducationItem { id: number; degree: string; school: string; year: string; }
interface ProjectItem { id: number; title: string; link: string; description: string; }
interface CertificationItem { id: number; name: string; issuer: string; year: string; }
interface VolunteeringItem { id: number; role: string; organization: string; duration: string; description: string; }
interface CustomSection { id: number; title: string; content: string; }

const Profile: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [parsingResume, setParsingResume] = useState(false);
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const messageBox = useMessageBox();
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    phoneNumber: '',
    photoURL: '',
    location: '',
    bio: '',
    linkedin: '',
    github: '',
    portfolio: '',
    education: '',
    experience: '',
    experienceYears: 0,
    skills: '',
    preferredCategories: '',
    experienceList: [] as ExperienceItem[],
    educationList: [] as EducationItem[],
    projects: [] as ProjectItem[],
    certifications: [] as CertificationItem[],
    volunteering: [] as VolunteeringItem[],
    hobbies: '',
    customSections: [] as CustomSection[]
  });
  // WhatsApp Testing & Credential States
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Hello! This is a test message from SNAB Innovations WhatsApp API system.');
  const [savingWaCredentials, setSavingWaCredentials] = useState(false);
  const [testingWa, setTestingWa] = useState(false);
  const [tempExp, setTempExp] = useState<ExperienceItem>({ id: 0, role: '', company: '', duration: '', description: '' });
  const [tempEdu, setTempEdu] = useState<EducationItem>({ id: 0, degree: '', school: '', year: '' });
  const [tempProject, setTempProject] = useState<ProjectItem>({ id: 0, title: '', link: '', description: '' });
  const [tempCert, setTempCert] = useState<CertificationItem>({ id: 0, name: '', issuer: '', year: '' });
  const [tempVol, setTempVol] = useState<VolunteeringItem>({ id: 0, role: '', organization: '', duration: '', description: '' });
  const [tempCustom, setTempCustom] = useState<CustomSection>({ id: 0, title: '', content: '' });
  const [skillSearch, setSkillSearch] = useState('');

  const handleSaveWaCredentials = async () => {
    const user = loadStoredCognitoSession();
    if (!user?.firebaseUid) return;
    setSavingWaCredentials(true);
    try {
      await Promise.all([
        rds.putProfile(user.firebaseUid, {
          whatsappSessionId: formData.whatsappSessionId || '',
          whatsappSessionPasscode: formData.whatsappSessionPasscode || ''
        }),
        rds.updateUser(user.firebaseUid, {
          whatsappSessionId: formData.whatsappSessionId || '',
          whatsappSessionPasscode: formData.whatsappSessionPasscode || ''
        })
      ]);
      messageBox.showSuccess('✅ WhatsApp Session Credentials saved successfully!');
    } catch (err: any) {
      console.error("Error saving WhatsApp credentials:", err);
      messageBox.showError("Failed to save WhatsApp credentials.");
    } finally {
      setSavingWaCredentials(false);
    }
  };

  const handleTestWaMessage = async () => {
    if (!testPhone.trim()) {
      messageBox.showError("Please enter a valid mobile number for testing (e.g. 9823188483)");
      return;
    }
    if (!formData.whatsappSessionId.trim() || !formData.whatsappSessionPasscode.trim()) {
      messageBox.showError("Please enter your WhatsApp Session ID & Passcode before testing.");
      return;
    }

    setTestingWa(true);
    try {
      const res = await sendWhatsAppMessage(
        testPhone.trim(),
        testMessage.trim(),
        {
          sessionId: formData.whatsappSessionId.trim(),
          passcode: formData.whatsappSessionPasscode.trim()
        }
      );

      if (res.success) {
        messageBox.showSuccess(`🎉 WhatsApp test message dispatched successfully to ${testPhone.trim()}!`);
      } else {
        messageBox.showError(`❌ Test Failed: ${res.error || 'Failed to send WhatsApp message'}`);
      }
    } catch (err: any) {
      console.error("WhatsApp testing error:", err);
      messageBox.showError(`Test Failed: ${err.message || 'Network error'}`);
    } finally {
      setTestingWa(false);
    }
  };

  const steps = [
    { id: 'basics', title: 'Identity', icon: 'fa-id-card', description: 'Start with the basics.' },
    { id: 'about', title: 'Story', icon: 'fa-book-open', description: 'Tell us about yourself.' },
    { id: 'work', title: 'Experience', icon: 'fa-briefcase', description: 'Your professional journey.' },
    { id: 'education', title: 'Education', icon: 'fa-graduation-cap', description: 'Your academic background.' },
    { id: 'projects', title: 'Projects', icon: 'fa-project-diagram', description: 'Showcase your work.' },
    { id: 'skills', title: 'Skills', icon: 'fa-tools', description: 'What you bring to the table.' },
    { id: 'custom', title: 'Custom', icon: 'fa-plus-circle', description: 'Add custom sections.' },
    { id: 'socials', title: 'Connect', icon: 'fa-network-wired', description: 'Where can we find you?' }
  ];

  useEffect(() => {
    const loggedInUser = loadStoredCognitoSession();
    const loggedInUid = loggedInUser?.firebaseUid;
    const profileUserId = userId || loggedInUid;

    setIsOwnProfile(!userId || (loggedInUid === userId));

    if (profileUserId) {
      (async () => {
        try {
          const [profileRes, meRes] = await Promise.all([
            rds.getProfile(profileUserId).catch(() => null),
            profileUserId === loggedInUid ? rds.me().catch(() => null) : Promise.resolve(null)
          ]);

          const profileInfo = profileRes?.profile || {};
          const userInfo = meRes?.user || {};

          setFormData({
            displayName: profileInfo.displayName || userInfo.fullname || '',
            email: userInfo.email || '',
            phoneNumber: profileInfo.phoneNumber || userInfo.phone || '',
            photoURL: profileInfo.photoURL || userInfo.photoURL || '',
            location: profileInfo.location || '',
            bio: profileInfo.bio || '',
            linkedin: profileInfo.linkedin || '',
            github: profileInfo.github || '',
            portfolio: profileInfo.portfolio || '',
            education: profileInfo.education || '',
            experience: profileInfo.experience || '',
            experienceYears: userInfo.experience || 0,
            skills: profileInfo.skills || '',
            preferredCategories: profileInfo.preferredCategories || '',
            experienceList: profileInfo.experienceList || [],
            educationList: profileInfo.educationList || [],
            projects: profileInfo.projects || [],
            certifications: profileInfo.certifications || [],
            volunteering: profileInfo.volunteering || [],
            hobbies: profileInfo.hobbies || '',
            customSections: profileInfo.customSections || [],
            whatsappSessionId: profileInfo.whatsappSessionId || userInfo.whatsappSessionId || '',
            whatsappSessionPasscode: profileInfo.whatsappSessionPasscode || userInfo.whatsappSessionPasscode || ''
          });
        } catch (err) {
          console.error("Error fetching profile:", err);
        } finally {
          setLoading(false);
        }
      })();
    } else {
      setLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
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

  const toggleCategory = (category: string) => {
    const current = formData.preferredCategories
      ? formData.preferredCategories.split(',').map(s => s.trim()).filter(s => s)
      : [];

    let newCats;
    if (current.includes(category)) {
      newCats = current.filter(c => c !== category);
    } else {
      newCats = [...current, category];
    }
    setFormData({ ...formData, preferredCategories: newCats.join(', ') });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500000) { // 500KB limit
        messageBox.showWarning("Image size too large. Please upload an image smaller than 500KB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, photoURL: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const addItem = (type: 'experience' | 'education' | 'project' | 'certification' | 'volunteering' | 'custom') => {
    const id = Date.now();
    switch (type) {
      case 'experience':
        if (tempExp.role && tempExp.company) {
          setFormData(prev => ({ ...prev, experienceList: [...prev.experienceList, { ...tempExp, id }] }));
          setTempExp({ id: 0, role: '', company: '', duration: '', description: '' });
        }
        break;
      case 'education':
        if (tempEdu.degree && tempEdu.school) {
          setFormData(prev => ({ ...prev, educationList: [...prev.educationList, { ...tempEdu, id }] }));
          setTempEdu({ id: 0, degree: '', school: '', year: '' });
        }
        break;
      case 'project':
        if (tempProject.title) {
          setFormData(prev => ({ ...prev, projects: [...prev.projects, { ...tempProject, id }] }));
          setTempProject({ id: 0, title: '', link: '', description: '' });
        }
        break;
      case 'certification':
        if (tempCert.name) {
          setFormData(prev => ({ ...prev, certifications: [...prev.certifications, { ...tempCert, id }] }));
          setTempCert({ id: 0, name: '', issuer: '', year: '' });
        }
        break;
      case 'volunteering':
        if (tempVol.role && tempVol.organization) {
          setFormData(prev => ({ ...prev, volunteering: [...prev.volunteering, { ...tempVol, id }] }));
          setTempVol({ id: 0, role: '', organization: '', duration: '', description: '' });
        }
        break;
      case 'custom':
        if (tempCustom.title && tempCustom.content) {
          setFormData(prev => ({ ...prev, customSections: [...prev.customSections, { ...tempCustom, id }] }));
          setTempCustom({ id: 0, title: '', content: '' });
        }
        break;
    }
  };

  const parseResumeText = (text: string) => {
    const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
    const phoneRegex = /(\+\d{1,3}[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}/;

    const emailMatch = text.match(emailRegex);
    const phoneMatch = text.match(phoneRegex);
    const linkedinMatch = text.match(/linkedin\.com\/in\/[a-zA-Z0-9-]+/i);
    const githubMatch = text.match(/github\.com\/[a-zA-Z0-9-]+/i);
    const portfolioMatch = text.match(/(www\.|https?:\/\/)[a-zA-Z0-9-]+\.[a-z]{2,}(\/[a-zA-Z0-9-]+)?/i);

    // Simple heuristic for name: First line that isn't empty and doesn't look like a label
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    let nameCandidate = '';
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const line = lines[i];
      if (line.length > 3 && line.length < 40 && !line.includes('@') && !line.toLowerCase().includes('resume')) {
        // Check if it looks like a name (no numbers, mostly letters)
        if (!/\d/.test(line)) {
          nameCandidate = line;
          break;
        }
      }
    }

    // Extract skills based on known list
    const foundSkills = SKILL_OPTIONS.filter(skill =>
      new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)
    );

    // Helper to extract section content
    const extractSection = (keywords: string[]) => {
      const lowerText = text.toLowerCase();
      let startIndex = -1;

      // Find start of section
      for (const k of keywords) {
        const idx = lowerText.indexOf(k);
        if (idx !== -1 && (startIndex === -1 || idx < startIndex)) {
          startIndex = idx;
        }
      }
      if (startIndex === -1) return '';

      // Find end of section (start of next known section)
      const allKeywords = ['education', 'experience', 'work', 'employment', 'skills', 'projects', 'summary', 'profile', 'contact', 'languages', 'certifications'];
      let endIndex = text.length;
      for (const k of allKeywords) {
        const idx = lowerText.indexOf(k, startIndex + 20); // Skip the header itself
        if (idx !== -1 && idx < endIndex) {
          endIndex = idx;
        }
      }

      return text.slice(startIndex, endIndex).replace(new RegExp(keywords.join('|'), 'gi'), '').trim();
    };

    return {
      email: emailMatch ? emailMatch[0] : '',
      phone: phoneMatch ? phoneMatch[0] : '',
      name: nameCandidate,
      skills: foundSkills,
      linkedin: linkedinMatch ? `https://${linkedinMatch[0]}` : '',
      github: githubMatch ? `https://${githubMatch[0]}` : '',
      portfolio: portfolioMatch && !portfolioMatch[0].includes('linkedin') && !portfolioMatch[0].includes('github') ? (portfolioMatch[0].startsWith('http') ? portfolioMatch[0] : `https://${portfolioMatch[0]}`) : '',
      bio: extractSection(['summary', 'profile', 'about me', 'objective']),
      experience: extractSection(['experience', 'work history', 'employment']),
      education: extractSection(['education', 'academic', 'university'])
    };
  };

  const handleResumeAutofill = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsingResume(true);
    try {
      let text = '';
      if (file.type === 'application/pdf') {
        // Use unpkg for a reliable worker source matching the library version
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          text += pageText + ' ';
        }
      } else {
        text = await file.text();
      }

      const parsedData = parseResumeText(text);

      setFormData(prev => ({
        ...prev,
        displayName: parsedData.name || prev.displayName,
        bio: parsedData.bio || prev.bio,
        experience: parsedData.experience || prev.experience,
        education: parsedData.education || prev.education,
        skills: parsedData.skills.length > 0 ? parsedData.skills.join(', ') : prev.skills,
        email: parsedData.email || prev.email,
        phoneNumber: parsedData.phone || prev.phoneNumber,
        linkedin: parsedData.linkedin || prev.linkedin,
        github: parsedData.github || prev.github,
        portfolio: parsedData.portfolio || prev.portfolio
      }));

      messageBox.showSuccess("Resume parsed! Please review and edit the filled fields.");
    } catch (err) {
      console.error("Resume parsing error:", err);
      messageBox.showError("Failed to parse resume.");
    } finally {
      setParsingResume(false);
    }
  };

  const calculateCompletion = () => {
    const fields = ['displayName', 'email', 'phoneNumber', 'location', 'bio', 'skills', 'experience', 'education'];
    const filled = fields.filter(f => !!formData[f as keyof typeof formData]);
    return Math.round((filled.length / fields.length) * 100);
  };

  const completion = calculateCompletion();


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = loadStoredCognitoSession();
    if (!user?.firebaseUid) return;
    setSaving(true);
    try {
      await Promise.all([
        rds.putProfile(user.firebaseUid, { ...formData }),
        rds.updateUser(user.firebaseUid, {
          whatsappSessionId: formData.whatsappSessionId || '',
          whatsappSessionPasscode: formData.whatsappSessionPasscode || ''
        })
      ]);
      messageBox.showSuccess('Profile & WhatsApp credentials updated successfully!');
      setIsEditing(false); // Switch back to view mode after saving
    } catch (err) {
      console.error("Error saving profile:", err);
      messageBox.showError('Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const downloadProfileAsPDF = () => {
    const doc = new jsPDF();
    let y = 15;
    doc.setFontSize(18);
    doc.text(formData.displayName, 10, y);
    y += 10;
    doc.setFontSize(12);
    doc.text(`Email: ${formData.email}`, 10, y);
    y += 7;
    doc.text(`Location: ${formData.location}`, 10, y);
    y += 10;
    doc.setFontSize(14);
    doc.text("About", 10, y);
    y += 7;
    doc.setFontSize(10);
    const bioLines = doc.splitTextToSize(formData.bio, 180);
    doc.text(bioLines, 10, y);
    // ... add more sections
    doc.save(`${formData.displayName}_Profile.pdf`);
  };

  const downloadProfileAsJPG = async () => {
    const element = document.getElementById('profile-view-content');
    if (!element) return;

    try {
      // @ts-ignore
      const html2canvas = (await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm')).default;
      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      const link = document.createElement('a');
      link.download = `${formData.displayName}_Profile.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.9);
      link.click();
    } catch (error) {
      console.error("JPG generation failed", error);
      messageBox.showError("Could not generate JPG.");
    }
  };


  if (loading) return <div className="p-6 text-center">Loading profile...</div>;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <div className="mb-6">
        <button onClick={() => navigate(-1)} className="text-primary hover:underline flex items-center gap-2">
          <i className="fas fa-arrow-left"></i> Back
        </button>
      </div>

      {!isEditing ? (
        // VIEW-ONLY PROFILE
        <div>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
            <h2 className="text-3xl font-bold text-gray-800 dark:text-white">
              {isOwnProfile ? 'My Profile' : 'Profile'}
            </h2>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              {isOwnProfile && (
                <button onClick={() => setIsEditing(true)} className="flex-1 sm:flex-none justify-center px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-primary-dark">
                  <i className="fas fa-edit"></i> Edit Profile
                </button>
              )}
              <button onClick={downloadProfileAsPDF} className="flex-1 sm:flex-none justify-center px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-green-700"><i className="fas fa-file-pdf"></i> PDF</button>
              <button onClick={downloadProfileAsJPG} className="flex-1 sm:flex-none justify-center px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-orange-700"><i className="fas fa-image"></i> JPG</button>
            </div>
          </div>

          <div id="profile-view-content" className="bg-white dark:bg-[#0a0a0a] p-4 md:p-8 rounded-2xl shadow-lg border border-gray-100 dark:border-white/5">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-8 mb-8 pb-8 border-b border-gray-200 dark:border-white/10 text-center md:text-left">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full opacity-75 blur group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                <img
                  src={formData.photoURL || `https://ui-avatars.com/api/?name=${formData.displayName.replace(/\s/g, '+')}&background=random&color=fff`}
                  alt="Profile"
                  className="relative w-28 h-28 md:w-36 md:h-36 rounded-full object-cover border-4 border-white dark:border-[#0a0a0a] shadow-xl flex-shrink-0"
                />
              </div>
              
              <div className="flex-1 w-full">
                <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-2">{formData.displayName}</h1>
                
                <div className="flex items-center justify-center md:justify-start gap-2 text-gray-500 dark:text-gray-400 mb-6">
                  <i className="fas fa-map-marker-alt text-primary"></i> 
                  <span className="font-medium">{formData.location || 'Location not specified'}</span>
                </div>

                <div className="flex flex-wrap justify-center md:justify-start gap-3 md:gap-4">
                  <div className="px-4 py-2 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5 flex items-center gap-3 shadow-sm">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <i className="fas fa-tools"></i>
                    </div>
                    <div className="text-left">
                        <p className="font-bold text-gray-900 dark:text-white leading-none">{formData.skills.split(',').filter(s => s).length}</p>
                        <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-0.5">Skills</p>
                    </div>
                  </div>
                  
                  <div className="px-4 py-2 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5 flex items-center gap-3 shadow-sm">
                    <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                        <i className="fas fa-briefcase"></i>
                    </div>
                    <div className="text-left">
                        <p className="font-bold text-gray-900 dark:text-white leading-none">{formData.experienceYears}</p>
                        <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-0.5">Years Exp.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Body */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              {/* Left/Main Column */}
              <div className="lg:col-span-2 space-y-8">
                {formData.bio && (
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white border-b border-gray-200 dark:border-white/10 pb-2 mb-3">About Me</h3>
                    <p className="text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{formData.bio}</p>
                  </div>
                )}

                {/* Experience */}
                {(formData.experienceList.length > 0 || formData.experience) && (
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white border-b border-gray-200 dark:border-white/10 pb-2 mb-3">Experience</h3>
                    {formData.experienceList.length > 0 ? (
                      <div className="space-y-4">
                        {formData.experienceList.map(exp => (
                          <div key={exp.id}>
                            <div className="flex justify-between items-baseline">
                              <h4 className="font-bold text-gray-800 dark:text-white">{exp.role}</h4>
                              <span className="text-sm text-gray-500 dark:text-gray-400">{exp.duration}</span>
                            </div>
                            <div className="text-primary font-medium text-sm mb-1">{exp.company}</div>
                            <p className="text-gray-600 dark:text-gray-300 text-sm whitespace-pre-wrap">{exp.description}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{formData.experience}</p>
                    )}
                  </div>
                )}

                {/* Projects */}
                {formData.projects.length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white border-b border-gray-200 dark:border-white/10 pb-2 mb-3">Projects</h3>
                    <div className="space-y-4">
                      {formData.projects.map(proj => (
                        <div key={proj.id}>
                          <div className="flex justify-between items-baseline">
                            <h4 className="font-bold text-gray-800 dark:text-white">{proj.title}</h4>
                            {proj.link && <a href={proj.link} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">View Project</a>}
                          </div>
                          <p className="text-gray-600 dark:text-gray-300 text-sm whitespace-pre-wrap">{proj.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom Sections */}
                {formData.customSections.map(section => (
                  <div key={section.id}>
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white border-b border-gray-200 dark:border-white/10 pb-2 mb-3">{section.title}</h3>
                    <p className="text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{section.content}</p>
                  </div>
                ))}

                {/* Education */}
                {(formData.educationList.length > 0 || formData.education) && (
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white border-b border-gray-200 dark:border-white/10 pb-2 mb-3">Education</h3>
                    {formData.educationList.length > 0 ? (
                      <div className="space-y-4">
                        {formData.educationList.map(edu => (
                          <div key={edu.id}>
                            <div className="flex justify-between items-baseline">
                              <h4 className="font-bold text-gray-800 dark:text-white">{edu.school}</h4>
                              <span className="text-sm text-gray-500 dark:text-gray-400">{edu.year}</span>
                            </div>
                            <div className="text-gray-600 dark:text-gray-300 text-sm">{edu.degree}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{formData.education}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Right Sidebar */}
              <div className="space-y-8">
                <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-gray-100 dark:border-white/5">
                  <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase mb-3">Contact & Links</h3>
                  <div className="space-y-3 text-sm">
                    {formData.email && <div className="flex items-center gap-3 truncate text-gray-700 dark:text-gray-300"><i className="fas fa-envelope text-gray-400 dark:text-gray-500 w-4 text-center"></i><a href={`mailto:${formData.email}`} className="text-primary hover:underline">{formData.email}</a></div>}
                    {formData.phoneNumber && <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300"><i className="fas fa-phone text-gray-400 dark:text-gray-500 w-4 text-center"></i><span>{formData.phoneNumber}</span></div>}
                    {formData.portfolio && <div className="flex items-center gap-3 truncate text-gray-700 dark:text-gray-300"><i className="fas fa-globe text-gray-400 dark:text-gray-500 w-4 text-center"></i><a href={formData.portfolio} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Portfolio</a></div>}
                    {formData.linkedin && <div className="flex items-center gap-3 truncate text-gray-700 dark:text-gray-300"><i className="fab fa-linkedin text-gray-400 dark:text-gray-500 w-4 text-center"></i><a href={formData.linkedin} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">LinkedIn</a></div>}
                    {formData.github && <div className="flex items-center gap-3 truncate text-gray-700 dark:text-gray-300"><i className="fab fa-github text-gray-400 dark:text-gray-500 w-4 text-center"></i><a href={formData.github} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">GitHub</a></div>}
                  </div>
                </div>

                {/* Certifications */}
                {formData.certifications.length > 0 && (
                  <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-gray-100 dark:border-white/5">
                    <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase mb-3">Certifications</h3>
                    <div className="space-y-3 text-sm">
                      {formData.certifications.map(cert => (
                        <div key={cert.id}>
                          <div className="font-bold text-gray-800 dark:text-white">{cert.name}</div>
                          <div className="text-gray-600 dark:text-gray-400 text-xs">{cert.issuer} • {cert.year}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Volunteering */}
                {formData.volunteering.length > 0 && (
                  <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-gray-100 dark:border-white/5">
                    <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase mb-3">Volunteering</h3>
                    <div className="space-y-3 text-sm">
                      {formData.volunteering.map(vol => (
                        <div key={vol.id}>
                          <div className="font-bold text-gray-800 dark:text-white">{vol.role}</div>
                          <div className="text-xs text-gray-600 dark:text-gray-300">{vol.organization}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{vol.duration}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {formData.skills && (
                  <div>
                    <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase mb-3">Skills</h3>
                    <div className="flex flex-wrap gap-2">
                      {formData.skills.split(',').map(s => s.trim()).filter(s => s).map(skill => (
                        <span key={skill} className="px-3 py-1 bg-blue-50 dark:bg-blue-500/10 text-blue-800 dark:text-blue-300 rounded-full text-xs font-medium border border-blue-100 dark:border-blue-500/20">{skill}</span>
                      ))}
                    </div>
                  </div>
                )}
                {formData.hobbies && (
                  <div>
                    <h3 className="text-sm font-bold text-gray-500 dark:text-slate-400 uppercase mb-3">Hobbies</h3>
                    <p className="text-sm text-gray-600 dark:text-slate-300">
                      {formData.hobbies}
                    </p>
                  </div>
                )}
                {formData.preferredCategories && (
                  <div>
                    <h3 className="text-sm font-bold text-gray-500 dark:text-slate-400 uppercase mb-3">Preferred Categories</h3>
                    <div className="flex flex-wrap gap-2">
                      {formData.preferredCategories.split(',').map(c => c.trim()).filter(c => c).map(cat => (
                        <span key={cat} className="px-3 py-1 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 rounded-full text-xs font-medium border border-gray-200 dark:border-white/10">{cat}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        // EDITABLE PROFILE for the logged-in user
        <>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Edit My Profile</h2>
            <button onClick={() => setIsEditing(false)} className="px-4 py-2 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-700">
              Cancel
            </button>
          </div>

          {/* Journey Progress Bar */}
          <div className="mb-8 md:mb-10">
            <div className="flex items-center justify-between relative min-w-[280px]">
              <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-1 bg-gray-200 dark:bg-slate-800 -z-10 rounded-full"></div>
              <div className="absolute left-0 top-1/2 transform -translate-y-1/2 h-1 bg-primary -z-10 rounded-full transition-all duration-500" style={{ width: `${(activeStep / (steps.length - 1)) * 100}%` }}></div>

              {steps.map((step, index) => (
                <button
                  key={step.id}
                  onClick={() => setActiveStep(index)}
                  className={`flex flex-col items-center gap-2 group focus:outline-none`}
                >
                  <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center border-4 transition-all duration-300 z-10 ${index <= activeStep
                    ? 'border-primary bg-white dark:bg-slate-900 text-primary shadow-lg scale-110'
                    : 'border-gray-300 dark:border-slate-700 bg-gray-100 dark:bg-slate-800 text-gray-400'
                    }`}>
                    <i className={`fas ${step.icon} text-xs md:text-sm`}></i>
                  </div>
                  <span className={`hidden md:block text-xs font-bold transition-colors duration-300 ${index <= activeStep ? 'text-primary' : 'text-gray-400'}`}>{step.title}</span>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-lg shadow-sm border border-gray-200 dark:border-slate-800 space-y-4">

            <div className="min-h-[400px]">
              {activeStep === 0 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 md:p-6 rounded-xl border border-blue-100 dark:border-blue-800 mb-6">
                    <h4 className="font-bold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
                      <i className="fas fa-magic"></i> Quick Start
                    </h4>
                    <p className="text-sm text-blue-600 dark:text-blue-400 mb-4">Upload your resume to automatically fill in your details.</p>
                    <label className="flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-slate-800 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-xl cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
                      <i className={`fas fa-cloud-upload-alt ${parsingResume ? 'fa-spin' : ''} text-blue-500`}></i>
                      <span className="font-medium text-blue-700 dark:text-blue-300">{parsingResume ? 'Parsing Resume...' : 'Upload Resume (PDF/TXT)'}</span>
                      <input type="file" accept=".pdf,.txt" className="hidden" onChange={handleResumeAutofill} disabled={parsingResume} />
                    </label>
                  </div>

                  <div className="flex flex-col md:flex-row items-center gap-6 pb-6 border-b border-gray-100 dark:border-slate-800 text-center md:text-left">
                    <div className="relative group">
                      <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden border-2 border-gray-200 dark:border-slate-700">
                        {formData.photoURL ? (
                          <img src={formData.photoURL} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-3xl text-gray-400 dark:text-slate-500 font-bold">
                            {formData.displayName ? formData.displayName.charAt(0).toUpperCase() : <i className="fas fa-user"></i>}
                          </span>
                        )}
                      </div>
                      <label className="absolute bottom-0 right-0 bg-primary text-white p-2 rounded-full cursor-pointer hover:bg-primary-dark shadow-md transition-colors">
                        <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </label>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-800 dark:text-white">Profile Photo</h3>
                      <p className="text-sm text-gray-500 dark:text-slate-400">Upload a professional picture.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Full Name</label>
                      <input type="text" name="displayName" value={formData.displayName} onChange={handleChange} className="w-full p-3 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-slate-950 dark:text-white" placeholder="John Doe" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Phone Number</label>
                      <input type="tel" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} className="w-full p-3 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-slate-950 dark:text-white" placeholder="+1 (555) 000-0000" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Location</label>
                      <input type="text" name="location" value={formData.location} onChange={handleChange} className="w-full p-3 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-slate-950 dark:text-white" placeholder="City, Country" />
                    </div>

                    <div className="md:col-span-2 p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10 space-y-4 mt-3">
                      {/* Section Header */}
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-500/20 pb-3">
                        <div>
                          <h4 className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                            <i className="fab fa-whatsapp text-lg"></i>
                            <span>WhatsApp Task Manager Credentials</span>
                          </h4>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                            Set your account's individual WhatsApp Session ID & Passcode. These credentials will be used strictly whenever you send candidate invitations via WhatsApp.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={handleSaveWaCredentials}
                          disabled={savingWaCredentials}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                        >
                          {savingWaCredentials ? (
                            <>
                              <i className="fas fa-spinner fa-spin"></i> Saving...
                            </>
                          ) : (
                            <>
                              <i className="fas fa-save"></i> Save Credentials
                            </>
                          )}
                        </button>
                      </div>

                      {/* Credentials Inputs */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                            WhatsApp Session ID
                          </label>
                          <input
                            type="text"
                            name="whatsappSessionId"
                            value={formData.whatsappSessionId || ''}
                            onChange={handleChange}
                            className="w-full p-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                            placeholder="e.g. aa"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                            WhatsApp Session Passcode
                          </label>
                          <input
                            type="password"
                            name="whatsappSessionPasscode"
                            value={formData.whatsappSessionPasscode || ''}
                            onChange={handleChange}
                            className="w-full p-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                            placeholder="e.g. ."
                          />
                        </div>
                      </div>

                      {/* Live Testing Tool Box */}
                      <div className="pt-3 border-t border-emerald-500/20 space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-500 uppercase tracking-wider">
                          <i className="fas fa-paper-plane"></i>
                          <span>Live WhatsApp Testing Tool</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                              Test Contact Mobile Number
                            </label>
                            <input
                              type="tel"
                              value={testPhone}
                              onChange={(e) => setTestPhone(e.target.value)}
                              placeholder="e.g. 9823188483"
                              className="w-full p-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                              Test Message
                            </label>
                            <input
                              type="text"
                              value={testMessage}
                              onChange={(e) => setTestMessage(e.target.value)}
                              placeholder="Enter test message content..."
                              className="w-full p-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={handleTestWaMessage}
                            disabled={testingWa}
                            className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/40 text-emerald-400 hover:text-white rounded-lg text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                          >
                            {testingWa ? (
                              <>
                                <i className="fas fa-spinner fa-spin"></i> Sending Test WhatsApp...
                              </>
                            ) : (
                              <>
                                <i className="fab fa-whatsapp text-sm"></i> Send Test Message
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeStep === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Professional Bio</label>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">Write a short summary of your background, achievements, and what you are looking for.</p>
                    <textarea name="bio" value={formData.bio} onChange={handleChange} className="w-full p-4 border border-gray-300 dark:border-slate-700 rounded-xl h-64 focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-slate-950 dark:text-white leading-relaxed" placeholder="I am a passionate developer with 5 years of experience..." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Hobbies & Interests</label>
                    <textarea name="hobbies" value={formData.hobbies} onChange={handleChange} className="w-full p-4 border border-gray-300 dark:border-slate-700 rounded-xl h-24 focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-slate-950 dark:text-white" placeholder="Photography, Hiking, Chess..." />
                  </div>
                </div>
              )}

              {activeStep === 2 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Work Experience</label>
                    <div className="bg-gray-50 dark:bg-slate-800/50 p-4 rounded-xl border border-gray-100 dark:border-slate-800 space-y-3 mb-4">
                      <input type="text" placeholder="Job Title" className="w-full p-3 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white" value={tempExp.role} onChange={e => setTempExp({ ...tempExp, role: e.target.value })} />
                      <input type="text" placeholder="Company Name" className="w-full p-3 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white" value={tempExp.company} onChange={e => setTempExp({ ...tempExp, company: e.target.value })} />
                      <input type="text" placeholder="Duration (e.g. Jan 2020 - Present)" className="w-full p-3 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white" value={tempExp.duration} onChange={e => setTempExp({ ...tempExp, duration: e.target.value })} />
                      <textarea placeholder="Description of responsibilities..." rows={3} className="w-full p-3 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white" value={tempExp.description} onChange={e => setTempExp({ ...tempExp, description: e.target.value })}></textarea>
                      <button type="button" onClick={() => addItem('experience')} className="w-full py-2 bg-white dark:bg-slate-950 border border-primary text-primary rounded-lg font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors shadow-sm">+ Add Position</button>
                    </div>
                    <div className="space-y-2">
                      {formData.experienceList.map((exp) => (
                        <div key={exp.id} className="flex justify-between items-center p-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm">
                          <div>
                            <span className="font-bold dark:text-white">{exp.role}</span> at <span className="dark:text-slate-300">{exp.company}</span>
                          </div>
                          <button type="button" onClick={() => setFormData(prev => ({ ...prev, experienceList: prev.experienceList.filter(e => e.id !== exp.id) }))} className="text-red-500 hover:text-red-700"><i className="fas fa-trash"></i></button>
                        </div>
                      ))}
                    </div>
                    {/* Fallback for old data */}
                    {formData.experience && formData.experienceList.length === 0 && (
                      <div className="mt-4">
                        <p className="text-xs text-gray-500 mb-1">Legacy Data (Clear this to use the list above):</p>
                        <textarea name="experience" value={formData.experience} onChange={handleChange} className="w-full p-3 border border-gray-300 dark:border-slate-700 rounded-lg h-24 bg-white dark:bg-slate-950 dark:text-white" />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Volunteering</label>
                    <div className="bg-gray-50 dark:bg-slate-800/50 p-4 rounded-xl border border-gray-100 dark:border-slate-800 space-y-3 mb-4">
                      <input type="text" placeholder="Role" className="w-full p-3 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white" value={tempVol.role} onChange={e => setTempVol({ ...tempVol, role: e.target.value })} />
                      <input type="text" placeholder="Organization" className="w-full p-3 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white" value={tempVol.organization} onChange={e => setTempVol({ ...tempVol, organization: e.target.value })} />
                      <input type="text" placeholder="Duration" className="w-full p-3 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white" value={tempVol.duration} onChange={e => setTempVol({ ...tempVol, duration: e.target.value })} />
                      <button type="button" onClick={() => addItem('volunteering')} className="w-full py-2 bg-white dark:bg-slate-950 border border-primary text-primary rounded-lg font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors shadow-sm">+ Add Volunteering</button>
                    </div>
                    <div className="space-y-2">
                      {formData.volunteering.map((vol) => (
                        <div key={vol.id} className="flex justify-between items-center p-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm">
                          <span className="font-medium dark:text-slate-300">{vol.role} at {vol.organization}</span>
                          <button type="button" onClick={() => setFormData(prev => ({ ...prev, volunteering: prev.volunteering.filter(v => v.id !== vol.id) }))} className="text-red-500 hover:text-red-700"><i className="fas fa-trash"></i></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeStep === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Education</label>
                    <div className="bg-gray-50 dark:bg-slate-800/50 p-4 rounded-xl border border-gray-100 dark:border-slate-800 space-y-3 mb-4">
                      <input type="text" placeholder="Degree / Certificate" className="w-full p-3 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white" value={tempEdu.degree} onChange={e => setTempEdu({ ...tempEdu, degree: e.target.value })} />
                      <input type="text" placeholder="School / University" className="w-full p-3 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white" value={tempEdu.school} onChange={e => setTempEdu({ ...tempEdu, school: e.target.value })} />
                      <input type="text" placeholder="Year (e.g. 2022)" className="w-full p-3 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white" value={tempEdu.year} onChange={e => setTempEdu({ ...tempEdu, year: e.target.value })} />
                      <button type="button" onClick={() => addItem('education')} className="w-full py-2 bg-white dark:bg-slate-950 border border-primary text-primary rounded-lg font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors shadow-sm">+ Add Education</button>
                    </div>
                    <div className="space-y-2">
                      {formData.educationList.map((edu) => (
                        <div key={edu.id} className="flex justify-between items-center p-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm">
                          <span className="font-medium dark:text-slate-300">{edu.degree} at {edu.school}</span>
                          <button type="button" onClick={() => setFormData(prev => ({ ...prev, educationList: prev.educationList.filter(e => e.id !== edu.id) }))} className="text-red-500 hover:text-red-700"><i className="fas fa-trash"></i></button>
                        </div>
                      ))}
                    </div>
                    {/* Fallback for old data */}
                    {formData.education && formData.educationList.length === 0 && (
                      <div className="mt-4">
                        <p className="text-xs text-gray-500 mb-1">Legacy Data (Clear this to use the list above):</p>
                        <textarea name="education" value={formData.education} onChange={handleChange} className="w-full p-3 border border-gray-300 dark:border-slate-700 rounded-lg h-24 bg-white dark:bg-slate-950 dark:text-white" />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Certifications</label>
                    <div className="bg-gray-50 dark:bg-slate-800/50 p-4 rounded-xl border border-gray-100 dark:border-slate-800 space-y-3 mb-4">
                      <input type="text" placeholder="Certification Name" className="w-full p-3 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white" value={tempCert.name} onChange={e => setTempCert({ ...tempCert, name: e.target.value })} />
                      <input type="text" placeholder="Issuer" className="w-full p-3 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white" value={tempCert.issuer} onChange={e => setTempCert({ ...tempCert, issuer: e.target.value })} />
                      <input type="text" placeholder="Year" className="w-full p-3 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white" value={tempCert.year} onChange={e => setTempCert({ ...tempCert, year: e.target.value })} />
                      <button type="button" onClick={() => addItem('certification')} className="w-full py-2 bg-white dark:bg-slate-950 border border-primary text-primary rounded-lg font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors shadow-sm">+ Add Certification</button>
                    </div>
                    <div className="space-y-2">
                      {formData.certifications.map((cert) => (
                        <div key={cert.id} className="flex justify-between items-center p-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm">
                          <span className="font-medium dark:text-slate-300">{cert.name}</span>
                          <button type="button" onClick={() => setFormData(prev => ({ ...prev, certifications: prev.certifications.filter(c => c.id !== cert.id) }))} className="text-red-500 hover:text-red-700"><i className="fas fa-trash"></i></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeStep === 4 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Projects</label>
                    <div className="bg-gray-50 dark:bg-slate-800/50 p-4 rounded-xl border border-gray-100 dark:border-slate-800 space-y-3 mb-4">
                      <input type="text" placeholder="Project Title" className="w-full p-3 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white" value={tempProject.title} onChange={e => setTempProject({ ...tempProject, title: e.target.value })} />
                      <input type="text" placeholder="Link (GitHub/Demo)" className="w-full p-3 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white" value={tempProject.link} onChange={e => setTempProject({ ...tempProject, link: e.target.value })} />
                      <textarea placeholder="Project Description..." rows={3} className="w-full p-3 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white" value={tempProject.description} onChange={e => setTempProject({ ...tempProject, description: e.target.value })}></textarea>
                      <button type="button" onClick={() => addItem('project')} className="w-full py-2 bg-white dark:bg-slate-950 border border-primary text-primary rounded-lg font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors shadow-sm">+ Add Project</button>
                    </div>
                    <div className="space-y-2">
                      {formData.projects.map((proj) => (
                        <div key={proj.id} className="flex justify-between items-center p-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm">
                          <span className="font-medium dark:text-slate-300">{proj.title}</span>
                          <button type="button" onClick={() => setFormData(prev => ({ ...prev, projects: prev.projects.filter(p => p.id !== proj.id) }))} className="text-red-500 hover:text-red-700"><i className="fas fa-trash"></i></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeStep === 5 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Skills</label>
                    <div className="flex flex-wrap gap-2 mb-3 min-h-[40px] p-3 border border-gray-200 dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800/50">
                      {formData.skills ? formData.skills.split(',').map(s => s.trim()).filter(s => s).map(skill => (
                        <span key={skill} className="px-3 py-1 bg-primary text-white rounded-full text-sm flex items-center gap-2">
                          {skill}
                          <button type="button" onClick={() => toggleSkill(skill)} className="hover:text-gray-200 font-bold">&times;</button>
                        </span>
                      )) : <span className="text-gray-400 dark:text-slate-500 text-sm p-1">No skills selected</span>}
                    </div>

                    <div className="flex gap-2 mb-4">
                      <input
                        type="text"
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-slate-950 dark:text-white"
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
                        className="px-6 py-2 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 font-medium"
                      >
                        Add
                      </button>
                    </div>

                    <div className="border border-gray-200 dark:border-slate-700 rounded-xl p-4 max-h-60 overflow-y-auto bg-gray-50 dark:bg-slate-900/50">
                      <p className="text-xs text-gray-500 dark:text-slate-400 mb-3 uppercase font-bold tracking-wider">Suggested Skills</p>
                      <div className="flex flex-wrap gap-2">
                        {SKILL_OPTIONS.filter(s => s.toLowerCase().includes(skillSearch.toLowerCase())).map(skill => {
                          const isSelected = formData.skills.split(',').map(s => s.trim()).includes(skill);
                          return (
                            <button
                              key={skill}
                              type="button"
                              onClick={() => toggleSkill(skill)}
                              className={`px-3 py-1 rounded-full text-sm border transition-all ${isSelected
                                ? 'bg-primary/10 border-primary text-primary font-medium ring-1 ring-primary'
                                : 'bg-white dark:bg-slate-950 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-gray-300'
                                }`}
                            >
                              {skill} {isSelected && '✓'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Preferred Job Categories</label>
                    <div className="flex flex-wrap gap-2">
                      {JOB_CATEGORIES.map(cat => {
                        const isSelected = formData.preferredCategories.split(',').map(s => s.trim()).includes(cat);
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => toggleCategory(cat)}
                            className={`px-4 py-2 rounded-xl text-sm border transition-all ${isSelected
                              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-700 dark:text-blue-300 font-medium'
                              : 'bg-white dark:bg-slate-950 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                              }`}
                          >
                            {cat}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeStep === 6 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Custom Sections</label>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">Add any other information you want to share (e.g., Publications, Awards, Languages).</p>
                    <div className="bg-gray-50 dark:bg-slate-800/50 p-4 rounded-xl border border-gray-100 dark:border-slate-800 space-y-3 mb-4">
                      <input type="text" placeholder="Section Title (e.g. Languages)" className="w-full p-3 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white" value={tempCustom.title} onChange={e => setTempCustom({ ...tempCustom, title: e.target.value })} />
                      <textarea placeholder="Content..." rows={3} className="w-full p-3 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 dark:text-white" value={tempCustom.content} onChange={e => setTempCustom({ ...tempCustom, content: e.target.value })}></textarea>
                      <button type="button" onClick={() => addItem('custom')} className="w-full py-2 bg-white dark:bg-slate-950 border border-primary text-primary rounded-lg font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors shadow-sm">+ Add Section</button>
                    </div>
                    <div className="space-y-2">
                      {formData.customSections.map((sec) => (
                        <div key={sec.id} className="flex justify-between items-center p-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm">
                          <span className="font-medium dark:text-slate-300">{sec.title}</span>
                          <button type="button" onClick={() => setFormData(prev => ({ ...prev, customSections: prev.customSections.filter(s => s.id !== sec.id) }))} className="text-red-500 hover:text-red-700"><i className="fas fa-trash"></i></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeStep === 7 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">LinkedIn Profile URL</label>
                    <div className="relative">
                      <i className="fab fa-linkedin absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                      <input type="url" name="linkedin" value={formData.linkedin} onChange={handleChange} className="w-full pl-10 p-3 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-slate-950 dark:text-white" placeholder="https://linkedin.com/in/..." />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">GitHub Profile URL</label>
                    <div className="relative">
                      <i className="fab fa-github absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                      <input type="url" name="github" value={formData.github} onChange={handleChange} className="w-full pl-10 p-3 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-slate-950 dark:text-white" placeholder="https://github.com/..." />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Portfolio / Website</label>
                    <div className="relative">
                      <i className="fas fa-globe absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                      <input type="url" name="portfolio" value={formData.portfolio} onChange={handleChange} className="w-full pl-10 p-3 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-slate-950 dark:text-white" placeholder="https://myportfolio.com" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between pt-6 border-t border-gray-100 dark:border-slate-800 mt-6">
              <button
                type="button"
                onClick={() => setActiveStep(Math.max(0, activeStep - 1))}
                disabled={activeStep === 0}
                className="px-4 md:px-6 py-2.5 text-gray-600 dark:text-slate-300 font-medium hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Back
              </button>

              {activeStep < steps.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setActiveStep(Math.min(steps.length - 1, activeStep + 1))}
                  className="px-6 md:px-8 py-2.5 bg-primary text-white font-bold rounded-xl hover:bg-primary-dark shadow-lg shadow-primary/30 transition-all transform hover:-translate-y-0.5"
                >
                  Next Step
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 md:px-8 py-2.5 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-lg shadow-green-600/30 transition-all transform hover:-translate-y-0.5 disabled:opacity-70"
                >
                  {saving ? 'Saving...' : 'Complete Profile'}
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  );
};
export default Profile;