// Resend Transactional Email Service
// Uses Resend API (HTTP / SMTP compatible) to send ultra-premium designer email templates in Clean Professional White Theme

const RESEND_API_KEY = import.meta.env.VITE_RESEND_API_KEY;
const RESEND_SENDER_EMAIL = import.meta.env.VITE_RESEND_SENDER_EMAIL || 'invites@snab.co.in';
const RESEND_SENDER_NAME = import.meta.env.VITE_RESEND_SENDER_NAME || 'SNAB Innovations | Dsource';

// Fallback to Brevo if Resend API Key is missing
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_API_KEY = import.meta.env.VITE_BREVO_API_KEY;
const BREVO_SENDER_EMAIL = import.meta.env.VITE_BREVO_SENDER_EMAIL || 'hackathon746@gmail.com';
const BREVO_SENDER_NAME = import.meta.env.VITE_BREVO_SENDER_NAME || 'Dsource';

export interface JobDetailsOptions {
  gender?: string;
  location?: string;
  education?: string;
  qualification?: string;
  experience?: string;
  salary?: string;
  recruiterName?: string;
  recruiterPhone?: string;
}

/**
 * Derives a clean candidate name from an email address if name is not explicitly passed.
 */
export function deriveNameFromEmail(email: string): string {
  if (!email || !email.includes('@')) return 'Candidate';
  const localPart = email.split('@')[0];
  return localPart
    .replace(/[0-9]/g, '')
    .replace(/[._-]/g, ' ')
    .split(' ')
    .filter(w => w.length > 0)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
    .trim() || 'Candidate';
}

/**
 * Ultra-Professional White Theme Designer Email Template for Interview Invitations
 */
