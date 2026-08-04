import { defineFunction } from '@aws-amplify/backend';

/**
 * AWS Lambda function hosting the InterviewXpert Express API server.
 * The API Gateway HTTP API routes every /{proxy+} request here.
 *
 * Server-side env vars come from process.env at deploy time:
 * - locally: loaded from root .env by amplify/backend.ts
 * - CI:      Amplify console "Environment variables"
 */
export const apiServer = defineFunction({
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 30, // API Gateway HTTP API caps Lambda integration at 30s
  memoryMB: 1024,
  environment: {
    COGNITO_REGION: process.env.COGNITO_REGION || process.env.VITE_COGNITO_REGION || 'ap-south-1',
    COGNITO_USER_POOL_ID:
      process.env.COGNITO_USER_POOL_ID || process.env.VITE_COGNITO_USER_POOL_ID || 'ap-south-1_RPHo5WjDk',
    COGNITO_CLIENT_ID:
      process.env.COGNITO_CLIENT_ID || process.env.VITE_COGNITO_CLIENT_ID || '74i9tr52i2v3c1v3pceq3as6e3',
    COGNITO_AWS_ACCESS_KEY_ID: process.env.COGNITO_AWS_ACCESS_KEY_ID || '',
    COGNITO_AWS_SECRET_ACCESS_KEY: process.env.COGNITO_AWS_SECRET_ACCESS_KEY || '',
    RDS_HOST: process.env.RDS_HOST || '',
    RDS_PORT: process.env.RDS_PORT || '5432',
    RDS_DATABASE: process.env.RDS_DATABASE || '',
    RDS_USER: process.env.RDS_USER || '',
    RDS_PASSWORD: process.env.RDS_PASSWORD || '',
    IX_API_KEY: process.env.IX_API_KEY || '',
    IX_OUTWARD_WEBHOOK_SECRET: process.env.IX_OUTWARD_WEBHOOK_SECRET || '',
    IX_FRONTEND_URL: process.env.IX_FRONTEND_URL || '',
  },
});
