import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from './firebase';

export interface JobDetailItem {
  id: string;
  label: string;
  icon: string;
  value: string;
  enabled: boolean;
  isCustom?: boolean;
}

export const DEFAULT_JOB_DETAILS_ITEMS: JobDetailItem[] = [
  { id: 'post', label: 'Job Post', icon: '•', value: '{{job_title}}', enabled: true },
  { id: 'deadline', label: 'Completion Deadline', icon: '•', value: '{{interview_deadline}}', enabled: true },
  { id: 'employmentType', label: 'Employment Type', icon: '•', value: '{{employment_type}}', enabled: true },
  { id: 'location', label: 'Location', icon: '•', value: '{{location}}', enabled: true },
  { id: 'qualification', label: 'Qualification', icon: '•', value: '{{qualification}}', enabled: true },
  { id: 'experience', label: 'Experience Required', icon: '•', value: '{{experience}}', enabled: true },
  { id: 'salary', label: 'Salary Offered', icon: '•', value: '{{salary}}', enabled: true },
  { id: 'department', label: 'Department / Category', icon: '•', value: 'Engineering / Software', enabled: false },
  { id: 'workShift', label: 'Shift / Working Hours', icon: '•', value: 'Day Shift (Standard)', enabled: false },
  { id: 'requiredSkills', label: 'Required Skills', icon: '•', value: 'As specified in JD', enabled: false },
  { id: 'customFields', label: 'Custom Job Fields', icon: '•', value: 'Custom Fields', enabled: true },
];

export interface JobDetailsFieldsConfig {
  post: boolean;
  employmentType: boolean;
  location: boolean;
  qualification: boolean;
  experience: boolean;
  salary: boolean;
  customFields: boolean;
}

export const DEFAULT_JOB_DETAILS_FIELDS: JobDetailsFieldsConfig = {
  post: true,
  employmentType: true,
  location: true,
  qualification: true,
  experience: true,
  salary: true,
  customFields: true,
};

export interface EmailTemplateConfig {
  subject: string;
  badgeText: string;
  headline: string;
  body: string;
  showJobDetails: boolean;
  jobDetailsFields?: JobDetailsFieldsConfig;
  jobDetailItems?: JobDetailItem[];
  showCredentialsBox: boolean;
  ctaButtonText: string;
  accentColor: string;
  instructions: string[];
  customFooter: string;
}

export interface WhatsAppTemplateConfig {
  headline: string;
  body: string;
  showJobDetails: boolean;
  jobDetailsFields?: JobDetailsFieldsConfig;
  jobDetailItems?: JobDetailItem[];
  showCredentials: boolean;
  showRecruiterContact: boolean;
  instructions: string;
  signoff: string;
}

export interface RecruiterTemplates {
  emailInvite: EmailTemplateConfig;
  emailReminder: EmailTemplateConfig;
  whatsappInvite: WhatsAppTemplateConfig;
  whatsappReminder: WhatsAppTemplateConfig;
}

export const DYNAMIC_VARIABLES = [
  { tag: '{{candidate_name}}', label: 'Candidate Name', example: 'Rahul Sharma' },
  { tag: '{{candidate_email}}', label: 'Candidate Email', example: 'rahul.sharma@example.com' },
  { tag: '{{candidate_phone}}', label: 'Candidate Phone', example: '+91 9876543210' },
  { tag: '{{job_title}}', label: 'Job Title / Post', example: 'Senior Software Engineer' },
  { tag: '{{company_name}}', label: 'Company / Client Name', example: 'Dsource' },
  { tag: '{{interview_link}}', label: 'Assessment Link', example: 'https://dsource.in/#/interview/inv-12345' },
  { tag: '{{access_code}}', label: 'Access Code', example: 'DX-8921' },
  { tag: '{{interview_code}}', label: 'Interview Code (Alias)', example: 'DX-8921' },
  { tag: '{{interview_deadline}}', label: 'Interview Deadline', example: 'Within 48 Hours' },
  { tag: '{{location}}', label: 'Job Location', example: 'Mumbai / Hybrid' },
  { tag: '{{qualification}}', label: 'Qualification', example: 'B.Tech / B.E. / MCA' },
  { tag: '{{experience}}', label: 'Experience Required', example: '3 - 5 Years' },
  { tag: '{{salary}}', label: 'Salary Offered', example: '₹8,00,000 - ₹12,00,000 PA' },
  { tag: '{{employment_type}}', label: 'Employment Type', example: 'Full Time' },
  { tag: '{{recruiter_name}}', label: 'Recruiter Name', example: 'Anjali Verma (HR Head)' },
  { tag: '{{recruiter_phone}}', label: 'Recruiter Phone', example: '+91 9762588623' },
  { tag: '{{recruiter_email}}', label: 'Recruiter Email', example: 'hr@dsource.in' },
  { tag: '{{support_phone}}', label: 'Support Contact Phone', example: '9762588623 / 8484888632' },
];

