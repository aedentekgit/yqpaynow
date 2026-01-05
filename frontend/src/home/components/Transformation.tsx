import React from 'react';
import { Button } from './ui/Button';
import imageA from '../images/A.jpg';

export const Transformation: React.FC = () => {
  return (
    <section className="py-24 bg-gray-50 overflow-hidden text-left">
      <div className="max-w-7xl mx-auto px-6">
        <div className="relative rounded-3xl overflow-hidden bg-white border border-gray-200">
          <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-brand-purple rounded-full border-4 border-white flex items-center justify-center z-10">
            <div className="w-2 h-2 bg-white rounded-full"></div>
          </div>
          <div className="grid lg:grid-cols-2">

            {/* Image Side */}
            <div className="relative h-80 lg:h-auto overflow-hidden">
              {/* Gradients blending to white/container bg */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/10 z-10 lg:block hidden"></div>
              <img
                src={imageA}
                alt="Cinema Screen"
                className="w-full h-full object-cover transform hover:scale-105 transition-transform duration-1000"
              />
            </div>

            {/* Content Side */}
            <div className="p-10 md:p-16 flex flex-col justify-center items-start space-y-8 relative z-20 bg-white">
              <h2 className="text-3xl md:text-5xl font-bold leading-tight text-gray-900">
                Transform your <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-purple to-brand-orange">cinema experience</span> <br />
                today.
              </h2>
              <p className="text-gray-600 text-lg max-w-md">
                Join the revolution in theater dining. Increase efficiency, reduce wait times, and delight your customers with YQ Pay.
              </p>
              <button 
                onClick={() => window.location.href = "#"}
                className="w-fit px-8 py-4 rounded-2xl bg-gray-900 hover:bg-black text-white font-bold transition-all duration-300 flex items-center gap-3 group/btn hover:-translate-y-1 relative overflow-hidden"
              >
              <span className="relative z-10">Get Started</span>
              <span className="group-hover/btn:translate-x-1 transition-transform relative z-10">→</span>
              <div className="absolute inset-0 bg-gradient-to-r from-brand-purple to-brand-orange opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"></div>
            </button>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
};