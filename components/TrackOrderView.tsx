import React, { useState } from 'react';
import type { OrderStatus, TrackedOrder } from '../types';
import { api, ApiError } from '../lib/api';
import { formatPrice } from '../lib/format';
import { useStore } from '../contexts/StoreContext';
import { goldButtonClass, inputClass, labelClass, Section } from './ui';

interface TrackOrderViewProps {
  /** Returns to the storefront when the shopper closes the lookup. */
  onBack: () => void;
}

/** The stages an order moves through, in order, for the status timeline. */
const STATUS_STEPS: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered'];

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Received',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

/** Short blurb under the active stage so the timeline explains itself. */
const STATUS_HINT: Record<OrderStatus, string> = {
  pending: 'We have your order and are waiting to confirm payment.',
  processing: 'Payment confirmed — we are getting your order ready.',
  shipped: 'Your order is on its way.',
  delivered: 'Delivered. Enjoy!',
};

/**
 * Public order tracking. A shopper gives the FAS-###### reference from their
 * confirmation plus the email or phone they ordered with; the server matches
 * both and returns only a safe subset of the order (never the address or the
 * other contact detail). Nothing here needs an account or a token.
 */
const TrackOrderView: React.FC<TrackOrderViewProps> = ({ onBack }) => {
  const { config } = useStore();

  const [reference, setReference] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<TrackedOrder | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!reference.trim() || (!email.trim() && !phone.trim())) {
      setError('Enter your order reference and the email or phone you used.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await api.trackOrder(reference, email, phone);
      setOrder(result.order);
    } catch (err) {
      setOrder(null);
      setError(
        err instanceof ApiError
          ? err.message
          : 'We could not look up that order. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const startOver = () => {
    setOrder(null);
    setReference('');
    setEmail('');
    setPhone('');
    setError('');
  };

  // The active stage is the first step the order has not passed yet.
  const reachedIndex = order ? STATUS_STEPS.indexOf(order.status) : -1;

  return (
    <div className="container mx-auto px-4 sm:px-6 py-12">
      <Section
        title="Track your order"
        subtitle="Enter the reference from your confirmation, plus the email or phone you ordered with."
      />

      <div className="max-w-2xl mx-auto">
        {!order && (
          <form onSubmit={handleSubmit} className="bg-white dark:bg-dark-card shadow-xl rounded-lg p-6 space-y-5">
            {error && (
              <p className="text-red-500 bg-red-100 dark:bg-red-900/50 dark:text-red-300 p-3 rounded-md text-sm">
                {error}
              </p>
            )}
            <div>
              <label className={labelClass} htmlFor="track-reference">Order reference</label>
              <input
                id="track-reference"
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className={inputClass}
                placeholder="FAS-000123"
                autoComplete="off"
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="track-email">Email used</label>
                <input
                  id="track-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="track-phone">Phone used</label>
                <input
                  id="track-phone"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                  placeholder="+234 801 234 5678"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Give us <strong>either</strong> the email <strong>or</strong> the phone you ordered
              with — one of them is enough.
            </p>
            <button type="submit" className={goldButtonClass} disabled={loading}>
              {loading ? 'Looking up…' : 'Track order'}
            </button>
          </form>
        )}

        {order && (
          <div className="bg-white dark:bg-dark-card shadow-xl rounded-lg p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b dark:border-dark-border pb-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Order</p>
                <p className="text-2xl font-bold text-brand-gold-ink dark:text-brand-gold tracking-wider">
                  {order.reference}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Placed {new Date(order.createdAt).toLocaleString()} for {order.customerName}
                </p>
              </div>
              <span className="text-sm font-semibold px-3 py-1 rounded-full bg-brand-gold/15 text-brand-gold-ink dark:text-brand-gold">
                {STATUS_LABEL[order.status]}
              </span>
            </div>

            {/* Status timeline: each step marks itself done once the order has
                reached (or passed) it. */}
            <ol className="space-y-3">
              {STATUS_STEPS.map((step, index) => {
                const done = index <= reachedIndex;
                const current = index === reachedIndex;
                return (
                  <li key={step} className="flex gap-3">
                    <span
                      className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        done
                          ? 'bg-brand-gold text-brand-dark'
                          : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {done ? '✓' : index + 1}
                    </span>
                    <div>
                      <p className={`font-medium ${current ? 'text-brand-gold-ink dark:text-brand-gold' : 'dark:text-dark-text'}`}>
                        {STATUS_LABEL[step]}
                      </p>
                      {current && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{STATUS_HINT[step]}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="border-t dark:border-dark-border pt-4 space-y-2">
              <p className="font-semibold text-brand-dark dark:text-dark-text">Items</p>
              <ul className="space-y-1 text-sm">
                {order.lines.map((line, i) => (
                  <li key={`${order.reference}-${i}`} className="flex justify-between gap-4">
                    <span className="text-gray-600 dark:text-gray-300 min-w-0">
                      {line.quantity} &times; {line.name}
                      {line.variantLabel && (
                        <span className="text-brand-gold-ink dark:text-brand-gold text-xs ml-2">{line.variantLabel}</span>
                      )}
                    </span>
                    <span className="shrink-0 dark:text-dark-text">
                      {formatPrice(line.price * line.quantity, config.currency)}
                    </span>
                  </li>
                ))}
              </ul>

              {order.discount !== undefined && order.discount > 0 && (
                <div className="flex justify-between text-sm text-green-700 dark:text-green-400">
                  <span>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</span>
                  <span>&minus;{formatPrice(order.discount, config.currency)}</span>
                </div>
              )}

              <div className="flex justify-between text-lg font-bold pt-2 border-t dark:border-dark-border">
                <span className="text-brand-dark dark:text-dark-text">Total</span>
                <span className="text-brand-dark dark:text-dark-text">
                  {formatPrice(order.total, config.currency)}
                </span>
              </div>
            </div>

            {order.paymentMethod && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Payment:{' '}
                {order.paymentConfirmed
                  ? 'confirmed — thank you!'
                  : 'awaiting confirmation from our team. We will update this page once the payment arrives.'}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <button onClick={startOver} className={goldButtonClass}>Track another order</button>
              <button
                onClick={onBack}
                className="px-6 py-3 rounded-full text-sm font-semibold border border-gray-300 dark:border-dark-border hover:border-brand-gold-ink dark:hover:border-brand-gold transition-colors"
              >
                Back to shop
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrackOrderView;
