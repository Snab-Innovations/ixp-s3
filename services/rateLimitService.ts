import { poll, rds } from './rdsApi';

export type RateLimitResource = 'interviews' | 'assessments' | 'codingAssessments';

export interface CompanyRateLimits {
  interviews: number;
  assessments: number;
  codingAssessments: number;
}

export type CompanyRateLimitUsage = CompanyRateLimits;

export interface CompanyRateLimitStatus {
  initialized: boolean;
  limits: CompanyRateLimits;
  usage: CompanyRateLimitUsage;
  topUps: CompanyRateLimits;
  usageBaseline: CompanyRateLimitUsage;
}

export const PRIMARY_RATE_LIMITS: CompanyRateLimits = {
  interviews: 2500,
  assessments: 5,
  codingAssessments: 2,
};

export const EMPTY_RATE_LIMIT_USAGE: CompanyRateLimitUsage = {
  interviews: 0,
  assessments: 0,
  codingAssessments: 0,
};

const normalizeLimit = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
};

export const parseCompanyRateLimits = (data?: Record<string, unknown>): CompanyRateLimits => ({
  interviews: normalizeLimit(data?.interviews, PRIMARY_RATE_LIMITS.interviews),
  assessments: normalizeLimit(data?.assessments, PRIMARY_RATE_LIMITS.assessments),
  codingAssessments: normalizeLimit(data?.codingAssessments, PRIMARY_RATE_LIMITS.codingAssessments),
});

export const parseUsageValues = (data?: Record<string, unknown>): CompanyRateLimitUsage => ({
  interviews: normalizeLimit(data?.interviews, 0),
  assessments: normalizeLimit(data?.assessments, 0),
  codingAssessments: normalizeLimit(data?.codingAssessments, 0),
});

export const buildCompanyRateLimitStatus = (
  data?: Record<string, any>,
  initialized = false,
): CompanyRateLimitStatus => ({
  initialized: Boolean(initialized && data),
  limits: parseCompanyRateLimits(data),
  usage: parseUsageValues(data?.usage),
  topUps: parseUsageValues(data?.topUps),
  usageBaseline: parseUsageValues(data?.usageBaseline),
});

export const isRateLimitReached = (
  status: CompanyRateLimitStatus | null | undefined,
  resource: RateLimitResource,
) => Boolean(status && status.usage[resource] >= status.limits[resource]);

export const getRateLimitLabel = (resource: RateLimitResource) => {
  if (resource === 'interviews') return 'interview';
  if (resource === 'codingAssessments') return 'coding assessment';
  return 'assessment';
};

export const getRateLimitReachedMessage = (resource: RateLimitResource) => (
  `The company's shared ${getRateLimitLabel(resource)} limit has been reached. Contact your administrator to add a top-up or reset the limit.`
);

export const getCandidateRateLimitReachedMessage = (resource: RateLimitResource) => {
  const activity = resource === 'interviews'
    ? 'interview'
    : resource === 'codingAssessments'
      ? 'coding exam'
      : 'assessment';
  return `This ${activity} cannot be conducted because the hiring team's ${activity} limit has been reached. Please contact the hiring team for assistance.`;
};

export const loadCompanyRateLimitStatus = async (): Promise<CompanyRateLimitStatus> => {
  const { rateLimits } = await rds.getRateLimits();
  return buildCompanyRateLimitStatus(rateLimits, true);
};

/**
 * Count real submissions from Postgres for admin reconciliation.
 */
export const loadCompanyRawUsage = async (): Promise<CompanyRateLimitUsage> => {
  const data = await rds.getRawUsage();
  return {
    interviews: normalizeLimit(data.interviews, 0),
    assessments: normalizeLimit(data.assessments, 0),
    codingAssessments: normalizeLimit(data.codingAssessments, 0),
  };
};

export const saveCompanyRateLimits = async (patch: Record<string, unknown>) => {
  await rds.updateRateLimits(patch);
};

/**
 * Check company rate limit before writing a submission.
 * Usage counters are incremented server-side when attempts/test-submissions are created.
 */
export const assertCompanyRateLimit = async (resource: RateLimitResource) => {
  const status = await loadCompanyRateLimitStatus();
  if (isRateLimitReached(status, resource)) {
    throw new Error(getRateLimitReachedMessage(resource));
  }
  return status;
};

/** @deprecated Prefer assertCompanyRateLimit + rds.createAttempt / createTestSubmission */
export const recordCandidateSubmission = async (
  resource: RateLimitResource,
  _submissionRef: unknown,
  submissionData: Record<string, unknown>,
) => {
  await assertCompanyRateLimit(resource);
  void submissionData;
};

export const subscribeCompanyRateLimits = (
  onData: (status: CompanyRateLimitStatus) => void,
  onError?: (err: unknown) => void,
) =>
  poll(
    () => loadCompanyRateLimitStatus(),
    onData,
    onError,
    10000
  );
