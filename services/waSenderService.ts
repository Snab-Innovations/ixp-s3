// WhatsApp Messaging Service
// Uses WhatsApp Task Manager REST API (https://whatsapp-task-manager-ai4d.onrender.com/api/v1/send-message)

const WHATSAPP_API_URL = import.meta.env.VITE_WHATSAPP_API_URL ;
const WHATSAPP_SESSION_ID = import.meta.env.VITE_WHATSAPP_SESSION_ID ;
const WHATSAPP_SESSION_PASSCODE = import.meta.env.VITE_WHATSAPP_SESSION_PASSCODE ;

export interface SendWhatsAppResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Formats a phone number for WhatsApp API (digits with leading + and country code).
 * e.g., "9876543210" -> "+919876543210" (assumes India +91 if 10 digits)
 * e.g., "76665 4335" -> "+91766654335"
 * e.g., "+91 98765 43210" -> "+919876543210"
 * e.g., "09876543210" -> "+919876543210"
 */
export function formatPhoneForWhatsApp(phone: string): string {
  if (!phone) return '';
  
  // 1. Remove all non-numeric characters
  let cleaned = phone.replace(/[^0-9]/g, '');

  // 2. Handle leading zeroes & prefixed country codes
  if (cleaned.startsWith('0091')) {
    cleaned = cleaned.substring(4);
  } else if (cleaned.startsWith('091')) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith('0')) {
    cleaned = cleaned.replace(/^0+/, '');
  }

  // 3. If 9 or 10 digits starting with 6, 7, 8, 9 (Indian mobile prefix), prepend 91
  if ((cleaned.length === 9 || cleaned.length === 10) && /^[6-9]/.test(cleaned)) {
    cleaned = '91' + cleaned;
  }
  // 4. If 10 digits starting with any digit, prepend 91
  else if (cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }

  return cleaned ? '+' + cleaned : '';
}

/**
 * Sends a single WhatsApp message via WhatsApp Task Manager API.
 */
export async function sendWhatsAppMessage(phone: string, text: string): Promise<SendWhatsAppResponse> {
  const formattedPhone = formatPhoneForWhatsApp(phone);
  if (!formattedPhone) {
    console.error('[WhatsApp API] Invalid phone number provided:', phone);
    return { success: false, error: 'Invalid or missing phone number.' };
  }

  const apiUrl = WHATSAPP_API_URL;
  const sessionId = WHATSAPP_SESSION_ID;
  const passcode = WHATSAPP_SESSION_PASSCODE;

  if (!sessionId || !passcode) {
    console.error('[WhatsApp API] Credentials missing. Please set VITE_WHATSAPP_SESSION_ID and VITE_WHATSAPP_SESSION_PASSCODE in .env');
    return { success: false, error: 'WhatsApp API credentials are not configured.' };
  }

  console.log('[WhatsApp API] Sending message to:', formattedPhone);

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
 * Formats and sends an interview invitation via WhatsApp.
 */
export async function sendInterviewWhatsAppInvite(params: {
  phone: string;
  candidateName?: string;
  jobTitle: string;
  interviewLink: string;
  accessCode: string;
  isReminder?: boolean;
}): Promise<SendWhatsAppResponse> {
  const { phone, candidateName = 'Candidate', jobTitle, interviewLink, accessCode, isReminder = false } = params;

  const greeting = `Hello 👋 ${candidateName},`;
  const intro = isReminder
    ? `This is a friendly reminder for your upcoming interview for the role of *${jobTitle}* at DSource.`
    : `We are pleased to invite you for an online interview for the post of *${jobTitle}* at DSource.`;

  const messageText = `${greeting}

${intro}

📌 *Interview Details:*
• *Interview Link:* ${interviewLink}
• *Access Password:* ${accessCode}

If you face any difficulty, please call DSource Support: 9762588623 / 8484888632.

Best regards,
*Team DSource*`;

  return await sendWhatsAppMessage(phone, messageText);
}

/**
 * Bulk sends interview invites via WhatsApp to a list of candidates with phone numbers.
 */
export async function sendBulkWhatsAppInvites(
  candidates: Array<{ phone: string; name?: string; email?: string }>,
  jobTitle: string,
  interviewLink: string,
  accessCode: string,
  isReminder = false
): Promise<{ success: boolean; totalSent: number; totalFailed: number; errors: string[] }> {
  let totalSent = 0;
  let totalFailed = 0;
  const errors: string[] = [];

  for (const candidate of candidates) {
    if (!candidate.phone) continue;

    const res = await sendInterviewWhatsAppInvite({
      phone: candidate.phone,
      candidateName: candidate.name || candidate.email?.split('@')[0] || 'Candidate',
      jobTitle,
      interviewLink,
      accessCode,
      isReminder,
    });

    if (res.success) {
      totalSent++;
    } else {
      totalFailed++;
      if (res.error) errors.push(`${candidate.phone}: ${res.error}`);
    }
  }

  return {
    success: totalSent > 0,
    totalSent,
    totalFailed,
    errors,
  };
}
