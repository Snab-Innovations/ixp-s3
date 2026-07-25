// WasenderAPI WhatsApp Messaging Service
// Uses WasenderAPI REST endpoint (https://www.wasenderapi.com/api/send-message)

const WASENDER_API_URL = 'https://www.wasenderapi.com/api/send-message';
const WASENDER_API_KEY = import.meta.env.VITE_WASENDER_API_KEY || 'c50d317646ff44c71a7ec58a839f9560e419ff7cee9e2f4cbffa1802bb03da0f';

export interface SendWhatsAppResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Formats a phone number for WhatsApp API (digits only with country code).
 * e.g., "9876543210" -> "919876543210" (assumes India 91 if 10 digits)
 * e.g., "76665 4335" -> "91766654335"
 * e.g., "+91 98765 43210" -> "919876543210"
 * e.g., "09876543210" -> "919876543210"
 */
export function formatPhoneForWhatsApp(phone: string): string {
  if (!phone) return '';
  
  // 1. Remove all non-numeric characters (spaces, +, -, (), commas, labels)
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
    return '91' + cleaned;
  }

  // 4. If 10 digits starting with any digit, prepend 91
  if (cleaned.length === 10) {
    return '91' + cleaned;
  }

  // 5. If 11 or 12 digits starting with 91, return as is
  if ((cleaned.length === 11 || cleaned.length === 12) && cleaned.startsWith('91')) {
    return cleaned;
  }

  return cleaned;
}

/**
 * Sends a single WhatsApp message via WasenderAPI.
 */
export async function sendWhatsAppMessage(phone: string, text: string): Promise<SendWhatsAppResponse> {
  const formattedPhone = formatPhoneForWhatsApp(phone);
  if (!formattedPhone) {
    console.error('[WasenderAPI] Invalid phone number provided:', phone);
    return { success: false, error: 'Invalid or missing phone number.' };
  }

  const apiKey = WASENDER_API_KEY;
  if (!apiKey) {
    console.error('[WasenderAPI] API Key missing. Please set VITE_WASENDER_API_KEY in .env');
    return { success: false, error: 'WasenderAPI key is not configured.' };
  }

  console.log('[WasenderAPI] Sending message to:', formattedPhone);

  try {
    const response = await fetch(WASENDER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: formattedPhone,
        text: text,
      }),
    });

    const data = await response.json();
    console.log('[WasenderAPI] Response status:', response.status, '| Data:', data);

    if (!response.ok) {
      const errorMsg = data.message || data.error || `WasenderAPI returned HTTP ${response.status}`;
      return { success: false, data, error: errorMsg };
    }

    return { success: true, data };
  } catch (err: any) {
    console.error('[WasenderAPI] Fetch error:', err);
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
