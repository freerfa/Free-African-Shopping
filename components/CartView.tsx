import React from 'react';
import { useStore } from '../contexts/StoreContext';
import { formatPrice } from '../lib/format';
import { primaryImage, variantLabel } from '../lib/product';
import { goldButtonClass, Section } from './ui';
import TrashIcon from './icons/TrashIcon';

interface CartViewProps {
  onCheckout: () => void;
  onContinueShopping: () => void;
}

const CartView: React.FC<CartViewProps> = ({ onCheckout, onContinueShopping }) => {
  const { config, detailedCart, cartSubtotal, updateCartQuantity, removeFromCart, clearCart } = useStore();

  // `available === null` means the listing doesn't track stock (a Service or a
  // Job), so it can never be over-stocked.
  const overstocked = detailedCart.filter(
    (item) => item.available !== null && item.quantity > item.available,
  );
  const canCheckout = detailedCart.length > 0 && overstocked.length === 0;

  if (detailedCart.length === 0) {
    return (
      <div className="container mx-auto px-4 sm:px-6 py-12">
        <Section title="Your Shopping Cart" />
        <p className="text-center text-gray-600 dark:text-gray-400 mb-8">Your cart is empty.</p>
        <div className="text-center">
          <button onClick={onContinueShopping} className={goldButtonClass}>Start shopping</button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 py-12">
      <Section title="Your Shopping Cart" subtitle={`${detailedCart.length} line item(s)`} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white dark:bg-dark-card shadow-xl rounded-lg p-6">
          {detailedCart.map((item) => {
            const overstockedLine = item.available !== null && item.quantity > item.available;
            return (
              <div
                key={item.key}
                className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b dark:border-dark-border py-4 last:border-b-0"
              >
                <img src={primaryImage(item.product)} alt={item.product.name} className="w-20 h-20 object-cover rounded-md shrink-0" />

                {/* On phones the fixed-width stepper + price + trash cannot sit
                    beside the image, so the details claim the first line exactly
                    (img 5rem + 1.5rem slack for the gap) and the controls wrap
                    to a right-aligned second line. sm+ is the original single row. */}
                <div className="flex-grow min-w-0 basis-[calc(100%_-_6.5rem)] sm:basis-auto">
                  <h4 className="font-semibold text-lg dark:text-dark-text truncate">{item.product.name}</h4>
                  {item.variant && (
                    <p className="text-xs text-brand-gold-ink dark:text-brand-gold">{variantLabel(item.variant)}</p>
                  )}
                  <p className="text-gray-500 dark:text-gray-400">
                    {item.unitPrice === null
                      ? 'Price on enquiry'
                      : `${formatPrice(item.unitPrice, config.currency)} each`}
                  </p>
                  {overstockedLine && (
                    <p className="text-xs text-red-500 mt-1">
                      {item.available === 0
                        ? 'Now out of stock — remove to continue'
                        : `Only ${item.available} left — reduce the quantity to continue`}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 sm:gap-4 shrink-0 ml-auto">
                  <div className="flex items-center border border-gray-300 dark:border-dark-border rounded-full">
                    <button
                      onClick={() => updateCartQuantity(item.key, item.quantity - 1)}
                      className="px-3 py-1 font-bold"
                      aria-label="Decrease quantity"
                    >
                      &minus;
                    </button>
                    <span className="px-1 w-8 text-center text-sm dark:text-dark-text">{item.quantity}</span>
                    <button
                      onClick={() => updateCartQuantity(item.key, item.quantity + 1)}
                      className="px-3 py-1 font-bold disabled:opacity-40"
                      disabled={item.available !== null && item.quantity >= item.available}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                  <p className="font-semibold w-24 text-right dark:text-dark-text">
                    {formatPrice(item.lineTotal, config.currency)}
                  </p>
                  <button
                    onClick={() => removeFromCart(item.key)}
                    className="text-red-500 hover:text-red-700 transition-colors"
                    aria-label={`Remove ${item.product.name}`}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-dark-card shadow-xl rounded-lg p-6 lg:sticky lg:top-32">
            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-text mb-4">Order Summary</h3>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
              <span className="font-semibold dark:text-dark-text">{formatPrice(cartSubtotal, config.currency)}</span>
            </div>
            {/* The demo store has no shipping model — checkout charges the
                subtotal exactly, so shipping is honestly always free. */}
            <div className="flex justify-between text-sm mb-4">
              <span className="text-gray-600 dark:text-gray-400">Shipping</span>
              <span className="font-semibold text-green-600">Free</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-4 border-t dark:border-dark-border">
              <span className="text-brand-dark dark:text-dark-text">Total</span>
              <span className="text-brand-dark dark:text-dark-text">{formatPrice(cartSubtotal, config.currency)}</span>
            </div>

            {overstocked.length > 0 && (
              <p className="text-xs text-red-500 mt-4">
                {overstocked.length === 1
                  ? 'One item has more in your cart than is in stock.'
                  : `${overstocked.length} items have more in your cart than is in stock.`}{' '}
                Adjust the quantities to continue.
              </p>
            )}

            <button
              onClick={onCheckout}
              disabled={!canCheckout}
              className={`${goldButtonClass} w-full mt-6`}
            >
              Proceed to Checkout
            </button>
            <button
              onClick={onContinueShopping}
              className="w-full mt-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-brand-gold-ink dark:hover:text-brand-gold transition-colors"
            >
              Continue shopping
            </button>
            <button
              onClick={() => {
                if (window.confirm('Remove all items from your cart?')) clearCart();
              }}
              className="w-full mt-1 py-2 text-sm text-red-500 hover:text-red-700 transition-colors"
            >
              Clear cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartView;