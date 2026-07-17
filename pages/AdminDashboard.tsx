import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { collection, query, where, doc, deleteDoc, setDoc, serverTimestamp, updateDoc, orderBy, onSnapshot, collectionGroup } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, auth } from '../services/firebase';
import { RevenueAreaChart, UserPieChart, JobBarChart } from '../components/AdminCharts';
import { GShapeAnimation } from '../components/AdminAnimations';
import { Users, FileText, DollarSign, UserPlus, Briefcase, CheckCircle, XCircle, Trash2, Bell, Sun, Moon, Monitor, Video, Menu, X, Search, ShieldCheck, ShieldX, BookOpen, MessageSquare as MessageSquareIcon, Bug, Star, Activity, Database, Key, Globe, Copy, Check, Code, Server, TrendingUp, Gauge } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useMessageBox } from '../components/MessageBox';
import Logo from '../components/Logo';

const AdminDashboard: React.FC = () => {
  // Real-time Data State
  const [requests, setRequests] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [interviews, setInterviews] = useState<any[]>([]);
  const [contactSubmissions, setContactSubmissions] = useState<any[]>([]);
  const [bugReports, setBugReports] = useState<any[]>([]);
  const [allReviews, setAllReviews] = useState<any[]>([]);
  const [adminData, setAdminData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [allAttempts, setAllAttempts] = useState<any[]>([]);
  const [perInterviewPrice, setPerInterviewPrice] = useState<number>(150);

  // UI State
  const [activeTab, setActiveTab] = useState<'overview' | 'requests' | 'users' | 'jobs' | 'transactions' | 'submissions' | 'reviews' | 'api' | 'dbAccess'>('overview');
  const [dbSubTab, setDbSubTab] = useState<'submissions' | 'interviews' | 'users'>('submissions');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | 'candidate' | 'recruiter'>('all');
  const { theme, setTheme } = useTheme();
  const messageBox = useMessageBox();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const navigate = useNavigate();

  // API Settings State
  const [webhookUrl, setWebhookUrl] = useState('https://my-hrms.com/webhooks/candidate-reports');
  const [isWebhookSaved, setIsWebhookSaved] = useState(false);
  const [activeCodeTab, setActiveCodeTab] = useState<'curl' | 'node' | 'python'>('curl');
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // GSAP Animation Refs
  const dashboardRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const chartsRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  // Load Real-time Data
  useEffect(() => {
    // 1. Recruiter Requests
    const qRequests = query(collection(db, 'recruiterRequests'), where('status', '==', 'pending'));
    const unsubRequests = onSnapshot(qRequests, (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. Users
    const qUsers = query(collection(db, 'users'));
    const unsubUsers = onSnapshot(qUsers, (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 3. Posted Interviews (fetched instead of legacy jobs)
    const qJobs = query(collection(db, 'interviews'), orderBy('createdAt', 'desc'));
    const unsubJobs = onSnapshot(qJobs, (snap) => {
      setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 4. Transactions
    const qTransactions = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'));
    const unsubTransactions = onSnapshot(qTransactions, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 5. Interviews - Real-time tracking
    const qInterviews = query(collection(db, 'interviews'), orderBy('createdAt', 'desc'));
    const unsubInterviews = onSnapshot(qInterviews, (snap) => {
      setInterviews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false); // Initial load done when interviews load
    });

    // 6. Admin Profile - Real-time
    let unsubAdmin = () => { };
    const currentUser = auth.currentUser;
    if (currentUser) {
      unsubAdmin = onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
          setAdminData({ id: docSnap.id, ...docSnap.data() });
        }
      });
    }

    // 7. Contact Submissions
    const qContact = query(collection(db, 'contactSubmissions'), orderBy('createdAt', 'desc'));
    const unsubContact = onSnapshot(qContact, (snap) => {
      setContactSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 8. Bug Reports
    const qBugs = query(collection(db, 'bugReports'), orderBy('createdAt', 'desc'));
    const unsubBugs = onSnapshot(qBugs, (snap) => {
      setBugReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 9. All Reviews
    const qReviews = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));
    const unsubReviews = onSnapshot(qReviews, (snap) => {
      setAllReviews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 10. Universal Interview Price - Real-time
    const unsubPricing = onSnapshot(doc(db, 'settings', 'pricing'), (docSnap) => {
      if (docSnap.exists()) {
        setPerInterviewPrice(Number(docSnap.data().perInterviewPrice) || 150);
      }
    });

    return () => {
      unsubRequests();
      unsubUsers();
      unsubJobs();
      unsubTransactions();
      unsubInterviews();
      unsubAdmin();
      unsubContact();
      unsubBugs();
      unsubReviews();
      unsubPricing();
    };
  }, []);

  // Live tracking of all attempts across all recruiter interviews
  useEffect(() => {
    if (interviews.length === 0) return;

    const unsubs: (() => void)[] = [];
    const attemptsMap = new Map<string, any[]>();

    interviews.forEach(interview => {
      const q = collection(db, 'interviews', interview.id, 'attempts');
      const unsub = onSnapshot(q, (snap) => {
        const list = snap.docs.map(doc => ({
          id: doc.id,
          interviewId: interview.id,
          ...doc.data()
        }));
        attemptsMap.set(interview.id, list);

        // Merge all lists and update state
        const all: any[] = [];
        attemptsMap.forEach(attemptsList => {
          all.push(...attemptsList);
        });
        // Sort by submittedAt desc
        all.sort((a, b) => {
          const timeA = a.submittedAt?.seconds || 0;
          const timeB = b.submittedAt?.seconds || 0;
          return timeB - timeA;
        });
        setAllAttempts(all);
      }, (err) => {
        console.error(`Error loading attempts for interview ${interview.id}:`, err);
      });
      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [interviews]);

  // GSAP Initial Page Animation
  useLayoutEffect(() => {
    if (loading || hasAnimated.current) return;
    hasAnimated.current = true;

    const ctx = gsap.context(() => {
      // Header animation
      if (headerRef.current) {
        gsap.fromTo(headerRef.current,
          { y: -30, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" }
        );
      }

      // Sidebar animation
      if (sidebarRef.current) {
        const navItems = sidebarRef.current.querySelectorAll('button');
        gsap.fromTo(navItems,
          { x: -30, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.5, stagger: 0.08, ease: "power2.out", delay: 0.2 }
        );
      }
    });

    return () => ctx.revert();
  }, [loading]);

  // GSAP Tab Content Animation
  useEffect(() => {
    if (loading) return;

    const ctx = gsap.context(() => {
      if (activeTab === 'overview') {
        // Animate stat cards
        if (statsRef.current) {
          const cards = statsRef.current.querySelectorAll('.stat-card');
          gsap.fromTo(cards,
            { y: 25, opacity: 0, scale: 0.95 },
            { y: 0, opacity: 1, scale: 1, duration: 0.5, stagger: 0.1, ease: "power3.out" }
          );
        }
        // Animate all charts (including job bar chart)
        const allCharts = document.querySelectorAll('.chart-box');
        gsap.fromTo(allCharts,
          { y: 30, opacity: 0, scale: 0.98 },
          { y: 0, opacity: 1, scale: 1, duration: 0.6, stagger: 0.15, ease: "power2.out", delay: 0.3 }
        );
      } else {
        // Animate tab content with small delay to allow DOM to render
        setTimeout(() => {
          const items = document.querySelectorAll('.animated-item');
          gsap.fromTo(items,
            { y: 20, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.4, stagger: 0.04, ease: "power2.out" }
          );
        }, 10);
      }
    });

    return () => ctx.revert();
  }, [activeTab, loading]);

  // --- Actions (Preserved Logic) ---

  const handleApproveRecruiter = async (req: any) => {
    const tempPassword = prompt(`Enter a temporary password for ${req.email}:`, "Password123!");
    if (!tempPassword) return;

    setProcessingId(req.id);
    const secondaryApp = initializeApp(auth.app.options, "SecondaryApp");
    const secondaryAuth = getAuth(secondaryApp);

    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, req.email, tempPassword);
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email: req.email,
        fullname: req.fullname,
        role: 'recruiter',
        experience: req.experience || 0,
        adminVerified: true,
        accountStatus: 'active',
        createdAt: serverTimestamp(),
        profilePhotoURL: null
      });
      await deleteDoc(doc(db, 'recruiterRequests', req.id));
      await signOut(secondaryAuth);
      await deleteApp(secondaryApp);
      messageBox.showSuccess(`Recruiter created successfully!\nEmail: ${req.email}\nPassword: ${tempPassword}`);
    } catch (error: any) {
      console.error("Error approving recruiter:", error);
      messageBox.showError("Failed to create recruiter: " + error.message);
      await deleteApp(secondaryApp);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectRequest = (id: string) => {
    messageBox.showConfirm("Are you sure you want to reject this request?", async () => {
      try { await deleteDoc(doc(db, 'recruiterRequests', id)); } catch (error) { console.error("Error rejecting:", error); }
    });
  };

  const toggleUserStatus = async (user: any) => {
    if (user.role === 'admin') return;
    const newStatus = user.accountStatus === 'active' ? 'disabled' : 'active';
    try { await updateDoc(doc(db, 'users', user.id), { accountStatus: newStatus }); } catch (error) { console.error("Error updating status:", error); }
  };

  const handleDeleteJob = (jobId: string) => {
    messageBox.showConfirm("Are you sure you want to delete this job posting?", async () => {
      try { await deleteDoc(doc(db, 'jobs', jobId)); } catch (error) { console.error("Error deleting job:", error); }
    });
  };

  const handleDeleteUser = (userId: string) => {
    messageBox.showConfirm("Are you sure you want to delete this user?", async () => {
      try {
        await deleteDoc(doc(db, 'users', userId));
        try { await deleteDoc(doc(db, 'profiles', userId)); } catch (e) { }
      } catch (error) { console.error("Error deleting user:", error); messageBox.showError("Failed to delete user."); }
    });
  };

  const toggleEmailVerification = async (user: any) => {
    const newStatus = !user.adminVerified;
    try { await updateDoc(doc(db, 'users', user.id), { adminVerified: newStatus }); } catch (error) { console.error("Error updating verification:", error); }
  };

  const handleMarkContactRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'contactSubmissions', id), { status: 'read' });
      messageBox.showSuccess("Marked as read");
    } catch (error) {
      console.error("Error updating contact:", error);
      messageBox.showError("Failed to update status");
    }
  };

  const handleMarkBugFixed = async (id: string) => {
    try {
      await updateDoc(doc(db, 'bugReports', id), { status: 'fixed' });
      messageBox.showSuccess("Marked as fixed");
    } catch (error) {
      console.error("Error updating bug:", error);
      messageBox.showError("Failed to update status");
    }
  };

  const handleApproveReview = async (reviewId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'reviews', reviewId), { approved: !currentStatus });
      messageBox.showSuccess(`Review status updated to ${!currentStatus ? 'Approved' : 'Pending'}.`);
    } catch (error) {
      console.error("Error updating review status:", error);
      messageBox.showError("Failed to update review status.");
    }
  };

  const handleDeleteReview = (reviewId: string) => {
    messageBox.showConfirm("Are you sure you want to delete this review permanently?", async () => {
      try {
        await deleteDoc(doc(db, 'reviews', reviewId));
        messageBox.showSuccess("Review deleted.");
      } catch (error) {
        console.error("Error deleting review:", error);
        messageBox.showError("Failed to delete review.");
      }
    });
  };

  // --- Derived Data for Charts ---

  // Revenue Data (Grouped by Date)
  const revenueData = React.useMemo(() => {
    const grouped: Record<string, number> = {};
    transactions.forEach(t => {
      if (!t.createdAt?.toDate) return;
      const date = t.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      grouped[date] = (grouped[date] || 0) + (Number(t.amount) || 0);
    });
    return Object.keys(grouped).map(key => ({ name: key, amount: grouped[key] }));
  }, [transactions]);

  // User Distribution
  const userStats = React.useMemo(() => {
    const counts = { Candidate: 0, Recruiter: 0, Admin: 0 };
    users.forEach(u => {
      if (u.role === 'candidate') counts.Candidate++;
      else if (u.role === 'recruiter') counts.Recruiter++;
      else if (u.role === 'admin') counts.Admin++;
    });
    return Object.keys(counts).map(key => ({ name: key, value: counts[key as keyof typeof counts] }));
  }, [users]);

  // Job Trends (Grouped by Date)
  const jobStats = React.useMemo(() => {
    const grouped: Record<string, number> = {};
    jobs.forEach(j => {
      if (!j.createdAt?.toDate) return;
      const date = j.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      grouped[date] = (grouped[date] || 0) + 1;
    });
    return Object.keys(grouped).map(key => ({ name: key, count: grouped[key] })).slice(-7); // Last 7 days
  }, [jobs]);

  const totalRevenue = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  // Real-time computed stats for StatCards
  const todayStats = React.useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // New users today
    const newUsersToday = users.filter(u => {
      if (!u.createdAt?.toDate) return false;
      return u.createdAt.toDate() >= todayStart;
    }).length;

    // Jobs posted today
    const jobsToday = jobs.filter(j => {
      if (!j.createdAt?.toDate) return false;
      return j.createdAt.toDate() >= todayStart;
    }).length;

    // Interviews today
    const interviewsToday = interviews.filter(i => {
      if (!i.submittedAt?.toDate) return false;
      return i.submittedAt.toDate() >= todayStart;
    }).length;

    // Revenue today
    const revenueToday = transactions
      .filter(t => {
        if (!t.createdAt?.toDate) return false;
        return t.createdAt.toDate() >= todayStart;
      })
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    // Revenue this week vs last week (for percentage change)
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const thisWeekRevenue = transactions
      .filter(t => {
        if (!t.createdAt?.toDate) return false;
        const date = t.createdAt.toDate();
        return date >= weekStart;
      })
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const lastWeekRevenue = transactions
      .filter(t => {
        if (!t.createdAt?.toDate) return false;
        const date = t.createdAt.toDate();
        return date >= lastWeekStart && date < weekStart;
      })
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const revenueChangePercent = lastWeekRevenue > 0
      ? ((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue * 100).toFixed(1)
      : thisWeekRevenue > 0 ? '+100' : '0';

    return {
      newUsersToday,
      jobsToday,
      interviewsToday,
      revenueToday,
      revenueChangePercent
    };
  }, [users, jobs, interviews, transactions]);

  // --- Filtering ---
  const filteredData = () => {
    const term = searchTerm.toLowerCase();
    switch (activeTab) {
      case 'requests': return requests.filter(r => r.fullname?.toLowerCase().includes(term) || r.email?.toLowerCase().includes(term));
      case 'users': return users.filter(u => (u.fullname?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term)) && (userFilter === 'all' || u.role === userFilter));
      case 'jobs': return jobs.filter(j => j.title?.toLowerCase().includes(term) || (j.department || j.category || '').toLowerCase().includes(term));
      case 'transactions': return transactions.filter(t => t.userName?.toLowerCase().includes(term) || t.paymentId?.toLowerCase().includes(term));
      case 'submissions':
        const filteredContacts = contactSubmissions.filter(c => c.status !== 'read' && (c.name?.toLowerCase().includes(term) || c.email?.toLowerCase().includes(term) || c.subject?.toLowerCase().includes(term) || c.phone?.includes(term)));
        const filteredBugs = bugReports.filter(b => b.status !== 'fixed' && (b.name?.toLowerCase().includes(term) || b.email?.toLowerCase().includes(term) || b.feature?.toLowerCase().includes(term)));
        return { contacts: filteredContacts, bugs: filteredBugs };
      case 'reviews':
        return allReviews.filter(r => r.name?.toLowerCase().includes(term) || r.email?.toLowerCase().includes(term) || r.review?.toLowerCase().includes(term));
      case 'dbAccess':
        if (dbSubTab === 'users') {
          return users.filter(u => u.fullname?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term) || u.role?.toLowerCase().includes(term));
        } else if (dbSubTab === 'interviews') {
          return jobs.filter(j => j.title?.toLowerCase().includes(term) || (j.department || j.category || '').toLowerCase().includes(term) || j.accessCode?.toLowerCase().includes(term));
        } else {
          return allAttempts.filter(a => a.candidateInfo?.name?.toLowerCase().includes(term) || a.candidateInfo?.email?.toLowerCase().includes(term) || a.candidateInfo?.phone?.includes(term));
        }
      default: return [];
    }
  };
  const submissionsData = activeTab === 'submissions' ? filteredData() as { contacts: any[], bugs: any[] } : { contacts: [], bugs: [] };

  // --- Dynamic Pricing Calculations ---

  const totalEarnings = allAttempts.length * perInterviewPrice;

  const thisMonthEarnings = React.useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const attemptsThisMonth = allAttempts.filter(a => {
      if (!a.submittedAt?.toDate) return false;
      return a.submittedAt.toDate() >= startOfMonth;
    });
    
    return attemptsThisMonth.length * perInterviewPrice;
  }, [allAttempts, perInterviewPrice]);

  const thisMonthSubmissionsCount = React.useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const attemptsThisMonth = allAttempts.filter(a => {
      if (!a.submittedAt?.toDate) return false;
      return a.submittedAt.toDate() >= startOfMonth;
    });
    return attemptsThisMonth.length;
  }, [allAttempts]);

  const thisMonthInterviewsCount = React.useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const interviewsThisMonth = jobs.filter(j => {
      if (!j.createdAt?.toDate) return false;
      return j.createdAt.toDate() >= startOfMonth;
    });
    return interviewsThisMonth.length;
  }, [jobs]);

  const todayEarnings = React.useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const attemptsToday = allAttempts.filter(a => {
      if (!a.submittedAt?.toDate) return false;
      return a.submittedAt.toDate() >= todayStart;
    });
    return attemptsToday.length * perInterviewPrice;
  }, [allAttempts, perInterviewPrice]);

  const todaySubmissionsCount = React.useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const attemptsToday = allAttempts.filter(a => {
      if (!a.submittedAt?.toDate) return false;
      return a.submittedAt.toDate() >= todayStart;
    });
    return attemptsToday.length;
  }, [allAttempts]);

  const todayInterviewsCount = React.useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const interviewsToday = jobs.filter(j => {
      if (!j.createdAt?.toDate) return false;
      return j.createdAt.toDate() >= todayStart;
    });
    return interviewsToday.length;
  }, [jobs]);

  // --- DB Access Export Functions ---
  const getInterviewTitle = (id: string) => {
    const matching = jobs.find(j => j.id === id);
    return matching ? matching.title : `Interview ID: ${id}`;
  };

  const exportUsersCSV = () => {
    const headers = ["User ID", "Full Name", "Email", "Role", "Account Status", "Created At"];
    const rows = users.map(u => [
      `"${u.id}"`,
      `"${(u.fullname || u.name || "N/A").replace(/"/g, '""')}"`,
      `"${(u.email || "N/A").replace(/"/g, '""')}"`,
      `"${u.role || "candidate"}"`,
      `"${u.accountStatus || "active"}"`,
      `"${u.createdAt?.toDate ? u.createdAt.toDate().toLocaleString() : 'N/A'}"`
    ]);
    downloadCSV("DB_Users_Export.csv", [headers.join(","), ...rows.map(r => r.join(","))].join("\n"));
  };

  const exportInterviewsCSV = () => {
    const headers = ["Interview ID", "Title", "Department", "Required Experience (Years)", "Difficulty", "Access Code", "Created At"];
    const rows = jobs.map(j => [
      `"${j.id}"`,
      `"${(j.title || "Untitled").replace(/"/g, '""')}"`,
      `"${(j.department || j.category || "N/A").replace(/"/g, '""')}"`,
      `"${j.minExperience}-${j.maxExperience} years"`,
      `"${j.difficulty || "Medium"}"`,
      `"${j.accessCode || "N/A"}"`,
      `"${j.createdAt?.toDate ? j.createdAt.toDate().toLocaleString() : 'N/A'}"`
    ]);
    downloadCSV("DB_Interviews_Export.csv", [headers.join(","), ...rows.map(r => r.join(","))].join("\n"));
  };

  const exportAttemptsCSV = () => {
    const headers = ["Attempt ID", "Candidate Name", "Email", "Contact", "Applied Role / Interview", "Overall Score", "Resume Score", "Q&A Score", "Completion Status", "Submitted Date", "Resume URL", "Report URL"];
    const rows = allAttempts.map(a => [
      `"${a.id}"`,
      `"${(a.candidateInfo?.name || "N/A").replace(/"/g, '""')}"`,
      `"${(a.candidateInfo?.email || "N/A").replace(/"/g, '""')}"`,
      `"${(a.candidateInfo?.phone || "N/A").replace(/"/g, '""')}"`,
      `"${getInterviewTitle(a.interviewId).replace(/"/g, '""')}"`,
      `"${a.score || "N/A"}"`,
      `"${a.resumeScore || "N/A"}"`,
      `"${a.qnaScore || "N/A"}"`,
      `"${a.status || "Completed"}"`,
      `"${a.submittedAt?.toDate ? a.submittedAt.toDate().toLocaleString() : 'N/A'}"`,
      `"${(a.candidateResumeURL || "N/A").replace(/"/g, '""')}"`,
      `"${window.location.origin}/#/report/${a.interviewId}/${a.id}"`
    ]);
    downloadCSV("DB_Candidate_Submissions_Export.csv", [headers.join(","), ...rows.map(r => r.join(","))].join("\n"));
  };

  const exportFullDBJSON = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      platform: "InterviewXpert",
      collections: {
        users: users.map(u => ({ ...u, createdAt: u.createdAt?.toDate ? u.createdAt.toDate() : null })),
        interviews: jobs.map(j => ({ ...j, createdAt: j.createdAt?.toDate ? j.createdAt.toDate() : null })),
        submissions: allAttempts.map(a => ({ ...a, submittedAt: a.submittedAt?.toDate ? a.submittedAt.toDate() : null }))
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `InterviewXpert_Master_DB_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadCSV = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Render ---

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-black">
        <div className="w-32 h-32">
          <GShapeAnimation />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100 font-sans transition-colors duration-300">

      {/* Top Bar */}
      <div ref={headerRef} className="sticky top-0 z-30 flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-gray-200 dark:border-white/10">
        <div className="flex items-center gap-2 sm:gap-3 flex-1">
          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
          >
            {isMobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="w-[96px] sm:w-[132px] flex items-center justify-center">
            <Logo className="w-full h-auto" />
          </div>
        </div>

        <div className="hidden sm:flex flex-1 justify-center">
          <h2 className="text-sm sm:text-lg font-semibold text-gray-700 dark:text-gray-300">Admin Dashboard</h2>
        </div>

        <div className="flex items-center gap-2 sm:gap-6 flex-1 justify-end">
          <div className="relative group">
            <button className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 transition-colors group-hover:bg-gray-100 dark:group-hover:bg-white/5">
              <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400" />
              {requests.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 sm:w-2.5 sm:h-2.5 bg-red-500 rounded-full animate-pulse" />}
            </button>

            {/* Notification Dropdown */}
            <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-gray-200 dark:border-white/10 overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 transform translate-y-2 group-hover:translate-y-0">
              <div className="p-3 sm:p-4 border-b border-gray-100 dark:border-white/5 flex justify-between items-center">
                <h4 className="font-bold text-sm">Notifications</h4>
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{requests.length} New</span>
              </div>
              <div className="max-h-60 sm:max-h-80 overflow-y-auto">
                {requests.length === 0 ? (
                  <div className="p-6 sm:p-8 text-center text-gray-500 text-sm">No new notifications</div>
                ) : (
                  requests.map(req => (
                    <div key={req.id} onClick={() => setActiveTab('requests')} className="p-3 sm:p-4 border-b border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer transition-colors block">
                      <div className="flex gap-2 sm:gap-3">
                        <div className="mt-1 w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        <div>
                          <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">New Recruiter Request</p>
                          <p className="text-xs text-gray-500 mt-0.5">{req.fullname} wants to join.</p>
                          <p className="text-[10px] text-gray-400 mt-2">{req.createdAt?.toDate ? req.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="p-2 border-t border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-black/20">
                <button onClick={() => setActiveTab('requests')} className="w-full py-2 text-xs font-bold text-center text-primary hover:text-primary/80">View All Requests</button>
              </div>
            </div>
          </div>

          <div className="relative group">
            <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden border border-gray-300 dark:border-white/20 cursor-pointer">
              <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(adminData?.fullname || 'Admin')}&background=random`} alt="Admin" />
            </div>

            {/* Dropdown */}
            <div className="absolute right-0 top-full mt-2 w-44 sm:w-48 bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-gray-200 dark:border-white/10 overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 transform translate-y-2 group-hover:translate-y-0">
              <div className="p-3 sm:p-4 border-b border-gray-100 dark:border-white/5">
                <p className="font-bold text-xs sm:text-sm">{adminData?.fullname || 'Admin User'}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 truncate">{adminData?.email || 'admin@interviewxpert.com'}</p>
              </div>
              <a href="/#/admin/profile" className="block px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                👤 View Profile
              </a>
              <button
                onClick={() => signOut(auth)}
                className="w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors flex items-center gap-2"
              >
                <Trash2 size={14} className="rotate-180" /> Sign Out
              </button>

              {/* Theme Toggle */}
              <div className="p-2 sm:p-3 border-t border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-black/20 flex justify-center gap-1 sm:gap-2">
                <button onClick={() => setTheme('light')} className={`p-1.5 sm:p-2 rounded-lg transition-all ${theme === 'light' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`} title="Light Mode">
                  <Sun size={14} />
                </button>
                <button onClick={() => setTheme('dark')} className={`p-1.5 sm:p-2 rounded-lg transition-all ${theme === 'dark' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`} title="Dark Mode">
                  <Moon size={14} />
                </button>
                <button onClick={() => setTheme('system')} className={`p-1.5 sm:p-2 rounded-lg transition-all ${theme === 'system' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`} title="System Default">
                  <Monitor size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex relative">
        {/* Mobile Sidebar Overlay */}
        {isMobileSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}

        {/* Mobile Sidebar Drawer */}
        <nav
          className={`fixed lg:hidden top-0 left-0 h-full w-64 bg-white dark:bg-zinc-900 z-50 transform transition-transform duration-300 ease-in-out ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
            } border-r border-gray-200 dark:border-white/10 p-4 pt-20`}
        >
          <button
            onClick={() => setIsMobileSidebarOpen(false)}
            className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex flex-col gap-2">
            {[
              { id: 'overview', label: 'Overview', icon: Briefcase },
              { id: 'requests', label: 'Requests', icon: UserPlus, count: requests.length },
              { id: 'users', label: 'Users', icon: Users, count: users.length },
              { id: 'jobs', label: 'Interviews', icon: FileText, count: jobs.length },
              { id: 'transactions', label: 'Transactions', icon: DollarSign },
              { id: 'reviews', label: 'Reviews', icon: Star, count: allReviews.filter(r => !r.approved).length },
              { id: 'submissions', label: 'Inbox', icon: MessageSquareIcon, count: contactSubmissions.length + bugReports.length },
              { id: 'dbAccess', label: 'DB Access', icon: Server },
              { id: 'blogs', label: 'Manage Blogs', icon: BookOpen },
              { id: 'stats', label: 'Platform Stats', icon: Activity },
              { id: 'rateLimiting', label: 'Rate Limiting', icon: Gauge },
              { id: 'api', label: 'API & Integrations', icon: Database }
            ].map(item => (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'blogs') navigate('/admin/blogs');
                  else if (item.id === 'stats') navigate('/admin/stats');
                  else if (item.id === 'rateLimiting') navigate('/admin/rate-limiting');
                  else setActiveTab(item.id as any); 
                  setIsMobileSidebarOpen(false); 
                }}
                className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === item.id
                  ? 'bg-primary text-white dark:text-zinc-900 shadow-lg shadow-primary/20'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </div>
                {item.count !== undefined && (
                  <span className={`px-2 py-0.5 rounded-md text-xs ${activeTab === item.id ? 'bg-white/20 dark:bg-black/10 text-white dark:text-zinc-900' : 'bg-gray-200 dark:bg-white/10'}`}>
                    {item.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </nav>

        {/* Desktop Sidebar Navigation */}
        <nav ref={sidebarRef} className="hidden lg:flex flex-col w-64 h-[calc(100vh-73px)] sticky top-[73px] border-r border-gray-200 dark:border-white/10 p-4 gap-2">
          {[
            { id: 'overview', label: 'Overview', icon: Briefcase },
            { id: 'requests', label: 'Requests', icon: UserPlus, count: requests.length },
            { id: 'users', label: 'Users', icon: Users, count: users.length },
            { id: 'jobs', label: 'Interviews', icon: FileText, count: jobs.length },
            { id: 'transactions', label: 'Transactions', icon: DollarSign },
            { id: 'reviews', label: 'Reviews', icon: Star, count: allReviews.filter(r => !r.approved).length },
            { id: 'submissions', label: 'Inbox', icon: MessageSquareIcon, count: contactSubmissions.length + bugReports.length },
            { id: 'dbAccess', label: 'DB Access', icon: Server },
            { id: 'blogs', label: 'Manage Blogs', icon: BookOpen },
            { id: 'stats', label: 'Platform Stats', icon: Activity },
            { id: 'rateLimiting', label: 'Rate Limiting', icon: Gauge },
            { id: 'api', label: 'API & Integrations', icon: Database }
          ].map(item => (
            <button
              key={item.id}
              onClick={() => { 
                if (item.id === 'blogs') navigate('/admin/blogs');
                else if (item.id === 'stats') navigate('/admin/stats');
                else if (item.id === 'rateLimiting') navigate('/admin/rate-limiting');
                else setActiveTab(item.id as any);
              }}
              className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === item.id
                ? 'bg-primary text-white dark:text-zinc-900 shadow-lg shadow-primary/20'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
                }`}
            >
              <div className="flex items-center gap-3">
                <item.icon className="w-5 h-5" />
                {item.label}
              </div>
              {item.count !== undefined && (
                <span className={`px-2 py-0.5 rounded-md text-xs ${activeTab === item.id ? 'bg-white/20 dark:bg-black/10 text-white dark:text-zinc-900' : 'bg-gray-200 dark:bg-white/10'}`}>
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto min-w-0">

          {activeTab === 'overview' && (
            <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-300">
              {/* Stats Rows */}
              <div ref={statsRef} className="space-y-6 sm:space-y-8">
                
                {/* Row 1: Revenue & Financials */}
                <div className="p-5 sm:p-6 rounded-3xl border border-emerald-500/10 bg-emerald-50/10 dark:bg-emerald-950/5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                      <TrendingUp className="w-5 h-5 animate-pulse" />
                      <span className="text-xs sm:text-sm font-extrabold uppercase tracking-widest font-sans">Financial Performance Dashboard</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-full font-sans max-w-fit">
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>Per Interview Price: ₹{perInterviewPrice}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="relative overflow-hidden group p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-150 dark:border-white/5 shadow-sm hover:shadow-md transition-all hover:scale-[1.01]">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider font-sans">Total Platform Revenue</p>
                          <h3 className="text-2xl sm:text-3xl font-black mt-2 text-gray-900 dark:text-white font-sans">₹{totalEarnings.toLocaleString()}</h3>
                        </div>
                        <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform">
                          <DollarSign className="w-6 h-6" />
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                        <span className="px-2 py-0.5 bg-emerald-500/10 rounded">{allAttempts.length} paid responses</span>
                        <span>all time earning</span>
                      </div>
                    </div>

                    <div className="relative overflow-hidden group p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-150 dark:border-white/5 shadow-sm hover:shadow-md transition-all hover:scale-[1.01]">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider font-sans">This Month Earning</p>
                          <h3 className="text-2xl sm:text-3xl font-black mt-2 text-gray-900 dark:text-white font-sans">₹{thisMonthEarnings.toLocaleString()}</h3>
                        </div>
                        <div className="p-3 bg-teal-500/10 text-teal-600 rounded-2xl group-hover:scale-110 transition-transform">
                          <DollarSign className="w-6 h-6" />
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-teal-600">
                        <span className="px-2 py-0.5 bg-teal-500/10 rounded">{thisMonthSubmissionsCount} paid responses</span>
                        <span>current calendar month</span>
                      </div>
                    </div>

                    <div className="relative overflow-hidden group p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-150 dark:border-white/5 shadow-sm hover:shadow-md transition-all hover:scale-[1.01]">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider font-sans">Daily Earning</p>
                          <h3 className="text-2xl sm:text-3xl font-black mt-2 text-gray-900 dark:text-white font-sans">₹{todayEarnings.toLocaleString()}</h3>
                        </div>
                        <div className="p-3 bg-lime-500/10 text-lime-600 dark:text-lime-400 rounded-2xl group-hover:scale-110 transition-transform">
                          <DollarSign className="w-6 h-6" />
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-lime-600 dark:text-lime-400">
                        <span className="px-2 py-0.5 bg-lime-500/10 dark:bg-lime-500/20 rounded">{todaySubmissionsCount} paid responses</span>
                        <span>today's earning</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row 2: Submissions & Candidates */}
                <div className="p-5 sm:p-6 rounded-3xl border border-blue-500/10 bg-blue-50/10 dark:bg-blue-950/5 space-y-4">
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                    <Users className="w-5 h-5 animate-pulse" />
                    <span className="text-xs sm:text-sm font-extrabold uppercase tracking-widest font-sans">Candidate Response Analytics</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="relative overflow-hidden group p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-150 dark:border-white/5 shadow-sm hover:shadow-md transition-all hover:scale-[1.01]">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider font-sans">Total Completed Responses</p>
                          <h3 className="text-2xl sm:text-3xl font-black mt-2 text-gray-900 dark:text-white font-sans">{allAttempts.length}</h3>
                        </div>
                        <div className="p-3 bg-blue-500/10 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform">
                          <FileText className="w-6 h-6" />
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-blue-600">
                        <span className="px-2 py-0.5 bg-blue-500/10 rounded">All-Time Candidates</span>
                        <span>evaluated via AI</span>
                      </div>
                    </div>

                    <div className="relative overflow-hidden group p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-150 dark:border-white/5 shadow-sm hover:shadow-md transition-all hover:scale-[1.01]">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider font-sans">This Month Responses</p>
                          <h3 className="text-2xl sm:text-3xl font-black mt-2 text-gray-900 dark:text-white font-sans">{thisMonthSubmissionsCount}</h3>
                        </div>
                        <div className="p-3 bg-purple/10 text-purple rounded-2xl group-hover:scale-110 transition-transform">
                          <CheckCircle className="w-6 h-6" />
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-purple">
                        <span className="px-2 py-0.5 bg-purple/10 rounded">Completed This Month</span>
                        <span>evaluation cycle</span>
                      </div>
                    </div>

                    <div className="relative overflow-hidden group p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-150 dark:border-white/5 shadow-sm hover:shadow-md transition-all hover:scale-[1.01]">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider font-sans">Daily Responses</p>
                          <h3 className="text-2xl sm:text-3xl font-black mt-2 text-gray-900 dark:text-white font-sans">{todaySubmissionsCount}</h3>
                        </div>
                        <div className="p-3 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl group-hover:scale-110 transition-transform">
                          <CheckCircle className="w-6 h-6" />
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                        <span className="px-2 py-0.5 bg-indigo-500/10 dark:bg-indigo-500/20 rounded">Completed Today</span>
                        <span>responses tracked</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row 3: Recruiter campaigns */}
                <div className="p-5 sm:p-6 rounded-3xl border border-orange-500/10 bg-orange-50/10 dark:bg-orange-950/5 space-y-4">
                  <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                    <Video className="w-5 h-5 animate-pulse" />
                    <span className="text-xs sm:text-sm font-extrabold uppercase tracking-widest font-sans">Recruiter Campaign Activity</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="relative overflow-hidden group p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-150 dark:border-white/5 shadow-sm hover:shadow-md transition-all hover:scale-[1.01]">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider font-sans">Total Posted Campaigns</p>
                          <h3 className="text-2xl sm:text-3xl font-black mt-2 text-gray-900 dark:text-white font-sans">{jobs.length}</h3>
                        </div>
                        <div className="p-3 bg-orange-500/10 text-orange-600 rounded-2xl group-hover:scale-110 transition-transform">
                          <Video className="w-6 h-6" />
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-orange-600">
                        <span className="px-2 py-0.5 bg-orange-500/10 rounded">All-Time Posted</span>
                        <span>interviews by recruiters</span>
                      </div>
                    </div>

                    <div className="relative overflow-hidden group p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-150 dark:border-white/5 shadow-sm hover:shadow-md transition-all hover:scale-[1.01]">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider font-sans">Posted This Month</p>
                          <h3 className="text-2xl sm:text-3xl font-black mt-2 text-gray-900 dark:text-white font-sans">{thisMonthInterviewsCount}</h3>
                        </div>
                        <div className="p-3 bg-pink-500/10 text-pink-600 rounded-2xl group-hover:scale-110 transition-transform">
                          <Video className="w-6 h-6" />
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-pink-600">
                        <span className="px-2 py-0.5 bg-pink-500/10 rounded">Active Campaigns</span>
                        <span>launched in current cycle</span>
                      </div>
                    </div>

                    <div className="relative overflow-hidden group p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-150 dark:border-white/5 shadow-sm hover:shadow-md transition-all hover:scale-[1.01]">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider font-sans">Posted Today</p>
                          <h3 className="text-2xl sm:text-3xl font-black mt-2 text-gray-900 dark:text-white font-sans">{todayInterviewsCount}</h3>
                        </div>
                        <div className="p-3 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-2xl group-hover:scale-110 transition-transform">
                          <Video className="w-6 h-6" />
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400">
                        <span className="px-2 py-0.5 bg-rose-500/10 dark:bg-rose-500/20 rounded">Campaigns Today</span>
                        <span>new interview posts</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Charts Row 1 */}
              <div ref={chartsRef} className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                <div className="card chart-box lg:col-span-2 p-4 sm:p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 shadow-sm">
                  <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-800 dark:text-white">Revenue Overview</h3>
                  <RevenueAreaChart data={revenueData} />
                </div>
                <div className="card chart-box p-4 sm:p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 shadow-sm">
                  <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-800 dark:text-white">User Distribution</h3>
                  <UserPieChart data={userStats} />
                </div>
              </div>

              {/* Charts Row 2 */}
              <div className="card chart-box p-4 sm:p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 shadow-sm">
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-800 dark:text-white">Recent Job Postings Trend</h3>
                <JobBarChart data={jobStats} />
              </div>
            </div>
          )}

          {activeTab === 'requests' && (
            <div ref={contentRef} className="space-y-4">
              <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Recruiter Requests</h2>
              <div className="grid gap-3 sm:gap-4">
                {filteredData().length === 0 ? <p className="text-gray-500">No pending requests.</p> : filteredData().map((req) => (
                  <div key={req.id} className="animated-item flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 rounded-xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 shadow-sm hover:border-primary/30 transition-colors gap-4">
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-orange-100 dark:bg-orange-900/20 text-orange-600 flex items-center justify-center font-bold text-lg sm:text-xl shrink-0">
                        {req.fullname?.[0]}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-base sm:text-lg truncate">{req.fullname}</h4>
                        <p className="text-xs sm:text-sm text-gray-500 truncate">{req.email} • {req.experience} years exp</p>
                      </div>
                    </div>
                    <div className="flex gap-2 self-end sm:self-center">
                      <button onClick={() => handleApproveRecruiter(req)} disabled={!!processingId} className="px-3 sm:px-4 py-2 bg-black dark:bg-white text-white dark:text-black text-sm font-medium rounded-lg hover:opacity-80 disabled:opacity-50">
                        {processingId === req.id ? 'Processing...' : 'Approve'}
                      </button>
                      <button onClick={() => handleRejectRequest(req.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-4 sm:space-y-6">
              <div className="animated-item flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h2 className="text-xl sm:text-2xl font-bold">User Management</h2>
                  <div className="flex bg-gray-100 dark:bg-white/5 p-1 rounded-lg self-start sm:self-auto">
                    {['all', 'candidate', 'recruiter'].map(f => (
                      <button
                        key={f}
                        onClick={() => setUserFilter(f as any)}
                        className={`px-2 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium capitalize transition-all ${userFilter === f ? 'bg-white dark:bg-white/10 shadow-sm text-primary' : 'text-gray-500'}`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
              </div>

              {/* Mobile Card View */}
              <div className="block sm:hidden space-y-3">
                {filteredData().map(u => (
                  <div key={u.id} className="animated-item p-4 rounded-xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{u.fullname}</div>
                        <div className="text-xs text-gray-500 truncate">{u.email}</div>
                        <div 
                          className="flex items-center gap-1 mt-1 font-mono text-[9px] text-gray-400 dark:text-gray-400/80 bg-gray-50 dark:bg-black/20 hover:bg-gray-100 dark:hover:bg-white/5 border border-gray-200 dark:border-white/5 px-2 py-0.5 rounded w-fit cursor-pointer transition-colors" 
                          title="Click to copy User UID"
                          onClick={() => {
                            navigator.clipboard.writeText(u.id);
                            messageBox.showSuccess(`Copied UID for ${u.fullname}!`);
                          }}
                        >
                          <span>UID: {u.id}</span>
                        </div>
                      </div>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${u.accountStatus === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700'}`}>
                        {u.accountStatus || 'active'}
                      </span>
                    </div>
                    {/* Email Verification Status */}
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${u.adminVerified ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                        {u.adminVerified ? <ShieldCheck size={10} /> : <ShieldX size={10} />}
                        {u.adminVerified ? 'Email Verified' : 'Not Verified'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-white/5">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-white/10 capitalize">{u.role}</span>
                      {u.role !== 'admin' && (
                        <div className="flex gap-2 items-center">
                          <button
                            onClick={() => toggleEmailVerification(u)}
                            className={`text-xs font-medium px-2 py-1 rounded-md transition-colors ${u.adminVerified ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/10' : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/10'}`}
                          >
                            {u.adminVerified ? 'Unverify' : 'Verify Email'}
                          </button>
                          <button onClick={() => toggleUserStatus(u)} className="text-xs font-medium text-blue-600 hover:underline">{u.accountStatus === 'active' ? 'Disable' : 'Enable'}</button>
                          <button onClick={() => handleDeleteUser(u.id)} className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="overflow-x-auto hidden sm:block rounded-xl border border-gray-200 dark:border-white/5 bg-white dark:bg-zinc-900">
                <table className="w-full text-left min-w-[700px]">
                  <thead className="bg-gray-50 dark:bg-white/5 text-gray-500 text-xs uppercase font-semibold">
                    <tr>
                      <th className="px-4 lg:px-6 py-3">User</th>
                      <th className="px-4 lg:px-6 py-3">Role</th>
                      <th className="px-4 lg:px-6 py-3">Status</th>
                      <th className="px-4 lg:px-6 py-3">Email Verified</th>
                      <th className="px-4 lg:px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                    {filteredData().map(u => (
                      <tr key={u.id} className="animated-item hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-4 lg:px-6 py-4">
                          <div className="font-medium">{u.fullname}</div>
                          <div className="text-xs text-gray-500">{u.email}</div>
                          <div 
                            className="flex items-center gap-1 mt-1.5 font-mono text-[10px] text-gray-400 dark:text-gray-400/80 bg-gray-50 dark:bg-black/20 hover:bg-gray-100 dark:hover:bg-white/5 border border-gray-200 dark:border-white/5 px-2 py-0.5 rounded w-fit cursor-pointer transition-colors" 
                            title="Click to copy User UID"
                            onClick={() => {
                              navigator.clipboard.writeText(u.id);
                              messageBox.showSuccess(`Copied UID for ${u.fullname}!`);
                            }}
                          >
                            <span>UID: {u.id}</span>
                          </div>
                        </td>
                        <td className="px-4 lg:px-6 py-4"><span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-white/10 capitalize">{u.role}</span></td>
                        <td className="px-4 lg:px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${u.accountStatus === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700'}`}>
                            {u.accountStatus || 'active'}
                          </span>
                        </td>
                        <td className="px-4 lg:px-6 py-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${u.adminVerified ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                            {u.adminVerified ? <ShieldCheck size={12} /> : <ShieldX size={12} />}
                            {u.adminVerified ? 'Verified' : 'Not Verified'}
                          </span>
                        </td>
                        <td className="px-4 lg:px-6 py-4 text-right space-x-2">
                          {u.role !== 'admin' && (
                            <>
                              <button
                                onClick={() => toggleEmailVerification(u)}
                                className={`text-sm font-medium px-2 py-1 rounded-md transition-colors ${u.adminVerified ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/10' : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/10'}`}
                              >
                                {u.adminVerified ? 'Unverify' : 'Verify Email'}
                              </button>
                              <button onClick={() => toggleUserStatus(u)} className="text-sm font-medium text-blue-600 hover:underline">{u.accountStatus === 'active' ? 'Disable' : 'Enable'}</button>
                              <button onClick={() => handleDeleteUser(u.id)} className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'jobs' && (
            <div className="space-y-4 sm:space-y-6">
              <div className="animated-item flex flex-col gap-3">
                <h2 className="text-xl sm:text-2xl font-bold">Posted Interviews</h2>
                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by interview title or department..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
                {filteredData().map(job => (
                  <div key={job.id} className="animated-item p-4 sm:p-5 rounded-xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 shadow-sm hover:border-primary/50 transition-all group relative flex flex-col">
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <h3 className="font-bold text-base sm:text-lg truncate" title={job.title}>{job.title}</h3>
                      <button onClick={() => handleDeleteJob(job.id)} className="shrink-0 text-gray-400 hover:text-red-500 transition-colors bg-gray-100 dark:bg-white/5 p-1.5 rounded-lg"><Trash2 size={14} /></button>
                    </div>
                    <p className="text-gray-500 text-xs sm:text-sm mb-3 truncate">{job.department || job.employmentType || 'Recruiter Posted'}</p>
                    
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {job.accessCode && (
                        <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/20 text-blue-600 rounded text-xs font-mono">
                          Code: {job.accessCode}
                        </span>
                      )}
                      {job.difficulty && (
                        <span className="px-2 py-0.5 bg-purple/10 text-purple rounded text-xs font-medium">
                          {job.difficulty}
                        </span>
                      )}
                      {(job.minExperience !== undefined || job.maxExperience !== undefined) && (
                        <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/20 text-amber-600 rounded text-xs font-medium">
                          {job.minExperience}-{job.maxExperience} Yrs
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[10px] sm:text-xs text-gray-400 mt-auto pt-2 border-t border-gray-100 dark:border-white/5">
                      <span>{job.createdAt?.toDate ? job.createdAt.toDate().toLocaleDateString() : 'Just now'}</span>
                      <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-green-100 dark:bg-green-900/20 text-green-600 rounded-md font-semibold">Active</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'submissions' && (
            <div className="space-y-8">
              {/* Search Input */}
              <div className="relative animated-item">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search submissions by name, email, phone, or subject..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>

              {/* Contact Submissions */}
              <div className="space-y-4">
                <h2 className="text-xl sm:text-2xl font-bold">Contact Messages ({submissionsData.contacts.length})</h2>
                <div className="grid gap-4">
                  {submissionsData.contacts.length === 0 ? <p className="text-gray-500 animated-item">No contact messages.</p> : submissionsData.contacts.map((c) => (
                    <div key={c.id} className="animated-item p-5 rounded-xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 shadow-sm">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold">{c.subject || 'No Subject'}</h4>
                          <p className="text-sm text-gray-500">{c.name} ({c.email}) {c.phone && `• ${c.phone}`}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="text-xs text-gray-400">{c.createdAt?.toDate().toLocaleDateString()}</span>
                          <button onClick={() => handleMarkContactRead(c.id)} className="flex items-center gap-1 px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors">
                            <CheckCircle size={12} /> Mark Read
                          </button>
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-black/20 p-3 rounded-lg">{c.message}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bug Reports */}
              <div className="space-y-4">
                <h2 className="text-xl sm:text-2xl font-bold">Bug Reports ({submissionsData.bugs.length})</h2>
                <div className="grid gap-4">
                  {submissionsData.bugs.length === 0 ? <p className="text-gray-500 animated-item">No bug reports.</p> : submissionsData.bugs.map((b) => (
                    <div key={b.id} className="animated-item p-5 rounded-xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 shadow-sm">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-red-500 flex items-center gap-2"><Bug size={16} /> {b.feature}</h4>
                          <p className="text-sm text-gray-500">{b.name || 'Anonymous'} ({b.email || 'No email'})</p>
                          <div className="flex gap-2 mt-2">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                b.severity === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                b.severity === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                                b.severity === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            }`}>
                                {b.severity || 'medium'}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400 border border-gray-200 dark:border-white/10">
                                {b.type || 'functional'}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="text-xs text-gray-400">{b.createdAt?.toDate().toLocaleDateString()}</span>
                          <button onClick={() => handleMarkBugFixed(b.id)} className="flex items-center gap-1 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors">
                            <CheckCircle size={12} /> Mark Fixed
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                        <p><strong className="text-gray-500">Description:</strong> {b.description}</p>
                        {b.steps && <p className="mt-2 bg-gray-50 dark:bg-black/20 p-3 rounded-lg"><strong className="text-gray-500">Steps to reproduce:</strong><br/>{b.steps}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'reviews' && (
            <div className="space-y-4 sm:space-y-6">
              <div className="animated-item flex flex-col gap-3">
                <h2 className="text-xl sm:text-2xl font-bold">Review Management</h2>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name, email, or content..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredData().length === 0 ? <p className="text-gray-500 lg:col-span-2 text-center py-10">No reviews found.</p> : filteredData().map((review) => (
                  <div key={review.id} className="animated-item p-5 rounded-xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-bold">{review.name}</h4>
                        <p className="text-xs text-gray-500">{review.email} {review.contact && `• ${review.contact}`}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} size={16} className={i < review.rating ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'} fill={i < review.rating ? 'currentColor' : 'none'} />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 italic bg-gray-50 dark:bg-black/20 p-3 rounded-lg border border-gray-100 dark:border-white/5">"{review.review}"</p>
                    <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100 dark:border-white/5">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${review.approved ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                        {review.approved ? 'Approved' : 'Pending'}
                      </span>
                      <div className="flex gap-2"><button onClick={() => handleApproveReview(review.id, review.approved)} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors">{review.approved ? 'Unapprove' : 'Approve'}</button><button onClick={() => handleDeleteReview(review.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 size={16} /></button></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className="space-y-4 sm:space-y-6">
              <div className="animated-item flex flex-col gap-3">
                <h2 className="text-xl sm:text-2xl font-bold">Transaction History</h2>
                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name, email or payment ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
              </div>

              {/* Mobile Card View */}
              <div className="block sm:hidden space-y-3">
                {filteredData().map(t => (
                  <div key={t.id} className="animated-item p-4 rounded-xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 shadow-sm">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{t.userName}</div>
                        <div className="text-xs text-gray-500 truncate">{t.userEmail}</div>
                      </div>
                      <span className="shrink-0 text-green-500 font-bold text-sm">+₹{t.amount}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-gray-400 pt-2 border-t border-gray-100 dark:border-white/5">
                      <span>{t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString() : 'N/A'}</span>
                      <span className="font-mono truncate max-w-[150px]">{t.paymentId}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="animated-item overflow-x-auto hidden sm:block rounded-xl border border-gray-200 dark:border-white/5 bg-white dark:bg-zinc-900">
                <table className="w-full text-left min-w-[600px]">
                  <thead className="bg-gray-50 dark:bg-white/5 text-gray-500 text-xs uppercase font-semibold">
                    <tr>
                      <th className="px-4 lg:px-6 py-3">Paid By</th>
                      <th className="px-4 lg:px-6 py-3">Amount</th>
                      <th className="px-4 lg:px-6 py-3">Date</th>
                      <th className="px-4 lg:px-6 py-3">ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                    {filteredData().map(t => (
                      <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-4 lg:px-6 py-4">
                          <div className="font-medium">{t.userName}</div>
                          <div className="text-xs text-gray-500">{t.userEmail}</div>
                        </td>
                        <td className="px-4 lg:px-6 py-4 text-green-500 font-bold">+₹{t.amount}</td>
                        <td className="px-4 lg:px-6 py-4 text-gray-500 text-sm">{t.createdAt?.toDate ? t.createdAt.toDate().toLocaleString() : 'N/A'}</td>
                        <td className="px-4 lg:px-6 py-4 text-xs font-mono text-gray-400">{t.paymentId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'api' && (
            <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
              <div className="flex flex-col gap-2">
                <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                  <Database className="text-primary w-6 h-6 sm:w-7 sm:h-7" />
                  REST API & Database Integrations
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Connect InterviewXpert with external databases, ATS platforms, HRMS dashboards, or custom webhook systems.
                </p>
              </div>

              {/* API Credentials */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card p-5 sm:p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-primary font-bold">
                    <Key size={18} />
                    <span>Inward Integration (Receive Job Descriptions)</span>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                    Use our secure REST API endpoint to automatically create interviews and generate questions from your external databases.
                  </p>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Inward REST Endpoint</label>
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl font-mono text-xs text-gray-700 dark:text-gray-300 break-all select-all">
                        POST http://localhost:8080/api/jobs/receive
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Developer API Key</label>
                      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl">
                        <span className="font-mono text-xs text-gray-700 dark:text-gray-300 truncate">ix_live_test_api_key_123456789</span>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText('ix_live_test_api_key_123456789');
                            setCopiedKey(true);
                            setTimeout(() => setCopiedKey(false), 2000);
                          }}
                          className="text-gray-400 hover:text-primary transition-colors"
                          title="Copy API Key"
                        >
                          {copiedKey ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card p-5 sm:p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-green-500 font-bold">
                    <Globe size={18} />
                    <span>Outward Integration (Send Candidate Reports)</span>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                    Register a webhook delivery URL where InterviewXpert will automatically POST the complete candidate reports upon interview completion.
                  </p>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Outward Webhook URL</label>
                      <div className="flex gap-2">
                        <input 
                          type="url" 
                          value={webhookUrl}
                          onChange={(e) => {
                            setWebhookUrl(e.target.value);
                            setIsWebhookSaved(false);
                          }}
                          placeholder="https://your-hrms-database.com/webhooks"
                          className="flex-1 px-3 py-2 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl text-xs text-gray-700 dark:text-gray-300 focus:outline-none focus:border-green-500/50"
                        />
                        <button 
                          onClick={() => {
                            setIsWebhookSaved(true);
                            messageBox.showSuccess("Webhook URL successfully saved!");
                          }}
                          className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs font-semibold transition-colors shrink-0"
                        >
                          {isWebhookSaved ? "Saved ✓" : "Save"}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Webhook Signature Secret</label>
                      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl">
                        <span className="font-mono text-xs text-gray-700 dark:text-gray-300 truncate">ix_webhook_secret_signature_987654321</span>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText('ix_webhook_secret_signature_987654321');
                            setCopiedWebhook(true);
                            setTimeout(() => setCopiedWebhook(false), 2000);
                          }}
                          className="text-gray-400 hover:text-green-500 transition-colors"
                          title="Copy Signature Secret"
                        >
                          {copiedWebhook ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Developer Code Hub */}
              <div className="card p-5 sm:p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 dark:border-white/5 pb-4">
                  <div className="flex items-center gap-2 font-bold text-gray-800 dark:text-white">
                    <Code size={18} className="text-primary" />
                    <span>REST API Code Integration Snippets</span>
                  </div>
                  <div className="flex bg-gray-100 dark:bg-white/5 p-1 rounded-lg self-start sm:self-auto">
                    {(['curl', 'node', 'python'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActiveCodeTab(tab)}
                        className={`px-3 py-1 rounded-md text-xs font-semibold uppercase transition-all ${activeCodeTab === tab ? 'bg-white dark:bg-white/10 shadow-sm text-primary' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                      >
                        {tab === 'node' ? 'Node.js' : tab}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/5 rounded-xl p-4 overflow-x-auto max-h-[380px] custom-scrollbar font-mono text-xs text-gray-700 dark:text-zinc-300 leading-relaxed whitespace-pre font-medium">
                  {activeCodeTab === 'curl' && (
                    `curl -X POST http://localhost:8080/api/jobs/receive \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ix_live_test_api_key_123456789" \\
  -d '{
    "title": "Machine Learning Engineer",
    "description": "Looking for experts in PyTorch, TensorFlow, and NLP transformers.",
    "department": "Artificial Intelligence",
    "skills": "PyTorch, NLP, Transformers",
    "experience": 3
  }'`
                  )}

                  {activeCodeTab === 'node' && (
                    `const fetch = require('node-fetch');

const sendJobToInterviewXpert = async () => {
  const url = 'http://localhost:8080/api/jobs/receive';
  const apiKey = 'ix_live_test_api_key_123456789';

  const payload = {
    title: "Senior Full Stack developer",
    description: "Solid proficiency in React, Node.js, and Postgres.",
    department: "Engineering",
    experience: 5,
    skills: "React, Node.js, Postgres",
    numQuestions: 5,
    difficulty: "Medium"
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${apiKey}\`
      },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      console.log("✅ Scheduled successfully in InterviewXpert!");
      console.log(\`Interview URL: \${result.data.interviewLink}\`);
    } else {
      console.error(\`❌ Ingestion Failed: \${result.error}\`);
    }
  } catch (error) {
    console.error("Connection failed:", error);
  }
};

sendJobToInterviewXpert();`
                  )}

                  {activeCodeTab === 'python' && (
                    `import requests

def push_job_description():
    url = "http://localhost:8080/api/jobs/receive"
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer ix_live_test_api_key_123456789"
    }
    
    payload = {
        "title": "Data Analyst",
        "description": "Excellence in building interactive SQL & Tableau dashboard pipelines.",
        "department": "Analytics Team",
        "experience": 2,
        "skills": "SQL, Tableau, Python",
        "difficulty": "Medium"
      }

    try:
        response = requests.post(url, json=payload, headers=headers)
        data = response.json()
        if data.get("success"):
            print("✅ Scheduled successfully!")
            print(f"Interview Link: {data['data']['interviewLink']}")
        else:
            print(f"❌ Error: {data.get('error')}")
    except Exception as e:
        print(f"Connection failed: {e}")

push_job_description()`
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'dbAccess' && (
            <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
              <div className="flex flex-col gap-2">
                <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                  <Database className="text-primary w-6 h-6 sm:w-7 sm:h-7" />
                  Database Access & Consolidated Exporter
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Access live data tables directly, view candidates, posted recruiter interviews, and perform consolidated spreadsheet exports.
                </p>
              </div>

              {/* Data Exporter Dashboard */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                  onClick={exportAttemptsCSV}
                  className="flex flex-col items-start text-left p-4 sm:p-5 rounded-2xl border border-emerald-500/20 bg-emerald-50/30 dark:bg-emerald-950/10 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-all hover:scale-[1.01] group shadow-sm"
                >
                  <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-xl mb-3 group-hover:scale-105 transition-transform"><FileText size={20} /></div>
                  <span className="font-bold text-sm text-gray-900 dark:text-white">Export Responses CSV</span>
                  <span className="text-xs text-gray-500 mt-1">Export all {allAttempts.length} candidate attempts, emails, contacts, scores, and resume links.</span>
                </button>

                <button
                  onClick={exportInterviewsCSV}
                  className="flex flex-col items-start text-left p-4 sm:p-5 rounded-2xl border border-indigo-500/20 bg-indigo-50/30 dark:bg-indigo-950/10 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-all hover:scale-[1.01] group shadow-sm"
                >
                  <div className="p-2 bg-indigo-500/10 text-indigo-600 rounded-xl mb-3 group-hover:scale-105 transition-transform"><FileText size={20} /></div>
                  <span className="font-bold text-sm text-gray-900 dark:text-white">Export Interviews CSV</span>
                  <span className="text-xs text-gray-500 mt-1">Export all {jobs.length} recruiter interview schedules, access codes, and required skills.</span>
                </button>

                <button
                  onClick={exportUsersCSV}
                  className="flex flex-col items-start text-left p-4 sm:p-5 rounded-2xl border border-blue-500/20 bg-blue-50/30 dark:bg-blue-950/10 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all hover:scale-[1.01] group shadow-sm"
                >
                  <div className="p-2 bg-blue-500/10 text-blue-600 rounded-xl mb-3 group-hover:scale-105 transition-transform"><Users size={20} /></div>
                  <span className="font-bold text-sm text-gray-900 dark:text-white">Export Users Directory</span>
                  <span className="text-xs text-gray-500 mt-1">Export all {users.length} registered candidate and recruiter profiles.</span>
                </button>

                <button
                  onClick={exportFullDBJSON}
                  className="flex flex-col items-start text-left p-4 sm:p-5 rounded-2xl border border-purple/20 bg-purple/5 hover:bg-purple/10 transition-all hover:scale-[1.01] group shadow-sm"
                >
                  <div className="p-2 bg-purple/10 text-purple rounded-xl mb-3 group-hover:scale-105 transition-transform"><Database size={20} /></div>
                  <span className="font-bold text-sm text-gray-900 dark:text-white">Full DB Backup JSON</span>
                  <span className="text-xs text-gray-500 mt-1">Download a single consolidated backup snapshot file of the entire platform database.</span>
                </button>
              </div>

              {/* Data Explorer */}
              <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-white/10">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="flex bg-gray-100 dark:bg-zinc-800 p-1 rounded-xl w-full sm:w-auto">
                    {[
                      { id: 'submissions', label: `Submissions (${allAttempts.length})` },
                      { id: 'interviews', label: `Interviews (${jobs.length})` },
                      { id: 'users', label: `Users (${users.length})` }
                    ].map(sub => (
                      <button
                        key={sub.id}
                        onClick={() => { setDbSubTab(sub.id as any); setSearchTerm(''); }}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${dbSubTab === sub.id
                          ? 'bg-white dark:bg-zinc-900 shadow-sm text-gray-900 dark:text-white font-bold'
                          : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder={`Search ${dbSubTab}...`}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                </div>

                {/* Submissions Table Explorer */}
                {dbSubTab === 'submissions' && (
                  <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/5 bg-white dark:bg-zinc-900">
                    <table className="w-full text-left min-w-[900px]">
                      <thead className="bg-gray-50 dark:bg-white/5 text-gray-500 text-xs uppercase font-semibold">
                        <tr>
                          <th className="px-6 py-3">Candidate</th>
                          <th className="px-6 py-3">Contact Info</th>
                          <th className="px-6 py-3">Applied Role</th>
                          <th className="px-6 py-3">Scores (Overall/Resume/Q&A)</th>
                          <th className="px-6 py-3">Completed Date</th>
                          <th className="px-6 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-white/5 text-sm">
                        {(filteredData() as any[]).map((item: any) => (
                          <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4 font-bold capitalize text-gray-900 dark:text-white">{item.candidateInfo?.name || 'N/A'}</td>
                            <td className="px-6 py-4">
                              <div className="text-gray-900 dark:text-white font-medium">{item.candidateInfo?.email || 'N/A'}</div>
                              <div className="text-xs text-gray-500">{item.candidateInfo?.phone || 'N/A'}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-gray-900 dark:text-white font-medium truncate max-w-[150px]">{getInterviewTitle(item.interviewId)}</div>
                              <div className="text-[10px] text-gray-500 font-mono">ID: {item.interviewId}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex gap-2">
                                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/20 text-blue-600 rounded text-xs font-bold" title="Overall Score">
                                  {item.score || 'N/A'}
                                </span>
                                <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 rounded text-xs font-medium" title="Q&A Score">
                                  Q: {item.qnaScore || 'N/A'}
                                </span>
                                <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/20 text-amber-600 rounded text-xs font-medium" title="Resume Score">
                                  R: {item.resumeScore || 'N/A'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-gray-500 text-xs">
                              {item.submittedAt?.toDate ? item.submittedAt.toDate().toLocaleString() : 'N/A'}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <a
                                href={`/#/report/${item.interviewId}/${item.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-lg transition-colors font-bold"
                              >
                                View Report &rarr;
                              </a>
                            </td>
                          </tr>
                        ))}
                        {filteredData().length === 0 && (
                          <tr>
                            <td colSpan={6} className="text-center py-8 text-gray-400 italic">No submissions matching search found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Interviews Table Explorer */}
                {dbSubTab === 'interviews' && (
                  <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/5 bg-white dark:bg-zinc-900">
                    <table className="w-full text-left min-w-[800px]">
                      <thead className="bg-gray-50 dark:bg-white/5 text-gray-500 text-xs uppercase font-semibold">
                        <tr>
                          <th className="px-6 py-3">Interview Title</th>
                          <th className="px-6 py-3">Department</th>
                          <th className="px-6 py-3">Experience Required</th>
                          <th className="px-6 py-3">Access Code</th>
                          <th className="px-6 py-3">Difficulty</th>
                          <th className="px-6 py-3">Date Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-white/5 text-sm">
                        {(filteredData() as any[]).map((item: any) => (
                          <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">
                              {item.title}
                              <div className="text-[10px] text-gray-500 font-mono font-normal">ID: {item.id}</div>
                            </td>
                            <td className="px-6 py-4 text-gray-700 dark:text-gray-300 font-medium">{item.department || item.category || 'N/A'}</td>
                            <td className="px-6 py-4 text-gray-500">{item.minExperience}-{item.maxExperience} yrs</td>
                            <td className="px-6 py-4 font-mono font-bold text-blue-600">{item.accessCode || 'N/A'}</td>
                            <td className="px-6 py-4">
                              <span className="px-2.5 py-1 bg-purple/10 text-purple rounded text-xs font-semibold">{item.difficulty || 'Medium'}</span>
                            </td>
                            <td className="px-6 py-4 text-gray-500 text-xs">{item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString() : 'N/A'}</td>
                          </tr>
                        ))}
                        {filteredData().length === 0 && (
                          <tr>
                            <td colSpan={6} className="text-center py-8 text-gray-400 italic">No interviews matching search found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Users Table Explorer */}
                {dbSubTab === 'users' && (
                  <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/5 bg-white dark:bg-zinc-900">
                    <table className="w-full text-left min-w-[700px]">
                      <thead className="bg-gray-50 dark:bg-white/5 text-gray-500 text-xs uppercase font-semibold">
                        <tr>
                          <th className="px-6 py-3">Full Name</th>
                          <th className="px-6 py-3">Email Address</th>
                          <th className="px-6 py-3">Role</th>
                          <th className="px-6 py-3">Account Status</th>
                          <th className="px-6 py-3">Registration Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-white/5 text-sm">
                        {(filteredData() as any[]).map((item: any) => (
                          <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4 font-bold text-gray-900 dark:text-white capitalize">{item.fullname || item.name || 'N/A'}</td>
                            <td className="px-6 py-4 text-gray-600 dark:text-gray-300 font-medium">{item.email}</td>
                            <td className="px-6 py-4 capitalize">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${item.role === 'admin' ? 'bg-amber-100 text-amber-800' : item.role === 'recruiter' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                                {item.role || 'candidate'}
                              </span>
                            </td>
                            <td className="px-6 py-4 capitalize">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${item.accountStatus === 'disabled' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                {item.accountStatus || 'active'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-gray-500 text-xs">{item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString() : 'N/A'}</td>
                          </tr>
                        ))}
                        {filteredData().length === 0 && (
                          <tr>
                            <td colSpan={5} className="text-center py-8 text-gray-400 italic">No users matching search found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: string | number; change: string; icon: any; color: string; className?: string }> = ({ title, value, change, icon: Icon, color, className }) => (
  <div className={`card p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 shadow-sm hover:shadow-md transition-all ${className || ''}`}>
    <div className="flex justify-between items-start mb-2 sm:mb-4">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] sm:text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{title}</p>
        <h3 className="text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 truncate">{value}</h3>
      </div>
      <div className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-gray-50 dark:bg-white/5 shrink-0 ${color}`}>
        <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
      </div>
    </div>
    <div className="flex items-center text-[10px] sm:text-xs font-medium text-green-500">
      <span className="bg-green-100 dark:bg-green-900/20 px-1 sm:px-1.5 py-0.5 rounded mr-1 sm:mr-2 truncate max-w-[60px] sm:max-w-none">{change}</span>
      <span className="text-gray-400 hidden sm:inline">vs last month</span>
    </div>
  </div>
);

export default AdminDashboard;
