import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, deleteDoc, doc, updateDoc, arrayUnion, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { Interview } from '../types';
import * as pdfjsLib from 'pdfjs-dist';
import * as mammoth from 'mammoth';
import { useMessageBox } from '../components/MessageBox';
import { createPortal } from 'react-dom';
import { sendInterviewInvitations } from '../services/brevoService';
import EditJobModal from './EditJob';

import { evaluateResumeMatch } from '../services/api';

// Setup PDF.js worker to enable PDF parsing
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const RecruiterInterviews: React.FC = () => {
  const { user } = useAuth();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [newEmails, setNewEmails] = useState<string[]>([]);
  const [parsedCandidates, setParsedCandidates] = useState<{email: string, phone: string, matchScore?: string}[]>([]);
  const [submissionsMap, setSubmissionsMap] = useState<Record<string, any[]>>({});
  const [parsingResumes, setParsingResumes] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [editingCandidateEmail, setEditingCandidateEmail] = useState<string | null>(null);
  const [editedEmailValue, setEditedEmailValue] = useState('');
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const [remindingInterviewId, setRemindingInterviewId] = useState<string | null>(null);
  const [whatsappModal, setWhatsappModal] = useState<{
      isOpen: boolean;
      email: string;
      phone: string;
      message: string;
      interview: Interview;
  } | null>(null);

  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [dateMode, setDateMode] = useState<'range' | 'specific'>('range');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [specificDate, setSpecificDate] = useState('');

  // Full Screen View Modals
  const [fullJdModal, setFullJdModal] = useState<{ isOpen: boolean; title: string; description: string } | null>(null);
  const [fullRosterModal, setFullRosterModal] = useState<{ isOpen: boolean; interview: Interview } | null>(null);

  const messageBox = useMessageBox();
  const navigate = useNavigate();
  const actionButtonClass = 'inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-200 text-xs font-semibold hover:bg-white dark:hover:bg-gray-800 transition-colors';

  useEffect(() => {
    if (!user) {
        setLoading(false);
        return;
    };

    setLoading(true);
    const interviewsQuery = query(
      collection(db, 'interviews'),
      where('recruiterUID', '==', user.uid)
    );

    const unsubscribe = onSnapshot(interviewsQuery, async (querySnapshot) => {
      const interviewsData = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Interview))
        .filter(interview => (interview as any).isMock !== true)
        .sort((a, b) => {
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0;
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0;
          return timeB - timeA;
        });
      setInterviews(interviewsData);
      
      const newSubmissionsMap: Record<string, any[]> = {};
      for (const interview of interviewsData) {
         try {
             const qs = await getDocs(collection(db, 'interviews', interview.id, 'attempts'));
             newSubmissionsMap[interview.id] = qs.docs.map(d => ({ id: d.id, ...d.data() }));
         } catch (e) {
             console.error("Error fetching submissions for", interview.id, e);
             newSubmissionsMap[interview.id] = [];
         }
      }
      setSubmissionsMap(newSubmissionsMap);
      setLoading(false);
    }, (err) => {
        console.error("Error fetching interviews:", err);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleDelete = (interviewId: string) => {
    messageBox.showConfirm("Are you sure you want to delete this interview?", async () => {
      try {
        await deleteDoc(doc(db, 'interviews', interviewId));
      } catch (err) {
        messageBox.showError("Error deleting interview");
      }
    });
  };

  const openInviteModal = (interview: Interview) => {
    setSelectedInterview(interview);
    setIsInviteModalOpen(true);
  };

  const handleRemoveNewEmail = (emailToRemove: string) => {
      setNewEmails(newEmails.filter(email => email !== emailToRemove));
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setParsingResumes(true);
    const newCandidatesFound: {email: string, phone: string, matchScore?: string}[] = [];
    let filesProcessed = 0;
    let filesWithErrors = 0;

    const parsePromises = Array.from(files).map(async (f) => {
      const file = f as File;
      let text = '';
      try {
        if (file.type === 'application/pdf') {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            text += textContent.items.map((item: any) => item.str).join(' ');
          }
        } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          text = result.value;
        } else if (file.type === 'text/plain') {
          text = await file.text();
        } else {
          return; // Skip unsupported file types
        }

        const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
        const phoneMatch = text.match(/(?:\+?\d{1,4}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/);

        if (emailMatch) {
            const lowerEmail = emailMatch[1].toLowerCase();
            const phone = phoneMatch ? phoneMatch[0] : 'N/A';
            
            // Check if not already invited/added
            // We use functional updates later, but for the map function, we check against the current state array.
            if (!(selectedInterview?.candidateEmails || []).includes(lowerEmail) && !newEmails.includes(lowerEmail)) {
                
                // Fetch AI match score
                let matchScore = "N/A";
                if (selectedInterview && text.length > 50) {
                    try {
                        matchScore = await evaluateResumeMatch(selectedInterview.title, selectedInterview.description, text);
                    } catch (e) {
                        console.error('Match score error:', e);
                    }
                }
                
                // Ensure thread-safety for pushing to array
                if (!newCandidatesFound.some(c => c.email === lowerEmail)) {
                    newCandidatesFound.push({ email: lowerEmail, phone, matchScore });
                }
            }
        }
        filesProcessed++;
      } catch (error) {
        console.error(`Error parsing ${file.name}:`, error);
        filesWithErrors++;
      }
    });

    await Promise.all(parsePromises);

    if (newCandidatesFound.length > 0) {
        setNewEmails(prev => [...prev, ...newCandidatesFound.map(c => c.email)]);
        setParsedCandidates(prev => [...prev, ...newCandidatesFound]);
    }
    
    messageBox.showInfo(`Processed ${filesProcessed} file(s). Found ${newCandidatesFound.length} new candidate(s). ${filesWithErrors > 0 ? `Failed to parse ${filesWithErrors} file(s).` : ''}`);
    setParsingResumes(false);
    e.target.value = ''; // Reset file input
  };

  const handleEditAndResend = async (oldEmail: string, newEmail: string) => {
    if (!selectedInterview || !newEmail || oldEmail === newEmail) {
        setEditingCandidateEmail(null);
        return;
    }
    
    setResendingEmail(oldEmail);
    try {
        const updatedEmails = (selectedInterview.candidateEmails || []).filter(e => e.toLowerCase() !== oldEmail.toLowerCase());
        updatedEmails.push(newEmail.toLowerCase());

        await updateDoc(doc(db, 'interviews', selectedInterview.id), { 
            candidateEmails: updatedEmails
        });
        
        setSelectedInterview({...selectedInterview, candidateEmails: updatedEmails});
        
        const result = await sendInterviewInvitations(
            [newEmail],
            selectedInterview.title,
            selectedInterview.interviewLink || '',
            selectedInterview.accessCode
        );

        if (result.success) {
            messageBox.showSuccess(`Email updated and invitation resent to ${newEmail}!`);
        } else {
            messageBox.showError(`Failed to resend email: ${result.error}`);
        }
    } catch (error: any) {
        console.error('Edit & Resend error:', error);
        messageBox.showError('Failed to update and resend invitation.');
    } finally {
        setResendingEmail(null);
        setEditingCandidateEmail(null);
    }
  };

  const handleResend = async (email: string) => {
    if (!selectedInterview) return;
    setResendingEmail(email);
    try {
        const result = await sendInterviewInvitations(
            [email],
            selectedInterview.title,
            selectedInterview.interviewLink || '',
            selectedInterview.accessCode
        );

        if (result.success) {
            messageBox.showSuccess(`Invitation resent to ${email}!`);
        } else {
            messageBox.showError(`Failed to resend email: ${result.error}`);
        }
    } catch (error: any) {
        console.error('Resend error:', error);
        messageBox.showError('Failed to resend invitation.');
    } finally {
        setResendingEmail(null);
    }
  };

  const handleAllowReattempt = async (interviewId: string, attemptId: string, currentAllowValue: boolean) => {
    try {
        const attemptRef = doc(db, 'interviews', interviewId, 'attempts', attemptId);
        await updateDoc(attemptRef, {
            allowReattempt: !currentAllowValue
        });
        messageBox.showSuccess(!currentAllowValue ? "Reattempt permission granted!" : "Reattempt permission removed.");
    } catch (err: any) {
        console.error("Error updating reattempt status:", err);
        messageBox.showError("Failed to update reattempt status.");
    }
  };

  const handleSendBulkReminders = async (interview: Interview) => {
    const explicitEmails = (interview.candidateEmails || []).map(e => e.toLowerCase());
    const submissions = submissionsMap[interview.id] || [];
    const pendingEmails = explicitEmails.filter(email => {
        return !submissions.some(sub => (sub.candidateInfo?.email || '').toLowerCase() === email);
    });

    if (pendingEmails.length === 0) {
        messageBox.showInfo('No pending candidates found. Everyone invited has already submitted.');
        return;
    }

    setRemindingInterviewId(interview.id);
    try {
        const result = await sendInterviewInvitations(
            pendingEmails,
            interview.title,
            interview.interviewLink || '',
            interview.accessCode,
            true
        );

        if (result.success) {
            messageBox.showSuccess(`Reminders sent successfully to ${result.totalEmails} candidate(s)!`);
        } else {
            messageBox.showError(`Failed to send some reminders: ${result.error}`);
        }
    } catch (error: any) {
        console.error('Bulk remind error:', error);
        messageBox.showError('Failed to send reminders.');
    } finally {
        setRemindingInterviewId(null);
    }
  };

  const handleSendInvites = async () => {
    if (!selectedInterview || newEmails.length === 0) return;
    
    setSendingEmails(true);
    try {
        const candidateDataToAdd = newEmails.map(email => {
            const parsed = parsedCandidates.find(c => c.email.toLowerCase() === email.toLowerCase());
            return {
                email: email.toLowerCase(),
                phone: parsed?.phone || 'N/A',
                matchScore: parsed?.matchScore || 'N/A'
            };
        });

        await updateDoc(doc(db, 'interviews', selectedInterview.id), { 
            candidateEmails: arrayUnion(...newEmails),
            candidateData: arrayUnion(...candidateDataToAdd)
        });
        
        const result = await sendInterviewInvitations(
            newEmails,
            selectedInterview.title,
            selectedInterview.interviewLink || '',
            selectedInterview.accessCode
        );

        if (result.success) {
            messageBox.showSuccess(`Successfully sent ${result.totalEmails} invitation(s)!`);
            setIsInviteModalOpen(false);
            setSelectedInterview(null);
            setNewEmails([]);
        } else {
            messageBox.showError(`Failed to send emails: ${result.error}`);
        }
    } catch (error: any) {
        console.error('Invite sending error:', error);
        messageBox.showError('Failed to send invitations.');
    } finally {
        setSendingEmails(false);
    }
  };


  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
    </div>
  );

  const departments = ['All', ...Array.from(new Set(interviews.map(i => i.department).filter(Boolean)))];

  const filteredInterviews = interviews.filter(interview => {
    // 1. Search Query filter (title, department, description)
    const matchesSearch = 
      !searchQuery ||
      interview.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      interview.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      interview.description?.toLowerCase().includes(searchQuery.toLowerCase());
      
    // 2. Department filter
    const matchesDept = selectedDept === 'All' || interview.department === selectedDept;
    
    // 3. Date range or specific date filter
    let matchesDate = true;
    if (interview.createdAt) {
      const createdDate = interview.createdAt.toDate ? interview.createdAt.toDate() : new Date((interview.createdAt as any).seconds * 1000);
      const createdTime = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate()).getTime();

      if (dateMode === 'specific' && specificDate) {
        const spec = new Date(specificDate);
        const specTime = new Date(spec.getFullYear(), spec.getMonth(), spec.getDate()).getTime();
        if (createdTime !== specTime) matchesDate = false;
      } else if (dateMode === 'range') {
        if (startDate) {
          const start = new Date(startDate);
          const startTime = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
          if (createdTime < startTime) matchesDate = false;
        }
        if (endDate) {
          const end = new Date(endDate);
          const endTime = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
          if (createdTime > endTime) matchesDate = false;
        }
      }
    } else if ((dateMode === 'specific' && specificDate) || (dateMode === 'range' && (startDate || endDate))) {
      matchesDate = false;
    }
    
    return matchesSearch && matchesDept && matchesDate;
  });

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2 border-b border-gray-200 dark:border-white/5">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">My Interviews</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage all your scheduled interviews.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/recruiter/interview/create" className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white dark:text-black font-semibold rounded-full shadow-lg shadow-primary/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 text-sm">
            <i className="fas fa-plus" title="Create a new interview route link"></i> <span>Create New Interview</span>
          </Link>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-white dark:bg-[#111] p-4 rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
          {/* Search bar */}
          <div className="relative w-full md:max-w-xs">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 dark:text-gray-500 pointer-events-none">
                  <i className="fas fa-search text-xs"></i>
              </span>
              <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search interviews or JDs..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-zinc-800 rounded-xl bg-gray-50 dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-200 text-xs font-semibold outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  title="Type keywords to filter interviews by title, department, or JD description"
              />
          </div>

          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
              {/* Dynamic Department Selector */}
              <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 tracking-wider">Dept:</span>
                  <select
                      value={selectedDept}
                      onChange={(e) => setSelectedDept(e.target.value)}
                      className="px-2.5 py-1.5 border border-gray-200 dark:border-zinc-800 rounded-xl bg-gray-50 dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-200 text-xs font-semibold outline-none focus:ring-1 focus:ring-primary"
                      title="Filter interviews by specific department"
                  >
                      {departments.map(dept => (
                          <option key={dept} value={dept}>{dept}</option>
                      ))}
                  </select>
              </div>

              {/* Date Mode Toggle & Inputs */}
              <div className="flex items-center gap-2 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-zinc-800 rounded-xl px-2.5 py-1 flex-wrap">
                  {/* Mode Selector Toggle */}
                  <div className="flex bg-gray-200 dark:bg-zinc-800 rounded-lg p-0.5 mr-1 shrink-0">
                      <button
                          type="button"
                          onClick={() => setDateMode('range')}
                          className={`px-2 py-0.5 text-[9px] font-bold rounded-md transition-all ${dateMode === 'range' ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                      >
                          Range
                      </button>
                      <button
                          type="button"
                          onClick={() => setDateMode('specific')}
                          className={`px-2 py-0.5 text-[9px] font-bold rounded-md transition-all ${dateMode === 'specific' ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                      >
                          Specific
                      </button>
                  </div>

                  {dateMode === 'specific' ? (
                      <div className="flex items-center gap-1.5 shrink-0 animate-in fade-in duration-200">
                          <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 tracking-wider">On Date:</span>
                          <input
                              type="date"
                              value={specificDate}
                              onChange={(e) => setSpecificDate(e.target.value)}
                              className="bg-transparent text-gray-700 dark:text-gray-200 text-xs font-semibold focus:outline-none dark:[color-scheme:dark]"
                              title="Select a specific date to filter"
                          />
                      </div>
                  ) : (
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap animate-in fade-in duration-200">
                          <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 tracking-wider">From:</span>
                          <input
                              type="date"
                              value={startDate}
                              onChange={(e) => setStartDate(e.target.value)}
                              className="bg-transparent text-gray-700 dark:text-gray-200 text-xs font-semibold focus:outline-none dark:[color-scheme:dark]"
                              title="Select start date to filter"
                          />
                          <span className="text-gray-400 text-xs font-semibold">to</span>
                          <input
                              type="date"
                              value={endDate}
                              onChange={(e) => setEndDate(e.target.value)}
                              className="bg-transparent text-gray-700 dark:text-gray-200 text-xs font-semibold focus:outline-none dark:[color-scheme:dark]"
                              title="Select end date to filter"
                          />
                      </div>
                  )}
              </div>

              {/* Clear Filters Button */}
              {(searchQuery || selectedDept !== 'All' || startDate || endDate || specificDate) && (
                  <button
                      onClick={() => {
                          setSearchQuery('');
                          setSelectedDept('All');
                          setStartDate('');
                          setEndDate('');
                          setSpecificDate('');
                      }}
                      className="px-2.5 py-1.5 text-xs text-red-500 hover:text-red-600 font-bold transition-colors flex items-center gap-1"
                      title="Reset all search queries and active filters to default state"
                  >
                      <i className="fas fa-undo-alt"></i> Clear
                  </button>
              )}
          </div>
      </div>

      <style>{`
        .custom-card-scrollbar::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        .custom-card-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-card-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(156, 163, 175, 0.25);
          border-radius: 9999px;
        }
        .custom-card-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(156, 163, 175, 0.45);
        }
        .interview-list-card button {
          display: none;
        }
      `}</style>

      {interviews.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#111] rounded-2xl border border-gray-200 dark:border-white/5 border-dashed">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-500">
                <i className="fas fa-video text-2xl"></i>
            </div>
            <p className="text-gray-500 dark:text-gray-400 mb-6">You haven't created any interviews yet.</p>
            <Link to="/recruiter/interview/create" className="text-primary font-medium hover:underline hover:text-primary-light transition-colors">Create your first interview</Link>
        </div>
      ) : (
        <>
          {filteredInterviews.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-[#111] rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm">
                <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-400">
                    <i className="fas fa-search text-base"></i>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm font-semibold">No interviews match your filters.</p>
                <button
                    onClick={() => {
                        setSearchQuery('');
                        setSelectedDept('All');
                        setStartDate('');
                        setEndDate('');
                        setSpecificDate('');
                    }}
                    className="mt-3 text-xs font-bold text-primary hover:underline"
                    title="Clear filters to view all interviews"
                >
                    Reset Filters
                </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredInterviews.map(interview => (
                <div key={interview.id} className="interview-list-card bg-white dark:bg-[#111] rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-white/10 p-5 flex flex-col h-[510px] justify-between transition-all duration-300 transform hover:-translate-y-1">
                    
                    {/* Upper Half: Header & Job Description */}
                    <div>
                        {/* Title Block */}
                        <div className="mb-2">
                            <h3 className="text-base font-extrabold text-gray-900 dark:text-white leading-snug line-clamp-2" title={interview.title}>
                                {interview.title}
                            </h3>
                        </div>

                        {/* Subheader Row */}
                        <div className="flex justify-between items-center gap-4 mb-3">
                            <p className="text-xs text-gray-400 dark:text-gray-500 font-semibold">
                                {interview.department || "No Department"}
                            </p>
                            <span className="text-[9px] font-mono text-gray-400 dark:text-gray-500">ID: #{interview.id.substring(0, 8)}</span>
                        </div>
 
                        {/* Metadata Badges with custom hovers */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {/* Questions Count Badge */}
                            <div className="relative group">
                                <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold rounded border border-blue-100/50 dark:border-blue-900/20 flex items-center gap-1 shrink-0">
                                    <i className="fas fa-question-circle"></i> {interview.questions?.length || (((interview as any).manualQuestions?.length || 0) + ((interview as any).numQuestions || 5))} Qs
                                </span>
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-900 dark:bg-zinc-800 text-white text-[9px] font-bold rounded border border-zinc-800 dark:border-zinc-700 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                    Questions: {interview.questions?.length || (((interview as any).manualQuestions?.length || 0) + ((interview as any).numQuestions || 5))}
                                </div>
                            </div>

                            {/* Level Badge */}
                            <div className="relative group">
                                <span className="px-2 py-0.5 bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 text-[10px] font-bold rounded border border-purple-100/50 dark:border-purple-900/20 flex items-center gap-1 shrink-0" title="Assessment challenge difficulty level">
                                    <i className="fas fa-brain"></i> {interview.difficulty || "Medium"}
                                </span>
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-900 dark:bg-zinc-800 text-white text-[9px] font-bold rounded border border-zinc-800 dark:border-zinc-700 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                    Difficulty: {interview.difficulty || "Medium"}
                                </div>
                            </div>

                            {/* Strictness Badge */}
                            {interview.strictness && (
                                <div className="relative group">
                                    <span className="px-2 py-0.5 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-[10px] font-bold rounded border border-red-100/50 dark:border-red-900/20 flex items-center gap-1 shrink-0" title="AI Proctoring monitoring level active">
                                        <i className="fas fa-shield-alt"></i> {interview.strictness}
                                    </span>
                                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-900 dark:bg-zinc-800 text-white text-[9px] font-bold rounded border border-zinc-800 dark:border-zinc-700 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                        Proctoring: {interview.strictness}
                                    </div>
                                </div>
                            )}
                        </div>
 
                        {/* Job Description (JD) with Scrollbar */}
                        <div className="mt-4">
                            <div className="flex justify-between items-center mb-1">
                                <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                    Job Description
                                </h4>
                            </div>
                            <div className="h-[75px] overflow-y-auto pr-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed custom-card-scrollbar">
                                {interview.description || "No description provided."}
                            </div>
                        </div>
                    </div>
 
                    {/* Middle: Candidate List */}
                    <div className="flex-grow flex flex-col min-h-0 mt-3 pt-3 border-t border-gray-100 dark:border-white/5">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
                                <span>Track Roster</span>
                            </h4>
                            <span 
                                className={submissionsMap[interview.id]?.length > 0 ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded-full text-[9px] font-extrabold border border-emerald-100 dark:border-emerald-900/20" : "text-gray-500 bg-gray-50 dark:bg-zinc-800 px-2 py-0.5 rounded-full text-[9px] font-extrabold border border-gray-100 dark:border-zinc-700/30"}
                                title="Total candidate submissions received for this interview"
                            >
                                {submissionsMap[interview.id]?.length || 0} Responses
                            </span>
                        </div>
                        <div className="flex-grow overflow-y-auto pr-1 space-y-1.5 custom-card-scrollbar max-h-[140px]">
                            {(() => {
                                const explicitEmails = (interview.candidateEmails || []).map(e => e.toLowerCase());
                                const submissions = submissionsMap[interview.id] || [];
                                const unifiedList: {email: string, hasSubmitted: boolean, attemptId?: string, allowReattempt?: boolean}[] = [];
                                
                                // 1. Add all actual submissions (invited or uninvited)
                                submissions.forEach(sub => {
                                    unifiedList.push({ 
                                        email: sub.candidateInfo?.email || 'N/A', 
                                        hasSubmitted: true,
                                        attemptId: sub.id,
                                        allowReattempt: sub.allowReattempt || false
                                    });
                                });

                                // 2. Add explicitly invited members who haven't submitted yet
                                explicitEmails.forEach(email => {
                                    const hasSubmitted = submissions.some(sub => (sub.candidateInfo?.email || '').toLowerCase() === email);
                                    if (!hasSubmitted && !unifiedList.some(u => u.email.toLowerCase() === email)) {
                                        unifiedList.push({ email, hasSubmitted: false });
                                    }
                                });

                                if (unifiedList.length === 0) {
                                    return <p className="text-[11px] text-gray-400 italic block py-4 text-center">No candidates invited yet.</p>;
                                }

                                return unifiedList.map((cand, idx) => (
                                    <div key={idx} className="flex justify-between items-center bg-gray-50 dark:bg-black/20 text-[11px] rounded-lg px-2.5 py-1.5 border border-gray-100 dark:border-white/5">
                                        <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[120px] lg:max-w-[140px]" title={cand.email}>
                                            {cand.email}
                                        </span>
                                        {cand.hasSubmitted ? (
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <span className="text-green-600 dark:text-green-400 font-bold flex items-center gap-1">
                                                    <i className="fas fa-check-circle"></i> Submitted
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleAllowReattempt(interview.id, cand.attemptId!, cand.allowReattempt || false)}
                                                    className={`inline-flex items-center gap-0.5 px-1 py-0.5 border rounded text-[9px] font-bold transition-all ${
                                                        cand.allowReattempt 
                                                            ? 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-800/50' 
                                                            : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-zinc-700'
                                                    }`}
                                                    title={cand.allowReattempt ? "Remove Reattempt Chance" : "Give Reattempt Chance"}
                                                >
                                                    <i className="fas fa-redo text-[8px]"></i>
                                                    <span>{cand.allowReattempt ? 'Allowed' : 'Reattempt'}</span>
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <span className="text-yellow-600 dark:text-yellow-500 font-semibold flex items-center gap-1">
                                                    <i className="fas fa-clock"></i> Pending
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const candData = (interview as any).candidateData?.find((c: any) => c.email?.toLowerCase() === cand.email?.toLowerCase());
                                                        const phone = candData?.phone || '';
                                                        const link = `${window.location.origin}/#/interview/${interview.id}`;
                                                        const msg = `👋 Hi there!\n\nWe're actively hiring for the *${interview.title}* role and we'd love to invite you to take our AI-powered interview to fast-track your application! 🌟\n\n🚀 *Start your interview here:* \n${link}\n\n🔑 *Your Access Code:* \n${interview.accessCode}\n\nIt only takes a few minutes and you can complete it whenever you're ready. Best of luck! 🎉`;
                                                        setWhatsappModal({
                                                            isOpen: true,
                                                            email: cand.email,
                                                            phone: phone === 'N/A' ? '' : phone,
                                                            message: msg,
                                                            interview: interview
                                                        });
                                                    }}
                                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 rounded text-[9px] font-extrabold transition-all"
                                                    title="Invite via WhatsApp Web"
                                                >
                                                    <i className="fab fa-whatsapp"></i>
                                                    <span>Invite</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ));
                            })()}
                        </div>
                    </div>

                    {/* Bottom: Divider & Call to Actions */}
                    <div className="border-t border-gray-100 dark:border-white/5 pt-3 mt-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Link
                                to={`/recruiter/interview/${interview.id}/overview`}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow transition-all transform hover:-translate-y-0.5 active:translate-y-0 text-center"
                            >
                                <i className="fas fa-sliders-h text-xs"></i>
                                <span>Manage</span>
                            </Link>
                        </div>
                        <div className="flex justify-between items-center text-[9px] text-gray-400 dark:text-gray-500 font-medium px-0.5">
                            <span>Created: {interview.createdAt?.toDate ? interview.createdAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</span>
                            <span className="font-mono">ID: #{interview.id.substring(0, 8)}</span>
                        </div>
                    </div>

                </div>
            ))}
            </div>
          )}
        </>
      )}

    {isInviteModalOpen && selectedInterview && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col text-gray-900 dark:text-white">
                <h3 className="font-bold text-lg p-4 border-b border-gray-200 dark:border-gray-700">Invite Candidates</h3>
                <div className="p-4 space-y-4 overflow-y-auto">
                    <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg space-y-3">
                        <div>
                            <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-1">Access Code</h4>
                            <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-600">
                                <span className="font-mono tracking-widest">{selectedInterview.accessCode}</span>
                                <button onClick={() => {navigator.clipboard.writeText(selectedInterview.accessCode || ''); messageBox.showSuccess('Access code copied!');}} className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors" title="Copy Access Code">
                                    <i className="fas fa-copy"></i>
                                </button>
                            </div>
                        </div>
                        <div>
                            <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-1">Interview Link</h4>
                            <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-600">
                                <span className="text-sm truncate mr-2 text-gray-600 dark:text-gray-400">
                                    {selectedInterview.interviewLink || `${window.location.origin}/#/interview/${selectedInterview.id}`}
                                </span>
                                <button onClick={() => {
                                    const link = selectedInterview.interviewLink || `${window.location.origin}/#/interview/${selectedInterview.id}`;
                                    navigator.clipboard.writeText(link);
                                    messageBox.showSuccess('Interview link copied!');
                                }} className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors" title="Copy Interview Link">
                                    <i className="fas fa-link"></i>
                                </button>
                            </div>
                        </div>
                        <div className="pt-2 text-right">
                             <button onClick={() => {
                                    const link = selectedInterview.interviewLink || `${window.location.origin}/#/interview/${selectedInterview.id}`;
                                    const text = `You've been invited to an interview for ${selectedInterview.title}.\n\nInterview Link: ${link}\nAccess Code: ${selectedInterview.accessCode}`;
                                    navigator.clipboard.writeText(text);
                                    messageBox.showSuccess('Full invite details copied!');
                             }} className="text-xs font-semibold text-primary hover:text-primary-dark">
                                 <i className="fas fa-clipboard-list mr-1"></i> Copy Full Invite Details
                             </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2">Upload Resume to Find Email</label>
                        <label className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                            <i className={`fas fa-cloud-upload-alt ${parsingResumes ? 'fa-spin' : ''}`}></i>
                            <span className="font-medium text-sm">{parsingResumes ? 'Parsing Resumes...' : 'Upload Resumes (PDF/DOCX/TXT)'}</span>
                            <input type="file" multiple accept=".pdf,.txt,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={handleResumeUpload} disabled={parsingResumes} />
                        </label>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2">Add Candidate Manually</label>
                        <div className="flex gap-2">
                            <input 
                                type="email" 
                                value={newEmail} 
                                onChange={(e) => setNewEmail(e.target.value)} 
                                placeholder="Candidate email" 
                                className="flex-1 p-2 border rounded bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-sm outline-none" 
                            />
                            <input 
                                type="tel" 
                                value={manualPhone} 
                                onChange={(e) => setManualPhone(e.target.value)} 
                                placeholder="Phone number (optional)" 
                                className="w-1/3 p-2 border rounded bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-sm outline-none" 
                            />
                            <button 
                                onClick={() => {
                                    if (!newEmail) return;
                                    setNewEmails([...newEmails, newEmail]);
                                    if (manualPhone) {
                                        setParsedCandidates(prev => [...prev, { email: newEmail.toLowerCase(), phone: manualPhone, matchScore: 'N/A' }]);
                                    }
                                    setNewEmail('');
                                    setManualPhone('');
                                }} 
                                className="bg-blue-500 text-white px-4 py-2 rounded text-sm hover:bg-blue-600 transition-colors"
                            >
                                Add
                            </button>
                        </div>
                    </div>
                    <div>
                        <h4 className="font-semibold mb-2 text-sm">New Candidates to Invite:</h4>
                        {newEmails.length === 0 ? (
                             <p className="text-xs text-gray-500 italic">No candidates added yet. Upload resumes or add manually.</p>
                        ) : (
                            <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto">
                                {newEmails.map(email => {
                                    const parsedData = parsedCandidates.find(c => c.email === email);
                                    
                                    let ScoreBadge = null;
                                    if (parsedData?.matchScore && parsedData.matchScore !== 'N/A') {
                                        const numScore = parseFloat(parsedData.matchScore);
                                        let badgeColor = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700';
                                        let icon = 'fas fa-minus-circle';
                                        
                                        if (!isNaN(numScore)) {
                                            if (numScore >= 75) {
                                                badgeColor = 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border shadow-sm border-green-200 dark:border-green-800';
                                                icon = 'fas fa-check-circle';
                                            } else if (numScore >= 50) {
                                                badgeColor = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border shadow-sm border-yellow-200 dark:border-yellow-800';
                                                icon = 'fas fa-exclamation-circle';
                                            } else {
                                                badgeColor = 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border shadow-sm border-red-200 dark:border-red-800';
                                                icon = 'fas fa-times-circle';
                                            }
                                        }
                                        
                                        ScoreBadge = (
                                            <div className={`mt-1 flex w-fit items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-bold ${badgeColor}`} title="AI Resume Match Score vs Job Description">
                                                <i className={icon}></i> Match: {parsedData.matchScore}%
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={email} className="flex items-start justify-between text-sm bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-3 shadow-sm transition-colors hover:border-gray-300 dark:hover:border-gray-500">
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-gray-900 dark:text-white mb-0.5">{email}</span>
                                                {parsedData?.phone && parsedData.phone !== 'N/A' && (
                                                    <span className="text-xs text-blue-600 dark:text-blue-400 font-mono flex items-center gap-1.5"><i className="fas fa-phone-alt"></i>{parsedData.phone}</span>
                                                )}
                                                {ScoreBadge}
                                            </div>
                                            <button onClick={() => handleRemoveNewEmail(email)} className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700" title="Remove Candidate">
                                                <i className="fas fa-trash-alt"></i>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    {selectedInterview.candidateEmails && selectedInterview.candidateEmails.length > 0 && (
                        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                            <h4 className="font-semibold mb-2 text-sm">Previously Invited Candidates:</h4>
                            <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-1">
                                {selectedInterview.candidateEmails.map((email) => {
                                    const isEditing = editingCandidateEmail === email;
                                    const isResending = resendingEmail === email;
                                    
                                    return (
                                        <div key={email} className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-3 shadow-sm">
                                            {isEditing ? (
                                                <div className="flex-1 flex gap-2 mr-2">
                                                    <input 
                                                        type="email" 
                                                        value={editedEmailValue} 
                                                        onChange={(e) => setEditedEmailValue(e.target.value)} 
                                                        className="w-full p-1.5 text-sm border rounded bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-primary"
                                                        autoFocus
                                                    />
                                                    <button 
                                                        onClick={() => handleEditAndResend(email, editedEmailValue)}
                                                        disabled={resendingEmail !== null}
                                                        className="bg-green-500 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-green-600 disabled:opacity-50 flex items-center gap-1 shrink-0"
                                                    >
                                                        {isResending ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>} Save
                                                    </button>
                                                    <button 
                                                        onClick={() => setEditingCandidateEmail(null)}
                                                        disabled={resendingEmail !== null}
                                                        className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-3 py-1.5 rounded text-xs font-semibold hover:bg-gray-300 dark:hover:bg-gray-500 shrink-0"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]" title={email}>{email}</span>
                                                    <div className="flex items-center gap-2">
                                                        <button 
                                                            onClick={() => { setEditingCandidateEmail(email); setEditedEmailValue(email); }}
                                                            disabled={resendingEmail !== null}
                                                            className="text-gray-500 hover:text-blue-500 transition-colors p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700" 
                                                            title="Edit Email & Resend"
                                                        >
                                                            <i className="fas fa-pencil-alt text-xs"></i>
                                                        </button>
                                                        <button 
                                                            onClick={() => handleResend(email)}
                                                            disabled={resendingEmail !== null}
                                                            className="text-gray-500 hover:text-green-500 transition-colors p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center gap-1" 
                                                            title="Resend Invitation"
                                                        >
                                                            {isResending ? <i className="fas fa-spinner fa-spin text-xs"></i> : <i className="fas fa-paper-plane text-xs"></i>}
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
                    <button onClick={() => setIsInviteModalOpen(false)} className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-4 py-2 rounded">Cancel</button>
                    <button 
                        onClick={handleSendInvites} 
                        disabled={sendingEmails || newEmails.length === 0}
                        className="bg-green-500 text-white px-4 py-2 rounded flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {sendingEmails ? (
                            <>
                                <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                                Sending...
                            </>
                        ) : 'Send Invites'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )}

    {editingJobId && <EditJobModal jobId={editingJobId} onClose={() => setEditingJobId(null)} />}

    {whatsappModal && whatsappModal.isOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-gray-200 dark:border-white/10 flex flex-col text-gray-900 dark:text-white transform transition-all duration-300">
                {/* Header */}
                <div className="flex items-center gap-3 p-4 bg-emerald-500/10 dark:bg-emerald-500/5 border-b border-emerald-500/20 dark:border-emerald-500/10">
                    <div className="p-2 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                        <i className="fab fa-whatsapp text-xl"></i>
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Send WhatsApp Invite</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Send an invitation link to the candidate via WhatsApp Web</p>
                    </div>
                    <button 
                        onClick={() => setWhatsappModal(null)} 
                        className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                        <i className="fas fa-times text-lg"></i>
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Candidate Email</label>
                        <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-black/30 p-2.5 rounded-lg border border-gray-200 dark:border-zinc-800">
                            {whatsappModal.email}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Phone Number <span className="text-red-500">*</span></label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 font-medium text-sm">
                                <i className="fas fa-phone-alt mr-1"></i>
                            </span>
                            <input 
                                type="tel" 
                                value={whatsappModal.phone} 
                                onChange={(e) => setWhatsappModal({...whatsappModal, phone: e.target.value})} 
                                placeholder="Enter phone number (e.g. 9876543210)" 
                                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white dark:bg-zinc-800 text-sm outline-none"
                            />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">Include country code if outside India. 10-digit Indian numbers auto-prepend +91.</p>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Draft Message Preview</label>
                        <textarea 
                            value={whatsappModal.message} 
                            onChange={(e) => setWhatsappModal({...whatsappModal, message: e.target.value})} 
                            rows={6}
                            className="w-full p-3 border border-gray-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white dark:bg-zinc-800 text-xs font-mono outline-none leading-relaxed resize-none"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 p-4 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5">
                    <button 
                        onClick={() => setWhatsappModal(null)} 
                        className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={async () => {
                            if (!whatsappModal.phone.trim()) {
                                messageBox.showError("Please enter a valid phone number");
                                return;
                            }
                            
                            // Save phone to Firestore under candidateData array
                            try {
                                const intRef = doc(db, 'interviews', whatsappModal.interview.id);
                                const currentCandData = (whatsappModal.interview as any).candidateData || [];
                                const index = currentCandData.findIndex((c: any) => c.email.toLowerCase() === whatsappModal.email.toLowerCase());
                                
                                let updatedCandData = [...currentCandData];
                                if (index > -1) {
                                    updatedCandData[index] = { ...updatedCandData[index], phone: whatsappModal.phone };
                                } else {
                                    updatedCandData.push({ email: whatsappModal.email, phone: whatsappModal.phone });
                                }
                                
                                await updateDoc(intRef, {
                                    candidateData: updatedCandData
                                });
                                
                                // Update local state so it reflects immediately
                                setInterviews(prev => prev.map(inv => {
                                    if (inv.id === whatsappModal.interview.id) {
                                        return { ...inv, candidateData: updatedCandData };
                                    }
                                    return inv;
                                }));
                            } catch (err) {
                                console.error("Error updating phone in Firestore:", err);
                            }
                            
                            // Open WhatsApp web
                            const cleanedPhone = whatsappModal.phone.replace(/[^0-9]/g, '');
                            let targetPhone = cleanedPhone;
                            if (cleanedPhone.length === 10) {
                                targetPhone = '91' + cleanedPhone;
                            }
                            
                            const waUrl = `https://web.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(whatsappModal.message)}`;
                            window.open(waUrl, '_blank');
                            setWhatsappModal(null);
                            messageBox.showSuccess("Redirecting to WhatsApp Web...");
                        }}
                        className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
                    >
                        <i className="fab fa-whatsapp"></i>
                        <span>Send WhatsApp Invite</span>
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )}

    {fullJdModal && fullJdModal.isOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-zinc-950 rounded-2xl shadow-2xl border border-gray-200 dark:border-zinc-800 w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden text-gray-900 dark:text-white">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/20">
                    <div>
                        <span className="text-[10px] uppercase font-bold text-primary tracking-widest block mb-0.5">Full Job Description</span>
                        <h3 className="text-lg font-extrabold text-gray-900 dark:text-white leading-tight">{fullJdModal.title}</h3>
                    </div>
                    <button 
                        onClick={() => setFullJdModal(null)} 
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        title="Close full screen Job Description view"
                    >
                        <i className="fas fa-times text-lg"></i>
                    </button>
                </div>
                {/* Body */}
                <div className="p-6 overflow-y-auto custom-card-scrollbar text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {fullJdModal.description || "No description provided."}
                </div>
                {/* Footer */}
                <div className="flex justify-end p-4 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/20">
                    <button 
                        onClick={() => setFullJdModal(null)} 
                        className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all shadow-sm"
                        title="Close window"
                    >
                        Close View
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )}

    {fullRosterModal && fullRosterModal.isOpen && (() => {
        const interview = fullRosterModal.interview;
        return createPortal(
            <FullRosterModalContent 
                interview={interview} 
                submissionsMap={submissionsMap} 
                setWhatsappModal={(modal) => setWhatsappModal({ ...modal, isOpen: true })} 
                onAllowReattempt={handleAllowReattempt}
                onClose={() => setFullRosterModal(null)} 
            />,
            document.body
        );
    })()}
    </div>
    );
};

interface FullRosterModalContentProps {
    interview: Interview;
    submissionsMap: Record<string, any[]>;
    setWhatsappModal: (modal: any) => void;
    onAllowReattempt: (interviewId: string, attemptId: string, currentAllowValue: boolean) => Promise<void>;
    onClose: () => void;
}

const FullRosterModalContent: React.FC<FullRosterModalContentProps> = ({ interview, submissionsMap, setWhatsappModal, onAllowReattempt, onClose }) => {
    const [rosterSearch, setRosterSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');

    const explicitEmails = (interview.candidateEmails || []).map(e => e.toLowerCase());
    const submissions = submissionsMap[interview.id] || [];
    const unifiedList: {email: string, hasSubmitted: boolean, attemptId?: string, allowReattempt?: boolean}[] = [];
    
    submissions.forEach(sub => {
        unifiedList.push({ 
            email: sub.candidateInfo?.email || 'N/A', 
            hasSubmitted: true,
            attemptId: sub.id,
            allowReattempt: sub.allowReattempt || false
        });
    });

    explicitEmails.forEach(email => {
        const hasSubmitted = submissions.some(sub => (sub.candidateInfo?.email || '').toLowerCase() === email);
        if (!hasSubmitted && !unifiedList.some(u => u.email.toLowerCase() === email)) {
            unifiedList.push({ email, hasSubmitted: false });
        }
    });

    const filteredList = unifiedList.filter(cand => {
        const matchesSearch = cand.email.toLowerCase().includes(rosterSearch.toLowerCase());
        const matchesStatus = statusFilter === 'All' || 
            (statusFilter === 'Submitted' && cand.hasSubmitted) ||
            (statusFilter === 'Pending' && !cand.hasSubmitted);
        return matchesSearch && matchesStatus;
    });

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-zinc-950 rounded-2xl shadow-2xl border border-gray-200 dark:border-zinc-800 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden text-gray-900 dark:text-white">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/20">
                    <div>
                        <span className="text-[10px] uppercase font-bold text-primary tracking-widest block mb-0.5">Tracking Roster</span>
                        <h3 className="text-lg font-extrabold text-gray-900 dark:text-white leading-tight">{interview.title}</h3>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        title="Close candidate roster view"
                    >
                        <i className="fas fa-times text-lg"></i>
                    </button>
                </div>
                
                {/* Search and Filters inside Roster */}
                <div className="p-4 bg-gray-50/50 dark:bg-zinc-900/10 border-b border-gray-100 dark:border-zinc-800 flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 pointer-events-none">
                            <i className="fas fa-search text-xs"></i>
                        </span>
                        <input
                            type="text"
                            value={rosterSearch}
                            onChange={(e) => setRosterSearch(e.target.value)}
                            placeholder="Search candidate email..."
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 text-xs font-semibold outline-none focus:ring-2 focus:ring-primary transition-all"
                            title="Filter roster list by typing candidate email"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-2 border border-gray-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 text-xs font-semibold outline-none focus:ring-1 focus:ring-primary"
                        title="Filter candidates by status"
                    >
                        <option value="All">All Status</option>
                        <option value="Submitted">Submitted</option>
                        <option value="Pending">Pending</option>
                    </select>
                </div>

                {/* Body */}
                <div className="p-5 overflow-y-auto custom-card-scrollbar flex-grow space-y-2.5 max-h-[50vh]">
                    {filteredList.length === 0 ? (
                        <p className="text-xs text-gray-500 italic text-center py-8">No matching candidates found.</p>
                    ) : (
                        filteredList.map((cand, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-gray-50 dark:bg-zinc-900/40 text-xs rounded-xl px-4 py-3 border border-gray-100 dark:border-zinc-800">
                                <span className="font-semibold text-gray-700 dark:text-gray-200 truncate max-w-[240px] sm:max-w-[320px]" title={cand.email}>
                                    {cand.email}
                                </span>
                                {cand.hasSubmitted ? (
                                     <div className="flex items-center gap-2 shrink-0">
                                         <span className="text-green-600 dark:text-green-400 font-bold flex items-center gap-1.5 font-sans">
                                             <i className="fas fa-check-circle"></i> Submitted
                                         </span>
                                         <button
                                             type="button"
                                             onClick={() => onAllowReattempt(interview.id, cand.attemptId!, cand.allowReattempt || false)}
                                             className={`inline-flex items-center gap-1 px-2.5 py-1.5 border rounded-lg text-[10px] font-extrabold transition-all ${
                                                 cand.allowReattempt 
                                                     ? 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-800/50' 
                                                     : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-zinc-700'
                                             }`}
                                             title={cand.allowReattempt ? "Remove Reattempt Chance" : "Give Reattempt Chance"}
                                         >
                                             <i className="fas fa-redo"></i>
                                             <span>{cand.allowReattempt ? 'Allowed' : 'Allow Reattempt'}</span>
                                         </button>
                                     </div>
                                ) : (
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-yellow-600 dark:text-yellow-500 font-bold flex items-center gap-1.5">
                                            <i className="fas fa-clock"></i> Pending
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const candData = (interview as any).candidateData?.find((c: any) => c.email?.toLowerCase() === cand.email?.toLowerCase());
                                                const phone = candData?.phone || '';
                                                const link = `${window.location.origin}/#/interview/${interview.id}`;
                                                const msg = `👋 Hi there!\n\nWe're actively hiring for the *${interview.title}* role and we'd love to invite you to take our AI-powered interview to fast-track your application! 🌟\n\n🚀 *Start your interview here:* \n${link}\n\n🔑 *Your Access Code:* \n${interview.accessCode}\n\nIt only takes a few minutes and you can complete it whenever you're ready. Best of luck! 🎉`;
                                                setWhatsappModal({
                                                    isOpen: true,
                                                    email: cand.email,
                                                    phone: phone === 'N/A' ? '' : phone,
                                                    message: msg,
                                                    interview: interview
                                                });
                                                onClose(); // Close roster modal when opening WhatsApp modal
                                            }}
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 rounded-lg text-[10px] font-extrabold transition-all"
                                            title="Click to launch WhatsApp Web wizard"
                                        >
                                            <i className="fab fa-whatsapp"></i>
                                            <span>Invite via WhatsApp</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end p-4 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/20">
                    <button 
                        onClick={onClose} 
                        className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all shadow-sm"
                        title="Close window"
                    >
                        Close View
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RecruiterInterviews;
