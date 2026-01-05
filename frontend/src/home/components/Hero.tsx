import React from 'react';
import { Button } from './ui/Button';
import { ChevronRight } from 'lucide-react';
import qrCode from '../images/qr-code.png';

export const Hero: React.FC = () => {

  return (
    <section className="relative min-h-screen flex items-center pt-24 pb-12 overflow-hidden bg-white">

      {/* Background Gradients */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-purple/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-brand-orange/10 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center relative z-10">

        {/* Left Content */}
        <div className="space-y-8 animate-fade-in-up text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-purple/5 border border-brand-purple/20">
            <span className="w-2 h-2 rounded-full bg-brand-purple animate-pulse"></span>
            <span className="text-brand-purple text-xs font-bold tracking-widest uppercase ">Welcome to YQ Pay</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 tracking-tight leading-tight mb-6 text-left">
          Real-Time Ordering with <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-purple to-brand-orange">QR Scan Experience</span>
          </h1>

          <p className="text-lg md:text-xl text-gray-600 max-w-xl leading-relaxed text-left">
            Turn every seat into a food counter. With YQ Pay, your customers scan a QR code, explore the digital menu, and order instantly.
          </p>

          {/* <div className="flex flex-col sm:flex-row gap-4">
            <Button className="group">
              Book a Demo
              <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button variant="outline">Learn More</Button>
          </div> */}
        </div>

        {/* Right Content - 3D Illustration Mockup */}
        <div className="relative flex justify-center items-center perspective-1000">
          <div className="relative w-full max-w-md aspect-square animate-float">
            {/* Decorative Circles */}
            <div className="absolute inset-0 border border-brand-purple/20 rounded-full animate-spin-slow"></div>
            <div className="absolute inset-12 border border-brand-orange/20 rounded-full animate-reverse-spin"></div>

            {/* Central 3D Element Video */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-64 h-64 md:w-80 md:h-80 bg-gray-900 border-4 border-white rounded-3xl transform rotate-y-12 rotate-x-12 flex items-center justify-center overflow-hidden">
                <div className="relative w-full h-full bg-white p-4">
                  <img
                    src={qrCode}
                    alt="QR Code"
                    className="w-full h-full object-contain"
                  />
                  {/* Scanning Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-brand-purple/20 to-transparent animate-scan pointer-events-none"></div>
                  <div className="absolute inset-0 border-2 border-brand-purple/30 rounded-xl pointer-events-none"></div>
                </div>

                {/* Floating elements */}
                <div className="absolute -top-10 -right-10 w-20 h-20 bg-brand-orange rounded-lg blur-2xl opacity-30"></div>
                <div className="absolute -bottom-10 -left-10 w-20 h-20 bg-brand-purple rounded-lg blur-2xl opacity-30"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};