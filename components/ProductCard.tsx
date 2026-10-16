import React from 'react';
import type { Product } from '../types';
import { useStore } from '../contexts/StoreContext';
import { formatPrice, formatPriceOrEnquiry } from '../lib/format';
import { isContactOnly, isOnSale, isSoldOut, primaryImage, totalStock } from '../lib/product';
import ContactUs from './ContactUs';
import ShoppingCartIcon from './icons/ShoppingCartIcon';
import { HeartIcon } from './icons/HeartIcon';

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
        <div className="h-full bg-white dark:bg-dark-card rounded-2xl shadow-card hover:shadow-card-hover ring-1 ring-black/5 dark:ring-white/10 overflow-hidden transition-all duration-300 lg:hover:-translate-y-1.5 flex flex-col">
          <button
            onClick={() => onOpen(product.id)}
            className="relative block w-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-brand-gold-ink dark:focus:ring-brand-gold"
            aria-label={`View ${product.name}`}
          >
            <img
              className={`w-full h-64 object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06] ${soldOut ? 'opacity-50' : ''}`}
              src={primaryImage(product)}
              alt={product.name}
              loading="lazy"
            />
            {onSale && (
              <span className="absolute top-3 left-3 bg-brand-gold text-brand-dark text-xs font-bold px-2.5 py-1 rounded-full shadow-gold-sm">
                SALE
              </span>
            )}
            {soldOut && (
              <span className="absolute top-3 right-3 bg-brand-dark text-brand-offwhite text-xs font-bold px-2.5 py-1 rounded-full">
                SOLD OUT
              </span>
            )}
            {!soldOut && lowStock && !onSale && (
              <span className="absolute top-3 right-3 bg-brand-dark text-brand-offwhite text-xs font-bold px-2.5 py-1 rounded-full">
                Only {remaining} left
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleWishlist(product.id);
              }}
              className="absolute bottom-3 right-3 p-2 bg-white/80 dark:bg-black/40 backdrop-blur-sm rounded-full shadow-sm hover:scale-110 transition-transform z-10"
              aria-label={wishlist.includes(product.id) ? "Remove from wishlist" : "Add to wishlist"}
            >
              <HeartIcon filled={wishlist.includes(product.id)} />
            </button>
          </button>

          <div className="p-5 sm:p-6 flex-grow flex flex-col">
            <p className="text-xs font-semibold text-brand-gold-ink dark:text-brand-gold mb-1.5 uppercase tracking-wider">{product.category}</p>
            <button onClick={() => onOpen(product.id)} className="text-left focus:outline-none">
              <h3 className="text-lg sm:text-xl font-semibold text-brand-dark dark:text-dark-text mb-2 hover:text-brand-gold-ink dark:hover:text-brand-gold transition-colors">
                {product.name}
              </h3>
            </button>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 flex-grow line-clamp-3">
              {product.description}
            </p>

            <div className="flex flex-wrap justify-between items-center gap-3 pt-3 mt-auto border-t border-gray-100 dark:border-white/5">
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
                  className="bg-brand-dark text-white py-2 px-4 rounded-full hover:bg-gray-800 dark:hover:bg-gray-700 hover:shadow-gold-sm transition-all duration-300 flex items-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <ShoppingCartIcon />
                  <span>{soldOut ? 'Sold out' : 'Add'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;