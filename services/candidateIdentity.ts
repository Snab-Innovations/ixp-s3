export interface CandidateIdentity {
  email?: string | null;
  phone?: string | null;
  id?: string;
}

const normalizeEmail = (value?: string | null) => value?.trim().toLowerCase() || '';

const normalizePhone = (value?: string | null) => {
  const digits = value?.replace(/\D/g, '') || '';
  if (digits.length < 7) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
};

export const normalizeCandidateEmail = normalizeEmail;
export const normalizeCandidatePhone = normalizePhone;

export const getCandidateIdentityKeys = (candidate?: CandidateIdentity | null) => {
  if (!candidate) return [];

  const email = normalizeEmail(candidate.email);
  const phone = normalizePhone(candidate.phone);

  if (email) {
    return [`email:${email}`];
  }
  if (phone) {
    return [`phone:${phone}`];
  }
  if (candidate.id) {
    return [`id:${candidate.id}`];
  }
  return [];
};

export const isCandidateIdentityInSet = (
  candidate: CandidateIdentity,
  identityKeys: ReadonlySet<string>
) => getCandidateIdentityKeys(candidate).some((key) => identityKeys.has(key));

/** Keep one record per email/phone identity (most recently updated first). */
export const dedupeCandidatesByIdentity = <T extends CandidateIdentity>(
  candidates: T[],
  getRecency: (candidate: T) => number = () => 0
): T[] => {
  const sorted = [...candidates].sort((left, right) => getRecency(right) - getRecency(left));
  const kept: T[] = [];
  const seenKeys = new Set<string>();

  for (const candidate of sorted) {
    const keys = getCandidateIdentityKeys(candidate);
    if (keys.length === 0) {
      kept.push(candidate);
      continue;
    }
    if (keys.some((key) => seenKeys.has(key))) continue;
    keys.forEach((key) => seenKeys.add(key));
    kept.push(candidate);
  }

  return kept;
};
