import { collection, doc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

export const CANDIDATE_CONSENT_VERSION = '2026-07-17';

const ACCEPTED_ITEM_IDS = [
  'continuous_recording',
  'ai_processing',
  'recruiting_company_sharing',
] as const;

interface PendingCandidateConsent {
  consentId: string;
  interviewId: string;
  interviewTitle: string;
  acceptedAt: string;
  ipAddress: string | null;
}

const sessionKey = (interviewId: string) => `candidate-consent:${interviewId}`;

const resolvePublicIp = async (): Promise<string | null> => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch('https://api64.ipify.org?format=json', {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const data = await response.json();
    const ipAddress = typeof data.ip === 'string' ? data.ip.trim() : '';
    return ipAddress.length > 0 && ipAddress.length <= 64 && /^[0-9a-f:.]+$/i.test(ipAddress)
      ? ipAddress
      : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export const stageCandidateConsent = async (interviewId: string, interviewTitle: string) => {
  const pending: PendingCandidateConsent = {
    consentId: doc(collection(db, 'candidateConsents')).id,
    interviewId,
    interviewTitle: interviewTitle.trim().slice(0, 300),
    acceptedAt: new Date().toISOString(),
    ipAddress: await resolvePublicIp(),
  };

  sessionStorage.setItem(sessionKey(interviewId), JSON.stringify(pending));
};

const readPendingConsent = (interviewId: string): PendingCandidateConsent | null => {
  try {
    const raw = sessionStorage.getItem(sessionKey(interviewId));
    if (!raw) return null;

    const pending = JSON.parse(raw) as PendingCandidateConsent;
    if (!pending.consentId || pending.interviewId !== interviewId || !pending.acceptedAt) return null;
    return pending;
  } catch {
    return null;
  }
};

export const saveCandidateConsent = async (
  interviewId: string,
  candidate: { name: string; email: string }
) => {
  const pending = readPendingConsent(interviewId);
  if (!pending) return null;

  await setDoc(doc(db, 'candidateConsents', pending.consentId), {
    interviewId,
    interviewTitle: pending.interviewTitle,
    candidateName: candidate.name.trim().slice(0, 200),
    candidateEmail: candidate.email.trim().toLowerCase().slice(0, 320),
    ipAddress: pending.ipAddress,
    acceptedItemIds: [...ACCEPTED_ITEM_IDS],
    acceptedAll: true,
    consentVersion: CANDIDATE_CONSENT_VERSION,
    consentMethod: 'web_checkboxes',
    status: 'accepted',
    acceptedAt: Timestamp.fromDate(new Date(pending.acceptedAt)),
    createdAt: serverTimestamp(),
  });

  sessionStorage.removeItem(sessionKey(interviewId));
  return pending.consentId;
};
