import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Code, Bot, ArrowRight, Zap, Target, BookOpen, Briefcase, Map, X, Send, User, ChevronRight, Download, MapPin, DollarSign, Clock } from 'lucide-react';
import Navbar from '../components/landing/Navbar';

import { useAnimatedText } from '../hooks/useAnimatedText';
import mermaid from 'mermaid';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { grokChat } from '../services/grokService';

// --- Types & Data Arrays ---

interface JobDetail {
  title: string;
  growth: string;
  salary: string;
  icon: React.ReactNode;
  bg: string;
}

interface Job {
  id: string;
  title: string;
  companyName: string;
  description: string;
  qualifications: string;
  skills: string;
  category: string;
  applyDeadline: Timestamp;
  location?: string;
  employmentType?: string;
  salaryRange?: string;
  customFields?: {key: string, value: string}[];
}

interface RoadmapDetail {
  title: string;
  description: string;
  color: string;
  shadow: string;
  glow: string;
  overview: string;
  milestones: { title: string; desc: string }[];
  tools: string[];
}

const roadmaps: RoadmapDetail[] = [
  { 
    title: "Frontend Mastery", 
    description: "HTML/CSS → React → Next.js → System Design", 
    color: "from-cyan-400 via-blue-500 to-indigo-600",
    shadow: "shadow-[0_0_30px_rgba(59,130,246,0.3)]",
    glow: "bg-blue-500/20",
    overview: "The journey to becoming a senior frontend engineer involves moving from basic markup to managing complex, stateful applications at scale with modern frameworks.",
    milestones: [
        { title: "The Fundamentals", desc: "Master HTML5 Semantic features and CSS Layouts (Grid/Flexbox)." },
        { title: "Scripting Core", desc: "Deep dive into Vanilla JavaScript (ES6+, Closures, Async/Await)." },
        { title: "Component Driven", desc: "Learn React, lifecycle Hooks, and global state management paradigms." },
        { title: "Meta Frameworks", desc: "Master Next.js for Server-Side Rendering (SSR) and Static Generation (SSG)." },
        { title: "Architecture", desc: "Understand Web Performance, deep Accessibility (a11y), and System Design." }
    ],
    tools: ["React", "Next.js", "Tailwind CSS", "TypeScript", "Vite", "Framer Motion", "Zustand"]
  },
  { 
    title: "Backend Architecture", 
    description: "SQL/NoSQL → Node/Python → Microservices → AWS", 
    color: "from-emerald-400 via-green-500 to-teal-600",
    shadow: "shadow-[0_0_30px_rgba(16,185,129,0.3)]",
    glow: "bg-emerald-500/20",
    overview: "Backend architecture demands a strong understanding of data consistency, server management, distributed networks, and designing fault-tolerant systems.",
    milestones: [
        { title: "Data Storage", desc: "Understand Relational vs Non-Relational Databases and their distinct trade-offs." },
        { title: "API Development", desc: "Build highly scalable CRUD APIs with Node.js/Express or Python/FastAPI." },
        { title: "Optimization", desc: "Learn Caching mechanisms (Redis) & asynchronous Message Brokers (Kafka)." },
        { title: "Containerization", desc: "Wrap applications in Docker containers and orchestrate them with Kubernetes." },
        { title: "Distributed Web", desc: "Implement full Microservices Architecture and leverage AWS Cloud Deployments." }
    ],
    tools: ["Node.js", "PostgreSQL", "Docker", "Redis", "Kafka", "AWS", "Nginx"]
  },
  { 
    title: "AI & Data Science", 
    description: "Stats/Math → Python → PyTorch/TensorFlow → LLMs", 
    color: "from-fuchsia-400 via-purple-500 to-violet-600",
    shadow: "shadow-[0_0_30px_rgba(168,85,247,0.3)]",
    glow: "bg-purple-500/20",
    overview: "This track transforms you from a foundational mathematical thinker to a cutting-edge deep learning engineer working intimately with modern Large Language Models.",
    milestones: [
        { title: "Mathematical Core", desc: "Master Linear Algebra, advanced Calculus, and core Probability theories." },
        { title: "Data Processing", desc: "Learn robust Python data analysis utilizing libraries like Pandas and NumPy." },
        { title: "Neural Engines", desc: "Architect and build deep neural networks from scratch using PyTorch." },
        { title: "Attention Is All You Need", desc: "Understand Transformer architectures, attention mechanisms, and NLP fundamentals." },
        { title: "Frontier Intelligence", desc: "Implement RAG, perform model fine-tuning (LoRA), and master MLOps." }
    ],
    tools: ["Python", "PyTorch", "HuggingFace", "LangChain", "Jupyter", "Weights & Biases", "CUDA"]
  }
];

