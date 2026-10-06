/** Converts "#D4AF37" or "#DF3" into the "212 175 55" form Tailwind needs
 *  so that opacity modifiers (bg-brand-gold/20) keep working. */
export const hexToRgbTriplet = (hex: string): string => {
  const clean = hex.trim().replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (full.length !== 6 || /[^0-9a-f]/i.test(full)) return '0 0 0';
  const num = parseInt(full, 16);
  return `${(num >> 16) & 255} ${(num >> 8) & 255} ${num & 255}`;
};

export const formatPrice = (value: number, currency: string): string => {
  const safe = Number.isFinite(value) ? value : 0;
  return `${currency}${safe.toFixed(2)}`;
};

/** Shown in place of a price for a listing that has none (Services and Jobs).
 *  One place so the wording is identical on cards, the detail page and admin. */
export const ENQUIRY_LABEL = 'Contact us';

/** Formats a price for display, falling back to "Contact us" when there isn't
 *  one. Use for anything a shopper or admin reads; never for arithmetic. */
export const formatPriceOrEnquiry = (value: number | null, currency: string): string =>
  value === null ? ENQUIRY_LABEL : formatPrice(value, currency);

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'product';
/** Human-readable file size for the admin database panel, e.g. "4.1 MB". */
export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
};
