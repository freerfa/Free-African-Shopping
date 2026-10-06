import React from 'react';
import { View } from '../types';
import { useStore } from '../contexts/StoreContext';
import LogoIcon from './icons/LogoIcon';

interface FooterProps {
  onNavigate: (view: View) => void;
}

const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const { config, categories, user } = useStore();
  const year = new Date().getFullYear();

  return (
    <footer className="bg-brand-dark text-brand-offwhite mt-auto">
      <div className="container mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-3">
              <span className="shrink-0"><LogoIcon /></span>
              <h3 className="text-2xl font-display font-bold text-brand-gold truncate">
                {config.storeName}
              </h3>
            </div>
            <p className="text-sm text-brand-offwhite/70 mt-3">{config.tagline}</p>
          </div>

          {categories.length > 0 && (
            <div>
              <h4 className="font-semibold text-brand-gold mb-3">Shop</h4>
              <ul className="space-y-2">
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
            <h4 className="font-semibold text-brand-gold mb-3">Store</h4>
            <ul className="space-y-2 text-sm">
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
            <h4 className="font-semibold text-brand-gold mb-3">Contact</h4>
            <ul className="space-y-2 text-sm text-brand-offwhite/70">
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
              className="w-full h-56 sm:h-64 rounded-lg border border-white/10"
            />
          </div>
        )}

        <div className="border-t border-white/10 mt-10 pt-6 text-center text-xs text-brand-offwhite/50">
          <p>&copy; {year} {config.storeName}. Payments are settled offline &mdash; no card details are ever taken here.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;