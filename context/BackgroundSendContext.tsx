import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { sendInterviewInvitations } from '../services/brevoService';
import { sendInterviewWhatsAppInvite, formatPhoneForWhatsApp, WhatsAppInviteOptions } from '../services/waSenderService';

export interface BackgroundTask {
  id: string;
  jobTitle: string;
  isReminder: boolean;
  totalCandidates: number;
  sentCount: number;
  failedCount: number;
  statusMessage: string;
  isWaiting: boolean;
  waitTimeSec?: number;
  isComplete: boolean;
  errors: string[];
}

export interface StartBackgroundTaskOptions {
  candidates: Array<{ email: string; phone?: string; name?: string }>;
  jobTitle: string;
  interviewLink: string;
  accessCode: string;
  isReminder?: boolean;
  sendEmailChannel?: boolean;
  sendWhatsAppChannel?: boolean;
  options?: WhatsAppInviteOptions;
  waMinDelay?: number;
  waMaxDelay?: number;
  waDelayUnit?: 'sec' | 'min';
}

interface PersistedJobTask {
  id: string;
  opts: StartBackgroundTaskOptions;
  currentIndex: number;
  totalSent: number;
  totalFailed: number;
  taskErrors: string[];
  emailSent: boolean;
}

const STORAGE_KEY = 'interviewxpert_active_bg_tasks';

function savePersistedTasks(tasksMap: Record<string, PersistedJobTask>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasksMap));
  } catch (e) {
    console.error('[BackgroundSend] Error saving tasks to localStorage:', e);
  }
}

function getPersistedTasks(): Record<string, PersistedJobTask> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('[BackgroundSend] Error reading tasks from localStorage:', e);
    return {};
  }
}

function removePersistedTask(taskId: string) {
  const current = getPersistedTasks();
  delete current[taskId];
  savePersistedTasks(current);
}

interface BackgroundSendContextType {
  activeTasks: BackgroundTask[];
  startBackgroundSend: (opts: StartBackgroundTaskOptions) => string;
  dismissTask: (taskId: string) => void;
}

const BackgroundSendContext = createContext<BackgroundSendContextType | undefined>(undefined);

