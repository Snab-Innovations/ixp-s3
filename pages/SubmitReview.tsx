import React, { useState } from 'react';
import { rds } from '../services/rdsApi';
import { useMessageBox } from '../components/MessageBox';
import { Star, Send, ArrowLeft, Home } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/landing/Navbar';
import { ThemeProvider } from '../context/ThemeContext';

const SubmitReviewContent: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [contact, setContact] = useState('');
  const [review, setReview] = useState('');
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [userType, setUserType] = useState<'candidate' | 'recruiter'>('candidate');
  const [loading, setLoading] = useState(false);
  const messageBox = useMessageBox();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Email Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      messageBox.showError('Please enter a valid email address.');
      return;
    }

    // Indian Phone Number Validation (supports optional +91, followed by 10 digits starting with 6-9)
    const phoneRegex = /^(?:\+91|91)?(?:[\s.-]+)?([6-9]\d{9})$/;
    if (!phoneRegex.test(contact.trim())) {
      messageBox.showError('Please enter a valid 10-digit Indian contact number.');
      return;
    }

    if (rating === 0) {
      messageBox.showError('Please provide a star rating.');
      return;
    }
    setLoading(true);
    try {
      await rds.createReview({
        name,
        email,
        contact,
        review,
        rating,
        userType,
      });
      messageBox.showSuccess('Thank you! Your review has been submitted for approval.');
      navigate('/'); // Navigate to home after submission
    } catch (error) {
      console.error('Error submitting review:', error);
      messageBox.showError('Failed to submit review. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0C10] text-slate-900 dark:text-white font-sans relative overflow-hidden flex flex-col transition-colors duration-300">
      <Navbar />

      {/* Background Effects - Optimized for performance */}
      <div className="absolute inset-0 -z-10 h-full w-full bg-white bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] bg-[size:6rem_4rem] dark:bg-[#0B0C10] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)]"></div>
      <div className="hidden lg:block absolute -top-1/4 left-0 w-96 h-96 bg-purple-400/20 dark:bg-purple-600/10 rounded-full blur-[150px] pointer-events-none animate-blob"></div>
      <div className="hidden lg:block absolute -bottom-1/4 right-0 w-96 h-96 bg-blue-400/20 dark:bg-blue-600/10 rounded-full blur-[150px] pointer-events-none animate-blob animation-delay-2000"></div>

      <main className="flex-1 w-full flex items-center justify-center px-4 relative z-10 pt-32 pb-16">
        <div className="w-full max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-5 duration-700">
          
          {/* Centered Navigation Buttons */}
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mb-8">
            <Link to="/reviews" className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-white dark:bg-[#121216]/80 backdrop-blur-md border border-slate-200 dark:border-white/10 text-sm font-bold text-slate-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-500/30 hover:shadow-lg transition-all">
              <ArrowLeft size={16} /> Back to Reviews
            </Link>
            <Link to="/" className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-white dark:bg-[#121216]/80 backdrop-blur-md border border-slate-200 dark:border-white/10 text-sm font-bold text-slate-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-500/30 hover:shadow-lg transition-all">
              <Home size={16} /> Explore Platform
            </Link>
          </div>

          <div className="relative bg-white/70 dark:bg-[#121216]/80 backdrop-blur-2xl rounded-3xl border border-white/50 dark:border-white/10 p-8 sm:p-12 shadow-2xl dark:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] overflow-hidden">
            {/* Subtle glowing accents */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-[80px] -ml-32 -mb-32 pointer-events-none" />

            <div className="text-center mb-10 relative z-10">
              <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">Share Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">Experience</span></h1>
              <p className="text-slate-500 dark:text-gray-400 mt-3 text-lg">Your feedback helps us shape the future of AI interviewing.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
              <div className="space-y-4">
                <label className="text-sm font-bold tracking-wide text-slate-700 dark:text-gray-300 uppercase">I am a...</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button type="button" onClick={() => setUserType('candidate')} className={`px-6 py-4 rounded-2xl text-base font-bold transition-all border-2 ${userType === 'candidate' ? 'bg-blue-50/50 dark:bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400 shadow-md transform scale-[1.02]' : 'bg-white/50 dark:bg-[#1a1a1a]/50 border-transparent text-slate-600 dark:text-gray-400 hover:bg-white dark:hover:bg-white/5 shadow-sm'}`}>
                        Candidate
                    </button>
                    <button type="button" onClick={() => setUserType('recruiter')} className={`px-6 py-4 rounded-2xl text-base font-bold transition-all border-2 ${userType === 'recruiter' ? 'bg-purple-50/50 dark:bg-purple-500/10 border-purple-500 text-purple-600 dark:text-purple-400 shadow-md transform scale-[1.02]' : 'bg-white/50 dark:bg-[#1a1a1a]/50 border-transparent text-slate-600 dark:text-gray-400 hover:bg-white dark:hover:bg-white/5 shadow-sm'}`}>
                        Recruiter / Professional
                    </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold tracking-wide text-slate-500 dark:text-gray-400 uppercase">Your Name</label>
                  <input type="text" placeholder="John Doe" required value={name} onChange={(e) => setName(e.target.value)} className="w-full px-5 py-4 bg-white/80 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-900 dark:text-white placeholder:text-slate-400 shadow-sm" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold tracking-wide text-slate-500 dark:text-gray-400 uppercase">Your Email</label>
                  <input type="email" placeholder="john@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-5 py-4 bg-white/80 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-900 dark:text-white placeholder:text-slate-400 shadow-sm" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold tracking-wide text-slate-500 dark:text-gray-400 uppercase">Contact Number</label>
                <input type="tel" placeholder="+91 9876543210" required value={contact} onChange={(e) => setContact(e.target.value)} className="w-full px-5 py-4 bg-white/80 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-900 dark:text-white placeholder:text-slate-400 shadow-sm" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold tracking-wide text-slate-500 dark:text-gray-400 uppercase">Your Review</label>
                <textarea placeholder="Tell us what you loved..." required rows={5} value={review} onChange={(e) => setReview(e.target.value)} className="w-full px-5 py-4 bg-white/80 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-900 dark:text-white placeholder:text-slate-400 shadow-sm resize-y" />
              </div>

              <div className="text-center space-y-4 pt-6 border-t border-slate-200/50 dark:border-white/5">
                <label className="text-sm font-bold tracking-widest text-slate-500 dark:text-gray-400 uppercase">Rate Your Experience</label>
                <div className="flex justify-center items-center gap-3" onMouseLeave={() => setHoverRating(0)}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button type="button" key={star} onMouseEnter={() => setHoverRating(star)} onClick={() => setRating(star)} className="focus:outline-none transform transition-transform hover:scale-110 active:scale-95">
                      <Star
                        size={42}
                        className={`transition-all duration-300 drop-shadow-md ${
                          (hoverRating || rating) >= star 
                          ? 'text-yellow-400 fill-yellow-400 scale-110 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]' 
                          : 'text-slate-300 dark:text-slate-600'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4">
                <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-lg py-4 px-6 rounded-2xl shadow-xl shadow-blue-500/25 transition-all transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 border border-white/10">
                  {loading ? <i className="fas fa-spinner fa-spin"></i> : <Send size={20} />}
                  {loading ? 'Submitting...' : 'Post Review Securely'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

const SubmitReview: React.FC = () => {
  return (
    <ThemeProvider>
      <SubmitReviewContent />
    </ThemeProvider>
  );
};

export default SubmitReview;