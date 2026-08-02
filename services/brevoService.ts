// Amazon SES Email Service Integration
// Re-exports Amazon SES transactional email sender with designer template

export {
  sendSingleEmail,
  sendInterviewInvitations,
  getDesignerEmailTemplate,
  deriveNameFromEmail
} from './sesService';
export type { SendEmailResult, JobDetailsOptions } from './sesService';
