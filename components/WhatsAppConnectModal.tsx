import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useMessageBox } from './MessageBox';
import { X, ExternalLink, CheckCircle2, AlertTriangle, Key, ShieldCheck } from 'lucide-react';

interface WhatsAppConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WhatsAppConnectModal: React.FC<WhatsAppConnectModalProps> = ({ isOpen, onClose }) => {
  const { user, userProfile, refreshProfile } = useAuth();
  const messageBox = useMessageBox();
  const [sessionId, setSessionId] = useState('');
  const [sessionPasscode, setSessionPasscode] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (userProfile) {
      setSessionId(userProfile.whatsappSessionId || '');
      setSessionPasscode(userProfile.whatsappSessionPasscode || '');
    }
  }, [userProfile, isOpen]);

  if (!isOpen) return null;

  const isConnected = Boolean(sessionId.trim() && sessionPasscode.trim());

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      messageBox.showError('User authentication required');
      return;
    }

    try {
      setIsSaving(true);
      const updatedData = {
        whatsappSessionId: sessionId.trim(),
        whatsappSessionPasscode: sessionPasscode.trim(),
        updatedAt: new Date().toISOString(),
      };

      // Update in both users and profiles collections for consistency
      const userRef = doc(db, 'users', user.uid);
      const profileRef = doc(db, 'profiles', user.uid);

      await updateDoc(userRef, updatedData).catch(() => setDoc(userRef, updatedData, { merge: true }));
      await updateDoc(profileRef, updatedData).catch(() => setDoc(profileRef, updatedData, { merge: true }));

      await refreshProfile();
      messageBox.showSuccess(
        sessionId.trim() && sessionPasscode.trim()
          ? '✅ WhatsApp API Credentials saved! Connected successfully.'
          : '⚠️ WhatsApp Credentials updated.'
      );
      onClose();
    } catch (err: any) {
      console.error('Error saving WhatsApp credentials:', err);
      messageBox.showError(`Failed to save credentials: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#0a0a0a] p-6 shadow-2xl text-gray-900 dark:text-white space-y-5">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <i className="fab fa-whatsapp text-xl"></i>
            </div>
            <div>
              <h3 className="font-bold text-lg leading-snug">WhatsApp API Credentials</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Manage session credentials for direct WhatsApp invites</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Status Badge */}
        <div className={`flex items-center justify-between px-4 py-3 rounded-xl border text-xs font-semibold ${
          isConnected
            ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
            : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400'
        }`}>
          <div className="flex items-center gap-2">
            {isConnected ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{isConnected ? 'WhatsApp Session Active & Connected' : 'WhatsApp Disconnected (Credentials Required)'}</span>
          </div>
          <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
        </div>

        {/* Setup Guide Step Box */}
        <div className="rounded-xl border border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/[0.02] p-4 text-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider text-[10px]">Setup Instructions</span>
            <a
              href="https://whatsapp-sending-api.onrender.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              <span>Scan QR Site</span>
              <ExternalLink size={12} />
            </a>
          </div>
          <ol className="list-decimal list-inside space-y-1 text-gray-600 dark:text-gray-400 leading-relaxed">
            <li>Open <a href="https://whatsapp-sending-api.onrender.com/" target="_blank" rel="noopener noreferrer" className="text-emerald-600 dark:text-emerald-400 underline font-medium">https://whatsapp-sending-api.onrender.com/</a></li>
            <li>Scan WhatsApp QR code using phone (Linked Devices).</li>
            <li>Copy generated Session ID & Passcode and paste below.</li>
          </ol>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <Key size={14} className="text-gray-400" />
              WhatsApp Session ID
            </label>
            <input
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="Enter Session ID from WhatsApp QR portal"
              className="w-full h-10 px-3 text-xs rounded-xl border border-gray-300 dark:border-white/15 bg-white dark:bg-[#141414] text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-gray-400" />
              WhatsApp Session Passcode
            </label>
            <input
              type="password"
              value={sessionPasscode}
              onChange={(e) => setSessionPasscode(e.target.value)}
              placeholder="Enter Session Passcode"
              className="w-full h-10 px-3 text-xs rounded-xl border border-gray-300 dark:border-white/15 bg-white dark:bg-[#141414] text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-xs font-semibold rounded-xl border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 h-9 px-5 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md disabled:opacity-50 transition-colors"
            >
              {isSaving ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <i className="fab fa-whatsapp"></i>
                  <span>Save & Connect</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};

export default WhatsAppConnectModal;
