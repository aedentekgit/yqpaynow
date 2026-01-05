import React from 'react';

const OrderSuccessPage = ({ orderId, onStartNewOrder }) => {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
      <div className="bg-white p-12 rounded-2xl shadow-xl max-w-lg w-full text-center transform transition-all scale-100 animate-fade-in-up">
        <div className="mx-auto bg-green-100 rounded-full h-28 w-28 flex items-center justify-center mb-6 ring-4 ring-green-200">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-5xl font-black font-heading text-slate-800 mb-2">Payment Successful!</h1>
        <p className="text-slate-600 text-lg mb-8">Thank you for your order. Enjoy your meal!</p>

        <div className="bg-primary-50 p-6 rounded-lg mb-8 border-2 border-primary-200 border-dashed">
          <p className="text-base text-primary-700 font-heading">Your Order ID:</p>
          <p className="text-4xl font-mono font-bold text-primary-600 tracking-widest">{orderId}</p>
        </div>
        
        <p className="text-sm text-slate-500 mb-8">Please take your receipt and wait for your order number to be called.</p>
        
        <button 
          onClick={onStartNewOrder} 
          className="w-full py-5 bg-gradient-to-br from-primary-600 to-primary-700 text-white font-bold rounded-xl shadow-lg shadow-primary-500/30 hover:from-primary-700 hover:to-primary-800 transition-all duration-300 text-2xl transform hover:scale-105 font-heading"
        >
          Start New Order
        </button>
      </div>
      <style>{`
        @keyframes fade-in-up {
          0% {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.6s cubic-bezier(0.165, 0.84, 0.44, 1) forwards;
        }
      `}</style>
    </div>
  );
};

export default OrderSuccessPage;

