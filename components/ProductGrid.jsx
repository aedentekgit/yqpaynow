import React from 'react';
import ProductCard from './ProductCard';

const ProductGrid = ({ products, onAddToCart, onUpdateQuantity, cart }) => {
  return (
    <div id="product-grid" className="flex-1 p-6 overflow-y-auto bg-slate-50 pb-32">
      {products.length === 0 ? (
        <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 text-xl">No items in this category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.map((product) => {
            const cartItem = cart.find((item) => item.id === product.id);
            const quantity = cartItem ? cartItem.quantity : 0;
            return (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={onAddToCart}
                onUpdateQuantity={onUpdateQuantity}
                quantity={quantity} />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProductGrid;

