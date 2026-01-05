import React from 'react';
import { ScanLine, Utensils, CreditCard, Armchair } from 'lucide-react';

export const HowItWorks: React.FC = () => {
  const [activeStep, setActiveStep] = React.useState<number | null>(null);

  const steps = [
    {
      number: "01",
      icon: <ScanLine className="w-6 h-6 text-brand-purple" />,
      title: "Scan QR Code",
      description: "Find the code on your seat armrest."
    },
    {
      number: "02",
      icon: <Utensils className="w-6 h-6 text-brand-purple" />,
      title: "Browse Menu",
      description: "Explore delicious food & drinks."
    },
    {
      number: "03",
      icon: <CreditCard className="w-6 h-6 text-brand-purple" />,
      title: "Order & Pay",
      description: "Secure checkout in seconds."
    },
    {
      number: "04",
      icon: <Armchair className="w-6 h-6 text-brand-purple" />,
      title: "Enjoy Movie",
      description: "We deliver while you watch."
    }
  ];

  return (
    <section id="how-it-works" className="py-24 bg-gradient-to-br from-[#fff5f5] via-[#fffbfb] to-[#f3e8ff]">
      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-12 gap-12 lg:gap-20 items-center">

        {/* Left Content */}
        <div className="lg:col-span-5 space-y-8 text-left">
          <span className="text-brand-purple font-bold tracking-widest text-xs uppercase">Process</span>
          <h2 className="text-5xl md:text-7xl font-black text-gray-900 tracking-tight leading-[0.9]">
            How It <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-purple to-brand-orange">Works</span>
          </h2>
          <p className="text-gray-500 text-lg leading-relaxed max-w-sm">
            A simple 4-step process to elevate your movie-going experience. No lines, no waiting, just pure entertainment.
          </p>

          {/* Decorative Progress Bar */}
          <div className="w-32 h-2 rounded-full bg-gray-200/60 overflow-hidden">
            <div className="w-1/2 h-full bg-gradient-to-r from-brand-purple to-brand-orange rounded-full"></div>
          </div>
        </div>

        {/* Right Grid */}
        <div className="lg:col-span-7 grid sm:grid-cols-2 gap-6 text-left">
          {steps.map((step, index) => (
            <div
              key={index}
              className="bg-white p-8 rounded-[2rem] border border-brand-purple/10 hover:-translate-y-2 transition-transform duration-300 relative overflow-hidden group"
              onMouseEnter={() => setActiveStep(index)}
              onMouseLeave={() => setActiveStep(null)}
            >
              {/* Background Number */}
              <span className="absolute top-2 right-6 text-8xl font-black text-gray-50 select-none group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-br group-hover:from-brand-purple/20 group-hover:to-brand-orange/20 transition-all duration-500">
                {step.number}
              </span>

              <div className="relative z-10 space-y-8 mt-2">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-all duration-300 ${activeStep === index ? 'bg-gradient-to-r from-brand-purple to-brand-orange text-white scale-110 ring-4 ring-brand-purple/10' : 'bg-brand-purple/10 text-brand-purple'
                  }`}>
                  {React.cloneElement(step.icon, { 
                    className: `w-6 h-6 ${activeStep === index ? 'text-white' : 'text-brand-purple'}` 
                  })}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-gray-500 text-sm font-medium leading-relaxed">{step.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};