export const TEMPLATE_PRESETS = [
  {
    id: 'shortlisted',
    label: 'Shortlisted Candidate Email',
    description: 'Official congratulations email for shortlisted candidates',
    email: {
      subject: 'Congratulations {{candidate_name}}! You’ve Been Shortlisted for {{job_title}} | {{company_name}}',
      badgeText: 'SHORTLISTED CANDIDATE',
      headline: 'Dear {{candidate_name}},',
      body: 'Congratulations! After reviewing your profile, you have been <strong>shortlisted for the {{job_title}} position at {{company_name}}</strong>. As the next step in our hiring process, we’d like to invite you to complete a 15–20 minute AI Video Interview at your convenience. Unlike a traditional HR screening call, you can complete this interview anytime before the deadline using your mobile or laptop.<br/><br/>- <strong>No need to schedule an HR call</strong><br/>- <strong>Available 24×7—complete it at your convenience</strong><br/>- <strong>Takes only 15–20 minutes</strong><br/>- <strong>Your responses are reviewed by our recruitment team</strong><br/>- <strong>Successful candidates will be contacted for the next hiring stage</strong>',
      showJobDetails: true,
      jobDetailsFields: DEFAULT_JOB_DETAILS_FIELDS,
      jobDetailItems: DEFAULT_JOB_DETAILS_ITEMS,
      showCredentialsBox: true,
      ctaButtonText: 'Start My Interview ->',
      accentColor: '#0f172a',
      instructions: [
        'Use a laptop or mobile with a working camera and microphone.',
        'Keep a stable internet connection.',
        'Once the interview begins, avoid refreshing or closing the browser tab.'
      ],
      customFooter: 'Need Technical Assistance? Call Dsource Support: {{support_phone}}'
    },
    whatsapp: {
      headline: '*CONGRATULATIONS! YOU ARE SHORTLISTED*',
      body: 'Dear *{{candidate_name}}*,\n\nGreat news! After reviewing your profile, you have been *shortlisted for the {{job_title}} position at {{company_name}}*.\n\nPlease complete your 15–20 minute AI Video Interview from your phone or laptop at your convenience.\n\n*Completion Deadline:* *{{interview_deadline}}*\n- No need to schedule an HR call\n- Available 24×7—complete at your convenience\n- Takes only 15–20 minutes\n- Responses reviewed by recruitment team\n- Successful candidates move to next hiring stage',
      showJobDetails: true,
      jobDetailsFields: DEFAULT_JOB_DETAILS_FIELDS,
      jobDetailItems: DEFAULT_JOB_DETAILS_ITEMS,
      showCredentials: true,
      showRecruiterContact: true,
      instructions: '*Instructions before starting:*\n• Use a laptop or mobile with camera & mic.\n• Keep a stable internet connection.\n• Complete before: *{{interview_deadline}}*',
      signoff: 'Best of luck!\n\n*{{company_name}} Recruitment Team*'
    }
  },
  {
    id: 'technicalRound',
    label: 'Technical Assessment Round',
    description: 'Invitation for technical evaluation and skill testing',
    email: {
      subject: 'Technical Assessment Invitation: {{job_title}} | {{company_name}}',
      badgeText: 'TECHNICAL EVALUATION ROUND',
      headline: 'Dear {{candidate_name}},',
      body: 'Thank you for your interest in the <strong>{{job_title}}</strong> position at <strong>{{company_name}}</strong>.<br/><br/>Based on your profile, you have been advanced to the <strong>Technical Assessment Round</strong>. This automated video evaluation will test your core technical and domain skills.',
      showJobDetails: true,
      jobDetailsFields: DEFAULT_JOB_DETAILS_FIELDS,
      jobDetailItems: DEFAULT_JOB_DETAILS_ITEMS,
      showCredentialsBox: true,
      ctaButtonText: 'Begin Technical Round ->',
      accentColor: '#8b5cf6',
      instructions: [
        'Ensure a quiet environment without background distractions.',
        'Camera and microphone must remain on during the session.',
        'Attempt all questions within the given time limits.',
        'Deadline: {{interview_deadline}}.'
      ],
      customFooter: 'Questions? Reach out to Recruiter: {{recruiter_name}} ({{recruiter_phone}})'
    },
    whatsapp: {
      headline: '*TECHNICAL ROUND INVITATION*',
      body: 'Dear *{{candidate_name}}*,\n\nYou have been selected for the *Technical Assessment Round* for the *{{job_title}}* role at *{{company_name}}*.\n\nPlease attempt your evaluation before *{{interview_deadline}}* using the credentials below.',
      showJobDetails: true,
      jobDetailsFields: DEFAULT_JOB_DETAILS_FIELDS,
      jobDetailItems: DEFAULT_JOB_DETAILS_ITEMS,
      showCredentials: true,
      showRecruiterContact: true,
      instructions: '*Technical Round Guidelines:*\n• Stable internet connection required\n• Working webcam and mic mandatory',
      signoff: 'All the best!\n\n*{{recruiter_name}}* (Recruitment Lead)'
    }
  },
  {
    id: 'actionRequiredReminder',
    label: 'Action Required Reminder (High Response)',
    description: 'High-converting reminder email emphasizing candidate selection and pending completion',
    email: {
      subject: 'Action Required: Complete Your Interview for {{job_title}} | {{company_name}}',
      badgeText: 'ACTION REQUIRED - INTERVIEW PENDING',
      headline: 'Dear {{candidate_name}},',
      body: 'Your profile has been shortlisted for <strong>{{job_title}}</strong> at <strong>{{company_name}}</strong>, but we have not yet received your video interview submission.<br/><br/>This 15-minute evaluation is a required step to advance your candidacy to the hiring manager round. Your access link is active until <strong>{{interview_deadline}}</strong>.<br/><br/>- <strong>Time Required:</strong> ~15 Minutes<br/>- <strong>Device:</strong> Mobile or Laptop with Camera & Mic<br/>- <strong>Availability:</strong> Complete anytime before deadline',
      showJobDetails: true,
      jobDetailsFields: DEFAULT_JOB_DETAILS_FIELDS,
      jobDetailItems: DEFAULT_JOB_DETAILS_ITEMS,
      showCredentialsBox: true,
      ctaButtonText: 'Complete Interview Now ->',
      accentColor: '#0f172a',
      instructions: [
        'Ensure a working camera & microphone on your device.',
        'Use a stable internet connection.',
        'If you have already completed your interview, please ignore this email.'
      ],
      customFooter: 'Need Technical Assistance? Call Dsource Support: {{support_phone}}'
    },
    whatsapp: {
      headline: '*ACTION REQUIRED: INTERVIEW PENDING*',
      body: 'Dear *{{candidate_name}}*,\n\nYour profile has been shortlisted for *{{job_title}}* at *{{company_name}}*, but your video interview is still pending.\n\nPlease complete this 15-minute evaluation before *{{interview_deadline}}* to keep your application active and proceed to the next hiring stage.\n\n- Time required: ~15 Minutes\n- Complete anytime before deadline\n- Phone or laptop compatible',
      showJobDetails: true,
      jobDetailsFields: DEFAULT_JOB_DETAILS_FIELDS,
      jobDetailItems: DEFAULT_JOB_DETAILS_ITEMS,
      showCredentials: true,
      showRecruiterContact: true,
      instructions: '*Instructions:*\n• Use a phone or laptop with working camera & mic.\n• Complete before: *{{interview_deadline}}*',
      signoff: 'Best regards,\n*{{company_name}} Recruitment Team*'
    }
  },
  {
    id: 'finalDeadlineReminder',
    label: 'Final Deadline Reminder (Urgent)',
    description: 'Urgent reminder before candidate access code and link expires',
    email: {
      subject: 'Final Reminder: Interview Slot Closing Soon for {{job_title}} | {{company_name}}',
      badgeText: 'FINAL REMINDER - CLOSING SOON',
      headline: 'Dear {{candidate_name}},',
      body: 'This is our final reminder regarding your application for the <strong>{{job_title}}</strong> position at <strong>{{company_name}}</strong>.<br/><br/>Your interview access code will expire on <strong>{{interview_deadline}}</strong>. If you are interested in moving forward, please complete your assessment before the cutoff time.<br/><br/>- <strong>Completion Cutoff:</strong> {{interview_deadline}}<br/>- <strong>Status:</strong> Shortlisted Candidate',
      showJobDetails: true,
      jobDetailsFields: DEFAULT_JOB_DETAILS_FIELDS,
      jobDetailItems: DEFAULT_JOB_DETAILS_ITEMS,
      showCredentialsBox: true,
      ctaButtonText: 'Launch Final Assessment ->',
      accentColor: '#0f172a',
      instructions: [
        'Complete assessment before the cutoff deadline.',
        'Takes approximately 15 minutes.'
      ],
      customFooter: 'Need Technical Assistance? Call Dsource Support: {{support_phone}}'
    },
    whatsapp: {
      headline: '*FINAL REMINDER: INTERVIEW CLOSING SOON*',
      body: 'Dear *{{candidate_name}}*,\n\nFinal reminder regarding your application for *{{job_title}}* at *{{company_name}}*.\n\nYour online interview link will expire on *{{interview_deadline}}*. Please complete your assessment today to avoid missing out on this position.\n\n- Cutoff: *{{interview_deadline}}*\n- Duration: 15-20 minutes',
      showJobDetails: true,
      jobDetailsFields: DEFAULT_JOB_DETAILS_FIELDS,
      jobDetailItems: DEFAULT_JOB_DETAILS_ITEMS,
      showCredentials: true,
      showRecruiterContact: true,
      instructions: '*Instructions:*\n• Complete before: *{{interview_deadline}}*',
      signoff: 'Best regards,\n*{{company_name}} Recruitment Team*'
    }
  },
  {
    id: 'jobOffer',
    label: 'Job Selection & Offer Letter',
    description: 'Congratulations email for final selection and job offer',
    email: {
      subject: 'Congratulations! Job Selection Offer for {{job_title}} | {{company_name}}',
      badgeText: 'SELECTION & JOB OFFER ANNOUNCEMENT',
      headline: 'Dear {{candidate_name}},',
      body: 'We are thrilled to inform you that you have been <strong>SELECTED</strong> for the <strong>{{job_title}}</strong> position at <strong>{{company_name}}</strong>!<br/><br/>Our hiring team was thoroughly impressed by your performance in the interview rounds and skill assessments. We believe your experience will be a valuable asset to our organization.',
      showJobDetails: true,
      jobDetailsFields: DEFAULT_JOB_DETAILS_FIELDS,
      jobDetailItems: DEFAULT_JOB_DETAILS_ITEMS,
      showCredentialsBox: false,
      ctaButtonText: 'View & Accept Offer Details ->',
      accentColor: '#10b981',
      instructions: [
        'Please review the attached formal offer terms carefully.',
        'Confirm your acceptance by replying to this email or calling HR.',
        'Contact Recruiter {{recruiter_name}} ({{recruiter_phone}}) for onboarding steps.'
      ],
      customFooter: 'Welcome to the {{company_name}} Team!'
    },
    whatsapp: {
      headline: '*CONGRATULATIONS ON YOUR SELECTION!*',
      body: 'Dear *{{candidate_name}}*,\n\nWe are excited to share that you have been *SELECTED* for the *{{job_title}}* role at *{{company_name}}*!\n\nOur HR team will reach out to you shortly with the formal offer details and onboarding information.\n\nOffered Role: *{{job_title}}*\nLocation: *{{location}}*',
      showJobDetails: true,
      jobDetailsFields: DEFAULT_JOB_DETAILS_FIELDS,
      jobDetailItems: DEFAULT_JOB_DETAILS_ITEMS,
      showCredentials: false,
      showRecruiterContact: true,
      instructions: 'Please contact Recruiter *{{recruiter_name}}* at *{{recruiter_phone}}* if you have any questions.',
      signoff: 'Warm welcome!\n\n*{{company_name}} HR Management*'
    }
  }
];