// --- AI Chatbot Component ---

const MermaidChart: React.FC<{ chart: string }> = ({ chart }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [svgContent, setSvgContent] = useState('');

    useEffect(() => {
        // High-end Professional Corporate Mermaid styling
        let themeVars = {
            primaryColor: '#f8fafc',
            primaryTextColor: '#1e293b',
            primaryBorderColor: '#cbd5e1',
            lineColor: '#64748b',
            secondaryColor: '#f1f5f9',
            tertiaryColor: '#ffffff',
            fontFamily: 'Inter, system-ui, sans-serif'
        };

        if (document.documentElement.classList.contains('dark')) {
             themeVars = {
                primaryColor: '#1e1e2d',         
                primaryTextColor: '#f8fafc',     
                primaryBorderColor: '#475569',   
                lineColor: '#818cf8',            
                secondaryColor: '#0f172a',       
                tertiaryColor: '#020617',        
                fontFamily: 'Inter, system-ui, sans-serif'
            };
        }

        mermaid.initialize({ 
            startOnLoad: false, 
            theme: 'base',
            themeVariables: themeVars
        });

        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        mermaid.render(id, chart).then(({ svg }) => {
            // Remove hardcoded max-width from SVG to allow flexible zooming/scrolling
            const responsiveSvg = svg.replace(/max-width:\s*\d+(\.\d+)?px;/g, '');
            setSvgContent(responsiveSvg);
        }).catch(err => {
            console.error("Mermaid parsing error", err);
            setSvgContent(`<div class="text-rose-400 text-xs p-4 bg-rose-500/10 rounded-lg border border-rose-500/20">Error parsing advanced diagram structure. Please try again.</div>`);
        });
    }, [chart]);

    const handleDownload = () => {
        if (!ref.current) return;
        const svgEl = ref.current.querySelector('svg');
        if (svgEl) {
            const svgData = new XMLSerializer().serializeToString(svgEl);
            const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `InterviewXpert-Architecture-${Date.now()}.svg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    };

    if (!svgContent) return (
        <div className="w-full h-24 flex items-center justify-center my-4">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
    );

    return (
        <motion.div 
           initial={{ opacity: 0, scale: 0.95 }}
           animate={{ opacity: 1, scale: 1 }}
           className="relative group w-full my-6 flex flex-col"
        >
            <div className="absolute top-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <button 
                    onClick={handleDownload}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all text-xs font-semibold"
                >
                    <Download size={14} /> <span className="hidden sm:inline">Download</span>
                </button>
            </div>
            <div 
               ref={ref}
               className="mermaid-chart flex justify-center w-full overflow-x-auto p-4 sm:p-8 bg-white dark:bg-[#111116] rounded-2xl md:rounded-3xl text-xs shadow-xl border border-slate-200 dark:border-white/10 custom-scrollbar cursor-grab active:cursor-grabbing transition-colors duration-300 min-h-[150px]" 
               dangerouslySetInnerHTML={{ __html: svgContent }} 
            />
        </motion.div>
    );
};

// Advanced text parser that separates normal text and mermaid blocks seamlessly
const MessageContent: React.FC<{ text: string, isLatest: boolean }> = React.memo(({ text, isLatest }) => {
    const parts = [];
    let tempText = text;
    let key = 0;
    
    while(tempText.includes('```mermaid')) {
        const startIndex = tempText.indexOf('```mermaid');
        const endIndex = tempText.indexOf('```', startIndex + 10);
        
        if (endIndex !== -1) {
            if (startIndex > 0) {
               parts.push({ type: 'text', content: tempText.substring(0, startIndex), key: key++ });
            }
            parts.push({ type: 'mermaid', content: tempText.substring(startIndex + 10, endIndex).trim(), key: key++ });
            tempText = tempText.substring(endIndex + 3);
        } else {
            break;
        }
    }
    
    if (tempText.length > 0) {
        parts.push({ type: 'text', content: tempText, key: key++ });
    }

    return (
        <div className="flex flex-col gap-2 w-full whitespace-pre-wrap font-sans">
            {parts.map((p, idx) => {
                if (p.type === 'text') {
                    const shouldAnimate = isLatest && (idx === parts.length - 1);
                    return p.content.trim() ? <AnimatedMessage key={p.key} text={p.content.trim()} isLatest={shouldAnimate} /> : null;
                } else {
                    return <MermaidChart key={p.key} chart={p.content} />;
                }
            })}
        </div>
    );
});

