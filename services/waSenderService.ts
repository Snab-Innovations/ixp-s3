// WhatsApp Messaging Service
// Uses WhatsApp Task Manager REST API (https://whatsapp-task-manager-ai4d.onrender.com/api/v1/send-message)

import { formatExperienceDisplay } from './sesService';

const WHATSAPP_API_URL = import.meta.env.VITE_WHATSAPP_API_URL;

export interface SendWhatsAppResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export interface WhatsAppStatusResponse {
  status: string;
  qrCodeDataUrl?: string | null;
  userInfo?: { name?: string; phone?: string; id?: string } | null;
  lastUpdated?: string;
  error?: string | null;
  sessionId?: string;
  hasPasscode?: boolean;
}

/**
  * Fetches WhatsApp API session status and QR code data URL.
  */
export async function fetchWhatsAppStatus(
  sessionId: string,
  passcode: string
): Promise<WhatsAppStatusResponse> {
  if (!sessionId || !passcode) {
    return { status: 'DISCONNECTED', error: 'Missing session ID or passcode' };
  }

  const url = 'https://whatsapp-sending-api.onrender.com/api/status';

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-session-id': sessionId.trim(),
        'x-session-passcode': passcode.trim(),
      },
    });

    const data = await res.json();
    return data;
  } catch (err: any) {
    console.error('[WhatsApp API] Error fetching status:', err);
    return { status: 'ERROR', error: err.message || 'Failed to connect to WhatsApp API service' };
  }
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
  employmentType?: string;
  customFields?: Array<{ key: string; value: string }>;
  recruiterName?: string;
  recruiterPhone?: string;
  whatsappSessionId?: string;
  whatsappSessionPasscode?: string;
}

/**
 * Formats a phone number for WhatsApp API (digits with leading + and country code).
 * e.g., "9876543210" -> "+919876543210" (assumes India +91 if 10 digits)
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

  if ((cleaned.length === 9 || cleaned.length === 10) && /^[6-9]/.test(cleaned)) {
    cleaned = '91' + cleaned;
  } else if (cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }

  return cleaned ? '+' + cleaned : '';
}

/**
 * Opens WhatsApp Web in a new browser tab with prefilled phone and message.
 */
export function openWhatsAppWebInvite(phone: string, text: string) {
  const formatted = formatPhoneForWhatsApp(phone);
  const digits = formatted.replace(/[^0-9]/g, '');
  if (!digits) return;
  const url = `https://web.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

/**
 * Sends a single WhatsApp message via WhatsApp Task Manager API using active recruiter's saved profile credentials.
 * DO NOT fallback to .env for WhatsApp session credentials.
 */

export async function sendWhatsAppMessage(
  phone: string,
  text: string,
  credentials?: { sessionId?: string; passcode?: string }
): Promise<SendWhatsAppResponse> {
  const formattedPhone = formatPhoneForWhatsApp(phone);
  if (!formattedPhone) {
    console.error('[WhatsApp API] Invalid phone number provided:', phone);
    return { success: false, error: 'Invalid or missing phone number.' };
  }

  const apiUrl = WHATSAPP_API_URL || 'https://whatsapp-task-manager-ai4d.onrender.com/api/v1/send-message';
  const sessionId = credentials?.sessionId?.trim() || '';
  const passcode = credentials?.passcode?.trim() || '';

  if (!sessionId || !passcode) {
    console.error('[WhatsApp API] Saved WhatsApp Session credentials missing from profile!');
    return {
      success: false,
      error: 'WhatsApp Session ID and Passcode are not configured for your account. Please set your WhatsApp Session ID & Passcode in your Profile settings before sending WhatsApp messages.'
    };
  }

  console.log('[WhatsApp API] Sending message via Session ID:', sessionId, 'to:', formattedPhone);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId,
        'x-session-passcode': passcode,
      },
      body: JSON.stringify({
        phone: formattedPhone,
        message: text,
      }),
    });

    const data = await response.json();
    console.log('[WhatsApp API] Response status:', response.status, '| Data:', data);

    if (!response.ok) {
      const errorMsg = data.message || data.error || `WhatsApp API returned HTTP ${response.status}`;
      return { success: false, data, error: errorMsg };
    }

    return { success: true, data };
  } catch (err: any) {
    console.error('[WhatsApp API] Fetch error:', err);
    return { success: false, error: err.message || 'Network error sending WhatsApp message.' };
  }
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

  const genderStr = options?.gender ? `, ${options.gender}` : '';
  const postDisplay = `*${jobTitle}${genderStr}*`;
  const locationDisplay = options?.location || 'As specified in Job Description';
  const qualificationDisplay = options?.qualification || options?.education || 'As per Job Description';
  const expDisplay = formatExperienceDisplay(options);
  const salaryDisplay = options?.salary || options?.salaryRange || 'Competitive / As per Job Description';
  const empTypeLine = options?.employmentType ? `\n• 💼 *Employment:* ${options.employmentType}` : '';
  const customLines = options?.customFields && options.customFields.length > 0
    ? '\n' + options.customFields.map(cf => `• 🔹 *${cf.key}:* ${cf.value}`).join('\n')
    : '';

  const recruiterName = options?.recruiterName || 'Recruiting Team';
  const recruiterPhone = options?.recruiterPhone || '9762588623 / 8484888632';

  const headline = isReminder
    ? `⏳ *PENDING INTERVIEW REMINDER*`
    : `💼 *OFFICIAL INTERVIEW INVITATION*`;


  const intro = isReminder
    ? `Dear *${candidateName}*,\n\nThis is a polite reminder to complete your AI video interview assessment for the post of *${jobTitle}* at *Dsource*.`
    : `Dear *${candidateName}*,\n\nWe are pleased to invite you to complete an AI video interview assessment for the post of *${jobTitle}* at *Dsource*.`;

  return `${headline}

${intro}

📌 *JOB REQUIREMENT DETAILS:*
• 📌 *Post:* ${postDisplay}${empTypeLine}
• 📍 *Location:* ${locationDisplay}
• 🎓 *Qualification:* ${qualificationDisplay}
• 💼 *Experience:* ${expDisplay}
• 💰 *Salary:* ${salaryDisplay}${customLines}

🔐 *YOUR ACCESS CREDENTIALS:*
• 🔑 *Access Code:* *${accessCode}*
• 🌐 *Interview Link:* ${interviewLink}

👤 *RECRUITER / CONTACT PERSON:*
• 👤 *Contact Person:* *${recruiterName}*
• 📞 *Mobile / Contact:* *${recruiterPhone}*

⚠️ *Instructions:*
1. Ensure a working camera & microphone on your phone or laptop.
2. Use a stable internet connection in a quiet environment.

Need Technical Help? Call Dsource Support: 9762588623 / 8484888632

Best regards,
*Dsource Recruitment System*`;
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
  const messageText = buildWhatsAppInviteText(params);
  return await sendWhatsAppMessage(params.phone, messageText, {
    sessionId: params.options?.whatsappSessionId,
    passcode: params.options?.whatsappSessionPasscode
  });
}

/**
 * Bulk sends interview invites via WhatsApp to a list of candidates with phone numbers.
 * Sends candidates one-by-one with a random delay between minDelay and maxDelay (default 15-25 seconds) between messages to protect WhatsApp from ban/spam blocking.
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
