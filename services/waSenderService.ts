// WhatsApp Messaging Service
// Uses WhatsApp Task Manager REST API (https://whatsapp-task-manager-ai4d.onrender.com/api/v1/send-message)

const WHATSAPP_API_URL = import.meta.env.VITE_WHATSAPP_API_URL;

export interface SendWhatsAppResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export interface WhatsAppInviteOptions {
  gender?: string;
  location?: string;
  education?: string;
  qualification?: string;
  experience?: string;
  salary?: string;
  recruiterName?: string;
  recruiterPhone?: string;
  whatsappSessionId?: string;
  whatsappSessionPasscode?: string;
  detailedJdUrl?: string;
  aboutCompany?: string;
  companyDescription?: string;
  jobDescription?: string;
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

  const apiUrl = WHATSAPP_API_URL || 'https://whatsapp-sending-api.onrender.com/api/messages/send';
  const sessionId = credentials?.sessionId?.trim() || '';
  const passcode = credentials?.passcode?.trim() || '';

  if (!sessionId || !passcode) {
    console.error('[WhatsApp API] Saved WhatsApp Session credentials missing from profile!');
    return {
      success: false,
      error: 'WhatsApp Session ID and Passcode are not configured for your account. Please click WA Connect to save your WhatsApp Session ID & Passcode before sending WhatsApp messages.'
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
        'sessionId': sessionId,
        'passcode': passcode,
        'x_session_id': sessionId,
        'x_session_passcode': passcode,
      },
      body: JSON.stringify({
        phone: formattedPhone,
        message: text,
        sessionId: sessionId,
        passcode: passcode,
        x_session_id: sessionId,
        x_session_passcode: passcode,
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
 * Builds full WhatsApp message text matching clean professional text format (no emojis, no hardcoded company name).
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
  const recruiterName = options?.recruiterName || 'Recruiting Team';
  const recruiterPhone = options?.recruiterPhone || '';

  const headline = isReminder
    ? `*PENDING INTERVIEW REMINDER*`
    : `*OFFICIAL INTERVIEW INVITATION*`;

  const intro = isReminder
    ? `Dear *${candidateName}*,\n\nThis is a polite reminder to complete your AI video interview assessment for the post of *${jobTitle}*.`
    : `Dear *${candidateName}*,\n\nWe are pleased to invite you to complete an AI video interview assessment for the post of *${jobTitle}*.`;

  const reqLines = [`- Post: ${postDisplay}`];

  if (options?.location) {
    reqLines.push(`- Location: ${options.location}`);
  }
  const qual = options?.qualification || options?.education;
  if (qual) {
    reqLines.push(`- Qualification: ${qual}`);
  }
  if (options?.experience) {
    reqLines.push(`- Experience: ${options.experience}`);
  }
  if (options?.salary) {
    reqLines.push(`- Salary: ${options.salary}`);
  }
  const companyDesc = options?.aboutCompany || options?.companyDescription;
  if (companyDesc) {
    reqLines.push(`- About Company: ${companyDesc}`);
  }
  if (options?.jobDescription) {
    reqLines.push(`- Job Description: ${options.jobDescription}`);
  }
  if (options?.detailedJdUrl) {
    reqLines.push(`- For detailed JD click: ${options.detailedJdUrl}`);
  }

  const reqDetails = `*JOB REQUIREMENT DETAILS:*\n${reqLines.join('\n')}`;

  let contactDetails = `*RECRUITER / CONTACT PERSON:*
- Contact Person: *${recruiterName}*`;
  if (recruiterPhone) {
    contactDetails += `\n- Mobile / Contact: *${recruiterPhone}*`;
  }

  return `${headline}

${intro}

${reqDetails}

*YOUR ACCESS CREDENTIALS:*
- Access Code: *${accessCode}*
- Interview Link: ${interviewLink}

${contactDetails}

*Instructions:*
1. Ensure a working camera & microphone on your phone or laptop.
2. Use a stable internet connection in a quiet environment.

Best regards,
*Recruitment Team*`;
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
 * Sends candidates one-by-one with a mandatory 10-second delay between messages to protect WhatsApp from ban/spam blocking.
 */
export async function sendBulkWhatsAppInvites(
  candidates: Array<{ phone: string; name?: string; email?: string }>,
  jobTitle: string,
  interviewLink: string,
  accessCode: string,
  isReminder = false,
  onProgress?: (sentCount: number, totalCount: number, currentCandidate: string, isWaiting: boolean) => void,
  options?: WhatsAppInviteOptions
): Promise<{ success: boolean; totalSent: number; totalFailed: number; errors: string[] }> {
  let totalSent = 0;
  let totalFailed = 0;
  const errors: string[] = [];
  const validCandidates = candidates.filter(c => !!c.phone && c.phone.trim() !== '');

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

    // Mandatory 10-second delay before sending to next candidate to protect WhatsApp account
    if (i < validCandidates.length - 1) {
      if (onProgress) {
        onProgress(i + 1, validCandidates.length, candidateDisplayName, true);
      }
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  return {
    success: totalSent > 0,
    totalSent,
    totalFailed,
    errors,
  };
}
