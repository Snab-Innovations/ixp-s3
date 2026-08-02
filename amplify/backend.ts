import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { defineBackend } from '@aws-amplify/backend';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { apiServer } from './functions/api-server/resource.js';

/**
 * Load root .env into process.env so server-side env vars reach the Lambda.
 * Already-set values (Amplify console env vars in CI) take precedence.
 */
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const backend = defineBackend({ apiServer });

/**
 * API Gateway HTTP API exposing the Express Lambda to the internet.
 * Catch-all ANY /{proxy+} route → Lambda (payload format 2.0).
 */
const httpApi = new HttpApi(backend.stack, 'InterviewXpertHttpApi', {
  apiName: 'interviewxpert-api',
  description: 'InterviewXpert REST API (Express via Lambda)',
  corsPreflight: {
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Api-Key',
      'X-Amz-Date',
      'X-Amz-Security-Token',
      'X-Amz-User-Agent',
    ],
    allowMethods: [
      HttpMethod.GET,
      HttpMethod.POST,
      HttpMethod.PUT,
      HttpMethod.PATCH,
      HttpMethod.DELETE,
      HttpMethod.OPTIONS,
    ],
    allowOrigins: ['*'],
    maxAge: 86400,
  },
});

httpApi.addRoutes({
  path: '/{proxy+}',
  methods: [HttpMethod.ANY],
  integration: new HttpLambdaIntegration('ApiServerIntegration', backend.apiServer.resources.lambda),
});

backend.addOutput({
  custom: {
    API: {
      interviewxpert: {
        endpoint: httpApi.apiEndpoint,
        region: backend.stack.region,
      },
    },
  },
});
