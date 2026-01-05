import React from 'react';

const AddToCartIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
);

const MinusIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
    </svg>
);


const ProductCard = ({ product, onAddToCart, onUpdateQuantity, quantity }) => {
  return (
    <div className="bg-white rounded-2xl shadow-md overflow-hidden flex flex-col justify-between transition-all duration-300 hover:shadow-xl group border border-transparent hover:border-primary-300">
      <div className="relative">
        <img className="w-full h-48 object-cover" src={product.imageUrl} alt={product.name} />
        <div className="absolute inset-0 bg-gradient-to-t from-primary-700/80 to-transparent"></div>
        <div className="absolute bottom-0 left-0 p-4">
           <h3 className="text-2xl font-heading font-bold text-white" style={{textShadow: '1px 1px 5px rgba(76, 29, 149, 0.8)'}}>{product.name}</h3>
        </div>
      </div>

      <div className="p-4 flex-grow flex flex-col justify-between">
        <p className="text-sm text-slate-600 mt-1 flex-grow">{product.description}</p>
        
        <div className="mt-4 flex justify-between items-center">
          <p className="text-2xl font-heading font-extrabold text-primary-600">
            ₹{product.price.toFixed(2)}
          </p>
          {quantity === 0 ? (
            <button
              onClick={() => onAddToCart(product)}
              className="bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg hover:from-primary-600 hover:to-primary-700 hover:shadow-primary-400/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-all duration-300 transform group-hover:scale-110"
              aria-label={`Add ${product.name} to cart`}
            >
              <AddToCartIcon />
            </button>
          ) : (
            <div className="flex items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg transition-all duration-300 transform group-hover:scale-110">
              <button
                onClick={() => onUpdateQuantity(product.id, quantity - 1)}
                className="w-12 h-12 flex items-center justify-center hover:bg-white/10 rounded-l-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                aria-label={`Decrease quantity of ${product.name}`}
              >
                <MinusIcon />
              </button>
              <span className="text-xl font-bold font-heading w-10 text-center select-none">{quantity}</span>
              <button
                onClick={() => onAddToCart(product)}
                className="w-12 h-12 flex items-center justify-center hover:bg-white/10 rounded-r-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                aria-label={`Increase quantity of ${product.name}`}
              >
                <AddToCartIcon />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductCard;

