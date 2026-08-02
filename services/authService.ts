/**
 * Cognito auth client for InterviewXpert.
 * Identity: Amazon Cognito. Profiles/data: Postgres via api-server.
 */
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';

const USER_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID || 'ap-south-1_RPHo5WjDk';
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || '74i9tr52i2v3c1v3pceq3as6e3';
const AUTH_API_URL = (import.meta.env.VITE_AUTH_API_URL || 'http://localhost:8080').replace(/\/$/, '');

const STORAGE_KEY = 'ix_cognito_session';

export type CognitoStoredSession = {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  firebaseUid?: string;
  email?: string;
  expiresAt?: number;
};

const userPool = new CognitoUserPool({
  UserPoolId: USER_POOL_ID,
  ClientId: CLIENT_ID,
});

function getCognitoUser(email: string) {
  return new CognitoUser({
    Username: email,
    Pool: userPool,
  });
}

export function getAuthApiBase(): string {
  return AUTH_API_URL;
}

export function loadStoredCognitoSession(): CognitoStoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CognitoStoredSession;
  } catch {
    return null;
  }
}

export function persistCognitoSession(session: CognitoStoredSession, rememberMe = true) {
  const raw = JSON.stringify(session);
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
  (rememberMe ? localStorage : sessionStorage).setItem(STORAGE_KEY, raw);
}

export function clearCognitoSession() {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
}

export function getStoredIdToken(): string | null {
  return loadStoredCognitoSession()?.idToken || null;
}

async function authApi<T>(path: string, body?: Record<string, unknown>, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${AUTH_API_URL}${path}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const error = new Error(data.error || `Auth API error (${response.status})`) as Error & {
      code?: string;
      challenge?: string;
      session?: string;
      status?: number;
    };
    error.code = data.code;
    error.challenge = data.challenge;
    error.session = data.session;
    error.status = response.status;
    throw error;
  }
  return data as T;
}

export type LoginResult = {
  challenge?: 'NEW_PASSWORD_REQUIRED';
  session?: string;
  firebaseUid?: string;
  profile?: {
    uid: string;
    email: string;
    role: string;
    name?: string;
    adminVerified?: boolean;
    accountStatus?: string;
  } | null;
};

/**
 * Cognito login via auth bridge. Stores Cognito tokens for API Authorization headers.
 */
export async function loginWithCognito(
  email: string,
  password: string,
  options: { rememberMe?: boolean; newPassword?: string; session?: string } = {}
): Promise<LoginResult> {
  const payload: Record<string, unknown> = { email, password };
  if (options.newPassword && options.session) {
    payload.newPassword = options.newPassword;
    payload.session = options.session;
  }

  type BridgeLogin = {
    success: boolean;
    challenge?: 'NEW_PASSWORD_REQUIRED';
    session?: string;
    firebaseUid?: string;
    uid?: string;
    tokens?: CognitoStoredSession & { expiresIn?: number };
    profile?: LoginResult['profile'];
  };

  const data = await authApi<BridgeLogin>('/auth/login', payload);

  if (data.challenge === 'NEW_PASSWORD_REQUIRED') {
    return { challenge: 'NEW_PASSWORD_REQUIRED', session: data.session };
  }

  if (!data.tokens) {
    throw new Error('Auth bridge did not return Cognito tokens.');
  }

  persistCognitoSession(
    {
      accessToken: data.tokens.accessToken,
      idToken: data.tokens.idToken,
      refreshToken: data.tokens.refreshToken,
      firebaseUid: data.firebaseUid || data.uid,
      email,
      expiresAt: Date.now() + ((data.tokens.expiresIn || 55 * 60) * 1000),
    },
    options.rememberMe !== false
  );

  return {
    firebaseUid: data.firebaseUid || data.uid,
    profile: data.profile,
  };
}

export async function refreshCognitoSession(): Promise<boolean> {
  const stored = loadStoredCognitoSession();
  if (!stored?.refreshToken) return false;

  try {
    type RefreshResponse = {
      firebaseUid?: string;
      uid?: string;
      tokens: CognitoStoredSession & { expiresIn?: number };
    };
    const data = await authApi<RefreshResponse>('/auth/refresh', {
      refreshToken: stored.refreshToken,
    });

    persistCognitoSession({
      accessToken: data.tokens.accessToken,
      idToken: data.tokens.idToken,
      refreshToken: data.tokens.refreshToken || stored.refreshToken,
      firebaseUid: data.firebaseUid || data.uid || stored.firebaseUid,
      email: stored.email,
      expiresAt: Date.now() + ((data.tokens.expiresIn || 55 * 60) * 1000),
    });
    return true;
  } catch (err) {
    console.warn('Cognito session refresh failed:', err);
    return false;
  }
}

export async function requestPasswordReset(email: string) {
  return authApi<{ success: boolean; message: string }>('/auth/forgot-password', { email });
}

export async function confirmPasswordReset(email: string, code: string, newPassword: string) {
  return authApi<{ success: boolean; message: string }>('/auth/confirm-forgot-password', {
    email,
    code,
    newPassword,
  });
}

export type CreateUserInput = {
  email: string;
  password: string;
  name?: string;
  role?: 'admin' | 'recruiter' | 'candidate';
  parentRecruiterId?: string;
  teamId?: string;
  isSecondary?: boolean;
  designation?: string;
};

export async function createCognitoUser(input: CreateUserInput) {
  const idToken = getStoredIdToken();
  if (!idToken) {
    throw new Error('Not authenticated with Cognito. Sign in again, then retry.');
  }

  return authApi<{
    success: boolean;
    uid: string;
    cognitoSub: string;
    email: string;
    role: string;
  }>('/auth/create-user', input, idToken);
}

export async function setCognitoUserEnabled(email: string, enabled: boolean) {
  const idToken = getStoredIdToken();
  if (!idToken) throw new Error('Not authenticated with Cognito.');
  return authApi('/auth/set-user-status', { email, enabled }, idToken);
}

export async function signOutAll() {
  clearCognitoSession();
  try {
    const current = userPool.getCurrentUser();
    if (current) current.signOut();
  } catch {
    // ignore
  }
}

export function getUserPool() {
  return userPool;
}

export function authenticateDirectCognito(email: string, password: string): Promise<CognitoUserSession> {
  const cognitoUser = getCognitoUser(email);
  const details = new AuthenticationDetails({ Username: email, Password: password });

  return new Promise((resolve, reject) => {
    cognitoUser.authenticateUser(details, {
      onSuccess: (session) => resolve(session),
      onFailure: (err) => reject(err),
      newPasswordRequired: () => {
        const error = new Error('NEW_PASSWORD_REQUIRED') as Error & { code: string };
        error.code = 'NEW_PASSWORD_REQUIRED';
        reject(error);
      },
    });
  });
}

export async function checkAuthApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${AUTH_API_URL}/auth/health`);
    return response.ok;
  } catch {
    return false;
  }
}
