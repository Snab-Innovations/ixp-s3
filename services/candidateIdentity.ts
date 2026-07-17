export interface CandidateIdentity {
  email?: string | null;
  phone?: string | null;
}

const normalizeEmail = (value?: string | null) => value?.trim().toLowerCase() || '';

const normalizePhone = (value?: string | null) => {
  const digits = value?.replace(/\D/g, '') || '';
  if (digits.length < 7) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
};

export const getCandidateIdentityKeys = (candidate?: CandidateIdentity | null) => {
  if (!candidate) return [];

  const email = normalizeEmail(candidate.email);
  const phone = normalizePhone(candidate.phone);

  return [
    email ? `email:${email}` : '',
    phone ? `phone:${phone}` : '',
  ].filter(Boolean);
};

export const isCandidateIdentityInSet = (
  candidate: CandidateIdentity,
  identityKeys: ReadonlySet<string>
) => getCandidateIdentityKeys(candidate).some((key) => identityKeys.has(key));
