import React, { useState } from 'react';

const TAX_RATE = 0.14;

const PaymentModal = ({ totalPrice, onConfirmPayment, onClose }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const taxAmount = totalPrice * TAX_RATE;
  const finalTotal = totalPrice + taxAmount;

  const handlePayNow = () => {
    setIsProcessing(true);
    // Simulate API call
    setTimeout(() => {
      onConfirmPayment();
    }, 2500);
  };

  const Spinner = () => (
    <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );

  return (
    <div 
        className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 transition-opacity duration-300 animate-fade-in"
        aria-labelledby="payment-modal-title"
        role="dialog"
        aria-modal="true"
    >
      <div className="bg-white p-10 rounded-2xl shadow-xl max-w-lg w-full text-center transform transition-all animate-scale-in relative">
        <button onClick={onClose} disabled={isProcessing} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 disabled:opacity-50 transition-colors" aria-label="Close payment modal">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <h1 id="payment-modal-title" className="text-4xl font-black font-heading text-primary-800 mb-2 mt-4">Complete Your Payment</h1>
        <p className="text-slate-600 mb-8">Confirm the total amount and tap to pay.</p>

        <div className="bg-gradient-to-br from-primary-50 to-primary-100 p-6 rounded-xl mb-8 border-2 border-primary-200 border-dashed">
            <p className="text-lg text-primary-800 font-heading">Total Amount Due</p>
            <p className="text-6xl font-black font-heading text-primary-600">₹{finalTotal.toFixed(2)}</p>
        </div>

        <div className="mb-8">
            <h2 className="text-xl font-semibold font-heading mb-4">Payment Method</h2>
            <div className="border-2 border-primary-500 bg-primary-100 p-4 rounded-lg flex items-center justify-between shadow-inner">
                <div className="flex items-center space-x-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary-700" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                        <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm3 0a1 1 0 011-1h1a1 1 0 110 2H8a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                    <span className="font-semibold text-primary-900 font-heading">Credit / Debit Card</span>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
            </div>
            <p className="text-xs text-slate-500 mt-2">This is a simulation. No real payment will be processed.</p>
        </div>
        
        <div className="flex flex-col space-y-3">
            <button 
                onClick={handlePayNow}
                disabled={isProcessing} 
                className="w-full h-16 bg-gradient-to-br from-primary-500 to-primary-700 text-white font-bold rounded-xl shadow-xl shadow-primary-500/30 hover:from-primary-600 hover:to-primary-800 transition-all duration-300 text-2xl font-heading flex items-center justify-center disabled:bg-slate-400 disabled:from-slate-400 disabled:to-slate-500 transform hover:scale-105"
            >
              {isProcessing ? <Spinner /> : `Pay ₹${finalTotal.toFixed(2)}`}
            </button>
            <button onClick={onClose} disabled={isProcessing} className="w-full py-3 bg-slate-200 text-slate-800 font-bold rounded-lg hover:bg-slate-300 transition-colors duration-200 disabled:opacity-50">
              Back to Review
            </button>
          </div>
      </div>
       <style>{`
        @keyframes fade-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
        }
        @keyframes scale-in {
          0% { opacity: 0; transform: scale(0.95); }
          100% { opacity: 1; transform: scale(1); }
        }
        .animate-scale-in {
          animation: scale-in 0.3s cubic-bezier(0.165, 0.84, 0.44, 1) forwards;
        }
      `}</style>
    </div>
  );
};

export default PaymentModal;

