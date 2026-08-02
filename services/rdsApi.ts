/**
 * Client API for InterviewXpert PostgreSQL (via api-server).
 * Replaces direct Firestore SDK usage.
 */
import { getStoredIdToken } from './authService';

const API_BASE = (import.meta.env.VITE_AUTH_API_URL || 'http://localhost:8080').replace(/\/$/, '');

type ApiOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  public?: boolean;
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function api<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const useAuth = options.auth !== false && !options.public;
  if (useAuth) {
    const token = getStoredIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}/api/db${path}`, {
    method: options.method || (options.body ? 'POST' : 'GET'),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new ApiError(data.error || `API error ${response.status}`, response.status);
  }
  return data as T;
}

export const rds = {
  health: () => api('/health', { public: true }),

  me: () => api<{ user: any }>('/users/me'),
  listUsers: () => api<{ users: any[] }>('/users'),
  teamUsers: (teamId: string) => api<{ users: any[] }>(`/users/team/${teamId}`),
  upsertUser: (body: any) => api('/users', { method: 'POST', body }),
  updateUser: (id: string, body: any) => api(`/users/${id}`, { method: 'PUT', body }),

  createRecruiterRequest: (body: any) =>
    api('/recruiter-requests', { method: 'POST', body, public: true }),
  listRecruiterRequests: () => api<{ requests: any[] }>('/recruiter-requests'),
  deleteRecruiterRequest: (id: string) =>
    api(`/recruiter-requests/${id}`, { method: 'DELETE' }),

  listInterviews: (params?: { recruiterUID?: string; teamId?: string }) => {
    const q = new URLSearchParams();
    if (params?.recruiterUID) q.set('recruiterUID', params.recruiterUID);
    if (params?.teamId) q.set('teamId', params.teamId);
    const qs = q.toString();
    return api<{ interviews: any[] }>(`/interviews${qs ? `?${qs}` : ''}`);
  },
  getInterview: (id: string) =>
    api<{ interview: any }>(`/interviews/${id}`, { public: true }),
  createInterview: (body: any) => api('/interviews', { method: 'POST', body }),
  updateInterview: (id: string, body: any) =>
    api(`/interviews/${id}`, { method: 'PATCH', body }),
  deleteInterview: (id: string) => api(`/interviews/${id}`, { method: 'DELETE' }),

  listAttempts: (interviewId: string) =>
    api<{ attempts: any[] }>(`/interviews/${interviewId}/attempts`, { public: true }),
  getAttempt: (id: string) => api<{ attempt: any }>(`/attempts/${id}`, { public: true }),
  listAttemptsByRecruiter: (recruiterUID?: string, status?: string) => {
    const q = new URLSearchParams();
    if (recruiterUID) q.set('recruiterUID', recruiterUID);
    if (status) q.set('status', status);
    return api<{ attempts: any[] }>(`/attempts?${q.toString()}`);
  },
  createAttempt: (interviewId: string, body: any) =>
    api(`/interviews/${interviewId}/attempts`, { method: 'POST', body, public: true }),
  updateAttempt: (id: string, body: any, opts?: { public?: boolean }) =>
    api(`/attempts/${id}`, { method: 'PATCH', body, public: opts?.public }),

  listTests: (recruiterUID?: string) => {
    const qs = recruiterUID ? `?recruiterUID=${encodeURIComponent(recruiterUID)}` : '';
    return api<{ tests: any[] }>(`/tests${qs}`);
  },
  getTest: (id: string) => api<{ test: any }>(`/tests/${id}`, { public: true }),
  createTest: (body: any) => api('/tests', { method: 'POST', body }),
  deleteTest: (id: string) => api(`/tests/${id}`, { method: 'DELETE' }),
  createTestSubmission: (body: any) =>
    api('/test-submissions', { method: 'POST', body, public: true }),
  listTestSubmissions: (testId: string) =>
    api<{ submissions: any[] }>(`/tests/${testId}/submissions`),

  getRateLimits: () => api('/rate-limits/company', { public: true }),
  getRawUsage: () =>
    api<{ interviews: number; assessments: number; codingAssessments: number }>(
      '/rate-limits/raw-usage'
    ),
  updateRateLimits: (body: any) =>
    api('/rate-limits/company', { method: 'PUT', body }),

  getSettings: (id: string) => api(`/settings/${id}`, { public: true }),
  putSettings: (id: string, body: any) =>
    api(`/settings/${id}`, { method: 'PUT', body }),

  createConsent: (body: any) =>
    api('/candidate-consents', { method: 'POST', body, public: true }),

  listResumeDump: (recruiterUID?: string) => {
    const qs = recruiterUID ? `?recruiterUID=${encodeURIComponent(recruiterUID)}` : '';
    return api<{ candidates: any[] }>(`/resume-dump${qs}`);
  },
  upsertResumeDump: (body: any) => api('/resume-dump', { method: 'POST', body }),
  updateResumeDump: (id: string, body: any) =>
    api(`/resume-dump/${id}`, { method: 'PATCH', body }),
  deleteResumeDump: (id: string, recruiterUID?: string) => {
    const qs = recruiterUID ? `?recruiterUID=${encodeURIComponent(recruiterUID)}` : '';
    return api(`/resume-dump/${id}${qs}`, { method: 'DELETE' });
  },

  createAuditLog: (body: any) => api('/audit-logs', { method: 'POST', body }),
  listAuditLogs: (teamId: string) =>
    api<{ logs: any[] }>(`/audit-logs?teamId=${encodeURIComponent(teamId)}`),

  listNotifications: () => api<{ notifications: any[] }>('/notifications'),
  createNotification: (body: any) => api('/notifications', { method: 'POST', body }),

  createAccessToken: (body: any) =>
    api('/interview-access-tokens', { method: 'POST', body, public: true }),
  updateAccessToken: (id: string, body: any) =>
    api(`/interview-access-tokens/${id}`, { method: 'PATCH', body, public: true }),

  listBlogs: () => api<{ blogs: any[] }>('/blogs', { public: true }),
  createContact: (body: any) =>
    api('/contact-submissions', { method: 'POST', body, public: true }),
  listContactSubmissions: () =>
    api<{ submissions: any[] }>('/contact-submissions'),
  updateContactSubmission: (id: string, body: any) =>
    api(`/contact-submissions/${id}`, { method: 'PATCH', body }),
  createBugReport: (body: any) =>
    api('/bug-reports', { method: 'POST', body, public: true }),
  listBugReports: () => api<{ reports: any[] }>('/bug-reports'),
  updateBugReport: (id: string, body: any) =>
    api(`/bug-reports/${id}`, { method: 'PATCH', body }),
  listConsents: () => api<{ consents: any[] }>('/candidate-consents'),
  listTransactions: () => api<{ transactions: any[] }>('/transactions'),
  listReviews: () => api<{ reviews: any[] }>('/reviews'),
  createReview: (body: any) => api('/reviews', { method: 'POST', body, public: true }),
  updateReview: (id: string, body: any) =>
    api(`/reviews/${id}`, { method: 'PATCH', body }),
  deleteReview: (id: string) => api(`/reviews/${id}`, { method: 'DELETE' }),
  deleteUser: (id: string) => api(`/users/${id}`, { method: 'DELETE' }),
};

/** Poll helper to replace onSnapshot for list endpoints */
export function poll<T>(
  loader: () => Promise<T>,
  onData: (data: T) => void,
  onError?: (err: unknown) => void,
  intervalMs = 8000
): () => void {
  let cancelled = false;
  let timer: number | undefined;

  const tick = async () => {
    try {
      const data = await loader();
      if (!cancelled) onData(data);
    } catch (err) {
      if (!cancelled && onError) onError(err);
    } finally {
      if (!cancelled) timer = window.setTimeout(tick, intervalMs);
    }
  };

  void tick();
  return () => {
    cancelled = true;
    if (timer) window.clearTimeout(timer);
  };
}
