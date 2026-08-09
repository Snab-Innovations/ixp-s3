import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMessageBox } from '../components/MessageBox';
import { useTheme } from '../context/ThemeContext';
import {
  getRecruiterTemplates,
  saveRecruiterTemplates,
  DEFAULT_RECRUITER_TEMPLATES,
  DEFAULT_EMAIL_INVITE,
  DEFAULT_WHATSAPP_INVITE,
  DEFAULT_JOB_DETAILS_FIELDS,
  JobDetailsFieldsConfig,
  JobDetailItem,
  DEFAULT_JOB_DETAILS_ITEMS,
  DYNAMIC_VARIABLES,
  TEMPLATE_PRESETS,
  RecruiterTemplates as RecruiterTemplatesType,
  EmailTemplateConfig,
  WhatsAppTemplateConfig,
  renderTemplateText
} from '../services/templateService';
import { getDesignerEmailTemplate, sendSingleEmail } from '../services/sesService';
import { buildWhatsAppInviteText, sendWhatsAppMessage } from '../services/waSenderService';
import {
  Mail,
  MessageSquare,
  Clock,
  Sparkles,
  Save,
  RotateCcw,
  Send,
  Eye,
  CheckCircle2,
  AlertCircle,
  Copy,
  Plus,
  Trash2,
  Tag,
  Palette,
  Sliders,
  ShieldCheck,
  Check,
  GripVertical,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

type TabType = 'emailInvite' | 'emailReminder' | 'whatsappInvite' | 'whatsappReminder';

const COLOR_PRESETS = [
  { label: 'Corporate Blue', value: '#0284c7' },
  { label: 'Emerald Green', value: '#10b981' },
  { label: 'Royal Purple', value: '#8b5cf6' },
  { label: 'Crimson Red', value: '#e11d48' },
  { label: 'Onyx Dark', value: '#18181b' },
  { label: 'Amber Gold', value: '#f59e0b' },
];

interface JobDetailItemsManagerProps {
  items: JobDetailItem[];
  onChange: (items: JobDetailItem[]) => void;
  onFocusInput?: (fieldName: string) => void;
}

const JobDetailItemsManager: React.FC<JobDetailItemsManagerProps> = ({ items, onChange, onFocusInput }) => {
  const { isDark } = useTheme();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const safeItems = items && items.length > 0 ? items : DEFAULT_JOB_DETAILS_ITEMS;

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDraggedIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIdx) return;
    const updated = [...safeItems];
    const [removed] = updated.splice(draggedIndex, 1);
    updated.splice(targetIdx, 0, removed);
    setDraggedIndex(null);
    onChange(updated);
  };

  const moveItem = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= safeItems.length) return;
    const updated = [...safeItems];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;
    onChange(updated);
  };

  const toggleItem = (idx: number) => {
    const updated = safeItems.map((item, i) =>
      i === idx ? { ...item, enabled: !item.enabled } : item
    );
    onChange(updated);
  };

  const updateItemField = (idx: number, field: keyof JobDetailItem, val: any) => {
    const updated = safeItems.map((item, i) =>
      i === idx ? { ...item, [field]: val } : item
    );
    onChange(updated);
  };

  const deleteItem = (idx: number) => {
    const updated = safeItems.filter((_, i) => i !== idx);
    onChange(updated);
  };

  const addNewCustomField = () => {
    const newItem: JobDetailItem = {
      id: `custom_${Date.now()}`,
      label: 'New Requirement Field',
      icon: '🔹',
      value: 'Value or {{placeholder}}',
      enabled: true,
      isCustom: true
    };
    onChange([...safeItems, newItem]);
  };

  return (
    <div className={`rounded-xl border p-3 sm:p-4 space-y-3 transition-colors ${
      isDark ? 'border-[#2e2e2e] bg-[#050505]' : 'border-slate-200 bg-slate-100/80'
    }`}>
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3 ${
        isDark ? 'border-[#1f1f1f]' : 'border-slate-200'
      }`}>
        <div>
          <h4 className={`text-xs sm:text-sm font-semibold flex items-center gap-1.5 ${
            isDark ? 'text-emerald-400' : 'text-emerald-700'
          }`}>
            <Sliders className="w-4 h-4 text-emerald-500" />
            Select, Add & Drag to Reorder Email Job Details Card Fields
          </h4>
          <p className={`text-[11px] mt-0.5 ${isDark ? 'text-[#999]' : 'text-slate-500'}`}>
            Drag items up/down to reorder, toggle visibility checkboxes, customize field titles, or add custom fields.
          </p>
        </div>
        <button
          type="button"
          onClick={addNewCustomField}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors self-start sm:self-auto ${
            isDark
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
              : 'bg-emerald-100 border-emerald-300 text-emerald-800 hover:bg-emerald-200'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Custom Field
        </button>
      </div>

      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {safeItems.map((item, idx) => (
          <div
            key={item.id || idx}
            draggable
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={(e) => handleDrop(e, idx)}
            className={`flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 rounded-lg border transition-all ${
              draggedIndex === idx
                ? (isDark ? 'border-emerald-500 bg-emerald-500/10 opacity-60 scale-[0.99]' : 'border-emerald-500 bg-emerald-50 opacity-60 scale-[0.99]')
                : item.enabled
                ? (isDark ? 'border-[#262626] bg-[#0a0a0a] hover:border-[#383838]' : 'border-slate-200 bg-white hover:border-slate-300 shadow-2xs')
                : (isDark ? 'border-[#1a1a1a] bg-[#000] opacity-50' : 'border-slate-200 bg-slate-100 opacity-50')
            }`}
          >
            {/* Grip & Reorder arrows */}
            <div className="flex items-center gap-1">
              <div
                title="Drag up/down to reorder"
                className={`cursor-grab active:cursor-grabbing p-1 transition-colors ${
                  isDark ? 'text-[#666] hover:text-white' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <GripVertical className="w-4 h-4" />
              </div>
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => moveItem(idx, 'up')}
                  className={`p-0.5 transition-colors disabled:opacity-20 ${
                    isDark ? 'text-[#666] hover:text-emerald-400' : 'text-slate-400 hover:text-emerald-600'
                  }`}
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  disabled={idx === safeItems.length - 1}
                  onClick={() => moveItem(idx, 'down')}
                  className={`p-0.5 transition-colors disabled:opacity-20 ${
                    isDark ? 'text-[#666] hover:text-emerald-400' : 'text-slate-400 hover:text-emerald-600'
                  }`}
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Enable Checkbox */}
            <input
              type="checkbox"
              checked={item.enabled !== false}
              onChange={() => toggleItem(idx)}
              className="h-4 w-4 rounded accent-emerald-500 cursor-pointer"
            />

            {/* Icon Input */}
            <input
              type="text"
              value={item.icon || '🔹'}
              onChange={(e) => updateItemField(idx, 'icon', e.target.value)}
              className={`w-10 text-center rounded-md border px-1 py-1.5 text-xs outline-none focus:border-emerald-500 ${
                isDark ? 'border-[#2e2e2e] bg-[#000] text-white' : 'border-slate-300 bg-white text-slate-900'
              }`}
              title="Emoji Icon"
            />

            {/* Label Input */}
            <input
              type="text"
              value={item.label}
              onChange={(e) => updateItemField(idx, 'label', e.target.value)}
              className={`w-full sm:w-36 rounded-md border px-2 py-1.5 text-xs font-semibold outline-none focus:border-emerald-500 ${
                isDark ? 'border-[#2e2e2e] bg-[#000] text-white' : 'border-slate-300 bg-white text-slate-900'
              }`}
              placeholder="Field Name"
            />

            {/* Value / Dynamic Expression Input */}
            <input
              type="text"
              value={item.value}
              onFocus={() => onFocusInput && onFocusInput(`item_val_${idx}`)}
              onChange={(e) => updateItemField(idx, 'value', e.target.value)}
              className={`w-full flex-1 rounded-md border px-2 py-1.5 text-xs outline-none focus:border-emerald-500 font-mono ${
                isDark ? 'border-[#2e2e2e] bg-[#000] text-[#d1d5db]' : 'border-slate-300 bg-white text-slate-900'
              }`}
              placeholder="Value or {{placeholder}}"
            />

            {/* Delete button */}
            {(item.isCustom || safeItems.length > 1) && (
              <button
                type="button"
                onClick={() => deleteItem(idx)}
                title="Remove Field"
                className={`p-1 transition-colors self-end sm:self-auto ${
                  isDark ? 'text-[#666] hover:text-rose-400' : 'text-slate-400 hover:text-rose-600'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const SAMPLE_CONTEXT = {
  candidate_name: 'Rahul Sharma',
  candidate_email: 'rahul.sharma@example.com',
  candidate_phone: '+91 9876543210',
  job_title: 'Senior Full Stack Engineer',
  company_name: 'Dsource',
  interview_link: 'https://dsource.in/#/interview/inv-89210',
  access_code: 'DX-8921',
  interview_code: 'DX-8921',
  interview_deadline: 'Within 48 Hours',
  location: 'Mumbai / Hybrid',
  qualification: 'B.Tech / MCA',
  experience: '3 - 5 Years',
  salary: '₹12,00,000 - ₹16,00,000 PA',
  employment_type: 'Full Time',
  recruiter_name: 'Anjali Verma (Senior Talent Manager)',
  recruiter_phone: '+91 9762588623',
  recruiter_email: 'recruitment@dsource.in',
  support_phone: '9762588623 / 8484888632'
};

const RecruiterTemplatesPage: React.FC = () => {
  const { userProfile, user } = useAuth();
  const messageBox = useMessageBox();
  const { isDark } = useTheme();
  const uid = userProfile?.uid || user?.uid || '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('emailInvite');
  const [templates, setTemplates] = useState<RecruiterTemplatesType>(DEFAULT_RECRUITER_TEMPLATES);

  // Active focused input ref for variable insertion
  const [lastFocusedInput, setLastFocusedInput] = useState<{
    fieldName: string;
    index?: number;
  } | null>(null);

  // Test Delivery Modal State
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    async function load() {
      if (uid) {
        setLoading(true);
        const data = await getRecruiterTemplates(uid);
        setTemplates(data);
        setLoading(false);
      } else {
        setLoading(false);
      }
    }
    load();
  }, [uid]);

  const insertPlaceholder = (tag: string) => {
    if (!lastFocusedInput) {
      messageBox.showInfo(`Click on any input field first, then click "${tag}" to insert it.`);
      return;
    }

    const { fieldName, index } = lastFocusedInput;

    if (fieldName.startsWith('item_val_')) {
      const itemIndex = parseInt(fieldName.replace('item_val_', ''), 10);
      const config = templates[activeTab];
      const items = [...(config.jobDetailItems || DEFAULT_JOB_DETAILS_ITEMS)];
      if (items[itemIndex]) {
        items[itemIndex] = { ...items[itemIndex], value: items[itemIndex].value + tag };
        setTemplates({
          ...templates,
          [activeTab]: {
            ...config,
            jobDetailItems: items
          }
        });
      }
      return;
    }

    if (activeTab === 'emailInvite' || activeTab === 'emailReminder') {
      const currentEmailConfig = { ...templates[activeTab] };

      if (fieldName === 'instructions' && typeof index === 'number') {
        const newInst = [...currentEmailConfig.instructions];
        newInst[index] = (newInst[index] || '') + tag;
        currentEmailConfig.instructions = newInst;
      } else if (fieldName in currentEmailConfig) {
        (currentEmailConfig as any)[fieldName] = ((currentEmailConfig as any)[fieldName] || '') + tag;
      }

      setTemplates({ ...templates, [activeTab]: currentEmailConfig });
    } else {
      const currentWaConfig = { ...templates[activeTab] };
      if (fieldName in currentWaConfig) {
        (currentWaConfig as any)[fieldName] = ((currentWaConfig as any)[fieldName] || '') + tag;
      }
      setTemplates({ ...templates, [activeTab]: currentWaConfig });
    }
  };

  const handleSaveAll = async () => {
    if (!uid) {
      messageBox.showError('User authentication required');
      return;
    }
    setSaving(true);
    const success = await saveRecruiterTemplates(uid, templates);
    setSaving(false);
    if (success) {
      messageBox.showSuccess('✅ Customized Communication Templates saved successfully!');
    } else {
      messageBox.showError('Failed to save templates. Please try again.');
    }
  };

  const handleResetCurrent = () => {
    setTemplates(prev => ({
      ...prev,
      [activeTab]: DEFAULT_RECRUITER_TEMPLATES[activeTab]
    }));
    messageBox.showSuccess(`Reset ${activeTab} to default system template.`);
  };

  const handleResetAll = () => {
    setTemplates(DEFAULT_RECRUITER_TEMPLATES);
    messageBox.showSuccess('All 4 templates restored to default system configuration.');
  };

  const handleSendTestMessage = async () => {
    if (!testRecipient.trim()) {
      messageBox.showError('Please enter a valid email address or mobile number.');
      return;
    }

    setSendingTest(true);

    if (activeTab === 'emailInvite' || activeTab === 'emailReminder') {
      const isReminder = activeTab === 'emailReminder';
      const config = templates[activeTab];
      const html = getDesignerEmailTemplate(
        SAMPLE_CONTEXT.candidate_name,
        SAMPLE_CONTEXT.job_title,
        SAMPLE_CONTEXT.interview_link,
        SAMPLE_CONTEXT.access_code,
        isReminder,
        {
          location: SAMPLE_CONTEXT.location,
          qualification: SAMPLE_CONTEXT.qualification,
          experience: SAMPLE_CONTEXT.experience,
          salary: SAMPLE_CONTEXT.salary,
          employmentType: SAMPLE_CONTEXT.employment_type,
          deadline: SAMPLE_CONTEXT.interview_deadline,
          recruiterName: userProfile?.displayName || userProfile?.name || SAMPLE_CONTEXT.recruiter_name,
          recruiterPhone: userProfile?.phoneNumber || userProfile?.phone || SAMPLE_CONTEXT.recruiter_phone,
          recruiterEmail: userProfile?.email || SAMPLE_CONTEXT.recruiter_email,
          customTemplate: config
        }
      );

      const subject = renderTemplateText(config.subject, SAMPLE_CONTEXT);
      const result = await sendSingleEmail(
        testRecipient.trim(),
        SAMPLE_CONTEXT.candidate_name,
        `[TEST] ${subject}`,
        html
      );

      setSendingTest(false);
      if (result.success) {
        messageBox.showSuccess(`✅ Test Email delivered successfully to ${testRecipient.trim()}!`);
        setTestModalOpen(false);
      } else {
        messageBox.showError(`Email delivery error: ${result.error}`);
      }
    } else {
      const isReminder = activeTab === 'whatsappReminder';
      const config = templates[activeTab];
      const messageText = buildWhatsAppInviteText({
        candidateName: SAMPLE_CONTEXT.candidate_name,
        jobTitle: SAMPLE_CONTEXT.job_title,
        interviewLink: SAMPLE_CONTEXT.interview_link,
        accessCode: SAMPLE_CONTEXT.access_code,
        isReminder,
        options: {
          location: SAMPLE_CONTEXT.location,
          qualification: SAMPLE_CONTEXT.qualification,
          experience: SAMPLE_CONTEXT.experience,
          salary: SAMPLE_CONTEXT.salary,
          employmentType: SAMPLE_CONTEXT.employment_type,
          deadline: SAMPLE_CONTEXT.interview_deadline,
          recruiterName: userProfile?.displayName || userProfile?.name || SAMPLE_CONTEXT.recruiter_name,
          recruiterPhone: userProfile?.phoneNumber || userProfile?.phone || SAMPLE_CONTEXT.recruiter_phone,
          whatsappSessionId: userProfile?.whatsappSessionId,
          whatsappSessionPasscode: userProfile?.whatsappSessionPasscode,
          customTemplate: config
        }
      });

      const res = await sendWhatsAppMessage(
        testRecipient.trim(),
        messageText,
        {
          sessionId: userProfile?.whatsappSessionId,
          passcode: userProfile?.whatsappSessionPasscode
        }
      );

      setSendingTest(false);
      if (res.success) {
        messageBox.showSuccess(`✅ Test WhatsApp message sent to ${testRecipient.trim()}!`);
        setTestModalOpen(false);
      } else {
        messageBox.showError(`WhatsApp Error: ${res.error}`);
      }
    }
  };

  // Helper for rendering WhatsApp Live Preview with WhatsApp markup
  const renderWhatsAppPreview = (config: WhatsAppTemplateConfig, isReminder: boolean) => {
    const rawText = buildWhatsAppInviteText({
      candidateName: SAMPLE_CONTEXT.candidate_name,
      jobTitle: SAMPLE_CONTEXT.job_title,
      interviewLink: SAMPLE_CONTEXT.interview_link,
      accessCode: SAMPLE_CONTEXT.access_code,
      isReminder,
      options: {
        location: SAMPLE_CONTEXT.location,
        qualification: SAMPLE_CONTEXT.qualification,
        experience: SAMPLE_CONTEXT.experience,
        salary: SAMPLE_CONTEXT.salary,
        employmentType: SAMPLE_CONTEXT.employment_type,
        deadline: SAMPLE_CONTEXT.interview_deadline,
        recruiterName: userProfile?.displayName || userProfile?.name || SAMPLE_CONTEXT.recruiter_name,
        recruiterPhone: userProfile?.phoneNumber || userProfile?.phone || SAMPLE_CONTEXT.recruiter_phone,
        customTemplate: config
      }
    });

    // Simple parser for bold *text* in whatsapp
    const lines = rawText.split('\n');

    return (
      <div className="rounded-xl border border-emerald-500/30 bg-[#0b141a] p-4 text-[#e9edef] font-sans text-xs sm:text-sm leading-relaxed shadow-xl">
        {/* WhatsApp Chat Header */}
        <div className="-mx-4 -mt-4 mb-3 flex items-center gap-3 border-b border-white/[0.08] bg-[#202c33] px-4 py-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
            DS
          </div>
          <div>
            <div className="font-semibold text-[#e9edef]">Dsource Recruitment Bot</div>
            <div className="text-[11px] text-[#8696a0]">Official Business Account</div>
          </div>
        </div>

        {/* Chat Message Bubble */}
        <div className="relative rounded-lg bg-[#005c4b] p-3 text-[#e9edef] shadow-md">
          <div className="whitespace-pre-wrap font-sans">
            {lines.map((line, idx) => {
              // Convert *bold* to <strong>
              const parts = line.split(/(\*[^*]+\*)/g);
              return (
                <div key={idx} className="min-h-[1.25rem]">
                  {parts.map((part, pIdx) => {
                    if (part.startsWith('*') && part.endsWith('*')) {
                      return <strong key={pIdx} className="font-bold text-white">{part.slice(1, -1)}</strong>;
                    }
                    return part;
                  })}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-[#8696a0]">
            <span>10:42 AM</span>
            <CheckCircle2 className="h-3 w-3 text-[#53bdeb]" />
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#000] text-white">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
          <span className="geist-caption text-sm text-[#878787]">Loading Communication Templates...</span>
        </div>
      </div>
    );
  }

  const isEmailTab = activeTab === 'emailInvite' || activeTab === 'emailReminder';
  const emailConfig: EmailTemplateConfig = isEmailTab ? (templates[activeTab] as EmailTemplateConfig) || DEFAULT_EMAIL_INVITE : templates.emailInvite || DEFAULT_EMAIL_INVITE;
  const waConfig: WhatsAppTemplateConfig = !isEmailTab ? (templates[activeTab] as WhatsAppTemplateConfig) || DEFAULT_WHATSAPP_INVITE : templates.whatsappInvite || DEFAULT_WHATSAPP_INVITE;

  return (
    <div className={`min-h-screen p-4 sm:p-6 lg:p-8 geist-sans transition-colors ${
      isDark ? 'bg-[#000] text-white' : 'bg-slate-50 text-slate-900'
    }`}>
      {/* Top Header */}
      <div className="mx-auto max-w-7xl">
        <div className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-6 mb-6 ${
          isDark ? 'border-[#2e2e2e]' : 'border-slate-200'
        }`}>
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-500" />
              <h1 className={`text-xl sm:text-2xl font-bold tracking-tight ${
                isDark ? 'text-white' : 'text-slate-900 font-extrabold'
              }`}>
                Customize Communication Templates
              </h1>
            </div>
            <p className={`mt-1 text-xs sm:text-sm ${
              isDark ? 'text-[#878787]' : 'text-slate-600 font-medium'
            }`}>
              Manage custom Email & WhatsApp templates with dynamic variables for invitations and reminders across all jobs.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setTestRecipient(isEmailTab ? (userProfile?.email || '') : (userProfile?.phone || userProfile?.phoneNumber || ''));
                setTestModalOpen(true);
              }}
              className={`inline-flex items-center gap-2 rounded-[6px] border px-3.5 py-2 text-xs font-semibold transition-all ${
                isDark
                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                  : 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 shadow-2xs'
              }`}
            >
              <Send className="h-3.5 w-3.5" />
              <span>Send Test Message</span>
            </button>

            <button
              type="button"
              onClick={handleResetCurrent}
              className={`inline-flex items-center gap-2 rounded-[6px] border px-3.5 py-2 text-xs font-medium transition-all ${
                isDark
                  ? 'border-[#2e2e2e] bg-[#141414] text-[#ededed] hover:border-[#444]'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 shadow-2xs'
              }`}
            >
              <RotateCcw className={`h-3.5 w-3.5 ${isDark ? 'text-[#878787]' : 'text-slate-500'}`} />
              <span>Reset Tab</span>
            </button>

            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-[6px] bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-900/30 hover:from-emerald-500 hover:to-teal-500 transition-all disabled:opacity-50"
            >
              {saving ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span>{saving ? 'Saving...' : 'Save All Templates'}</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('emailInvite')}
            className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-xs sm:text-sm font-semibold transition-all ${
              activeTab === 'emailInvite'
                ? (isDark ? 'border-sky-500 bg-sky-500/15 text-sky-400 shadow-md shadow-sky-950/40' : 'border-sky-500 bg-sky-50 text-sky-700 shadow-xs font-bold')
                : (isDark ? 'border-[#2e2e2e] bg-[#0a0a0a] text-[#878787] hover:border-[#444] hover:text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 shadow-2xs')
            }`}
          >
            <Mail className="h-4 w-4 text-sky-500" />
            <span className="truncate">📧 Email Invite</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('emailReminder')}
            className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-xs sm:text-sm font-semibold transition-all ${
              activeTab === 'emailReminder'
                ? (isDark ? 'border-rose-500 bg-rose-500/15 text-rose-400 shadow-md shadow-rose-950/40' : 'border-rose-500 bg-rose-50 text-rose-700 shadow-xs font-bold')
                : (isDark ? 'border-[#2e2e2e] bg-[#0a0a0a] text-[#878787] hover:border-[#444] hover:text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 shadow-2xs')
            }`}
          >
            <Clock className="h-4 w-4 text-rose-500" />
            <span className="truncate">⏰ Email Reminder</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('whatsappInvite')}
            className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-xs sm:text-sm font-semibold transition-all ${
              activeTab === 'whatsappInvite'
                ? (isDark ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400 shadow-md shadow-emerald-950/40' : 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-xs font-bold')
                : (isDark ? 'border-[#2e2e2e] bg-[#0a0a0a] text-[#878787] hover:border-[#444] hover:text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 shadow-2xs')
            }`}
          >
            <MessageSquare className="h-4 w-4 text-emerald-500" />
            <span className="truncate">💬 WhatsApp Invite</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('whatsappReminder')}
            className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-xs sm:text-sm font-semibold transition-all ${
              activeTab === 'whatsappReminder'
                ? (isDark ? 'border-amber-500 bg-amber-500/15 text-amber-400 shadow-md shadow-amber-950/40' : 'border-amber-500 bg-amber-50 text-amber-800 shadow-xs font-bold')
                : (isDark ? 'border-[#2e2e2e] bg-[#0a0a0a] text-[#878787] hover:border-[#444] hover:text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 shadow-2xs')
            }`}
          >
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="truncate">⌛ WhatsApp Reminder</span>
          </button>
        </div>

        {/* Dynamic Placeholders Toolbar */}
        <div className={`rounded-xl border p-4.5 mb-6 shadow-xl transition-colors ${
          isDark
            ? 'border-emerald-500/40 bg-[#06140e] shadow-emerald-950/20 text-white'
            : 'border-emerald-300 bg-emerald-50/90 text-emerald-950 shadow-sm'
        }`}>
          <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2 border-b ${
            isDark ? 'border-emerald-500/20' : 'border-emerald-200'
          }`}>
            <div className={`flex items-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-wider ${
              isDark ? 'text-emerald-400' : 'text-emerald-800'
            }`}>
              <Tag className="h-4 w-4 text-emerald-500" />
              <span>Insert Dynamic Variables (Click or Drag & Drop into any input field)</span>
            </div>
            <span className={`text-xs font-medium ${
              isDark ? 'text-emerald-300/80' : 'text-emerald-700'
            }`}>
              💡 Tip: Click to insert into active input or drag & drop pills into textboxes
            </span>
          </div>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
            {DYNAMIC_VARIABLES.map((v) => (
              <div
                key={v.tag}
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', v.tag);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => insertPlaceholder(v.tag)}
                title={`Click to insert or Drag & Drop into any textbox (Example: ${v.example})`}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-md transition-all cursor-grab active:cursor-grabbing select-none group ${
                  isDark
                    ? 'border-emerald-500/60 bg-emerald-950/80 hover:bg-emerald-500 hover:border-emerald-300 shadow-emerald-950/50'
                    : 'border-emerald-400/80 bg-white hover:bg-emerald-600 hover:border-emerald-600 shadow-slate-200'
                }`}
              >
                <GripVertical className={`h-3.5 w-3.5 transition-colors ${
                  isDark ? 'text-emerald-400 group-hover:text-black' : 'text-emerald-600 group-hover:text-white'
                }`} />
                <span className={`font-semibold transition-colors ${
                  isDark ? 'text-white group-hover:text-black' : 'text-slate-800 group-hover:text-white'
                }`}>{v.label}:</span>
                <span className={`font-mono font-bold transition-colors ${
                  isDark ? 'text-emerald-300 group-hover:text-black' : 'text-emerald-700 group-hover:text-white'
                }`}>{v.tag}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Main Editor + Live Preview Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* Left Form Controls (7 cols) */}
          <div className={`lg:col-span-7 flex flex-col gap-5 rounded-xl border p-5 shadow-xl transition-colors ${
            isDark ? 'border-[#2e2e2e] bg-[#0d0d0d] text-white' : 'border-slate-200 bg-white text-slate-900 shadow-sm'
          }`}>
            <div className={`flex flex-col gap-3 border-b pb-3 ${
              isDark ? 'border-[#2e2e2e]' : 'border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <h2 className={`text-base font-semibold flex items-center gap-2 ${
                  isDark ? 'text-white' : 'text-slate-900 font-extrabold'
                }`}>
                  <Sliders className="h-4 w-4 text-emerald-500" />
                  <span>
                    {activeTab === 'emailInvite' && '📧 Email Invitation Configuration'}
                    {activeTab === 'emailReminder' && '⏰ Email Reminder Configuration'}
                    {activeTab === 'whatsappInvite' && '💬 WhatsApp Invitation Configuration'}
                    {activeTab === 'whatsappReminder' && '⌛ WhatsApp Reminder Configuration'}
                  </span>
                </h2>
              </div>

              {/* Quick Preset Selector */}
              <div className={`p-3 rounded-xl border flex flex-wrap items-center gap-2 transition-all ${
                isDark ? 'border-emerald-500/30 bg-[#06140e]' : 'border-emerald-200 bg-emerald-50/60'
              }`}>
                <span className={`text-xs font-extrabold flex items-center gap-1.5 uppercase tracking-wider ${
                  isDark ? 'text-emerald-400' : 'text-emerald-900'
                }`}>
                  <Sparkles className="w-4 h-4 text-emerald-500 animate-pulse" /> Load Preset Template:
                </span>
                {TEMPLATE_PRESETS.map((preset) => {
                  const isShortlisted = preset.id === 'shortlisted';
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        if (isEmailTab) {
                          setTemplates(prev => ({ ...prev, [activeTab]: { ...preset.email } }));
                        } else {
                          setTemplates(prev => ({ ...prev, [activeTab]: { ...preset.whatsapp } }));
                        }
                        messageBox.showSuccess(`Loaded "${preset.label}" preset!`);
                      }}
                      title={preset.description}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        isShortlisted
                          ? (isDark 
                              ? 'border-emerald-400 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-950/60 hover:from-emerald-500 hover:to-teal-500 scale-[1.02]' 
                              : 'border-emerald-500 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm hover:from-emerald-700 hover:to-teal-700 scale-[1.02]')
                          : (isDark
                              ? 'border-[#333] bg-[#111] text-[#ddd] hover:border-emerald-500 hover:text-white hover:bg-emerald-950/60'
                              : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-500 hover:text-emerald-800 hover:bg-emerald-50 shadow-2xs')
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* EMAIL TEMPLATE FORM */}
            {isEmailTab && (
              <div className="flex flex-col gap-4">
                {/* Subject Line */}
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${
                    isDark ? 'text-[#a1a1a1]' : 'text-slate-700 font-bold'
                  }`}>
                    Email Subject Line <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={emailConfig.subject}
                    onFocus={() => setLastFocusedInput({ fieldName: 'subject' })}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTemplates(prev => ({
                        ...prev,
                        [activeTab]: { ...prev[activeTab as 'emailInvite' | 'emailReminder'], subject: val }
                      }));
                    }}
                    placeholder="e.g. Interview Invitation — {{job_title}} | {{company_name}}"
                    className={`w-full rounded-md border px-3 py-2 text-xs sm:text-sm outline-none focus:border-emerald-500 transition-colors ${
                      isDark ? 'border-[#2e2e2e] bg-[#000] text-white' : 'border-slate-300 bg-slate-50 text-slate-900 focus:bg-white shadow-2xs'
                    }`}
                  />
                </div>

                {/* Accent Color Preset Selector */}
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 flex items-center gap-1.5 ${
                    isDark ? 'text-[#a1a1a1]' : 'text-slate-700 font-bold'
                  }`}>
                    <Palette className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Template Accent Theme Color</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => {
                          setTemplates(prev => ({
                            ...prev,
                            [activeTab]: { ...prev[activeTab as 'emailInvite' | 'emailReminder'], accentColor: preset.value }
                          }));
                        }}
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                          emailConfig.accentColor === preset.value
                            ? (isDark ? 'border-white text-white bg-white/10 ring-2 ring-emerald-500' : 'border-slate-800 text-slate-900 bg-slate-200 ring-2 ring-emerald-500 font-bold')
                            : (isDark ? 'border-[#2e2e2e] text-[#878787] hover:border-[#444] hover:text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 bg-white shadow-2xs')
                        }`}
                      >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: preset.value }}></span>
                        <span>{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Header Badge */}
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${
                    isDark ? 'text-[#a1a1a1]' : 'text-slate-700 font-bold'
                  }`}>
                    Header Pill Badge Text
                  </label>
                  <input
                    type="text"
                    value={emailConfig.badgeText}
                    onFocus={() => setLastFocusedInput({ fieldName: 'badgeText' })}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTemplates(prev => ({
                        ...prev,
                        [activeTab]: { ...prev[activeTab as 'emailInvite' | 'emailReminder'], badgeText: val }
                      }));
                    }}
                    placeholder="e.g. OFFICIAL INVITATION or ACTION REQUIRED"
                    className={`w-full rounded-md border px-3 py-2 text-xs sm:text-sm outline-none focus:border-emerald-500 transition-colors ${
                      isDark ? 'border-[#2e2e2e] bg-[#000] text-white' : 'border-slate-300 bg-slate-50 text-slate-900 focus:bg-white shadow-2xs'
                    }`}
                  />
                </div>

                {/* Greeting Headline */}
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${
                    isDark ? 'text-[#a1a1a1]' : 'text-slate-700 font-bold'
                  }`}>
                    Greeting Headline
                  </label>
                  <input
                    type="text"
                    value={emailConfig.headline}
                    onFocus={() => setLastFocusedInput({ fieldName: 'headline' })}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTemplates(prev => ({
                        ...prev,
                        [activeTab]: { ...prev[activeTab as 'emailInvite' | 'emailReminder'], headline: val }
                      }));
                    }}
                    placeholder="e.g. Dear {{candidate_name}},"
                    className={`w-full rounded-md border px-3 py-2 text-xs sm:text-sm outline-none focus:border-emerald-500 transition-colors ${
                      isDark ? 'border-[#2e2e2e] bg-[#000] text-white' : 'border-slate-300 bg-slate-50 text-slate-900 focus:bg-white shadow-2xs'
                    }`}
                  />
                </div>

                {/* Body Message */}
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${
                    isDark ? 'text-[#a1a1a1]' : 'text-slate-700 font-bold'
                  }`}>
                    Main Message Body
                  </label>
                  <textarea
                    rows={4}
                    value={emailConfig.body}
                    onFocus={() => setLastFocusedInput({ fieldName: 'body' })}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTemplates(prev => ({
                        ...prev,
                        [activeTab]: { ...prev[activeTab as 'emailInvite' | 'emailReminder'], body: val }
                      }));
                    }}
                    placeholder="Main email body paragraphs supporting {{placeholders}} and HTML <strong>bold</strong>..."
                    className={`w-full rounded-md border p-3 text-xs sm:text-sm outline-none focus:border-emerald-500 transition-colors ${
                      isDark ? 'border-[#2e2e2e] bg-[#000] text-white' : 'border-slate-300 bg-slate-50 text-slate-900 focus:bg-white shadow-2xs'
                    }`}
                  />
                </div>

                {/* Display Toggles */}
                <div className={`flex flex-col gap-3 py-2 border-y ${
                  isDark ? 'border-[#2e2e2e]' : 'border-slate-200'
                }`}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className={`flex items-center gap-2 cursor-pointer rounded-lg border p-3 transition-colors ${
                      isDark ? 'border-[#2e2e2e] bg-[#000] hover:border-[#444]' : 'border-slate-200 bg-slate-50 hover:border-slate-300 shadow-2xs'
                    }`}>
                      <input
                        type="checkbox"
                        checked={emailConfig.showJobDetails !== false}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setTemplates(prev => ({
                            ...prev,
                            [activeTab]: { ...prev[activeTab as 'emailInvite' | 'emailReminder'], showJobDetails: checked }
                          }));
                        }}
                        className="h-4 w-4 rounded accent-emerald-500 cursor-pointer"
                      />
                      <span className={`text-xs font-medium ${isDark ? 'text-[#ededed]' : 'text-slate-800'}`}>Include Job Details Card</span>
                    </label>

                    <label className={`flex items-center gap-2 cursor-pointer rounded-lg border p-3 transition-colors ${
                      isDark ? 'border-[#2e2e2e] bg-[#000] hover:border-[#444]' : 'border-slate-200 bg-slate-50 hover:border-slate-300 shadow-2xs'
                    }`}>
                      <input
                        type="checkbox"
                        checked={emailConfig.showCredentialsBox !== false}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setTemplates(prev => ({
                            ...prev,
                            [activeTab]: { ...prev[activeTab as 'emailInvite' | 'emailReminder'], showCredentialsBox: checked }
                          }));
                        }}
                        className="h-4 w-4 rounded accent-emerald-500 cursor-pointer"
                      />
                      <span className={`text-xs font-medium ${isDark ? 'text-[#ededed]' : 'text-slate-800'}`}>Include Access Credentials Box</span>
                    </label>
                  </div>

                  {/* Drag and drop re-orderable Job Details Manager */}
                  {emailConfig.showJobDetails !== false && (
                    <JobDetailItemsManager
                      items={emailConfig.jobDetailItems || DEFAULT_JOB_DETAILS_ITEMS}
                      onChange={(newItems) => {
                        setTemplates(prev => ({
                          ...prev,
                          [activeTab]: {
                            ...prev[activeTab as 'emailInvite' | 'emailReminder'],
                            jobDetailItems: newItems
                          }
                        }));
                      }}
                      onFocusInput={(fName) => setLastFocusedInput({ fieldName: fName })}
                    />
                  )}
                </div>

                {/* Primary Button CTA Text */}
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${
                    isDark ? 'text-[#a1a1a1]' : 'text-slate-700 font-bold'
                  }`}>
                    Primary CTA Button Label
                  </label>
                  <input
                    type="text"
                    value={emailConfig.ctaButtonText}
                    onFocus={() => setLastFocusedInput({ fieldName: 'ctaButtonText' })}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTemplates(prev => ({
                        ...prev,
                        [activeTab]: { ...prev[activeTab as 'emailInvite' | 'emailReminder'], ctaButtonText: val }
                      }));
                    }}
                    placeholder="e.g. Start Interview Now →"
                    className={`w-full rounded-md border px-3 py-2 text-xs sm:text-sm outline-none focus:border-emerald-500 transition-colors ${
                      isDark ? 'border-[#2e2e2e] bg-[#000] text-white' : 'border-slate-300 bg-slate-50 text-slate-900 focus:bg-white shadow-2xs'
                    }`}
                  />
                </div>

                {/* Editable Instructions List */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className={`text-xs font-semibold ${
                      isDark ? 'text-[#a1a1a1]' : 'text-slate-700 font-bold'
                    }`}>
                      Pre-Interview Instructions Bullet List
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const currentInst = [...(emailConfig.instructions || [])];
                        currentInst.push('New instruction line');
                        setTemplates(prev => ({
                          ...prev,
                          [activeTab]: { ...prev[activeTab as 'emailInvite' | 'emailReminder'], instructions: currentInst }
                        }));
                      }}
                      className="text-[11px] font-semibold text-emerald-500 hover:underline flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" /> Add Line
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {(emailConfig.instructions || []).map((inst, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={inst}
                          onFocus={() => setLastFocusedInput({ fieldName: 'instructions', index: i })}
                          onChange={(e) => {
                            const val = e.target.value;
                            const newInst = [...emailConfig.instructions];
                            newInst[i] = val;
                            setTemplates(prev => ({
                              ...prev,
                              [activeTab]: { ...prev[activeTab as 'emailInvite' | 'emailReminder'], instructions: newInst }
                            }));
                          }}
                          className={`flex-1 rounded-md border px-3 py-1.5 text-xs outline-none focus:border-emerald-500 ${
                            isDark ? 'border-[#2e2e2e] bg-[#000] text-white' : 'border-slate-300 bg-slate-50 text-slate-900 focus:bg-white shadow-2xs'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newInst = emailConfig.instructions.filter((_, idx) => idx !== i);
                            setTemplates(prev => ({
                              ...prev,
                              [activeTab]: { ...prev[activeTab as 'emailInvite' | 'emailReminder'], instructions: newInst }
                            }));
                          }}
                          className="text-rose-500 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer Text */}
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${
                    isDark ? 'text-[#a1a1a1]' : 'text-slate-700 font-bold'
                  }`}>
                    Footer Contact Information
                  </label>
                  <input
                    type="text"
                    value={emailConfig.customFooter}
                    onFocus={() => setLastFocusedInput({ fieldName: 'customFooter' })}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTemplates(prev => ({
                        ...prev,
                        [activeTab]: { ...prev[activeTab as 'emailInvite' | 'emailReminder'], customFooter: val }
                      }));
                    }}
                    placeholder="e.g. Need Assistance? Call Dsource Support: {{support_phone}}"
                    className={`w-full rounded-md border px-3 py-2 text-xs sm:text-sm outline-none focus:border-emerald-500 transition-colors ${
                      isDark ? 'border-[#2e2e2e] bg-[#000] text-white' : 'border-slate-300 bg-slate-50 text-slate-900 focus:bg-white shadow-2xs'
                    }`}
                  />
                </div>
              </div>
            )}

            {/* WHATSAPP TEMPLATE FORM */}
            {!isEmailTab && (
              <div className="flex flex-col gap-4">
                {/* Headline Banner */}
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${
                    isDark ? 'text-[#a1a1a1]' : 'text-slate-700 font-bold'
                  }`}>
                    WhatsApp Headline Banner Line <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={waConfig.headline}
                    onFocus={() => setLastFocusedInput({ fieldName: 'headline' })}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTemplates(prev => ({
                        ...prev,
                        [activeTab]: { ...prev[activeTab as 'whatsappInvite' | 'whatsappReminder'], headline: val }
                      }));
                    }}
                    placeholder="e.g. 💼 *OFFICIAL INTERVIEW INVITATION*"
                    className={`w-full rounded-md border px-3 py-2 text-xs sm:text-sm outline-none focus:border-emerald-500 transition-colors ${
                      isDark ? 'border-[#2e2e2e] bg-[#000] text-white' : 'border-slate-300 bg-slate-50 text-slate-900 focus:bg-white shadow-2xs'
                    }`}
                  />
                </div>

                {/* Main Body */}
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${
                    isDark ? 'text-[#a1a1a1]' : 'text-slate-700 font-bold'
                  }`}>
                    WhatsApp Message Greeting & Introduction
                  </label>
                  <textarea
                    rows={4}
                    value={waConfig.body}
                    onFocus={() => setLastFocusedInput({ fieldName: 'body' })}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTemplates(prev => ({
                        ...prev,
                        [activeTab]: { ...prev[activeTab as 'whatsappInvite' | 'whatsappReminder'], body: val }
                      }));
                    }}
                    placeholder="e.g. Dear *{{candidate_name}}*,\n\nWe are pleased to invite you..."
                    className={`w-full rounded-md border p-3 text-xs sm:text-sm outline-none focus:border-emerald-500 transition-colors ${
                      isDark ? 'border-[#2e2e2e] bg-[#000] text-white' : 'border-slate-300 bg-slate-50 text-slate-900 focus:bg-white shadow-2xs'
                    }`}
                  />
                </div>

                {/* WhatsApp Toggles */}
                <div className={`flex flex-col gap-2 py-1 border-y ${
                  isDark ? 'border-[#2e2e2e]' : 'border-slate-200'
                }`}>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label className={`flex items-center gap-2 cursor-pointer rounded-lg border p-2.5 transition-colors ${
                      isDark ? 'border-[#2e2e2e] bg-[#000] hover:border-[#444]' : 'border-slate-200 bg-slate-50 hover:border-slate-300 shadow-2xs'
                    }`}>
                      <input
                        type="checkbox"
                        checked={waConfig.showJobDetails !== false}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setTemplates(prev => ({
                            ...prev,
                            [activeTab]: { ...prev[activeTab as 'whatsappInvite' | 'whatsappReminder'], showJobDetails: checked }
                          }));
                        }}
                        className="h-3.5 w-3.5 rounded accent-emerald-500 cursor-pointer"
                      />
                      <span className={`text-[11px] font-medium ${isDark ? 'text-[#ededed]' : 'text-slate-800'}`}>Job Details</span>
                    </label>

                    <label className={`flex items-center gap-2 cursor-pointer rounded-lg border p-2.5 transition-colors ${
                      isDark ? 'border-[#2e2e2e] bg-[#000] hover:border-[#444]' : 'border-slate-200 bg-slate-50 hover:border-slate-300 shadow-2xs'
                    }`}>
                      <input
                        type="checkbox"
                        checked={waConfig.showCredentials !== false}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setTemplates(prev => ({
                            ...prev,
                            [activeTab]: { ...prev[activeTab as 'whatsappInvite' | 'whatsappReminder'], showCredentials: checked }
                          }));
                        }}
                        className="h-3.5 w-3.5 rounded accent-emerald-500 cursor-pointer"
                      />
                      <span className={`text-[11px] font-medium ${isDark ? 'text-[#ededed]' : 'text-slate-800'}`}>Access Credentials</span>
                    </label>

                    <label className={`flex items-center gap-2 cursor-pointer rounded-lg border p-2.5 transition-colors ${
                      isDark ? 'border-[#2e2e2e] bg-[#000] hover:border-[#444]' : 'border-slate-200 bg-slate-50 hover:border-slate-300 shadow-2xs'
                    }`}>
                      <input
                        type="checkbox"
                        checked={waConfig.showRecruiterContact !== false}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setTemplates(prev => ({
                            ...prev,
                            [activeTab]: { ...prev[activeTab as 'whatsappInvite' | 'whatsappReminder'], showRecruiterContact: checked }
                          }));
                        }}
                        className="h-3.5 w-3.5 rounded accent-emerald-500 cursor-pointer"
                      />
                      <span className={`text-[11px] font-medium ${isDark ? 'text-[#ededed]' : 'text-slate-800'}`}>Recruiter Contact</span>
                    </label>
                  </div>

                  {/* Drag and drop re-orderable Job Details Manager */}
                  {waConfig.showJobDetails !== false && (
                    <JobDetailItemsManager
                      items={waConfig.jobDetailItems || DEFAULT_JOB_DETAILS_ITEMS}
                      onChange={(newItems) => {
                        setTemplates(prev => ({
                          ...prev,
                          [activeTab]: {
                            ...prev[activeTab as 'whatsappInvite' | 'whatsappReminder'],
                            jobDetailItems: newItems
                          }
                        }));
                      }}
                      onFocusInput={(fName) => setLastFocusedInput({ fieldName: fName })}
                    />
                  )}
                </div>

                {/* Pre-Interview Instructions */}
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${
                    isDark ? 'text-[#a1a1a1]' : 'text-slate-700 font-bold'
                  }`}>
                    Special Pre-Interview Instructions
                  </label>
                  <textarea
                    rows={3}
                    value={waConfig.instructions}
                    onFocus={() => setLastFocusedInput({ fieldName: 'instructions' })}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTemplates(prev => ({
                        ...prev,
                        [activeTab]: { ...prev[activeTab as 'whatsappInvite' | 'whatsappReminder'], instructions: val }
                      }));
                    }}
                    placeholder="1. Ensure working camera & mic..."
                    className={`w-full rounded-md border p-3 text-xs sm:text-sm outline-none focus:border-emerald-500 transition-colors ${
                      isDark ? 'border-[#2e2e2e] bg-[#000] text-white' : 'border-slate-300 bg-slate-50 text-slate-900 focus:bg-white shadow-2xs'
                    }`}
                  />
                </div>

                {/* Signoff / Closing */}
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${
                    isDark ? 'text-[#a1a1a1]' : 'text-slate-700 font-bold'
                  }`}>
                    Signoff / Closing Text
                  </label>
                  <textarea
                    rows={2}
                    value={waConfig.signoff}
                    onFocus={() => setLastFocusedInput({ fieldName: 'signoff' })}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTemplates(prev => ({
                        ...prev,
                        [activeTab]: { ...prev[activeTab as 'whatsappInvite' | 'whatsappReminder'], signoff: val }
                      }));
                    }}
                    placeholder="Best regards,\n*{{company_name}} Recruitment Team*"
                    className={`w-full rounded-md border p-3 text-xs sm:text-sm outline-none focus:border-emerald-500 transition-colors ${
                      isDark ? 'border-[#2e2e2e] bg-[#000] text-white' : 'border-slate-300 bg-slate-50 text-slate-900 focus:bg-white shadow-2xs'
                    }`}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Live Real-Time Preview (5 cols) */}
          <div className={`lg:col-span-5 flex flex-col gap-3 rounded-xl border p-5 shadow-xl sticky top-20 transition-colors ${
            isDark ? 'border-[#2e2e2e] bg-[#0a0a0a] text-white' : 'border-slate-200 bg-white text-slate-900 shadow-sm'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              isDark ? 'border-[#2e2e2e]' : 'border-slate-200'
            }`}>
              <h2 className={`text-sm font-semibold flex items-center gap-2 ${
                isDark ? 'text-white' : 'text-slate-900 font-extrabold'
              }`}>
                <Eye className="h-4 w-4 text-emerald-500" />
                <span>Live Interactive Preview</span>
              </h2>
              <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-300 text-emerald-800'
              }`}>
                Sample Candidate Data Active
              </span>
            </div>

            {/* Simple Basic Sample Candidate Data Section */}
            <div className={`p-3 rounded-lg border text-xs ${
              isDark ? 'bg-[#121212] border-[#242424] text-gray-300' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
              <div className="font-bold text-[11px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-2 flex items-center justify-between">
                <span>Sample Candidate Data Used in Preview</span>
                <span className="text-[10px] text-gray-400 font-normal">Auto-Replaced in Template</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                <div><span className="font-semibold text-gray-500 dark:text-gray-400">Candidate:</span> {SAMPLE_CONTEXT.candidate_name}</div>
                <div><span className="font-semibold text-gray-500 dark:text-gray-400">Job Title:</span> {SAMPLE_CONTEXT.job_title}</div>
                <div><span className="font-semibold text-gray-500 dark:text-gray-400">Deadline:</span> {SAMPLE_CONTEXT.interview_deadline}</div>
                <div><span className="font-semibold text-gray-500 dark:text-gray-400">Access Code:</span> {SAMPLE_CONTEXT.access_code}</div>
                <div><span className="font-semibold text-gray-500 dark:text-gray-400">Location:</span> {SAMPLE_CONTEXT.location}</div>
                <div><span className="font-semibold text-gray-500 dark:text-gray-400">Qualification:</span> {SAMPLE_CONTEXT.qualification}</div>
                <div><span className="font-semibold text-gray-500 dark:text-gray-400">Experience:</span> {SAMPLE_CONTEXT.experience}</div>
                <div><span className="font-semibold text-gray-500 dark:text-gray-400">Salary:</span> {SAMPLE_CONTEXT.salary}</div>
              </div>
            </div>

            {/* Render Preview according to Tab */}
            {isEmailTab ? (
              <div className={`rounded-xl overflow-hidden border shadow-2xl max-h-[600px] overflow-y-auto text-slate-800 ${
                isDark ? 'border-[#2e2e2e] bg-white' : 'border-slate-200 bg-white'
              }`}>
                <div
                  dangerouslySetInnerHTML={{
                    __html: getDesignerEmailTemplate(
                      SAMPLE_CONTEXT.candidate_name,
                      SAMPLE_CONTEXT.job_title,
                      SAMPLE_CONTEXT.interview_link,
                      SAMPLE_CONTEXT.access_code,
                      activeTab === 'emailReminder',
                      {
                        location: SAMPLE_CONTEXT.location,
                        qualification: SAMPLE_CONTEXT.qualification,
                        experience: SAMPLE_CONTEXT.experience,
                        salary: SAMPLE_CONTEXT.salary,
                        employmentType: SAMPLE_CONTEXT.employment_type,
                        deadline: SAMPLE_CONTEXT.interview_deadline,
                        recruiterName: userProfile?.displayName || userProfile?.name || SAMPLE_CONTEXT.recruiter_name,
                        recruiterPhone: userProfile?.phoneNumber || userProfile?.phone || SAMPLE_CONTEXT.recruiter_phone,
                        customTemplate: emailConfig
                      }
                    )
                  }}
                />
              </div>
            ) : (
              renderWhatsAppPreview(waConfig, activeTab === 'whatsappReminder')
            )}
          </div>

        </div>
      </div>

      {/* Test Send Modal */}
      {testModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md rounded-xl border p-6 shadow-2xl geist-sans transition-colors ${
            isDark ? 'border-[#2e2e2e] bg-[#121212] text-white' : 'border-slate-200 bg-white text-slate-900'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 mb-4 ${
              isDark ? 'border-[#2e2e2e]' : 'border-slate-200'
            }`}>
              <h3 className={`text-base font-bold flex items-center gap-2 ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}>
                <Send className="h-4 w-4 text-emerald-500" />
                <span>Send Test {isEmailTab ? 'Email' : 'WhatsApp'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className={`text-lg font-bold ${isDark ? 'text-[#878787] hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}
              >
                &times;
              </button>
            </div>

            <p className={`text-xs mb-4 ${isDark ? 'text-[#a1a1a1]' : 'text-slate-600'}`}>
              Send a real sample {isEmailTab ? 'Email via Amazon SES' : 'WhatsApp message via WhatsApp API'} using your active customized template to test delivery.
            </p>

            <div className="mb-4">
              <label className={`block text-xs font-semibold mb-1 ${isDark ? 'text-[#a1a1a1]' : 'text-slate-700'}`}>
                {isEmailTab ? 'Recipient Email Address' : 'Recipient Mobile / WhatsApp Phone (+91...)'}
              </label>
              <input
                type={isEmailTab ? 'email' : 'text'}
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder={isEmailTab ? 'you@example.com' : '9876543210'}
                className="w-full rounded-md border border-[#2e2e2e] bg-[#000] px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className="rounded-md border border-[#2e2e2e] bg-[#1a1a1a] px-4 py-2 text-xs font-semibold text-[#ededed] hover:border-[#444]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendTestMessage}
                disabled={sendingTest}
                className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-1.5"
              >
                {sendingTest ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                <span>{sendingTest ? 'Sending...' : 'Send Test Now'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecruiterTemplatesPage;