export function getDesignerEmailTemplate(
  candidateName: string,
  jobTitle: string,
  interviewLink: string,
  accessCode: string,
  isReminder: boolean = false,
  options?: JobDetailsOptions
): string {
  const badgeText = isReminder ? "REMINDER" : "OFFICIAL INVITATION";
  const headline = isReminder ? "Pending Interview Reminder" : `Interview Invitation: ${jobTitle}`;
  const subheadline = isReminder
    ? `This is a polite reminder that your AI video interview assessment for the <strong>${jobTitle}</strong> position is still pending.`
    : `We are pleased to invite you to complete an AI video interview assessment for the <strong>${jobTitle}</strong> position at <strong>SNAB Innovations / Dsource</strong>.`;

  // Formatting Job Specification details according to JD metadata
  const genderStr = options?.gender ? `, ${options.gender}` : '';
  const jobPostDisplay = `${jobTitle}${genderStr}`;
  const jobLocationDisplay = options?.location || 'As specified in Job Description';
  const jobQualificationDisplay = options?.qualification || options?.education || 'As per Job Description';
  const jobExpDisplay = options?.experience || 'As per Job Description';
  const jobSalaryDisplay = options?.salary || 'Competitive / As per Job Description';

  const recruiterName = options?.recruiterName || 'HR Recruiting Team';
  const recruiterPhone = options?.recruiterPhone || 'Dsource HR Support (9762588623 / 8484888632)';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headline}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:30px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px -5px rgba(0,0,0,0.06);">
          
          <!-- Corporate Blue Gradient Header Bar -->
          <tr>
            <td style="background:linear-gradient(135deg, #0284c7 0%, #2563eb 100%);height:6px;width:100%;"></td>
          </tr>
          
          <!-- Header Logo & Badge -->
          <tr>
            <td style="padding:28px 36px;background-color:#ffffff;border-bottom:1px solid #f1f5f9;text-align:center;">
              <img src="https://res.cloudinary.com/dvzxfbcsd/image/upload/v1776428916/vwjnuvbd0lpwfrcch7kw.png" alt="Dsource Logo" style="height:46px;width:auto;margin:0 auto 12px;display:block;" />
              <div style="display:inline-block;padding:4px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:1px;color:#1d4ed8;text-transform:uppercase;">
                ${badgeText}
              </div>
            </td>
          </tr>

          <!-- Main Email Content -->
          <tr>
            <td style="padding:32px 36px;">
              <h2 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:#0f172a;">Dear ${candidateName},</h2>
              <p style="margin:0 0 24px 0;font-size:15px;color:#475569;line-height:1.6;">
                ${subheadline}
              </p>

              <!-- Job Specifications Card (White Professional Theme) -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:28px;overflow:hidden;">
                <tr>
                  <td style="background-color:#eff6ff;padding:12px 20px;border-bottom:1px solid #dbeafe;">
                    <span style="font-size:12px;font-weight:800;letter-spacing:1px;color:#1e40af;text-transform:uppercase;">📌 Job Requirement Details</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#475569;width:38%;font-weight:600;">📌 Post:</td>
                        <td style="padding:6px 0;font-size:14px;color:#0f172a;font-weight:700;">${jobPostDisplay}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#475569;font-weight:600;">📍 Location:</td>
                        <td style="padding:6px 0;font-size:14px;color:#0f172a;font-weight:600;">${jobLocationDisplay}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#475569;font-weight:600;">🎓 Qualification:</td>
                        <td style="padding:6px 0;font-size:14px;color:#0f172a;font-weight:600;">${jobQualificationDisplay}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#475569;font-weight:600;">💼 Experience:</td>
                        <td style="padding:6px 0;font-size:14px;color:#0f172a;font-weight:600;">${jobExpDisplay}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:14px;color:#475569;font-weight:600;">💰 Salary:</td>
                        <td style="padding:6px 0;font-size:14px;color:#166534;font-weight:700;">${jobSalaryDisplay}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Access Code Credentials Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);border:1.5px solid #0284c7;border-radius:12px;margin-bottom:28px;">
                <tr>
                  <td style="padding:22px;text-align:center;">
                    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#0369a1;margin-bottom:6px;">Your Access Credentials</div>
                    <div style="font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:800;letter-spacing:6px;color:#0284c7;background:#ffffff;display:inline-block;padding:8px 24px;border-radius:8px;border:1px solid #bae6fd;box-shadow:0 2px 4px rgba(0,0,0,0.04);margin-bottom:8px;">
                      ${accessCode}
                    </div>
                    <div style="font-size:12px;color:#0369a1;">Enter this code when launching your AI interview.</div>
                  </td>
                </tr>
              </table>

              <!-- Primary CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${interviewLink}" target="_blank" style="display:inline-block;padding:16px 38px;background:linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:10px;box-shadow:0 8px 16px -4px rgba(37,99,235,0.3);letter-spacing:0.3px;">
                      Start Interview Now &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Direct Link Fallback -->
              <p style="margin:0 0 28px 0;font-size:12px;color:#64748b;word-break:break-all;text-align:center;">
                Direct Link: <a href="${interviewLink}" style="color:#2563eb;text-decoration:underline;">${interviewLink}</a>
              </p>

              <!-- Recruiter Contact Person Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:6px;">Contact Person / Recruiter Details</div>
                    <div style="font-size:15px;font-weight:700;color:#0f172a;">👤 ${recruiterName}</div>
                    <div style="font-size:14px;color:#334155;margin-top:2px;">📞 Mobile / Contact: <strong style="color:#1d4ed8;">${recruiterPhone}</strong></div>
                  </td>
                </tr>
              </table>

              <!-- Pre-Interview Instructions -->
              <div style="border-top:1px solid #e2e8f0;padding-top:18px;">
                <div style="font-size:13px;font-weight:700;color:#334155;margin-bottom:6px;">Important Instructions before starting:</div>
                <ul style="margin:0;padding-left:18px;font-size:13px;color:#64748b;line-height:1.7;">
                  <li>Ensure a working camera & microphone for the AI voice/video assessment.</li>
                  <li>Use a stable internet connection in a quiet environment.</li>
                  <li>Do not refresh or exit the browser tab once the assessment starts.</li>
                </ul>
              </div>

            </td>
          </tr>

          <!-- Corporate White Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:20px 36px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:13px;color:#475569;">
                Need Technical Assistance? Call Dsource Support: <strong style="color:#0f172a;">9762588623 / 8484888632</strong>
              </p>
              <p style="margin:0;font-size:11px;color:#94a3b8;">
                &copy; ${new Date().getFullYear()} SNAB Innovations | Dsource Recruitment System. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export interface SendEmailResult {
  success: boolean;
  totalEmails: number;
  messageIds?: string[];
  error?: string;
}

