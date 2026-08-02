import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Code2,
  FileCheck2,
  Gauge,
  Plus,
  RefreshCcw,
  Save,
  Video,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useMessageBox } from '../components/MessageBox';
import { useCompanyRateLimits } from '../hooks/useRecruiterRateLimits';
import {
  CompanyRateLimits,
  EMPTY_RATE_LIMIT_USAGE,
  PRIMARY_RATE_LIMITS,
  RateLimitResource,
  loadCompanyRawUsage,
  saveCompanyRateLimits,
} from '../services/rateLimitService';
import { useAuth } from '../context/AuthContext';

const RESOURCE_META: Array<{
  key: RateLimitResource;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  background: string;
}> = [
  {
    key: 'interviews',
    label: 'Interviews',
    description: 'Interview attempts submitted by candidates across every recruiter.',
    icon: Video,
    color: 'text-blue-500',
    background: 'bg-blue-500/10',
  },
  {
    key: 'assessments',
    label: 'Assessments',
    description: 'Aptitude assessments submitted by candidates across the company.',
    icon: FileCheck2,
    color: 'text-emerald-500',
    background: 'bg-emerald-500/10',
  },
  {
    key: 'codingAssessments',
    label: 'Coding exams',
    description: 'Coding exams submitted by candidates across the company.',
    icon: Code2,
    color: 'text-violet-500',
    background: 'bg-violet-500/10',
  },
];

const normalizeInput = (value: string, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
};

