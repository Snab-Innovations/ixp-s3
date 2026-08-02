import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sun, Moon, ArrowLeft, Send } from 'lucide-react';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import Logo from '../components/Logo';
import { rds } from '../services/rdsApi';
import { useMessageBox } from '../components/MessageBox';

const ContactUsContent: React.FC = () => {
    const { toggleTheme, isDark } = useTheme();
    const [formData, setFormData] = useState({ name: '', email: '', phone: '', subject: '', message: '' });
    const [loading, setLoading] = useState(false);
    const messageBox = useMessageBox();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.email || !formData.message) {
            messageBox.showError("Please fill in all required fields.");
            return;
        }
        setLoading(true);
        try {
            await rds.createContact({ ...formData });
            messageBox.showSuccess("Your message has been sent successfully!");
            setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
        } catch (error) {
            console.error("Error sending message:", error);
            messageBox.showError("Failed to send message. Please try again later.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`min-h-screen transition-colors duration-500 ${isDark ? 'bg-[#0a0a0f]' : 'bg-[#fafafa]'}`}>
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className={`absolute top-0 right-0 w-[600px] h-[600px] rounded-full blur-[120px] ${isDark ? 'bg-blue-900/10' : 'bg-blue-100/40'}`} />
                <div className={`absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full blur-[100px] ${isDark ? 'bg-purple-900/10' : 'bg-purple-100/40'}`} />
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
                    <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 ${isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-500'}`}>
                        <Send size={32} />
                    </div>
                    <h1 className={`text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-3 sm:mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        Contact Us
                    </h1>
                    <p className={`text-lg max-w-2xl mx-auto ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        Have questions or feedback? We'd love to hear from you. Drop us a line below.
                    </p>
                </motion.div>

                <div className={`rounded-3xl border p-6 md:p-10 shadow-xl ${isDark ? 'bg-[#111] border-white/10 shadow-black/20' : 'bg-white border-gray-100 shadow-gray-200/50'}`}>
                    <form onSubmit={handleSubmit} className="space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Name</label>
                                <input 
                                    type="text" 
                                    required 
                                    value={formData.name} 
                                    onChange={e => setFormData({ ...formData, name: e.target.value })} 
                                    className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${isDark ? 'bg-black/20 border-white/10 focus:border-blue-500/50 text-white' : 'bg-gray-50 border-gray-200 focus:border-blue-500/50 text-gray-900'}`}
                                    placeholder="John Doe"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Email</label>
                                <input 
                                    type="email" 
                                    required 
                                    value={formData.email} 
                                    onChange={e => setFormData({ ...formData, email: e.target.value })} 
                                    className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${isDark ? 'bg-black/20 border-white/10 focus:border-blue-500/50 text-white' : 'bg-gray-50 border-gray-200 focus:border-blue-500/50 text-gray-900'}`}
                                    placeholder="john@example.com"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Contact Number</label>
                                <input 
                                    type="tel" 
                                    value={formData.phone} 
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })} 
                                    className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${isDark ? 'bg-black/20 border-white/10 focus:border-blue-500/50 text-white' : 'bg-gray-50 border-gray-200 focus:border-blue-500/50 text-gray-900'}`}
                                    placeholder="+91 9876543210"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Subject</label>
                                <input 
                                    type="text" 
                                    value={formData.subject} 
                                    onChange={e => setFormData({ ...formData, subject: e.target.value })} 
                                    className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${isDark ? 'bg-black/20 border-white/10 focus:border-blue-500/50 text-white' : 'bg-gray-50 border-gray-200 focus:border-blue-500/50 text-gray-900'}`}
                                    placeholder="How can we help?"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className={`text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Message</label>
                            <textarea 
                                required 
                                value={formData.message} 
                                onChange={e => setFormData({ ...formData, message: e.target.value })} 
                                rows={5} 
                                className={`w-full px-4 py-3 rounded-xl border outline-none transition-all resize-none ${isDark ? 'bg-black/20 border-white/10 focus:border-blue-500/50 text-white' : 'bg-gray-50 border-gray-200 focus:border-blue-500/50 text-gray-900'}`}
                                placeholder="Your message here..."
                            />
                        </div>
                        <div className="pt-4">
                            <button 
                                type="submit" 
                                disabled={loading} 
                                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-600/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transform hover:-translate-y-0.5 active:translate-y-0"
                            >
                                {loading ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        <Send size={20} /> Send Message
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

const ContactUs: React.FC = () => {
    return (
        <ThemeProvider>
            <ContactUsContent />
        </ThemeProvider>
    );
};

export default ContactUs;