/**
 * Core single email sender (Tries Resend API first, falls back to Brevo)
 */
export async function sendSingleEmail(
  recipientEmail: string,
  recipientName: string,
  subject: string,
  htmlContent: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // 1. Try Resend API (HTTP / SMTP API Key authentication)
  if (RESEND_API_KEY) {
    const payload = {
      from: `${RESEND_SENDER_NAME} <${RESEND_SENDER_EMAIL}>`,
      to: [recipientEmail],
      subject,
      html: htmlContent,
    };

    const endpointsToTry = [
      '/api/resend/emails',
      'https://api.resend.com/emails',
    ];

    for (const targetUrl of endpointsToTry) {
      try {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (response.ok && data.id) {
          console.log('✅ [Resend API] Success! Email delivered to:', recipientEmail, '| MessageId:', data.id);
          return { success: true, messageId: data.id };
        } else {
          console.warn(`[Resend API via ${targetUrl}] Status ${response.status}:`, data);
        }
      } catch (err: any) {
        console.warn(`[Resend API via ${targetUrl}] Connection failed:`, err);
      }
    }
  }

  // 2. Fallback to Brevo REST API
  if (BREVO_API_KEY) {
    try {
      const payload = {
        sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
        to: [{ email: recipientEmail, name: recipientName }],
        subject,
        htmlContent,
      };

      const response = await fetch(BREVO_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': BREVO_API_KEY,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (response.ok && (data.messageId || data.messageIds)) {
        console.log('✅ [Brevo Fallback] Sent email to:', recipientEmail);
        return { success: true, messageId: data.messageId || data.messageIds?.[0] };
      } else {
        return { success: false, error: data.message || `Brevo status ${response.status}` };
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Email delivery failed' };
    }
  }

  return { success: false, error: 'No email service configured (VITE_RESEND_API_KEY or VITE_BREVO_API_KEY).' };
}

/**
 * Bulk email sender using professional white theme designer template
 */
export async function sendInterviewInvitations(
  candidateEmails: string[],
  jobTitle: string,
  interviewLink: string,
  accessCode: string,
  isReminder: boolean = false,
  options?: JobDetailsOptions
): Promise<SendEmailResult> {
  if (!candidateEmails || candidateEmails.length === 0) {
    return { success: false, totalEmails: 0, error: 'No candidate emails provided.' };
  }

  const allMessageIds: string[] = [];
  let lastError = '';

  for (const email of candidateEmails) {
    if (!email || !email.includes('@') || email.endsWith('@whatsapp.local')) continue;

    const candidateName = deriveNameFromEmail(email);
    const htmlContent = getDesignerEmailTemplate(candidateName, jobTitle, interviewLink, accessCode, isReminder, options);
    const subject = `${isReminder ? 'Reminder: ' : ''}Interview Invitation — ${jobTitle} | SNAB Innovations / Dsource`;

    const result = await sendSingleEmail(email, candidateName, subject, htmlContent);

    if (result.success && result.messageId) {
      allMessageIds.push(result.messageId);
    } else {
      lastError = result.error || 'Unknown error';
    }
  }

  if (allMessageIds.length > 0) {
    return {
      success: true,
      totalEmails: allMessageIds.length,
      messageIds: allMessageIds,
      error: lastError || undefined,
    };
  }

  return { success: false, totalEmails: 0, error: lastError || 'Failed to send emails.' };
}
