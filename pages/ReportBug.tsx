import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sun, Moon, ArrowLeft, Bug } from 'lucide-react';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import Logo from '../components/Logo';
import { rds } from '../services/rdsApi';
import { useMessageBox } from '../components/MessageBox';

const ReportBugContent: React.FC = () => {
    const { toggleTheme, isDark } = useTheme();
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        feature: '',
        description: '',
        steps: '',
        severity: 'medium',
        type: 'functional'
    });
    const [loading, setLoading] = useState(false);
    const messageBox = useMessageBox();

    useEffect(() => {
        document.title = "Report a Bug | InterviewXpert";
        const setMetaTag = (attr: 'name' | 'property', value: string, content: string) => {
            let element = document.querySelector(`meta[${attr}='${value}']`) as HTMLMetaElement;
            if (!element) {
                element = document.createElement('meta');
                element.setAttribute(attr, value);
                document.head.appendChild(element);
            }
            element.setAttribute('content', content);
        };
        setMetaTag('name', 'description', "Found an issue? Help us improve InterviewXpert by reporting a bug. We appreciate your feedback to make our platform better.");
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.feature || !formData.description) {
            messageBox.showError("Please describe the feature and the bug.");
            return;
        }
        setLoading(true);
        try {
            await rds.createBugReport({ ...formData });
            messageBox.showSuccess("Bug report submitted successfully. Thank you!");
            setFormData({ name: '', email: '', feature: '', description: '', steps: '', severity: 'medium', type: 'functional' });
        } catch (error) {
            console.error("Error submitting bug report:", error);
            messageBox.showError("Failed to submit report. Please try again later.");
        } finally {
            setLoading(false);
        }
    };

    const severityOptions = [
        { value: 'low', label: 'Low', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
        { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
        { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
        { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    ];

    return (
        <div className={`min-h-screen transition-colors duration-500 ${isDark ? 'bg-[#0a0a0f]' : 'bg-[#fafafa]'}`}>
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className={`absolute top-0 right-0 w-[600px] h-[600px] rounded-full blur-[120px] ${isDark ? 'bg-red-900/10' : 'bg-red-100/40'}`} />
                <div className={`absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full blur-[100px] ${isDark ? 'bg-orange-900/10' : 'bg-orange-100/40'}`} />
            </div>

            <nav className={`relative z-50 flex items-center justify-between px-6 py-4 border-b transition-colors ${isDark ? 'border-white/5 bg-[#0a0a0f]/80' : 'border-black/5 bg-white/80'} backdrop-blur-md`}>
                <Link to="/" className="flex items-center group">
                    <Logo className="w-[136px] sm:w-[164px] h-auto" isDark={isDark} />
                </Link>
                <div className="flex items-center gap-3">
                    <Link to="/" className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-full transition-all ${isDark ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-black/5'}`}>
                        <ArrowLeft size={15} />
                        <span className="hidden sm:inline">Home</span>
                    </Link>
                    <button onClick={toggleTheme} className={`p-2.5 rounded-full transition-all duration-300 ${isDark ? 'bg-white/5 hover:bg-white/10 text-yellow-400' : 'bg-black/5 hover:bg-black/10 text-slate-600'}`} aria-label="Toggle theme">
                        <motion.div initial={false} animate={{ rotate: isDark ? 0 : 180 }} transition={{ duration: 0.3 }}>
                            {isDark ? <Sun size={16} /> : <Moon size={16} />}
                        </motion.div>
                    </button>
                </div>
            </nav>

            <main className="relative z-10 max-w-4xl mx-auto px-4 py-12">
                <motion.div 
                    initial={{ opacity: 0, y: 20 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    transition={{ duration: 0.6 }}
                    className="text-center mb-12"
                >
                    <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 ${isDark ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-500'}`}>
                        <Bug size={32} />
                    </div>
                    <h1 className={`text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-3 sm:mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        Report a Bug
                    </h1>
                    <p className={`text-lg max-w-2xl mx-auto ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        Found something that's not working right? Let us know and we'll fix it as soon as possible. Your feedback helps us improve.
                    </p>
                </motion.div>

                <div className={`rounded-3xl border p-6 md:p-10 shadow-xl ${isDark ? 'bg-[#111] border-white/10 shadow-black/20' : 'bg-white border-gray-100 shadow-gray-200/50'}`}>
                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* Reporter Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Your Name (Optional)</label>
                                <input 
                                    type="text" 
                                    value={formData.name} 
                                    onChange={e => setFormData({ ...formData, name: e.target.value })} 
                                    className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${isDark ? 'bg-black/20 border-white/10 focus:border-red-500/50 text-white' : 'bg-gray-50 border-gray-200 focus:border-red-500/50 text-gray-900'}`}
                                    placeholder="John Doe"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Your Email (Optional)</label>
                                <input 
                                    type="email" 
                                    value={formData.email} 
                                    onChange={e => setFormData({ ...formData, email: e.target.value })} 
                                    className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${isDark ? 'bg-black/20 border-white/10 focus:border-red-500/50 text-white' : 'bg-gray-50 border-gray-200 focus:border-red-500/50 text-gray-900'}`}
                                    placeholder="john@example.com"
                                />
                            </div>
                        </div>

                        {/* Bug Details */}
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Affected Feature</label>
                                    <input 
                                        type="text" 
                                        required 
                                        value={formData.feature} 
                                        onChange={e => setFormData({ ...formData, feature: e.target.value })} 
                                        className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${isDark ? 'bg-black/20 border-white/10 focus:border-red-500/50 text-white' : 'bg-gray-50 border-gray-200 focus:border-red-500/50 text-gray-900'}`}
                                        placeholder="e.g., Login Page, Dashboard"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Bug Type</label>
                                    <select 
                                        value={formData.type} 
                                        onChange={e => setFormData({ ...formData, type: e.target.value })} 
                                        className={`w-full px-4 py-3 rounded-xl border outline-none transition-all appearance-none cursor-pointer ${isDark ? 'bg-black/20 border-white/10 focus:border-red-500/50 text-white' : 'bg-gray-50 border-gray-200 focus:border-red-500/50 text-gray-900'}`}
                                    >
                                        <option value="functional">Functional Issue</option>
                                        <option value="ui">UI/UX Problem</option>
                                        <option value="performance">Performance</option>
                                        <option value="security">Security</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Severity Level</label>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {severityOptions.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, severity: option.value })}
                                            className={`px-4 py-3 rounded-xl text-sm font-medium transition-all border ${
                                                formData.severity === option.value
                                                    ? `${option.color} border-transparent ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#111] ring-${option.color.split(' ')[0].replace('bg-', '')}`
                                                    : `${isDark ? 'bg-black/20 border-white/10 text-slate-400 hover:bg-white/5' : 'bg-gray-50 border-gray-200 text-slate-600 hover:bg-gray-100'}`
                                            }`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Description</label>
                                <textarea 
                                    required 
                                    value={formData.description} 
                                    onChange={e => setFormData({ ...formData, description: e.target.value })} 
                                    rows={4} 
                                    className={`w-full px-4 py-3 rounded-xl border outline-none transition-all resize-none ${isDark ? 'bg-black/20 border-white/10 focus:border-red-500/50 text-white' : 'bg-gray-50 border-gray-200 focus:border-red-500/50 text-gray-900'}`}
                                    placeholder="Describe what happened..."
                                />
                            </div>

                            <div className="space-y-2">
                                <label className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Steps to Reproduce (Optional)</label>
                                <textarea 
                                    value={formData.steps} 
                                    onChange={e => setFormData({ ...formData, steps: e.target.value })} 
                                    rows={4} 
                                    className={`w-full px-4 py-3 rounded-xl border outline-none transition-all resize-none ${isDark ? 'bg-black/20 border-white/10 focus:border-red-500/50 text-white' : 'bg-gray-50 border-gray-200 focus:border-red-500/50 text-gray-900'}`}
                                    placeholder="1. Go to page...&#10;2. Click on button...&#10;3. See error..."
                                />
                            </div>
                        </div>

                        <div className="pt-4">
                            <button 
                                type="submit" 
                                disabled={loading} 
                                className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-red-600/20 hover:shadow-red-600/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transform hover:-translate-y-0.5 active:translate-y-0"
                            >
                                {loading ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Submitting...
                                    </>
                                ) : (
                                    <>
                                        <Bug size={20} /> Submit Bug Report
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    );
};

const ReportBug: React.FC = () => {
    return (
        <ThemeProvider>
            <ReportBugContent />
        </ThemeProvider>
    );
};

export default ReportBug;
