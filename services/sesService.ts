import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

/**
 * Amazon SESv2 Transactional Email Service
 * Region/account: AWS CLI user (Nimesh-dev) — verified domain snab.co.in in ap-south-1
 */

const REGION = import.meta.env.VITE_AWS_SES_REGION || 'ap-south-1';
const FROM_EMAIL = import.meta.env.VITE_SES_FROM_EMAIL || 'noreply@snab.co.in';
const SENDER_NAME = import.meta.env.VITE_SES_SENDER_NAME || 'InterviewXpert';
const CONFIGURATION_SET = import.meta.env.VITE_SES_CONFIGURATION_SET || 'interviewxpert';

const ACCESS_KEY_ID = (
  import.meta.env.VITE_AWS_SES_ACCESS_KEY_ID ||
  import.meta.env.VITE_AWS_ACCESS_KEY_ID ||
  import.meta.env.VITE_AWS_S3_ACCESS_KEY_ID ||
  ''
)
  .replace(/['"]/g, '')
  .trim();
const SECRET_ACCESS_KEY = (
  import.meta.env.VITE_AWS_SES_SECRET_ACCESS_KEY ||
  import.meta.env.VITE_AWS_SECRET_ACCESS_KEY ||
  import.meta.env.VITE_AWS_S3_SECRET_ACCESS_KEY ||
  ''
)
  .replace(/['"]/g, '')
  .trim();

export interface JobDetailsOptions {
  gender?: string;
  location?: string;
  education?: string;
  qualification?: string;
  experience?: string;
  salary?: string;
  recruiterName?: string;
  recruiterPhone?: string;
  detailedJdUrl?: string;
  aboutCompany?: string;
  companyDescription?: string;
  jobDescription?: string;
}

export interface SendEmailResult {
  success: boolean;
  totalEmails: number;
  messageIds?: string[];
  error?: string;
}

let sesClientInstance: SESv2Client | null = null;

const getSESClient = (): SESv2Client => {
  if (!sesClientInstance) {
    sesClientInstance = new SESv2Client({
      region: REGION,
      credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
      },
    });
  }
  return sesClientInstance;
};

export function isSesConfigured(): boolean {
  return Boolean(ACCESS_KEY_ID && SECRET_ACCESS_KEY && FROM_EMAIL && REGION);
}

export function getSesFromAddress(): string {
  return SENDER_NAME ? `${SENDER_NAME} <${FROM_EMAIL}>` : FROM_EMAIL;
}

/**
 * Derives a clean candidate name from an email address if name is not explicitly passed.
 */
export function deriveNameFromEmail(email: string): string {
  if (!email || !email.includes('@')) return 'Candidate';
  const localPart = email.split('@')[0];
  return (
    localPart
      .replace(/[0-9]/g, '')
      .replace(/[._-]/g, ' ')
      .split(' ')
      .filter((w) => w.length > 0)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
      .trim() || 'Candidate'
  );
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
  const badgeText = isReminder ? 'REMINDER' : 'OFFICIAL INVITATION';
  const headline = isReminder ? 'Pending Interview Reminder' : `Interview Invitation: ${jobTitle}`;
  const subheadline = isReminder
    ? `This is a polite reminder that your AI video interview assessment for the <strong>${jobTitle}</strong> position is still pending.`
    : `We are pleased to invite you to complete an AI video interview assessment for the <strong>${jobTitle}</strong> position.`;

  const detailRows: string[] = [];
  if (options?.location) detailRows.push(detailRow('Location', options.location));
  if (options?.education || options?.qualification) {
    detailRows.push(detailRow('Education', options.education || options.qualification || ''));
  }
  if (options?.experience) detailRows.push(detailRow('Experience', options.experience));
  if (options?.salary) detailRows.push(detailRow('Salary', options.salary));
  if (options?.gender) detailRows.push(detailRow('Gender preference', options.gender));
  const companyDesc = options?.aboutCompany || options?.companyDescription;
  if (companyDesc) detailRows.push(detailRow('About Company', companyDesc));
  if (options?.jobDescription) detailRows.push(detailRow('Job Description', options.jobDescription));
  if (options?.detailedJdUrl) {
    detailRows.push(detailRow('Detailed JD', `<a href="${escapeHtml(options.detailedJdUrl)}" target="_blank" style="color:#2563eb;text-decoration:underline;">Click Here for Detailed JD</a>`));
  }
  if (options?.recruiterName) detailRows.push(detailRow('Recruiter', options.recruiterName));
  if (options?.recruiterPhone) detailRows.push(detailRow('Contact', options.recruiterPhone));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${headline}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="background:#0f172a;padding:28px 32px;">
              <div style="font-size:12px;letter-spacing:0.16em;font-weight:700;color:#93c5fd;text-transform:uppercase;">${badgeText}</div>
              <div style="margin-top:10px;font-size:22px;font-weight:800;color:#ffffff;line-height:1.3;">InterviewXpert</div>
              <div style="margin-top:4px;font-size:13px;color:#cbd5e1;">AI Interview Portal</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">Hello ${escapeHtml(candidateName)},</p>
              <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#0f172a;">${escapeHtml(jobTitle)}</h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">${subheadline}</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;color:#64748b;text-transform:uppercase;margin-bottom:8px;">Access details</div>
                    <div style="font-size:14px;color:#0f172a;margin-bottom:6px;"><strong>Access code:</strong> <span style="font-family:Consolas,Monaco,monospace;background:#e2e8f0;padding:2px 8px;border-radius:6px;">${escapeHtml(accessCode)}</span></div>
                    <div style="font-size:14px;color:#0f172a;word-break:break-all;"><strong>Interview link:</strong> <a href="${escapeHtml(interviewLink)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(interviewLink)}</a></div>
                  </td>
                </tr>
              </table>

              ${
                detailRows.length
                  ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">${detailRows.join('')}</table>`
                  : ''
              }

              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                <tr>
                  <td style="border-radius:10px;background:#2563eb;">
                    <a href="${escapeHtml(interviewLink)}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">Start interview</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">
                Please complete the interview in a quiet environment with a working camera and microphone.
                If the button does not work, copy and paste the interview link into your browser.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:12px;color:#94a3b8;">
              Sent via Amazon SES · InterviewXpert · Do not reply to this automated message.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;width:36%;">${escapeHtml(label)}</td>
    <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;font-weight:600;">${escapeHtml(value)}</td>
  </tr>`;
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Core single email sender using Amazon SESv2 SendEmailCommand
 */
export async function sendSingleEmail(
  recipientEmail: string,
  recipientName: string,
  subject: string,
  htmlContent: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
    return {
      success: false,
      error:
        'AWS SES credentials missing. Set VITE_AWS_SES_ACCESS_KEY_ID & VITE_AWS_SES_SECRET_ACCESS_KEY (CLI user) in .env.',
    };
  }

  try {
    const ses = getSESClient();
    const formattedSender = getSesFromAddress();

    const command = new SendEmailCommand({
      FromEmailAddress: formattedSender,
      Destination: {
        ToAddresses: [recipientEmail],
      },
      ConfigurationSetName: CONFIGURATION_SET || undefined,
      Content: {
        Simple: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: htmlContent,
              Charset: 'UTF-8',
            },
          },
        },
      },
    });

    const response = await ses.send(command);
    console.log(
      '✅ [Amazon SESv2] Success! Email delivered to:',
      recipientEmail,
      '| MessageId:',
      response.MessageId
    );
    return { success: true, messageId: response.MessageId };
  } catch (err: any) {
    console.error('❌ [Amazon SESv2 Error]:', err);
    return { success: false, error: err?.message || 'Amazon SES email delivery failed.' };
  }
}

/**
 * Bulk email sender using Amazon SESv2 and designer template
 */
export async function sendInterviewInvitations(
  emails: string[],
  jobTitle: string,
  interviewLink: string,
  accessCode: string,
  isReminder: boolean = false,
  options?: JobDetailsOptions,
  names?: Record<string, string>
): Promise<SendEmailResult> {
  if (!emails?.length) {
    return { success: false, totalEmails: 0, error: 'No recipient emails provided.' };
  }
  if (!isSesConfigured()) {
    return {
      success: false,
      totalEmails: 0,
      error: 'Amazon SES is not configured. Check VITE_AWS_SES_* variables in .env.',
    };
  }

  const messageIds: string[] = [];
  let lastError = '';

  for (const email of emails) {
    const recipient = String(email || '').trim();
    if (!recipient) continue;
    const name = names?.[recipient] || deriveNameFromEmail(recipient);
    const subject = isReminder
      ? `Reminder: Interview pending — ${jobTitle}`
      : `Interview invitation — ${jobTitle}`;
    const html = getDesignerEmailTemplate(
      name,
      jobTitle,
      interviewLink,
      accessCode,
      isReminder,
      options
    );
    const result = await sendSingleEmail(recipient, name, subject, html);
    if (result.success && result.messageId) {
      messageIds.push(result.messageId);
    } else {
      lastError = result.error || 'Unknown SES error';
    }
  }

  if (messageIds.length > 0) {
    return { success: true, totalEmails: messageIds.length, messageIds };
  }

  return { success: false, totalEmails: 0, error: lastError || 'Failed to send emails via Amazon SES.' };
}
