import express from 'express';
import {
  initiatePasswordAuth,
  respondToNewPasswordChallenge,
  refreshAuth,
  forgotPassword,
  confirmForgotPassword,
  getUserFromAccessToken,
  adminCreateUser,
  adminGetUserByEmail,
  adminSetEnabled,
  adminUpdateCustomAttributes,
  verifyIdToken,
} from './cognitoService.js';
import { cognitoConfig } from './cognitoConfig.js';
import { query, dbReady } from './db/pool.js';

const router = express.Router();

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return req.body?.idToken || req.body?.accessToken || null;
}

function authResultPayload(authResult) {
  return {
    accessToken: authResult.AccessToken,
    idToken: authResult.IdToken,
    refreshToken: authResult.RefreshToken,
    expiresIn: authResult.ExpiresIn,
    tokenType: authResult.TokenType,
  };
}

function mapPgUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    uid: row.id,
    email: row.email,
    role: row.role,
    fullname: row.fullname,
    name: row.display_name || row.fullname,
    displayName: row.display_name || row.fullname,
    adminVerified: row.admin_verified,
    accountStatus: row.account_status,
    cognitoSub: row.cognito_sub,
    teamId: row.team_id,
    parentRecruiterId: row.parent_recruiter_id,
    isSecondary: row.is_secondary,
  };
}

async function findAppUserByEmail(email) {
  const normalized = String(email || '').trim();
  if (!normalized) return null;

  if (dbReady()) {
    const r = await query(
      `SELECT * FROM users WHERE email_lower = lower($1) LIMIT 1`,
      [normalized]
    );
    if (r.rows[0]) return mapPgUser(r.rows[0]);
  }

  return null;
}

async function syncUserToPostgres(cognitoUser, uid) {
  if (!dbReady()) return null;
  const role = cognitoUser.role || 'recruiter';
  const r = await query(
    `INSERT INTO users (
      id, cognito_sub, email, role, fullname, display_name, admin_verified, account_status, auth_provider
    ) VALUES ($1,$2,$3,$4,$5,$5,true,'active','cognito')
    ON CONFLICT (id) DO UPDATE SET
      cognito_sub = EXCLUDED.cognito_sub,
      email = EXCLUDED.email,
      fullname = COALESCE(EXCLUDED.fullname, users.fullname),
      display_name = COALESCE(EXCLUDED.display_name, users.display_name),
      updated_at = NOW()
    RETURNING *`,
    [uid, cognitoUser.sub, cognitoUser.email, role, cognitoUser.name || null]
  );
  return mapPgUser(r.rows[0]);
}

/**
 * Resolve stable app UID.
 * Priority: custom:legacyFirebaseUid → existing users row by email → Cognito sub
 */
async function resolveAppUid(cognitoUser) {
  if (cognitoUser.legacyFirebaseUid) return cognitoUser.legacyFirebaseUid;

  const existing = cognitoUser.email ? await findAppUserByEmail(cognitoUser.email) : null;
  if (existing?.id) return existing.id;

  return cognitoUser.sub;
}

async function buildSessionFromAuthResult(authResult) {
  const tokens = authResultPayload(authResult);
  const cognitoUser = await getUserFromAccessToken(tokens.accessToken);
  const appUid = await resolveAppUid(cognitoUser);

  // Primary: Postgres profile
  let profile = await syncUserToPostgres(cognitoUser, appUid);

  if (!cognitoUser.legacyFirebaseUid && appUid !== cognitoUser.sub) {
    try {
      await adminUpdateCustomAttributes(cognitoUser.email, {
        'custom:legacyFirebaseUid': appUid,
      });
    } catch (err) {
      console.warn('Could not persist legacyFirebaseUid on Cognito user:', err.message);
    }
  }

  if (!profile) {
    profile = await findAppUserByEmail(cognitoUser.email);
  }

  return {
    cognito: cognitoUser,
    tokens,
    firebaseUid: appUid,
    uid: appUid,
    profile,
    passwordBridge: false,
  };
}