export const DEFAULT_EMAIL_INVITE: EmailTemplateConfig = TEMPLATE_PRESETS[0].email;
export const DEFAULT_EMAIL_REMINDER: EmailTemplateConfig = TEMPLATE_PRESETS[2].email;
export const DEFAULT_WHATSAPP_INVITE: WhatsAppTemplateConfig = TEMPLATE_PRESETS[0].whatsapp;
export const DEFAULT_WHATSAPP_REMINDER: WhatsAppTemplateConfig = TEMPLATE_PRESETS[2].whatsapp;

export const DEFAULT_RECRUITER_TEMPLATES: RecruiterTemplates = {
  emailInvite: DEFAULT_EMAIL_INVITE,
  emailReminder: DEFAULT_EMAIL_REMINDER,
  whatsappInvite: DEFAULT_WHATSAPP_INVITE,
  whatsappReminder: DEFAULT_WHATSAPP_REMINDER
};

/**
 * Replaces dynamic placeholders like {{candidate_name}} with actual context values.
 */
export function renderTemplateText(templateText: string, context: Record<string, string>): string {
  if (!templateText) return '';
  let result = templateText;
  
  // Replace standard placeholders
  Object.keys(context).forEach((key) => {
    const value = context[key] !== undefined && context[key] !== null ? String(context[key]) : '';
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
    result = result.replace(pattern, value);
  });

  // Provide sensible fallbacks for un-replaced placeholders
  result = result
    .replace(/\{\{candidate_name\}\}/gi, context.candidate_name || 'Candidate')
    .replace(/\{\{candidate_email\}\}/gi, context.candidate_email || '')
    .replace(/\{\{candidate_phone\}\}/gi, context.candidate_phone || '')
    .replace(/\{\{job_title\}\}/gi, context.job_title || 'Position')
    .replace(/\{\{company_name\}\}/gi, context.company_name || 'Dsource')
    .replace(/\{\{interview_link\}\}/gi, context.interview_link || '#')
    .replace(/\{\{access_code\}\}/gi, context.access_code || context.interview_code || 'DX-8921')
    .replace(/\{\{interview_code\}\}/gi, context.interview_code || context.access_code || 'DX-8921')
    .replace(/\{\{interview_deadline\}\}/gi, context.interview_deadline || 'Within 48 Hours')
    .replace(/\{\{location\}\}/gi, context.location || 'As specified')
    .replace(/\{\{qualification\}\}/gi, context.qualification || 'As per requirement')
    .replace(/\{\{experience\}\}/gi, context.experience || 'As per requirement')
    .replace(/\{\{salary\}\}/gi, context.salary || 'Best in Industry')
    .replace(/\{\{employment_type\}\}/gi, context.employment_type || 'Full Time')
    .replace(/\{\{recruiter_name\}\}/gi, context.recruiter_name || 'HR Recruiting Team')
    .replace(/\{\{recruiter_phone\}\}/gi, context.recruiter_phone || '9762588623')
    .replace(/\{\{recruiter_email\}\}/gi, context.recruiter_email || 'noreply@interviewxpert.in')
    .replace(/\{\{support_phone\}\}/gi, context.support_phone || '9762588623 / 8484888632');

  return result;
}

