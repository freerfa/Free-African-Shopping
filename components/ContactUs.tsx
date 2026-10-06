import React, { useState } from 'react';
import type { Product, ProductVariant } from '../types';
import { useStore } from '../contexts/StoreContext';
import { variantLabel } from '../lib/product';

interface ContactUsProps {
  product: Product;
  /** Chosen options, so the enquiry says which one the shopper meant. */
  variant?: ProductVariant | null;
  /** `card` is the compact form used on product grids. */
  layout?: 'card' | 'detail';
  /**
   * Card layout only: called instead of following a link. The card's button
   * sends the shopper to the listing, where the full contact panel lives —
   * a one-tap mailto straight from the grid was easy to mis-tap and hid the
   * phone number behind a long-press on a phone.
   */
  onOpen?: () => void;
}

/**
 * The "Contact us" path for a listing with no fixed price (a Service or a Job),
 * shown **instead of** Add to cart — there is nothing to check out, the shopper
 * just gets in touch.
 *
 * The mailto is pre-filled with the listing name (and chosen options) so the
 * message already says what it is about. Contact details come from the listing
 * itself when the admin filled them in (a Service or Job can name a different
 * person or number), otherwise from the store-wide settings the footer uses —
 * so an enquiry always reaches someone.
 */
const ContactUs: React.FC<ContactUsProps> = ({
  product,
  variant = null,
  layout = 'detail',
  onOpen,
}) => {
  const { config } = useStore();
  // Open by default on the product page (there is room for it); collapsed on a
  // card, where a tap should just open the listing.
  const [open, setOpen] = useState(layout === 'detail');

  // A per-listing detail wins, and each one falls back on its own — so naming a
  // person without a number still shows the store's number.
  const pick = (listingValue: string, storeValue: string): string =>
    listingValue.trim() || storeValue.trim();
  const name = (product.contactName ?? '').trim();
  const email = pick(product.contactEmail ?? '', config.contactEmail);
  const phone = pick(product.contactPhone ?? '', config.contactPhone);
  const address = config.contactAddress.trim();
  const nothingToShow = !email && !phone && !address;

  const subject = `Enquiry: ${product.name}${variant ? ` (${variantLabel(variant)})` : ''}`;
  const body = `Hello ${config.storeName},\n\nI would like to know more about "${product.name}".\n\n`;
  const mailto = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const tel = `tel:${phone.replace(/\s+/g, '')}`;

  const buttonClass =
    layout === 'card'
      ? 'py-2 px-4 rounded-full text-sm font-semibold text-brand-dark bg-brand-gold hover:bg-brand-gold-light focus:outline-none focus:ring-2 focus:ring-brand-gold-ink dark:focus:ring-brand-gold transition-colors duration-300 whitespace-nowrap'
      : 'flex justify-center items-center gap-2 py-3 px-6 rounded-full shadow-sm text-sm font-bold text-brand-dark bg-brand-gold hover:bg-brand-gold-light focus:outline-none focus:ring-2 focus:ring-brand-gold-ink dark:focus:ring-brand-gold transition-colors duration-300';

  // On a card the button opens the listing (the panel lives there), so it is a
  // real `<button>` rather than a link that may have no valid destination.
  if (layout === 'card') {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={buttonClass}
      >
        Contact us
      </button>
    );
  }

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={buttonClass}
      >
        {open ? 'Hide contact details' : 'Contact us'}
      </button>

      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
        Arranged by enquiry rather than bought online &mdash; send us a message and
        we&rsquo;ll come back to you with a price and the details.
      </p>

      {open && (
        <div className="mt-4 p-5 rounded-lg bg-white dark:bg-dark-card shadow space-y-2 text-sm">
          {name && (
            <p>
              <span className="text-gray-500 dark:text-gray-400">Ask for: </span>
              <span className="font-semibold dark:text-dark-text">{name}</span>
            </p>
          )}
          {email && (
            <p className="break-all">
              <span className="text-gray-500 dark:text-gray-400">Email: </span>
              <a
                href={mailto}
                className="font-semibold text-brand-gold-ink dark:text-brand-gold hover:underline"
              >
                {email}
              </a>
            </p>
          )}
          {phone && (
            <p>
              <span className="text-gray-500 dark:text-gray-400">Phone: </span>
              <a
                href={tel}
                className="font-semibold text-brand-gold-ink dark:text-brand-gold hover:underline"
              >
                {phone}
              </a>
            </p>
          )}
          {address && (
            <p>
              <span className="text-gray-500 dark:text-gray-400">Where to find us: </span>
              <span className="dark:text-dark-text">{address}</span>
            </p>
          )}
          {nothingToShow && (
            <p className="italic text-gray-500 dark:text-gray-400">
              This store hasn&rsquo;t published contact details yet &mdash; add them
              under Admin &rarr; Settings.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ContactUs;