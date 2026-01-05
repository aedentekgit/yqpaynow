import React, { useState } from 'react';
import PaymentModal from './PaymentModal';

const TAX_RATE = 0.14; // 14%

const CheckoutPage = ({ cart, totalPrice, onUpdateQuantity, onConfirmPayment, onBackToMenu }) => {
    
    const [isPaymentModalOpen, setPaymentModalOpen] = useState(false);
    const taxAmount = totalPrice * TAX_RATE;
    const finalTotal = totalPrice + taxAmount;

    return (
        <div className="w-full h-full flex flex-col">
            <header className="bg-white shadow-md p-6">
                <h1 className="text-4xl font-black font-heading text-center text-primary-800">Review Your Order</h1>
            </header>

            <main className="flex-1 overflow-y-auto p-8">
                {cart.length === 0 ? (
                    <div className="text-center h-full flex flex-col items-center justify-center">
                        <p className="text-2xl text-slate-500 mb-6 font-heading">Your cart is empty.</p>
                        <button onClick={onBackToMenu} className="px-8 py-4 bg-gradient-to-br from-primary-600 to-primary-700 text-white font-bold rounded-xl shadow-lg shadow-primary-500/30 hover:from-primary-700 hover:to-primary-800 transform hover:scale-105 transition-all duration-200">
                            Back to Menu
                        </button>
                    </div>
                ) : (
                    <div className="max-w-5xl mx-auto">
                        <ul className="space-y-4">
                            {cart.map(item => (
                                <li key={item.id} className="bg-white p-4 rounded-xl shadow-sm flex items-center justify-between transition-shadow hover:shadow-md">
                                    <div className="flex items-center space-x-6">
                                        <img src={item.imageUrl} alt={item.name} className="w-24 h-24 rounded-lg object-cover" />
                                        <div>
                                            <h2 className="text-xl font-bold font-heading">{item.name}</h2>
                                            <p className="text-md text-slate-500">₹{item.price.toFixed(2)} each</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-6">
                                        <div className="flex items-center border-2 border-slate-200 rounded-lg">
                                            <button onClick={() => onUpdateQuantity(item.id, item.quantity - 1)} className="px-4 py-2 font-bold text-2xl text-slate-600 hover:bg-slate-100 rounded-l-md">-</button>
                                            <span className="px-6 py-2 text-xl font-bold font-heading w-16 text-center">{item.quantity}</span>
                                            <button onClick={() => onUpdateQuantity(item.id, item.quantity + 1)} className="px-4 py-2 font-bold text-2xl text-slate-600 hover:bg-slate-100 rounded-r-md">+</button>
                                        </div>
                                        <p className="font-bold font-heading text-xl w-32 text-right text-primary-600">₹{(item.price * item.quantity).toFixed(2)}</p>
                                        <button onClick={() => onUpdateQuantity(item.id, 0)} className="text-slate-400 hover:text-red-500 transition-colors">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>

                        <div className="mt-8 p-8 bg-gradient-to-br from-white to-primary-50 rounded-xl shadow-sm">
                            <h2 className="text-3xl font-bold font-heading mb-6">Order Summary</h2>
                            <div className="space-y-3">
                                <div className="flex justify-between text-lg">
                                    <span className="text-slate-600">Subtotal</span>
                                    <span className="font-semibold">₹{totalPrice.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-lg">
                                    <span className="text-slate-600">Tax ({(TAX_RATE * 100).toFixed(0)}%)</span>
                                    <span className="font-semibold">₹{taxAmount.toFixed(2)}</span>
                                </div>
                                <hr className="my-4 border-dashed"/>
                                <div className="flex justify-between text-3xl font-extrabold font-heading text-primary-600">
                                    <span>Total</span>
                                    <span>₹{finalTotal.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            <footer className="bg-white shadow-inner p-4 border-t">
                <div className="max-w-5xl mx-auto flex justify-between items-center">
                    <button onClick={onBackToMenu} className="px-8 py-4 bg-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-300 transition-colors duration-200 text-lg font-heading">
                        Back to Menu
                    </button>
                    {cart.length > 0 && (
                      <button onClick={() => setPaymentModalOpen(true)} className="px-10 py-4 bg-gradient-to-br from-primary-600 to-primary-700 text-white font-bold rounded-xl shadow-lg shadow-primary-500/30 hover:from-primary-700 hover:to-primary-800 transition-all duration-300 text-lg transform hover:scale-105 font-heading">
                          Proceed to Payment
                      </button>
                    )}
                </div>
            </footer>

            {isPaymentModalOpen && (
                <PaymentModal
                    totalPrice={totalPrice}
                    onConfirmPayment={onConfirmPayment}
                    onClose={() => setPaymentModalOpen(false)}
                />
            )}
        </div>
    );
};

export default CheckoutPage;