async function requireCaller(req, res) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ success: false, error: 'Missing Bearer token (Cognito ID token).' });
    return null;
  }

  try {
    const payload = await verifyIdToken(token);
    const email = payload.email;
    const groups = payload['cognito:groups'] || [];
    const roleClaim = payload['custom:role'];
    const appUser = email ? await findAppUserByEmail(email) : null;
    const role =
      roleClaim ||
      appUser?.role ||
      (groups.includes('admin') ? 'admin' : groups.includes('recruiter') ? 'recruiter' : '');

    return {
      payload,
      email,
      groups,
      role,
      firebaseUid: appUser?.id || payload['custom:legacyFirebaseUid'] || payload.sub,
      firestoreUser: appUser,
      appUser,
    };
  } catch (err) {
    res.status(401).json({ success: false, error: 'Invalid or expired Cognito token.', details: err.message });
    return null;
  }
}

router.get('/health', async (_req, res) => {
  res.json({
    success: true,
    service: 'InterviewXpert Cognito Auth Bridge',
    userPoolId: cognitoConfig.userPoolId,
    region: cognitoConfig.region,
    postgres: dbReady(),
  });
});

/**
 * POST /auth/login
 * Body: { email, password }
 * Optional first-login: { email, password, newPassword, session } for NEW_PASSWORD_REQUIRED
 */
router.post('/login', async (req, res) => {
  const { email, password, newPassword, session } = req.body || {};
  if (!email || (!password && !(newPassword && session))) {
    return res.status(400).json({ success: false, error: 'email and password are required.' });
  }

  try {
    let authResponse;
    if (session && newPassword) {
      authResponse = await respondToNewPasswordChallenge(email, newPassword, session);
    } else {
      authResponse = await initiatePasswordAuth(email, password);
    }

    if (authResponse.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
      return res.status(200).json({
        success: true,
        challenge: 'NEW_PASSWORD_REQUIRED',
        session: authResponse.Session,
        message: 'A new permanent password is required before sign-in can complete.',
      });
    }

    if (!authResponse.AuthenticationResult) {
      return res.status(401).json({
        success: false,
        error: 'Authentication failed.',
        challenge: authResponse.ChallengeName || null,
      });
    }

    const sessionPayload = await buildSessionFromAuthResult(authResponse.AuthenticationResult);

    // Portal gate: recruiters/admins only (candidates use invite links)
    const appUser = sessionPayload.profile || (await findAppUserByEmail(email));
    const role = sessionPayload.cognito.role || appUser?.role || '';

    if (!appUser && dbReady()) {
      // syncUserToPostgres should have created one; if still missing, block
      return res.status(403).json({
        success: false,
        error: 'No portal profile found for this account. Ask an admin to provision your user record.',
      });
    }

    if (role && role !== 'admin' && role !== 'recruiter') {
      return res.status(403).json({
        success: false,
        error: 'This portal is only for recruiters and admins. Candidates should use the interview or assessment link sent to them.',
      });
    }

    if (appUser?.accountStatus === 'disabled') {
      return res.status(403).json({
        success: false,
        error: 'This account has been disabled. Contact an administrator.',
      });
    }

    if (role !== 'admin' && appUser) {
      const verified =
        sessionPayload.cognito.emailVerified ||
        appUser?.adminVerified === true;
      if (!verified) {
        return res.status(403).json({
          success: false,
          error: 'Email not verified. Contact an administrator to verify your account.',
          code: 'EMAIL_NOT_VERIFIED',
        });
      }
    }

    return res.json({
      success: true,
      ...sessionPayload,
      profile: appUser
        ? {
            uid: appUser.id || appUser.uid,
            email: appUser.email,
            role: appUser.role,
            name: appUser.fullname || appUser.name || appUser.displayName,
            adminVerified: appUser.adminVerified,
            accountStatus: appUser.accountStatus,
          }
        : null,
    });
  } catch (err) {
    console.error('[auth/login]', err);
    const message = err.name === 'NotAuthorizedException'
      ? 'Incorrect email or password.'
      : err.name === 'UserNotConfirmedException'
        ? 'Account is not confirmed yet.'
        : err.message || 'Login failed.';
    return res.status(401).json({ success: false, error: message, code: err.name });
  }
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    return res.status(400).json({ success: false, error: 'refreshToken is required.' });
  }

  try {
    const authResponse = await refreshAuth(refreshToken);
    if (!authResponse.AuthenticationResult) {
      return res.status(401).json({ success: false, error: 'Refresh failed.' });
    }
    // Refresh flow may omit refresh token — keep the old one
    if (!authResponse.AuthenticationResult.RefreshToken) {
      authResponse.AuthenticationResult.RefreshToken = refreshToken;
    }
    const sessionPayload = await buildSessionFromAuthResult(authResponse.AuthenticationResult);
    return res.json({ success: true, ...sessionPayload });
  } catch (err) {
    console.error('[auth/refresh]', err);
    return res.status(401).json({ success: false, error: err.message, code: err.name });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ success: false, error: 'email is required.' });

  try {
    await forgotPassword(email);
    return res.json({
      success: true,
      message: 'If an account exists for that email, a reset code has been sent.',
    });
  } catch (err) {
    // Avoid account enumeration; still log
    console.warn('[auth/forgot-password]', err.name, err.message);
    return res.json({
      success: true,
      message: 'If an account exists for that email, a reset code has been sent.',
    });
  }
});

