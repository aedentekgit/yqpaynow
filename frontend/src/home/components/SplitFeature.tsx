import React, { useEffect, useRef, useState } from 'react';
import { Smartphone, Zap, ArrowRight } from 'lucide-react';
import image3 from '../images/3.png';

export const SplitFeature: React.FC = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (!sectionRef.current) return;
      const rect = sectionRef.current.getBoundingClientRect();
      const speed = 0.08; // Subtle parallax speed

      // Calculate offset based on element position relative to viewport center
      if (rect.top <= window.innerHeight && rect.bottom >= 0) {
        const centerY = window.innerHeight / 2;
        const elementY = rect.top + (rect.height / 2);
        const distanceFromCenter = elementY - centerY;

        setOffset(distanceFromCenter * speed);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <section ref={sectionRef} className="py-24 bg-gray-50 overflow-hidden text-left">
      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">

        {/* Image Side with Parallax */}
        <div className="relative order-2 lg:order-1">
          <div className="absolute -inset-4 bg-brand-purple/20 rounded-2xl blur-xl"></div>
          <div className="relative rounded-2xl overflow-hidden border border-gray-100 aspect-square lg:aspect-[4/3] group">
            {/* Parallax Image */}
            <div className="absolute inset-0 w-full h-full overflow-hidden">
              <img
                src={image3}
                alt="Scanning QR code to order"
                className="absolute inset-x-0 w-full h-[120%] object-cover -top-[10%] transition-transform duration-100 ease-out will-change-transform"
                style={{ transform: `translate3d(0, ${offset}px, 0)` }}
              />
            </div>

            {/* Overlay badge */}
            {/* Overlay badge */}
            <div className="absolute bottom-6 left-6 bg-white/90 backdrop-blur-md px-4 py-3 rounded-lg border border-white/20 flex items-center gap-3 z-10 hover:scale-105 transition-transform duration-300">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-purple/10 text-brand-purple font-medium text-sm">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-purple opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-purple"></span>
                </span>
                Scan & Order
              </div>
            </div>
          </div>
        </div>
        {/* Text Side */}
        <div className="order-1 lg:order-2 space-y-8">
          {/* <div className="inline-block p-3 rounded-xl bg-brand-purple/10 border border-brand-purple/20">
            <Smartphone className="w-8 h-8 text-brand-purple" />
          </div> */}

          <h2 className="text-4xl md:text-5xl font-bold leading-tight text-gray-900">
            Simply <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-purple to-brand-orange">scan, order & pay.</span>
          </h2>

          <p className="text-gray-600 text-lg leading-relaxed">
            Transforming cinemas into smart hubs. Our QR code ordering system ensures guests never miss a moment of the movie.
            No lines, no waiting, just seamless service delivered directly to their seat.
          </p>

          <ul className="space-y-4">
            {['Contactless ordering', 'Real-time menu updates', 'Secure payment processing'].map((item, i) => (
              <li key={i} className="flex items-center gap-3 text-gray-700">
                <div className="w-6 h-6 rounded-full bg-brand-purple/10 flex items-center justify-center">
                  <ArrowRight className="w-3 h-3 text-brand-purple" />
                </div>
                {item}
              </li>
            ))}
          </ul>
        </div>

      </div>
    </section>
  );
};