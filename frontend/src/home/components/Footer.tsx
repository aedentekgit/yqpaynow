import React from 'react';
import { Twitter, Facebook, Instagram, Linkedin, Send } from 'lucide-react';
import logoImg from '../images/logo4.png';

export const Footer: React.FC = () => {
  // Logo Image
  const logoSrc = logoImg;

  return (
    <footer className="bg-gray-50 pt-20 pb-10 border-t border-gray-200">
      <div className="max-w-7xl mx-auto px-6" >

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">

          {/* Brand */}
          <div className="space-y-6 text-left">
            <a href="#" className="block">
              <img
                src={logoSrc}
                alt="YQ Pay Logo"
                className="h-10 md:h-14 w-auto transition-transform duration-300 group-hover:scale-105"
              />            </a>
            <p className="text-gray-900 text-sm leading-relaxed">
              Revolutionizing the theater dining experience, one seat at a time.
            </p>
          </div>

          {/* Links 1 */}
          <div className="text-left">
            <h4 className="font-bold text-gray-900 mb-6 ">Useful Links</h4>
            <ul className="space-y-4 text-sm text-gray-900">
              <li><a href="#" className="hover:text-brand-purple transition-colors">Home</a></li>
              <li><a href="#features" className="hover:text-brand-purple transition-colors">Features</a></li>
              <li><a href="#better-experience" className="hover:text-brand-purple transition-colors">Better Experience</a></li>
              <li><a href="#how-it-works" className="hover:text-brand-purple transition-colors">How it Works</a></li>
            </ul>
          </div>

          {/* Links 2 */}
          <div className="text-left">
            <h4 className="font-bold text-gray-900 mb-6">Support</h4>
            <ul className="space-y-4 text-sm text-gray-900">
              <li><a href="#" className="hover:text-brand-purple transition-colors">Help Center</a></li>
              <li><a href="#" className="hover:text-brand-purple transition-colors">Contact Us</a></li>
              <li><a href="#" className="hover:text-brand-purple transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-brand-purple transition-colors">Terms of Service</a></li>
            </ul>
          </div>

          {/* Newsletter */}
          <div className="text-left">
            <h4 className="font-bold text-gray-900 mb-6">Subscribe Now</h4>
            <p className="text-gray-900 text-sm mb-4">Don't miss out on the latest updates.</p>
            <div className="flex items-center bg-white rounded-lg border border-gray-300 p-1">
              <input
                type="email"
                placeholder="Enter your email"
                className="bg-transparent border-none outline-none text-gray-900 text-sm px-3 w-full placeholder-gray-400"
              />
              <button className="bg-brand-purple hover:bg-purple-900 p-2 rounded-md transition-colors">
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-gray-900 text-sm">© 2025 YQ Pay. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-gray-400 hover:text-brand-purple transition-colors"><Twitter className="w-5 h-5" /></a>
            <a href="#" className="text-gray-400 hover:text-brand-purple transition-colors"><Facebook className="w-5 h-5" /></a>
            <a href="#" className="text-gray-400 hover:text-brand-purple transition-colors"><Instagram className="w-5 h-5" /></a>
            <a href="#" className="text-gray-400 hover:text-brand-purple transition-colors"><Linkedin className="w-5 h-5" /></a>
          </div>
        </div>

      </div>
    </footer>
  );
};