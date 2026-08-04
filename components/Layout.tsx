import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationCenter from './NotificationCenter';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon, Menu, X, Monitor, Mail, Bug, MessageSquare } from 'lucide-react';
import ConnectionStatus from './ConnectionStatus';
import Logo from './Logo';
import DashboardSidebar from './ui/dashboard-sidebar';
import RecruiterRateLimitBanner from './RecruiterRateLimitBanner';
import WhatsAppCredentialsModal from './WhatsAppCredentialsModal';



const LayoutContent: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, userProfile, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isWaModalOpen, setIsWaModalOpen] = React.useState(false);

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const { theme, setTheme } = useTheme();

  const isActive = (path: string) => location.pathname === path;
  const isRecruiterPath = location.pathname.startsWith('/recruiter/');
  const showRecruiterSidebar = isRecruiterPath || Boolean(user && userProfile?.role === 'recruiter');
  const isRecruiterDashboard = location.pathname === '/recruiter/jobs';
  const navigateFromSidebar = (href: string) => {
    navigate(href);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className={`${isRecruiterPath ? 'recruiter-shell' : ''} min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 selection:text-foreground flex flex-col transition-colors duration-300`}>
      {/* Background wash */}
      <div className="fixed inset-0 z-[-1] bg-background pointer-events-none transition-colors duration-300" />

      {/* Tech Grid Pattern - subtle texture */}
      <div className={`${isRecruiterPath ? 'recruiter-grid' : ''} fixed inset-0 z-[-1] pointer-events-none opacity-[0.03]`}
        style={{
          backgroundImage: 'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)',
          backgroundSize: '30px 30px'
        }}>
      </div>

      {showRecruiterSidebar ? <RecruiterRateLimitBanner /> : null}

      <nav className={`sticky top-0 z-40 border-b backdrop-blur-xl transition-colors duration-300 ${isRecruiterPath ? 'recruiter-topbar' : ''} ${showRecruiterSidebar ? 'border-white/[0.11] bg-[#000]/95 text-white' : 'border-border bg-background/90'}`}>
        <div className="w-full mx-auto px-3 sm:px-4 lg:px-5">
          <div className="relative flex h-14 items-center justify-between">

            {/* Logo Area */}
            <div className="flex-shrink-0 flex items-center">
              <Link to="/" className="flex items-center group">
                <div className="w-[118px] sm:w-[140px] flex items-center justify-center transition-all duration-300">
                  <Logo className="w-full h-auto" />
                </div>
              </Link>
            </div>

            {showRecruiterSidebar && location.pathname === '/recruiter/jobs' && (
              <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 sm:block">
                <h1 className="geist-caption font-medium text-white">
                  Recruiter Dashboard
                </h1>
              </div>
            )}

            {/* Centered Navigation */}
            <div className={showRecruiterSidebar ? 'hidden' : 'hidden xl:flex items-center justify-center flex-1 px-2'}>
              <div className="flex items-center bg-muted/70 rounded-full px-2 py-1.5 border border-border backdrop-blur-sm">
                {user && userProfile?.role === 'admin' ? (
                  <Link to="/admin" className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${isActive('/admin') ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5'}`}>
                    Admin Dashboard
                  </Link>
                ) : userProfile?.role === 'recruiter' ? (
                  <>
                    <Link to="/recruiter/jobs" className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${isActive('/recruiter/jobs') ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5'}`}>
                      Dashboard
                    </Link>
                    <Link to="/recruiter/interviews" className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${isActive('/recruiter/interviews') ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5'}`}>
                      My Interviews
                    </Link>
                    <Link to="/recruiter/interview/create" className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${isActive('/recruiter/interview/create') ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5'}`}>
                      Create Job
                    </Link>
                    <Link to="/recruiter/tests" className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${isActive('/recruiter/tests') ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5'}`}>
                      Assessments
                    </Link>
                  </>
                ) : (
                  <Link to="/" className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${isActive('/') ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5'}`}>
                    Portal
                  </Link>
                )}
              </div>
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center gap-2">
              {user ? (
                <>
                  {userProfile?.role === 'recruiter' && (
                    <button
                      type="button"
                      onClick={() => setIsWaModalOpen(true)}
                      title={
                        userProfile?.whatsappSessionId && userProfile?.whatsappSessionPasscode
                          ? "WhatsApp API Connected (Active) — Click to manage credentials"
                          : "WhatsApp Disconnected — Click to connect session ID & passcode"
                      }
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                        userProfile?.whatsappSessionId && userProfile?.whatsappSessionPasscode
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                          : "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20 animate-pulse"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${
                        userProfile?.whatsappSessionId && userProfile?.whatsappSessionPasscode
                          ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                          : "bg-amber-400"
                      }`} />
                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                        <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.964 9.964 0 001.333 4.993L2 22l5.233-1.237a9.96 9.96 0 004.779 1.221h.004c5.505 0 9.988-4.478 9.989-9.984 0-2.669-1.038-5.178-2.925-7.064A9.927 9.927 0 0012.012 2z" />
                      </svg>
                      <span className="hidden sm:inline">
                        {userProfile?.whatsappSessionId && userProfile?.whatsappSessionPasscode
                          ? "WA Connected"
                          : "Connect WA"}
                      </span>
                    </button>
                  )}
                  <NotificationCenter />
                </>
              ) : !authLoading ? (
                <Link to="/auth" className="geist-caption saas-btn-primary inline-flex items-center justify-center rounded-[6px] px-3 py-1.5 font-medium">
                  Sign In
                </Link>
              ) : (
                <div className="h-8 w-8" aria-hidden="true" />
              )}

              {/* ConnectionStatus moved to dropdown */}

              {/* Profile Dropdown */}
              {user && !userProfile && showRecruiterSidebar && (
                <div className="hidden md:flex h-8 items-center gap-2 border-l border-white/10 pl-2">
                  <div className="hidden space-y-1 lg:block">
                    <div className="h-3 w-20 animate-pulse rounded-[3px] bg-white/[0.14]" />
                    <div className="ml-auto h-2.5 w-12 animate-pulse rounded-[3px] bg-white/[0.1]" />
                  </div>
                  <div className="h-8 w-8 animate-pulse rounded-full border border-white/20 bg-white/[0.08]" />
                </div>
              )}

              {user && userProfile && (
                <div className="hidden md:flex relative group h-8 items-center gap-2 border-l border-white/10 pl-2">
                  <div className="flex items-center gap-2 cursor-pointer">
                    <div className="text-right hidden lg:block">
                    <p className={`geist-caption font-medium leading-none ${showRecruiterSidebar ? 'text-white' : 'text-gray-700 dark:text-white'}`}>{userProfile?.fullname || 'User'}</p>
                      <p className="geist-label mt-0.5 text-[10px] uppercase text-gray-500">{userProfile?.role || 'Guest'}</p>
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-[#111] p-0.5 transition-colors group-hover:border-white/40">
                      <img
                        src={userProfile?.profilePhotoURL || `https://ui-avatars.com/api/?name=${userProfile?.fullname?.replace(/\s/g, '+') || 'User'}&background=random&color=fff`}
                        alt="Avatar"
                        className="w-full h-full rounded-full object-cover"
                      />
                    </div>
                  </div>

                  {/* Dropdown Menu */}
                  <div className="absolute top-full right-0 mt-4 w-72 bg-popover text-popover-foreground rounded-xl shadow-2xl border border-border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 transform group-hover:translate-y-0 translate-y-2">
                    <div className="p-5 border-b border-border bg-muted rounded-t-xl">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full p-0.5 border border-gray-200 dark:border-white/10">
                          <img
                            src={userProfile?.profilePhotoURL || `https://ui-avatars.com/api/?name=${userProfile?.fullname?.replace(/\s/g, '+')}&background=random&color=fff`}
                            alt="Avatar"
                            className="w-full h-full rounded-full object-cover"
                          />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 dark:text-white text-base">{userProfile?.fullname}</p>
                          <p className="text-xs text-gray-400 truncate max-w-[140px]">{userProfile?.email}</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-2 space-y-1">
                      <Link to="/profile" className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 hover:text-black dark:hover:text-white transition-colors">
                        <i className="fas fa-user-circle w-5 text-center text-gray-500"></i> View Profile
                      </Link>
                      <button onClick={handleLogout} className="flex items-center gap-3 w-full text-left px-3 py-2.5 text-sm text-red-500 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300 transition-colors">
                        <i className="fa-solid fa-right-from-bracket w-5 text-center"></i> Sign Out
                      </button>
                    </div>
                    <div className="p-3 border-t border-border flex justify-between items-center bg-muted rounded-b-xl">
                      <div className="flex items-center gap-1 bg-secondary rounded-lg p-1 border border-border">
                        <button
                          onClick={() => setTheme('light')}
                          className={`p-1.5 rounded-md transition-all ${theme === 'light' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                          title="Light"
                        >
                          <Sun size={14} />
                        </button>
                        <button
                          onClick={() => setTheme('dark')}
                          className={`p-1.5 rounded-md transition-all ${theme === 'dark' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                          title="Dark"
                        >
                          <Moon size={14} />
                        </button>
                        <button
                          onClick={() => setTheme('system')}
                          className={`p-1.5 rounded-md transition-all ${theme === 'system' ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30' : 'text-gray-500 hover:text-gray-300'}`}
                          title="System"
                        >
                          <Monitor size={14} />
                        </button>
                      </div>
                      <ConnectionStatus />
                    </div>
                  </div>
                </div>
              )}

              {/* Mobile Menu Button */}
              <div className="flex xl:hidden items-center">
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="inline-flex items-center justify-center rounded-[6px] p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none dark:hover:bg-white/5 dark:hover:text-white"
                >
                  <Menu size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex w-full flex-1">
        {showRecruiterSidebar && (
          <div className="sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 xl:flex">
            <DashboardSidebar
              activePath={location.pathname}
              onNavigate={navigateFromSidebar}
            />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <main className={`workspace-card flex-grow w-full mx-auto relative ${isRecruiterPath ? 'recruiter-workspace' : ''} ${isRecruiterDashboard ? 'max-w-none p-0' : `px-4 sm:px-6 lg:px-8 py-8 ${showRecruiterSidebar ? 'max-w-none' : 'max-w-7xl'}`}`}>
            {children}
          </main>

          <footer className={`z-10 mt-auto border-t backdrop-blur-sm ${isRecruiterPath ? 'recruiter-footer' : ''} ${showRecruiterSidebar ? 'border-white/[0.11] bg-[#000] text-white' : 'border-border bg-background/90'}`}>
            <div className={`${showRecruiterSidebar ? 'w-full' : 'max-w-7xl mx-auto'} px-3 sm:px-4 lg:px-5`}>
          <div className="flex min-h-14 flex-col items-center justify-between gap-3 py-3 md:flex-row">
            <div className="flex items-center gap-2 opacity-70 transition-opacity hover:opacity-100">
              <Logo className="w-[108px] sm:w-[124px] h-auto" />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <Link to="/contact" className={`geist-small group inline-flex h-8 items-center gap-1.5 rounded-[6px] border px-2.5 font-medium transition-colors ${showRecruiterSidebar ? 'border-white/[0.11] bg-transparent text-[#8f8f8f] hover:bg-white/[0.05] hover:text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:border-white/10 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white'}`}>
                <Mail size={13} />
                <span>Contact Us</span>
              </Link>
              <Link to="/report-bug" className={`geist-small group inline-flex h-8 items-center gap-1.5 rounded-[6px] border px-2.5 font-medium transition-colors ${showRecruiterSidebar ? 'border-white/[0.11] bg-transparent text-[#8f8f8f] hover:bg-white/[0.05] hover:text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:border-white/10 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white'}`}>
                <Bug size={13} />
                <span>Report Bug</span>
              </Link>
              <Link to="/reviews" className={`geist-small group inline-flex h-8 items-center gap-1.5 rounded-[6px] border px-2.5 font-medium transition-colors ${showRecruiterSidebar ? 'border-white/[0.11] bg-transparent text-[#8f8f8f] hover:bg-white/[0.05] hover:text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:border-white/10 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white'}`}>
                <MessageSquare size={13} />
                <span>Reviews</span>
              </Link>
            </div>

            <div className={`geist-small text-center font-medium md:text-right ${showRecruiterSidebar ? 'text-[#6b7280]' : 'text-gray-400 dark:text-gray-600'}`}>
              <div>&copy; 2026 InterviewXpert Inc.</div>
              <div className="text-[10px] opacity-75">Developed by <a href="https://snab.co.in" target="_blank" rel="noopener noreferrer" className={showRecruiterSidebar ? 'text-[#a1a1a1] hover:text-white' : 'text-primary hover:underline'}>SNAB Innovations</a></div>
            </div>
          </div>
            </div>
          </footer>
        </div>
      </div>

      {/* Mobile Menu Overlay & Sidebar */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[200] xl:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Sidebar */}
          {showRecruiterSidebar ? (
            <div className="recruiter-mobile-sidebar fixed inset-y-0 left-0 flex w-[220px] flex-col border-r border-white/[0.11] bg-[#000] text-white shadow-2xl">
              <DashboardSidebar
                className="w-[220px] border-none bg-[#000]"
                activePath={location.pathname}
                onNavigate={navigateFromSidebar}
              />
            </div>
          ) : (
          <div className="fixed inset-y-0 right-0 w-[280px] bg-popover text-popover-foreground border-l border-border shadow-2xl transform transition-transform duration-300 ease-in-out animate-in slide-in-from-right flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="font-bold text-lg text-gray-900 dark:text-white">Menu</span>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto py-4 px-4 space-y-6">
              {/* Links */}
              <div className="space-y-1">
                {user && userProfile?.role === 'admin' ? (
                  <Link to="/admin" onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${isActive('/admin') ? 'bg-primary/10 text-primary' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'}`}>
                    <i className="fas fa-shield-alt w-5 text-center"></i> Admin Dashboard
                  </Link>
                ) : userProfile?.role === 'recruiter' ? (
                  <>
                    <Link to="/recruiter/jobs" onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${isActive('/recruiter/jobs') ? 'bg-primary/10 text-primary' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'}`}><i className="fas fa-columns w-5 text-center"></i> Dashboard</Link>
                    <Link to="/recruiter/interviews" onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${isActive('/recruiter/interviews') ? 'bg-primary/10 text-primary' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'}`}><i className="fas fa-video w-5 text-center"></i> My Interviews</Link>
                    <Link to="/recruiter/resume-dump" onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${isActive('/recruiter/resume-dump') ? 'bg-primary/10 text-primary' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'}`}><i className="fas fa-archive w-5 text-center"></i> Resume Dump</Link>
                    <Link to="/recruiter/interview/create" onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${isActive('/recruiter/interview/create') ? 'bg-primary/10 text-primary' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'}`}><i className="fas fa-video w-5 text-center"></i> Create Interview</Link>
                    <Link to="/recruiter/tests" onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${isActive('/recruiter/tests') ? 'bg-primary/10 text-primary' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'}`}><i className="fas fa-clipboard-list w-5 text-center"></i> Assessments</Link>
                  </>
                ) : (
                  <>
                    <Link to="/" onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${isActive('/') ? 'bg-primary/10 text-primary' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'}`}><i className="fas fa-home w-5 text-center"></i> Portal</Link>
                  </>
                )}
              </div>

              {/* Divider */}
              {user && <div className="h-px bg-border my-2" />}

              {/* User Section */}
              {user && (
                <div className="space-y-4">
                  {/* Profile Link */}
                  <Link to="/profile" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group">
                    <img className="h-10 w-10 rounded-full object-cover border border-gray-200 dark:border-white/10 group-hover:border-primary/50 transition-colors" src={userProfile?.profilePhotoURL || `https://ui-avatars.com/api/?name=${userProfile?.fullname?.replace(/\s/g, '+')}&background=random&color=fff`} alt="" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-gray-900 dark:text-white truncate group-hover:text-primary transition-colors">{userProfile?.fullname}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{userProfile?.email}</div>
                    </div>
                  </Link>

                  {/* Theme */}
                  <div className="bg-muted p-1 rounded-xl flex">
                    <button
                      onClick={() => setTheme('light')}
                      className={`flex-1 p-2 rounded-lg transition-all flex items-center justify-center gap-2 text-xs font-medium ${theme === 'light' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                      title="Light"
                    >
                      <Sun size={14} /> Light
                    </button>
                    <button onClick={() => setTheme('dark')} className={`flex-1 p-2 rounded-lg transition-all flex items-center justify-center gap-2 text-xs font-medium ${theme === 'dark' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>
                      <Moon size={14} /> Dark
                    </button>
                    <button onClick={() => setTheme('system')} className={`flex-1 p-2 rounded-lg transition-all flex items-center justify-center gap-2 text-xs font-medium ${theme === 'system' ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}>
                      <Monitor size={14} /> Auto
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {user ? (
              <div className="p-4 border-t border-border">
                <button onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }} className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 font-medium text-sm transition-colors">
                  <i className="fas fa-sign-out-alt"></i> Sign Out
                </button>
              </div>
            ) : (
              <div className="p-4 border-t border-border space-y-3">
                <Link to="/auth" onClick={() => setIsMobileMenuOpen(false)} className="block w-full py-3 text-center rounded-xl bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white font-medium text-sm hover:bg-gray-200 dark:hover:bg-white/20 transition-colors">Log In</Link>
                <Link to="/auth" onClick={() => setIsMobileMenuOpen(false)} className="block w-full py-3 text-center rounded-xl bg-primary text-white font-medium text-sm shadow-lg shadow-primary/20 hover:bg-primary-dark transition-colors">Get Started</Link>
              </div>
            )}
          </div>
          )}
        </div>
      )}
      <WhatsAppCredentialsModal
        isOpen={isWaModalOpen}
        onClose={() => setIsWaModalOpen(false)}
      />
    </div>
  );
};

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <LayoutContent>{children}</LayoutContent>
);

export default Layout;
