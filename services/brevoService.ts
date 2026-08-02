// Resend & Brevo Email Service Integration
// Exports Resend transactional email sender with designer template

export {
  sendSingleEmail,
  sendInterviewInvitations,
  getDesignerEmailTemplate,
  deriveNameFromEmail
} from './resendService';
export type { SendEmailResult } from './resendService';
