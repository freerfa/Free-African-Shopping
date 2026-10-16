import React, { useState } from 'react';
import { View } from '../types';
import { useStore } from '../contexts/StoreContext';
import LogoIcon from './icons/LogoIcon';

interface FooterProps {
  onNavigate: (view: View) => void;
}

const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const { config, categories, user } = useStore();
  const year = new Date().getFullYear();
  const [subscribed, setSubscribed] = useState(false);

  return (
    <footer className="bg-brand-dark text-brand-offwhite mt-auto relative overflow-hidden">
      {/* Decorative gold glow keeps the footer tied to the hero accents. */}
      <div aria-hidden="true" className="absolute -top-20 -left-20 w-[30rem] h-[30rem] rounded-full bg-brand-gold/10 blur-3xl pointer-events-none" />
      <div aria-hidden="true" className="h-1 w-full bg-gradient-to-r from-transparent via-brand-gold/50 to-transparent" />
      <div className="container mx-auto px-4 sm:px-6 py-16 sm:py-20 relative z-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="shrink-0"><LogoIcon /></span>
              <h3 className="text-2xl font-display font-bold text-brand-gold truncate">
                {config.storeName}
              </h3>
            </div>
            <p className="text-sm text-brand-offwhite/70 leading-relaxed">{config.tagline}</p>
          </div>

          {categories.length > 0 && (
            <div>
              <h4 className="font-semibold text-brand-gold mb-5 uppercase tracking-wider text-sm">Shop</h4>
              <ul className="space-y-3">
                {/* Every category is listed, not just the first few — the
                    Services and Jobs boards sit at the end of the list and were
                    being cut off. */}
                {categories.map((category) => (
                  <li key={category}>
                    <span className="text-sm text-brand-offwhite/70">{category}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h4 className="font-semibold text-brand-gold mb-5 uppercase tracking-wider text-sm">Store</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <button
                  onClick={() => onNavigate(View.Home)}
                  className="text-brand-offwhite/70 hover:text-brand-gold transition-colors"
                >
                  All products
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate(View.Cart)}
                  className="text-brand-offwhite/70 hover:text-brand-gold transition-colors"
                >
                  Your cart
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate(View.TrackOrder)}
                  className="text-brand-offwhite/70 hover:text-brand-gold transition-colors"
                >
                  Track your order
                </button>
              </li>
              {user?.isAdmin && (
                <li>
                  <button
                    onClick={() => onNavigate(View.Admin)}
                    className="text-brand-offwhite/70 hover:text-brand-gold transition-colors"
                  >
                    Admin panel
                  </button>
                </li>
              )}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-brand-gold mb-5 uppercase tracking-wider text-sm">Contact</h4>
            <ul className="space-y-3 text-sm text-brand-offwhite/70">
              {config.contactEmail && (
                <li>
                  <a
                    href={`mailto:${config.contactEmail}`}
                    className="hover:text-brand-gold transition-colors break-all"
                  >
                    {config.contactEmail}
                  </a>
                </li>
              )}
              {config.contactPhone && (
                <li>
                  <a
                    href={`tel:${config.contactPhone.replace(/\s+/g, '')}`}
                    className="hover:text-brand-gold transition-colors"
                  >
                    {config.contactPhone}
                  </a>
                </li>
              )}
              {config.contactAddress && <li>{config.contactAddress}</li>}
              {!config.contactEmail && !config.contactPhone && !config.contactAddress && (
                <li className="italic">Add contact details in Admin &rarr; Settings.</li>
              )}
            </ul>
          </div>
        </div>

        {/* Location map — only when the store has published an address, since
            an empty address would embed a meaningless world map. The embed
            takes free-form text (no geocoding pass, no API key); the link
            beside it is the fallback if the iframe is ever blocked. */}
        {config.contactAddress && (
          <div className="border-t border-white/10 mt-10 pt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h4 className="font-semibold text-brand-gold">Find us</h4>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(config.contactAddress)}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-brand-offwhite/70 hover:text-brand-gold transition-colors"
              >
                Open in Google Maps &nearr;
              </a>
            </div>
            <iframe
              title={`Map showing ${config.contactAddress}`}
              src={`https://maps.google.com/maps?q=${encodeURIComponent(config.contactAddress)}&z=14&output=embed`}
              loading="lazy"
              className="w-full h-56 sm:h-64 rounded-2xl border border-white/10"
            />
          </div>
        )}

        <div className="border-t border-white/10 mt-12 pt-8 text-center text-xs text-brand-offwhite/50">
          <p>&copy; {year} {config.storeName}. Payments are settled offline &mdash; no card details are ever taken here.</p>
        </div>
      </div>

      {/* Trust badges — reassure shoppers before they buy. */}
      <div className="bg-brand-dark/80 backdrop-blur-sm border-t border-white/10 relative z-10">
        <div className="container mx-auto px-4 sm:px-6 py-10">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 text-center">
            <div className="flex flex-col items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-brand-gold/10 flex items-center justify-center text-brand-gold">🔒</span>
              <p className="text-sm font-medium text-brand-offwhite">Secure payments</p>
              <p className="text-xs text-brand-offwhite/50">Offline processing, no card data stored</p>
            </div>
            <div className="flex flex-col items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-brand-gold/10 flex items-center justify-center text-brand-gold">🚚</span>
              <p className="text-sm font-medium text-brand-offwhite">Reliable delivery</p>
              <p className="text-xs text-brand-offwhite/50">Track your order anytime</p>
            </div>
            <div className="flex flex-col items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-brand-gold/10 flex items-center justify-center text-brand-gold">📞</span>
              <p className="text-sm font-medium text-brand-offwhite">Dedicated support</p>
              <p className="text-xs text-brand-offwhite/50">We're here to help</p>
            </div>
          </div>
        </div>
      </div>

      {/* Newsletter signup — keep shoppers connected. */}
      <div className="bg-brand-gold/5 border-t border-brand-gold/10 relative z-10">
        <div className="container mx-auto px-4 sm:px-6 py-14 text-center">
          <h3 className="text-2xl font-bold text-brand-offwhite mb-3">Stay in the loop</h3>
          <p className="text-brand-offwhite/70 text-sm max-w-md mx-auto mb-8">Get early access to new arrivals, special offers, and store news.</p>
          <form onSubmit={(e) => { e.preventDefault(); setSubscribed(true); }} className="max-w-sm mx-auto flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              placeholder="you@example.com"
              className="flex-1 px-5 py-3.5 rounded-xl bg-white dark:bg-dark-card border border-gray-300 dark:border-dark-border text-brand-dark dark:text-dark-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-ink dark:focus:ring-brand-gold"
              required
            />
            <button
              type="submit"
              disabled={subscribed}
              className="px-8 py-3.5 rounded-xl bg-brand-gold text-brand-dark font-semibold hover:bg-brand-gold-light transition-colors shadow-gold-sm hover:shadow-gold disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {subscribed ? 'Subscribed ✓' : 'Subscribe'}
            </button>
          </form>
        </div>
      </div>
    </footer>
  );
};

export default Footer;