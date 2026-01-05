import React from 'react';
import burgerImg from '../images/Burger.png';
import milkshakeImg from '../images/MilkShake.png';
import popcornImg from '../images/Popcorn.jpg'; // Placeholder using A.jpg
import puffsImg from '../images/EgePuff.png';
import sandwichImg from '../images/Sandwich.png'; // Placeholder using 3.png
import softDrinksImg from '../images/SoftDrinks.png'; // Placeholder using A.jpg

const menuItems = [
  { name: "Burger", image: burgerImg, color: "border-orange-500", shadow: "", glow: "bg-orange-500/20" },
  { name: "Milk Shake", image: milkshakeImg, color: "border-pink-500", shadow: "", glow: "bg-pink-500/20" },
  { name: "Popcorn", image: popcornImg, color: "border-purple-500", shadow: "", glow: "bg-purple-500/20" },
  { name: "Puffs", image: puffsImg, color: "border-red-500", shadow: "", glow: "bg-red-500/20" },
  { name: "Sandwich", image: sandwichImg, color: "border-yellow-500", shadow: "", glow: "bg-yellow-500/20" },
  { name: "Soft Drinks", image: softDrinksImg, color: "border-blue-500", shadow: "", glow: "bg-blue-500/20" },
];

export const MenuCarousel: React.FC = () => {
  // Duplicate the array enough times to ensure the scroll is seamless.
  const carouselItems = [...menuItems, ...menuItems, ...menuItems, ...menuItems];
  const [isPaused, setIsPaused] = React.useState(false);

  return (
    <section className="relative py-24 bg-gray-50 flex items-center justify-center overflow-hidden text-left">
      {/* Dynamic Background Pattern */}
      <div className="absolute inset-0 opacity-[0.4]" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
      <div className="absolute inset-0 bg-gradient-to-b from-gray-50 via-transparent to-gray-50"></div>

      {/* Background Ambience */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-brand-purple/5 blur-[100px] rounded-full pointer-events-none"></div>

      {/* Main Card Container */}
      <div className="w-full max-w-7xl h-[750px] md:h-[650px] relative rounded-[3rem] bg-white border border-white/50 ring-1 ring-black/5 overflow-hidden flex flex-col md:block mx-4 md:mx-8">

        {/* Left Content Area (Text) */}
        <div className="absolute left-0 top-0 w-full md:w-[50%] h-[55%] md:h-auto bottom-auto md:bottom-0 bg-gradient-to-r from-purple-100 via-violet-100 to-purple-100 rounded-b-[3rem] md:rounded-b-none md:rounded-r-[200px] z-30 overflow-hidden">
          {/* Subtle internal gradient */}
          <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-brand-purple/10 blur-[100px] rounded-full pointer-events-none"></div>

          <div className="h-full flex flex-col justify-start px-8 md:pl-20 md:pr-12 text-gray-900 space-y-8 md:space-y-10 relative z-10 pb-8 md:pb-0 pt-20 md:pt-24">
            <div>
              <span className="inline-block py-1.5 px-4 rounded-full bg-brand-purple/5 border border-brand-purple/10 text-brand-purple text-xs font-extrabold uppercase tracking-widest mb-6">
                Menu Highlights
              </span>
              <h2 className="text-4xl md:text-6xl lg:text-7xl font-black leading-[0.95] tracking-tight mb-6 text-gray-900">
                Popular <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-purple to-brand-orange">Snacks</span>
              </h2>
              <div className="w-24 h-2 bg-gradient-to-r from-brand-purple to-brand-orange rounded-full"></div>
            </div>

            <p className="text-gray-500 text-lg font-medium max-w-sm leading-relaxed">
              Craving something delicious? Browse our fan-favorite selection of snacks and drinks, delivered right to you.
            </p>

            <button
              onClick={() => window.location.href = "#"}
              className="w-fit px-8 py-4 rounded-2xl bg-gray-900 hover:bg-black text-white font-bold transition-all duration-300 flex items-center gap-3 group/btn hover:-translate-y-1 relative overflow-hidden"
            >
              <span className="relative z-10">View Full Menu</span>
              <span className="group-hover/btn:translate-x-1 transition-transform relative z-10">→</span>
              <div className="absolute inset-0 bg-gradient-to-r from-brand-purple to-brand-orange opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"></div>
            </button>
          </div>
        </div>

        {/* Right Content - Background Typography */}
        <div className="absolute right-0 top-0 bottom-0 w-full md:w-[60%] z-0 flex flex-col justify-start items-end pt-80 md:pt-16 pr-8 md:pr-16 pointer-events-none overflow-hidden">
          <div className="text-right opacity-100 hidden md:block transform rotate-0">
            <h3 className="text-[8rem] leading-[0.85] font-black text-[#a0785a]/10 tracking-tighter" style={{ WebkitTextStroke: '2px #a0785a' }}>
              MENU <br /> ITEMS
            </h3>
          </div>
        </div>

        {/* Carousel Layer - Z-20 (On top of Background, Interactive) */}
        <div className="absolute bottom-0 w-full z-20 pb-20 md:pb-16">
          <div className="w-full overflow-hidden">
            {/* Carousel Track - Pauses on hover/touch */}
            <div
              className="flex items-center animate-marquee w-max py-12 pl-4"
              style={{ animationPlayState: isPaused ? 'paused' : 'running' }}
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
              onTouchStart={() => setIsPaused(true)}
              onTouchEnd={() => setIsPaused(false)}
            >
              {carouselItems.map((item, index) => (
                <div key={index} className="relative px-6 md:px-10 flex flex-col items-center justify-center group/item cursor-pointer">

                  {/* Dashed Connector Line */}
                  <div className="absolute top-1/2 left-0 w-full h-[2px] -translate-y-1/2 opacity-20">
                    <div className="w-full h-full border-t-2 border-dashed border-gray-400"></div>
                  </div>

                  {/* Circle Item with Glow */}
                  <div className="relative">
                    {/* Colored Glow Behind */}
                    <div className={`absolute inset-0 rounded-full blur-2xl opacity-0 group-hover/item:opacity-100 transition-opacity duration-500 ${item.glow} scale-150`}></div>

                    <div className={`relative w-36 h-36 md:w-56 md:h-56 rounded-full bg-white z-10 p-1.5 transition-all duration-500 transform group-hover/item:scale-110 group-hover/item:-translate-y-6 ${item.shadow}`}>
                      <div className="w-full h-full rounded-full overflow-hidden relative bg-white">
                        {item.name === "Burger" && (
                          <div className="absolute inset-0 bg-white z-0"></div>
                        )}
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover/item:scale-110 group-hover/item:rotate-3 relative z-10"
                          loading="lazy"
                        />
                        {/* Elegant Shine Effect */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-black/10 via-transparent to-white/30 pointer-events-none"></div>
                      </div>
                    </div>
                  </div>

                  {/* Floating Label */}
                  <div className="absolute -bottom-6 opacity-100 transform translate-y-2 group-hover/item:translate-y-0 transition-all duration-300 z-20">
                    <div className="bg-white/95 backdrop-blur-md text-gray-900 text-sm font-bold px-6 py-2.5 rounded-full whitespace-nowrap tracking-wide border border-gray-100 group-hover/item:border-brand-purple/20 group-hover/item:text-brand-purple transition-colors">
                      {item.name}
                    </div>
                  </div>

                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};