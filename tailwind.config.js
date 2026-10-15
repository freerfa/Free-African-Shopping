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
        sans: ['Poppins', 'sans-serif'],
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
        'dark-card': '#1e1e1e',
        'dark-text': '#EAEAEA',
        'dark-border': '#444444',
      },
      // Layered, soft shadows give cards a premium "elevated" feel in both
      // themes; the gold glow is used on primary CTAs for a warm accent.
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.18)',
        'card-hover': '0 8px 16px -8px rgb(0 0 0 / 0.20), 0 24px 48px -20px rgb(0 0 0 / 0.30)',
        gold: '0 10px 30px -10px rgb(var(--color-gold) / 0.55)',
        'gold-sm': '0 4px 14px -6px rgb(var(--color-gold) / 0.55)',
      },
      keyframes: {
        // Cards/sections rise and fade in as they enter view (see .fas-reveal).
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(18px)' },
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
      },
      animation: {
        'fade-up': 'fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.7s ease-out both',
      },
    },
  },
  plugins: [],
};