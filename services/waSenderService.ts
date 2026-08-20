// WhatsApp Messaging Service
// Configured for Serverless WhatsApp API: https://whatsapp-serverless.vercel.app

import { formatExperienceDisplay } from './sesService';
import { renderTemplateText, getRecruiterTemplates, WhatsAppTemplateConfig, DEFAULT_JOB_DETAILS_ITEMS, formatDeadlineDisplay } from './templateService';

function getCleanWhatsAppApiUrl(): string {
  const envUrl = (import.meta.env.VITE_WHATSAPP_API_URL || '').trim();
  if (!envUrl || envUrl.includes('onrender.com') || envUrl.includes('whatsapp-sending-api') || envUrl.includes('whatsapp-task-manager')) {
    return 'https://whatsapp-serverless.vercel.app';
  }
  // Strip any trailing /api, /api/messages/send, or trailing slashes
  return envUrl.replace(/\/api(\/.*)?$/, '').replace(/\/+$/, '') || 'https://whatsapp-serverless.vercel.app';
}

export const WHATSAPP_API_BASE_URL = getCleanWhatsAppApiUrl();

export interface SendWhatsAppResponse {
  success: boolean;
  data?: any;
  formattedMessage?: string;
  error?: string;
}

export interface WhatsAppStatusResponse {
  status: 'connected' | 'connecting' | 'disconnected' | 'qr_ready' | 'AUTHENTICATED' | 'CONNECTED' | string;
  sessionId?: string;
  qrCodeDataUrl?: string | null;
  qr?: string | null;
  user?: {
    id?: string;
    name?: string;
    phone?: string;
  } | null;
  userInfo?: {
    name?: string;
    phone?: string;
    id?: string;
  } | null;
  lastUpdated?: string;
  error?: string | null;
}

export interface WhatsAppAuditMessage {
  id: string;
  recipient: string;
  status: 'delivered' | 'pending' | 'failed' | string;
  messageId?: string;
  message?: string;
  createdAt: string;
  deliveredAt?: string;
  sessionId?: string;
  jid?: string;
}

export interface WhatsAppAuditResponse {
  success: boolean;
  count: number;
  messages: WhatsAppAuditMessage[];
  error?: string;
}

/**
 * Formats a phone number for the WhatsApp Serverless API.
 * The phone field must include country code without + or spaces (e.g. 919876543210 for India, 15551234567 for US).
 */
export function formatPhoneForWhatsApp(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/[^0-9]/g, '');

  if (cleaned.startsWith('0091')) {
    cleaned = cleaned.substring(4);
  } else if (cleaned.startsWith('091')) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith('0')) {
    cleaned = cleaned.replace(/^0+/, '');
  }

  // If 10 digits standard Indian mobile, prepend country code 91
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
    cleaned = '91' + cleaned;
  } else if (cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }

  return cleaned;
}

/**
 * Initiates the QR pairing handshake on the WhatsApp serverless instance.
 * Endpoint: POST /api/connect
 */
