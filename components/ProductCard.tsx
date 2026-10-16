import React from 'react';
import type { Product } from '../types';
import { useStore } from '../contexts/StoreContext';
import { formatPrice, formatPriceOrEnquiry } from '../lib/format';
import { isContactOnly, isOnSale, isSoldOut, primaryImage, totalStock } from '../lib/product';
import ContactUs from './ContactUs';
import ShoppingCartIcon from './icons/ShoppingCartIcon';
import { HeartIcon } from './icons/HeartIcon';
import { ProductCardSurface } from './ui';

interface ProductCardProps {
  product: Product;
  onOpen: (productId: string) => void;
  /** Stagger, in ms, for the reveal-on-scroll entrance. */
  index?: number;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onOpen, index = 0 }) => {
  const { config, addToCart, wishlist, toggleWishlist } = useStore();
  const soldOut = isSoldOut(product);
  const onSale = isOnSale(product);
  // `null` means stock isn't tracked (Services/Jobs): never sold out, and the
  // "only N left" badge below must not fire either.
  const remaining = totalStock(product);
  const lowStock = remaining !== null && remaining > 0 && remaining <= 5;

  return (
    <div className="group h-full">
      {/* The reveal wrapper starts hidden; .is-visible is added when it scrolls
          into view. Delay staggers a row of cards into a gentle cascade. */}
      <div
        className="fas-reveal"
        data-reveal
        style={{ transitionDelay: `${Math.min(index, 7) * 60}ms` }}
      >
        <ProductCardSurface className="h-full flex flex-col">
          {/* Floating badges/wishlist sit as siblings of the image button —
              nesting one <button> inside another is invalid HTML and confuses
              screen readers. The relative wrapper anchors them to the image,
              and pointer-events-none keeps badges from intercepting clicks. */}
          <div className="relative">
            <button
              onClick={() => onOpen(product.id)}
              className="block w-full bg-brand-offwhite dark:bg-dark-card overflow-hidden focus:outline-none focus:ring-2 focus:ring-brand-gold-ink dark:focus:ring-brand-gold"
              aria-label={`View ${product.name}`}
            >
              <img
                className={`w-full h-64 object-cover transition-transform duration-700 ease-out group-hover:scale-105 ${soldOut ? 'opacity-60 grayscale' : ''}`}
                src={primaryImage(product)}
                alt={product.name}
                loading="lazy"
              />
            </button>
            {onSale && (
              <span className="absolute top-3 left-3 z-10 bg-brand-gold text-brand-dark text-xs font-bold px-2.5 py-1 rounded-full shadow-gold-sm pointer-events-none">
                SALE
              </span>
            )}
            {soldOut && (
              <span className="absolute top-3 right-3 z-10 bg-brand-dark text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg pointer-events-none">
                SOLD OUT
              </span>
            )}
            {!soldOut && lowStock && !onSale && (
              <span className="absolute top-3 right-3 z-10 bg-brand-gold-light text-brand-dark text-xs font-bold px-2.5 py-1 rounded-full shadow-gold-sm pointer-events-none">
                Only {remaining} left
              </span>
            )}
            <button
              onClick={() => toggleWishlist(product.id)}
              className="absolute bottom-3 right-3 z-10 p-2.5 bg-white/90 dark:bg-black/50 backdrop-blur-sm rounded-full shadow-sm hover:scale-110 transition-transform"
              aria-label={wishlist.includes(product.id) ? 'Remove from wishlist' : 'Add to wishlist'}
            >
              <HeartIcon filled={wishlist.includes(product.id)} />
            </button>
          </div>

          <div className="p-6 sm:p-7 flex-grow flex flex-col">
            <p className="text-xs font-semibold text-brand-gold-ink dark:text-brand-gold mb-2 uppercase tracking-wider">{product.category}</p>
            <button onClick={() => onOpen(product.id)} className="text-left focus:outline-none">
              <h3 className="text-lg sm:text-xl font-semibold text-brand-dark dark:text-dark-text mb-2.5 hover:text-brand-gold dark:hover:text-brand-gold transition-colors line-clamp-2">
                {product.name}
              </h3>
            </button>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-5 flex-grow line-clamp-2">
              {product.description}
            </p>

            <div className="flex flex-wrap justify-between items-center gap-3 pt-4 mt-auto border-t border-gray-100 dark:border-dark-border">
              <p className="text-2xl sm:text-2xl font-bold text-brand-dark dark:text-dark-text">
                {formatPriceOrEnquiry(product.price, config.currency)}
                {onSale && product.compareAtPrice !== null && (
                  <span className="text-sm font-normal text-gray-400 line-through ml-2">
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
                  className="flex-1 min-w-[120px] bg-brand-dark text-white py-3 px-4 rounded-full hover:bg-gray-800 dark:hover:bg-gray-700 hover:shadow-gold-sm shadow-gold-sm transition-all duration-300 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap text-sm font-medium"
                >
                  <ShoppingCartIcon className="w-4 h-4" />
                  <span>{soldOut ? 'Sold out' : 'Add to cart'}</span>
                </button>
              )}
            </div>
          </div>
        </ProductCardSurface>
      </div>
    </div>
  );
};

export default ProductCard;