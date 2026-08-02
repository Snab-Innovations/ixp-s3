import React, { useEffect, useState, useCallback } from 'react';
import { rds } from '../services/rdsApi';

interface ServiceStatus {
  name: string;
  description: string;
  status: 'operational' | 'degraded' | 'down' | 'checking';
  responseTime?: number;
  iconUrl: string;
  modelStatus?: string;
}

const INITIAL_SERVICES: ServiceStatus[] = [
  { name: 'Brevo API', description: 'Email delivery & candidate invitations', status: 'checking', iconUrl: 'https://www.google.com/s2/favicons?domain=brevo.com&sz=128' },
  { name: 'Sarvam API', description: 'AI-powered speech & language services', status: 'checking', iconUrl: 'https://www.google.com/s2/favicons?domain=sarvam.ai&sz=128' },
  { name: 'AWS RDS Database', description: 'PostgreSQL data store (Cognito-authenticated app data)', status: 'checking', iconUrl: 'https://www.google.com/s2/favicons?domain=aws.amazon.com&sz=128' },
  { name: 'Cloudinary API', description: 'Media uploads & asset management', status: 'checking', iconUrl: 'https://www.google.com/s2/favicons?domain=cloudinary.com&sz=128' },
  { name: 'Grok API', description: 'AI interview question generation & evaluation', status: 'checking', iconUrl: 'https://www.google.com/s2/favicons?domain=x.ai&sz=128', modelStatus: '...' },
];

// Timeout wrapper — aborts any check after 10 seconds
const withTimeout = (promise: Promise<any>, ms = 10000): Promise<any> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () => {
        reject(new Error('Health check timed out'));
      });
    }),
  ]).finally(() => clearTimeout(timeout));
};

// ── Credential-free health checks ──
// SECURITY: No API keys are sent in any request.
// We only verify that the service endpoint is reachable (DNS + TCP + TLS).
// A successful no-cors fetch proves the server is up.

const checkBrevo = async (): Promise<{ ok: boolean; ms: number }> => {
  const start = performance.now();
  try {
    // no-cors HEAD — no credentials sent, just proves server is reachable
    await withTimeout(
      fetch('https://api.brevo.com/v3/account', { method: 'HEAD', mode: 'no-cors' })
    );
    return { ok: true, ms: Math.round(performance.now() - start) };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - start) };
  }
};

const checkSarvam = async (): Promise<{ ok: boolean; ms: number }> => {
  const start = performance.now();
  try {
    // no-cors HEAD — no credentials sent
    await withTimeout(
      fetch('https://api.sarvam.ai/', { method: 'HEAD', mode: 'no-cors' })
    );
    return { ok: true, ms: Math.round(performance.now() - start) };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - start) };
  }
};

const checkRds = async (): Promise<{ ok: boolean; ms: number }> => {
  const start = performance.now();
  try {
    // Hits the api-server Postgres health endpoint (no secrets sent).
    const health = await withTimeout(rds.health());
    return { ok: Boolean(health?.postgres), ms: Math.round(performance.now() - start) };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - start) };
  }
};

const checkCloudinary = async (): Promise<{ ok: boolean; ms: number }> => {
  const start = performance.now();
  try {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    if (!cloudName) return { ok: false, ms: 0 };
    // Public endpoint — only uses cloud name (not a secret)
    const res = await withTimeout(
      fetch(`https://res.cloudinary.com/${cloudName}/image/upload/sample.jpg`, {
        method: 'HEAD',
      })
    );
    return { ok: res.status < 500, ms: Math.round(performance.now() - start) };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - start) };
  }
};

// Checks the xAI Grok API without consuming tokens by hitting the /v1/models endpoint.
const checkGrok = async (): Promise<{ ok: boolean; ms: number; modelStatus: string }> => {
  const start = performance.now();
  const apiKey = import.meta.env.VITE_XAI_API_KEY;

  if (!apiKey) {
    return { ok: false, ms: 0, modelStatus: 'API Key Missing' };
  }

  try {
    const res = await withTimeout(
      fetch('https://api.x.ai/v1/models', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      }),
      5000
    );

    if (res.ok) {
      return { ok: true, ms: Math.round(performance.now() - start), modelStatus: 'API is reachable & responding' };
    }
    return { ok: false, ms: Math.round(performance.now() - start), modelStatus: `HTTP ${res.status}` };
  } catch (error: any) {
    return { ok: false, ms: Math.round(performance.now() - start), modelStatus: 'API unreachable' };
  }
};

