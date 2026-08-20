import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { useParams, useNavigate } from 'react-router-dom';
import { useMessageBox } from '../components/MessageBox';
import { useTheme } from '../context/ThemeContext';
import { sendWhatsAppMessage } from '../services/waSenderService';
import WhatsAppConnectModal from '../components/WhatsAppConnectModal';
import { User, Phone, Mail, Key, ShieldCheck, QrCode, Save, Send, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';

export const SKILL_OPTIONS = [
  "HTML", "CSS", "React", "Node.js", "JavaScript", "TypeScript", "Java",
  "Python", "C++", "C#", "MongoDB", "SQL", "PostgreSQL", "Firebase",
  "AWS", "Docker", "Git", "TensorFlow", "DSA", "Data Analysis",
  "Machine Learning", "Next.js", "Vue.js", "Angular", "Express.js",
  "Redux", "Tailwind CSS", "SASS", "GraphQL", "Linux"
];

export const JOB_CATEGORIES = [
  "Software Development", "Data Science & Analytics", "Design & Creative",
  "Marketing & Sales", "Finance & Accounting", "Human Resources",
  "Engineering", "Product Management", "Customer Support",
  "Legal", "Healthcare", "Education", "Operations & Admin"
];

const Profile: React.FC = () => {
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const messageBox = useMessageBox();

  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    phoneNumber: '',
    photoURL: '',
    whatsappSessionId: '',
    whatsappSessionPasscode: ''
  });

  // WhatsApp Testing States
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Hello! This is a test message from Dsource WhatsApp API system.');
  const [savingWaCredentials, setSavingWaCredentials] = useState(false);
  const [testingWa, setTestingWa] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      const loggedInUser = user;
      const profileUserId = userId || loggedInUser?.uid;

      if (profileUserId) {
        try {
          const profileDocRef = doc(db, 'profiles', profileUserId);
          const userDocRef = doc(db, 'users', profileUserId);

          const [profileDocSnap, userDocSnap] = await Promise.all([
            getDoc(profileDocRef),
            getDoc(userDocRef)
          ]);

          const profileInfo = profileDocSnap.exists() ? profileDocSnap.data() : {};
          const userInfo = userDocSnap.exists() ? userDocSnap.data() : {};

          setFormData({
            displayName: profileInfo.displayName || userInfo.fullname || userInfo.displayName || '',
            email: userInfo.email || profileInfo.email || loggedInUser?.email || '',
            phoneNumber: profileInfo.phoneNumber || userInfo.phone || userInfo.phoneNumber || '',
            photoURL: profileInfo.photoURL || userInfo.profilePhotoURL || '',
            whatsappSessionId: profileInfo.whatsappSessionId || userInfo.whatsappSessionId || '',
            whatsappSessionPasscode: profileInfo.whatsappSessionPasscode || userInfo.whatsappSessionPasscode || ''
          });
        } catch (err) {
          console.error("Error fetching profile:", err);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [userId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      messageBox.showError('User authentication required');
      return;
    }

    setSaving(true);
    try {
      const updatedData = {
        displayName: formData.displayName.trim(),
        fullname: formData.displayName.trim(),
        phoneNumber: formData.phoneNumber.trim(),
        phone: formData.phoneNumber.trim(),
        whatsappSessionId: formData.whatsappSessionId.trim(),
        whatsappSessionPasscode: formData.whatsappSessionPasscode.trim(),
        updatedAt: new Date().toISOString()
      };

      await Promise.all([
        setDoc(doc(db, 'profiles', user.uid), updatedData, { merge: true }),
        setDoc(doc(db, 'users', user.uid), updatedData, { merge: true })
      ]);

      messageBox.showSuccess('✅ Profile details saved successfully!');
    } catch (err: any) {
      console.error('Error saving profile:', err);
      messageBox.showError(`Failed to save profile: ${err?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWaCredentials = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setSavingWaCredentials(true);
    try {
      const waData = {
        whatsappSessionId: formData.whatsappSessionId.trim(),
        whatsappSessionPasscode: formData.whatsappSessionPasscode.trim(),
        updatedAt: new Date().toISOString()
      };

      await Promise.all([
        setDoc(doc(db, 'profiles', user.uid), waData, { merge: true }),
        setDoc(doc(db, 'users', user.uid), waData, { merge: true })
      ]);
      messageBox.showSuccess('✅ WhatsApp Session Credentials saved successfully!');
    } catch (err: any) {
      console.error("Error saving WhatsApp credentials:", err);
      messageBox.showError("Failed to save WhatsApp credentials.");
    } finally {
      setSavingWaCredentials(false);
    }
  };

  const handleTestWaMessage = async () => {
    if (!testPhone.trim()) {
      messageBox.showError("Please enter a valid mobile number with country code for testing (e.g. 919876543210)");
      return;
    }

    setTestingWa(true);
    try {
      const res = await sendWhatsAppMessage(
        testPhone.trim(),
        testMessage.trim()
      );

      if (res.success) {
        messageBox.showSuccess(`🎉 WhatsApp test message dispatched successfully to ${testPhone.trim()}!`);
      } else {
        messageBox.showError(`❌ Test Failed: ${res.error || 'Failed to send WhatsApp message'}`);
      }
    } catch (err: any) {
      console.error("WhatsApp testing error:", err);
      messageBox.showError(`Test Failed: ${err.message || 'Network error'}`);
    } finally {
      setTestingWa(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex min-h-[70vh] items-center justify-center ${isDark ? 'bg-[#000]' : 'bg-slate-50'}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
          <span className={`text-sm font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Loading Profile...</span>
        </div>
      </div>
    );
  }

  const isWaConfigured = Boolean(formData.whatsappSessionId.trim() && formData.whatsappSessionPasscode.trim());

  return (
    <div className={`min-h-screen py-10 px-4 sm:px-6 lg:px-8 font-sans transition-colors ${
      isDark ? 'bg-[#000] text-white' : 'bg-slate-50 text-slate-900'
    }`}>
      <div className="max-w-3xl mx-auto space-y-8">
        
        {/* Profile Card Header */}
        <div className={`rounded-3xl border p-6 sm:p-8 shadow-xl flex flex-col sm:flex-row items-center gap-6 ${
          isDark ? 'bg-[#000] border-white/[0.11]' : 'bg-white border-slate-200'
        }`}>
          <div className="relative">
            {formData.photoURL ? (
              <img
                src={formData.photoURL}
                alt={formData.displayName}
                className="w-20 h-20 rounded-2xl object-cover border-2 border-emerald-500 shadow-md"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-extrabold text-3xl flex items-center justify-center shadow-lg">
                {(formData.displayName || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-black flex items-center justify-center">
              <CheckCircle2 size={12} className="text-white" />
            </span>
          </div>

          <div className="text-center sm:text-left space-y-1 flex-1">
            <h1 className={`text-2xl font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {formData.displayName || 'Account Profile'}
            </h1>
            <p className={`text-xs flex items-center justify-center sm:justify-start gap-1.5 font-medium ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              <Mail size={14} className="text-emerald-500" />
              <span>{formData.email || 'No email provided'}</span>
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <span className={`px-3 py-1 rounded-xl text-[11px] font-bold border inline-flex items-center gap-1.5 ${
                isWaConfigured
                  ? isDark
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : isDark
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-amber-50 border-amber-300 text-amber-700'
              }`}>
                {isWaConfigured ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                <span>{isWaConfigured ? 'WhatsApp Configured' : 'WhatsApp Setup Pending'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* SECTION 1: Personal Account Info Form */}
        <div className={`rounded-3xl border p-6 sm:p-8 shadow-xl space-y-6 ${
          isDark ? 'bg-[#000] border-white/[0.11]' : 'bg-white border-slate-200'
        }`}>
          <div className={`flex items-center gap-3 border-b pb-4 ${isDark ? 'border-white/[0.11]' : 'border-slate-100'}`}>
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
              isDark ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-600'
            }`}>
              <User size={20} />
            </div>
            <div>
              <h2 className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>Personal Account Details</h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Manage your name and contact phone number</p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  <User size={14} className="text-emerald-500" />
                  Full Name
                </label>
                <input
                  type="text"
                  name="displayName"
                  required
                  placeholder="Enter your full name"
                  value={formData.displayName}
                  onChange={handleChange}
                  className={`w-full h-11 px-4 text-xs font-semibold rounded-2xl border outline-none transition-colors ${
                    isDark 
                      ? 'bg-white/[0.03] border-white/[0.13] text-white focus:border-emerald-400' 
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-500'
                  }`}
                />
              </div>

              {/* Mobile Phone Number */}
              <div className="space-y-1.5">
                <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  <Phone size={14} className="text-emerald-500" />
                  Mobile Number
                </label>
                <input
                  type="text"
                  name="phoneNumber"
                  required
                  placeholder="e.g. 9823188483"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  className={`w-full h-11 px-4 text-xs font-semibold rounded-2xl border outline-none transition-colors ${
                    isDark 
                      ? 'bg-white/[0.03] border-white/[0.13] text-white focus:border-emerald-400' 
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-500'
                  }`}
                />
              </div>
            </div>

            {/* Email (Readonly) */}
            <div className="space-y-1.5">
              <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                isDark ? 'text-slate-500' : 'text-slate-400'
              }`}>
                <Mail size={14} className="text-gray-400" />
                Email Address (Account Reference)
              </label>
              <input
                type="email"
                readOnly
                disabled
                value={formData.email}
                className={`w-full h-11 px-4 text-xs font-mono rounded-2xl border cursor-not-allowed ${
                  isDark ? 'bg-white/[0.02] border-white/[0.08] text-slate-500' : 'bg-slate-100 border-slate-200 text-slate-500'
                }`}
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/25 disabled:opacity-50 cursor-pointer"
              >
                <Save size={16} />
                <span>{saving ? 'Saving Profile...' : 'Save Profile Details'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* SECTION 2: WhatsApp Session & Task Manager Credentials */}
        <div className={`rounded-3xl border p-6 sm:p-8 shadow-xl space-y-6 ${
          isDark ? 'bg-[#000] border-white/[0.11]' : 'bg-white border-slate-200'
        }`}>
          <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 ${
            isDark ? 'border-white/[0.11]' : 'border-slate-100'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                isDark ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-600'
              }`}>
                <i className="fab fa-whatsapp text-xl"></i>
              </div>
              <div>
                <h2 className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>WhatsApp API Credentials</h2>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Configure WhatsApp session credentials for candidate invitations</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsWhatsAppModalOpen(true)}
              className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 cursor-pointer"
            >
              <QrCode size={16} />
              <span>Show QR Code to Scan</span>
            </button>
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* WhatsApp Session ID */}
              <div className="space-y-1.5">
                <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  <Key size={14} className="text-emerald-500" />
                  WhatsApp Session ID
                </label>
                <input
                  type="text"
                  name="whatsappSessionId"
                  placeholder="Enter Session ID (e.g. sess_167890abcdef_123456)"
                  value={formData.whatsappSessionId}
                  onChange={handleChange}
                  className={`w-full h-11 px-4 text-xs font-mono rounded-2xl border outline-none transition-colors ${
                    isDark 
                      ? 'bg-white/[0.03] border-white/[0.13] text-white focus:border-emerald-400' 
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-500'
                  }`}
                />
              </div>

              {/* WhatsApp Session Passcode */}
              <div className="space-y-1.5">
                <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  <ShieldCheck size={14} className="text-emerald-500" />
                  WhatsApp Session Passcode
                </label>
                <input
                  type="password"
                  name="whatsappSessionPasscode"
                  placeholder="Enter Session Passcode"
                  value={formData.whatsappSessionPasscode}
                  onChange={handleChange}
                  className={`w-full h-11 px-4 text-xs font-mono rounded-2xl border outline-none transition-colors ${
                    isDark 
                      ? 'bg-white/[0.03] border-white/[0.13] text-white focus:border-emerald-400' 
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-500'
                  }`}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveWaCredentials}
                disabled={savingWaCredentials}
                className={`px-6 py-2.5 rounded-2xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
                  isDark ? 'bg-white text-black hover:bg-[#eaeaea]' : 'bg-slate-900 text-white hover:bg-slate-800'
                } disabled:opacity-50`}
              >
                <Save size={16} />
                <span>{savingWaCredentials ? 'Saving Credentials...' : 'Save WhatsApp Credentials'}</span>
              </button>
            </div>

            {/* Live WhatsApp Testing Tool */}
            <div className={`mt-6 pt-6 border-t space-y-4 ${isDark ? 'border-white/[0.11]' : 'border-slate-100'}`}>
              <div className={`flex items-center gap-2 text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <Sparkles size={16} className="text-emerald-500" />
                <span>Live WhatsApp Testing Tool</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <input
                    type="text"
                    placeholder="Recipient mobile (e.g. 9823188483)"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    className={`w-full h-10 px-3 text-xs font-mono rounded-xl border outline-none transition-colors ${
                      isDark ? 'bg-white/[0.03] border-white/[0.13] text-white focus:border-emerald-400' : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                    }`}
                  />
                </div>
                <div className="sm:col-span-2 flex gap-2">
                  <input
                    type="text"
                    placeholder="Test message content"
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    className={`flex-1 h-10 px-3 text-xs rounded-xl border outline-none transition-colors ${
                      isDark ? 'bg-white/[0.03] border-white/[0.13] text-white focus:border-emerald-400' : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={handleTestWaMessage}
                    disabled={testingWa}
                    className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-md disabled:opacity-50 shrink-0 cursor-pointer"
                  >
                    <Send size={14} className={testingWa ? 'animate-spin' : ''} />
                    <span>{testingWa ? 'Sending...' : 'Send Test'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* WhatsApp QR Code Connect Modal */}
      <WhatsAppConnectModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
      />
    </div>
  );
};

export default Profile;