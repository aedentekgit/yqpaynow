import React from 'react';
import smartBilling from '../images/smart-billing-software.jpg';
import smartQr from '../images/smart-qr-ordering.jpg';
import kiosk from '../images/kiosk.jpg';
import signageBoard from '../images/signage-board.jpeg';

interface BenefitCardProps {
  title: string;
  image: string;
  description: string;
}

const BenefitCard: React.FC<BenefitCardProps> = ({ title, image, description }) => (
  <div className="group relative overflow-hidden rounded-2xl aspect-[4/5] cursor-pointer transition-shadow ">
    <div className="absolute inset-0 bg-gray-900 text-left">
      <img
        src={image}
        alt={title}
        className="w-full h-full object-cover opacity-80 group-hover:opacity-60 group-hover:scale-110 transition-all duration-700"
      />
    </div>
    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-90"></div>
    <div className="absolute bottom-0 left-0 p-6 w-full">
      <div className="bg-brand-orange rounded-full transition-all duration-500 w-0 h-0 mb-0 group-hover:w-12 group-hover:h-1 group-hover:mb-4"></div>
      <h3 className="text-xl font-bold text-white mb-2 leading-tight">{title}</h3>
      <p className="text-sm text-gray-300 transition-all duration-500 max-h-0 opacity-0 overflow-hidden group-hover:max-h-40 group-hover:opacity-100">
        {description}
      </p>
    </div>
  </div>
);

export const BenefitsGrid: React.FC = () => {
  const benefits = [
    {
      title: "Smart Billing Software",
      image: smartBilling,
      description: "Automates theater billing operations with accurate, real-time calculations and seamless integration across counters, kiosks, and online orders for faster and error-free transactions."
    },
    {
      title: "Smart QR Ordering",
      image: smartQr,
      description: "Enhances guest convenience by allowing them to place orders via their smartphone using QR codes, reducing wait times and improving order accuracy."
    },
    {
      title: "Kiosk",
      image: kiosk,
      description: "Self-service kiosks that streamline ticket and food purchases, giving customers a faster, more convenient way to complete transactions."
    },
    {
      title: "Signage Board",
      image: signageBoard,
      description: "Dynamic signage solutions that provide real-time information and promotions to engage customers and enhance their experience."
    }
  ];

  return (
    <section id="better-experience" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-end mb-12">
          <div>
            <h2 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900 text-left">Better <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-purple to-brand-orange">experiences</span></h2>
            <p className="text-gray-600 max-w-md text-left">Designed to elevate every aspect of the cinema journey for owners and guests alike.</p>
          </div>
          <button 
            onClick={() => window.location.href = "#"}
            className="hidden md:block text-brand-purple hover:text-purple-800 font-medium transition-colors"
          >
            View all features &rarr;
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
          {benefits.map((benefit, index) => (
            <BenefitCard key={index} {...benefit} />
          ))}
        </div>
      </div>
    </section>
  );
};