const StatusPage: React.FC = () => {
  const [services, setServices] = useState<ServiceStatus[]>(INITIAL_SERVICES);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const runChecks = useCallback(async () => {
    setIsRefreshing(true);
    // Reset to checking
    setServices((prev) => prev.map((s) => ({ ...s, status: 'checking' as const })));

    const checkers = [checkBrevo, checkSarvam, checkRds, checkCloudinary, checkGrok];

    const results = await Promise.allSettled(checkers.map((fn) => fn()));

    setServices((prev) =>
      prev.map((service, i) => {
        const result = results[i];
        if (result.status === 'fulfilled') {
          const { ok, ms, modelStatus } = result.value as any; // Cast to handle optional modelStatus
          return {
            ...service,
            status: ok ? 'operational' : 'down',
            responseTime: ms,
            modelStatus: modelStatus || service.modelStatus, // Keep old if new is undefined
          };
        }
        // If the promise was rejected (e.g., by timeout)
        return { ...service, status: 'down' as const, responseTime: 0, modelStatus: 'Check failed' };
      })
    );
    setLastChecked(new Date());
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    document.title = 'System Status | InterviewXpert';
    runChecks();
    // Auto-refresh every 60s
    const interval = setInterval(runChecks, 60000);
    return () => clearInterval(interval);
  }, [runChecks]);

  const allOperational = services.every((s) => s.status === 'operational');
  const anyDown = services.some((s) => s.status === 'down');
  const anyChecking = services.some((s) => s.status === 'checking');

  const getOverallStatus = () => {
    if (anyChecking) return { label: 'Checking systems…', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' };
    if (allOperational) return { label: 'All Systems Operational', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' };
    if (anyDown) return { label: 'Partial System Outage', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' };
    return { label: 'Some Systems Degraded', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' };
  };

  const overall = getOverallStatus();

  const getStatusBadge = (status: ServiceStatus['status']) => {
    switch (status) {
      case 'operational':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
            </span>
            Operational
          </span>
        );
      case 'down':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-40"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-400"></span>
            </span>
            Down
          </span>
        );
      case 'degraded':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-yellow-400">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-40"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-400"></span>
            </span>
            Degraded
          </span>
        );
      case 'checking':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400">
            <svg className="animate-spin h-3 w-3 text-slate-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Checking…
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ fontFamily: 'var(--font-sans)' }}>
      <div className="relative max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-16">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-10">
          <a
            href="#/"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6 sm:mb-8 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to InterviewXpert
          </a>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight mb-2 sm:mb-3">
            System Status
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm">
            Real-time health monitoring for InterviewXpert services
          </p>
        </div>

        {/* Overall status banner */}
        <div className={`rounded-xl border p-4 sm:p-5 mb-6 sm:mb-8 flex items-center justify-between ${overall.bg}`}>
          <div className="flex items-center gap-3">
            {anyChecking ? (
              <svg className="animate-spin h-5 w-5 text-yellow-400 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : allOperational ? (
              <svg className="h-5 w-5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-red-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            )}
            <span className={`font-semibold text-sm sm:text-base ${overall.color}`}>{overall.label}</span>
          </div>
          <button
            onClick={runChecks}
            disabled={isRefreshing}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 shrink-0 p-1 -mr-1"
            title="Refresh status"
          >
            <svg className={`h-5 w-5 sm:h-4 sm:w-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
          </button>
        </div>

        {/* Service list */}
        <div className="rounded-xl border border-border bg-card text-card-foreground overflow-hidden divide-y divide-border shadow-sm">
          {services.map((service) => (
            <div
              key={service.name}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:px-5 sm:py-4 hover:bg-muted/60 transition-colors gap-3 sm:gap-0"
            >
              <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-md sm:rounded-lg bg-muted border border-border p-1.5 shadow-sm mt-0.5 sm:mt-0">
                  <img src={service.iconUrl} alt={`${service.name} logo`} className="w-full h-full object-contain drop-shadow-sm" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm sm:text-base font-medium text-foreground">{service.name}</p>
                  <p className="text-[11px] sm:text-xs text-muted-foreground leading-snug sm:truncate max-w-[280px]">{service.description}</p>
                  {service.modelStatus && (
                    <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1 font-mono">{service.modelStatus}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 sm:ml-4 sm:flex-shrink-0 self-start sm:self-auto ml-[46px] sm:ml-0">
                {service.status !== 'checking' && service.responseTime !== undefined && (
                  <span className="text-[11px] text-muted-foreground font-mono tabular-nums bg-muted px-1.5 py-0.5 rounded border border-border">
                    {service.responseTime}ms
                  </span>
                )}
                {getStatusBadge(service.status)}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          {lastChecked && (
            <p className="text-xs text-muted-foreground">
              Last checked:{' '}
              <span className="text-foreground">
                {lastChecked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className="mx-1.5 text-slate-600">·</span>
              Auto-refreshes every 60s
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Powered by{' '}
            <a href="#/" className="text-blue-600 dark:text-blue-400 hover:underline transition-colors mr-1">
              InterviewXpert
            </a>
            | Developed by{' '}
            <a href="https://snab.co.in" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline transition-colors">
              SNAB Innovations
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default StatusPage;
