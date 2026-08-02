import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Bug,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  UserRound,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import {
  confirmPasswordReset,
  loginWithCognito,
  requestPasswordReset,
} from '../services/authService';
import { rds } from '../services/rdsApi';
import { useAuth } from '../context/AuthContext';
import '../styles/auth.css';

type AuthMode = 'login' | 'signup' | 'reset' | 'reset-confirm' | 'new-password';

const AuthPage: React.FC = () => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showVerifyErrorPopup, setShowVerifyErrorPopup] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [challengeSession, setChallengeSession] = useState<string | null>(null);
  const [fullname, setFullname] = useState('');
  const [experience, setExperience] = useState(0);
  const [rememberMe, setRememberMe] = useState(true);
  const navigate = useNavigate();
  const { setSessionUser } = useAuth();

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
    setMessage(null);
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const result = await loginWithCognito(email, password, { rememberMe });

      if (result.challenge === 'NEW_PASSWORD_REQUIRED') {
        setChallengeSession(result.session || null);
        setMode('new-password');
        setMessage('Your temporary password must be changed before continuing.');
        return;
      }

      const role = result.profile?.role;
      if (role && role !== 'recruiter' && role !== 'admin') {
        setError(
          'This Dsauce portal is only for recruiters and admins. Candidates should use the interview or assessment link sent to them.'
        );
        return;
      }

      if (result.profile) {
        setSessionUser(
          {
            uid: result.profile.uid || result.firebaseUid || '',
            email: result.profile.email || email,
            displayName: result.profile.name || null,
          },
          result.profile as any
        );
      }

      navigate('/');
    } catch (err: any) {
      if (err.code === 'EMAIL_NOT_VERIFIED' || err.status === 403 && String(err.message || '').includes('not verified')) {
        setShowVerifyErrorPopup(true);
        return;
      }
      setError(`Login failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleNewPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!challengeSession) {
      setError('Missing password-challenge session. Sign in again.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await loginWithCognito(email, password, {
        rememberMe,
        newPassword,
        session: challengeSession,
      });
      setChallengeSession(null);
      navigate('/');
    } catch (err: any) {
      setError(`Password update failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await rds.createRecruiterRequest({
        email,
        fullname,
        experience: Number(experience),
      });
      setMessage(
        'Request sent! An admin will review your recruiter access request and create your account once approved.'
      );
      setMode('login');
    } catch (err: any) {
      setError(`Request failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await requestPasswordReset(email);
      setMessage('If an account exists for that email, a reset code has been sent. Enter the code below.');
      setMode('reset-confirm');
    } catch (err: any) {
      setError(`Reset failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await confirmPasswordReset(email, resetCode, newPassword);
      setMessage('Password updated. You can sign in with your new password.');
      setPassword('');
      setNewPassword('');
      setResetCode('');
      setMode('login');
    } catch (err: any) {
      setError(`Reset confirmation failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const title =
    mode === 'reset' || mode === 'reset-confirm'
      ? 'Reset password'
      : mode === 'new-password'
        ? 'Set new password'
        : mode === 'login'
          ? 'Sign in'
          : 'Request access';

  const description =
    mode === 'reset'
      ? 'Enter your email and we’ll send a Cognito reset code.'
      : mode === 'reset-confirm'
        ? 'Enter the code from your email and choose a new password.'
        : mode === 'new-password'
          ? 'Choose a permanent password for your Cognito account.'
          : mode === 'login'
            ? 'Access the Dsauce recruiter and admin portal.'
            : 'Share your details for recruiter account approval.';

  return (
    <main className="ix-auth-page">
      <section className="ix-auth-form-panel" aria-label={`${title} form`}>
        <header className="ix-auth-brand">
          <Link to="/" aria-label="InterviewXpert home">
            <img src="/logo-partnership-dark.png" alt="InterviewXpert and DSource" />
          </Link>
        </header>

        <div className="ix-auth-form-wrap">
          <div className="ix-auth-heading">
            <p className="ix-auth-section-label">Secure portal · Amazon Cognito</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>

          {(error || message) && (
            <div className={`ix-auth-alert ${error ? 'is-error' : 'is-success'}`} role="status">
              {error ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
              <span>{error || message}</span>
            </div>
          )}

          {mode === 'reset' ? (
            <form onSubmit={handleResetPassword} className="ix-auth-form">
              <AuthField
                id="reset-email"
                label="Email address"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={setEmail}
                icon={<Mail size={18} />}
                autoComplete="email"
              />
              <SubmitButton loading={loading} loadingLabel="Sending code…">
                Send reset code
              </SubmitButton>
              <button
                type="button"
                className="ix-auth-text-button ix-auth-back-button"
                onClick={() => switchMode('login')}
              >
                <ArrowLeft size={15} /> Back to sign in
              </button>
            </form>
          ) : mode === 'reset-confirm' ? (
            <form onSubmit={handleConfirmReset} className="ix-auth-form">
              <AuthField
                id="reset-code"
                label="Reset code"
                type="text"
                placeholder="Code from email"
                value={resetCode}
                onChange={setResetCode}
                icon={<LockKeyhole size={18} />}
                autoComplete="one-time-code"
              />
              <AuthField
                id="reset-new-password"
                label="New password"
                type={showPassword ? 'text' : 'password'}
                placeholder="At least 8 chars, upper, lower, number"
                value={newPassword}
                onChange={setNewPassword}
                icon={<LockKeyhole size={18} />}
                autoComplete="new-password"
                minLength={8}
                trailing={
                  <button
                    type="button"
                    className="ix-auth-password-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />
              <SubmitButton loading={loading} loadingLabel="Updating…">
                Update password
              </SubmitButton>
              <button
                type="button"
                className="ix-auth-text-button ix-auth-back-button"
                onClick={() => switchMode('login')}
              >
                <ArrowLeft size={15} /> Back to sign in
              </button>
            </form>
          ) : mode === 'new-password' ? (
            <form onSubmit={handleNewPassword} className="ix-auth-form">
              <AuthField
                id="permanent-password"
                label="New permanent password"
                type={showPassword ? 'text' : 'password'}
                placeholder="At least 8 chars, upper, lower, number"
                value={newPassword}
                onChange={setNewPassword}
                icon={<LockKeyhole size={18} />}
                autoComplete="new-password"
                minLength={8}
                trailing={
                  <button
                    type="button"
                    className="ix-auth-password-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />
              <SubmitButton loading={loading} loadingLabel="Saving…">
                Save and continue
              </SubmitButton>
            </form>
          ) : (
            <form onSubmit={mode === 'login' ? handleLogin : handleSignup} className="ix-auth-form">
              {mode === 'signup' && (
                <>
                  <AuthField
                    id="full-name"
                    label="Full name"
                    type="text"
                    placeholder="Your full name"
                    value={fullname}
                    onChange={setFullname}
                    icon={<UserRound size={18} />}
                    autoComplete="name"
                  />
                  <AuthField
                    id="experience"
                    label="Experience (years)"
                    type="number"
                    value={String(experience)}
                    onChange={(value) => setExperience(Number(value))}
                    icon={<BriefcaseBusiness size={18} />}
                    min="0"
                  />
                </>
              )}

              <AuthField
                id="email"
                label="Email address"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={setEmail}
                icon={<Mail size={18} />}
                autoComplete="email"
              />

              {mode === 'login' && (
                <>
                  <AuthField
                    id="password"
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={setPassword}
                    icon={<LockKeyhole size={18} />}
                    autoComplete="current-password"
                    minLength={8}
                    trailing={
                      <button
                        type="button"
                        className="ix-auth-password-toggle"
                        onClick={() => setShowPassword((current) => !current)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    }
                  />

                  <div className="ix-auth-options">
                    <label className="ix-auth-checkbox">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(event) => setRememberMe(event.target.checked)}
                      />
                      <span className="ix-auth-checkbox-mark" aria-hidden="true">
                        <Check size={12} />
                      </span>
                      <span>Remember me</span>
                    </label>
                    <button type="button" className="ix-auth-text-button" onClick={() => switchMode('reset')}>
                      Forgot password?
                    </button>
                  </div>
                </>
              )}

              <SubmitButton loading={loading} loadingLabel="Processing…">
                {mode === 'login' ? 'Sign in' : 'Submit request'}
              </SubmitButton>

              <p className="ix-auth-switch">
                {mode === 'login' ? 'Need recruiter access?' : 'Already have portal access?'}
                <button type="button" onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}>
                  {mode === 'login' ? 'Request it' : 'Sign in'}
                </button>
              </p>
            </form>
          )}
        </div>

        <footer className="ix-auth-footer">
          <div>
            <Link to="/contact">
              <Mail size={14} /> Support
            </Link>
            <Link to="/report-bug">
              <Bug size={14} /> Report issue
            </Link>
          </div>
          <p>© {new Date().getFullYear()} InterviewXpert</p>
        </footer>
      </section>

      <aside className="ix-auth-visual" aria-label="InterviewXpert hiring platform">
        <img src="/assets/auth-architecture.png" alt="Monochrome modern architecture" />
        <div className="ix-auth-visual-shade" />
        <div className="ix-auth-visual-copy">
          <p>Structured hiring, without the noise.</p>
          <h2>
            <span>Better interviews.</span>
            <span>Clearer decisions.</span>
          </h2>
          <span>
            Manage recruiter access, interviews, assessments, and candidate outcomes from one secure
            workspace.
          </span>
          <a
            className="ix-auth-maintainer"
            href="https://snab.co.in"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>Managed and maintained by</span>
            <strong>SNAB Innovations</strong>
          </a>
        </div>
        <div className="ix-auth-visual-index" aria-hidden="true">
          <span>01</span>
          <i />
        </div>
      </aside>

      {showVerifyErrorPopup && (
        <AuthModal
          tone="error"
          title="Email not verified"
          description="Verify your email before signing in. Check your inbox and spam folder, or contact support to have an admin review your account."
          primaryLabel="Go to contact form"
          primaryTo="/contact"
          onClose={() => setShowVerifyErrorPopup(false)}
        />
      )}
    </main>
  );
};

interface AuthFieldProps {
  id: string;
  label: string;
  type: React.HTMLInputTypeAttribute;
  value: string;
  onChange: (value: string) => void;
  icon: React.ReactNode;
  placeholder?: string;
  autoComplete?: string;
  min?: string;
  minLength?: number;
  trailing?: React.ReactNode;
}

const AuthField: React.FC<AuthFieldProps> = ({ id, label, icon, trailing, onChange, ...inputProps }) => (
  <div className="ix-auth-field">
    <label htmlFor={id}>{label}</label>
    <div className="ix-auth-input-wrap">
      <span className="ix-auth-input-icon" aria-hidden="true">
        {icon}
      </span>
      <input id={id} required onChange={(event) => onChange(event.target.value)} {...inputProps} />
      {trailing}
    </div>
  </div>
);

const SubmitButton: React.FC<{ loading: boolean; loadingLabel: string; children: React.ReactNode }> = ({
  loading,
  loadingLabel,
  children,
}) => (
  <button type="submit" className="ix-auth-submit no-saas-gradient" disabled={loading}>
    <span>{loading ? loadingLabel : children}</span>
    {!loading && <ArrowRight size={18} />}
  </button>
);

interface AuthModalProps {
  tone: 'success' | 'error';
  title: string;
  description: string;
  primaryLabel: string;
  primaryTo?: string;
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({
  tone,
  title,
  description,
  primaryLabel,
  primaryTo,
  onClose,
}) => (
  <div className="ix-auth-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
    <div className={`ix-auth-modal is-${tone}`}>
      <div className="ix-auth-modal-icon">
        {tone === 'success' ? <CheckCircle2 size={26} /> : <AlertCircle size={26} />}
      </div>
      <h2 id="auth-modal-title">{title}</h2>
      <p>{description}</p>
      {primaryTo ? (
        <Link to={primaryTo} className="ix-auth-modal-primary">
          {primaryLabel}
        </Link>
      ) : (
        <button type="button" className="ix-auth-modal-primary" onClick={onClose}>
          {primaryLabel}
        </button>
      )}
      {primaryTo && (
        <button type="button" className="ix-auth-modal-cancel" onClick={onClose}>
          Cancel
        </button>
      )}
    </div>
  </div>
);

export default AuthPage;
