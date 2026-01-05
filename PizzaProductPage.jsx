import React, { useState } from 'react';
import {
    ChevronLeft,
    Heart,
    Minus,
    Plus,
    CheckCircle2,
    Layers
} from 'lucide-react';

// Size and Price Definitions
const SIZES = ['6"', '8"', '10"', '12"', '14"', '16"', '18"', '20"', '22"', '24"'];

const SIZE_PRICES = {
    '6"': 149,
    '8"': 199,
    '10"': 249,
    '12"': 299,
    '14"': 349,
    '16"': 399,
    '18"': 449,
    '20"': 499,
    '22"': 549,
    '24"': 599
};

const SIZE_QUANTITY = {
    '6"': '200 ML',
    '8"': '300 ML',
    '10"': '400 ML',
    '12"': '500 ML',
    '14"': '600 ML',
    '16"': '700 ML',
    '18"': '850 ML',
    '20"': '1000 ML',
    '22"': '1200 ML',
    '24"': '1500 ML'
};

const SIZE_IMAGES = {
    '6"': 'https://images.unsplash.com/photo-1541745537411-b8046dc6d66c?q=80&w=800&auto=format&fit=crop',
    '8"': 'https://images.unsplash.com/photo-1541745537411-b8046dc6d66c?q=80&w=800&auto=format&fit=crop',
    '10"': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=800&auto=format&fit=crop',
    '12"': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=800&auto=format&fit=crop',
    '14"': 'https://images.unsplash.com/photo-1593504049359-74330189a345?q=80&w=800&auto=format&fit=crop',
    '16"': 'https://images.unsplash.com/photo-1593504049359-74330189a345?q=80&w=800&auto=format&fit=crop',
    '18"': 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=800&auto=format&fit=crop',
    '20"': 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=800&auto=format&fit=crop',
    '22"': 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?q=80&w=800&auto=format&fit=crop',
    '24"': 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?q=80&w=800&auto=format&fit=crop'
};

const SizeButton = ({ label, imageUrl, isSelected, onClick }) => (
    <button
        onClick={onClick}
        title={label}
        className={`relative min-w-[60px] h-[60px] rounded-full flex items-center justify-center transition-all duration-300 border overflow-hidden ${isSelected
            ? 'border-black shadow-lg scale-110 ring-2 ring-black ring-offset-2'
            : 'border-gray-200 hover:border-black opacity-70 hover:opacity-100'
            }`}
    >
        <img src={imageUrl} alt={label} className="w-full h-full object-cover" />
    </button>
);

