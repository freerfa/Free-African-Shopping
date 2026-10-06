import React, { useEffect, useMemo, useState } from 'react';
import type { Product } from '../types';
import { useStore } from '../contexts/StoreContext';
import { formatPrice, formatPriceOrEnquiry } from '../lib/format';
import ProductCard from './ProductCard';
import {
  findVariant,
  isContactOnly,
  isOnSale,
  isSoldOut,
  optionNames,
  primaryImage,
  valuesForOption,
  variantLabel,
} from '../lib/product';
import ContactUs from './ContactUs';
import { goldButtonClass, Section } from './ui';
import ChevronRightIcon from './icons/ChevronRightIcon';

interface ProductDetailProps {
  product: Product | undefined;
  onBack: () => void;
  onAdd: (productId: string, variantId: string | null, quantity: number) => void;
  onOpen: (productId: string) => void;
}

const ProductDetail: React.FC<ProductDetailProps> = ({ product, onBack, onAdd, onOpen }) => {
  const { config, products } = useStore();
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selection, setSelection] = useState<Record<string, string>>({});

  // Reset local state whenever a different product is opened.
  useEffect(() => {
    setActiveImage(0);
    setQuantity(1);
    setSelection({});
  }, [product?.id]);

  const names = useMemo(() => (product ? optionNames(product) : []), [product]);
  const selectedVariant = useMemo(
    () => (product ? findVariant(product, selection) : undefined),
    [product, selection],
  );

  // Clamp the chosen quantity when the shopper switches to a variant with less
  // stock, so the number on screen is actually what gets added to the cart.
  // Before every option is chosen the availability is unknown, so leave it alone.
  useEffect(() => {
    if (!product) return;
    if (names.length > 0 && !selectedVariant) return;
    const availableNow = selectedVariant ? selectedVariant.stock : product.stock;
    // No tracked stock (Services/Jobs) means no ceiling to clamp against.
    if (availableNow === null) return;
    setQuantity((q) => Math.max(1, Math.min(q, Math.max(availableNow, 1))));
  }, [product, names, selectedVariant]);

  // "You may also like": live products, same category first, current one excluded.
  const related = useMemo(() => {
    if (!product) return [];
    const others = products.filter((p) => p.id !== product.id && p.status === 'live');
    const sameCategory = others.filter((p) => p.category === product.category);
    const rest = others.filter((p) => p.category !== product.category);
    return [...sameCategory, ...rest].slice(0, 4);
  }, [product, products]);

  if (!product) {
    return (
      <div className="container mx-auto px-6 py-16 text-center">
        <Section title="Product not found" subtitle="It may have been removed from the store." />
        <button onClick={onBack} className={goldButtonClass}>Back to shop</button>
      </div>
    );
  }

  const soldOut = isSoldOut(product);
  const onSale = isOnSale(product);
  // With variants, availability is unknown until every option is chosen.
  const needsSelection = names.length > 0 && !selectedVariant;
  const available = selectedVariant ? selectedVariant.stock : product.stock;
  // `null` availability is "not tracked", not "none left" — never block on it.
  const blocked = soldOut || needsSelection || available === 0;
  const displayPrice = selectedVariant ? selectedVariant.price : product.price;
  const images = product.images.length > 0 ? product.images : [primaryImage(product)];

  return (
    <div className="container mx-auto px-4 sm:px-6 py-8">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-brand-gold-ink dark:hover:text-brand-gold transition-colors mb-6"
      >
        <span className="rotate-180"><ChevronRightIcon /></span>
        Back to shop
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        <div>
          <div className="rounded-lg overflow-hidden shadow-xl bg-white dark:bg-dark-card">
            <img
              src={images[activeImage] ?? images[0]}
              alt={product.name}
              className="w-full h-72 sm:h-96 object-cover"
            />
          </div>
          {images.length > 1 && (
            <div className="flex gap-3 mt-4 flex-wrap">
              {images.map((src, index) => (
                <button
                  key={`${src}-${index}`}
                  onClick={() => setActiveImage(index)}
                  className={`w-20 h-20 rounded-md overflow-hidden border-2 transition-colors ${
                    index === activeImage ? 'border-brand-gold-ink dark:border-brand-gold' : 'border-transparent'
                  }`}
                  aria-label={`View image ${index + 1}`}
                >
                  <img src={src} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-medium text-brand-gold-ink dark:text-brand-gold uppercase tracking-wider">{product.category}</p>
          <h1 className="text-3xl md:text-4xl font-bold text-brand-dark dark:text-dark-text mt-1">
            {product.name}
          </h1>

          <div className="flex flex-wrap items-baseline gap-3 mt-4">
            <span className="text-3xl font-bold text-brand-dark dark:text-dark-text">
              {formatPriceOrEnquiry(displayPrice, config.currency)}
            </span>
            {onSale && product.compareAtPrice !== null && (
              <span className="text-xl text-gray-400 line-through">
                {formatPrice(product.compareAtPrice, config.currency)}
              </span>
            )}
            {product.sku && <span className="text-xs text-gray-400 ml-auto">SKU: {product.sku}</span>}
          </div>

          <p className="text-gray-600 dark:text-gray-400 mt-6 leading-relaxed">{product.description}</p>

          {names.map((name) => (
            <div key={name} className="mt-6">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{name}</p>
              <div className="flex flex-wrap gap-2">
                {valuesForOption(product, name).map((value) => {
                  const active = selection[name] === value;
                  // Disable this value only when *every* variant carrying it is out
                  // of stock — with a second option, one combination can be sold out
                  // while another combination of the same value is still available.
                  const variantsWithValue = product.variants.filter((v) => v.options[name] === value);
                  const valueSoldOut =
                    variantsWithValue.length > 0 && variantsWithValue.every((v) => v.stock <= 0);
                  return (
                    <button
                      key={value}
                      onClick={() => setSelection((prev) => ({ ...prev, [name]: value }))}
                      disabled={valueSoldOut}
                      className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors disabled:opacity-40 disabled:line-through disabled:cursor-not-allowed ${
                        active
                          ? 'border-brand-gold bg-brand-gold text-brand-dark'
                          : 'border-gray-300 dark:border-dark-border hover:border-brand-gold-ink dark:hover:border-brand-gold'
                      }`}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* A Service or a Job is arranged by enquiry, so there is no quantity
              stepper and no cart — just the store's contact details. */}
          {isContactOnly(product) ? (
            <ContactUs product={product} variant={selectedVariant ?? null} />
          ) : (
            <>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <div className="flex items-center border border-gray-300 dark:border-dark-border rounded-full">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="px-4 py-2 text-lg font-bold disabled:opacity-40"
                    disabled={quantity <= 1}
                    aria-label="Decrease quantity"
                  >
                    &minus;
                  </button>
                  <span className="px-2 w-10 text-center font-semibold dark:text-dark-text">{quantity}</span>
                  <button
                    onClick={() =>
                      setQuantity((q) =>
                        available === null ? q + 1 : Math.min(Math.max(available, 1), q + 1),
                      )
                    }
                    className="px-4 py-2 text-lg font-bold disabled:opacity-40"
                    disabled={available !== null && available > 0 && quantity >= available}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>

                <button
                  onClick={() => onAdd(product.id, selectedVariant ? selectedVariant.id : null, quantity)}
                  disabled={blocked}
                  className={goldButtonClass}
                >
                  {soldOut ? 'Sold out' : needsSelection ? 'Select options' : 'Add to Cart'}
                </button>
              </div>

              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                {soldOut
                  ? 'Currently out of stock.'
                  : needsSelection
                    ? 'Choose the available options to continue.'
                    : `${available} in stock${selectedVariant ? ` for ${variantLabel(selectedVariant)}` : ''}.`}
              </p>
            </>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16 pt-10 border-t dark:border-dark-border">
          <Section title="You may also like" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default ProductDetail;