const AdminRateLimiting: React.FC = () => {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const messageBox = useMessageBox();
  const { user } = useAuth();
  const { status, loading, error, refresh } = useCompanyRateLimits();
  const [draftLimits, setDraftLimits] = useState<Record<RateLimitResource, string>>({
    interviews: String(PRIMARY_RATE_LIMITS.interviews),
    assessments: String(PRIMARY_RATE_LIMITS.assessments),
    codingAssessments: String(PRIMARY_RATE_LIMITS.codingAssessments),
  });
  const [topUps, setTopUps] = useState<Record<RateLimitResource, string>>({
    interviews: '',
    assessments: '',
    codingAssessments: '',
  });
  const [saving, setSaving] = useState(false);
  const [topUpSaving, setTopUpSaving] = useState<RateLimitResource | null>(null);
  const reconciliationStarted = useRef(false);

  useEffect(() => {
    if (!status) return;
    setDraftLimits({
      interviews: String(status.limits.interviews),
      assessments: String(status.limits.assessments),
      codingAssessments: String(status.limits.codingAssessments),
    });
  }, [status]);

  const saveDocument = async (data: Record<string, unknown>) => {
    const payload: Record<string, unknown> = { ...data, scope: 'company', updatedBy: user?.uid || null };
    // Flatten resource limit fields when present at top level
    if (typeof data.interviews === 'number') payload.interviews = data.interviews;
    if (typeof data.assessments === 'number') payload.assessments = data.assessments;
    if (typeof data.codingAssessments === 'number') payload.codingAssessments = data.codingAssessments;
    await saveCompanyRateLimits(payload);
  };

  useEffect(() => {
    if (!status || reconciliationStarted.current) return;
    reconciliationStarted.current = true;
    const reconcileFromHistory = async () => {
      try {
        const rawUsage = await loadCompanyRawUsage();
        if (!status.initialized) {
          await saveDocument({
            ...status.limits,
            usage: rawUsage,
            usageBaseline: EMPTY_RATE_LIMIT_USAGE,
            topUps: status.topUps,
            initializedAt: new Date().toISOString(),
          });
          await refresh();
          return;
        }

        const reconciledUsage: CompanyRateLimits = {
          interviews: Math.max(status.usage.interviews, rawUsage.interviews - status.usageBaseline.interviews),
          assessments: Math.max(status.usage.assessments, rawUsage.assessments - status.usageBaseline.assessments),
          codingAssessments: Math.max(status.usage.codingAssessments, rawUsage.codingAssessments - status.usageBaseline.codingAssessments),
        };
        const usageChanged = (Object.keys(reconciledUsage) as RateLimitResource[])
          .some(resource => reconciledUsage[resource] !== status.usage[resource]);
        if (usageChanged) {
          await saveDocument({ usage: reconciledUsage });
          await refresh();
        }
      } catch (reconciliationError) {
        reconciliationStarted.current = false;
        console.error('Unable to reconcile company limits:', reconciliationError);
        messageBox.showError(
          reconciliationError instanceof Error
            ? reconciliationError.message
            : 'Unable to reconcile rate limits from candidate activity.'
        );
      }
    };
    void reconcileFromHistory();
  }, [status]);

  const savePrimaryLimits = async () => {
    setSaving(true);
    try {
      const nextLimits: CompanyRateLimits = {
        interviews: normalizeInput(draftLimits.interviews, PRIMARY_RATE_LIMITS.interviews),
        assessments: normalizeInput(draftLimits.assessments, PRIMARY_RATE_LIMITS.assessments),
        codingAssessments: normalizeInput(draftLimits.codingAssessments, PRIMARY_RATE_LIMITS.codingAssessments),
      };
      await saveDocument({ ...nextLimits });
      await refresh();
      messageBox.showSuccess('Company limits updated for all recruiters.');
    } catch (saveError) {
      console.error('Unable to save company limits:', saveError);
      messageBox.showError('Unable to update the company limits.');
    } finally {
      setSaving(false);
    }
  };

  const addTopUp = async (resource: RateLimitResource) => {
    const amount = normalizeInput(topUps[resource]);
    if (!amount) {
      messageBox.showWarning('Enter a top-up amount greater than zero.');
      return;
    }

    setTopUpSaving(resource);
    try {
      const latest = await refresh();
      if (!latest) throw new Error('Rate limit status is unavailable');
      await saveDocument({
        [resource]: latest.limits[resource] + amount,
        topUps: {
          ...latest.topUps,
          [resource]: latest.topUps[resource] + amount,
        },
      });
      setTopUps(current => ({ ...current, [resource]: '' }));
      await refresh();
      messageBox.showSuccess(`${amount.toLocaleString()} ${resource === 'interviews' ? 'interviews' : resource === 'assessments' ? 'assessments' : 'coding exams'} added.`);
    } catch (topUpError) {
      console.error('Unable to add top-up:', topUpError);
      messageBox.showError('Unable to add the top-up.');
    } finally {
      setTopUpSaving(null);
    }
  };

  const resetCompanyCycle = () => {
    messageBox.showConfirm(
      'Reset usage to zero and restore the primary limits (2,500 interviews, 5 assessments, and 2 coding exams)? Historical reports will not be deleted.',
      async () => {
        try {
          const rawUsage = await loadCompanyRawUsage();
          await saveDocument({
            ...PRIMARY_RATE_LIMITS,
            usage: EMPTY_RATE_LIMIT_USAGE,
            usageBaseline: rawUsage,
            topUps: EMPTY_RATE_LIMIT_USAGE,
            lastResetAt: new Date().toISOString(),
          });
          await refresh();
          messageBox.showSuccess('Company limit cycle reset successfully.');
        } catch (resetError) {
          console.error('Unable to reset company limits:', resetError);
          messageBox.showError('Unable to reset the company limits.');
        }
      },
    );
  };

  const limits = status?.limits || PRIMARY_RATE_LIMITS;
  const usage = status?.usage || EMPTY_RATE_LIMIT_USAGE;
  const currentTopUps = status?.topUps || EMPTY_RATE_LIMIT_USAGE;

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#050505] text-white' : 'bg-gray-50 text-gray-900'}`}>
      <header className={`sticky top-0 z-30 border-b px-4 py-4 backdrop-blur-xl sm:px-6 ${isDark ? 'border-white/10 bg-[#050505]/90' : 'border-gray-200 bg-white/90'}`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate('/admin')} className="rounded-lg p-2 transition hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Back to admin dashboard">
              <ArrowLeft size={19} />
            </button>
            <div>
              <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl"><Gauge className="text-blue-500" size={20} /> Rate Limiting</h1>
              <p className="hidden text-xs text-gray-500 sm:block">One shared quota pool for every recruiter in the company.</p>
            </div>
          </div>
          <button type="button" onClick={resetCompanyCycle} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 text-xs font-semibold text-red-500 transition hover:bg-red-500/15 disabled:opacity-50">
            <RefreshCcw size={14} /> Reset cycle
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
        {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-500">{error}</div>}

        <section>
          <div className="mb-3">
            <h2 className="text-lg font-semibold">Shared company usage</h2>
            <p className="mt-1 text-sm text-gray-500">Every recruiter consumes from the same limits below.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {RESOURCE_META.map(item => {
              const used = usage[item.key];
              const limit = limits[item.key];
              const remaining = Math.max(0, limit - used);
              const percent = limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
              const reached = used >= limit;
              return (
                <article key={item.key} className="rounded-xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#0a0a0a]">
                  <div className="flex items-start justify-between gap-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.background} ${item.color}`}><item.icon size={19} /></div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${reached ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
                      {reached ? 'Limit reached' : `${remaining.toLocaleString()} remaining`}
                    </span>
                  </div>
                  <h3 className="mt-5 font-semibold">{item.label}</h3>
                  <div className="mt-2 flex items-end gap-2">
                    <span className="text-3xl font-bold tabular-nums">{used.toLocaleString()}</span>
                    <span className="pb-1 text-sm text-gray-500">of {limit.toLocaleString()} used</span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                    <div className={`h-full rounded-full ${reached ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${percent}%` }} />
                  </div>
                  <p className="mt-3 text-xs leading-5 text-gray-500">{item.description}</p>
                  {currentTopUps[item.key] > 0 && <p className="mt-2 text-xs font-medium text-blue-500">Includes +{currentTopUps[item.key].toLocaleString()} top-up</p>}
                </article>
              );
            })}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#0a0a0a] sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Primary limits</h2>
                <p className="mt-1 text-sm text-gray-500">Defaults are 2,500 interviews, 5 assessments, and 2 coding exams.</p>
              </div>
              <CheckCircle2 className="text-emerald-500" size={20} />
            </div>
            <div className="mt-5 space-y-4">
              {RESOURCE_META.map(item => (
                <label key={item.key} className="block">
                  <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">{item.label} maximum</span>
                  <input type="number" min="0" step="1" value={draftLimits[item.key]} onChange={event => setDraftLimits(current => ({ ...current, [item.key]: event.target.value }))} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-white/10 dark:bg-[#111]" />
                </label>
              ))}
            </div>
            <button type="button" onClick={savePrimaryLimits} disabled={saving || loading} className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200">
              <Save size={15} /> {saving ? 'Saving limits...' : 'Save primary limits'}
            </button>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#0a0a0a] sm:p-6">
            <div>
              <h2 className="font-semibold">Add top-up capacity</h2>
              <p className="mt-1 text-sm text-gray-500">Add custom capacity without resetting current usage.</p>
            </div>
            <div className="mt-5 space-y-4">
              {RESOURCE_META.map(item => (
                <div key={item.key}>
                  <label htmlFor={`top-up-${item.key}`} className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">Add {item.label.toLowerCase()}</label>
                  <div className="flex gap-2">
                    <input id={`top-up-${item.key}`} type="number" min="1" step="1" value={topUps[item.key]} onChange={event => setTopUps(current => ({ ...current, [item.key]: event.target.value }))} placeholder="Custom amount" className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-white/10 dark:bg-[#111]" />
                    <button type="button" onClick={() => addTopUp(item.key)} disabled={topUpSaving !== null || loading} className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-4 text-sm font-semibold text-blue-600 transition hover:bg-blue-500/15 disabled:opacity-50 dark:text-blue-400">
                      <Plus size={15} /> {topUpSaving === item.key ? 'Adding' : 'Add'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs leading-5 text-gray-500 dark:border-white/10 dark:bg-white/[0.03]">
              Reset cycle restores the primary 2,500 / 5 / 2 limits and starts usage from zero. Historical interview and assessment records remain untouched.
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default AdminRateLimiting;
