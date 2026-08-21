import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useMessageBox } from './MessageBox';
import { 
  fetchWhatsAppStatus, 
  initiateWhatsAppConnect, 
  fetchWhatsAppQR, 
  logoutWhatsApp, 
  sendWhatsAppMessage, 
  sendWhatsAppTaskAlert,
  fetchWhatsAppAuditLogs,
  setWhatsAppCredentials,
  getStoredSessionId,
  setStoredSessionId,
  getStoredPasscode,
  setStoredPasscode,
  DEFAULT_WHATSAPP_SESSION_ID,
  DEFAULT_WHATSAPP_PASSCODE,
  WhatsAppStatusResponse, 
  WhatsAppAuditMessage,
  WHATSAPP_API_BASE_URL 
} from '../services/waSenderService';
import { 
  X, CheckCircle2, AlertTriangle, Key, ShieldCheck, 
  RotateCw, QrCode, Smartphone, Sparkles, Send, RefreshCw,
  LogOut, MessageSquare, BellRing, ListChecks, CheckCircle, Clock, Shield, Lock
} from 'lucide-react';

interface WhatsAppConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSessionId?: string;
}

export const WhatsAppConnectModal: React.FC<WhatsAppConnectModalProps> = ({ isOpen, onClose, initialSessionId }) => {
  const { user, userProfile } = useAuth();
  const { isDark } = useTheme();
  const messageBox = useMessageBox();

  const [sessionId, setSessionId] = useState<string>(() => {
    return getStoredSessionId(initialSessionId || (userProfile as any)?.whatsappSessionId);
  });

  const [passcode, setPasscode] = useState<string>(() => {
    return getStoredPasscode((userProfile as any)?.whatsappSessionPasscode);
  });

  const [isEditingSession, setIsEditingSession] = useState(false);
  const [sessionInput, setSessionInput] = useState(sessionId);
  const [passcodeInput, setPasscodeInput] = useState(passcode);

  const [activeTab, setActiveTab] = useState<'qr' | 'test' | 'logs'>('qr');
  const [status, setStatus] = useState<string>('disconnected');
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<{ name?: string; phone?: string; id?: string } | null>(null);
  const [isFetchingStatus, setIsFetchingStatus] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSyncingCredentials, setIsSyncingCredentials] = useState(false);

  // Test message states
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Hello! This is a live test notification from InterviewXpert WhatsApp Service.');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testTaskName, setTestTaskName] = useState('AI Interview Shortlist Alert');
  const [testTaskStatus, setTestTaskStatus] = useState<'SUCCESS' | 'FAILED' | 'WARNING'>('SUCCESS');
  const [isSendingTaskAlert, setIsSendingTaskAlert] = useState(false);

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState<WhatsAppAuditMessage[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync state if initialSessionId changes
  useEffect(() => {
    if (initialSessionId && initialSessionId.trim()) {
      setSessionId(initialSessionId.trim());
      setSessionInput(initialSessionId.trim());
    }
  }, [initialSessionId]);

  // Poll connection status for active session
  const checkStatus = async (silent = false, targetSession = sessionId, targetPasscode = passcode) => {
    if (!silent) setIsFetchingStatus(true);
    try {
      const res: WhatsAppStatusResponse = await fetchWhatsAppStatus(targetSession, targetPasscode);
      setStatus(res.status || 'disconnected');
      
      if (res.qrCodeDataUrl) {
        setQrCodeUrl(res.qrCodeDataUrl);
      }
      
      if (res.user || res.userInfo) {
        setUserInfo(res.userInfo || {
          name: res.user?.name,
          phone: res.user?.phone || res.user?.id?.replace(/@.*$/, ''),
          id: res.user?.id
        });
      } else {
        setUserInfo(null);
      }

      if (res.status === 'connected' || res.status === 'READY') {
        setQrCodeUrl(null);
      }
    } catch (err) {
      console.error('Error fetching WhatsApp status:', err);
    } finally {
      if (!silent) setIsFetchingStatus(false);
    }
  };

  // Trigger QR pairing handshake for this session
  const handleInitiatePairing = async () => {
    setIsConnecting(true);
    setQrCodeUrl(null);
    setStatus('connecting');

    try {
      // First check if current session is already active & authenticated
      const currentStatus = await fetchWhatsAppStatus(sessionId, passcode);
      if (currentStatus.status === 'connected' || currentStatus.status === 'READY' || currentStatus.user || currentStatus.userInfo) {
        setStatus('connected');
        setUserInfo(currentStatus.userInfo || {
          name: currentStatus.user?.name,
          phone: currentStatus.user?.phone,
          id: currentStatus.user?.id
        });
        setIsConnecting(false);
        messageBox.showSuccess(`WhatsApp session "${sessionId}" is already connected & ready!`);
        return;
      }

      const resolveQrUrl = (dataUrl?: string, rawQr?: string) => {
        if (dataUrl && dataUrl.startsWith('data:image')) return dataUrl;
        if (rawQr) return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(rawQr)}&size=300x300&margin=10`;
        return null;
      };

      const res = await initiateWhatsAppConnect(sessionId, passcode);
      const directQr = resolveQrUrl(res.qrCodeDataUrl, res.qr);
      if (directQr) {
        setQrCodeUrl(directQr);
        setStatus('qr_ready');
        setIsConnecting(false);
        return;
      }

      // If connect endpoint is not supported or returned error, re-check status
      if (res.status === 'error') {
        const fallback = await fetchWhatsAppStatus(sessionId, passcode);
        setStatus(fallback.status || 'disconnected');
        setIsConnecting(false);
        return;
      }

      // Poll for QR code until available (up to 10 attempts)
      let attempts = 0;
      const qrInterval = setInterval(async () => {
        attempts++;
        const qrRes = await fetchWhatsAppQR(sessionId, passcode);
        const foundQr = resolveQrUrl(qrRes.qrCodeDataUrl, qrRes.qr);

        if (foundQr) {
          setQrCodeUrl(foundQr);
          setStatus('qr_ready');
          setIsConnecting(false);
          clearInterval(qrInterval);
        } else if (qrRes.status === 'connected' || qrRes.status === 'READY') {
          setStatus('connected');
          setIsConnecting(false);
          clearInterval(qrInterval);
          checkStatus(true, sessionId, passcode);
        } else if (attempts >= 10 || qrRes.status === 'disconnected') {
          clearInterval(qrInterval);
          setIsConnecting(false);
          checkStatus(true, sessionId, passcode);
        }
      }, 1500);
    } catch (err: any) {
      setIsConnecting(false);
      setStatus('disconnected');
      messageBox.showError(err.message || 'Failed to initiate pairing');
    }
  };

  // Trigger Logout / Clear Session
  const handleLogoutSession = async () => {
    setIsLoggingOut(true);
    try {
      const res = await logoutWhatsApp(sessionId, passcode);
      if (res.success) {
        setStatus('disconnected');
        setQrCodeUrl(null);
        setUserInfo(null);
        messageBox.showSuccess(`WhatsApp session "${sessionId}" disconnected successfully.`);
      } else {
        messageBox.showError(res.message || 'Failed to logout session.');
      }
    } catch (err: any) {
      messageBox.showError(err.message || 'Error logging out.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Load audit logs for active session
  const loadAuditLogs = async (targetSession = sessionId, targetPasscode = passcode) => {
    setIsLoadingLogs(true);
    try {
      const res = await fetchWhatsAppAuditLogs(20, targetSession, targetPasscode);
      if (res.success) {
        setAuditLogs(res.messages || []);
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // Switch / Save session
  const handleSaveSession = async (newSession: string, newPass: string) => {
    const cleanSession = newSession.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || DEFAULT_WHATSAPP_SESSION_ID;
    const cleanPass = newPass.trim() || DEFAULT_WHATSAPP_PASSCODE;
    setSessionId(cleanSession);
    setSessionInput(cleanSession);
    setPasscode(cleanPass);
    setPasscodeInput(cleanPass);
    setStoredSessionId(cleanSession);
    setStoredPasscode(cleanPass);
    setIsEditingSession(false);
    setStatus('disconnected');
    setQrCodeUrl(null);
    setUserInfo(null);
    checkStatus(false, cleanSession, cleanPass);
    loadAuditLogs(cleanSession, cleanPass);
    messageBox.showSuccess(`Updated WhatsApp Session credentials: ${cleanSession}`);
  };

  // Sync custom credentials to Cloud Firestore / Lambda API
  const handleSyncCustomCredentials = async () => {
    if (!sessionInput.trim() || !passcodeInput.trim()) {
      messageBox.showError('Please enter both Session ID and Passcode.');
      return;
    }
    setIsSyncingCredentials(true);
    try {
      const res = await setWhatsAppCredentials(sessionInput.trim(), passcodeInput.trim(), sessionId, passcode);
      if (res.success) {
        setSessionId(res.sessionId || sessionInput.trim());
        setPasscode(res.passcode || passcodeInput.trim());
        setIsEditingSession(false);
        checkStatus(false, res.sessionId || sessionInput.trim(), res.passcode || passcodeInput.trim());
        messageBox.showSuccess('✅ WhatsApp Session credentials synchronized successfully!');
      } else {
        messageBox.showError(res.message || 'Failed to sync credentials to API.');
      }
    } catch (err: any) {
      messageBox.showError(err.message || 'Error syncing credentials.');
    } finally {
      setIsSyncingCredentials(false);
    }
  };

  // Handle Send Test Message
  const handleSendTestMessage = async () => {
    if (!testPhone.trim()) {
      messageBox.showError('Please enter a recipient phone number with country code (e.g. 919876543210).');
      return;
    }
    if (!testMessage.trim()) {
      messageBox.showError('Please enter a test message.');
      return;
    }

    setIsSendingTest(true);
    try {
      const res = await sendWhatsAppMessage(testPhone.trim(), testMessage.trim(), { sessionId });
      if (res.success) {
        messageBox.showSuccess(`🎉 WhatsApp test message sent successfully from session [${sessionId}] to ${testPhone}!`);
        loadAuditLogs(sessionId);
      } else {
        messageBox.showError(`❌ Send Failed: ${res.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      messageBox.showError(err.message || 'Error sending test message.');
    } finally {
      setIsSendingTest(false);
    }
  };

  // Handle Send Test Task Alert
  const handleSendTaskAlert = async () => {
    if (!testPhone.trim()) {
      messageBox.showError('Please enter a recipient phone number with country code.');
      return;
    }

    setIsSendingTaskAlert(true);
    try {
      const res = await sendWhatsAppTaskAlert({
        phone: testPhone.trim(),
        taskName: testTaskName,
        status: testTaskStatus,
        duration: '1m 20s',
        details: 'Candidate completed AI Technical Video Interview with score 88%.',
        sessionId
      });

      if (res.success) {
        messageBox.showSuccess(`✅ Task Alert sent successfully to ${testPhone}!`);
        loadAuditLogs(sessionId);
      } else {
        messageBox.showError(`❌ Alert Failed: ${res.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      messageBox.showError(err.message || 'Error sending task alert.');
    } finally {
      setIsSendingTaskAlert(false);
    }
  };

  // Initialize on open
  useEffect(() => {
    if (!isOpen) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    checkStatus();
    loadAuditLogs();

    // Auto-poll status every 3 seconds while modal is open
    pollTimerRef.current = setInterval(() => {
      checkStatus(true);
    }, 3000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isConnected = status === 'connected' || Boolean(userInfo);
  const isQrReady = status === 'qr_ready' || Boolean(qrCodeUrl);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className={`relative w-full max-w-xl rounded-3xl border p-6 sm:p-7 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto custom-scrollbar transition-colors ${
        isDark ? 'bg-[#0a0a0a] border-white/[0.13] text-white' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        
        {/* Modal Header */}
        <div className={`flex items-center justify-between border-b pb-4 ${isDark ? 'border-white/[0.11]' : 'border-slate-100'}`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border shadow-inner ${
              isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-600'
            }`}>
              <i className="fab fa-whatsapp text-2xl"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`font-extrabold text-lg leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>WhatsApp Integration</h3>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Serverless API
                </span>
              </div>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {WHATSAPP_API_BASE_URL}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
              isDark ? 'text-slate-400 hover:bg-white/10 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <X size={20} />
          </button>
        </div>

        {/* User Multi-Tenant Session & Passcode Bar */}
        <div className={`p-3.5 rounded-2xl border flex flex-col gap-3 text-xs transition-colors ${
          isDark ? 'bg-white/[0.03] border-white/[0.09]' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                <Key size={14} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-400">Session ID:</span>
                  <span className="font-mono font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 truncate max-w-[180px]">
                    {sessionId}
                  </span>
                  <span className="font-semibold text-slate-400 ml-1">Passcode:</span>
                  <span className="font-mono font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                    {passcode ? '••••••' : 'Not Set'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
              {!isEditingSession ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setSessionInput(sessionId);
                      setPasscodeInput(passcode);
                      setIsEditingSession(true);
                    }}
                    className={`h-7 px-2.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                      isDark ? 'border-white/10 text-slate-300 hover:bg-white/10' : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Edit Credentials
                  </button>
                  {(sessionId !== DEFAULT_WHATSAPP_SESSION_ID || passcode !== DEFAULT_WHATSAPP_PASSCODE) && (
                    <button
                      type="button"
                      onClick={() => handleSaveSession(DEFAULT_WHATSAPP_SESSION_ID, DEFAULT_WHATSAPP_PASSCODE)}
                      title="Reset to default production credentials"
                      className="h-7 px-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 text-xs font-medium cursor-pointer"
                    >
                      Reset Default
                    </button>
                  )}
                </>
              ) : null}
            </div>
          </div>

          {isEditingSession && (
            <div className={`pt-2.5 border-t flex flex-col sm:flex-row items-stretch sm:items-center gap-2 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <input
                  type="text"
                  value={sessionInput}
                  onChange={(e) => setSessionInput(e.target.value)}
                  placeholder="Session ID (e.g. interviewxpert)"
                  className={`h-8 px-2.5 rounded-lg border text-xs font-mono w-full focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                    isDark ? 'bg-[#141414] border-white/20 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <input
                  type="text"
                  value={passcodeInput}
                  onChange={(e) => setPasscodeInput(e.target.value)}
                  placeholder="Passcode (e.g. 420945)"
                  className={`h-8 px-2.5 rounded-lg border text-xs font-mono w-32 focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                    isDark ? 'bg-[#141414] border-white/20 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
              <div className="flex items-center gap-1.5 shrink-0 justify-end">
                <button
                  type="button"
                  onClick={() => handleSaveSession(sessionInput, passcodeInput)}
                  className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all cursor-pointer"
                >
                  Save Local
                </button>
                <button
                  type="button"
                  onClick={handleSyncCustomCredentials}
                  disabled={isSyncingCredentials}
                  title="Update & sync session ID and passcode to Cloud Firestore"
                  className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSyncingCredentials ? 'Syncing...' : 'Sync to API'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSessionInput(sessionId);
                    setPasscodeInput(passcode);
                    setIsEditingSession(false);
                  }}
                  className={`h-8 px-2 rounded-lg border text-xs ${
                    isDark ? 'border-white/10 text-slate-400 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Live Status Header Banner */}
        <div className={`flex items-center justify-between px-4 py-3 rounded-2xl border text-xs font-bold transition-all ${
          isConnected
            ? isDark
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-emerald-50 border-emerald-300 text-emerald-700'
            : isQrReady
            ? isDark
              ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
              : 'bg-blue-50 border-blue-300 text-blue-700'
            : isDark
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              : 'bg-amber-50 border-amber-300 text-amber-700'
        }`}>
          <div className="flex items-center gap-2.5">
            {isConnected ? (
              <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
            ) : (
              <AlertTriangle size={18} className={isQrReady ? 'text-blue-500 shrink-0' : 'text-amber-500 shrink-0'} />
            )}
            <span className="truncate">
              {isConnected
                ? `Connected: ${userInfo?.name || 'Linked WhatsApp Account'} (${userInfo?.phone || userInfo?.id || 'Active'})`
                : isQrReady
                ? 'QR Code Ready — Scan with WhatsApp on your phone'
                : status === 'connecting'
                ? 'Connecting — Initializing QR handshake...'
                : 'WhatsApp Disconnected — Ready to link'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => checkStatus(false)}
              disabled={isFetchingStatus}
              title="Refresh status"
              className="p-1 hover:opacity-80 transition-opacity"
            >
              <RotateCw size={13} className={isFetchingStatus ? 'animate-spin' : ''} />
            </button>
            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${isConnected ? 'bg-emerald-500 animate-pulse' : isQrReady ? 'bg-blue-500 animate-pulse' : 'bg-amber-500'}`} />
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className={`flex border-b text-xs font-semibold gap-1 ${isDark ? 'border-white/[0.11]' : 'border-slate-200'}`}>
          <button
            type="button"
            onClick={() => setActiveTab('qr')}
            className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'qr'
                ? 'border-emerald-500 text-emerald-500 font-bold'
                : isDark
                ? 'border-transparent text-slate-400 hover:text-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <QrCode size={14} />
            <span>QR Pairing</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('test')}
            className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'test'
                ? 'border-emerald-500 text-emerald-500 font-bold'
                : isDark
                ? 'border-transparent text-slate-400 hover:text-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Send size={14} />
            <span>Test Messaging</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('logs');
              loadAuditLogs();
            }}
            className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'logs'
                ? 'border-emerald-500 text-emerald-500 font-bold'
                : isDark
                ? 'border-transparent text-slate-400 hover:text-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <ListChecks size={14} />
            <span>Delivery Logs</span>
          </button>
        </div>

        {/* TAB 1: QR CODE PAIRING */}
        {activeTab === 'qr' && (
          <div className="space-y-4">
            {isConnected ? (
              <div className={`rounded-2xl border p-6 text-center space-y-4 ${
                isDark ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-emerald-50/70 border-emerald-200'
              }`}>
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto shadow-md">
                  <CheckCircle2 size={36} />
                </div>
                <div>
                  <h4 className={`font-bold text-lg ${isDark ? 'text-emerald-300' : 'text-emerald-800'}`}>WhatsApp is Active & Connected</h4>
                  <p className={`text-xs mt-1 max-w-md mx-auto ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Your WhatsApp account is linked and ready. Candidate interview invitations and task completion alerts will be dispatched automatically.
                  </p>
                </div>

                {userInfo && (
                  <div className={`inline-flex flex-col sm:flex-row items-center gap-2 px-4 py-2 rounded-xl border text-xs font-mono font-semibold ${
                    isDark ? 'bg-[#141414] border-emerald-500/20 text-emerald-400' : 'bg-white border-emerald-200 text-emerald-700'
                  }`}>
                    <span>Name: <strong>{userInfo.name || 'WhatsApp Account'}</strong></span>
                    {userInfo.phone && <span>• Phone: <strong>+{userInfo.phone}</strong></span>}
                  </div>
                )}

                <div className="pt-3 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleInitiatePairing}
                    disabled={isConnecting}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
                  >
                    <RotateCw size={13} className={isConnecting ? 'animate-spin' : ''} />
                    <span>Re-pair / New QR Code</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLogoutSession}
                    disabled={isLoggingOut}
                    className={`px-4 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                      isDark 
                        ? 'border-red-500/30 text-red-400 hover:bg-red-500/10' 
                        : 'border-red-200 text-red-600 hover:bg-red-50'
                    } disabled:opacity-50`}
                  >
                    <LogOut size={13} className={isLoggingOut ? 'animate-spin' : ''} />
                    <span>{isLoggingOut ? 'Logging out...' : 'Disconnect WhatsApp'}</span>
                  </button>
                </div>
              </div>
            ) : (isQrReady || isConnecting || status === 'connecting') ? (
              <div className="space-y-4">
                <div className={`flex flex-col items-center justify-center p-6 rounded-2xl border text-center space-y-4 relative ${
                  isDark ? 'bg-white/[0.02] border-white/[0.11]' : 'bg-slate-50 border-slate-200'
                }`}>
                  {qrCodeUrl ? (
                    <div className="relative group">
                      <div className="p-3 bg-white rounded-2xl shadow-2xl border border-gray-200 inline-block">
                        <img
                          src={qrCodeUrl}
                          alt="WhatsApp QR Code"
                          className="w-52 h-52 object-contain rounded-xl"
                        />
                      </div>
                      <div className={`mt-2.5 text-[11px] font-medium flex items-center justify-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        <Sparkles size={12} className="text-emerald-500" />
                        <span>Point your phone camera to pair WhatsApp</span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-10 px-6 flex flex-col items-center justify-center space-y-3">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center animate-spin">
                        <RotateCw size={24} />
                      </div>
                      <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        Generating QR Code handshake...
                      </span>
                    </div>
                  )}

                  {/* Steps Guide */}
                  <div className={`text-left w-full rounded-xl p-4 border text-xs space-y-2 ${
                    isDark ? 'bg-[#141414] border-white/[0.11]' : 'bg-white border-slate-200'
                  }`}>
                    <div className={`font-bold flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      <Smartphone size={15} className="text-emerald-500" />
                      <span>Steps to Link WhatsApp:</span>
                    </div>
                    <ol className={`list-decimal list-inside space-y-1 leading-relaxed pl-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      <li>Open <strong>WhatsApp</strong> on your smartphone.</li>
                      <li>Tap <strong>Menu (⋮)</strong> on Android or <strong>Settings (⚙️)</strong> on iOS.</li>
                      <li>Tap <strong>Linked Devices</strong> &rarr; tap <strong>Link a Device</strong>.</li>
                      <li>Scan the <strong>QR Code</strong> shown above.</li>
                    </ol>
                  </div>

                  <div className="flex w-full gap-2">
                    <button
                      type="button"
                      onClick={handleInitiatePairing}
                      disabled={isConnecting}
                      className="flex-1 h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50 cursor-pointer"
                    >
                      <RotateCw size={13} className={isConnecting ? 'animate-spin' : ''} />
                      <span>Refresh / New QR</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleLogoutSession}
                      disabled={isLoggingOut}
                      className={`h-10 px-4 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                        isDark ? 'border-white/[0.11] text-slate-300 hover:bg-white/10' : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className={`rounded-2xl border p-6 text-center space-y-5 ${
                isDark ? 'bg-white/[0.02] border-white/[0.11]' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center mx-auto shadow-md ${
                  isDark ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-600'
                }`}>
                  <QrCode size={34} />
                </div>
                
                <div>
                  <h4 className={`font-bold text-lg ${isDark ? 'text-white' : 'text-slate-900'}`}>Pair Your WhatsApp Account</h4>
                  <p className={`text-xs mt-1 max-w-sm mx-auto leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Connect your WhatsApp number with the serverless API to send instant automated interview invites and alerts to candidates.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleInitiatePairing}
                  disabled={isConnecting}
                  className="w-full py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-extrabold transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-600/25 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50"
                >
                  <QrCode size={18} />
                  <span>{isConnecting ? 'Generating QR Code...' : 'Generate WhatsApp QR Code'}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LIVE TEST MESSAGING */}
        {activeTab === 'test' && (
          <div className="space-y-4">
            <div className={`p-4 rounded-2xl border space-y-3.5 ${
              isDark ? 'bg-white/[0.02] border-white/[0.11]' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-emerald-500" />
                <h4 className="text-xs font-bold uppercase tracking-wider">Test Message Dispatch</h4>
              </div>

              <div>
                <label className={`text-[11px] font-semibold block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Recipient Phone (Country Code without + or spaces, e.g. 919876543210)
                </label>
                <input
                  type="text"
                  placeholder="919876543210"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className={`w-full h-9 px-3 text-xs font-mono rounded-xl border outline-none transition-colors ${
                    isDark ? 'bg-[#141414] border-white/[0.15] text-white focus:border-emerald-500' : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                  }`}
                />
              </div>

              <div>
                <label className={`text-[11px] font-semibold block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Custom Message Content
                </label>
                <textarea
                  rows={2}
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className={`w-full p-2.5 text-xs rounded-xl border outline-none resize-none transition-colors ${
                    isDark ? 'bg-[#141414] border-white/[0.15] text-white focus:border-emerald-500' : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                  }`}
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSendTestMessage}
                  disabled={isSendingTest}
                  className="flex-1 h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
                >
                  <Send size={13} className={isSendingTest ? 'animate-spin' : ''} />
                  <span>{isSendingTest ? 'Sending...' : 'Send Custom Message'}</span>
                </button>
              </div>
            </div>

            {/* Task Alert Pre-formatted Sender */}
            <div className={`p-4 rounded-2xl border space-y-3 ${
              isDark ? 'bg-white/[0.02] border-white/[0.11]' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center gap-2">
                <BellRing size={16} className="text-emerald-500" />
                <h4 className="text-xs font-bold uppercase tracking-wider">Send Pre-Formatted Task Alert</h4>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={`text-[11px] font-semibold block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Task Name
                  </label>
                  <input
                    type="text"
                    value={testTaskName}
                    onChange={(e) => setTestTaskName(e.target.value)}
                    className={`w-full h-8 px-2.5 text-xs rounded-xl border outline-none ${
                      isDark ? 'bg-[#141414] border-white/[0.15] text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
                <div>
                  <label className={`text-[11px] font-semibold block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Status
                  </label>
                  <select
                    value={testTaskStatus}
                    onChange={(e) => setTestTaskStatus(e.target.value as any)}
                    className={`w-full h-8 px-2.5 text-xs rounded-xl border outline-none ${
                      isDark ? 'bg-[#141414] border-white/[0.15] text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="SUCCESS">SUCCESS (✅)</option>
                    <option value="FAILED">FAILED (❌)</option>
                    <option value="WARNING">WARNING (⚠️)</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSendTaskAlert}
                disabled={isSendingTaskAlert}
                className="w-full h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
              >
                <BellRing size={13} className={isSendingTaskAlert ? 'animate-spin' : ''} />
                <span>{isSendingTaskAlert ? 'Dispatching Alert...' : 'Send Formatted Task Alert'}</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: DELIVERY AUDIT LOGS */}
        {activeTab === 'logs' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Recent Messages Outbox ({auditLogs.length})
              </span>
              <button
                type="button"
                onClick={loadAuditLogs}
                disabled={isLoadingLogs}
                className="text-xs text-emerald-500 font-bold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <RefreshCw size={12} className={isLoadingLogs ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>

            <div className={`rounded-2xl border divide-y overflow-hidden max-h-72 overflow-y-auto custom-scrollbar ${
              isDark ? 'bg-[#141414] border-white/[0.11] divide-white/[0.08]' : 'bg-white border-slate-200 divide-slate-100'
            }`}>
              {isLoadingLogs ? (
                <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <RotateCw size={14} className="animate-spin" />
                  <span>Loading delivery logs...</span>
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No sent messages found in delivery log.
                </div>
              ) : (
                auditLogs.map((log, idx) => (
                  <div key={log.id || idx} className="p-3 flex items-center justify-between text-xs hover:bg-white/[0.02]">
                    <div className="space-y-0.5 min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-emerald-400">+{log.recipient}</span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                          log.status === 'delivered'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : log.status === 'failed'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        }`}>
                          {log.status}
                        </span>
                      </div>
                      {log.message && (
                        <p className={`text-[11px] truncate max-w-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {log.message}
                        </p>
                      )}
                    </div>
                    <div className={`text-[10px] text-right shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      {log.createdAt ? new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className={`flex items-center justify-between pt-3 border-t ${isDark ? 'border-white/[0.11]' : 'border-slate-100'}`}>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-500 font-semibold">
            <Shield size={13} />
            <span>Encrypted WhatsApp Session</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`h-9 px-5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
              isDark ? 'border-white/[0.11] text-slate-300 hover:bg-white/10 hover:text-white' : 'border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};

export default WhatsAppConnectModal;
