import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import * as pdfjsLib from 'pdfjs-dist';
import { useMessageBox } from '../components/MessageBox';
import { Interview, InterviewSubmission } from '../types';
import { sendInterviewInvitations } from '../services/brevoService';
import { sendWhatsAppMessage, sendBulkWhatsAppInvites, sendInterviewWhatsAppInvite } from '../services/waSenderService';
import { evaluateResumeForMultipleJobs } from '../services/api';
import { extractPhoneFromText, formatExtractedPhone } from '../services/resumeService';

// Setup PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const InlineBusySkeleton = ({ className = 'bg-current/25' }: { className?: string }) => (
    <span className={`inline-block h-3 w-16 animate-pulse rounded-[4px] ${className}`} aria-hidden="true" />
);

interface GlobalCandidate {
    email: string;
    phone: string;
    interviewId: string;
    interviewTitle: string;
    hasSubmitted: boolean;
    submissionId?: string;
    score?: number;
    invitedAt?: any;
    name?: string;
    resumeScore?: number;
    qnaScore?: number;
    resumeLink?: string;
}

const InvitedCandidates: React.FC = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [interviews, setInterviews] = useState<Interview[]>([]);
    const [globalCandidates, setGlobalCandidates] = useState<GlobalCandidate[]>([]);
    
    // Global Invite State
    const [selectedInterviewId, setSelectedInterviewId] = useState<string>('');
    const [parsingResumes, setParsingResumes] = useState(false);
    const [sendingEmails, setSendingEmails] = useState(false);
    const [newCandidates, setNewCandidates] = useState<{email: string, phone: string, scores?: Record<string, string>}[]>([]);
    const [manualEmail, setManualEmail] = useState('');
    const [manualPhone, setManualPhone] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [jobSearchTerm, setJobSearchTerm] = useState('');
    
    const messageBox = useMessageBox();
    const [whatsappModal, setWhatsappModal] = useState<{
        isOpen: boolean;
        email: string;
        phone: string;
        message: string;
        interview: Interview;
    } | null>(null);

    const handleResendFromHub = async (email: string, interviewId: string) => {
        const selectedInterview = interviews.find(i => i.id === interviewId);
        if (!selectedInterview) return;
        
        try {
            let emailSent = false;
            let waSent = false;

            if (email && email.includes('@')) {
                const result = await sendInterviewInvitations(
                    [email],
                    selectedInterview.title,
                    selectedInterview.interviewLink || '',
                    selectedInterview.accessCode
                );
                if (result.success) emailSent = true;
            }

            // Look up candidate phone number
            const candData = (selectedInterview as any).candidateData || [];
            const match = candData.find((c: any) => (c.email && c.email.toLowerCase() === email.toLowerCase()) || (c.phone && c.phone === email));
            const phone = match?.phone || globalCandidates.find(g => g.email === email)?.phone;

            if (phone && phone !== 'N/A') {
                const waRes = await sendInterviewWhatsAppInvite({
                    phone: phone,
                    candidateName: email && email.includes('@') ? email.split('@')[0] : 'Candidate',
                    jobTitle: selectedInterview.title,
                    interviewLink: selectedInterview.interviewLink || '',
                    accessCode: selectedInterview.accessCode
                });
                if (waRes.success) waSent = true;
            }

            if (emailSent && waSent) {
                messageBox.showSuccess(`Invitation resent to ${email} via BOTH Email & WhatsApp!`);
            } else if (emailSent) {
                messageBox.showSuccess(`Invitation resent to ${email} via Email!`);
            } else if (waSent) {
                messageBox.showSuccess(`Invitation resent to ${phone} via WhatsApp!`);
            } else {
                messageBox.showError(`Failed to resend invitation.`);
            }
        } catch (error: any) {
            console.error('Resend error:', error);
            messageBox.showError('Failed to resend invitation.');
        }
    };

    useEffect(() => {
        if (!user) return;

        const fetchData = async () => {
            try {
                // 1. Fetch all interviews for this recruiter
                const q = query(
                    collection(db, 'interviews'), 
                    where('recruiterUID', '==', user.uid)
                );
                const snapshot = await getDocs(q);
                const fetchedInterviews = snapshot.docs
                    .map(d => ({id: d.id, ...d.data()} as Interview))
                    .filter(interview => interview.isMock !== true)
                    .sort((a, b) => {
                        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0;
                        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0;
                        return timeB - timeA;
                    });
                setInterviews(fetchedInterviews);

                // 2. Fetch submissions for all interviews
                const allCands: GlobalCandidate[] = [];
                for (const interview of fetchedInterviews) {
                    const attemptsSnap = await getDocs(collection(db, 'interviews', interview.id, 'attempts'));
                    const attempts = attemptsSnap.docs.map(d => ({id: d.id, ...d.data()} as InterviewSubmission));
                    
                    const candidateDataArray = (interview as any).candidateData || []; // New schema field we will use moving forward
                    const explicitEmails = (interview.candidateEmails || []).map((e:string) => e.toLowerCase());
                    
                    // Pass 1: Everyone who actually submitted
                    attempts.forEach(submission => {
                        const email = (submission.candidateInfo?.email || 'unknown').toLowerCase();
                        const enhancedData = candidateDataArray.find((c: any) => c.email.toLowerCase() === email);

                        allCands.push({
                            email: email,
                            phone: enhancedData?.phone || (submission.candidateInfo as any)?.phone || 'N/A',
                            interviewId: interview.id,
                            interviewTitle: interview.title || 'Untitled Role',
                            hasSubmitted: true,
                            submissionId: submission.id,
                            score: typeof submission.score === 'number' ? submission.score : parseFloat((submission.score as any) || '0'),
                            name: submission.candidateInfo?.name || 'Unknown User',
                            resumeScore: typeof submission.resumeScore === 'number' ? submission.resumeScore : parseFloat((submission.resumeScore as any) || '0'),
                            qnaScore: typeof submission.qnaScore === 'number' ? submission.qnaScore : parseFloat((submission.qnaScore as any) || '0'),
                            resumeLink: submission.candidateResumeURL || 'N/A'
                        });
                    });

                    // Pass 2: Everyone explicitly invited but who HAS NOT submitted
                    explicitEmails.forEach(email => {
                        const hasSubmitted = attempts.some(a => (a.candidateInfo?.email || '').toLowerCase() === email);
                        if (!hasSubmitted) {
                            const enhancedData = candidateDataArray.find((c: any) => c.email.toLowerCase() === email);
                            allCands.push({
                                email: email,
                                phone: enhancedData?.phone || 'N/A',
                                interviewId: interview.id,
                                interviewTitle: interview.title || 'Untitled Role',
                                hasSubmitted: false,
                                name: 'Pending Candidate'
                            });
                        }
                    });
                }
                setGlobalCandidates(allCands);
            } catch (err) {
                console.error("Error fetching data:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [user]);

    const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setParsingResumes(true);
        const parsed: {email: string, phone: string, scores?: Record<string, string>}[] = [];
        let filesProcessed = 0;
        
        const jobsPayload = interviews.map(i => ({ id: i.id, title: i.title, description: i.description }));

        const parsePromises = Array.from(files).map(async (file: File) => {
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
                } else if (file.type === 'text/plain') {
                    text = await file.text();
                } else {
                    return;
                }

                const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
                const extractedPhone = formatExtractedPhone(extractPhoneFromText(text));

                if (emailMatch) {
                    const email = emailMatch[1].toLowerCase();
                    const phone = extractedPhone || 'N/A';
                    if (!parsed.some(c => c.email === email) && !newCandidates.some(c => c.email === email)) {
                        let scores = {};
                        if (text.length > 50 && jobsPayload.length > 0) {
                            try {
                                scores = await evaluateResumeForMultipleJobs(jobsPayload, text);
                            } catch (e) {
                                console.error('Multi job score error:', e);
                            }
                        }
                        if (!parsed.some(c => c.email === email)) {
                            parsed.push({ email, phone, scores });
                        }
                    }
                }
                filesProcessed++;
            } catch (error) {
                console.error(`Error parsing ${file.name}:`, error);
            }
        });

        await Promise.all(parsePromises);

        if (parsed.length > 0) {
            setNewCandidates(prev => [...prev, ...parsed]);
        }
        
        messageBox.showInfo(`Processed ${filesProcessed} file(s). Found ${parsed.length} new candidates.`);
        setParsingResumes(false);
        e.target.value = '';
    };

    const handleManualAdd = () => {
        if (!manualEmail.trim() && !manualPhone.trim()) {
            messageBox.showError("Please enter an Email address or Mobile phone number.");
            return;
        }
        const lowerEmail = manualEmail.trim().toLowerCase();
        const phoneVal = manualPhone.trim();

        const exists = newCandidates.some(c => 
            (lowerEmail && c.email === lowerEmail) || 
            (phoneVal && c.phone === phoneVal)
        );
        if (!exists) {
            setNewCandidates(prev => [...prev, { email: lowerEmail, phone: phoneVal || 'N/A' }]);
        }
        setManualEmail('');
        setManualPhone('');
    };

    const handleRemoveCandidate = (identifier: string) => {
        setNewCandidates(newCandidates.filter(c => c.email !== identifier && c.phone !== identifier));
    };

    const handleSendGlobalInvites = async () => {
        if (!selectedInterviewId) {
            messageBox.showError("Please select an interview to route these candidates to.");
            return;
        }
        if (newCandidates.length === 0) return;

        setSendingEmails(true);
        try {
            const selectedInterview = interviews.find(i => i.id === selectedInterviewId);
            if (!selectedInterview) throw new Error("Interview not found");

            const validEmails = newCandidates.map(c => c.email).filter(Boolean);
            const validPhoneCandidates = newCandidates.filter(c => c.phone && c.phone !== 'N/A');

            // Update Database
            await updateDoc(doc(db, 'interviews', selectedInterviewId), { 
                candidateEmails: validEmails.length > 0 ? arrayUnion(...validEmails) : arrayUnion(),
                candidateData: arrayUnion(...newCandidates)
            });
            
            let emailCount = 0;
            if (validEmails.length > 0) {
                const result = await sendInterviewInvitations(
                    validEmails,
                    selectedInterview.title,
                    selectedInterview.interviewLink || '',
                    selectedInterview.accessCode
                );
                if (result.success) {
                    emailCount = result.totalEmails;
                }
            }

            let waCount = 0;
            if (validPhoneCandidates.length > 0) {
                const waResult = await sendBulkWhatsAppInvites(
                    validPhoneCandidates,
                    selectedInterview.title,
                    selectedInterview.interviewLink || '',
                    selectedInterview.accessCode
                );
                if (waResult.success) {
                    waCount = waResult.totalSent;
                }
            }

            messageBox.showSuccess(`Invitations dispatched: ${emailCount > 0 ? `${emailCount} Email(s)` : ''}${emailCount > 0 && waCount > 0 ? ' & ' : ''}${waCount > 0 ? `${waCount} WhatsApp Mobile invite(s)` : ''}!`);
            
            // Optimistically update the UI table
            const optimizedAdditions: GlobalCandidate[] = newCandidates.map(c => ({
                email: c.email || c.phone,
                phone: c.phone,
                interviewId: selectedInterview.id,
                interviewTitle: selectedInterview.title,
                hasSubmitted: false
            }));
            setGlobalCandidates(prev => [...optimizedAdditions, ...prev]);
            
            setInterviews(prev => prev.map(inv => {
                if(inv.id === selectedInterviewId) {
                    return {...inv, candidateEmails: [...(inv.candidateEmails || []), ...validEmails]}
                }
                return inv;
            }));

            setNewCandidates([]);
        } catch (error) {
            console.error('Invite sending error:', error);
            messageBox.showError('Failed to process invitations.');
        } finally {
            setSendingEmails(false);
        }
    };

    const filteredCandidates = useMemo(() => {
        if (!selectedInterviewId) return [];
        return globalCandidates.filter(c => 
            c.interviewId === selectedInterviewId &&
            (c.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
             c.phone.includes(searchTerm))
        );
    }, [globalCandidates, searchTerm, selectedInterviewId]);

    const filteredInterviews = useMemo(() => {
        return interviews.filter(inv => 
            (inv.title || '').toLowerCase().includes(jobSearchTerm.toLowerCase()) ||
            (inv.department || '').toLowerCase().includes(jobSearchTerm.toLowerCase())
        );
    }, [interviews, jobSearchTerm]);

    const selectedInterview = interviews.find(i => i.id === selectedInterviewId);
    const submittedCount = filteredCandidates.filter(c => c.hasSubmitted).length;
    const pendingCount = Math.max(filteredCandidates.length - submittedCount, 0);

    const exportToCSV = () => {
        const headers = ["Candidate Name", "Email", "Phone", "Invited Role", "Status", "Overall Score", "Resume Score", "Q&A Score", "Resume Link", "Report Link"];
        
        const csvContent = [
            headers.join(","),
            ...filteredCandidates.map(c => {
                const name = `"${(c.name || "Unknown").replace(/"/g, '""')}"`;
                const email = `"${c.email.replace(/"/g, '""')}"`;
                const phone = `"${(c.phone || "N/A").replace(/"/g, '""')}"`;
                const role = `"${c.interviewTitle.replace(/"/g, '""')}"`;
                const status = `"${c.hasSubmitted ? 'Submitted' : 'Pending'}"`;
                const score = c.hasSubmitted ? `"${c.score?.toFixed(0) || '0'}"` : '"-"';
                const resumeScore = c.hasSubmitted ? `"${c.resumeScore?.toFixed(0) || '0'}"` : '"-"';
                const qnaScore = c.hasSubmitted ? `"${c.qnaScore?.toFixed(0) || '0'}"` : '"-"';
                const resumeLink = c.hasSubmitted ? `"${(c.resumeLink || "N/A").replace(/"/g, '""')}"` : '"-"';
                const reportUrl = c.hasSubmitted ? `"${window.location.origin}/#/report/${c.interviewId}/${c.submissionId}"` : '"-"';
                
                return [name, email, phone, role, status, score, resumeScore, qnaScore, resumeLink, reportUrl].join(",");
            })
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Invited_Candidates_Export.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) return (
        <div className="-mx-4 -my-8 min-h-[calc(100vh-3.5rem)] bg-[#000] text-white sm:-mx-6 lg:-mx-8 animate-pulse">
            <section className="border-b border-white/[0.11] px-4 py-5 sm:px-6 lg:px-7">
                <div className="h-4 w-28 rounded-[6px] bg-white/[0.05]" />
                <div className="mt-2 h-8 w-72 max-w-full rounded-[6px] bg-white/[0.05]" />
                <div className="mt-2 h-4 w-96 max-w-full rounded-[6px] bg-white/[0.04]" />
            </section>
            <section className="grid grid-cols-1 border-b border-white/[0.11] lg:grid-cols-[minmax(0,1fr)_1px_minmax(300px,0.7fr)]">
                <div className="px-4 py-5 sm:px-6 lg:px-7">
                    <div className="grid gap-4 lg:grid-cols-3">
                        {Array.from({ length: 3 }).map((_, index) => (
                            <div key={index} className="h-40 rounded-[6px] border border-white/[0.11] bg-white/[0.03]" />
                        ))}
                    </div>
                </div>
                <div className="hidden bg-white/[0.11] lg:block" />
                <div className="px-4 py-5 sm:px-6 lg:px-7">
                    <div className="h-48 rounded-[6px] border border-white/[0.11] bg-white/[0.03]" />
                </div>
            </section>
            <section>
                {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="grid gap-4 border-b border-white/[0.08] px-4 py-4 sm:px-6 lg:grid-cols-[minmax(220px,1.2fr)_minmax(180px,0.8fr)_110px_90px_120px] lg:px-7">
                        <div className="h-4 w-56 rounded bg-white/[0.04]" />
                        <div className="h-4 w-44 rounded bg-white/[0.04]" />
                        <div className="h-5 w-20 rounded bg-white/[0.04]" />
                        <div className="h-4 w-10 rounded bg-white/[0.04]" />
                        <div className="h-8 w-24 rounded bg-white/[0.04] lg:ml-auto" />
                    </div>
                ))}
            </section>
        </div>
    );

    return (
        <div className="-mx-4 -my-8 min-h-[calc(100vh-3.5rem)] bg-[#000] text-white sm:-mx-6 lg:-mx-8">
            <section className="border-b border-white/[0.11] bg-[#000]">
                <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-7 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                        <Link to="/recruiter/jobs" className="geist-caption inline-flex h-8 items-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white">
                            <i className="fas fa-arrow-left text-[11px]"></i>
                            <span>Dashboard</span>
                        </Link>
                        <h1 className="geist-page-title mt-2 text-white">Candidate Hub</h1>
                        <p className="geist-small mt-1 max-w-2xl text-[#8f8f8f]">Parse resumes, route candidates to an interview, and track every invite from one workspace.</p>
                    </div>
                    <div className="flex items-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 py-2">
                        <span className="h-2 w-2 rounded-full bg-[#50e3c2]"></span>
                        <span className="geist-label text-[#9ca3af]">{selectedInterview ? selectedInterview.title : 'No route selected'}</span>
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-1 border-b border-white/[0.11] lg:grid-cols-[minmax(0,1fr)_1px_minmax(360px,0.58fr)]">
                <div className="px-4 py-5 sm:px-6 lg:px-7">
                    <div className="mb-4 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <h2 className="geist-section-title text-white">Mass Invitation Engine</h2>
                            <p className="geist-small mt-0.5 text-[#8f8f8f]">Choose a route, add candidates, then dispatch email invites.</p>
                        </div>
                    </div>

                    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,1.1fr)]">
                        <div className="min-w-0 rounded-[6px] border border-[#2e2e2e] bg-[#000] p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <p className="geist-label uppercase text-[#6b7280]">Route</p>
                                <span className="geist-small rounded-[6px] border border-[#2e2e2e] bg-[#1a1a1a] px-2 py-0.5 text-[#a0a0a0]">Step 1</span>
                            </div>
                            <input
                                type="text"
                                placeholder="Search active interviews..."
                                value={jobSearchTerm}
                                onChange={(e) => setJobSearchTerm(e.target.value)}
                                className="geist-caption mb-2 h-10 w-full rounded-[6px] border border-[#2e2e2e] bg-[#000] px-3 text-[#ededed] outline-none transition-colors placeholder:text-[#878787] focus:border-[#878787]"
                            />
                            <select 
                                value={selectedInterviewId}
                                onChange={(e) => setSelectedInterviewId(e.target.value)}
                                className="geist-caption h-10 w-full rounded-[6px] border border-[#2e2e2e] bg-[#000] px-3 text-[#ededed] outline-none transition-colors focus:border-[#878787]"
                            >
                                <option value="">Choose Active Interview</option>
                                {filteredInterviews.map(inv => (
                                    <option key={inv.id} value={inv.id}>{inv.title} ({inv.department || 'General'})</option>
                                ))}
                            </select>
                            {selectedInterview && (() => {
                                const link = window.location.origin + '/#/interview/' + selectedInterview.id;
                                const template = `👋 Hi there!\n\nWe're actively hiring for the *${selectedInterview.title}* role and your profile caught our eye! 🌟\n\nWe'd love to invite you to take our next-gen AI-powered interview to fast-track your application. It only takes a few minutes and you can complete it whenever you're ready!\n\n🚀 *Start your interview here:* \n${link}\n\n🔑 *Your Access Code:* \n${selectedInterview.accessCode}\n\nBest of luck, and we can't wait to see your skills in action! 🎉`;
                                return (
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(template);
                                            messageBox.showSuccess('WhatsApp template copied to clipboard!');
                                        }}
                                        className="geist-caption mt-3 inline-flex h-8 w-full items-center justify-center gap-2 rounded-[6px] border border-[#004615] bg-[#002608] px-3 font-medium text-[#00ca50] transition-colors hover:bg-[#00320b]"
                                        title="Copy Invite Template for WhatsApp"
                                    >
                                        <i className="fab fa-whatsapp text-[13px]"></i>
                                        <span>Copy WhatsApp Template</span>
                                    </button>
                                );
                            })()}
                        </div>

                        <div className="min-w-0 rounded-[6px] border border-[#2e2e2e] bg-[#000] p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <p className="geist-label uppercase text-[#6b7280]">Parse</p>
                                <span className="geist-small rounded-[6px] border border-[#2e2e2e] bg-[#1a1a1a] px-2 py-0.5 text-[#a0a0a0]">Step 2</span>
                            </div>
                            <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-[6px] border border-dashed border-[#454545] bg-[#000] px-4 py-5 text-center transition-colors hover:bg-[#1a1a1a]">
                                {parsingResumes ? (
                                    <>
                                        <InlineBusySkeleton className="w-6 bg-white/[0.16]" />
                                        <InlineBusySkeleton className="w-36 bg-white/[0.16]" />
                                    </>
                                ) : (
                                    <>
                                        <i className="fas fa-cloud-upload-alt text-lg text-[#8f8f8f]"></i>
                                        <span className="geist-caption font-medium text-[#d4d4d4]">Upload PDFs or TXTs</span>
                                    </>
                                )}
                                <span className="geist-small text-[#6b7280]">Emails, phone numbers, and match scores are extracted automatically.</span>
                                <input type="file" multiple accept=".pdf,.txt" className="hidden" onChange={handleResumeUpload} disabled={parsingResumes} />
                            </label>
                        </div>

                        <div className="min-w-0 rounded-[6px] border border-[#2e2e2e] bg-[#000] p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <p className="geist-label uppercase text-[#6b7280]">Manual Add</p>
                                <span className="geist-small rounded-[6px] border border-[#2e2e2e] bg-[#1a1a1a] px-2 py-0.5 text-[#a0a0a0]">Optional</span>
                            </div>
                            <div className="grid gap-2">
                                <input type="email" value={manualEmail} onChange={e=>setManualEmail(e.target.value)} placeholder="Candidate email" className="geist-caption h-10 w-full rounded-[6px] border border-[#2e2e2e] bg-[#000] px-3 text-[#ededed] outline-none transition-colors placeholder:text-[#878787] focus:border-[#878787]" />
                                <div className="flex min-w-0 gap-2">
                                    <input type="text" value={manualPhone} onChange={e=>setManualPhone(e.target.value)} placeholder="Phone optional" className="geist-caption h-10 min-w-0 flex-1 rounded-[6px] border border-[#2e2e2e] bg-[#000] px-3 text-[#ededed] outline-none transition-colors placeholder:text-[#878787] focus:border-[#878787]" />
                                    <button onClick={handleManualAdd} className="geist-caption inline-flex h-10 shrink-0 items-center justify-center rounded-[6px] border border-[#2e2e2e] bg-[#000] px-3 font-medium text-[#ededed] transition-colors hover:bg-[#1a1a1a]">Add</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="hidden bg-white/[0.11] lg:block" />

                <aside className="px-4 py-5 sm:px-6 lg:px-7">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                            <h2 className="geist-section-title text-white">Invite Queue</h2>
                            <p className="geist-small mt-0.5 text-[#8f8f8f]">Candidates pending dispatch.</p>
                        </div>
                        <span className="geist-label rounded-[6px] border border-[#2e2e2e] bg-[#1a1a1a] px-2 py-1 text-[#a0a0a0]">{newCandidates.length}</span>
                    </div>
                    <div className="max-h-[190px] overflow-y-auto rounded-[6px] border border-[#2e2e2e] bg-[#000] p-2">
                        {newCandidates.length === 0 ? (
                            <div className="flex min-h-24 flex-col items-center justify-center text-center">
                                <i className="fas fa-inbox text-[#6b7280]"></i>
                                <p className="geist-caption mt-2 text-[#6b7280]">Queue is empty.</p>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                {newCandidates.map(c => {
                                    let ScoreBadge = null;
                                    if (selectedInterviewId && c.scores && c.scores[selectedInterviewId]) {
                                        const numScore = parseFloat(c.scores[selectedInterviewId]);
                                        let badgeColor = 'border-[#2e2e2e] bg-[#1a1a1a] text-[#a0a0a0]';
                                        if (!isNaN(numScore)) {
                                            if (numScore >= 75) badgeColor = 'border-[#123b2a] bg-[#071a12] text-[#83d0a3]';
                                            else if (numScore >= 50) badgeColor = 'border-[#42320f] bg-[#1d1605] text-[#f5c76b]';
                                            else badgeColor = 'border-[#3f1d1d] bg-[#180707] text-[#ff8f8f]';
                                        }
                                        ScoreBadge = (
                                            <span className={`geist-small ml-2 rounded-[6px] border px-1.5 py-0.5 ${badgeColor}`} title="AI Match for Selected Role">
                                                {c.scores[selectedInterviewId]}%
                                            </span>
                                        );
                                    }

                                    return (
                                        <div key={c.email} className="flex items-center justify-between gap-3 rounded-[6px] border border-[#2e2e2e] bg-[#1a1a1a] px-2.5 py-2">
                                            <div className="flex min-w-0 items-center">
                                                <span className="geist-small truncate text-[#d4d4d4]" title={c.email}>{c.email}</span>
                                                {ScoreBadge}
                                            </div>
                                            <button onClick={()=>handleRemoveCandidate(c.email)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-[#6b7280] transition-colors hover:bg-[#180707] hover:text-[#ff8f8f]" title="Remove candidate">&times;</button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <button 
                        onClick={handleSendGlobalInvites}
                        disabled={sendingEmails || newCandidates.length === 0}
                        className="geist-caption mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[6px] border border-white bg-white px-3 font-medium text-black transition-colors hover:bg-[#eaeaea] disabled:border-[#2e2e2e] disabled:bg-[#1a1a1a] disabled:text-[#878787] disabled:cursor-not-allowed disabled:opacity-100"
                    >
                        {sendingEmails ? (
                            <InlineBusySkeleton className="w-28 bg-black/[0.18]" />
                        ) : (
                            <>
                                <i className="fas fa-paper-plane text-[11px]"></i>
                                Dispatch {newCandidates.length} Invites
                            </>
                        )}
                    </button>
                </aside>
            </section>

            {selectedInterviewId ? (
                <section>
                    <div className="flex flex-col gap-3 border-b border-white/[0.11] px-4 py-4 sm:px-6 lg:px-7 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                            <h2 className="geist-section-title text-white">Active Candidates Tracking</h2>
                            <p className="geist-small mt-0.5 text-[#8f8f8f]">{filteredCandidates.length} tracked, {submittedCount} submitted, {pendingCount} pending.</p>
                        </div>
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                            <div className="relative w-full sm:w-72">
                                <i className="fas fa-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-[#6b7280]"></i>
                                <input
                                    type="text"
                                    placeholder="Search email or phone..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="geist-caption h-9 w-full rounded-[6px] border border-white/[0.11] bg-white/[0.03] pl-9 pr-3 text-white outline-none transition-colors placeholder:text-[#6b7280] focus:border-white/[0.28]"
                                />
                            </div>
                            <button
                                onClick={exportToCSV}
                                className="geist-caption inline-flex h-9 items-center justify-center gap-2 rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white"
                            >
                                <i className="fas fa-file-excel text-[11px]"></i>
                                <span>Export CSV</span>
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-white/[0.11] text-left">
                            <thead className="bg-[#080808]">
                                <tr>
                                    <th className="geist-label whitespace-nowrap px-4 py-2.5 uppercase text-[#6b7280] sm:px-6 lg:px-7">Candidate</th>
                                    <th className="geist-label whitespace-nowrap px-4 py-2.5 uppercase text-[#6b7280]">Invited Role</th>
                                    <th className="geist-label whitespace-nowrap px-4 py-2.5 text-center uppercase text-[#6b7280]">Status</th>
                                    <th className="geist-label whitespace-nowrap px-4 py-2.5 text-center uppercase text-[#6b7280]">Score</th>
                                    <th className="geist-label whitespace-nowrap px-4 py-2.5 text-right uppercase text-[#6b7280]">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.08]">
                                {filteredCandidates.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-14 text-center sm:px-6 lg:px-7">
                                            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] text-[#6b7280]">
                                                <i className="fas fa-users-slash"></i>
                                            </div>
                                            <p className="geist-caption mt-4 text-[#d4d4d4]">No tracked candidates found.</p>
                                            <p className="geist-small mt-1 text-[#6b7280]">Upload resumes or add candidates manually to begin tracking.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredCandidates.map((candidate, idx) => (
                                        <tr key={idx} className="transition-colors hover:bg-white/[0.025]">
                                            <td className="px-4 py-3 sm:px-6 lg:px-7">
                                                <div className="geist-caption font-medium text-white">{candidate.email}</div>
                                                {candidate.phone !== 'N/A' && <div className="geist-label mt-0.5 text-[#8bbde8]"><i className="fas fa-phone-alt mr-1 text-[10px] opacity-70"></i>{candidate.phone}</div>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="geist-small inline-flex max-w-[240px] truncate rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-2 py-1 font-medium text-[#d4d4d4]" title={candidate.interviewTitle}>{candidate.interviewTitle}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {candidate.hasSubmitted ? (
                                                    <span className="geist-small inline-flex items-center gap-1.5 rounded-[6px] border border-[#123b2a] bg-[#071a12] px-2 py-1 font-medium text-[#83d0a3]">
                                                        <i className="fas fa-check-circle text-[10px]"></i> Submitted
                                                    </span>
                                                ) : (
                                                    <span className="geist-small inline-flex items-center gap-1.5 rounded-[6px] border border-[#42320f] bg-[#1d1605] px-2 py-1 font-medium text-[#f5c76b]">
                                                        <i className="fas fa-clock text-[10px]"></i> Pending
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {candidate.hasSubmitted ? (
                                                    <span className="geist-label tabular-nums text-white">{candidate.score?.toFixed(0)}<span className="text-[#6b7280]">/10</span></span>
                                                ) : <span className="geist-label text-[#6b7280]">-</span>}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {candidate.hasSubmitted ? (
                                                     <Link to={`/report/${candidate.interviewId}/${candidate.submissionId}`} target="_blank" className="geist-caption inline-flex h-8 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] px-3 font-medium text-[#d4d4d4] transition-colors hover:bg-white/[0.06] hover:text-white">View Report</Link>
                                                ) : (
                                                     <div className="flex justify-end items-center gap-1.5">
                                                         <button 
                                                             onClick={() => {
                                                                 const selectedInterview = interviews.find(i => i.id === candidate.interviewId);
                                                                 if (!selectedInterview) return;
                                                                 const link = `${window.location.origin}/#/interview/${selectedInterview.id}`;
                                                                 const msg = `👋 Hi there!\n\nWe're actively hiring for the *${selectedInterview.title}* role and we'd love to invite you to take our AI-powered interview to fast-track your application! 🌟\n\n🚀 *Start your interview here:* \n${link}\n\n🔑 *Your Access Code:* \n${selectedInterview.accessCode}\n\nIt only takes a few minutes and you can complete it whenever you're ready. Best of luck! 🎉`;
                                                                 setWhatsappModal({
                                                                     isOpen: true,
                                                                     email: candidate.email,
                                                                     phone: candidate.phone === 'N/A' ? '' : candidate.phone,
                                                                     message: msg,
                                                                     interview: selectedInterview
                                                                 });
                                                             }}
                                                             className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[#123b2a] bg-[#071a12] text-[#83d0a3] transition-colors hover:bg-[#0b2419]" 
                                                             title="Invite via WhatsApp Web"
                                                         >
                                                             <i className="fab fa-whatsapp text-[13px]"></i>
                                                         </button>
                                                         <button 
                                                             onClick={() => handleResendFromHub(candidate.email, candidate.interviewId)}
                                                             className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] text-[#8f8f8f] transition-colors hover:bg-white/[0.06] hover:text-white" 
                                                             title="Re-send Email Invitation"
                                                         >
                                                             <i className="fas fa-redo-alt text-[11px]"></i>
                                                         </button>
                                                     </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            ) : (
                <section className="border-b border-dashed border-white/[0.11] px-4 py-16 text-center sm:px-6 lg:px-7">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[6px] border border-white/[0.11] bg-white/[0.03] text-[#8f8f8f]">
                        <i className="fas fa-hand-pointer"></i>
                    </div>
                    <h3 className="geist-section-title mt-4 text-white">Select an Interview Route</h3>
                    <p className="geist-caption mx-auto mt-2 max-w-md text-[#8f8f8f]">Choose an interview above to view associated candidates, track submissions, and export reports.</p>
                </section>
            )}

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
                                        
                                        // Update local interviews state
                                        setInterviews(prev => prev.map(inv => {
                                            if (inv.id === whatsappModal.interview.id) {
                                                return { ...inv, candidateData: updatedCandData };
                                            }
                                            return inv;
                                        }));

                                        // Update local globalCandidates list
                                        setGlobalCandidates(prev => prev.map(c => {
                                            if (c.email.toLowerCase() === whatsappModal.email.toLowerCase() && c.interviewId === whatsappModal.interview.id) {
                                                return { ...c, phone: whatsappModal.phone };
                                            }
                                            return c;
                                        }));
                                    } catch (err) {
                                        console.error("Error updating phone in Firestore:", err);
                                    }
                                    
                                    // Send message via WhatsApp API
                                    const res = await sendWhatsAppMessage(whatsappModal.phone, whatsappModal.message);
                                    setWhatsappModal(null);
                                    if (res.success) {
                                        messageBox.showSuccess("✅ WhatsApp invitation sent successfully!");
                                    } else {
                                        messageBox.showError(`WhatsApp API error: ${res.error || 'Failed to send'}. Opening WhatsApp Web fallback.`);
                                        const cleanedPhone = whatsappModal.phone.replace(/[^0-9]/g, '');
                                        const targetPhone = cleanedPhone.length === 10 ? '91' + cleanedPhone : cleanedPhone;
                                        window.open(`https://web.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(whatsappModal.message)}`, '_blank');
                                    }
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
        </div>
    );
}

export default InvitedCandidates;