export const BackgroundSendProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  // Helper to execute task sending loop with resumption support
  const runTaskLoop = async (
    taskId: string,
    opts: StartBackgroundTaskOptions,
    initialIndex = 0,
    initialSent = 0,
    initialFailed = 0,
    initialErrors: string[] = [],
    initialEmailSent = false
  ) => {
    let totalSent = initialSent;
    let totalFailed = initialFailed;
    const taskErrors = [...initialErrors];
    let emailSent = initialEmailSent;

    const updateTaskState = (patch: Partial<BackgroundTask>) => {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t));
    };

    const updatePersistedState = (index: number) => {
      const current = getPersistedTasks();
      current[taskId] = {
        id: taskId,
        opts,
        currentIndex: index,
        totalSent,
        totalFailed,
        taskErrors,
        emailSent
      };
      savePersistedTasks(current);
    };

    try {
      // Exclude candidates who have already completed the interview
      let completedEmailsSet = new Set<string>();
      try {
        const interviewId = opts.interviewLink?.split('/interview/')?.[1]?.split('?')?.[0];
        if (interviewId) {
          const attemptsSnap = await getDocs(collection(db, 'interviews', interviewId, 'attempts'));
          attemptsSnap.docs.forEach(d => {
            const data = d.data();
            const email = (data?.candidateInfo?.email || '').toLowerCase();
            if (email) completedEmailsSet.add(email);
          });
        }
      } catch (e) {
        console.warn('[BackgroundSend] Could not fetch completed candidates:', e);
      }

      const pendingCandidates = opts.candidates.filter(c => {
        const lower = (c.email || '').toLowerCase();
        return !lower || !completedEmailsSet.has(lower);
      });

      const validEmails = pendingCandidates
        .map(c => c.email)
        .filter(e => !!e && !e.endsWith('@whatsapp.local'));

      // 1. Send Email Invitations/Reminders if not already sent before reload
      if (opts.sendEmailChannel && validEmails.length > 0 && !emailSent) {
        updateTaskState({
          statusMessage: `Sending ${validEmails.length} email ${opts.isReminder ? 'reminder' : 'invitation'}(s)...`
        });

        const emailRes = await sendInterviewInvitations(
          validEmails,
          opts.jobTitle,
          opts.interviewLink,
          opts.accessCode,
          !!opts.isReminder,
          opts.options as any
        );

        emailSent = true;
        if (emailRes.success) {
          totalSent += emailRes.totalEmails;
        } else {
          taskErrors.push(`Email error: ${emailRes.error || 'Failed to send emails'}`);
        }
        updatePersistedState(initialIndex);
      }

      // 2. Send WhatsApp Invitations/Reminders starting from initialIndex (pending candidates only)
      const candidatesWithPhones = pendingCandidates.filter(c => !!c.phone && c.phone !== 'N/A' && c.phone.trim() !== '');

      if (opts.sendWhatsAppChannel && candidatesWithPhones.length > 0) {
        const multiplier = opts.waDelayUnit === 'min' ? 60 * 1000 : 1000;
        const minMs = Math.max(1000, (opts.waMinDelay || 15) * multiplier);
        const maxMs = Math.max(minMs, (opts.waMaxDelay || 25) * multiplier);

        for (let i = initialIndex; i < candidatesWithPhones.length; i++) {
          const candidate = candidatesWithPhones[i];
          const candidateDisplayName = candidate.name || candidate.email?.split('@')[0] || candidate.phone;

          updateTaskState({
            sentCount: i + 1,
            isWaiting: false,
            statusMessage: `📱 Sending WhatsApp ${opts.isReminder ? 'reminder' : 'invite'} ${i + 1}/${candidatesWithPhones.length} to ${candidateDisplayName}...`
          });

          const formattedPhone = formatPhoneForWhatsApp(candidate.phone || '');
          if (formattedPhone) {
            const waRes = await sendInterviewWhatsAppInvite({
              phone: formattedPhone,
              candidateName: candidateDisplayName,
              jobTitle: opts.jobTitle,
              interviewLink: opts.interviewLink,
              accessCode: opts.accessCode,
              isReminder: !!opts.isReminder,
              options: opts.options
            });

            if (waRes.success) {
              totalSent++;
            } else {
              totalFailed++;
              if (waRes.error) taskErrors.push(`${candidate.phone}: ${waRes.error}`);
            }
          }

          updatePersistedState(i + 1);

          // Anti-spam random pause before sending to next candidate
          if (i < candidatesWithPhones.length - 1) {
            const randomDelayMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
            const delaySec = Math.round(randomDelayMs / 1000);

            updateTaskState({
              isWaiting: true,
              waitTimeSec: delaySec,
              statusMessage: `⏳ Sent WhatsApp to ${candidateDisplayName} (${i + 1}/${candidatesWithPhones.length}). Waiting ${delaySec}s random delay (${opts.waMinDelay || 15}-${opts.waMaxDelay || 25} ${opts.waDelayUnit || 'sec'}) before next message...`
            });

            await new Promise(resolve => setTimeout(resolve, randomDelayMs));
          }
        }
      }

      removePersistedTask(taskId);

      updateTaskState({
        isComplete: true,
        isWaiting: false,
        sentCount: totalSent,
        failedCount: totalFailed,
        errors: taskErrors,
        statusMessage: `✅ Bulk ${opts.isReminder ? 'reminders' : 'invitations'} for "${opts.jobTitle}" complete! (${totalSent} sent)`
      });

    } catch (err: any) {
      console.error('[BackgroundSend] Error executing bulk send:', err);
      updateTaskState({
        isComplete: true,
        isWaiting: false,
        errors: [err.message || 'Background sending failed.'],
        statusMessage: `❌ Bulk send failed for "${opts.jobTitle}": ${err.message || 'Unknown error'}`
      });
    }
  };

  const wakeLockRef = useRef<any>(null);

  // Request/release Screen Wake Lock while background tasks are actively running
  useEffect(() => {
    const hasActiveTask = tasks.some(t => !t.isComplete);

    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && !wakeLockRef.current) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          console.log('[BackgroundSend] Screen Wake Lock activated (preventing system sleep).');
          wakeLockRef.current.addEventListener('release', () => {
            wakeLockRef.current = null;
          });
        } catch (err) {
          console.warn('[BackgroundSend] Screen Wake Lock request failed:', err);
        }
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        } catch (e) {
          console.warn('[BackgroundSend] Error releasing Wake Lock:', e);
        }
      }
    };

    if (hasActiveTask) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
  }, [tasks]);

  // Restore and auto-resume pending tasks from localStorage on refresh or wake from sleep
  useEffect(() => {
    const restorePendingTasks = () => {
      const persistedMap = getPersistedTasks();
      const taskIds = Object.keys(persistedMap);

      if (taskIds.length === 0) return;

      taskIds.forEach(id => {
        const persisted = persistedMap[id];
        if (!persisted || !persisted.opts) return;

        // Avoid re-running if task is already running in memory
        setTasks(prev => {
          if (prev.some(t => t.id === id && !t.isComplete)) return prev;

          const restoredTask: BackgroundTask = {
            id: persisted.id,
            jobTitle: persisted.opts.jobTitle,
            isReminder: !!persisted.opts.isReminder,
            totalCandidates: persisted.opts.candidates.length,
            sentCount: persisted.currentIndex,
            failedCount: persisted.totalFailed,
            statusMessage: `🔄 Auto-resuming bulk ${persisted.opts.isReminder ? 'reminders' : 'invitations'} for "${persisted.opts.jobTitle}" (Candidate ${persisted.currentIndex}/${persisted.opts.candidates.length})...`,
            isWaiting: false,
            isComplete: false,
            errors: persisted.taskErrors || []
          };

          // Resume execution loop from saved index
          runTaskLoop(
            persisted.id,
            persisted.opts,
            persisted.currentIndex,
            persisted.totalSent,
            persisted.totalFailed,
            persisted.taskErrors,
            persisted.emailSent
          );

          return [restoredTask, ...prev];
        });
      });
    };

    restorePendingTasks();

    // Re-check when laptop wakes up or Wi-Fi reconnects
    const handleWakeOrOnline = () => {
      restorePendingTasks();
    };

    window.addEventListener('online', handleWakeOrOnline);
    window.addEventListener('focus', handleWakeOrOnline);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') handleWakeOrOnline();
    });

    return () => {
      window.removeEventListener('online', handleWakeOrOnline);
      window.removeEventListener('focus', handleWakeOrOnline);
    };
  }, []);

  const startBackgroundSend = (opts: StartBackgroundTaskOptions): string => {
    const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);

    const initialTask: BackgroundTask = {
      id: taskId,
      jobTitle: opts.jobTitle,
      isReminder: !!opts.isReminder,
      totalCandidates: opts.candidates.length,
      sentCount: 0,
      failedCount: 0,
      statusMessage: `Preparing ${opts.isReminder ? 'reminders' : 'invitations'} for ${opts.candidates.length} candidate(s)...`,
      isWaiting: false,
      isComplete: false,
      errors: []
    };

    setTasks(prev => [initialTask, ...prev]);

    // Save initial state to localStorage
    const current = getPersistedTasks();
    current[taskId] = {
      id: taskId,
      opts,
      currentIndex: 0,
      totalSent: 0,
      totalFailed: 0,
      taskErrors: [],
      emailSent: false
    };
    savePersistedTasks(current);

    // Asynchronously run bulk send process
    runTaskLoop(taskId, opts);

    return taskId;
  };

  const dismissTask = (taskId: string) => {
    removePersistedTask(taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  return (
    <BackgroundSendContext.Provider value={{ activeTasks: tasks, startBackgroundSend, dismissTask }}>
      {children}

      {/* Floating Background Send Progress Widget */}
      {tasks.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[99999] max-w-md w-[calc(100vw-2rem)] sm:w-96 shadow-2xl rounded-xl border border-white/20 bg-gray-950/95 text-white backdrop-blur-md overflow-hidden transition-all duration-300">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                {tasks.some(t => !t.isComplete) ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                )}
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-white">
                {tasks.some(t => !t.isComplete) ? 'Background Sending Active' : 'Bulk Tasks Finished'}
              </span>
              {tasks.some(t => !t.isComplete) && (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono flex items-center gap-1" title="Screen Wake Lock is active to prevent system sleep while sending messages">
                  ☕ Sleep Lock Active
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsMinimized(prev => !prev)}
                className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 text-xs font-bold"
                title={isMinimized ? 'Expand' : 'Minimize'}
              >
                {isMinimized ? '▲ Expand' : '▼ Minimize'}
              </button>
            </div>
          </div>

          {!isMinimized && (
            <div className="p-3 max-h-60 overflow-y-auto space-y-2.5 divide-y divide-white/10 text-xs">
              {tasks.map(task => (
                <div key={task.id} className="pt-2 first:pt-0 space-y-1.5">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-white truncate max-w-[200px]" title={task.jobTitle}>
                      {task.jobTitle}
                    </span>
                    {task.isComplete ? (
                      <button
                        type="button"
                        onClick={() => dismissTask(task.id)}
                        className="text-[10px] text-gray-400 hover:text-white underline cursor-pointer"
                      >
                        Dismiss
                      </button>
                    ) : (
                      <span className="text-[10px] text-emerald-400 font-mono">Running...</span>
                    )}
                  </div>

                  <p className="text-[11px] text-gray-300 leading-snug">
                    {task.statusMessage}
                  </p>

                  {!task.isComplete && (
                    <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(10, (task.sentCount / (task.totalCandidates || 1)) * 100))}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </BackgroundSendContext.Provider>
  );
};

export const useBackgroundSend = () => {
  const context = useContext(BackgroundSendContext);
  if (!context) {
    throw new Error('useBackgroundSend must be used within a BackgroundSendProvider');
  }
  return context;
};
