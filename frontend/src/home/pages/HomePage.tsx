import React from 'react';
import { Navbar } from '../components/Navbar';
import { Hero } from '../components/Hero';
// import { FeatureBanner } from '../components/FeatureBanner';
import { MenuCarousel } from '../components/MenuCarousel';
import { SplitFeature } from '../components/SplitFeature';
import { BenefitsGrid } from '../components/BenefitsGrid';
import { Transformation } from '../components/Transformation';
import { HowItWorks } from '../components/HowItWorks';
import { BottomBanner } from '../components/BottomBanner';
import { Footer } from '../components/Footer';
import { ScrollToTop } from '../components/ScrollToTop';

const HomePage: React.FC = () => {
  return (
    <div className="bg-white min-h-screen text-gray-900 selection:bg-purple-200 selection:text-purple-900">
      <Navbar />
      <Hero />
      {/* <FeatureBanner /> */}
      <div id="features">
        <SplitFeature />
      </div>
      <BenefitsGrid />
      <Transformation />
      <HowItWorks />
      <MenuCarousel />
      <BottomBanner />
      <Footer />
      <ScrollToTop />
    </div>
  );
};

export default HomePage;