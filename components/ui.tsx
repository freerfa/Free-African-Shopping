import type { ReactNode } from 'react';

/** Shared input styling so forms stay visually consistent. */
export const inputClass =
  'mt-1 block w-full px-4 py-3 border border-gray-300 dark:border-dark-border rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-gold-ink focus:border-brand-gold-ink dark:focus:ring-brand-gold dark:focus:border-brand-gold bg-white dark:bg-dark-card text-brand-dark dark:text-dark-text placeholder-gray-500 dark:placeholder-gray-600 transition-colors';

export const labelClass = 'block text-sm font-medium text-brand-dark dark:text-dark-text mb-1';

// Premium CTA motion: gentle lift on hover, physical press on active.
const CTA_MOTION =
  'transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0';

export const primaryButtonClass =
  `w-full flex justify-center items-center gap-2 py-4 px-6 border border-transparent rounded-full text-base font-semibold text-white bg-brand-dark hover:bg-gray-800 hover:shadow-lg dark:hover:bg-gray-700 focus:ring-offset-white dark:focus:ring-offset-dark-bg focus:ring-brand-dark ${CTA_MOTION}`;

export const goldButtonClass =
  `flex justify-center items-center gap-2 py-4 px-8 rounded-full text-base font-bold text-brand-dark bg-brand-gold hover:bg-brand-gold-light hover:shadow-gold focus:ring-brand-gold ${CTA_MOTION}`;

export const outlineButtonClass =
  `flex justify-center items-center gap-2 py-4 px-6 rounded-full text-base font-semibold text-brand-dark dark:text-dark-text border border-brand-gold-ink dark:border-brand-gold bg-transparent hover:bg-brand-gold-ink dark:hover:bg-brand-gold hover:text-white dark:hover:text-brand-offwhite ${CTA_MOTION}`;

interface SectionProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** Small uppercase label above the title — a premium editorial touch. */
  eyebrow?: string;
}

export const Section: React.FC<SectionProps> = ({ title, subtitle, action, eyebrow }) => (
  <div className="text-center my-12 md:my-16 relative">
    <div
      aria-hidden="true"
      className="absolute inset-0 -z-10 rounded-full bg-brand-gold/4 blur-[100px] pointer-events-none"
    />
    {eyebrow && (
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brand-gold-ink dark:text-brand-gold mb-3 inline-block bg-brand-gold/8 px-4 py-1.5 rounded-full border border-brand-gold/20">
        {eyebrow}
      </p>
    )}
    <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-brand-dark dark:text-dark-text">{title}</h2>
    {/* A short gold rule under the heading anchors the section visually. */}
    <span
      aria-hidden="true"
      className="block w-24 h-1.5 rounded-full bg-brand-gold mx-auto mt-5 mb-1 relative z-10"
    />
    <span
      aria-hidden="true"
      className="absolute -top-12 left-1/2 -translate-x-1/2 w-[14rem] h-[14rem] rounded-full bg-brand-gold/8 blur-[80px] -z-10"
    />
    {subtitle && <p className="text-lg md:text-xl text-gray-600 dark:text-gray-400 mt-4 max-w-2xl mx-auto">{subtitle}</p>}
    {action && <div className="mt-6">{action}</div>}
  </div>
);

export const Card: React.FC<{ children: ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white dark:bg-dark-card rounded-3xl shadow-card ring-1 ring-black/5 dark:ring-white/5 p-8 ${className}`}>
    {children}
  </div>
);

/** Premium product card surface: slightly larger padding, softer border, lift on hover. */
export const ProductCardSurface: React.FC<{ children: ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white dark:bg-dark-card rounded-3xl shadow-card hover:shadow-card-hover ring-1 ring-black/5 dark:ring-white/10 transition-all duration-300 fas-card-bg ${className}`}>
    {children}
  </div>
);

/** One five-pointed star. `filled` swaps between a solid gold star and an
 *  outline, so a row of these can render any 0–5 rating without an image. */
const StarGlyph: React.FC<{ filled: boolean; size: number }> = ({ filled, size }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth={1.5}
    className={filled ? 'text-brand-gold' : 'text-gray-300 dark:text-gray-600'}
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M11.48 3.5a.56.56 0 011.04 0l2.13 5.61a.56.56 0 00.47.35l5.93.5c.53.04.74.71.33 1.05l-4.5 3.85a.56.56 0 00-.18.57l1.35 5.73c.12.51-.43.93-.88.66l-5.14-3.13a.56.56 0 00-.6 0l-5.14 3.13c-.45.27-1-.15-.88-.66l1.35-5.73a.56.56 0 00-.18-.57L2.61 11.01a.6.6 0 01.33-1.05l5.93-.5a.56.56 0 00.47-.35l2.13-5.61z"
    />
  </svg>
);

/** Read-only row of five stars reflecting a 0–5 rating (rounded for display).
 *  Used on product cards/pages and beside each review. */
export const Stars: React.FC<{ rating: number; size?: number; className?: string }> = ({
  rating,
  size = 16,
  className = '',
}) => {
  const filled = Math.round(rating);
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <StarGlyph key={star} filled={star <= filled} size={size} />
      ))}
    </span>
  );
};

/** Clickable 1–5 star picker for the review form; `value` is the current
 *  selection and `onChange` reports a new one. */
export const StarInput: React.FC<{ value: number; onChange: (value: number) => void }> = ({
  value,
  onChange,
}) => (
  <div className="inline-flex items-center gap-1" role="group" aria-label="Your rating">
    {[1, 2, 3, 4, 5].map((star) => (
      <button
        key={star}
        type="button"
        onClick={() => onChange(star)}
        aria-label={`${star} star${star > 1 ? 's' : ''}`}
        aria-pressed={value === star}
        className="p-0.5 rounded focus:outline-none focus:ring-2 focus:ring-brand-gold-ink dark:focus:ring-brand-gold"
      >
        <StarGlyph filled={star <= value} size={28} />
      </button>
    ))}
  </div>
);