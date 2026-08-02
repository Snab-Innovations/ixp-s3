import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import Navbar from '../components/landing/Navbar';
import { Target, TrendingUp, Users, Cpu, Award, Code2, AlertTriangle, Lightbulb, ShieldCheck, Send } from 'lucide-react';
import { rds } from '../services/rdsApi';
import { useMessageBox } from '../components/MessageBox';

const TEAM = [
  { 
    name: 'Aaradhya Pathak', 
    role: 'Full Stack Developer', 
    img: 'https://i.ibb.co/hxk52kkC/Whats-App-Image-2025-03-21-at-20-13-16.jpg',
    desc: "Passionate & driven Full Stack Web Developer proficient in the MERN stack with a strong foundation in DSA. Experienced in developing diverse projects, including robust web applications and AI-driven platforms.",
    link: 'https://portfolioaaradhya.netlify.app/',
    linkText: 'View Portfolio',
    icon: 'fa-globe'
  },
  { 
    name: 'Nimesh Kulkarni', 
    role: 'DevOps & Cloud', 
    img: '/nimesh-kulkarni.jpg',
    desc: 'Engineering student focused on DevOps, cloud infrastructure, and automation. Passionate about building scalable systems, CI/CD pipelines, and continuously improving technical skills through real-world deployments.',
    link: 'https://nimesh-portfolio-iota.vercel.app/',
    linkText: 'View Portfolio',
    icon: 'fa-globe'
  },
  { 
    name: 'Bhavesh Patil', 
    role: 'Web Developer', 
    img: '/bhavesh-patil.jpg',
    desc: 'Consistent Web Developer specializing in React and JavaScript, focused on building clean, scalable, and high-performance web applications. Passionate about writing maintainable responsive UI code.',
    link: 'https://www.linkedin.com/in/bhavesh-patil-ggsf',
    linkText: 'View LinkedIn',
    icon: 'fa-linkedin'
  },
  { 
    name: 'Sanika Wadnerkar', 
    role: 'Data Science & Model Optimization', 
    img: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?fit=crop&w=400&h=400&q=80',
    desc: 'Specializing in analytics and AI model architecture, driving the core logic and NLP refinements that enable our autonomous technical assessments to be accurate.',
    link: '#',
    linkText: 'View Profile',
    icon: 'fa-user'
  }
];

const VERSIONS = [
  { mark: 'Mark 1', desc: 'The initial proof of concept. Slow, buggy, but it proved AI could evaluate a candidate.', icon: <Lightbulb size={24} /> },
  { mark: 'Mark 5', desc: 'Overcame early latency issues. Integrated real-time speech analytics.', icon: <Cpu size={24} /> },
  { mark: 'Mark 10', desc: 'Major optimization breakthrough. Reduced infrastructure costs by 60% while increasing accuracy.', icon: <TrendingUp size={24} /> },
  { mark: 'Mark 16', desc: 'Current Generation. Near-human accuracy, instantaneous feedback, and highly scalable.', icon: <ShieldCheck size={24} /> },
];

