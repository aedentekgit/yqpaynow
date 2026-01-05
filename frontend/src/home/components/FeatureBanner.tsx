import React, { useEffect, useRef, useState } from 'react';

export const FeatureBanner: React.FC = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (!sectionRef.current) return;
      const rect = sectionRef.current.getBoundingClientRect();
      const speed = 0.3;

      if (rect.top <= window.innerHeight && rect.bottom >= 0) {
        setOffset(rect.top * speed);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <section ref={sectionRef} className="relative py-32 md:py-48 flex items-center justify-center overflow-hidden bg-black">
      {/* Background Image with Parallax */}
      <div className="absolute inset-0 overflow-hidden z-0">
        <div
          className="absolute inset-0 w-full h-[140%] -top-[20%] will-change-transform transition-transform duration-75 ease-out"
          style={{ transform: `translate3d(0, ${offset}px, 0)` }}
        >
          {/* Dark theater aisle image */}
          <img
            src="https://images.unsplash.com/photo-1478720568477-152d9b164e63?auto=format&fit=crop&w=2000&q=80"
            alt="Dark Theater Aisle"
            className="w-full h-full object-cover opacity-50"
          />
        </div>

        {/* Heavy dark overlays for text contrast */}
        <div className="absolute inset-0 bg-gradient-to-b from-black via-black/50 to-black"></div>
        <div className="absolute inset-0 bg-black/40"></div>
      </div>

      <div className="relative z-10 text-center px-6 max-w-7xl mx-auto flex flex-col items-center">
        {/* Main Typography */}
        <div className="flex flex-col items-center leading-[0.9]">
          <h2 className="text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter text-white mb-2">
            Experience.
          </h2>
          <h2 className="text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter text-white mb-10">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-purple to-brand-orange">Explore.</span> Enjoy.
          </h2>
        </div>

        {/* Decorative Pill Bar */}
        <div className="w-24 h-1.5 bg-gradient-to-r from-brand-purple to-brand-orange rounded-full mb-10"></div>

        {/* Subtitle */}
        <p className="text-lg md:text-xl text-gray-300 max-w-xl font-light leading-relaxed tracking-wide opacity-90">
          Immerse yourself in a seamless world of entertainment where technology meets comfort.
        </p>
      </div>
    </section>
  );
};