// Simple streaming line renderer wrapper
const AnimatedMessage: React.FC<{ text: string; isLatest: boolean }> = React.memo(({ text, isLatest }) => {
  const animatedText = useAnimatedText(text, " ");
  const displayText = isLatest ? animatedText : text;

  return (
      <>
          {displayText.split('\n').map((line, i) => (
              <p key={i} className="mb-2 last:mb-0 min-h-[1em]">{line}</p>
          ))}
      </>
  );
});

// Main Chat Hook Logic
interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
}

const EmbeddedCareerBot: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([
        { id: '1', role: 'model', text: "Welcome to your intelligent Career Terminal! I specialize in architecting roadmaps, generating custom diagrams, and evaluating logic flows. \n\n**Ask me for a diagram**, and I will physically map it out for you." }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg: Message = { id: Date.now().toString(), role: 'user', text: input.trim() };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput('');
        setLoading(true);

        try {
            const systemInstruction = `You are an expert, highly advanced Career Coach and Architect specialized in the Indian tech sector.
            CONTEXT: ALWAYS evaluate salaries in Indian Rupees (INR ₹) using LPA (Lakhs Per Annum) format. Reference Indian tech hubs (Bengaluru, Pune, Hyderabad, Gurgaon, Noida, Chennai, etc.) when discussing job markets limit generic western context.
            CRITICAL GEOMETRY INSTRUCTION: Whenever a user asks for a roadmap, timeline, architecture, map, flowchart, pathway, or implies they need a graphical sequence, you MUST embed a fully robust Mermaid.js graph. 
            Use the exact markdown block delimiter \`\`\`mermaid. 
            Keep text formatting slick and actionable. Never use asterisks for lists, format using numerical points organically. Evaluate the job market accurately and provide high-end, premium responses. Double check your mermaid formatting strings, never break graph logic. Prefer 'graph TD' or 'graph LR' syntax deeply.`;

            // Build OpenAI-compatible history (Grok uses role: 'user'|'assistant')
            const history = newMessages.map(m => ({
                role: m.role === 'model' ? 'assistant' as const : 'user' as const,
                content: m.text
            }));

            const text = await grokChat(systemInstruction, history, 0.7) || 'System anomaly: could not process request.';
            setMessages([...newMessages, { id: (Date.now() + 1).toString(), role: 'model', text }]);
        } catch (error) {
            console.error("AI Generation Error", error);
            setMessages([...newMessages, { id: (Date.now() + 1).toString(), role: 'model', text: "Connection error with core servers. Please try again." }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[550px] md:h-[700px] w-full bg-slate-900/50 dark:bg-black/60 border border-slate-200 dark:border-white/10 rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] backdrop-blur-2xl overflow-hidden relative z-20">
            {/* Extremely Premium Glowing Header */}
            <div className="bg-gradient-to-r from-slate-100/10 to-transparent dark:from-white/5 border-b border-slate-200 dark:border-white/10 p-5 flex items-center justify-between shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl"></div>
                <div className="flex items-center gap-4 relative z-10">
                    <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30 ring-1 ring-white/10">
                        <Bot size={24} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight tracking-wide">Nexus Architect</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                            </span>
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-emerald-400">Diagramming Core Active</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scrollbar-thin scrollbar-thumb-indigo-500/20 scrollbar-track-transparent">
                {messages.map((msg, idx) => {
                    const isLatestAI = msg.role === 'model' && idx === messages.length - 1;
                    return (
                        <motion.div 
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            key={msg.id} 
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div className={`max-w-[95%] sm:max-w-[85%] px-5 py-4 rounded-2xl text-[15px] leading-relaxed shadow-lg backdrop-blur-md overflow-hidden ${
                                msg.role === 'user' 
                                ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-tr-sm border border-white/10' 
                                : 'bg-white/80 dark:bg-[#0f1115]/90 text-slate-800 dark:text-gray-200 rounded-tl-sm border border-slate-200 dark:border-white/10 relative'
                            }`}>
                                {/* Subtle inner glow for AI messages */}
                                {msg.role === 'model' && <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>}
                                
                                {msg.role === 'model' ? (
                                    <MessageContent text={msg.text} isLatest={isLatestAI && !loading} />
                                ) : (
                                    msg.text
                                )}
                            </div>
                        </motion.div>
                    );
                })}
                {loading && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                        <div className="bg-white/80 dark:bg-[#0f1115]/90 px-5 py-4 rounded-2xl rounded-tl-sm border border-slate-200 dark:border-white/10 flex items-center justify-center h-14 shadow-lg backdrop-blur-md">
                            <span className="flex gap-2 items-center">
                                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-bounce shadow-[0_0_10px_rgba(99,102,241,0.6)]"></span>
                                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-bounce shadow-[0_0_10px_rgba(168,85,247,0.6)] [animation-delay:0.2s]"></span>
                                <span className="w-2.5 h-2.5 rounded-full bg-pink-500 animate-bounce shadow-[0_0_10px_rgba(236,72,153,0.6)] [animation-delay:0.4s]"></span>
                            </span>
                        </div>
                    </motion.div>
                )}
                <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-5 bg-white/50 dark:bg-black/40 backdrop-blur-xl border-t border-slate-200 dark:border-white/10">
                <div className="relative flex items-center group">
                    <input 
                        type="text" 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Initialize roadmap generation..."
                        className="w-full bg-white dark:bg-[#ffffff08] border border-slate-200 dark:border-white/10 group-hover:border-indigo-500/50 rounded-full py-4 pl-6 pr-14 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-inner transition-all duration-300"
                    />
                    <button 
                        onClick={handleSend}
                        disabled={!input.trim() || loading}
                        className="absolute right-2 p-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-full hover:shadow-[0_0_20px_rgba(99,102,241,0.5)] transition-all duration-300 disabled:opacity-50 disabled:grayscale transform hover:scale-105 active:scale-95"
                    >
                        <Send size={18} className="translate-x-0.5" />
                    </button>
                    {/* Input Glow */}
                    <div className="absolute inset-0 bg-indigo-500/5 rounded-full blur opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                </div>
            </div>
        </div>
    );
};

// --- Main Page Component ---
const CareerHub: React.FC<{ isDarkTheme: boolean }> = ({ isDarkTheme }) => {
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedRoadmap, setSelectedRoadmap] = useState<RoadmapDetail | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "Career Hub & Roadmaps | InterviewXpert";

    const fetchJobs = async () => {
        setLoadingJobs(true);
        try {
            const now = Timestamp.now();
            const q = query(
                collection(db, 'jobs'), 
                where('applyDeadline', '>', now),
                orderBy('applyDeadline', 'asc')
            );
            const snapshot = await getDocs(q);
            const fetchedJobs = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as Job))
                .filter(job => job.isMock !== true);
            setJobs(fetchedJobs);
        } catch (error) {
            console.error("Error fetching jobs:", error);
        } finally {
            setLoadingJobs(false);
        }
    };

    fetchJobs();
  }, []);

  const getJobCardStyle = (jobTitle: string): JobDetail => {
    const hash = jobTitle.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
    const styles: JobDetail[] = [
      { title: '', growth: '', salary: '', icon: <Zap className="w-6 h-6 text-yellow-400" />, bg: "from-yellow-400/20 to-orange-500/10" },
      { title: '', growth: '', salary: '', icon: <Code className="w-6 h-6 text-blue-400" />, bg: "from-blue-400/20 to-indigo-500/10" },
      { title: '', growth: '', salary: '', icon: <Target className="w-6 h-6 text-green-400" />, bg: "from-green-400/20 to-emerald-500/10" },
      { title: '', growth: '', salary: '', icon: <Briefcase className="w-6 h-6 text-purple-400" />, bg: "from-purple-400/20 to-pink-500/10" },
    ];
    return styles[Math.abs(hash) % styles.length];
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-[#050508] text-slate-900 dark:text-white font-sans relative flex flex-col transition-colors duration-500 selection:bg-indigo-500/30">
      <Navbar />
      
      {/* Insane Background Effects */}
      <div className="absolute top-0 left-0 w-full h-[800px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/40 via-purple-900/10 to-[#050508] pointer-events-none transition-colors duration-500"></div>
      
      {/* Grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none"></div>

      <div className="absolute top-[20%] -left-64 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-[150px] mix-blend-screen pointer-events-none transition-colors duration-500"></div>
      <div className="absolute top-[40%] -right-64 w-[500px] h-[500px] bg-purple-500/20 rounded-full blur-[150px] mix-blend-screen pointer-events-none transition-colors duration-500"></div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-32 pb-24">
        
        {/* Dynamic Hero Section */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center mb-32 relative"
        >
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 backdrop-blur-md shadow-[0_0_30px_rgba(99,102,241,0.15)] mb-8">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
            </span>
            <span className="text-indigo-700 dark:text-indigo-300 font-bold text-xs tracking-widest uppercase">Ecosystem 2.0 Live</span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black mb-6 md:mb-8 tracking-tighter text-slate-900 dark:text-white transition-colors duration-300">
            Architect Your <br className="hidden md:block" />
            <span className="relative">
                <span className="relative z-10 bg-clip-text text-transparent bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500">Tech Destiny</span>
                <span className="absolute bottom-0 left-0 w-full h-[30%] bg-indigo-500/20 blur-xl z-0"></span>
            </span>
          </h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto text-lg md:text-xl transition-colors duration-300 leading-relaxed font-medium">
            Visualize intricate progression maps, decode trending salaries, and query our neural engine to build bespoke architectural diagrams for your future.
          </p>
        </motion.div>

        {/* Trending Tech Jobs Section */}
        <div className="mb-32">
          <div className="flex items-center gap-3 mb-10">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white shadow-lg shadow-indigo-500/30">
              <TrendingUp size={24} />
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">Market Growth & Hubs</h2>
          </div>

          {loadingJobs ? (
            <div className="flex justify-center items-center h-40">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-10 bg-white/50 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10">
              <p className="text-slate-500">No open positions at the moment. Please check back later!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {jobs.slice(0, 4).map((job, idx) => {
                const style = getJobCardStyle(job.title);
                return (
                  <motion.div 
                    key={job.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.1, duration: 0.5 }}
                    onClick={() => setSelectedJob(job)}
                    className={`bg-white dark:bg-[#0B0C10] p-6 rounded-[24px] border border-slate-200 dark:border-white/5 shadow-sm hover:shadow-xl dark:shadow-[0_0_15px_rgba(0,0,0,0.5)] cursor-pointer group transition-all duration-300 relative overflow-hidden`}
                  >
                    <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${style.bg} rounded-full blur-3xl opacity-50 group-hover:opacity-100 transition-opacity`}></div>
                    
                    <div className="relative z-10">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${style.bg} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 transform`}>
                        {style.icon}
                      </div>
                      
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 truncate" title={job.title}>{job.title}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 truncate">{job.companyName}</p>
                      
                      <div className="space-y-3 mb-6">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-500 dark:text-slate-400">Salary</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">{job.salaryRange || 'Competitive'}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-500 dark:text-slate-400">Location</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300 max-w-[120px] truncate text-right">{job.location || 'Remote'}</span>
                        </div>
                      </div>

                      <div className="w-full py-3 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-400 group-hover:bg-slate-50 dark:group-hover:bg-white/5 transition-colors">
                        View Details <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>

        {/* Technology Roadmaps Section (Elevated UI) */}
        <div className="mb-32">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2.5 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl text-white shadow-lg shadow-purple-500/30">
                    <Map size={24} />
                  </div>
                  <h2 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">Mastery Tracks</h2>
                </div>
                <p className="text-slate-500 dark:text-slate-400 max-w-lg">Curated, high-fidelity visual timlines detailing the precise sequences required to conquer modern engineering disciplines.</p>
              </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {roadmaps.map((roadmap, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.15, duration: 0.6, type: 'spring', bounce: 0.4 }}
                onClick={() => setSelectedRoadmap(roadmap)}
                className="relative overflow-hidden rounded-[32px] bg-white/50 dark:bg-[#0B0C10] border border-slate-200 dark:border-white/5 group cursor-pointer hover:-translate-y-2 transition-all duration-500"
              >
                {/* Internal Glow on Hover */}
                <div className={`absolute top-0 right-0 w-64 h-64 ${roadmap.glow} rounded-full blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none`}></div>
                
                <div className={`absolute top-0 left-0 w-full h-2 bg-gradient-to-r ${roadmap.color}`} />
                
                <div className="p-8 md:p-10 relative z-10">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${roadmap.color} flex items-center justify-center mb-8 shadow-lg text-white transform group-hover:scale-110 transition-transform duration-500`}>
                      <Map size={26} strokeWidth={2.5} />
                  </div>
                  
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-4 tracking-tight">{roadmap.title}</h3>
                  <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 mb-6 bg-indigo-50 dark:bg-indigo-500/10 inline-block px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-500/20">{roadmap.description}</p>
                  
                  {/* Miniature flowchart preview layout - STYLIZED */}
                  <div className="flex flex-col gap-4 relative mb-10 mt-4">
                       <div className="absolute left-[15px] top-6 bottom-4 w-0.5 bg-gradient-to-b from-indigo-500/50 to-transparent z-0"></div>
                       {roadmap.milestones.slice(0,3).map((step, stepIdx) => (
                          <div key={stepIdx} className="flex items-center gap-5 relative z-10">
                              <div className={`w-8 h-8 rounded-full bg-white dark:bg-[#0B0C10] border-[4px] shadow-md flex-shrink-0 transition-all duration-300 relative group-hover:border-indigo-500/50`}>
                                 <div className={`absolute inset-[-4px] rounded-full bg-gradient-to-r ${roadmap.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500 shadow-lg blur-sm`} />
                                 <div className={`absolute inset-1 rounded-full bg-gradient-to-r ${roadmap.color} opacity-80`} />
                              </div>
                              <span className="font-semibold text-slate-700 dark:text-gray-300 line-clamp-1 text-sm bg-white dark:bg-white/5 px-4 py-2.5 rounded-xl flex-1 border border-slate-100 dark:border-white/5 shadow-sm transition-all group-hover:border-indigo-500/30 group-hover:bg-indigo-50/50 dark:group-hover:bg-indigo-500/10">
                                 {step.title}
                              </span>
                          </div>
                       ))}
                  </div>

                  <div className="pt-2">
                    <div className={`w-full py-4 rounded-2xl border flex items-center justify-between px-6 font-bold transition-all duration-500 bg-white dark:bg-[#111] dark:border-white/10 dark:text-white text-slate-900 group-hover:shadow-[0_10px_40px_-10px_rgba(99,102,241,0.5)] group-hover:border-indigo-500/50 relative overflow-hidden`}>
                      <span className="relative z-10">Initialize Track Map</span>
                      <ChevronRight size={20} className="relative z-10 transform group-hover:translate-x-2 transition-transform" />
                      <div className={`absolute inset-0 bg-gradient-to-r ${roadmap.color} opacity-0 group-hover:opacity-10 transition-opacity duration-500`} />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Glowing Divider */}
        <div className="w-full max-w-3xl mx-auto h-px bg-gradient-to-r from-transparent via-slate-300 dark:via-white/20 to-transparent mb-32"></div>

        {/* AI Generative Engine */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="mb-32"
        >
            <div className="relative rounded-[40px] overflow-hidden bg-white/10 dark:bg-[#08080c]/80 backdrop-blur-3xl border border-white/20 dark:border-white/10 shadow-[0_0_100px_rgba(99,102,241,0.15)] p-6 sm:p-8 md:p-12 xl:p-16 grid grid-cols-1 lg:grid-cols-2 items-center gap-12 lg:gap-16"
            >
                {/* Structural Glows */}
                <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-500/30 rounded-full blur-[100px] pointer-events-none"></div>
                <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-500/30 rounded-full blur-[100px] pointer-events-none"></div>
                <div className="absolute inset-0 bg-[url('https://transparenttextures.com/patterns/cubes.png')] opacity-[0.03] pointer-events-none mix-blend-overlay"></div>

                <div className="w-full relative z-10 text-center lg:text-left flex flex-col justify-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-full text-[10px] md:text-xs font-black tracking-widest shadow-xl shadow-slate-900/20 dark:shadow-white/20 mb-6 lg:mb-8 uppercase w-max mx-auto lg:mx-0">
                        Zero Auth <Zap size={14} className="fill-current" />
                    </div>
                    <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white mb-6 lg:mb-8 leading-[1.1] tracking-tight">
                        Generate Diagrams<br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500">At Light Speed.</span>
                    </h2>
                    <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base md:text-lg lg:text-xl mb-6 lg:mb-10 max-w-xl mx-auto lg:mx-0 leading-relaxed font-medium">
                        Bypass standard text outputs. Our Nexus Architect engine directly maps your concepts into fully visual SVGs. Ask it to build an architecture flow, a study plan, or a tech stack topology right now.
                    </p>
                    
                    <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 hidden lg:flex">
                         <div className="h-12 w-12 rounded-full border-2 border-slate-200 dark:border-white/10 flex items-center justify-center bg-white/50 dark:bg-white/5 backdrop-blur-sm shadow-lg">
                            <Bot className="text-indigo-500" />
                         </div>
                         <div className="w-16 h-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"></div>
                         <div className="h-12 w-12 rounded-full border-2 border-slate-200 dark:border-white/10 flex items-center justify-center bg-white/50 dark:bg-white/5 backdrop-blur-sm shadow-lg">
                            <Map className="text-purple-500" />
                         </div>
                    </div>
                </div>

                <div className="w-full relative z-10 perspective-1000 mt-4 lg:mt-0">
                    <div className="transform transition-transform duration-700 hover:rotate-y-2 hover:-rotate-x-2">
                        <EmbeddedCareerBot />
                    </div>
                </div>
            </div>
        </motion.div>
      </main>

        {/* Visualized Static Modals (Extremely High Fidelity) */}
        <AnimatePresence>
          {selectedRoadmap && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                  <motion.div 
                      className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setSelectedRoadmap(null)}
                  />
                  <motion.div 
                      className="relative w-full max-w-3xl bg-white dark:bg-[#0f0f0f] rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-200 dark:border-white/10"
                      initial={{ scale: 0.9, opacity: 0, y: 40 }}
                      animate={{ scale: 1, opacity: 1, y: 0, transition: { type: "spring", damping: 25, stiffness: 300 } }}
                      exit={{ scale: 0.95, opacity: 0, y: 20 }}
                  >
                      <div className="p-6 sm:p-8 relative z-10 border-b border-slate-200 dark:border-white/5 flex items-start justify-between">
                          <div className="flex gap-4 items-center">
                              <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${getJobCardStyle(selectedJob.title).bg} flex items-center justify-center text-white shadow-lg`}>
                                  {getJobCardStyle(selectedJob.title).icon}
                              </div>
                              <div>
                                  <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-1">{selectedJob.title}</h2>
                                  <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{selectedJob.companyName} • {selectedJob.location || 'Remote'}</p>
                              </div>
                          </div>
                          <button onClick={() => setSelectedJob(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors flex-shrink-0">
                              <X size={24} className="text-slate-500 dark:text-slate-400" />
                          </button>
                      </div>

                      <div className="p-6 sm:p-8 overflow-y-auto flex-1 relative z-10 custom-scrollbar">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-8">
                              <div className="bg-slate-50 dark:bg-[#161616] p-4 rounded-xl border border-slate-100 dark:border-white/5">
                                  <div className="flex items-center gap-2 text-slate-500 dark:text-gray-400 text-xs uppercase font-bold mb-1">
                                      <DollarSign className="w-3.5 h-3.5" /> Salary
                                  </div>
                                  <div className="text-slate-900 dark:text-white font-medium">{selectedJob.salaryRange || 'Not disclosed'}</div>
                              </div>
                              <div className="bg-slate-50 dark:bg-[#161616] p-4 rounded-xl border border-slate-100 dark:border-white/5">
                                  <div className="flex items-center gap-2 text-slate-500 dark:text-gray-400 text-xs uppercase font-bold mb-1">
                                      <Briefcase className="w-3.5 h-3.5" /> Job Type
                                  </div>
                                  <div className="text-slate-900 dark:text-white font-medium">{selectedJob.employmentType || 'Full-time'}</div>
                              </div>
                              <div className="bg-slate-50 dark:bg-[#161616] p-4 rounded-xl border border-slate-100 dark:border-white/5">
                                  <div className="flex items-center gap-2 text-slate-500 dark:text-gray-400 text-xs uppercase font-bold mb-1">
                                      <Clock className="w-3.5 h-3.5" /> Deadline
                                  </div>
                                  <div className="text-slate-900 dark:text-white font-medium">{selectedJob.applyDeadline?.toDate ? selectedJob.applyDeadline.toDate().toLocaleDateString() : 'Open'}</div>
                              </div>
                          </div>

                          <div className="space-y-6 text-slate-600 dark:text-gray-300">
                              <div>
                                  <h3 className="text-slate-900 dark:text-white font-bold text-lg mb-3">About the Role</h3>
                                  <p className="leading-relaxed whitespace-pre-wrap text-sm text-slate-500 dark:text-gray-400">
                                      {selectedJob.description || 'No detailed description provided.'}
                                  </p>
                              </div>

                              <div>
                                  <h3 className="text-slate-900 dark:text-white font-bold text-lg mb-3">Requirements</h3>
                                  <p className="leading-relaxed whitespace-pre-wrap text-sm text-slate-500 dark:text-gray-400">
                                      {selectedJob.qualifications || 'Not specified.'}
                                  </p>
                              </div>

                              {selectedJob.skills && (
                                <div>
                                    <h3 className="text-slate-900 dark:text-white font-bold text-lg mb-3">Skills</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {(Array.isArray(selectedJob.skills) 
                                            ? selectedJob.skills 
                                            : (typeof selectedJob.skills === 'string' ? selectedJob.skills.split(',') : [])
                                        ).map((q: any, i: number) => (
                                            <span key={i} className="px-3 py-1.5 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-300 rounded-lg text-sm border border-slate-200 dark:border-white/5">
                                                {String(q).trim()}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                              )}

                              {selectedJob.customFields && selectedJob.customFields.length > 0 && (
                                  <div>
                                      <h3 className="text-slate-900 dark:text-white font-bold text-lg mb-3">Additional Information</h3>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                          {selectedJob.customFields.map((field: any) => (
                                              <div key={field.id || field.key} className="bg-slate-50 dark:bg-[#161616] p-4 rounded-xl border border-slate-100 dark:border-white/5">
                                                  <div className="text-slate-500 dark:text-gray-400 text-xs uppercase font-bold mb-1">
                                                      {field.key}
                                                  </div>
                                                  <div className="text-slate-900 dark:text-white font-medium">{field.value}</div>
                                              </div>
                                          ))}
                                      </div>
                                  </div>
                              )}
                          </div>
                      </div>
                  </motion.div>
              </div>
          )}
      </AnimatePresence>

       <style>{`
          .custom-scrollbar::-webkit-scrollbar {
              width: 8px;
              height: 8px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
              background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
              background: rgba(99, 102, 241, 0.2);
              border-radius: 20px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
              background: rgba(99, 102, 241, 0.5);
          }
      `}</style>
    </div>
  );
};

// Wrapper for checking dark theme state
const FinalCareerHub: React.FC = () => {
  const [isDarkTheme, setIsDarkTheme] = React.useState(true);
  
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setIsDarkTheme(isDark);
    
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          setIsDarkTheme(document.documentElement.classList.contains('dark'));
        }
      });
    });
    
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  return <CareerHub isDarkTheme={isDarkTheme} />;
};

export default FinalCareerHub;