router.post('/confirm-forgot-password', async (req, res) => {
  const { email, code, newPassword } = req.body || {};
  if (!email || !code || !newPassword) {
    return res.status(400).json({ success: false, error: 'email, code, and newPassword are required.' });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });
  }

  try {
    await confirmForgotPassword(email, code, newPassword);
    return res.json({ success: true, message: 'Password updated. You can sign in now.' });
  } catch (err) {
    console.error('[auth/confirm-forgot-password]', err);
    return res.status(400).json({ success: false, error: err.message, code: err.name });
  }
});

/**
 * Create a Cognito user + Firebase Auth user + return uid for Firestore writes.
 * Caller must be admin (any recruiter create) OR recruiter creating a secondary under their team.
 */
router.post('/create-user', async (req, res) => {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const {
    email,
    password,
    name,
    role = 'recruiter',
    parentRecruiterId,
    teamId,
    isSecondary = false,
    designation,
    permanent = true,
  } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'email and password are required.' });
  }
  if (!['admin', 'recruiter', 'candidate'].includes(role)) {
    return res.status(400).json({ success: false, error: 'role must be admin, recruiter, or candidate.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 8 characters and meet Cognito policy (upper, lower, number).',
    });
  }

  const isAdmin = caller.role === 'admin' || caller.groups.includes('admin');
  const isRecruiter = caller.role === 'recruiter' || caller.groups.includes('recruiter');

  if (role === 'admin' && !isAdmin) {
    return res.status(403).json({ success: false, error: 'Only admins can create admin users.' });
  }

  if (!isAdmin) {
    if (!isRecruiter || role !== 'recruiter' || !isSecondary) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions to create this user.' });
    }
    const expectedParent = parentRecruiterId || teamId;
    if (!expectedParent || expectedParent !== caller.firebaseUid) {
      return res.status(403).json({
        success: false,
        error: 'Secondary recruiters must be created under your own team.',
      });
    }
  }

  try {
    const existing = await adminGetUserByEmail(email);
    if (existing) {
      return res.status(409).json({ success: false, error: 'A Cognito user with this email already exists.' });
    }

    const cognitoUser = await adminCreateUser({
      email,
      permanentPassword: permanent ? password : undefined,
      temporaryPassword: permanent ? undefined : password,
      name,
      role,
      parentRecruiterId: parentRecruiterId || undefined,
      teamId: teamId || undefined,
      suppressMessage: true,
    });

    const firebaseUid = cognitoUser.sub;

    await adminUpdateCustomAttributes(email, {
      'custom:legacyFirebaseUid': firebaseUid,
    });

    if (dbReady()) {
      await query(
        `INSERT INTO users (
          id, cognito_sub, email, role, fullname, display_name,
          account_status, admin_verified, parent_recruiter_id, team_id, is_secondary,
          designation, auth_provider
        ) VALUES ($1,$2,$3,$4,$5,$5,'active',true,$6,$7,$8,$9,'cognito')
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          fullname = COALESCE(EXCLUDED.fullname, users.fullname),
          updated_at = NOW()`,
        [
          firebaseUid,
          cognitoUser.sub,
          email,
          role,
          name || null,
          parentRecruiterId || null,
          teamId || null,
          Boolean(isSecondary),
          designation || null,
        ]
      );
    }

    return res.status(201).json({
      success: true,
      uid: firebaseUid,
      cognitoSub: cognitoUser.sub,
      email,
      role,
      name: name || '',
      parentRecruiterId: parentRecruiterId || null,
      teamId: teamId || null,
      isSecondary: Boolean(isSecondary),
      designation: designation || null,
    });
  } catch (err) {
    console.error('[auth/create-user]', err);
    return res.status(500).json({ success: false, error: err.message, code: err.name });
  }
});

