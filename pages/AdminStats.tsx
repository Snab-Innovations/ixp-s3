import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, getDocs, collectionGroup, query } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LayoutDashboard, Video, Users, Calendar, Clock, Printer, X, Settings, Plus, Mail, Phone, FileText, Image as ImageIcon, Building, Hash, Globe, Tag } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import Logo from '../components/Logo';

interface InterviewDetail {
  id: string;
  title: string;
  createdAt: any;
  responses: number;
}

interface ResponseDetail {
  id: string;
  candidateName: string;
  candidateEmail: string;
  interviewTitle: string;
  submittedAt: any;
}

const AdminStats: React.FC = () => {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  
  const [interviewsStats, setInterviewsStats] = useState({ today: 0, thisMonth: 0, total: 0 });
  const [responsesStats, setResponsesStats] = useState({ today: 0, thisMonth: 0, total: 0 });
  const [interviewsList, setInterviewsList] = useState<InterviewDetail[]>([]);
  const [showInterviewsModal, setShowInterviewsModal] = useState(false);
  const [responsesList, setResponsesList] = useState<ResponseDetail[]>([]);
  const [showResponsesModal, setShowResponsesModal] = useState(false);
  const [printMode, setPrintMode] = useState<'invoice' | 'summary' | 'responses'>('invoice');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);

  const handlePrintSummary = () => {
    setPrintMode('summary');
    setTimeout(() => window.print(), 100);
  };

  const handlePrintResponses = () => {
    setPrintMode('responses');
    setTimeout(() => window.print(), 100);
  };

  const handlePrintInvoice = () => {
    setPrintMode('invoice');
    setTimeout(() => window.print(), 100);
  };

  // Helpers for invoice default values
  const getTodayFormattedDate = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const generateDefaultInvoiceId = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const rand = Math.floor(100 + Math.random() * 900);
    return `INV-${yyyy}${mm}${dd}-${rand}`;
  };

  // Billing Modal State & Full Invoice Configuration
  const [showBillModal, setShowBillModal] = useState(false);
  const [activeConfigTab, setActiveConfigTab] = useState<'invoice' | 'company' | 'client' | 'items' | 'footer'>('invoice');
  
  const [billConfig, setBillConfig] = useState({
    invoiceNumber: generateDefaultInvoiceId(),
    invoiceDate: getTodayFormattedDate(),
    logoUrl: '/logosnab.png',
    companyName: 'interviewxpert.in',
    companyEmail: 'hackathon746@gmail.com',
    companyPhone: '+91 95455 56045',
    companyAddress: 'SNAB Innovations',
    clientName: 'Platform Admin',
    clientCompany: 'InterviewXpert Enterprise',
    clientEmail: 'admin@interviewxpert.in',
    clientAddress: '',
    billingPeriod: '',
    taxRate: 18,
    footerTitle: 'Thank you for your business',
    footerSubtext: 'This is a system-generated invoice and does not require a physical signature.',
    items: [
      { id: 1, description: 'Candidate Interview Responses', quantity: 0, unitPrice: 15 }
    ]
  });

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const [year, month] = selectedMonth.split('-').map(Number);
    const startOfSelectedMonth = new Date(year, month - 1, 1);
    const endOfSelectedMonth = new Date(year, month, 0, 23, 59, 59, 999);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const activeInterviewsMap = new Map<string, any>();
    const attemptsDocsMap = new Map<string, any>();
    const topLevelResponsesMap = new Map<string, any>();

    const recompute = () => {
      if (!isMounted) return;

      // Merge attempts from collectionGroup and candidateResponses top-level collection
      const mergedResponsesMap = new Map<string, any>();

      attemptsDocsMap.forEach((data, id) => {
        mergedResponsesMap.set(id, data);
      });

      topLevelResponsesMap.forEach((data, id) => {
        if (!mergedResponsesMap.has(id)) {
          mergedResponsesMap.set(id, data);
        } else {
          const existing = mergedResponsesMap.get(id);
          mergedResponsesMap.set(id, { ...existing, ...data });
        }
      });

      // 1. Calculate Candidate Responses Statistics & List
      let respToday = 0;
      let respMonth = 0;
      let respTotal = mergedResponsesMap.size;
      let tempResponsesList: ResponseDetail[] = [];

      // Map to count monthly responses per interview ID
      const interviewMonthlyRespCounts = new Map<string, number>();
      // Map to hold interview titles from attempts for deleted/missing jobs
      const interviewTitlesFromAttempts = new Map<string, string>();
      // Map to hold earliest attempt date for deleted/missing jobs
      const interviewEarliestDateFromAttempts = new Map<string, Date>();

      mergedResponsesMap.forEach((data, docId) => {
        const timestamp = data.submittedAt || data.createdAt || data.savedAt;
        const date = timestamp?.toDate ? timestamp.toDate() : (timestamp instanceof Date ? timestamp : null);

        const interviewId = data.interviewId || data.jobId || 'unknown';
        const rawTitle = data.interviewTitle || data.jobTitle || data.title || (activeInterviewsMap.get(interviewId)?.title) || 'Untitled Interview';
        
        if (!interviewTitlesFromAttempts.has(interviewId) && rawTitle) {
          interviewTitlesFromAttempts.set(interviewId, rawTitle);
        }

        if (date) {
          if (date >= startOfToday) {
            respToday++;
          }
          if (date >= startOfSelectedMonth && date <= endOfSelectedMonth) {
            respMonth++;
            interviewMonthlyRespCounts.set(interviewId, (interviewMonthlyRespCounts.get(interviewId) || 0) + 1);

            const isJobDeleted = interviewId !== 'unknown' && !activeInterviewsMap.has(interviewId);
            const formattedTitle = isJobDeleted ? `${rawTitle} (Deleted Job)` : rawTitle;

            tempResponsesList.push({
              id: docId,
              candidateName: data.candidateInfo?.name || data.candidateName || 'Unknown Candidate',
              candidateEmail: data.candidateInfo?.email || data.candidateEmail || 'N/A',
              interviewTitle: formattedTitle,
              submittedAt: timestamp || null
            });
          }
        }

        if (date && interviewId !== 'unknown') {
          const existingEarliest = interviewEarliestDateFromAttempts.get(interviewId);
          if (!existingEarliest || date < existingEarliest) {
            interviewEarliestDateFromAttempts.set(interviewId, date);
          }
        }
      });

      tempResponsesList.sort((a, b) => {
        const dateA = a.submittedAt?.toDate ? a.submittedAt.toDate().getTime() : 0;
        const dateB = b.submittedAt?.toDate ? b.submittedAt.toDate().getTime() : 0;
        return dateB - dateA;
      });

      // 2. Build Interviews Statistics & List
      // We combine active interviews with deleted/missing interviews that have candidate responses
      const allInterviewIds = new Set<string>([
        ...Array.from(activeInterviewsMap.keys()),
        ...Array.from(interviewTitlesFromAttempts.keys())
      ]);

      let interviewsTodayCount = 0;
      let interviewsMonthCount = 0;
      let interviewsTotalCount = allInterviewIds.size;
      let tempInterviewsList: InterviewDetail[] = [];

      allInterviewIds.forEach(id => {
        const activeData = activeInterviewsMap.get(id);
        const isDeleted = !activeData;
        const title = activeData?.title || activeData?.jobTitle || interviewTitlesFromAttempts.get(id) || 'Job (Deleted)';
        const timestamp = activeData?.createdAt || activeData?.submittedAt || interviewEarliestDateFromAttempts.get(id);
        const date = timestamp?.toDate ? timestamp.toDate() : (timestamp instanceof Date ? timestamp : null);
        const monthResponsesCount = interviewMonthlyRespCounts.get(id) || 0;

        const createdInMonth = date && date >= startOfSelectedMonth && date <= endOfSelectedMonth;
        const createdToday = date && date >= startOfToday;

        if (createdToday || monthResponsesCount > 0) {
          interviewsTodayCount++;
        }
        if (createdInMonth || monthResponsesCount > 0) {
          interviewsMonthCount++;
          tempInterviewsList.push({
            id,
            title: isDeleted ? `${title} (Deleted Job)` : title,
            createdAt: activeData?.createdAt || (date ? { toDate: () => date } : null),
            responses: monthResponsesCount
          });
        }
      });

      tempInterviewsList.sort((a, b) => b.responses - a.responses);

      setResponsesStats({ today: respToday, thisMonth: respMonth, total: respTotal });
      setInterviewsStats({ today: interviewsTodayCount, thisMonth: interviewsMonthCount, total: interviewsTotalCount });
      setInterviewsList(tempInterviewsList);
      setResponsesList(tempResponsesList);
      setLoading(false);
    };

    const unsubInterviews = onSnapshot(collection(db, 'interviews'), (snapshot) => {
      activeInterviewsMap.clear();
      snapshot.docs.forEach(doc => {
        activeInterviewsMap.set(doc.id, { id: doc.id, ...doc.data() });
      });
      recompute();
    }, (err) => console.error("Error fetching interviews snapshot:", err));

    const unsubAttempts = onSnapshot(query(collectionGroup(db, 'attempts')), (snapshot) => {
      attemptsDocsMap.clear();
      snapshot.docs.forEach(doc => {
        attemptsDocsMap.set(doc.id, doc.data());
      });
      recompute();
    }, (err) => console.error("Error fetching attempts collectionGroup snapshot:", err));

    const unsubTopResponses = onSnapshot(collection(db, 'candidateResponses'), (snapshot) => {
      topLevelResponsesMap.clear();
      snapshot.docs.forEach(doc => {
        topLevelResponsesMap.set(doc.id, doc.data());
      });
      recompute();
    }, (err) => console.error("Error fetching candidateResponses snapshot:", err));

    return () => {
      isMounted = false;
      unsubInterviews();
      unsubAttempts();
      unsubTopResponses();
    };
  }, [selectedMonth]);

  const addBillItem = () => {
    setBillConfig(prev => ({
      ...prev,
      items: [...prev.items, { id: Date.now(), description: 'New Custom Service', quantity: 1, unitPrice: 100 }]
    }));
  };

  const removeBillItem = (id: number) => {
    setBillConfig(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id)
    }));
  };

  const updateBillItem = (id: number, field: string, value: any) => {
    setBillConfig(prev => ({
      ...prev,
      items: prev.items.map(item => item.id === id ? { ...item, [field]: value } : item)
    }));
  };

  const renderInvoiceContent = () => {
    const subtotal = billConfig.items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
    const taxAmount = subtotal * (billConfig.taxRate / 100);
    const totalDue = subtotal + taxAmount;

    const computedPeriod = billConfig.billingPeriod || 
      `${new Date(Number(selectedMonth.split('-')[0]), Number(selectedMonth.split('-')[1]) - 1).toLocaleString('default', { month: 'long' })} ${selectedMonth.split('-')[0]}`;

    let formattedDate = billConfig.invoiceDate;
    if (billConfig.invoiceDate && !isNaN(Date.parse(billConfig.invoiceDate))) {
      const parsedDate = new Date(billConfig.invoiceDate);
      formattedDate = parsedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    return (
      <div className="text-black font-sans w-full h-full flex flex-col bg-white">
        {/* Header */}
        <div className="flex justify-between items-start border-b-4 border-black pb-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              {billConfig.logoUrl ? (
                <img 
                  src={billConfig.logoUrl} 
                  alt="Company Logo" 
                  className="h-12 max-w-[200px] object-contain" 
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-36 invert">
                  <Logo className="w-full" />
                </div>
              )}
            </div>
            {billConfig.companyName && <p className="text-black font-bold text-sm">{billConfig.companyName}</p>}
            {billConfig.companyEmail && <p className="text-gray-800 font-medium text-sm">{billConfig.companyEmail}</p>}
            {billConfig.companyPhone && <p className="text-gray-800 font-medium text-sm">{billConfig.companyPhone}</p>}
            {billConfig.companyAddress && <p className="text-gray-600 font-medium text-xs mt-0.5">{billConfig.companyAddress}</p>}
          </div>
          <div className="text-right">
            <h1 className="text-4xl font-black text-black uppercase tracking-widest mb-4">INVOICE</h1>
            <div className="flex justify-end gap-8 text-xs">
              <div className="text-right">
                <p className="text-gray-500 uppercase tracking-widest font-bold mb-0.5">Invoice No</p>
                <p className="text-black font-black text-sm">{billConfig.invoiceNumber || 'N/A'}</p>
              </div>
              <div className="text-right">
                <p className="text-gray-500 uppercase tracking-widest font-bold mb-0.5">Date</p>
                <p className="text-black font-black text-sm">{formattedDate || 'N/A'}</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Bill Info */}
        <div className="flex justify-between mb-8 border-2 border-black p-4">
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Billed To</p>
            <h3 className="text-xl font-black text-black uppercase leading-tight">{billConfig.clientName}</h3>
            <p className="text-black font-bold text-sm">{billConfig.clientCompany}</p>
            {billConfig.clientEmail && <p className="text-gray-700 font-medium text-xs mt-0.5">{billConfig.clientEmail}</p>}
            {billConfig.clientAddress && <p className="text-gray-600 font-medium text-xs mt-0.5">{billConfig.clientAddress}</p>}
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Billing Period</p>
            <h3 className="text-xl font-black text-black uppercase leading-tight">
              {computedPeriod}
            </h3>
          </div>
        </div>

        {/* Table */}
        <table className="w-full text-left border-collapse mb-6 flex-1">
          <thead>
            <tr className="border-b-2 border-black text-[10px] uppercase tracking-widest text-black">
              <th className="py-2 font-black">Description</th>
              <th className="py-2 text-center font-black">Qty</th>
              <th className="py-2 text-right font-black">Unit Price</th>
              <th className="py-2 text-right font-black">Amount</th>
            </tr>
          </thead>
          <tbody>
            {billConfig.items.map(item => (
              <tr key={item.id} className="border-b border-gray-300">
                <td className="py-3 pr-4">
                  <p className="font-bold text-black text-base leading-tight">{item.description}</p>
                </td>
                <td className="py-3 text-center text-base font-bold text-black">{item.quantity}</td>
                <td className="py-3 text-right text-sm text-black font-medium">₹{item.unitPrice.toLocaleString()}</td>
                <td className="py-3 text-right text-base font-black text-black">₹{(item.quantity * item.unitPrice).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-6 mt-4">
          <div className="w-full sm:w-2/3 md:w-1/2">
            <div className="flex justify-between py-2 border-b border-gray-300">
              <span className="text-black font-bold uppercase tracking-wider text-xs">Subtotal</span>
              <span className="font-bold text-black text-base">₹{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-2 border-b-2 border-black">
              <span className="text-black font-bold uppercase tracking-wider text-xs">Tax ({billConfig.taxRate}%)</span>
              <span className="font-bold text-black text-base">₹{taxAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-3 px-4 mt-2 border-4 border-black">
              <span className="text-lg font-black text-black uppercase tracking-widest">Total Due</span>
              <span className="text-xl font-black text-black">₹{totalDue.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="pt-4 text-center mt-auto">
          <h4 className="font-black text-black mb-1 uppercase tracking-widest text-sm">{billConfig.footerTitle}</h4>
          <p className="text-xs font-bold text-gray-500">{billConfig.footerSubtext}</p>
        </div>
      </div>
    );
  };

  const renderSummaryReportContent = () => {
    const totalResponses = interviewsList.reduce((acc, curr) => acc + curr.responses, 0);

    return (
      <div className="text-black font-sans w-full h-full flex flex-col bg-white">
        {/* Header */}
        <div className="flex justify-between items-start border-b-4 border-black pb-4 mb-6">
          <div>
            <div className="w-36 mb-2 invert">
              <Logo className="w-full" />
            </div>
            <p className="text-black font-bold text-sm">interviewxpert.in</p>
            <p className="text-gray-800 font-medium text-sm">hackathon746@gmail.com</p>
            <p className="text-gray-800 font-medium text-sm">+91 95455 56045</p>
          </div>
          <div className="text-right">
            <h1 className="text-4xl font-black text-black uppercase tracking-widest mb-4">INTERVIEW REPORT</h1>
            <div className="flex justify-end gap-8 text-xs">
              <div className="text-right">
                <p className="text-gray-500 uppercase tracking-widest font-bold mb-0.5">Report Period</p>
                <p className="text-black font-black text-sm">
                  {new Date(Number(selectedMonth.split('-')[0]), Number(selectedMonth.split('-')[1]) - 1).toLocaleString('default', { month: 'long' })} {selectedMonth.split('-')[0]}
                </p>
              </div>
              <div className="text-right">
                <p className="text-gray-500 uppercase tracking-widest font-bold mb-0.5">Date Generated</p>
                <p className="text-black font-black text-sm">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Summary Info */}
        <div className="flex justify-between mb-8 border-2 border-black p-4">
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Total Interviews Posted</p>
            <h3 className="text-xl font-black text-black uppercase leading-tight">{interviewsList.length}</h3>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Total Responses</p>
            <h3 className="text-xl font-black text-black uppercase leading-tight">{totalResponses}</h3>
          </div>
        </div>

        {/* Table */}
        <table className="w-full text-left border-collapse mb-6 flex-1">
          <thead>
            <tr className="border-b-2 border-black text-[10px] uppercase tracking-widest text-black">
              <th className="py-2 font-black w-12">#</th>
              <th className="py-2 font-black">Interview Title</th>
              <th className="py-2 font-black text-center w-32">Date Created</th>
              <th className="py-2 text-right font-black w-24">Responses</th>
            </tr>
          </thead>
          <tbody>
            {interviewsList.map((item, index) => (
              <tr key={item.id} className="border-b border-gray-300">
                <td className="py-3 text-sm text-gray-600 font-medium">{index + 1}</td>
                <td className="py-3 pr-4">
                  <p className="font-bold text-black text-base leading-tight">{item.title}</p>
                </td>
                <td className="py-3 text-center text-sm font-medium text-black">
                   {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                </td>
                <td className="py-3 text-right text-base font-black text-black">{item.responses}</td>
              </tr>
            ))}
            {interviewsList.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-gray-500 font-medium">No interviews found.</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="pt-4 text-center mt-auto border-t-2 border-black">
          <h4 className="font-black text-black mb-1 uppercase tracking-widest text-sm">DSource Platform Statistics</h4>
          <p className="text-xs font-bold text-gray-500">This is a system-generated report.</p>
        </div>
      </div>
    );
  };

  const renderResponsesReportContent = () => {
    return (
      <div className="text-black font-sans w-full h-full flex flex-col bg-white">
        {/* Header */}
        <div className="flex justify-between items-start border-b-4 border-black pb-4 mb-6">
          <div>
            <div className="w-36 mb-2 invert">
              <Logo className="w-full" />
            </div>
            <p className="text-black font-bold text-sm">interviewxpert.in</p>
            <p className="text-gray-800 font-medium text-sm">hackathon746@gmail.com</p>
            <p className="text-gray-800 font-medium text-sm">+91 95455 56045</p>
          </div>
          <div className="text-right">
            <h1 className="text-4xl font-black text-black uppercase tracking-widest mb-4">RESPONSES REPORT</h1>
            <div className="flex justify-end gap-8 text-xs">
              <div className="text-right">
                <p className="text-gray-500 uppercase tracking-widest font-bold mb-0.5">Report Period</p>
                <p className="text-black font-black text-sm">
                  {new Date(Number(selectedMonth.split('-')[0]), Number(selectedMonth.split('-')[1]) - 1).toLocaleString('default', { month: 'long' })} {selectedMonth.split('-')[0]}
                </p>
              </div>
              <div className="text-right">
                <p className="text-gray-500 uppercase tracking-widest font-bold mb-0.5">Date Generated</p>
                <p className="text-black font-black text-sm">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Summary Info */}
        <div className="flex justify-between mb-8 border-2 border-black p-4">
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Total Candidate Responses</p>
            <h3 className="text-xl font-black text-black uppercase leading-tight">{responsesList.length}</h3>
          </div>
        </div>

        {/* Table */}
        <table className="w-full text-left border-collapse mb-6 flex-1">
          <thead>
            <tr className="border-b-2 border-black text-[10px] uppercase tracking-widest text-black">
              <th className="py-2 font-black w-12">#</th>
              <th className="py-2 font-black">Candidate</th>
              <th className="py-2 font-black">Interview Title</th>
              <th className="py-2 font-black text-right w-32">Date Submitted</th>
            </tr>
          </thead>
          <tbody>
            {responsesList.map((item, index) => (
              <tr key={item.id} className="border-b border-gray-300">
                <td className="py-3 text-sm text-gray-600 font-medium">{index + 1}</td>
                <td className="py-3 pr-4">
                  <p className="font-bold text-black text-base leading-tight">{item.candidateName}</p>
                  <p className="text-xs text-gray-500">{item.candidateEmail}</p>
                </td>
                <td className="py-3 pr-4">
                  <p className="text-sm font-medium text-gray-800">{item.interviewTitle}</p>
                </td>
                <td className="py-3 text-right text-sm font-medium text-black">
                   {item.submittedAt?.toDate ? item.submittedAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                </td>
              </tr>
            ))}
            {responsesList.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-gray-500 font-medium">No responses found.</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="pt-4 text-center mt-auto border-t-2 border-black">
          <h4 className="font-black text-black mb-1 uppercase tracking-widest text-sm">DSource Platform Statistics</h4>
          <p className="text-xs font-bold text-gray-500">This is a system-generated report.</p>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className={`min-h-screen ${isDark ? 'bg-[#050505] text-white' : 'bg-gray-50 text-gray-900'} font-sans print:hidden`}>
        {/* Header */}
        <div className={`sticky top-0 z-30 flex items-center justify-between px-6 py-4 ${isDark ? 'bg-[#050505]/80 border-white/5' : 'bg-white/80 border-gray-200'} backdrop-blur-xl border-b`}>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/admin')} className={`p-2 rounded-full ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} transition-colors`}>
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <LayoutDashboard className="text-blue-500" size={20} />
              Platform Statistics
            </h1>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 gap-4">
            <div>
              <h2 className="text-2xl font-bold">Overall Platform Counts</h2>
              <p className="text-gray-500 text-sm mt-1">Real-time statistics of total interviews and candidate responses.</p>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-bold text-gray-500">Filter Month:</label>
                <input 
                  type="month" 
                  value={selectedMonth} 
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className={`p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-shadow ${isDark ? 'bg-[#111] border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                />
              </div>
              <button 
              onClick={() => {
                setBillConfig(prev => ({
                  ...prev,
                  items: prev.items.map((item, index) => 
                    index === 0 ? { ...item, quantity: responsesStats.thisMonth } : item
                  )
                }));
                setShowBillModal(true);
              }}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:-translate-y-0.5 active:scale-95 transition-all"
            >
              <Printer size={18} /> Generate Invoice
            </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              
              {/* Interviews Breakdown */}
              <div 
                onClick={() => setShowInterviewsModal(true)}
                className={`cursor-pointer p-8 rounded-2xl border ${isDark ? 'bg-[#111] border-white/10 hover:border-orange-500/50' : 'bg-white border-gray-200 hover:border-orange-500/50'} shadow-xl flex flex-col items-center justify-center transition-all hover:scale-[1.02]`}
              >
                <div className="p-4 bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-full mb-3 shadow-inner">
                  <Video size={40} />
                </div>
                <h3 className="text-sm font-bold opacity-80 mb-2 uppercase tracking-wider text-center text-gray-700 dark:text-gray-300">Total Interviews</h3>
                <p className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-orange-500 to-red-600 mb-6">
                  {interviewsStats.total}
                </p>
                <div className="w-full flex justify-between px-6 pt-4 border-t border-gray-100 dark:border-white/5">
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1 justify-center"><Calendar size={12}/> Selected Month</p>
                    <p className="text-2xl font-bold text-gray-800 dark:text-white">{interviewsStats.thisMonth}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1 justify-center"><Clock size={12}/> Today</p>
                    <p className="text-2xl font-bold text-gray-800 dark:text-white">{interviewsStats.today}</p>
                  </div>
                </div>
              </div>
              
              {/* Responses */}
              <div 
                onClick={() => setShowResponsesModal(true)}
                className={`cursor-pointer p-8 rounded-2xl border ${isDark ? 'bg-[#111] border-white/10 hover:border-emerald-500/50' : 'bg-white border-gray-200 hover:border-emerald-500/50'} shadow-xl flex flex-col items-center justify-center transition-all hover:scale-[1.02]`}
              >
                <div className="p-4 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-full mb-3 shadow-inner">
                  <Users size={40} />
                </div>
                <h3 className="text-sm font-bold opacity-80 mb-2 uppercase tracking-wider text-center text-gray-700 dark:text-gray-300">Candidate Responses</h3>
                <p className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-emerald-500 to-teal-600 mb-6">
                  {responsesStats.total}
                </p>
                <div className="w-full flex justify-between px-6 pt-4 border-t border-gray-100 dark:border-white/5">
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1 justify-center"><Calendar size={12}/> Selected Month</p>
                    <p className="text-2xl font-bold text-gray-800 dark:text-white">{responsesStats.thisMonth}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1 justify-center"><Clock size={12}/> Today</p>
                    <p className="text-2xl font-bold text-gray-800 dark:text-white">{responsesStats.today}</p>
                  </div>
                </div>
              </div>
              
            </div>
          )}
        </div>
      </div>

      {/* Configuration & Preview Modal */}
      {showBillModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 sm:p-6 print:hidden backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-2xl max-w-6xl w-full h-full max-h-[90vh] flex flex-col md:flex-row shadow-2xl overflow-hidden animate-fade-in-up">
            
            {/* Left: Configuration Panel */}
            <div className="w-full md:w-5/12 bg-gray-50 border-r border-gray-200 p-6 flex flex-col h-full">
              <div className="flex justify-between items-center mb-4 shrink-0">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Settings size={20} className="text-blue-600" />
                  Configure Invoice
                </h3>
                <button onClick={() => setShowBillModal(false)} className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-red-50">
                  <X size={24} />
                </button>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-gray-200 mb-4 shrink-0 overflow-x-auto custom-scrollbar gap-1">
                <button 
                  onClick={() => setActiveConfigTab('invoice')}
                  className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${activeConfigTab === 'invoice' ? 'bg-white border-t-2 border-x border-blue-600 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  <Hash size={14} /> Meta
                </button>
                <button 
                  onClick={() => setActiveConfigTab('company')}
                  className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${activeConfigTab === 'company' ? 'bg-white border-t-2 border-x border-blue-600 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  <Building size={14} /> Company & Logo
                </button>
                <button 
                  onClick={() => setActiveConfigTab('client')}
                  className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${activeConfigTab === 'client' ? 'bg-white border-t-2 border-x border-blue-600 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  <Users size={14} /> Billed To
                </button>
                <button 
                  onClick={() => setActiveConfigTab('items')}
                  className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${activeConfigTab === 'items' ? 'bg-white border-t-2 border-x border-blue-600 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  <FileText size={14} /> Items
                </button>
                <button 
                  onClick={() => setActiveConfigTab('footer')}
                  className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${activeConfigTab === 'footer' ? 'bg-white border-t-2 border-x border-blue-600 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  <Tag size={14} /> Footer
                </button>
              </div>
              
              <div className="space-y-4 flex-1 overflow-y-auto pr-1 custom-scrollbar">

                {/* Tab 1: Invoice Meta (Invoice Number, Date, Billing Period) */}
                {activeConfigTab === 'invoice' && (
                  <div className="space-y-4 animate-fade-in">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-bold text-gray-700 flex items-center gap-1">
                          <Hash size={14} className="text-gray-500" /> Invoice Number
                        </label>
                        <button 
                          onClick={() => setBillConfig({...billConfig, invoiceNumber: generateDefaultInvoiceId()})}
                          className="text-[11px] font-bold text-blue-600 hover:underline"
                        >
                          Auto Generate
                        </button>
                      </div>
                      <input 
                        type="text" 
                        value={billConfig.invoiceNumber} 
                        onChange={e => setBillConfig({...billConfig, invoiceNumber: e.target.value})} 
                        placeholder="e.g. INV-20260731-123" 
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow font-mono" 
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                        <Calendar size={14} className="text-gray-500" /> Invoice Date
                      </label>
                      <input 
                        type="date" 
                        value={billConfig.invoiceDate} 
                        onChange={e => setBillConfig({...billConfig, invoiceDate: e.target.value})} 
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" 
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                        <Calendar size={14} className="text-gray-500" /> Custom Billing Period
                      </label>
                      <input 
                        type="text" 
                        value={billConfig.billingPeriod} 
                        onChange={e => setBillConfig({...billConfig, billingPeriod: e.target.value})} 
                        placeholder="Leave blank for automatic (e.g. July 2026)" 
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" 
                      />
                    </div>
                  </div>
                )}

                {/* Tab 2: Company & Logo Details */}
                {activeConfigTab === 'company' && (
                  <div className="space-y-4 animate-fade-in">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                        <ImageIcon size={14} className="text-gray-500" /> Logo Image URL / Path
                      </label>
                      <input 
                        type="text" 
                        value={billConfig.logoUrl} 
                        onChange={e => setBillConfig({...billConfig, logoUrl: e.target.value})} 
                        placeholder="public/logosnab.png" 
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow font-mono mb-2" 
                      />
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        <span className="text-[11px] text-gray-500 font-bold self-center">Presets:</span>
                        <button 
                          onClick={() => setBillConfig({...billConfig, logoUrl: '/logosnab.png'})}
                          className="px-2 py-0.5 bg-gray-200 text-gray-800 rounded text-[11px] font-bold hover:bg-gray-300 transition-colors"
                        >
                          /logosnab.png
                        </button>
                        <button 
                          onClick={() => setBillConfig({...billConfig, logoUrl: '/logo.png'})}
                          className="px-2 py-0.5 bg-gray-200 text-gray-800 rounded text-[11px] font-bold hover:bg-gray-300 transition-colors"
                        >
                          /logo.png
                        </button>
                        <button 
                          onClick={() => setBillConfig({...billConfig, logoUrl: '/logo-black.png'})}
                          className="px-2 py-0.5 bg-gray-200 text-gray-800 rounded text-[11px] font-bold hover:bg-gray-300 transition-colors"
                        >
                          /logo-black.png
                        </button>
                      </div>
                      {billConfig.logoUrl && (
                        <div className="p-2 bg-gray-100 rounded-lg flex items-center gap-2 border border-gray-200">
                          <span className="text-[10px] font-bold text-gray-500">Preview:</span>
                          <img src={billConfig.logoUrl} alt="Logo preview" className="h-6 object-contain" onError={(e) => (e.target as HTMLElement).style.display = 'none'} />
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                        <Building size={14} className="text-gray-500" /> Sender Company Name
                      </label>
                      <input 
                        type="text" 
                        value={billConfig.companyName} 
                        onChange={e => setBillConfig({...billConfig, companyName: e.target.value})} 
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" 
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                        <Mail size={14} className="text-gray-500" /> Sender Email
                      </label>
                      <input 
                        type="email" 
                        value={billConfig.companyEmail} 
                        onChange={e => setBillConfig({...billConfig, companyEmail: e.target.value})} 
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" 
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                        <Phone size={14} className="text-gray-500" /> Sender Phone
                      </label>
                      <input 
                        type="text" 
                        value={billConfig.companyPhone} 
                        onChange={e => setBillConfig({...billConfig, companyPhone: e.target.value})} 
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" 
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                        <Globe size={14} className="text-gray-500" /> Address / Subtitle
                      </label>
                      <input 
                        type="text" 
                        value={billConfig.companyAddress} 
                        onChange={e => setBillConfig({...billConfig, companyAddress: e.target.value})} 
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" 
                      />
                    </div>
                  </div>
                )}

                {/* Tab 3: Billed To / Recipient Details */}
                {activeConfigTab === 'client' && (
                  <div className="space-y-4 animate-fade-in">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Client Contact Name</label>
                      <input 
                        type="text" 
                        value={billConfig.clientName} 
                        onChange={e => setBillConfig({...billConfig, clientName: e.target.value})} 
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" 
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Client Company Name</label>
                      <input 
                        type="text" 
                        value={billConfig.clientCompany} 
                        onChange={e => setBillConfig({...billConfig, clientCompany: e.target.value})} 
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" 
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Client Email Address</label>
                      <input 
                        type="email" 
                        value={billConfig.clientEmail} 
                        onChange={e => setBillConfig({...billConfig, clientEmail: e.target.value})} 
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" 
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Client Address / Location</label>
                      <input 
                        type="text" 
                        value={billConfig.clientAddress} 
                        onChange={e => setBillConfig({...billConfig, clientAddress: e.target.value})} 
                        placeholder="e.g. 123 Tech Park, Suite 400, Mumbai, India" 
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" 
                      />
                    </div>
                  </div>
                )}

                {/* Tab 4: Items & Financials */}
                {activeConfigTab === 'items' && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex justify-between items-center">
                      <label className="block text-xs font-bold text-gray-700">Line Items</label>
                      <button onClick={addBillItem} className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 font-bold px-3 py-1.5 rounded-lg hover:bg-blue-200 transition-colors">
                        <Plus size={14} /> Add Item
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      {billConfig.items.map((item) => (
                        <div key={item.id} className="p-3 bg-white border border-gray-200 rounded-xl shadow-sm relative group">
                          {billConfig.items.length > 1 && (
                            <button onClick={() => removeBillItem(item.id)} className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1 hover:bg-red-200 shadow-sm transition-opacity">
                              <X size={14} />
                            </button>
                          )}
                          <input 
                            type="text" 
                            placeholder="Description" 
                            value={item.description} 
                            onChange={e => updateBillItem(item.id, 'description', e.target.value)} 
                            className="w-full mb-2 p-2 border border-gray-200 rounded-lg text-xs text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" 
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-[10px] font-bold text-gray-500 mb-0.5 block">Qty</span>
                              <input 
                                type="number" 
                                value={item.quantity} 
                                onChange={e => updateBillItem(item.id, 'quantity', Number(e.target.value))} 
                                className="w-full p-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" 
                              />
                            </div>
                            <div>
                              <span className="text-[10px] font-bold text-gray-500 mb-0.5 block">Unit Price (₹)</span>
                              <input 
                                type="number" 
                                value={item.unitPrice} 
                                onChange={e => updateBillItem(item.id, 'unitPrice', Number(e.target.value))} 
                                className="w-full p-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" 
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-3 border-t border-gray-200">
                      <label className="block text-xs font-bold text-gray-700 mb-1">Tax Rate (%)</label>
                      <input type="number" value={billConfig.taxRate} onChange={e => setBillConfig({...billConfig, taxRate: Number(e.target.value)})} className="w-full p-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                )}

                {/* Tab 5: Footer & Signatures */}
                {activeConfigTab === 'footer' && (
                  <div className="space-y-4 animate-fade-in">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Footer Message Title</label>
                      <input 
                        type="text" 
                        value={billConfig.footerTitle} 
                        onChange={e => setBillConfig({...billConfig, footerTitle: e.target.value})} 
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" 
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Footer Disclaimer / Note</label>
                      <textarea 
                        rows={3}
                        value={billConfig.footerSubtext} 
                        onChange={e => setBillConfig({...billConfig, footerSubtext: e.target.value})} 
                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow resize-none" 
                      />
                    </div>
                  </div>
                )}

              </div>

              <div className="mt-4 shrink-0 flex gap-3 pt-4 border-t border-gray-200">
                <button onClick={() => setShowBillModal(false)} className="flex-1 px-4 py-3 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-100 transition-colors shadow-sm">
                  Cancel
                </button>
                <button onClick={handlePrintInvoice} className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2">
                  <Printer size={18} /> Print Now
                </button>
              </div>
            </div>

            {/* Right: Live Preview Panel */}
            <div className="w-full md:w-2/3 bg-gray-200 p-4 sm:p-8 flex justify-center items-start overflow-y-auto h-full hidden md:flex custom-scrollbar">
              <div className="bg-white w-full max-w-3xl min-h-[1000px] shadow-2xl p-10 transform origin-top border border-gray-300">
                 {renderInvoiceContent()}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Print-Only Actual Layout (Used exclusively during window.print()) */}
      <div className="hidden print:block bg-white text-black p-10 font-sans min-h-screen max-w-4xl mx-auto">
        {printMode === 'invoice' ? renderInvoiceContent() : printMode === 'summary' ? renderSummaryReportContent() : renderResponsesReportContent()}
      </div>

      {/* Interviews List Modal */}
      {showInterviewsModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 sm:p-6 print:hidden backdrop-blur-sm transition-opacity animate-fade-in">
          <div className={`rounded-2xl max-w-4xl w-full max-h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in-up ${isDark ? 'bg-[#111] border border-white/10' : 'bg-white'}`}>
             <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-white/10 shrink-0">
                <h3 className="text-xl font-bold dark:text-white flex items-center gap-2">
                  <Video size={20} className="text-orange-500" />
                  All Posted Interviews
                </h3>
                <div className="flex items-center gap-3">
                  <button onClick={handlePrintSummary} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-blue-700 transition-colors">
                    <Printer size={16} /> Download Report
                  </button>
                  <button onClick={() => setShowInterviewsModal(false)} className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20">
                     <X size={24} />
                  </button>
                </div>
             </div>
             <div className="p-6 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                     <tr className="border-b border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 text-sm uppercase tracking-wider">
                        <th className="pb-3 font-bold">Interview Title</th>
                        <th className="pb-3 font-bold">Date Created</th>
                        <th className="pb-3 font-bold text-center">Responses</th>
                     </tr>
                  </thead>
                  <tbody>
                    {interviewsList.map(interview => (
                      <tr key={interview.id} className="border-b border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                         <td className="py-4 dark:text-white font-bold">{interview.title}</td>
                         <td className="py-4 text-gray-500 dark:text-gray-400 text-sm font-medium">
                            {interview.createdAt?.toDate ? interview.createdAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                         </td>
                         <td className="py-4 text-center">
                            <span className="inline-flex items-center justify-center min-w-[2.5rem] px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full font-black text-sm shadow-sm border border-emerald-200 dark:border-emerald-800">
                              {interview.responses}
                            </span>
                         </td>
                      </tr>
                    ))}
                    {interviewsList.length === 0 && (
                      <tr>
                         <td colSpan={3} className="py-12 text-center text-gray-500 dark:text-gray-400 font-medium">
                           No interviews posted yet.
                         </td>
                      </tr>
                    )}
                  </tbody>
                </table>
             </div>
          </div>
        </div>
      )}

      {/* Responses List Modal */}
      {showResponsesModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 sm:p-6 print:hidden backdrop-blur-sm transition-opacity animate-fade-in">
          <div className={`rounded-2xl max-w-5xl w-full max-h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in-up ${isDark ? 'bg-[#111] border border-white/10' : 'bg-white'}`}>
             <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-white/10 shrink-0">
                <h3 className="text-xl font-bold dark:text-white flex items-center gap-2">
                  <Users size={20} className="text-emerald-500" />
                  Candidate Responses
                </h3>
                <div className="flex items-center gap-3">
                  <button onClick={handlePrintResponses} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-blue-700 transition-colors">
                    <Printer size={16} /> Download Report
                  </button>
                  <button onClick={() => setShowResponsesModal(false)} className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20">
                     <X size={24} />
                  </button>
                </div>
             </div>
             <div className="p-6 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                     <tr className="border-b border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 text-sm uppercase tracking-wider">
                        <th className="pb-3 font-bold">Candidate</th>
                        <th className="pb-3 font-bold">Interview Title</th>
                        <th className="pb-3 font-bold text-right">Date Submitted</th>
                     </tr>
                  </thead>
                  <tbody>
                    {responsesList.map(item => (
                      <tr key={item.id} className="border-b border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                         <td className="py-4">
                            <p className="dark:text-white font-bold">{item.candidateName}</p>
                            <p className="text-xs text-gray-500">{item.candidateEmail}</p>
                         </td>
                         <td className="py-4 text-gray-700 dark:text-gray-300 font-medium">
                            {item.interviewTitle}
                         </td>
                         <td className="py-4 text-right text-gray-500 dark:text-gray-400 text-sm font-medium">
                            {item.submittedAt?.toDate ? item.submittedAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                         </td>
                      </tr>
                    ))}
                    {responsesList.length === 0 && (
                      <tr>
                         <td colSpan={3} className="py-12 text-center text-gray-500 dark:text-gray-400 font-medium">
                           No responses found in this period.
                         </td>
                      </tr>
                    )}
                  </tbody>
                </table>
             </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminStats;
