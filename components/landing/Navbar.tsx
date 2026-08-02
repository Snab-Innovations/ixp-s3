import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, useScroll, useMotionValueEvent, AnimatePresence } from 'framer-motion';
import { Menu, X, Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import Logo from '../Logo';
import MagnetButton from './MagnetButton';

const Navbar: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { scrollY } = useScroll();
  const { toggleTheme, isDark } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const isHomePage = location.pathname === '/';

  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > 50);
  });

  const navLinks = [
    { name: "Jobs", href: "/jobs", isRoute: true },
    { name: "Features", href: "#features" },
    { name: "How it Works", href: "#process" },
    { name: "Pricing", href: "#pricing" },
    { name: "FAQ", href: "#faq" },
    { name: "Blogs", href: "/blogs", isRoute: true },
    { name: "Career Hub", href: "/career-hub", isRoute: true },
  ];

  const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setIsMobileMenuOpen(false);

    if (isHomePage) {
      const targetId = href.replace('#', '');
      const element = document.getElementById(targetId);
      if (element) {
        const offset = 80; // Navbar height adjustment
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.scrollY - offset;
        window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
      }
    } else {
      navigate(`/${href}`);
    }
  };

  return (
    <>
      <motion.nav
        className={`fixed top-0 inset-x-0 z-50 flex justify-center transition-all duration-500 ${isScrolled ? 'pt-2 px-4 md:px-6' : 'pt-4 md:pt-6 px-4 md:px-6'}`}
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        <div
          className={`
            relative flex items-center justify-between rounded-full transition-all duration-500 border
            ${isScrolled
              ? isDark
                ? 'w-full max-w-[90%] md:max-w-6xl py-2 px-4 md:px-6 bg-black/80 backdrop-blur-md border-white/10 shadow-2xl shadow-indigo-500/10'
                : 'w-full max-w-[90%] md:max-w-6xl py-2 px-4 md:px-6 bg-white/80 backdrop-blur-md border-slate-200 shadow-xl shadow-slate-200/50'
              : 'w-full max-w-7xl py-3 px-4 md:px-6 bg-transparent border-transparent'
            }
          `}
        >
          {/* Logo */}
          <Link to="/" className="flex items-center shrink-0">
            <Logo className={`transition-all duration-500 ${isScrolled ? 'w-[128px] md:w-[148px] h-auto' : 'w-[144px] md:w-[172px] h-auto'}`} isDark={isDark} />
          </Link>

          {/* Desktop Links */}
          <div className="hidden lg:flex items-center gap-4 xl:gap-8 absolute left-1/2 -translate-x-1/2">
            {navLinks.map((link) => (
              link.isRoute ? (
                <Link
                  key={link.name}
                  to={link.href}
                  className={`text-[13px] xl:text-sm font-medium transition-colors whitespace-nowrap ${isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {link.name}
                </Link>
              ) : (
                <a
                  key={link.name}
                  href={isHomePage ? link.href : `/${link.href}`}
                  onClick={(e) => handleScroll(e, link.href)}
                  className={`text-[13px] xl:text-sm font-medium transition-colors whitespace-nowrap ${isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {link.name}
                </a>
              )
            ))}
          </div>

          {/* CTAs */}
          <div className="hidden lg:flex items-center gap-4">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-full transition-all duration-300 ${isDark
                ? 'bg-slate-800 hover:bg-slate-700 text-yellow-400'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              aria-label="Toggle theme"
            >
              <motion.div
                initial={false}
                animate={{ rotate: isDark ? 0 : 180, scale: [1, 0.8, 1] }}
                transition={{ duration: 0.3 }}
              >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
              </motion.div>
            </button>
            <Link to="/auth" className={`text-sm font-medium ${isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}>Log in</Link>
            <Link to="/auth">
              <MagnetButton variant="primary" className="!px-4 !py-2 !text-sm">
                Get Started
              </MagnetButton>
            </Link>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="lg:hidden flex items-center gap-2">
            {/* Mobile Theme Toggle */}
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-full transition-all duration-300 ${isDark
                ? 'bg-slate-800 hover:bg-slate-700 text-yellow-400'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className={`p-1 ${isDark ? 'text-white' : 'text-slate-900'}`}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
      {isMobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={`fixed inset-0 z-40 pt-24 px-6 lg:hidden ${isDark ? 'bg-slate-950/95' : 'bg-white/95 backdrop-blur-md'}`}
        >
          <div className="flex flex-col gap-6">
            {navLinks.map((link) => (
              link.isRoute ? (
                <Link
                  key={link.name}
                  to={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`text-2xl font-display font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}
                >
                  {link.name}
                </Link>
              ) : (
                <a
                  key={link.name}
                  href={isHomePage ? link.href : `/${link.href}`}
                  onClick={(e) => handleScroll(e, link.href)}
                  className={`text-2xl font-display font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}
                >
                  {link.name}
                </a>
              )
            ))}
            <div className={`h-px my-4 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
            <Link to="/auth" className={`text-xl font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Log in</Link>
            <Link to="/auth">
              <MagnetButton variant="primary" className="w-full justify-center py-3">
                Get Started
              </MagnetButton>
            </Link>
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;
