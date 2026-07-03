import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationCenter from './NotificationCenter';
import { signOut } from 'firebase/auth';
import { auth } from '../services/firebase';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon, Menu, X, Monitor, Mail, Bug, MessageSquare } from 'lucide-react';
import ConnectionStatus from './ConnectionStatus';
import Logo from './Logo';
import DashboardSidebar from './ui/dashboard-sidebar';



const LayoutContent: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const { theme, setTheme } = useTheme();

  // Force Dark Mode for this theme update if desired, but respecting user toggle for now.
  // Ideally for "Black Dignity" we default to dark or design the light mode to be very minimal too.

  const isActive = (path: string) => location.pathname === path;
  const showRecruiterSidebar = Boolean(user && userProfile?.role === 'recruiter');
  const navigateFromSidebar = (href: string) => {
    navigate(href);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 selection:text-foreground flex flex-col transition-colors duration-300">
      {/* Background wash */}
      <div className="fixed inset-0 z-[-1] bg-background pointer-events-none transition-colors duration-300" />

      {/* Tech Grid Pattern - subtle texture */}
      <div className="fixed inset-0 z-[-1] pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)',
          backgroundSize: '30px 30px'
        }}>
      </div>

      <nav className="bg-background/80 dark:bg-background/90 backdrop-blur-xl border-b border-border sticky top-0 z-40 transition-all duration-300">
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">

            {/* Logo Area */}
            <div className="flex-shrink-0 flex items-center">
              <Link to="/" className="flex items-center group">
                <div className="w-[132px] sm:w-[164px] flex items-center justify-center transition-all duration-300">
                  <Logo className="w-full h-auto" />
                </div>
              </Link>
            </div>

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
                      Create Interview
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
            <div className="flex items-center gap-3">
              {user ? (
                <>


                  <NotificationCenter />
                </>
              ) : (
                <Link to="/auth" className="saas-btn-primary inline-flex items-center justify-center px-5 py-2 rounded-full font-bold text-sm">
                  Sign In
                </Link>
              )}

              {/* ConnectionStatus moved to dropdown */}

              {/* Profile Dropdown */}
              {user && (
                <div className="hidden md:flex relative group items-center gap-3 pl-3 ml-1 h-9 border-l border-white/10">
                  <div className="flex items-center gap-3 cursor-pointer">
                    <div className="text-right hidden lg:block">
                      <p className="text-sm font-semibold text-gray-700 dark:text-white leading-none">{userProfile?.fullname || 'User'}</p>
                      <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mt-0.5">{userProfile?.role || 'Guest'}</p>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-white/20 p-0.5 flex items-center justify-center group-hover:border-primary/50 transition-colors">
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
                  className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 focus:outline-none transition-colors"
                >
                  <Menu size={24} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex w-full flex-1">
        {showRecruiterSidebar && (
          <div className="sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 xl:flex">
            <DashboardSidebar
              activePath={location.pathname}
              onNavigate={navigateFromSidebar}
            />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <main className={`workspace-card flex-grow w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 relative ${showRecruiterSidebar ? 'max-w-none' : 'max-w-7xl'}`}>
            {children}
          </main>

          <footer className="border-t border-border bg-background/80 backdrop-blur-sm py-8 mt-auto z-10">
            <div className={`${showRecruiterSidebar ? 'w-full' : 'max-w-7xl mx-auto'} px-4 sm:px-6 lg:px-8`}>
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
              <Logo className="w-[124px] sm:w-[148px] h-auto" />
            </div>

            <div className="flex items-center gap-3">
              <Link to="/contact" className="group flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-white/5 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all border border-gray-200 dark:border-white/10 hover:border-blue-200 dark:hover:border-blue-800 shadow-sm hover:shadow-md">
                <Mail size={14} className="group-hover:scale-110 transition-transform" />
                <span>Contact Us</span>
              </Link>
              <Link to="/report-bug" className="group flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-white/5 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-all border border-gray-200 dark:border-white/10 hover:border-red-200 dark:hover:border-red-800 shadow-sm hover:shadow-md">
                <Bug size={14} className="group-hover:scale-110 transition-transform" />
                <span>Report Bug</span>
              </Link>
              <Link to="/reviews" className="group flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-white/5 hover:bg-purple-50 dark:hover:bg-purple-900/20 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-all border border-gray-200 dark:border-white/10 hover:border-purple-200 dark:hover:border-purple-800 shadow-sm hover:shadow-md">
                <MessageSquare size={14} className="group-hover:scale-110 transition-transform" />
                <span>Reviews</span>
              </Link>
            </div>

            <div className="text-xs text-gray-400 dark:text-gray-600 font-medium text-center md:text-right">
              <div>&copy; 2026 InterviewXpert Inc.</div>
              <div className="text-[10px] opacity-75 mt-0.5">Developed by <a href="https://snab.co.in" target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">SNAB Innovations</a></div>
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
            <div className="fixed inset-y-0 left-0 flex w-[238px] flex-col bg-popover text-popover-foreground shadow-2xl">
              <DashboardSidebar
                className="w-[238px] border-none bg-popover"
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
                    <button onClick={() => setTheme('light')} className={`flex-1 p-2 rounded-lg transition-all flex items-center justify-center gap-2 text-xs font-medium ${theme === 'light' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>
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
    </div>
  );
};

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <LayoutContent>{children}</LayoutContent>
);

export default Layout;
