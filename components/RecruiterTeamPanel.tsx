import React, { useEffect, useState } from 'react';
import { createCognitoUser } from '../services/authService';
import { poll, rds } from '../services/rdsApi';
import { useAuth } from '../context/AuthContext';
import { useMessageBox } from './MessageBox';
import { subscribeTeamAuditLogs, logTeamActivity } from '../services/auditService';
import { AuditLog, UserProfile } from '../types';
import { Users, UserPlus, Shield, Activity, Clock, CheckCircle2, AlertCircle, X, Sparkles, Briefcase, Mail, Phone, Key } from 'lucide-react';

export const RecruiterTeamPanel: React.FC = () => {
  const { user, userProfile } = useAuth();
  const messageBox = useMessageBox();

  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<'members' | 'audit'>('members');

  // Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [designation, setDesignation] = useState('Sub-Recruiter');
  const [subWaSessionId, setSubWaSessionId] = useState('');
  const [subWaPasscode, setSubWaPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const primaryUid = userProfile?.parentRecruiterId || userProfile?.teamId || user?.uid || '';
  const isPrimary = !userProfile?.parentRecruiterId && !(userProfile as any)?.isSubRecruiter && userProfile?.role !== 'sub_recruiter';

  // Team & Audit Logs should ONLY be visible to the main recruiter (Primary Owner), NOT sub-recruiters
  if (!isPrimary) {
    return null;
  }

  // Load team members from RDS
  useEffect(() => {
    if (!primaryUid) return;

    setLoadingMembers(true);
    return poll(
      () => rds.teamUsers(primaryUid),
      ({ users }) => {
        const members: UserProfile[] = (users || []).map((row: any) => ({
          ...(row as UserProfile),
          uid: row.uid || row.id,
        }));

        if (userProfile && !members.some((m) => m.uid === primaryUid)) {
          members.unshift({
            ...userProfile,
            uid: primaryUid,
            designation: userProfile.designation || 'Primary Recruiter / Account Owner',
          });
        }

        setTeamMembers(members);
        setLoadingMembers(false);
      },
      (err) => {
        console.warn('[Team Panel] Error loading team members:', err);
        setLoadingMembers(false);
      },
      10000
    );
  }, [primaryUid, userProfile]);

  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);

  // Lazy load Audit Logs ONLY when activeTab === 'audit'
  useEffect(() => {
    if (!primaryUid || activeTab !== 'audit') return;

    setLoadingAuditLogs(true);
    const unsub = subscribeTeamAuditLogs(primaryUid, (logs) => {
      setAuditLogs(logs);
      setLoadingAuditLogs(false);
    });
    return unsub;
  }, [primaryUid, activeTab]);

  const handleAddSubRecruiter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters and include upper, lower, and a number (Cognito policy).');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const created = await createCognitoUser({
        email: email.trim(),
        password,
        name: fullName.trim(),
        role: 'recruiter',
        parentRecruiterId: primaryUid,
        teamId: primaryUid,
        isSecondary: true,
        designation: designation.trim() || 'Secondary Recruiter',
      });

      const subUid = created.uid;

      // Cognito /auth/create-user already upserts the Postgres users row.
      await rds.updateUser(subUid, {
        fullname: fullName.trim(),
        displayName: fullName.trim(),
        designation: designation.trim() || 'Secondary Recruiter',
        whatsappSessionId: subWaSessionId.trim(),
        whatsappSessionPasscode: subWaPasscode.trim(),
        adminVerified: true,
      });

      await logTeamActivity(
        primaryUid,
        'secondary_recruiter_added',
        `Added secondary recruiter "${fullName.trim()}" (${designation.trim()})`,
        {
          uid: user?.uid || '',
          name: userProfile?.name || user?.email || 'Primary Recruiter',
          email: user?.email || '',
          role: 'recruiter',
          designation: 'Primary Recruiter'
        }
      );

      messageBox.showSuccess(`Secondary Recruiter "${fullName.trim()}" created successfully! They can now log in using ${email.trim()}.`);
      setShowAddModal(false);
      setFullName('');
      setEmail('');
      setPassword('');
      setDesignation('Sub-Recruiter');
    } catch (err: any) {
      console.error('[Add Sub-Recruiter Error]', err);
      setError(err.message || 'Failed to create secondary recruiter account.');
    } finally {
      setCreating(false);
    }
  };

  const [searchQuery, setSearchQuery] = useState('');

  // Filtered lists
  const filteredMembers = teamMembers.filter((m) => {
    const queryStr = searchQuery.toLowerCase().trim();
    if (!queryStr) return true;
    return (
      (m.name || '').toLowerCase().includes(queryStr) ||
      (m.email || '').toLowerCase().includes(queryStr) ||
      (m.designation || '').toLowerCase().includes(queryStr) ||
      (m.role || '').toLowerCase().includes(queryStr)
    );
  });

  const filteredLogs = auditLogs.filter((log) => {
    const queryStr = searchQuery.toLowerCase().trim();
    if (!queryStr) return true;
    return (
      (log.details || '').toLowerCase().includes(queryStr) ||
      (log.action || '').toLowerCase().includes(queryStr) ||
      (log.performedBy?.name || '').toLowerCase().includes(queryStr) ||
      (log.performedBy?.email || '').toLowerCase().includes(queryStr) ||
      (log.performedBy?.designation || '').toLowerCase().includes(queryStr) ||
      (log.createdAt ? new Date(log.createdAt).toLocaleString().toLowerCase().includes(queryStr) : false)
    );
  });

  const getLogIcon = (action: string) => {
    if (action.includes('whatsapp') || action.includes('invited') || action.includes('reminder')) {
      return <Mail size={16} className="text-emerald-400" />;
    }
    if (action.includes('job') || action.includes('interview')) {
      return <Briefcase size={16} className="text-blue-400" />;
    }
    if (action.includes('resume')) {
      return <Sparkles size={16} className="text-amber-400" />;
    }
    return <Clock size={16} className="text-purple-400" />;
  };

  return (
    <div className="border-t border-slate-200 dark:border-white/[0.11] bg-white dark:bg-black p-4 sm:p-6 lg:p-7 space-y-6">
      
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-white/[0.11] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="geist-section-title text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" /> Team & Audit Logs
            </h2>
            <span className="rounded-md bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-400">
              {teamMembers.length} {teamMembers.length === 1 ? 'Member' : 'Members'}
            </span>
          </div>
          <p className="geist-caption mt-1 text-slate-500 dark:text-[#9ca3af]">
            Manage secondary recruiters, share candidate responses, and view real-time audit logs of all job and candidate activities.
          </p>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
          {/* SEARCH BAR */}
          <div className="relative min-w-[200px] sm:min-w-[240px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={activeTab === 'audit' ? 'Search audit logs...' : 'Search members...'}
              className="w-full rounded-lg border border-slate-200 dark:border-white/[0.15] bg-slate-50 dark:bg-[#0c0c0c] pl-8 pr-8 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-[#6b7280] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <Activity className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400 dark:text-[#6b7280]" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 dark:text-[#6b7280] hover:text-slate-900 dark:hover:text-white"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 dark:border-white/[0.12] bg-slate-100 dark:bg-[#0c0c0c] p-1">
              <button
                onClick={() => setActiveTab('members')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === 'members' ? 'bg-white dark:bg-white/[0.1] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-[#9ca3af] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Users size={14} /> Team Members ({filteredMembers.length})
              </button>
              <button
                onClick={() => setActiveTab('audit')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === 'audit' ? 'bg-white dark:bg-white/[0.1] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-[#9ca3af] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Activity size={14} /> Audit Trail
              </button>
            </div>

            {isPrimary && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 transition-all cursor-pointer"
              >
                <UserPlus size={14} /> Add Sub-Recruiter
              </button>
            )}
          </div>
        </div>
      </div>

      {/* TAB 1: TEAM MEMBERS LIST */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/[0.11] bg-white dark:bg-[#080808]">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-white/[0.11]">
              <thead className="bg-slate-50 dark:bg-[#0c0c0c]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-[#9ca3af] uppercase tracking-wider">Member Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-[#9ca3af] uppercase tracking-wider">Email Address</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-[#9ca3af] uppercase tracking-wider">Designation / Role</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-[#9ca3af] uppercase tracking-wider">Account Access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/[0.08]">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-xs text-slate-500 dark:text-[#9ca3af]">
                      No team members found matching "{searchQuery}".
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((member) => {
                    const isOwner = !member.parentRecruiterId;
                    return (
                      <tr key={member.uid} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs ${
                              isOwner ? 'bg-amber-100 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-500/40 text-amber-800 dark:text-amber-300' : 'bg-blue-100 dark:bg-blue-500/20 border border-blue-300 dark:border-blue-500/40 text-blue-800 dark:text-blue-300'
                            }`}>
                              {member.name ? member.name.charAt(0).toUpperCase() : 'R'}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                {member.name || 'Recruiter'}
                                {isOwner && <Shield size={13} className="text-amber-600 dark:text-amber-400" />}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-[#6b7280]">UID: {member.uid.slice(0, 10)}...</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-700 dark:text-[#d1d5db]">
                          {member.email}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border ${
                            isOwner 
                              ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300'
                              : 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-800 dark:text-blue-300'
                          }`}>
                            <Briefcase size={12} /> {member.designation || (isOwner ? 'Primary Owner' : 'Sub-Recruiter')}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle2 size={13} /> Shared Jobs & Responses
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: REAL-TIME AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          {loadingAuditLogs ? (
            <div className="text-center py-12 border border-slate-200 dark:border-white/[0.11] rounded-xl bg-white dark:bg-[#080808] flex items-center justify-center gap-3">
              <Activity className="animate-spin h-5 w-5 text-blue-600 dark:text-blue-400" />
              <span className="text-xs text-slate-500 dark:text-[#9ca3af]">Loading real-time audit logs...</span>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-200 dark:border-white/[0.11] rounded-xl bg-white dark:bg-[#080808]">
              <Activity className="mx-auto h-8 w-8 text-slate-400 dark:text-[#6b7280] mb-2" />
              <p className="text-xs text-slate-500 dark:text-[#9ca3af]">
                {searchQuery ? `No audit events found matching "${searchQuery}".` : 'No audit events recorded yet. Activity like inviting candidates or creating jobs will appear here live.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLogs.map((log) => (
                <div key={log.id} className="p-4 rounded-xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#090909] hover:border-slate-300 dark:hover:border-white/[0.2] transition-all space-y-3 shadow-sm">
                  {/* Account Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-white/[0.06] pb-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-500/20 border border-blue-300 dark:border-blue-500/40 text-blue-800 dark:text-blue-300 flex items-center justify-center font-bold text-xs shrink-0">
                        {(log.performedBy?.name || log.performedBy?.email || 'R').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{log.performedBy?.name || 'Recruiter Account'}</span>
                          {log.performedBy?.email && (
                            <span className="text-[11px] text-slate-500 dark:text-[#9ca3af] font-normal">({log.performedBy.email})</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-[#6b7280]">
                          Account Designation: <span className="text-blue-600 dark:text-blue-400 font-medium">{log.performedBy?.designation || 'Recruiter'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-[#d1d5db] border-slate-200 dark:border-white/[0.1]">
                        {log.action.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-[#6b7280] font-mono">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString() : 'Just now'}
                      </span>
                    </div>
                  </div>

                  {/* Activity Details / Candidate & Job Focus */}
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
                      {getLogIcon(log.action || '')}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white leading-relaxed">
                        {log.details}
                      </p>

                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        {/* Inviting Account Email */}
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-[11px] font-medium text-blue-800 dark:text-blue-300">
                          <Mail size={12} className="text-blue-600 dark:text-blue-400" />
                          <span>Invited By Account: <strong className="text-slate-900 dark:text-white">{log.performedBy?.name || 'Recruiter'} ({log.performedBy?.email || 'N/A'})</strong></span>
                        </span>

                        {/* Candidate Email & Mobile Badges */}
                        {(() => {
                          const text = log.details || '';
                          const emailMatches = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g) || [];
                          const phoneMatches = text.match(/(\b[6-9]\d{9}\b|\(\d{10}\))/g) || [];
                          
                          const candEmails = Array.from(new Set(emailMatches.filter(
                            (e) => e.toLowerCase() !== log.performedBy?.email?.toLowerCase() && e.toLowerCase() !== 'invites@snab.co.in'
                          )));
                          const candPhones = Array.from(new Set(phoneMatches));

                          return (
                            <>
                              {candEmails.map((candEmail, idx) => (
                                <span key={`email-${idx}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                                  <Mail size={12} className="text-emerald-600 dark:text-emerald-400" />
                                  <span>Invited To Candidate Email: <strong className="text-slate-900 dark:text-white">{candEmail}</strong></span>
                                </span>
                              ))}
                              {candPhones.map((phone, idx) => (
                                <span key={`phone-${idx}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                                  <Phone size={12} className="text-emerald-600 dark:text-emerald-400" />
                                  <span>Candidate Mobile: <strong className="text-slate-900 dark:text-white">{phone}</strong></span>
                                </span>
                              ))}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL: ADD SECONDARY RECRUITER */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4">
          <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-white/[0.15] bg-white dark:bg-[#0d0d0d] p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.1] pb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus className="text-blue-600 dark:text-blue-400" size={20} /> Add Secondary Recruiter
              </h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 dark:text-[#9ca3af] hover:text-slate-900 dark:hover:text-white transition-colors p-1"
              >
                <X size={18} />
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleAddSubRecruiter} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#d1d5db] mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Sarah Jenkins"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-white/[0.12] bg-[#141414] px-3.5 py-2.5 text-xs text-white placeholder-[#6b7280] focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#d1d5db] mb-1">Designation / Role Title</label>
                <input
                  type="text"
                  placeholder="e.g. Technical Hiring Lead, Sub-Recruiter"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="w-full rounded-lg border border-white/[0.12] bg-[#141414] px-3.5 py-2.5 text-xs text-white placeholder-[#6b7280] focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#d1d5db] mb-1">Login Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-[#6b7280]" />
                  <input
                    type="email"
                    placeholder="sarah@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-white/[0.12] bg-[#141414] pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-[#6b7280] focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#d1d5db] mb-1">Password</label>
                <div className="relative">
                  <Key className="absolute left-3 top-3 h-4 w-4 text-[#6b7280]" />
                  <input
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-white/[0.12] bg-[#141414] pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-[#6b7280] focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="border-t border-white/[0.1] pt-3 space-y-3">
                <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                  <Phone size={14} /> WhatsApp Credentials (Optional)
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-[#9ca3af] mb-1">WhatsApp Session ID</label>
                    <input
                      type="text"
                      placeholder="e.g. aa"
                      value={subWaSessionId}
                      onChange={(e) => setSubWaSessionId(e.target.value)}
                      className="w-full rounded-lg border border-white/[0.12] bg-[#141414] px-3 py-2 text-xs text-white placeholder-[#6b7280] focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#9ca3af] mb-1">Passcode</label>
                    <input
                      type="password"
                      placeholder="e.g. ."
                      value={subWaPasscode}
                      onChange={(e) => setSubWaPasscode(e.target.value)}
                      className="w-full rounded-lg border border-white/[0.12] bg-[#141414] px-3 py-2 text-xs text-white placeholder-[#6b7280] focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg border border-white/[0.12] text-xs font-semibold text-[#9ca3af] hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-lg shadow-blue-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {creating ? 'Creating Account...' : 'Create Sub-Recruiter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
