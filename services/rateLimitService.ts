import {
  collection,
  doc,
  DocumentData,
  DocumentReference,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from './firebase';

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
  initialized: Boolean(
    initialized
    && data?.scope === 'company'
    && data?.usage
    && data?.topUps
    && data?.usageBaseline
  ),
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

export const loadCompanyRawUsage = async (): Promise<CompanyRateLimitUsage> => {
  let interviewsSnapshot;
  let testsSnapshot;
  let submissionsSnapshot;
  try {
    [interviewsSnapshot, testsSnapshot, submissionsSnapshot] = await Promise.all([
      getDocs(collection(db, 'interviews')),
      getDocs(collection(db, 'tests')),
      getDocs(collection(db, 'testSubmissions')),
    ]);
  } catch (error: any) {
    if (error?.code === 'permission-denied') {
      throw new Error('Firestore denied access to interviews or assessment submissions while calculating company usage.');
    }
    throw error;
  }

  let interviews = 0;
  const batchSize = 20;
  for (let start = 0; start < interviewsSnapshot.docs.length; start += batchSize) {
    const interviewBatch = interviewsSnapshot.docs.slice(start, start + batchSize);
    try {
      const attemptSnapshots = await Promise.all(
        interviewBatch.map(interview => getDocs(collection(db, 'interviews', interview.id, 'attempts')))
      );
      interviews += attemptSnapshots.reduce((total, snapshot) => total + snapshot.size, 0);
    } catch (error: any) {
      if (error?.code === 'permission-denied') {
        throw new Error('Firestore denied access to candidate interview attempts while calculating company usage.');
      }
      throw error;
    }
  }

  const testsById = new Map(testsSnapshot.docs.map(test => [test.id, test.data()]));
  let assessments = 0;
  let codingAssessments = 0;

  submissionsSnapshot.docs.forEach(submission => {
    const data = submission.data();
    const testData = testsById.get(data.testId) as Record<string, any> | undefined;
    const type = data.type || testData?.type;
    if (type === 'coding') codingAssessments += 1;
    else assessments += 1;
  });

  return { interviews, assessments, codingAssessments };
};

export const loadCompanyRateLimitStatus = async (): Promise<CompanyRateLimitStatus> => {
  const limitSnapshot = await getDoc(doc(db, 'rateLimits', 'company'));
  return buildCompanyRateLimitStatus(limitSnapshot.data(), limitSnapshot.exists());
};

export const recordCandidateSubmission = async (
  resource: RateLimitResource,
  submissionRef: DocumentReference<DocumentData>,
  submissionData: Record<string, unknown>,
) => {
  const limitRef = doc(db, 'rateLimits', 'company');
  const permanentRecordRef = doc(db, 'candidateResponses', submissionRef.id);
  const payload = {
    ...submissionData,
    attemptId: submissionRef.id,
    savedAt: serverTimestamp(),
  };

  try {
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(limitRef);
      const status = buildCompanyRateLimitStatus(snapshot.data(), snapshot.exists());

      if (isRateLimitReached(status, resource)) {
        throw new Error(getRateLimitReachedMessage(resource));
      }

      transaction.set(submissionRef, payload);
      transaction.set(permanentRecordRef, payload, { merge: true });
      transaction.set(limitRef, {
        scope: 'company',
        ...status.limits,
        usage: {
          ...status.usage,
          [resource]: status.usage[resource] + 1,
        },
        topUps: status.topUps,
        usageBaseline: status.usageBaseline,
        lastCandidateSubmissionAt: serverTimestamp(),
      }, { merge: true });
    }, { maxAttempts: 1 });
  } catch (error: any) {
    const recoverableCounterError = [
      'permission-denied',
      'resource-exhausted',
      'unavailable',
      'deadline-exceeded',
      'aborted',
    ].includes(error?.code) || /quota exceeded/i.test(String(error?.message || ''));

    // Preserve the interview report when the optional company counter cannot
    // be read or updated. The admin page reconciles usage from actual reports.
    if (recoverableCounterError) {
      await setDoc(submissionRef, payload);
      try {
        await setDoc(permanentRecordRef, payload, { merge: true });
      } catch (err) {
        console.warn('Failed to set top-level candidateResponses record:', err);
      }
      console.warn('Candidate submission saved without updating the rate-limit counter; an administrator can reconcile it later.');
      return;
    }
    throw error;
  }
};
