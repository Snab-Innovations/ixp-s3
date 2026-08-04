import React, { useState, useEffect, useRef } from 'react';
import { X, ExternalLink, CheckCircle2, AlertTriangle, QrCode, RefreshCw, Loader2, Key, Smartphone, ShieldCheck, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { rds } from '../services/rdsApi';
import { useMessageBox } from './MessageBox';

interface WhatsAppCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const WA_API_BASE = 'https://whatsapp-sending-api.onrender.com';

export default function WhatsAppCredentialsModal({
  isOpen,
  onClose,
  onSuccess
}: WhatsAppCredentialsModalProps) {
  const { user, userProfile, setUserProfile } = useAuth();
  const messageBox = useMessageBox();

  const [activeTab, setActiveTab] = useState<'qr' | 'manual'>('qr');
  
  // QR & Auto Session state
  const [qrLoading, setQrLoading] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [activePasscode, setActivePasscode] = useState('');
  const [sessionStatus, setSessionStatus] = useState<string>('DISCONNECTED');
  const [statusMessage, setStatusMessage] = useState<string>('');
  
  // Manual form state
  const [manualSessionId, setManualSessionId] = useState('');
  const [manualPasscode, setManualPasscode] = useState('');
  const [saving, setSaving] = useState(false);

  // Prevent auto-save loops
  const autoSavedRef = useRef<boolean>(false);

  // Initialize modal state on open
  useEffect(() => {
    if (!isOpen) return;

    autoSavedRef.current = false;

    const existingSessionId = userProfile?.whatsappSessionId || '';
    const existingPasscode = userProfile?.whatsappSessionPasscode || '';

    setManualSessionId(existingSessionId);
    setManualPasscode(existingPasscode);

    if (existingSessionId && existingPasscode) {
      setActiveSessionId(existingSessionId);
      setActivePasscode(existingPasscode);
      // Check existing session status
      checkSessionStatus(existingSessionId, existingPasscode);
    } else {
      // No existing session, generate new QR session automatically
      generateNewQRSession();
    }
  }, [isOpen, userProfile]);

  // Poll for QR & Status when session active
  useEffect(() => {
    if (!isOpen || !activeSessionId || !activePasscode) return;

    const interval = setInterval(() => {
      checkSessionStatus(activeSessionId, activePasscode);
    }, 2500);

    return () => clearInterval(interval);
  }, [isOpen, activeSessionId, activePasscode]);

  // Generate new session & QR from backend
  const generateNewQRSession = async () => {
    setQrLoading(true);
    setQrCodeUrl(null);
    setSessionStatus('INITIALIZING');
    setStatusMessage('Connecting to WhatsApp QR Engine...');
    autoSavedRef.current = false;

    try {
      const res = await fetch(`${WA_API_BASE}/api/auth/new-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();

      if (data.success && data.sessionId && data.passcode) {
        setActiveSessionId(data.sessionId);
        setActivePasscode(data.passcode);
        setManualSessionId(data.sessionId);
        setManualPasscode(data.passcode);
        setStatusMessage(data.message || 'Session created! Generating QR Code...');
        // Immediately fetch status for QR
        await checkSessionStatus(data.sessionId, data.passcode);
      } else {
        throw new Error(data.message || 'Failed to create new session');
      }
    } catch (err: any) {
      console.error('Error creating WhatsApp session:', err);
      setSessionStatus('ERROR');
      setStatusMessage('Server is starting up or unreachable. Click to retry.');
    } finally {
      setQrLoading(false);
    }
  };

  // Check current session status & QR code from API
  const checkSessionStatus = async (sessId: string, pass: string) => {
    if (!sessId || !pass) return;

    try {
      const res = await fetch(`${WA_API_BASE}/api/status`, {
        headers: {
          'x-session-id': sessId,
          'x-session-passcode': pass
        }
      });
      const data = await res.json();

      if (data) {
        const currentStatus = data.status || 'INITIALIZING';
        setSessionStatus(currentStatus);

        if (data.qrCodeDataUrl) {
          setQrCodeUrl(data.qrCodeDataUrl);
          setQrLoading(false);
        }

        // Handle Status States
        if (currentStatus === 'READY' || currentStatus === 'AUTHENTICATED') {
          setQrCodeUrl(null);
          setStatusMessage('WhatsApp session is active & ready!');

          // Auto-save credentials to DB if not saved yet
          if (!autoSavedRef.current && (userProfile?.whatsappSessionId !== sessId || userProfile?.whatsappSessionPasscode !== pass)) {
            autoSavedRef.current = true;
            await saveCredentialsToProfile(sessId, pass, true);
          }
        } else if (currentStatus === 'QR_READY') {
          setStatusMessage('Scan QR Code with your WhatsApp camera');
        } else if (currentStatus === 'INITIALIZING') {
          setStatusMessage('Initializing WhatsApp engine...');
        }
      }
    } catch (err) {
      console.error('Error fetching session status:', err);
    }
  };

  // Save session credentials to RDS profile
  const saveCredentialsToProfile = async (sessId: string, pass: string, isAutoSave = false) => {
    if (!user?.uid) return;

    setSaving(true);
    try {
      const payload = {
        whatsappSessionId: sessId.trim(),
        whatsappSessionPasscode: pass.trim()
      };

      await Promise.all([
        rds.putProfile(user.uid, payload),
        rds.updateUser(user.uid, payload)
      ]);

      if (setUserProfile && userProfile) {
        setUserProfile({
          ...userProfile,
          ...payload
        });
      }

      if (isAutoSave) {
        messageBox.showSuccess('🎉 WhatsApp connected & saved successfully!');
      } else {
        messageBox.showSuccess('✅ WhatsApp API Credentials saved and connected!');
      }

      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Error saving WhatsApp credentials:', err);
      if (!isAutoSave) {
        messageBox.showError(`Failed to save WhatsApp credentials: ${err.message || 'Error occurred'}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualSessionId.trim() || !manualPasscode.trim()) {
      messageBox.showError('Please enter both WhatsApp Session ID & Passcode.');
      return;
    }
    await saveCredentialsToProfile(manualSessionId, manualPasscode, false);
    onClose();
  };

  const handleDisconnect = async () => {
    if (!user?.uid) return;
    try {
      // Optional call to server logout
      fetch(`${WA_API_BASE}/api/logout`, {
        method: 'POST',
        headers: {
          'x-session-id': activeSessionId,
          'x-session-passcode': activePasscode
        }
      }).catch(() => null);

      const payload = {
        whatsappSessionId: '',
        whatsappSessionPasscode: ''
      };

      await Promise.all([
        rds.putProfile(user.uid, payload),
        rds.updateUser(user.uid, payload)
      ]);

      if (setUserProfile && userProfile) {
        setUserProfile({
          ...userProfile,
          ...payload
        });
      }

      setActiveSessionId('');
      setActivePasscode('');
      setManualSessionId('');
      setManualPasscode('');
      setQrCodeUrl(null);
      setSessionStatus('DISCONNECTED');
      autoSavedRef.current = false;
      messageBox.showSuccess('WhatsApp session disconnected.');
    } catch (err: any) {
      console.error('Disconnect error:', err);
    }
  };

  if (!isOpen) return null;

  const isConnected = Boolean(userProfile?.whatsappSessionId && userProfile?.whatsappSessionPasscode && (sessionStatus === 'READY' || sessionStatus === 'AUTHENTICATED'));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#121319] border border-slate-200 dark:border-white/[0.14] rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5 text-slate-900 dark:text-white">
        
        {/* Top Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.964 9.964 0 001.333 4.993L2 22l5.233-1.237a9.96 9.96 0 004.779 1.221h.004c5.505 0 9.988-4.478 9.989-9.984 0-2.669-1.038-5.178-2.925-7.064A9.927 9.927 0 0012.012 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">WhatsApp Integration</h3>
              <p className="text-xs text-slate-500 dark:text-gray-400">Link your WhatsApp to send interview invites directly</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Indicator Bar */}
        {isConnected ? (
          <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-3.5 flex items-center justify-between text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>WhatsApp Session Active & Connected</span>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
          </div>
        ) : sessionStatus === 'AUTHENTICATED' || sessionStatus === 'READY' ? (
          <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-3.5 flex items-center justify-between text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Session Authenticated! Saving credentials...</span>
            </div>
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600 dark:text-emerald-400" />
          </div>
        ) : (
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3.5 flex items-center justify-between text-xs font-semibold text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>WhatsApp Disconnected (Scan QR or enter session keys)</span>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse" />
          </div>
        )}

        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-[#181a24] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs font-medium">
          <button
            onClick={() => setActiveTab('qr')}
            className={`py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
              activeTab === 'qr'
                ? 'bg-emerald-600 text-white font-semibold shadow-md'
                : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Scan QR Code</span>
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
              activeTab === 'manual'
                ? 'bg-emerald-600 text-white font-semibold shadow-md'
                : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Manual Credentials</span>
          </button>
        </div>

        {/* TAB 1: Scan QR Code View */}
        {activeTab === 'qr' && (
          <div className="space-y-4">
            <div className="bg-slate-50 dark:bg-[#181a24] border border-slate-200 dark:border-white/[0.08] rounded-xl p-4 flex flex-col items-center justify-center min-h-[220px] text-center space-y-3">
              
              {qrLoading ? (
                <div className="py-8 space-y-3 flex flex-col items-center">
                  <Loader2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 animate-spin" />
                  <p className="text-xs text-slate-700 dark:text-gray-300 font-medium">Creating unique WhatsApp session...</p>
                </div>
              ) : qrCodeUrl ? (
                <div className="space-y-3 flex flex-col items-center">
                  <div className="p-3 bg-white rounded-2xl shadow-xl border border-slate-200 dark:border-white/20">
                    <img src={qrCodeUrl} alt="WhatsApp QR Code" className="w-48 h-48 object-contain rounded-lg" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-ping" />
                      <span>Ready to scan!</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-gray-400">
                      Open WhatsApp on phone &gt; Settings &gt; Linked Devices &gt; Link a Device
                    </p>
                  </div>
                </div>
              ) : isConnected ? (
                <div className="py-6 space-y-3 flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-300 dark:border-emerald-500/40">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Your WhatsApp is Linked & Ready</h4>
                  <p className="text-xs text-slate-500 dark:text-gray-400 max-w-xs">
                    You can send direct WhatsApp messages to candidates from any interview or assessment page.
                  </p>
                </div>
              ) : (
                <div className="py-6 space-y-3 flex flex-col items-center">
                  <Smartphone className="w-8 h-8 text-slate-400 dark:text-gray-500" />
                  <p className="text-xs text-slate-700 dark:text-gray-300">{statusMessage || 'Click below to generate a new QR Code'}</p>
                </div>
              )}

              {/* Action Buttons for QR */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={generateNewQRSession}
                  disabled={qrLoading}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-xs text-slate-700 dark:text-gray-200 hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${qrLoading ? 'animate-spin' : ''}`} />
                  <span>{qrCodeUrl ? 'Refresh QR Code' : 'Generate QR Code'}</span>
                </button>
                {isConnected && (
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="px-3.5 py-1.5 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-xs text-red-600 dark:text-red-400 transition-colors flex items-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Manual Credentials Input */}
        {activeTab === 'manual' && (
          <form onSubmit={handleManualSave} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
                <span>🔗</span> WhatsApp Session ID
              </label>
              <input
                type="text"
                value={manualSessionId}
                onChange={(e) => setManualSessionId(e.target.value)}
                placeholder="Enter Session ID (e.g. sess_msec13vv_df8eb249)"
                className="w-full bg-slate-50 dark:bg-[#121319] border border-slate-200 dark:border-white/[0.14] rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
                <span>🛡️</span> WhatsApp Session Passcode
              </label>
              <input
                type="text"
                value={manualPasscode}
                onChange={(e) => setManualPasscode(e.target.value)}
                placeholder="Enter Session Passcode (e.g. 967675)"
                className="w-full bg-slate-50 dark:bg-[#121319] border border-slate-200 dark:border-white/[0.14] rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
              />
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-2">
              {isConnected ? (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="px-3.5 py-1.5 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-xs text-red-600 dark:text-red-400 transition-colors flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </button>
              ) : <div />}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl transition-all shadow-lg shadow-emerald-900/30 flex items-center gap-2"
                >
                  <span>{saving ? 'Saving...' : 'Save Credentials'}</span>
                </button>
              </div>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