/**
 * Fetches customized templates for a recruiter (from Firestore or localStorage).
 * Returns system default if no custom templates exist.
 */
export async function getRecruiterTemplates(uid?: string): Promise<RecruiterTemplates> {
  const effectiveUid = uid || auth.currentUser?.uid || '';
  const localKey = effectiveUid ? `recruiter_templates_${effectiveUid}` : 'recruiter_templates_default';
  
  // Try loading from localStorage first for instant speed
  try {
    const cached = localStorage.getItem(localKey) || (effectiveUid ? localStorage.getItem(`recruiter_templates_${effectiveUid}`) : null) || localStorage.getItem('recruiter_templates_default');
    if (cached) {
      const parsed = JSON.parse(cached);
      return mergeWithDefaults(parsed);
    }
  } catch (e) {}

  if (effectiveUid) {
    try {
      const docRef = doc(db, 'profiles', effectiveUid);
      const snap = await getDoc(docRef);
      if (snap.exists() && snap.data()?.customTemplates) {
        const templates = mergeWithDefaults(snap.data().customTemplates);
        localStorage.setItem(localKey, JSON.stringify(templates));
        localStorage.setItem('recruiter_templates_default', JSON.stringify(templates));
        return templates;
      }
    } catch (e) {
      console.warn('Failed to load recruiter templates from Firestore:', e);
    }
  }

  return DEFAULT_RECRUITER_TEMPLATES;
}

