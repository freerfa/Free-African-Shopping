import React from 'react';
import { useStore } from '../contexts/StoreContext';
import ProductCard from './ProductCard';

interface WishlistViewProps {
  onOpenProduct: (id: string) => void;
  onContinueShopping: () => void;
}

const WishlistView: React.FC<WishlistViewProps> = ({ onOpenProduct, onContinueShopping }) => {
  const { wishlist, products } = useStore();
  
  const savedProducts = products.filter(p => wishlist.includes(p.id));

  if (wishlist.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="max-w-md mx-auto">
          <div className="w-20 h-20 bg-gray-100 dark:bg-dark-card rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-10 h-10 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-text mb-2">
            Your wishlist is empty
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Save items you like to find them easily later.
          </p>
          <button
            onClick={onContinueShopping}
            className="bg-brand-dark text-white py-3 px-8 rounded-full font-semibold hover:bg-gray-800 transition-colors duration-300"
          >
            Browse products
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-brand-dark dark:text-dark-text">Your Wishlist</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {wishlist.length} {wishlist.length === 1 ? 'item' : 'items'} saved
          </p>
        </div>
        <button
          onClick={onContinueShopping}
          className="text-brand-gold-ink dark:text-brand-gold font-medium hover:underline flex items-center gap-1"
        >
          &larr; Continue shopping
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {savedProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onOpen={() => onOpenProduct(product.id)}
          />
        ))}
      </div>
    </div>
  );
};

export default WishlistView;
