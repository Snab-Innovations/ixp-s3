import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useMessageBox } from './MessageBox';
import { fetchWhatsAppStatus, WhatsAppStatusResponse } from '../services/waSenderService';
import { 
  X, CheckCircle2, AlertTriangle, Key, ShieldCheck, 
  RotateCw, QrCode, Smartphone, Sparkles, ChevronDown, ChevronUp, Copy, Check
} from 'lucide-react';

interface WhatsAppConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WhatsAppConnectModal: React.FC<WhatsAppConnectModalProps> = ({ isOpen, onClose }) => {
  const { user, userProfile, refreshProfile } = useAuth();
  const { isDark } = useTheme();
  const messageBox = useMessageBox();

  const [sessionId, setSessionId] = useState('');
  const [sessionPasscode, setSessionPasscode] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('INITIALIZING');
  const [userInfo, setUserInfo] = useState<{ name?: string; phone?: string; id?: string } | null>(null);
  const [isFetchingStatus, setIsFetchingStatus] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showManualInputs, setShowManualInputs] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);

  const isAutoSavedRef = useRef(false);

  // Generate new random session credentials
  const generateNewCredentials = () => {
    const randomStr = Math.random().toString(36).substring(2, 8);
    const newSessionId = `sess_${Date.now()}_${randomStr}`;
    const newPasscode = Math.floor(100000 + Math.random() * 900000).toString();
    return { newSessionId, newPasscode };
  };

  // Save session credentials to Firestore
  const saveCredentialsToFirestore = async (sid: string, spass: string, quiet = false) => {
    if (!user || !sid.trim() || !spass.trim()) return;

    try {
      setIsSaving(true);
      const updatedData = {
        whatsappSessionId: sid.trim(),
        whatsappSessionPasscode: spass.trim(),
        whatsappConnectedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const userRef = doc(db, 'users', user.uid);
      const profileRef = doc(db, 'profiles', user.uid);

      await updateDoc(userRef, updatedData).catch(() => setDoc(userRef, updatedData, { merge: true }));
      await updateDoc(profileRef, updatedData).catch(() => setDoc(profileRef, updatedData, { merge: true }));

      await refreshProfile();
      if (!quiet) {
        messageBox.showSuccess('✅ WhatsApp Session saved successfully!');
      }
    } catch (err: any) {
      console.error('Error saving WhatsApp credentials:', err);
      if (!quiet) {
        messageBox.showError(`Failed to save credentials: ${err?.message || 'Unknown error'}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Poll WhatsApp status API
  const pollStatus = async (sid: string, spass: string) => {
    if (!sid || !spass) return;
    setIsFetchingStatus(true);
    try {
      const res: WhatsAppStatusResponse = await fetchWhatsAppStatus(sid, spass);
      
      setStatus(res.status || 'UNKNOWN');
      if (res.qrCodeDataUrl) {
        setQrCodeUrl(res.qrCodeDataUrl);
      }
      if (res.userInfo) {
        setUserInfo(res.userInfo);
      }

      const isConnectedStatus = 
        res.status === 'AUTHENTICATED' || 
        res.status === 'CONNECTED' || 
        res.status === 'READY' ||
        !!res.userInfo;

      if (isConnectedStatus && !isAutoSavedRef.current) {
        isAutoSavedRef.current = true;
        await saveCredentialsToFirestore(sid, spass, true);
      }
    } catch (err) {
      console.error('Error polling status:', err);
    } finally {
      setIsFetchingStatus(false);
    }
  };

  // Initialize modal state on open
  useEffect(() => {
    if (!isOpen) {
      setQrCodeUrl(null);
      setShowQrCode(false);
      return;
    }

    isAutoSavedRef.current = false;

    if (userProfile?.whatsappSessionId && userProfile?.whatsappSessionPasscode) {
      setSessionId(userProfile.whatsappSessionId);
      setSessionPasscode(userProfile.whatsappSessionPasscode);
    } else {
      const { newSessionId, newPasscode } = generateNewCredentials();
      setSessionId(newSessionId);
      setSessionPasscode(newPasscode);
    }
  }, [isOpen, userProfile]);

  // Periodic polling interval while modal is open & QR mode is active
  useEffect(() => {
    if (!isOpen || !sessionId || !sessionPasscode || !showQrCode) return;

    const interval = setInterval(() => {
      if (status !== 'AUTHENTICATED' && status !== 'CONNECTED' && status !== 'READY') {
        pollStatus(sessionId, sessionPasscode);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isOpen, sessionId, sessionPasscode, status, showQrCode]);

  // Handle explicit "Show QR Code to Scan" click
  const handleShowQrCodeClick = async () => {
    setShowQrCode(true);
    let sid = sessionId;
    let spass = sessionPasscode;
    if (!sid || !spass) {
      const creds = generateNewCredentials();
      sid = creds.newSessionId;
      spass = creds.newPasscode;
      setSessionId(sid);
      setSessionPasscode(spass);
    }
    await pollStatus(sid, spass);
  };

  // Handle Rescan / Reconnect button click
  const handleRescan = async () => {
    const { newSessionId, newPasscode } = generateNewCredentials();
    setSessionId(newSessionId);
    setSessionPasscode(newPasscode);
    setQrCodeUrl(null);
    setStatus('INITIALIZING');
    setUserInfo(null);
    setShowQrCode(true);
    isAutoSavedRef.current = false;
    messageBox.showInfo('Generating fresh WhatsApp QR Code session...');
    await pollStatus(newSessionId, newPasscode);
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (!isOpen) return null;

  const isConnected = 
    status === 'AUTHENTICATED' || 
    status === 'CONNECTED' || 
    status === 'READY' || 
    Boolean(userInfo);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className={`relative w-full max-w-lg rounded-3xl border p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar transition-colors ${
        isDark ? 'bg-[#000] border-white/[0.13] text-white' : 'bg-white border-slate-200 text-slate-900'
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
              <h3 className={`font-extrabold text-xl leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Connect WhatsApp</h3>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Scan QR Code to pair your WhatsApp for candidate invites</p>
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

        {/* Status Live Indicator Badge */}
        <div className={`flex items-center justify-between px-4 py-3 rounded-2xl border text-xs font-bold transition-all ${
          isConnected
            ? isDark
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-emerald-50 border-emerald-300 text-emerald-700'
            : showQrCode && qrCodeUrl
            ? isDark
              ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
              : 'bg-blue-50 border-blue-300 text-blue-700'
            : isDark
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              : 'bg-amber-50 border-amber-300 text-amber-700'
        }`}>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <CheckCircle2 size={18} className="text-emerald-500" />
            ) : (
              <AlertTriangle size={18} className={qrCodeUrl ? 'text-blue-500' : 'text-amber-500'} />
            )}
            <span>
              {isConnected
                ? `WhatsApp Connected (${userInfo?.name || userInfo?.phone || 'Active Session'})`
                : showQrCode
                ? qrCodeUrl ? 'Ready: Scan QR Code below with WhatsApp' : 'Initializing QR Code...'
                : 'WhatsApp Disconnected: Click button to show QR Code'}
            </span>
          </div>
          <span className={`h-3 w-3 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
        </div>

        {/* Connected State */}
        {isConnected ? (
          <div className={`rounded-2xl border p-6 text-center space-y-4 ${
            isDark ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-emerald-50/70 border-emerald-200'
          }`}>
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto shadow-md">
              <CheckCircle2 size={36} />
            </div>
            <div>
              <h4 className={`font-bold text-lg ${isDark ? 'text-emerald-300' : 'text-emerald-800'}`}>WhatsApp is Active & Connected</h4>
              <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Your WhatsApp account is linked. Candidate interview invitations will be dispatched automatically via your WhatsApp session.
              </p>
            </div>

            {userInfo && (
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono font-semibold ${
                isDark ? 'bg-[#141414] border-emerald-500/20 text-emerald-400' : 'bg-white border-emerald-200 text-emerald-700'
              }`}>
                <span>Account: {userInfo.name || userInfo.phone || userInfo.id}</span>
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={handleRescan}
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 mx-auto shadow-md cursor-pointer"
              >
                <RotateCw size={14} />
                <span>Rescan / Reconnect WhatsApp</span>
              </button>
            </div>
          </div>
        ) : !showQrCode ? (
          /* Pre-QR Action Card with "Show QR Code to Scan" Button */
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
                Click below to generate and display the WhatsApp QR Code. Point your phone camera at the screen to link device.
              </p>
            </div>

            <button
              type="button"
              onClick={handleShowQrCodeClick}
              className="w-full py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-extrabold transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-600/25 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <QrCode size={18} />
              <span>Show QR Code to Scan</span>
            </button>
          </div>
        ) : (
          /* Live QR Scanner Box */
          <div className="space-y-4">
            <div className={`flex flex-col items-center justify-center p-6 rounded-2xl border text-center space-y-4 relative shadow-inner ${
              isDark ? 'bg-white/[0.02] border-white/[0.11]' : 'bg-slate-50 border-slate-200'
            }`}>
              {qrCodeUrl ? (
                <div className="relative group">
                  <div className="p-3.5 bg-white rounded-2xl shadow-2xl border border-gray-200">
                    <img
                      src={qrCodeUrl}
                      alt="WhatsApp QR Code"
                      className="w-56 h-56 object-contain rounded-xl"
                    />
                  </div>
                  <div className={`mt-2.5 text-[11px] font-medium flex items-center justify-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <Sparkles size={12} className="text-emerald-500" />
                    <span>Scan QR code using WhatsApp on mobile</span>
                  </div>
                </div>
              ) : (
                <div className="py-12 px-6 flex flex-col items-center justify-center space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center animate-spin">
                    <RotateCw size={24} />
                  </div>
                  <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    {isFetchingStatus ? 'Fetching QR Code...' : 'Initializing WhatsApp API Session...'}
                  </span>
                </div>
              )}

              {/* Instructions */}
              <div className={`text-left w-full rounded-xl p-4 border text-xs space-y-2 ${
                isDark ? 'bg-[#141414] border-white/[0.11]' : 'bg-white border-slate-200'
              }`}>
                <div className={`font-bold flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  <Smartphone size={15} className="text-emerald-500" />
                  <span>Steps to Connect WhatsApp:</span>
                </div>
                <ol className={`list-decimal list-inside space-y-1.5 leading-relaxed pl-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  <li>Open <strong>WhatsApp</strong> on your mobile phone.</li>
                  <li>Tap <strong>Menu (⋮)</strong> or <strong>Settings (⚙️)</strong>.</li>
                  <li>Select <strong>Linked Devices</strong> &rarr; tap <strong>Link a Device</strong>.</li>
                  <li>Point your phone camera at the <strong>QR Code</strong> above.</li>
                </ol>
              </div>

              {/* Rescan Button */}
              <button
                type="button"
                onClick={handleRescan}
                disabled={isFetchingStatus}
                className="w-full h-11 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50 cursor-pointer"
              >
                <RotateCw size={14} className={isFetchingStatus ? 'animate-spin' : ''} />
                <span>Rescan / Generate Fresh QR Code</span>
              </button>
            </div>
          </div>
        )}

        {/* Manual Credentials Accordion */}
        <div className={`border-t pt-4 ${isDark ? 'border-white/[0.11]' : 'border-slate-100'}`}>
          <button
            type="button"
            onClick={() => setShowManualInputs(!showManualInputs)}
            className={`w-full flex items-center justify-between text-xs font-semibold transition-colors cursor-pointer ${
              isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Key size={14} />
              <span>Advanced: View / Edit Session ID & Passcode</span>
            </div>
            {showManualInputs ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showManualInputs && (
            <div className={`mt-3 p-4 rounded-2xl border space-y-3 ${
              isDark ? 'bg-white/[0.03] border-white/[0.11]' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="space-y-1">
                <label className={`text-[11px] font-semibold flex items-center justify-between ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  <span>Session ID</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(sessionId, 'sid')}
                    className="text-emerald-500 font-bold inline-flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    {copiedField === 'sid' ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedField === 'sid' ? 'Copied' : 'Copy'}</span>
                  </button>
                </label>
                <input
                  type="text"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  className={`w-full h-9 px-3 text-xs font-mono rounded-xl border outline-none transition-colors ${
                    isDark ? 'bg-[#141414] border-white/[0.15] text-white focus:border-emerald-500' : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className={`text-[11px] font-semibold flex items-center justify-between ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  <span>Session Passcode</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(sessionPasscode, 'spass')}
                    className="text-emerald-500 font-bold inline-flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    {copiedField === 'spass' ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedField === 'spass' ? 'Copied' : 'Copy'}</span>
                  </button>
                </label>
                <input
                  type="text"
                  value={sessionPasscode}
                  onChange={(e) => setSessionPasscode(e.target.value)}
                  className={`w-full h-9 px-3 text-xs font-mono rounded-xl border outline-none transition-colors ${
                    isDark ? 'bg-[#141414] border-white/[0.15] text-white focus:border-emerald-500' : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                  }`}
                />
              </div>

              <button
                type="button"
                onClick={() => saveCredentialsToFirestore(sessionId, sessionPasscode)}
                disabled={isSaving}
                className={`w-full h-9 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  isDark ? 'bg-white text-black hover:bg-[#eaeaea]' : 'bg-slate-900 text-white hover:bg-slate-800'
                } disabled:opacity-50`}
              >
                <ShieldCheck size={14} />
                <span>{isSaving ? 'Saving Credentials...' : 'Save Manual Credentials'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className={`flex items-center justify-end gap-2 pt-2 border-t ${isDark ? 'border-white/[0.11]' : 'border-slate-100'}`}>
          <button
            type="button"
            onClick={onClose}
            className={`h-10 px-5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
              isDark ? 'border-white/[0.11] text-slate-300 hover:bg-white/10 hover:text-white' : 'border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            Close Window
          </button>
        </div>

      </div>
    </div>
  );
};

export default WhatsAppConnectModal;