/**
 * Saves recruiter custom templates to Firestore & localStorage.
 */
export async function saveRecruiterTemplates(uid: string, templates: RecruiterTemplates): Promise<boolean> {
  const localKey = uid ? `recruiter_templates_${uid}` : 'recruiter_templates_default';
  try {
    const merged = mergeWithDefaults(templates);
    const jsonStr = JSON.stringify(merged);
    localStorage.setItem(localKey, jsonStr);
    localStorage.setItem('recruiter_templates_default', jsonStr);
    
    if (uid) {
      const userRef = doc(db, 'profiles', uid);
      const mainUserRef = doc(db, 'users', uid);
      
      await Promise.all([
        setDoc(userRef, { customTemplates: merged, updatedAt: new Date().toISOString() }, { merge: true }),
        setDoc(mainUserRef, { customTemplates: merged, updatedAt: new Date().toISOString() }, { merge: true })
      ]);
    }
    return true;
  } catch (err) {
    console.error('Error saving recruiter templates:', err);
    return false;
  }
}

export function ensureJobDetailItems(incomingItems?: JobDetailItem[]): JobDetailItem[] {
  if (!incomingItems || !Array.isArray(incomingItems) || incomingItems.length === 0) {
    return DEFAULT_JOB_DETAILS_ITEMS;
  }
  const existingIds = new Set(incomingItems.map(i => i.id));
  const missingDefaults = DEFAULT_JOB_DETAILS_ITEMS.filter(d => !existingIds.has(d.id));
  return [...incomingItems, ...missingDefaults];
}