/**
 * Attach a legacy Firebase UID to a Cognito user so their Postgres user id stays stable.
 */
router.post('/link-firebase-uid', async (req, res) => {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const { email, firebaseUid } = req.body || {};
  if (!email || !firebaseUid) {
    return res.status(400).json({ success: false, error: 'email and firebaseUid are required.' });
  }

  const isAdmin = caller.role === 'admin' || caller.groups.includes('admin');
  const isRecruiter = caller.role === 'recruiter' || caller.groups.includes('recruiter');
  if (!isAdmin && !isRecruiter) {
    return res.status(403).json({ success: false, error: 'Insufficient permissions.' });
  }

  try {
    await adminUpdateCustomAttributes(email, {
      'custom:legacyFirebaseUid': firebaseUid,
    });
    return res.json({ success: true, email, firebaseUid });
  } catch (err) {
    console.error('[auth/link-firebase-uid]', err);
    return res.status(500).json({ success: false, error: err.message, code: err.name });
  }
});

router.post('/set-user-status', async (req, res) => {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const isAdmin = caller.role === 'admin' || caller.groups.includes('admin');
  if (!isAdmin) {
    return res.status(403).json({ success: false, error: 'Only admins can enable/disable users.' });
  }

  const { email, enabled } = req.body || {};
  if (!email || typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, error: 'email and enabled(boolean) are required.' });
  }

  try {
    await adminSetEnabled(email, enabled);
    return res.json({ success: true, email, enabled });
  } catch (err) {
    console.error('[auth/set-user-status]', err);
    return res.status(500).json({ success: false, error: err.message, code: err.name });
  }
});

/**
 * Migrate an existing Firestore/Firebase user into Cognito while keeping the same UID.
 * Admin-only. Used by the migration script / one-off ops.
 */
router.post('/migrate-user', async (req, res) => {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  const isAdmin = caller.role === 'admin' || caller.groups.includes('admin');
  if (!isAdmin) {
    return res.status(403).json({ success: false, error: 'Only admins can migrate users.' });
  }

  const { email, password, firebaseUid, name, role } = req.body || {};
  if (!email || !password || !firebaseUid || !role) {
    return res.status(400).json({
      success: false,
      error: 'email, password, firebaseUid, and role are required.',
    });
  }

  try {
    const existing = await adminGetUserByEmail(email);
    if (existing) {
      await adminUpdateCustomAttributes(email, {
        'custom:legacyFirebaseUid': firebaseUid,
        'custom:role': role,
      });
      return res.json({
        success: true,
        alreadyExists: true,
        uid: firebaseUid,
        cognitoSub: existing.sub,
      });
    }

    const cognitoUser = await adminCreateUser({
      email,
      permanentPassword: password,
      name,
      role,
      legacyFirebaseUid: firebaseUid,
      suppressMessage: true,
    });

    return res.status(201).json({
      success: true,
      uid: firebaseUid,
      cognitoSub: cognitoUser.sub,
      email,
      role,
    });
  } catch (err) {
    console.error('[auth/migrate-user]', err);
    return res.status(500).json({ success: false, error: err.message, code: err.name });
  }
});

router.get('/me', async (req, res) => {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  return res.json({
    success: true,
    email: caller.email,
    role: caller.role,
    groups: caller.groups,
    firebaseUid: caller.firebaseUid,
    profile: caller.firestoreUser,
  });
});

export default router;
