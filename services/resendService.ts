// Amazon SES Transactional Email Service
// Migrated from Resend to Amazon SES (us-east-1)

export {
  sendSingleEmail,
  sendInterviewInvitations,
  getDesignerEmailTemplate,
  deriveNameFromEmail
} from './sesService';
export type { SendEmailResult, JobDetailsOptions } from './sesService';
