import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

/**
 * Amazon SESv2 Transactional Email Service
 * Uses official @aws-sdk/client-sesv2 to send designer HTML emails via Amazon SES
 */

const REGION = import.meta.env.VITE_AWS_SES_REGION || import.meta.env.VITE_AWS_REGION || 'us-east-1';
const FROM_EMAIL = import.meta.env.VITE_SES_FROM_EMAIL || 'noreply@interviewxpert.in';
const SENDER_NAME = import.meta.env.VITE_SES_SENDER_NAME || 'Dsource';

const ACCESS_KEY_ID = (import.meta.env.VITE_AWS_ACCESS_KEY_ID || import.meta.env.VITE_AWS_S3_ACCESS_KEY_ID || '').replace(/['"]/g, '').trim();
const SECRET_ACCESS_KEY = (import.meta.env.VITE_AWS_SECRET_ACCESS_KEY || import.meta.env.VITE_AWS_S3_SECRET_ACCESS_KEY || '').replace(/['"]/g, '').trim();

import { renderTemplateText, getRecruiterTemplates, EmailTemplateConfig, DEFAULT_JOB_DETAILS_FIELDS, DEFAULT_JOB_DETAILS_ITEMS } from './templateService';

export interface JobDetailsOptions {
  gender?: string;
  location?: string;
  education?: string;
  qualification?: string;
  experience?: string | number;
  minExperience?: number | string;
  maxExperience?: number | string;
  salary?: string;
  salaryRange?: string;
  recruiterName?: string;
  recruiterPhone?: string;
  recruiterEmail?: string;
  employmentType?: string;
  customFields?: Array<{ key: string; value: string }>;
  whatsappSessionId?: string;
  whatsappSessionPasscode?: string;
  recruiterUid?: string;
  customTemplate?: EmailTemplateConfig;
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

/**
 * Formats job experience display string.
 * Handles ranges like 5-8 yrs, minExperience & maxExperience, single numbers, etc.
 */
export function formatExperienceDisplay(options?: {
  experience?: string | number;
  minExperience?: number | string;
  maxExperience?: number | string;
}): string {
  if (!options) return 'As per Job Description';

  const rawMin = options.minExperience !== undefined && options.minExperience !== null ? String(options.minExperience).trim() : '';
  const rawMax = options.maxExperience !== undefined && options.maxExperience !== null ? String(options.maxExperience).trim() : '';

  const minVal = rawMin !== '' && !isNaN(Number(rawMin)) ? Number(rawMin) : null;
  const maxVal = rawMax !== '' && !isNaN(Number(rawMax)) ? Number(rawMax) : null;

  // 1. Check numerical minExperience and maxExperience range first
  if (minVal !== null && maxVal !== null && maxVal > minVal && minVal >= 0) {
    return `${minVal} - ${maxVal} Years`;
  }

  // 2. Check if experience string itself contains a range like "3-5", "3 - 5 yrs", "3 to 5 years"
  const expStr = options.experience !== undefined && options.experience !== null ? String(options.experience).trim() : '';
  if (expStr) {
    const rangeMatch = expStr.match(/^(\d+)\s*(?:-|to)\s*(\d+)\s*(?:yrs?|years?)?$/i);
    if (rangeMatch) {
      const rMin = Number(rangeMatch[1]);
      const rMax = Number(rangeMatch[2]);
      if (rMax > rMin) {
        return `${rMin} - ${rMax} Years`;
      }
      return `${rMin} ${rMin === 1 ? 'Year' : 'Years'}`;
    }
  }

  // 3. Check equal min & max
  if (minVal !== null && maxVal !== null && minVal === maxVal && minVal > 0) {
    return `${minVal} ${minVal === 1 ? 'Year' : 'Years'}`;
  }

  // 4. Single value in experience string or minVal
  if (expStr) {
    const singleMatch = expStr.match(/^(\d+)\s*(?:yrs?|years?)?$/i);
    if (singleMatch) {
      const num = Number(singleMatch[1]);
      if (minVal !== null && maxVal !== null && maxVal > minVal) {
        return `${minVal} - ${maxVal} Years`;
      }
      return `${num} ${num === 1 ? 'Year' : 'Years'}`;
    }
    return expStr;
  }

  if (minVal !== null && minVal > 0) {
    return `${minVal}+ Years`;
  }

  return 'As per Job Description';
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
  const context: Record<string, string> = {
    candidate_name: candidateName,
    job_title: jobTitle,
    company_name: 'Dsource',
    interview_link: interviewLink,
    access_code: accessCode,
    location: options?.location || 'As specified in Job Description',
    qualification: options?.qualification || options?.education || 'As per Job Description',
    experience: formatExperienceDisplay(options),
    salary: options?.salary || options?.salaryRange || 'Competitive / As per Job Description',
    employment_type: options?.employmentType || 'Full Time',
    recruiter_name: options?.recruiterName || 'HR Recruiting Team',
    recruiter_phone: options?.recruiterPhone || '9762588623 / 8484888632',
    recruiter_email: options?.recruiterEmail || FROM_EMAIL,
    support_phone: '9762588623 / 8484888632'
  };

  const custom = options?.customTemplate;
  const badgeText = custom?.badgeText
    ? renderTemplateText(custom.badgeText, context)
    : (isReminder ? "REMINDER" : "OFFICIAL INVITATION");

  const headline = custom?.headline
    ? renderTemplateText(custom.headline, context)
    : `Dear ${candidateName},`;

  const bodyText = custom?.body
    ? renderTemplateText(custom.body, context)
    : (isReminder
        ? `This is a polite reminder that your AI video interview assessment for the <strong>${jobTitle}</strong> position is still pending.`
        : `We are pleased to invite you to complete an AI video interview assessment for the <strong>${jobTitle}</strong> position at <strong>Dsource</strong>.`);

  const ctaText = custom?.ctaButtonText
    ? renderTemplateText(custom.ctaButtonText, context)
    : 'Start Interview Now &rarr;';

  const accentColor = custom?.accentColor || '#0284c7';
  const showJobDetails = custom ? custom.showJobDetails !== false : true;
  const showCredentialsBox = custom ? custom.showCredentialsBox !== false : true;
  const footerText = custom?.customFooter
    ? renderTemplateText(custom.customFooter, context)
    : 'Need Technical Assistance? Call Dsource Support: 9762588623 / 8484888632';

  const instructionsList = custom?.instructions && custom.instructions.length > 0
    ? custom.instructions.map(inst => renderTemplateText(inst, context))
    : [
        'Ensure a working camera & microphone for the AI voice/video assessment.',
        'Use a stable internet connection in a quiet environment.',
        'Do not refresh or exit the browser tab once the assessment starts.'
      ];

  const items = custom?.jobDetailItems && custom.jobDetailItems.length > 0
    ? custom.jobDetailItems
    : DEFAULT_JOB_DETAILS_ITEMS;

  const renderedJobRows = items
    .filter(item => item.enabled !== false)
    .map(item => {
      let val = renderTemplateText(item.value, context);
      if (item.id === 'customFields') {
        if (options?.customFields && options.customFields.length > 0) {
          return options.customFields.map(cf => `<tr><td style="padding:6px 0;font-size:14px;color:#475569;width:38%;font-weight:600;">🔹 ${cf.key}:</td><td style="padding:6px 0;font-size:14px;color:#0f172a;font-weight:600;">${cf.value}</td></tr>`).join('');
        }
        return '';
      }
      if (!val) return '';
      const isSalary = item.id === 'salary';
      const valueColor = isSalary ? '#166534' : '#0f172a';
      const valueWeight = isSalary || item.id === 'post' ? '700' : '600';
      return `<tr><td style="padding:6px 0;font-size:14px;color:#475569;width:38%;font-weight:600;">${item.icon || '🔹'} ${item.label}:</td><td style="padding:6px 0;font-size:14px;color:${valueColor};font-weight:${valueWeight};">${val}</td></tr>`;
    })
    .filter(Boolean)
    .join('');

  const recruiterName = options?.recruiterName || 'HR Recruiting Team';
  const recruiterPhone = options?.recruiterPhone || '9762588623 / 8484888632';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${jobTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:30px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px -5px rgba(0,0,0,0.06);">
          
          <!-- Corporate Accent Header Bar -->
          <tr>
            <td style="background:${accentColor};height:6px;width:100%;"></td>
          </tr>
          
          <!-- Header Logo & Badge -->
          <tr>
            <td style="padding:28px 36px;background-color:#ffffff;border-bottom:1px solid #f1f5f9;text-align:center;">
              <img src="https://res.cloudinary.com/dvzxfbcsd/image/upload/v1776428916/vwjnuvbd0lpwfrcch7kw.png" alt="Dsource Logo" style="height:46px;width:auto;margin:0 auto 12px;display:block;" />
              <div style="display:inline-block;padding:4px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:1px;color:${accentColor};text-transform:uppercase;">
                ${badgeText}
              </div>
            </td>
          </tr>

          <!-- Main Email Content -->
          <tr>
            <td style="padding:32px 36px;">
              <h2 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:#0f172a;">${headline}</h2>
              <p style="margin:0 0 24px 0;font-size:15px;color:#475569;line-height:1.6;">
                ${bodyText}
              </p>

              ${showJobDetails && renderedJobRows ? `
              <!-- Job Specifications Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:28px;overflow:hidden;">
                <tr>
                  <td style="background-color:#eff6ff;padding:12px 20px;border-bottom:1px solid #dbeafe;">
                    <span style="font-size:12px;font-weight:800;letter-spacing:1px;color:#1e40af;text-transform:uppercase;">📌 Job Requirement Details</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      ${renderedJobRows}
                    </table>
                  </td>
                </tr>
              </table>
              ` : ''}

              ${showCredentialsBox ? `
              <!-- Access Code Credentials Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);border:1.5px solid ${accentColor};border-radius:12px;margin-bottom:28px;">
                <tr>
                  <td style="padding:22px;text-align:center;">
                    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#0369a1;margin-bottom:6px;">Your Access Credentials</div>
                    <div style="font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:800;letter-spacing:6px;color:${accentColor};background:#ffffff;display:inline-block;padding:8px 24px;border-radius:8px;border:1px solid #bae6fd;box-shadow:0 2px 4px rgba(0,0,0,0.04);margin-bottom:8px;">
                      ${accessCode}
                    </div>
                    <div style="font-size:12px;color:#0369a1;">Enter this code when launching your AI interview.</div>
                  </td>
                </tr>
              </table>
              ` : ''}

              <!-- Primary CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${interviewLink}" target="_blank" style="display:inline-block;padding:16px 38px;background:${accentColor};color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:10px;box-shadow:0 8px 16px -4px rgba(37,99,235,0.3);letter-spacing:0.3px;">
                      ${ctaText}
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Direct Link Fallback -->
              <p style="margin:0 0 28px 0;font-size:12px;color:#64748b;word-break:break-all;text-align:center;">
                Direct Link: <a href="${interviewLink}" style="color:${accentColor};text-decoration:underline;">${interviewLink}</a>
              </p>

              <!-- Recruiter & Sender Contact Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:8px;">Sender & Recruiter Contact Details</div>
                    <div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:4px;">👤 Sender Name: <span style="color:#0f172a;font-weight:700;">${recruiterName}</span></div>
                    <div style="font-size:14px;color:#334155;">📞 Contact / Phone: <strong style="color:${accentColor};">${recruiterPhone}</strong></div>
                  </td>
                </tr>
              </table>

              <!-- Pre-Interview Instructions -->
              <div style="border-top:1px solid #e2e8f0;padding-top:18px;">
                <div style="font-size:13px;font-weight:700;color:#334155;margin-bottom:6px;">Important Instructions before starting:</div>
                <ul style="margin:0;padding-left:18px;font-size:13px;color:#64748b;line-height:1.7;">
                  ${instructionsList.map(inst => `<li>${inst}</li>`).join('')}
                </ul>
              </div>

            </td>
          </tr>

          <!-- Corporate White Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:20px 36px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:13px;color:#475569;">
                ${footerText}
              </p>
              <p style="margin:0;font-size:11px;color:#94a3b8;">
                &copy; ${new Date().getFullYear()} Dsource Recruitment System. All rights reserved.
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
    return { success: false, error: 'AWS credentials missing for Amazon SES. Please set VITE_AWS_ACCESS_KEY_ID & VITE_AWS_SECRET_ACCESS_KEY.' };
  }

  try {
    const ses = getSESClient();
    const formattedSender = SENDER_NAME ? `${SENDER_NAME} <${FROM_EMAIL}>` : FROM_EMAIL;

    const command = new SendEmailCommand({
      FromEmailAddress: formattedSender,
      Destination: {
        ToAddresses: [recipientEmail],
      },
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
    console.log('✅ [Amazon SESv2] Success! Email delivered to:', recipientEmail, '| MessageId:', response.MessageId);
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

  // Load custom template for recruiter if available
  let activeTemplate = options?.customTemplate;
  if (!activeTemplate) {
    try {
      const recruiterTemplates = await getRecruiterTemplates(options?.recruiterUid);
      activeTemplate = isReminder ? recruiterTemplates.emailReminder : recruiterTemplates.emailInvite;
    } catch (e) {}
  }

  const mergedOptions: JobDetailsOptions = {
    ...options,
    customTemplate: activeTemplate
  };

  for (const email of candidateEmails) {
    if (!email || !email.includes('@') || email.endsWith('@whatsapp.local')) continue;

    const candidateName = deriveNameFromEmail(email);
    const htmlContent = getDesignerEmailTemplate(candidateName, jobTitle, interviewLink, accessCode, isReminder, mergedOptions);

    const context = {
      candidate_name: candidateName,
      candidate_email: email,
      job_title: jobTitle,
      company_name: 'Dsource',
      interview_link: interviewLink,
      access_code: accessCode,
      location: options?.location || 'As specified in Job Description',
      qualification: options?.qualification || options?.education || 'As per Job Description',
      experience: formatExperienceDisplay(options),
      salary: options?.salary || options?.salaryRange || 'Competitive / As per Job Description',
      employment_type: options?.employmentType || 'Full Time',
      recruiter_name: options?.recruiterName || 'HR Recruiting Team',
      recruiter_phone: options?.recruiterPhone || '9762588623 / 8484888632',
      recruiter_email: options?.recruiterEmail || FROM_EMAIL,
      support_phone: '9762588623 / 8484888632'
    };

    const subject = activeTemplate?.subject
      ? renderTemplateText(activeTemplate.subject, context)
      : `${isReminder ? 'Reminder: ' : ''}Interview Invitation — ${jobTitle} | Dsource`;

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

  return { success: false, totalEmails: 0, error: lastError || 'Failed to send emails via Amazon SES.' };
}
