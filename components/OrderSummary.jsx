import React from 'react';

const ShoppingCartIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);

const CheckoutIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
    </svg>
);


const OrderSummary = ({ itemCount, totalPrice, onCheckout, onCancelOrder }) => {
  return (
    <div className="bg-slate-200">
      <div className="container mx-auto px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="bg-primary-100 p-3 rounded-full">
            <ShoppingCartIcon />
          </div>
          <div>
            <p className="text-slate-500 font-medium">
              {itemCount} {itemCount === 1 ? 'Item' : 'Items'}
            </p>
            <p className="text-3xl font-heading font-black text-primary-700">
              ₹{totalPrice.toFixed(2)}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={onCancelOrder}
            className="px-8 py-3 bg-primary-50 text-primary-700 font-bold rounded-xl hover:bg-primary-100 transition-colors duration-300 text-lg font-heading"
          >
            Cancel
          </button>
          <button
            onClick={onCheckout}
            disabled={itemCount === 0}
            className="px-8 py-3 bg-gradient-to-br from-primary-600 to-primary-700 text-white font-bold rounded-xl shadow-lg shadow-primary-500/30 hover:from-primary-700 hover:to-primary-800 transition-all duration-300 text-lg disabled:from-slate-400 disabled:to-slate-400 disabled:cursor-not-allowed disabled:shadow-none transform hover:scale-105 font-heading flex items-center gap-3"
          >
            <span>Checkout</span>
            <CheckoutIcon />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderSummary;