export async function initiateWhatsAppConnect(): Promise<{ status: string; message: string }> {
  try {
    const res = await fetch(`${WHATSAPP_API_BASE_URL}/api/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    console.error('[WhatsApp API] Error initiating connect:', err);
    return { status: 'error', message: err.message || 'Failed to initiate WhatsApp connection' };
  }
}

/**
 * Retrieves the active QR code Base64 Data URL and status.
 * Endpoint: GET /api/qr
 */
export async function fetchWhatsAppQR(): Promise<{ status: string; qr?: string; qrCodeDataUrl?: string; message?: string }> {
  try {
    const res = await fetch(`${WHATSAPP_API_BASE_URL}/api/qr`, {
      method: 'GET',
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    console.error('[WhatsApp API] Error fetching QR code:', err);
    return { status: 'disconnected', message: err.message || 'Failed to fetch WhatsApp QR code' };
  }
}

/**
 * Fetches WhatsApp connection status and linked user info.
 * Endpoint: GET /api/status
 */
export async function fetchWhatsAppStatus(
  _sessionId?: string,
  _passcode?: string
): Promise<WhatsAppStatusResponse> {
  const endpoints = [
    `${WHATSAPP_API_BASE_URL}/api/status`,
    'https://whatsapp-serverless.vercel.app/api/status',
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'GET',
      });

      if (res.ok) {
        const data = await res.json();

        // Normalize user info for compatibility
        const userObj = data.user || null;
        return {
          status: data.status,
          sessionId: data.sessionId || 'default-session',
          qrCodeDataUrl: data.qrCodeDataUrl || null,
          user: userObj,
          userInfo: userObj ? {
            name: userObj.name || 'WhatsApp User',
            phone: userObj.id?.replace(/@.*$/, '') || '',
            id: userObj.id || ''
          } : null,
          error: null
        };
      }
    } catch (err: any) {
      // Continue trying
    }
  }

  return { 
    status: 'disconnected', 
    error: 'WhatsApp API service is currently unreachable.' 
  };
}

/**
 * Disconnects WhatsApp and wipes the session credentials from Firestore.
 * Endpoint: POST /api/logout
 */
export async function logoutWhatsApp(): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`${WHATSAPP_API_BASE_URL}/api/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    return {
      success: data.success ?? true,
      message: data.message || 'Logged out and cleared WhatsApp session.'
    };
  } catch (err: any) {
    console.error('[WhatsApp API] Error logging out:', err);
    return {
      success: false,
      message: err.message || 'Failed to logout WhatsApp session.'
    };
  }
}

/**
 * Fetches recent sent messages and their delivery statuses from Firestore Outbox.
 * Endpoint: GET /api/messages?limit=20
 */
export async function fetchWhatsAppAuditLogs(limit: number = 20): Promise<WhatsAppAuditResponse> {
  try {
    const res = await fetch(`${WHATSAPP_API_BASE_URL}/api/messages?limit=${limit}`, {
      method: 'GET',
    });
    if (res.ok) {
      const data = await res.json();
      return {
        success: data.success ?? true,
        count: data.count || (data.messages ? data.messages.length : 0),
        messages: data.messages || [],
      };
    }
    return { success: false, count: 0, messages: [], error: `HTTP ${res.status}` };
  } catch (err: any) {
    console.error('[WhatsApp API] Error fetching audit logs:', err);
    return { success: false, count: 0, messages: [], error: err.message || 'Failed to fetch logs' };
  }
}

/**
 * Sends a rich, formatted notification designed specifically for task/cron/job completion.
 * Endpoint: POST /api/send-task-alert
 */
export async function sendWhatsAppTaskAlert(params: {
  phone: string;
  taskName: string;
  status: 'SUCCESS' | 'FAILED' | 'WARNING' | string;
  duration?: string;
  details?: string;
}): Promise<SendWhatsAppResponse> {
  const formattedPhone = formatPhoneForWhatsApp(params.phone);
  if (!formattedPhone) {
    return { success: false, error: 'Invalid or missing phone number.' };
  }

  try {
    const response = await fetch(`${WHATSAPP_API_BASE_URL}/api/send-task-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: formattedPhone,
        taskName: params.taskName,
        status: params.status,
        duration: params.duration || 'N/A',
        details: params.details || '',
      }),
    });

    const data = await response.json();
    if (response.ok && (data.success || data.data)) {
      return { success: true, data: data.data, formattedMessage: data.formattedMessage };
    }
    return { success: false, error: data.message || data.error || `HTTP ${response.status}` };
  } catch (err: any) {
    console.error('[WhatsApp API] Task alert error:', err);
    return { success: false, error: err.message || 'Network failure sending task alert.' };
  }
}

/**
 * Sends a custom WhatsApp message to a phone number.
 * Endpoint: POST /api/send-message
 */
export async function sendWhatsAppMessage(
  phone: string,
  text: string,
  _credentials?: { sessionId?: string; passcode?: string }
): Promise<SendWhatsAppResponse> {
  const formattedPhone = formatPhoneForWhatsApp(phone);
  if (!formattedPhone) {
    console.error('[WhatsApp API] Invalid phone number provided:', phone);
    return { success: false, error: 'Invalid or missing phone number (must include valid country code).' };
  }

  const apiUrl = `${WHATSAPP_API_BASE_URL}/api/send-message`;
  try {
    console.log('[WhatsApp API] Sending message to:', formattedPhone, 'via:', apiUrl);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: formattedPhone,
        message: text,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok && data.success !== false) {
      return { success: true, data: data.data || data };
    } else {
      return { success: false, error: data.error || data.message || `Failed to send (HTTP ${response.status})` };
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Network failure sending WhatsApp message.' };
  }
}

/**
 * Opens WhatsApp Web in a new browser tab with prefilled phone and message.
 */
export function openWhatsAppWebInvite(phone: string, text: string) {
  const digits = formatPhoneForWhatsApp(phone);
  if (!digits) return;
  const url = `https://web.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

export interface WhatsAppInviteOptions {
  gender?: string;
  location?: string;
  education?: string;
  qualification?: string;
  experience?: string | number;
  minExperience?: number | string;
  maxExperience?: number | string;
  salary?: string;
  salaryRange?: string;
  deadline?: string;
  deadlineDate?: string;
  employmentType?: string;
  customFields?: Array<{ key: string; value: string }>;
  recruiterName?: string;
  recruiterPhone?: string;
  whatsappSessionId?: string;
  whatsappSessionPasscode?: string;
  recruiterUid?: string;
  customTemplate?: WhatsAppTemplateConfig;
}

/**
 * Builds full WhatsApp message text matching the email template format.
 */
export function buildWhatsAppInviteText(params: {
  candidateName?: string;
  jobTitle: string;
  interviewLink: string;
  accessCode: string;
  isReminder?: boolean;
  options?: WhatsAppInviteOptions;
}): string {
  const { candidateName = 'Candidate', jobTitle, interviewLink, accessCode, isReminder = false, options } = params;
  const deadline = formatDeadlineDisplay(options?.deadlineDate || options?.deadline || (options as any)?.interviewDeadline || (options as any)?.applyDeadline);

  const context: Record<string, string> = {
    candidate_name: candidateName,
    job_title: jobTitle,
    company_name: 'Dsource',
    interview_link: interviewLink,
    access_code: accessCode,
    interview_deadline: deadline,
    deadline: deadline,
    location: options?.location || 'As specified in Job Description',
    qualification: options?.qualification || options?.education || 'As per Job Description',
    experience: formatExperienceDisplay(options),
    salary: options?.salary || options?.salaryRange || 'Competitive / As per Job Description',
    employment_type: options?.employmentType || 'Full Time',
    recruiter_name: options?.recruiterName || 'HR Recruiting Team',
    recruiter_phone: options?.recruiterPhone || '9762588623 / 8484888632',
    recruiter_email: 'noreply@interviewxpert.in',
    support_phone: '9762588623 / 8484888632'
  };

  const custom = options?.customTemplate;

  const headline = custom?.headline
    ? renderTemplateText(custom.headline, context)
    : (isReminder ? `*DEADLINE REMINDER*` : `*CONGRATULATIONS! YOU ARE SHORTLISTED*`);

  const body = custom?.body
    ? renderTemplateText(custom.body, context)
    : (isReminder
        ? `Dear *${candidateName}*,\n\nFriendly reminder: You have been *shortlisted for ${jobTitle}* at *Dsource*, but your AI Video Interview is still pending!\n\n*Completion Deadline:* *${deadline}*\n\nPlease complete your interview before the deadline to keep your application active.`
        : `Dear *${candidateName}*,\n\nGreat news! Your profile has been *shortlisted for this interview round* for the *${jobTitle}* role at *Dsource*.\n\nPlease complete your 15-minute AI Video Interview from your phone or laptop at your convenience.\n\n*Completion Deadline:* *${deadline}*\n- No HR scheduling needed\n- Complete anytime, anywhere`);

  const showJobDetails = custom ? custom.showJobDetails !== false : true;
  const showCredentials = custom ? custom.showCredentials !== false : true;
  const showRecruiterContact = custom ? custom.showRecruiterContact !== false : true;

  const items = custom?.jobDetailItems && custom.jobDetailItems.length > 0
    ? custom.jobDetailItems
    : DEFAULT_JOB_DETAILS_ITEMS;

  const jobDetailsLines: string[] = items
    .filter(item => item.enabled !== false)
    .map(item => {
      let val = renderTemplateText(item.value, context);
      if (item.id === 'customFields') {
        if (options?.customFields && options.customFields.length > 0) {
          return options.customFields.map(cf => `• *${cf.key}:* ${cf.value}`).join('\n');
        }
        return '';
      }
      if (!val) return '';
      return `• *${item.label}:* ${val}`;
    })
    .filter(Boolean);

  const jobDetailsSection = showJobDetails && jobDetailsLines.length > 0 ? `\n\n*JOB REQUIREMENT DETAILS:*\n${jobDetailsLines.join('\n')}` : '';

  const credentialsSection = showCredentials ? `\n\n*YOUR ACCESS CREDENTIALS:*
• *Access Code:* *${accessCode}*
• *Interview Link:* ${interviewLink}` : '';

  const recruiterName = options?.recruiterName || 'Recruiting Team';
  const recruiterPhone = options?.recruiterPhone || '9762588623 / 8484888632';

  const recruiterSection = showRecruiterContact ? `\n\n*RECRUITER / CONTACT PERSON:*
• *Contact Person:* *${recruiterName}*
• *Mobile / Contact:* *${recruiterPhone}*` : '';

  const instructionsText = custom?.instructions
    ? renderTemplateText(custom.instructions, context)
    : `1. Ensure a working camera & microphone on your phone or laptop.\n2. Use a stable internet connection in a quiet environment.`;

  const signoffText = custom?.signoff
    ? renderTemplateText(custom.signoff, context)
    : `Best regards,\n*Dsource Recruitment System*`;

  return `${headline}

${body}${jobDetailsSection}${credentialsSection}${recruiterSection}

*Instructions:*
${instructionsText}

Need Technical Help? Call Dsource Support: 9762588623 / 8484888632

${signoffText}`;
}

/**
 * Formats and sends an interview invitation via WhatsApp.
 */
export async function sendInterviewWhatsAppInvite(params: {
  phone: string;
  candidateName?: string;
  jobTitle: string;
  interviewLink: string;
  accessCode: string;
  isReminder?: boolean;
  options?: WhatsAppInviteOptions;
}): Promise<SendWhatsAppResponse> {
  let activeTemplate: WhatsAppTemplateConfig | undefined;
  try {
    const templates = await getRecruiterTemplates(params.options?.recruiterUid);
    if (params.isReminder) {
      activeTemplate = params.options?.customTemplate || templates.whatsappReminder;
    } else {
      activeTemplate = params.options?.customTemplate || templates.whatsappInvite;
    }
  } catch (e) {
    activeTemplate = params.options?.customTemplate;
  }

  const updatedParams = {
    ...params,
    options: {
      ...params.options,
      customTemplate: activeTemplate
    }
  };

  const messageText = buildWhatsAppInviteText(updatedParams);
  return await sendWhatsAppMessage(params.phone, messageText, {
    sessionId: params.options?.whatsappSessionId,
    passcode: params.options?.whatsappSessionPasscode
  });
}

/**
 * Bulk sends interview invites via WhatsApp to a list of candidates with phone numbers.
 * Sends candidates one-by-one with a random delay between minDelay and maxDelay (default 15-25 seconds) between messages.
 */
export async function sendBulkWhatsAppInvites(
  candidates: Array<{ phone: string; name?: string; email?: string }>,
  jobTitle: string,
  interviewLink: string,
  accessCode: string,
  isReminder = false,
  onProgress?: (sentCount: number, totalCount: number, currentCandidate: string, isWaiting: boolean, waitTimeSec?: number) => void,
  options?: WhatsAppInviteOptions,
  minDelay = 15,
  maxDelay = 25,
  delayUnit: 'sec' | 'min' = 'sec'
): Promise<{ success: boolean; totalSent: number; totalFailed: number; errors: string[] }> {
  let totalSent = 0;
  let totalFailed = 0;
  const errors: string[] = [];
  const validCandidates = candidates.filter(c => !!c.phone && c.phone.trim() !== '');

  const multiplier = delayUnit === 'min' ? 60 * 1000 : 1000;
  const minMs = Math.max(1000, (minDelay || 15) * multiplier);
  const maxMs = Math.max(minMs, (maxDelay || 25) * multiplier);

  for (let i = 0; i < validCandidates.length; i++) {
    const candidate = validCandidates[i];
    const candidateDisplayName = candidate.name || candidate.email?.split('@')[0] || candidate.phone;

    if (onProgress) {
      onProgress(i + 1, validCandidates.length, candidateDisplayName, false);
    }

    const res = await sendInterviewWhatsAppInvite({
      phone: candidate.phone,
      candidateName: candidateDisplayName,
      jobTitle,
      interviewLink,
      accessCode,
      isReminder,
      options,
    });

    if (res.success) {
      totalSent++;
    } else {
      totalFailed++;
      if (res.error) errors.push(`${candidate.phone}: ${res.error}`);
    }

    // Random delay between minDelay and maxDelay before sending to next candidate
    if (i < validCandidates.length - 1) {
      const randomDelayMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
      const delaySec = Math.round(randomDelayMs / 1000);
      if (onProgress) {
        onProgress(i + 1, validCandidates.length, candidateDisplayName, true, delaySec);
      }
      await new Promise(resolve => setTimeout(resolve, randomDelayMs));
    }
  }

  return {
    success: totalSent > 0,
    totalSent,
    totalFailed,
    errors,
  };
}
