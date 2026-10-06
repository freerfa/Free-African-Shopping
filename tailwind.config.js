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
    },
  },
  plugins: [],
};