/**
 * Helper to ensure missing fields fall back to default template values.
 */
function mergeWithDefaults(incoming: any): RecruiterTemplates {
  return {
    emailInvite: {
      ...DEFAULT_EMAIL_INVITE,
      ...(incoming?.emailInvite || {}),
      jobDetailsFields: { ...DEFAULT_JOB_DETAILS_FIELDS, ...(incoming?.emailInvite?.jobDetailsFields || {}) },
      jobDetailItems: ensureJobDetailItems(incoming?.emailInvite?.jobDetailItems)
    },
    emailReminder: {
      ...DEFAULT_EMAIL_REMINDER,
      ...(incoming?.emailReminder || {}),
      jobDetailsFields: { ...DEFAULT_JOB_DETAILS_FIELDS, ...(incoming?.emailReminder?.jobDetailsFields || {}) },
      jobDetailItems: ensureJobDetailItems(incoming?.emailReminder?.jobDetailItems)
    },
    whatsappInvite: {
      ...DEFAULT_WHATSAPP_INVITE,
      ...(incoming?.whatsappInvite || {}),
      jobDetailsFields: { ...DEFAULT_JOB_DETAILS_FIELDS, ...(incoming?.whatsappInvite?.jobDetailsFields || {}) },
      jobDetailItems: ensureJobDetailItems(incoming?.whatsappInvite?.jobDetailItems)
    },
    whatsappReminder: {
      ...DEFAULT_WHATSAPP_REMINDER,
      ...(incoming?.whatsappReminder || {}),
      jobDetailsFields: { ...DEFAULT_JOB_DETAILS_FIELDS, ...(incoming?.whatsappReminder?.jobDetailsFields || {}) },
      jobDetailItems: ensureJobDetailItems(incoming?.whatsappReminder?.jobDetailItems)
    }
  };
}
