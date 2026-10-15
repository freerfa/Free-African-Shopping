import React, { useCallback, useEffect, useState } from 'react';
import type { ProductReview } from '../../types';
import { api, ApiError } from '../../lib/api';
import { useStore } from '../../contexts/StoreContext';
import { Stars } from '../ui';

interface ReviewPanelProps {
  onNotice: (ok: boolean, text: string) => void;
}

/**
 * Admin → Reviews: moderate the customer reviews submitted on product pages.
 *
 * New reviews land as `pending` and never appear publicly until approved here.
 * Moderating uses `orders.editRecords` — the same right that maintains order
 * records — and the server guards every route with it, so this panel is only
 * reached by an account that already holds that right.
 */
const ReviewPanel: React.FC<ReviewPanelProps> = ({ onNotice }) => {
  const { products } = useStore();
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const productName = useCallback(
    (productId: string) => products.find((p) => p.id === productId)?.name ?? 'Unknown product',
    [products],
  );

  const load = useCallback(async () => {
    try {
      const result = await api.getAdminReviews();
      setReviews(result.reviews);
    } catch (error) {
      onNotice(false, error instanceof ApiError ? error.message : 'Could not load reviews.');
    } finally {
      setLoading(false);
    }
  }, [onNotice]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSetStatus = async (review: ProductReview, status: 'pending' | 'approved') => {
    setBusyId(review.id);
    try {
      await api.setReviewStatus(review.id, status);
      onNotice(true, status === 'approved' ? 'Review approved.' : 'Review hidden again.');
      await load();
    } catch (error) {
      onNotice(false, error instanceof ApiError ? error.message : 'Could not update that review.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (review: ProductReview) => {
    if (!window.confirm(`Delete this review by ${review.author}? This cannot be undone.`)) return;
    setBusyId(review.id);
    try {
      await api.deleteReview(review.id);
      onNotice(true, 'Review deleted.');
      await load();
    } catch (error) {
      onNotice(false, error instanceof ApiError ? error.message : 'Could not delete that review.');
    } finally {
      setBusyId(null);
    }
  };

  const pendingCount = reviews.filter((r) => r.status === 'pending').length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white dark:bg-dark-card shadow rounded-lg p-6">
        <h3 className="font-bold text-brand-dark dark:text-dark-text">Product reviews</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          New reviews wait here as <strong>pending</strong> and only show on the product page once
          you approve them.{' '}
          {pendingCount > 0 && (
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              {pendingCount} awaiting approval.
            </span>
          )}
        </p>
      </div>

      {loading ? (
        <p className="text-center text-gray-600 dark:text-gray-400 py-12">Loading reviews…</p>
      ) : reviews.length === 0 ? (
        <p className="text-center text-gray-600 dark:text-gray-400 py-12">
          No reviews yet. They will appear here as shoppers leave them.
        </p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((review) => (
            <li
              key={review.id}
              className={`bg-white dark:bg-dark-card shadow rounded-lg p-5 border-l-4 ${
                review.status === 'approved'
                  ? 'border-green-400'
                  : 'border-amber-400'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-brand-dark dark:text-dark-text">{review.author}</p>
                    <Stars rating={review.rating} />
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        review.status === 'approved'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                      }`}
                    >
                      {review.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {productName(review.productId)} &middot; {new Date(review.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {review.status === 'approved' ? (
                    <button
                      onClick={() => handleSetStatus(review, 'pending')}
                      disabled={busyId === review.id}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-300 dark:border-dark-border hover:border-brand-gold-ink dark:hover:border-brand-gold transition-colors disabled:opacity-40"
                    >
                      Hide
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSetStatus(review, 'approved')}
                      disabled={busyId === review.id}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold bg-brand-gold text-brand-dark hover:bg-brand-gold-light transition-colors disabled:opacity-40"
                    >
                      Approve
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(review)}
                    disabled={busyId === review.id}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-3 whitespace-pre-line">{review.comment}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ReviewPanel;
