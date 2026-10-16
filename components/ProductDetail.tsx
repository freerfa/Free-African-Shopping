import React, { useEffect, useMemo, useState } from 'react';
import type { Product, ProductReview } from '../types';
import { useStore } from '../contexts/StoreContext';
import { api, ApiError } from '../lib/api';
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
import { goldButtonClass, inputClass, labelClass, Section, Stars, StarInput } from './ui';
import ChevronRightIcon from './icons/ChevronRightIcon';
import { HeartIcon } from './icons/HeartIcon';

interface ProductDetailProps {
  product: Product | undefined;
  onBack: () => void;
  onAdd: (productId: string, variantId: string | null, quantity: number) => void;
  onOpen: (productId: string) => void;
}

const ProductDetail: React.FC<ProductDetailProps> = ({ product, onBack, onAdd, onOpen }) => {
  const { config, products, reviewSummaries, refreshReviewSummaries, wishlist, toggleWishlist } = useStore();
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selection, setSelection] = useState<Record<string, string>>({});

  // Approved reviews for this product, plus the "leave a review" form state.
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [author, setAuthor] = useState('');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewThanks, setReviewThanks] = useState(false);

  // Approved reviews load per product; the aggregate badge comes from the
  // shared `reviewSummaries` map so it matches the card without a second call.
  useEffect(() => {
    if (!product) return;
    let cancelled = false;
    setReviewsLoading(true);
    setReviewThanks(false);
    setReviewError('');
    api
      .getReviews(product.id)
      .then((result) => {
        if (!cancelled) setReviews(result.reviews);
      })
      .catch(() => {
        // Non-fatal: the section simply shows no reviews if this fails.
        if (!cancelled) setReviews([]);
      })
      .finally(() => {
        if (!cancelled) setReviewsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [product]);

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

  // Submit lands as `pending`; it only shows publicly once an admin approves it.
  const summary = product ? reviewSummaries[product.id] : undefined;

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || submittingReview) return;
    if (!author.trim()) {
      setReviewError('Please tell us your name.');
      return;
    }
    if (comment.trim().length < 4) {
      setReviewError('Please write a little more in your review.');
      return;
    }
    setSubmittingReview(true);
    setReviewError('');
    try {
      await api.submitReview({
        productId: product.id,
        author: author.trim(),
        rating,
        comment: comment.trim(),
      });
      setReviewThanks(true);
      setAuthor('');
      setComment('');
      setRating(5);
      // The aggregate (average/count) will move once the review is approved;
      // refresh so an immediately-approved review reflects at once.
      void refreshReviewSummaries();
    } catch (err) {
      setReviewError(err instanceof ApiError ? err.message : 'Could not submit your review.');
    } finally {
      setSubmittingReview(false);
    }
  };

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
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl overflow-hidden shadow-card ring-1 ring-black/5 dark:ring-white/10 bg-white dark:bg-dark-card group">
            <img
              src={images[activeImage] ?? images[0]}
              alt={product.name}
              className="w-full h-80 sm:h-[28rem] object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            />
          </div>
          {images.length > 1 && (
            <div className="flex gap-3 mt-4 flex-wrap">
              {images.map((src, index) => (
                <button
                  key={`${src}-${index}`}
                  onClick={() => setActiveImage(index)}
                  className={`w-20 h-20 rounded-lg overflow-hidden ring-2 transition-all duration-200 hover:scale-105 hover:shadow-md ${
                    index === activeImage
                      ? 'ring-brand-gold-ink dark:ring-brand-gold'
                      : 'ring-transparent hover:ring-gray-300 dark:hover:ring-dark-border'
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
          <div className="flex items-center justify-between mt-1">
            <h1 className="text-3xl md:text-4xl font-bold text-brand-dark dark:text-dark-text">
              {product.name}
            </h1>
            <button
              onClick={() => toggleWishlist(product.id)}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
              aria-label={wishlist.includes(product.id) ? "Remove from wishlist" : "Add to wishlist"}
            >
              <HeartIcon filled={wishlist.includes(product.id)} />
            </button>
          </div>

          {/* Star-rating summary from the shared aggregates map. Only shown once
              at least one review has been approved. */}
          {summary && summary.count > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <Stars rating={summary.average} size={18} />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {summary.average.toFixed(1)} out of 5 &middot; {summary.count} review
                {summary.count === 1 ? '' : 's'}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-baseline gap-3 mt-4 pb-6 border-b dark:border-dark-border">
            <span className="text-4xl font-bold text-brand-dark dark:text-dark-text">
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

      {/* Customer reviews: the approved list plus a moderated submit form. */}
      <section className="mt-16 pt-10 border-t dark:border-dark-border">
        <Section title="Customer reviews" />
        <div className="max-w-3xl mx-auto space-y-8">
          {reviewsLoading ? (
            <p className="text-center text-gray-600 dark:text-gray-400">Loading reviews…</p>
          ) : reviews.length === 0 ? (
            <p className="text-center text-gray-600 dark:text-gray-400">
              No reviews yet — be the first to share your thoughts.
            </p>
          ) : (
            <ul className="space-y-5">
              {reviews.map((review) => (
                <li key={review.id} className="bg-white dark:bg-dark-card rounded-lg shadow p-5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Stars rating={review.rating} />
                    <span className="font-semibold text-brand-dark dark:text-dark-text">{review.author}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(review.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-300 mt-2 whitespace-pre-line">{review.comment}</p>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleSubmitReview} className="bg-white dark:bg-dark-card rounded-lg shadow p-6 space-y-4">
            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-text">Leave a review</h3>
            {reviewThanks && (
              <p className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 p-3 rounded-md">
                Thank you! Your review has been submitted and will appear once our team approves it.
              </p>
            )}
            {reviewError && (
              <p className="text-sm text-red-500 bg-red-100 dark:bg-red-900/50 dark:text-red-300 p-3 rounded-md">
                {reviewError}
              </p>
            )}
            <div>
              <label className={labelClass} htmlFor="review-rating">Your rating</label>
              <div className="mt-1">
                <StarInput value={rating} onChange={setRating} />
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="review-author">Your name</label>
              <input
                id="review-author"
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className={inputClass}
                placeholder="e.g. Amara O."
                autoComplete="name"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="review-comment">Your review</label>
              <textarea
                id="review-comment"
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className={inputClass}
                placeholder="What did you think of this product?"
              />
            </div>
            <button type="submit" disabled={submittingReview} className={goldButtonClass}>
              {submittingReview ? 'Submitting…' : 'Submit review'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
};

export default ProductDetail;