const PizzaProductPage = () => {
    const [quantity, setQuantity] = useState(1);
    const [selectedSize, setSelectedSize] = useState('12"');
    const [isFavorite, setIsFavorite] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    const increment = () => setQuantity(prev => prev + 1);
    const decrement = () => setQuantity(prev => Math.max(1, prev - 1));

    const handleAddToCart = () => {
        setIsAdding(true);
        setTimeout(() => {
            setIsAdding(false);
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 2000);
        }, 800);
    };

    const totalPrice = SIZE_PRICES[selectedSize] * quantity;

    return (
        <div className="flex justify-center min-h-screen bg-gray-100">
            <div className="relative w-full max-w-[420px] bg-white shadow-2xl min-h-screen flex flex-col overflow-hidden">

                {/* Success Toast */}
                <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 transform ${showSuccess ? 'translate-y-0 opacity-100' : '-translate-y-20 opacity-0'}`}>
                    <div className="bg-black text-white px-6 py-3 rounded-full flex items-center gap-3 shadow-2xl">
                        <CheckCircle2 size={18} className="text-green-400" />
                        <span className="text-sm font-medium">Added to cart!</span>
                    </div>
                </div>

                {/* Top Section */}
                <div className="relative h-[42vh] bg-black rounded-b-[50px] flex flex-col items-center justify-center px-6 pt-12 pb-12 overflow-visible">
                    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-b-[50px]">
                        <div className="absolute top-[-5%] right-[-10%] w-72 h-72 border-[1px] border-white/10 rounded-full"></div>
                        <div className="absolute bottom-[-15%] left-[-15%] w-96 h-96 border-[1px] border-white/10 rounded-full"></div>
                    </div>

                    <div className="absolute top-12 left-0 right-0 flex justify-between items-center px-6 z-10">
                        <button className="w-11 h-11 flex items-center justify-center text-white bg-white/10 rounded-full backdrop-blur-xl border border-white/10 hover:bg-white/20 transition-all">
                            <ChevronLeft size={24} />
                        </button>
                        <button
                            onClick={() => setIsFavorite(!isFavorite)}
                            className="w-11 h-11 flex items-center justify-center text-white bg-white/10 rounded-full backdrop-blur-xl border border-white/10 hover:bg-white/20 transition-all"
                        >
                            <Heart
                                size={22}
                                className={`transition-all duration-300 ${isFavorite ? 'fill-red-500 stroke-red-500 scale-110' : 'fill-none stroke-current'}`}
                            />
                        </button>
                    </div>

                    <div className="relative mt-2 z-0">
                        <div className="absolute inset-0 bg-white/5 rounded-full blur-3xl transform scale-150"></div>
                        <img
                            key={selectedSize}
                            src={SIZE_IMAGES[selectedSize]}
                            alt="Pizza Detail"
                            className={`w-64 h-64 object-cover rounded-full shadow-[0_30px_60px_rgba(0,0,0,0.6)] transition-all duration-700 ease-out hover:rotate-3`}
                        />
                    </div>

                    {/* Moved Quantity Selector - Floating Pill */}
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 z-20">
                        <div className="bg-white rounded-full flex items-center gap-6 px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.15)] border border-gray-100 min-w-[140px] justify-between">
                            <button
                                onClick={decrement}
                                className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-50 text-black shadow-sm active:scale-90 transition-all border border-gray-200"
                            >
                                <Minus size={14} />
                            </button>
                            <span className="text-lg font-bold text-black min-w-[20px] text-center">{quantity}</span>
                            <button
                                onClick={increment}
                                className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-50 text-black shadow-sm active:scale-90 transition-all border border-gray-200"
                            >
                                <Plus size={14} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Product Info Section */}
                <div className="flex-1 px-8 pt-16 pb-32 overflow-y-auto no-scrollbar">
                    <div className="flex justify-between items-start mb-10">
                        <h1 className="font-bold text-gray-900 tracking-tight text-2xl">
                            Regular Paneer Pizza
                        </h1>
                        <div className="bg-green-50 text-green-600 px-3 py-1 rounded-full text-[10px] font-extrabold tracking-widest border border-green-100 uppercase mt-1">
                            Veg
                        </div>
                    </div>

                    {/* Configuration Section: Size Selector */}
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Choose Size</h3>
                            <span className="text-[10px] text-gray-400 font-medium">from ₹149</span>
                        </div>

                        <div className="overflow-x-auto no-scrollbar py-2 -my-2">
                            <div className="flex gap-3 pr-4">
                                {SIZES.map((size) => (
                                    <SizeButton
                                        key={size}
                                        label={size}
                                        imageUrl={SIZE_IMAGES[size]}
                                        isSelected={selectedSize === size}
                                        onClick={() => setSelectedSize(size)}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Metrics Section: Quantity (ML) & Variant */}
                    <div className="mt-8 grid grid-cols-2 gap-3">
                        <div className="p-2 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
                                <span className="text-xs font-bold">📏</span>
                            </div>
                            <div>
                                <span className="text-[9px] text-gray-400 uppercase font-bold tracking-widest block">Net Content</span>
                                <span className="text-xs font-bold text-gray-900">{SIZE_QUANTITY[selectedSize]}</span>
                            </div>
                        </div>
                        <div className="p-2 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-500">
                                <Layers size={14} />
                            </div>
                            <div>
                                <span className="text-[9px] text-gray-400 uppercase font-bold tracking-widest block">Variant</span>
                                <span className="text-xs font-bold text-gray-900">Hand Tossed</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Fixed Bottom Action Bar */}
                <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] bg-white border-t border-gray-100 px-6 py-4 pb-8 md:pb-6 flex items-center justify-between gap-6 shadow-[0_-15px_40px_rgba(0,0,0,0.04)] z-30">
                    <div className="flex flex-col">
                        <span className="text-gray-400 text-[9px] uppercase font-bold tracking-widest mb-0.5">Total Price</span>
                        <span className="text-2xl font-black text-black tracking-tighter">
                            ₹{totalPrice}
                        </span>
                    </div>

                    <button
                        onClick={handleAddToCart}
                        disabled={isAdding}
                        className={`flex-1 bg-black text-white h-12 rounded-[20px] flex items-center justify-center font-bold text-xs tracking-[0.15em] active:scale-95 transition-all duration-300 shadow-lg shadow-black/10 relative overflow-hidden ${isAdding ? 'opacity-90' : 'hover:bg-gray-900'}`}
                    >
                        {isAdding ? (
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                <span className="animate-pulse">ADDING...</span>
                            </div>
                        ) : (
                            'ADD TO CART'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PizzaProductPage;
