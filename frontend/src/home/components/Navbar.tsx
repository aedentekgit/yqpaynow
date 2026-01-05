import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Button } from './ui/Button';
import logoImg from '../images/logo4.png';

export const Navbar: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Logo Image
  const logoSrc = logoImg;

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-white/95 backdrop-blur-md shadow-[0_4px_12px_-2px_rgba(0,0,0,0.15)] ${isScrolled ? 'py-2' : 'py-4'}`}>
      <div className="max-w-7xl mx-auto px-4 md:px-6 flex items-center justify-between">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2 group cursor-pointer">
          <img
            src={logoSrc}
            alt="YQ Pay Logo"
            className="h-10 md:h-14 w-auto transition-transform duration-300 group-hover:scale-105"
          />
        </a>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-gray-900 hover:text-brand-purple transition-colors text-sm font-medium">Features</a>
          <a href="#better-experience" className="text-gray-900 hover:text-brand-purple transition-colors text-sm font-medium">Better Experience</a>
          <a href="#how-it-works" className="text-gray-900 hover:text-brand-purple transition-colors text-sm font-medium">How it Works</a>
          <Link to="/login">
            <Button variant="primary" className="!px-5 !py-2">Login</Button>
          </Link>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="md:hidden text-gray-900"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-white/95 backdrop-blur-xl border-b border-gray-200 p-6 flex flex-col gap-4 shadow-2xl">
          <a href="#features" onClick={() => setMobileMenuOpen(false)} className="text-lg text-gray-900 py-2">Features</a>
          <a href="#better-experience" onClick={() => setMobileMenuOpen(false)} className="text-lg text-gray-900 py-2">Better Experience</a>
          <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="text-lg text-gray-900 py-2">How it Works</a>
          <Link to="/login">
            <Button variant="primary" className="w-full">Login</Button>
          </Link>
        </div>
      )}
    </nav>
  );
};