const OurJourneyContent: React.FC = () => {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', subject: 'Industrial Support Inquiry', message: '' });
  const [loading, setLoading] = useState(false);
  const messageBox = useMessageBox();

  useEffect(() => {
    document.title = "Our Journey | InterviewXpert";
    window.scrollTo(0, 0);
  }, []);

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
          setFormData({ name: '', email: '', phone: '', subject: 'Industrial Support Inquiry', message: '' });
      } catch (error) {
          console.error("Error sending message:", error);
          messageBox.showError("Failed to send message. Please try again later.");
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0C10] text-slate-900 dark:text-white font-sans relative overflow-hidden transition-colors duration-300">
      <Navbar />

      {/* Background Elements */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/10 rounded-full blur-[150px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/10 rounded-full blur-[150px]"></div>
      </div>

      <main className="relative z-10 pt-32 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-32">
        
        {/* HERO SECTION */}
        <section className="text-center space-y-8 max-w-4xl mx-auto mt-12">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <h1 className="text-4xl md:text-6xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
              A 1.5 Year Journey from <br /> 
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-500">Struggle to Breakthrough</span>
            </h1>
            <p className="mt-8 text-xl text-slate-600 dark:text-slate-400 font-medium leading-relaxed max-w-2xl mx-auto">
              "Man needs his difficulties because they are necessary to enjoy success." 
              <br /><span className="text-sm text-slate-500 mt-2 block">— Dr. A.P.J. Abdul Kalam</span>
            </p>
          </motion.div>
        </section>

        {/* THE TEAM */}
        <section className="py-12">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">The Brains Behind the AI</h2>
            <p className="text-slate-500 dark:text-gray-400 max-w-2xl mx-auto">Four passionate engineers trying to solve one of the biggest bottlenecks in the tech industry.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {TEAM.map((member, idx) => (
              <motion.div 
                key={member.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1, duration: 0.6 }}
                className="group relative bg-white/50 dark:bg-white/5 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-3xl p-6 flex flex-col items-center text-center shadow-lg hover:shadow-2xl transition-all duration-300"
              >
                <div className="w-32 h-32 mb-6 rounded-full overflow-hidden border-4 border-slate-100 dark:border-[#1a1a24] shadow-inner relative group-hover:scale-105 transition-transform duration-500">
                  <div className="absolute inset-0 bg-blue-500/20 mix-blend-overlay z-10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <img src={member.img} alt={member.name} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{member.name}</h3>
                <div className="text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full mb-4 mt-1">{member.role}</div>
                <p className="text-sm leading-relaxed flex-grow text-slate-600 dark:text-slate-400 mb-6 px-2">{member.desc}</p>
                <a href={member.link} target={member.link !== '#' ? "_blank" : "_self"} rel="noopener noreferrer" className="inline-flex mt-auto items-center justify-center w-full gap-2 bg-gradient-to-r from-blue-600 to-indigo-500 text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:from-blue-700 hover:to-indigo-600 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
                  <i className={`fa-solid ${member.icon}`}></i> {member.linkText}
                </a>
              </motion.div>
            ))}
          </div>
        </section>

        {/* THE STRUGGLE */}
        <section className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 via-orange-500/5 to-transparent rounded-3xl transform skew-y-3 -z-10"></div>
          <div className="bg-white/40 dark:bg-[#121216]/60 backdrop-blur-md rounded-3xl border border-red-100 dark:border-red-500/10 p-8 md:p-16 shadow-2xl">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 text-red-500 font-bold text-xs uppercase tracking-widest mb-6 border border-red-500/20">
                    <AlertTriangle size={14} /> The Hard Path
                  </div>
                  <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white mb-6">Rising Through the Turbulence</h2>
                  <p className="text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
                    Building an autonomous AI recruiter isn't easy. For 1.5 years, we faced crushing financial constraints, attempting to balance massive cloud API compute costs directly out of our own pockets.
                  </p>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    We battled severe model inaccuracies, hallucination blocks, and the sheer pressure of crippling continuous college submissions. Yet, every failure was documented, studied, and overwritten by a better line of code.
                  </p>
                </motion.div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/80 dark:bg-black/40 p-6 rounded-2xl border border-slate-100 dark:border-white/5 space-y-3 shadow-md transform translate-y-4">
                  <div className="p-3 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-xl w-max"><TrendingUp size={24} /></div>
                  <h4 className="font-bold text-slate-900 dark:text-white">API Costs</h4>
                  <p className="text-xs text-slate-500">Burned through credits to achieve functional low latency.</p>
                </div>
                <div className="bg-white/80 dark:bg-black/40 p-6 rounded-2xl border border-slate-100 dark:border-white/5 space-y-3 shadow-md transform -translate-y-4">
                  <div className="p-3 bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 rounded-xl w-max"><Target size={24} /></div>
                  <h4 className="font-bold text-slate-900 dark:text-white">Accuracy Walls</h4>
                  <p className="text-xs text-slate-500">Tuning prompts to prevent hallucinated feedback.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* THE ITERATIONS (Mark 1 to 16) */}
        <section>
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-white mb-6">
              From <span className="text-slate-400">Mark 1</span> to <span className="text-blue-500">Mark 16</span>
            </h2>
            <p className="text-slate-500 dark:text-gray-400 max-w-2xl mx-auto text-lg">
              Like forging armor, every iteration was tested in the fire of real-world constraints. We stripped what didn't work and amplified what did.
            </p>
          </div>

          <div className="relative">
            <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500/50 via-purple-500/50 to-indigo-500/50 -translate-x-1/2"></div>
            <div className="space-y-12 md:space-y-24">
              {VERSIONS.map((v, idx) => (
                <motion.div 
                  key={v.mark}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6 }}
                  className={`flex flex-col md:flex-row items-center gap-8 ${idx % 2 === 0 ? 'md:flex-row-reverse' : ''}`}
                >
                  <div className="md:w-1/2"></div>
                  <div className="relative flex-shrink-0 w-16 h-16 rounded-full bg-white dark:bg-[#121216] border-4 border-blue-500 flex items-center justify-center -my-8 md:my-0 z-10 shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                    <span className="text-blue-500">{v.icon}</span>
                  </div>
                  <div className={`md:w-1/2 ${idx % 2 === 0 ? 'md:text-right' : 'md:text-left'} text-center md:px-8`}>
                    <div className="bg-white/50 dark:bg-white/5 backdrop-blur-xl border border-slate-200 dark:border-white/10 p-8 rounded-3xl shadow-xl hover:border-blue-500/30 transition-colors">
                      <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-3">{v.mark}</h3>
                      <p className="text-slate-600 dark:text-slate-400">{v.desc}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* TODAY & TOMORROW */}
        <section className="relative bg-white/70 dark:bg-[#121216]/80 backdrop-blur-2xl rounded-3xl border border-white/50 dark:border-white/10 p-8 sm:p-12 shadow-2xl dark:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-[80px] -ml-32 -mb-32 pointer-events-none"></div>
          
          <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="relative z-10 text-center">
            <Award size={48} className="mx-auto mb-6 text-blue-600 dark:text-blue-400 drop-shadow-md" />
            <h2 className="text-3xl md:text-5xl font-extrabold mb-6 text-slate-900 dark:text-white">Seeking Industrial Support</h2>
            <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-3xl mx-auto mb-10 leading-relaxed">
              Today, we have forged a highly capable interviewing platform. We've participated in numerous hackathons, secured top rankings, and validated our architecture. We are now officially seeking scale, investment, and industrial support to bring InterviewXpert to the global stage.
            </p>
            
            <div className="max-w-2xl mx-auto bg-white dark:bg-black/40 rounded-3xl p-6 md:p-8 text-left border border-slate-200 dark:border-white/10 shadow-lg">
              <form onSubmit={handleSubmit} className="space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="space-y-2">
                         <label className="text-xs font-bold tracking-wide text-slate-500 dark:text-gray-400 uppercase">Name</label>
                         <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-5 py-4 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-2xl focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-900 dark:text-white placeholder:text-slate-400 shadow-sm" placeholder="John Doe" />
                     </div>
                     <div className="space-y-2">
                         <label className="text-xs font-bold tracking-wide text-slate-500 dark:text-gray-400 uppercase">Email</label>
                         <input type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full px-5 py-4 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-2xl focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-900 dark:text-white placeholder:text-slate-400 shadow-sm" placeholder="john@example.com" />
                     </div>
                 </div>
                 <div className="space-y-2">
                     <label className="text-xs font-bold tracking-wide text-slate-500 dark:text-gray-400 uppercase">Contact Number</label>
                     <input type="tel" required value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full px-5 py-4 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-2xl focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-900 dark:text-white placeholder:text-slate-400 shadow-sm" placeholder="+91 9876543210" />
                 </div>
                 <div className="space-y-2">
                     <label className="text-xs font-bold tracking-wide text-slate-500 dark:text-gray-400 uppercase">Message</label>
                     <textarea required rows={4} value={formData.message} onChange={e => setFormData({ ...formData, message: e.target.value })} className="w-full px-5 py-4 bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-2xl focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-900 dark:text-white placeholder:text-slate-400 shadow-sm resize-y" placeholder="Tell us how we can collaborate..." />
                 </div>
                 <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-lg py-4 px-6 rounded-2xl shadow-xl shadow-blue-500/25 transition-all transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 border border-white/10">
                    {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={20} />}
                    {loading ? 'Sending...' : 'Partner With Us'}
                 </button>
              </form>
            </div>
          </motion.div>
        </section>

      </main>
    </div>
  );
};

export default OurJourneyContent;
