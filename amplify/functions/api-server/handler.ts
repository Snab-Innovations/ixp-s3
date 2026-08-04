import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import serverless from 'serverless-http';
import app from '../../../api-server/app.js';

/**
 * Wraps the Express app for AWS Lambda via the API Gateway HTTP API.
 * serverless-http auto-detects API Gateway payload format 1.0 / 2.0.
 */
export const handler = serverless(app);
