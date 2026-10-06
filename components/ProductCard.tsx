import React from 'react';
import type { Product } from '../types';
import { useStore } from '../contexts/StoreContext';
import { formatPrice, formatPriceOrEnquiry } from '../lib/format';
import { isContactOnly, isOnSale, isSoldOut, primaryImage, totalStock } from '../lib/product';
import ContactUs from './ContactUs';
import ShoppingCartIcon from './icons/ShoppingCartIcon';

interface ProductCardProps {
  product: Product;
  onOpen: (productId: string) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onOpen }) => {
  const { config, addToCart } = useStore();
  const soldOut = isSoldOut(product);
  const onSale = isOnSale(product);
  // `null` means stock isn't tracked (Services/Jobs): never sold out, and the
  // "only N left" badge below must not fire either.
  const remaining = totalStock(product);
  const lowStock = remaining !== null && remaining > 0 && remaining <= 5;

  return (
    <div className="bg-white dark:bg-dark-card rounded-lg shadow-lg overflow-hidden transform hover:-translate-y-2 transition-transform duration-300 flex flex-col">
      <button
        onClick={() => onOpen(product.id)}
        className="relative block w-full focus:outline-none focus:ring-2 focus:ring-brand-gold-ink dark:focus:ring-brand-gold"
        aria-label={`View ${product.name}`}
      >
        <img
          className={`w-full h-64 object-cover ${soldOut ? 'opacity-50' : ''}`}
          src={primaryImage(product)}
          alt={product.name}
          loading="lazy"
        />
        {onSale && (
          <span className="absolute top-3 left-3 bg-brand-gold text-brand-dark text-xs font-bold px-2 py-1 rounded-full">
            SALE
          </span>
        )}
        {soldOut && (
          <span className="absolute top-3 right-3 bg-brand-dark text-brand-offwhite text-xs font-bold px-2 py-1 rounded-full">
            SOLD OUT
          </span>
        )}
        {!soldOut && lowStock && !onSale && (
          <span className="absolute top-3 right-3 bg-brand-dark text-brand-offwhite text-xs font-bold px-2 py-1 rounded-full">
            Only {remaining} left
          </span>
        )}
      </button>

      <div className="p-6 flex-grow flex flex-col">
        <p className="text-sm font-medium text-brand-gold-ink dark:text-brand-gold mb-1 uppercase tracking-wider">{product.category}</p>
        <button onClick={() => onOpen(product.id)} className="text-left focus:outline-none">
          <h3 className="text-xl font-semibold text-brand-dark dark:text-dark-text mb-2 hover:text-brand-gold-ink dark:hover:text-brand-gold transition-colors">
            {product.name}
          </h3>
        </button>
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 flex-grow line-clamp-3">
          {product.description}
        </p>

        <div className="flex flex-wrap justify-between items-center mt-auto gap-3">
          <p className="text-2xl font-bold text-brand-dark dark:text-dark-text">
            {formatPriceOrEnquiry(product.price, config.currency)}
            {onSale && product.compareAtPrice !== null && (
              <span className="text-base font-normal text-gray-400 line-through ml-2">
                {formatPrice(product.compareAtPrice, config.currency)}
              </span>
            )}
          </p>
          {/* A Service or a Job has no price to check out, so it offers Contact us
              in place of Add. */}
          {isContactOnly(product) ? (
            <ContactUs product={product} layout="card" onOpen={() => onOpen(product.id)} />
          ) : (
            <button
              onClick={() => addToCart(product.id, null, 1)}
              disabled={soldOut}
              className="bg-brand-dark text-white py-2 px-4 rounded-full hover:bg-gray-800 dark:hover:bg-gray-700 transition-colors duration-300 flex items-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <ShoppingCartIcon />
              <span>{soldOut ? 'Sold out' : 'Add'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductCard;