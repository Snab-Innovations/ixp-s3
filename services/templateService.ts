import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface JobDetailItem {
  id: string;
  label: string;
  icon: string;
  value: string;
  enabled: boolean;
  isCustom?: boolean;
}

export const DEFAULT_JOB_DETAILS_ITEMS: JobDetailItem[] = [
  { id: 'post', label: 'Job Post', icon: '📌', value: '{{job_title}}', enabled: true },
  { id: 'employmentType', label: 'Employment Type', icon: '💼', value: '{{employment_type}}', enabled: true },
  { id: 'location', label: 'Location', icon: '📍', value: '{{location}}', enabled: true },
  { id: 'qualification', label: 'Qualification', icon: '🎓', value: '{{qualification}}', enabled: true },
  { id: 'experience', label: 'Experience Required', icon: '💼', value: '{{experience}}', enabled: true },
  { id: 'salary', label: 'Salary Offered', icon: '💰', value: '{{salary}}', enabled: true },
  { id: 'department', label: 'Department / Category', icon: '🏢', value: 'Engineering / Software', enabled: false },
  { id: 'workShift', label: 'Shift / Working Hours', icon: '⏰', value: 'Day Shift (Standard)', enabled: false },
  { id: 'requiredSkills', label: 'Required Skills', icon: '⚡', value: 'As specified in JD', enabled: false },
  { id: 'customFields', label: 'Custom Job Fields', icon: '🔹', value: 'Custom Fields', enabled: true },
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

export const DEFAULT_EMAIL_INVITE: EmailTemplateConfig = {
  subject: 'Official Interview Invitation — {{job_title}} | {{company_name}}',
  badgeText: 'OFFICIAL INVITATION',
  headline: 'Dear {{candidate_name}},',
  body: 'We are pleased to invite you to complete an AI video interview assessment for the <strong>{{job_title}}</strong> position at <strong>{{company_name}}</strong>. Please complete this at your earliest convenience.',
  showJobDetails: true,
  jobDetailsFields: DEFAULT_JOB_DETAILS_FIELDS,
  jobDetailItems: DEFAULT_JOB_DETAILS_ITEMS,
  showCredentialsBox: true,
  ctaButtonText: 'Start Interview Now →',
  accentColor: '#0284c7',
  instructions: [
    'Ensure a working camera & microphone for the AI voice/video assessment.',
    'Use a stable internet connection in a quiet environment.',
    'Do not refresh or exit the browser tab once the assessment starts.'
  ],
  customFooter: 'Need Technical Assistance? Call Dsource Support: {{support_phone}}'
};

export const DEFAULT_EMAIL_REMINDER: EmailTemplateConfig = {
  subject: 'Urgent Reminder: Pending Interview Assessment — {{job_title}}',
  badgeText: 'ACTION REQUIRED - REMINDER',
  headline: 'Dear {{candidate_name}},',
  body: 'This is a friendly reminder that your AI video interview assessment for the <strong>{{job_title}}</strong> position at <strong>{{company_name}}</strong> is still pending. Kindly complete your assessment using the access credentials below.',
  showJobDetails: true,
  jobDetailsFields: DEFAULT_JOB_DETAILS_FIELDS,
  jobDetailItems: DEFAULT_JOB_DETAILS_ITEMS,
  showCredentialsBox: true,
  ctaButtonText: 'Resume Assessment Now →',
  accentColor: '#e11d48',
  instructions: [
    'Ensure a working camera & microphone for the AI voice/video assessment.',
    'Use a stable internet connection in a quiet environment.',
    'Do not refresh or exit the browser tab once the assessment starts.'
  ],
  customFooter: 'Need Technical Assistance? Call Dsource Support: {{support_phone}}'
};

export const DEFAULT_WHATSAPP_INVITE: WhatsAppTemplateConfig = {
  headline: '💼 *OFFICIAL INTERVIEW INVITATION*',
  body: 'Dear *{{candidate_name}}*,\n\nWe are pleased to invite you to complete an AI video interview assessment for the post of *{{job_title}}* at *{{company_name}}*.',
  showJobDetails: true,
  jobDetailsFields: DEFAULT_JOB_DETAILS_FIELDS,
  jobDetailItems: DEFAULT_JOB_DETAILS_ITEMS,
  showCredentials: true,
  showRecruiterContact: true,
  instructions: '1. Ensure a working camera & microphone on your phone or laptop.\n2. Use a stable internet connection in a quiet environment.',
  signoff: 'Best regards,\n*{{company_name}} Recruitment Team*'
};

export const DEFAULT_WHATSAPP_REMINDER: WhatsAppTemplateConfig = {
  headline: '⏳ *PENDING INTERVIEW REMINDER*',
  body: 'Dear *{{candidate_name}}*,\n\nThis is a polite reminder to complete your pending AI video interview assessment for the post of *{{job_title}}* at *{{company_name}}*.',
  showJobDetails: true,
  jobDetailsFields: DEFAULT_JOB_DETAILS_FIELDS,
  jobDetailItems: DEFAULT_JOB_DETAILS_ITEMS,
  showCredentials: true,
  showRecruiterContact: true,
  instructions: '1. Complete your assessment before the access expires.\n2. Ensure strong internet connection in a quiet location.',
  signoff: 'Warm regards,\n*{{company_name}} HR Operations*'
};

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
    .replace(/\{\{access_code\}\}/gi, context.access_code || '------')
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
  const localKey = uid ? `recruiter_templates_${uid}` : 'recruiter_templates_default';
  
  // Try loading from localStorage first for instant speed
  try {
    const cached = localStorage.getItem(localKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return mergeWithDefaults(parsed);
    }
  } catch (e) {}

  if (uid) {
    try {
      const docRef = doc(db, 'profiles', uid);
      const snap = await getDoc(docRef);
      if (snap.exists() && snap.data()?.customTemplates) {
        const templates = mergeWithDefaults(snap.data().customTemplates);
        localStorage.setItem(localKey, JSON.stringify(templates));
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
  const localKey = `recruiter_templates_${uid}`;
  try {
    localStorage.setItem(localKey, JSON.stringify(templates));
    const userRef = doc(db, 'profiles', uid);
    const mainUserRef = doc(db, 'users', uid);
    
    await Promise.all([
      setDoc(userRef, { customTemplates: templates, updatedAt: new Date().toISOString() }, { merge: true }),
      setDoc(mainUserRef, { customTemplates: templates, updatedAt: new Date().toISOString() }, { merge: true })
    ]);
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
