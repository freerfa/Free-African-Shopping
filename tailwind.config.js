/**
 * Tailwind is compiled at build time through PostCSS (see postcss.config.js)
 * instead of the `cdn.tailwindcss.com` script the page used to load. This is a
 * direct port of the former inline `tailwind.config` from index.html, plus:
 *
 * - `content`: Tailwind only emits utilities it finds in these files (the CDN
 *   scanned the live DOM instead), so every source file with class names must
 *   be listed here.
 * - `brand-gold-ink`: darker gold for text/borders on light surfaces, where
 *   brand-gold (#D4AF37) reaches only ~2.1:1 contrast on white.
 */
export default {
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './contexts/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Tangerine', 'cursive'],
      },
      colors: {
        // Read from the custom properties StoreContext keeps in sync, so the
        // admin colour pickers re-skin the store live. The <alpha-value>
        // placeholder is what keeps bg-brand-gold/20 style modifiers working.
        'brand-gold': 'rgb(var(--color-gold) / <alpha-value>)',
        'brand-gold-light': 'rgb(var(--color-gold-light) / <alpha-value>)',
        'brand-gold-ink': 'rgb(var(--color-gold-ink) / <alpha-value>)',
        'brand-dark': 'rgb(var(--color-dark) / <alpha-value>)',
        'brand-offwhite': 'rgb(var(--color-offwhite) / <alpha-value>)',
        'dark-bg': '#121212',
        'dark-card': '#1a1a1a',
        'dark-text': '#EAEAEA',
        'dark-border': '#333333',
      },
      // Layered shadows give cards a premium elevated feel; gold glow on CTAs.
      boxShadow: {
        card: '0 1px 3px rgb(0 0 0 / 0.08), 0 4px 20px -8px rgb(0 0 0 / 0.06)',
        'card-hover': '0 12px 32px -12px rgb(0 0 0 / 0.12), 0 4px 16px -8px rgb(0 0 0 / 0.10)',
        gold: '0 12px 32px -8px rgb(var(--color-gold) / 0.45)',
        'gold-sm': '0 4px 14px -6px rgb(var(--color-gold) / 0.45)',
      },
      borderRadius: {
        'xl': '16px',
        '2xl': '24px',
        '3xl': '32px',
        'full': '9999px',
      },
      keyframes: {
        // Cards/sections rise and fade in as they enter view (see .fas-reveal).
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        // A slow sheen across gold text/borders, paused under reduced motion.
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        // Subtle float for hero elements.
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        // Gentle scale pulse for featured badges.
        'pulse-soft': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.03)', opacity: '0.85' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.8s ease-out both',
        'float': 'float 6s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 4s ease-in-out infinite',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};