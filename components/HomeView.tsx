import React, { useMemo, useState } from 'react';
import { useStore } from '../contexts/StoreContext';
import ProductCard from './ProductCard';
import { Section } from './ui';
import { applyCatalogFilters, hasActiveFilters } from '../lib/catalogFilters';

interface HomeViewProps {
  searchQuery: string;
  onOpenProduct: (productId: string) => void;
}

const ALL = 'All';

/** Compact pill-style input matching the category pills above it. */
const filterInputClass =
  'w-24 px-3 py-2 rounded-full text-sm border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-brand-gold-ink focus:border-brand-gold-ink dark:focus:ring-brand-gold';

const HomeView: React.FC<HomeViewProps> = ({ searchQuery, onOpenProduct }) => {
  const { config, liveProducts, categories } = useStore();
  const [activeCategory, setActiveCategory] = useState<string>(ALL);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);

  const query = searchQuery.trim();

  const filters = useMemo(
    () => ({
      query,
      category: activeCategory === ALL ? null : activeCategory,
      minPrice,
      maxPrice,
      inStockOnly,
    }),
    [query, activeCategory, minPrice, maxPrice, inStockOnly],
  );

  const visibleProducts = useMemo(
    () => applyCatalogFilters(liveProducts, filters),
    [liveProducts, filters],
  );

  const filtersOn = hasActiveFilters(filters);

  const clearFilters = () => {
    setActiveCategory(ALL);
    setMinPrice('');
    setMaxPrice('');
    setInStockOnly(false);
  };

  // Only offer categories that at least one live product actually uses.
  const availableCategories = useMemo(() => {
    const used = new Set(liveProducts.map((p) => p.category));
    return categories.filter((c) => used.has(c));
  }, [categories, liveProducts]);

  const subtitle = query
    ? `${visibleProducts.length} result(s) for "${query}"`
    : filtersOn
      ? `${visibleProducts.length} of ${liveProducts.length} product(s) shown`
      : 'Pieces chosen for their craft and story.';

  return (
    <div>
      <section className="relative overflow-hidden bg-brand-dark text-brand-offwhite">
        {/* Layered ambient glows give the dark band depth without an image. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-[60rem] h-[60rem] rounded-full bg-brand-gold/35 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-36 -right-20 w-[48rem] h-[48rem] rounded-full bg-brand-gold-light/25 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-8 right-0 w-[32rem] h-[32rem] rounded-full bg-brand-gold/15 blur-[100px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-1/3 w-[40rem] h-[40rem] rounded-full bg-brand-gold-light/12 blur-[100px]"
        />
        <div className="relative container mx-auto px-4 sm:px-6 py-14 md:py-20 text-center">
          <p className="fas-reveal is-visible text-xs font-semibold uppercase tracking-[0.35em] text-brand-gold-light mb-6 inline-block bg-white/5 border border-white/10 rounded-full px-5 py-2 backdrop-blur-sm">
            Handcrafted with heritage
          </p>
          <h1 className="fas-gold-text font-display font-bold text-5xl sm:text-6xl md:text-7xl leading-[1.05]">
            {config.storeName}
          </h1>
          <p className="text-lg md:text-xl mt-6 text-brand-offwhite/80 max-w-2xl mx-auto leading-relaxed">
            {config.tagline}
          </p>
        </div>
      </section>

      {/* Soft divider before the category strip */}
      <div className="fas-divider mt-0" />

      {/* ── Category strip: a fast, visual way into each collection ── */}
      <section id="categories" className="py-10 border-b border-gray-200/70 dark:border-white/10">
        <div className="container mx-auto px-4 sm:px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.25em] text-brand-gold-ink dark:text-brand-gold mb-6">
            Shop by category
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {[ALL, ...availableCategories].map((category) => {
              const active = activeCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => {
                    setActiveCategory(category);
                    document
                      .getElementById('catalog-filters')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  aria-pressed={active}
                  className={`px-5 py-2.5 rounded-full text-sm font-medium border transition-all duration-200 ${
                    active
                      ? 'border-brand-gold bg-brand-gold text-brand-dark shadow-gold-sm'
                      : 'border-gray-300 dark:border-dark-border text-brand-dark dark:text-dark-text hover:border-brand-gold-ink dark:hover:border-brand-gold hover:bg-brand-gold/10'
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 sm:px-6">
        <Section title="Our Collection" subtitle={subtitle} eyebrow="Curated for you" />

        {/* Price and availability filters; categories live in the pill strip
            above. Local state: leaving Home resets it, Clear resets all. */}
        <div
          id="catalog-filters"
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 mb-10 text-sm scroll-mt-32"
        >
          <span className="font-semibold text-brand-dark dark:text-dark-text">Filters</span>

          <span className="font-medium text-gray-700 dark:text-gray-300">Price</span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="text-gray-400">{config.currency}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="Min"
              aria-label="Minimum price"
              className={filterInputClass}
            />
          </span>
          <span aria-hidden="true" className="text-gray-400">–</span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="text-gray-400">{config.currency}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Max"
              aria-label="Maximum price"
              className={filterInputClass}
            />
          </span>

          <label
            className={`flex items-center gap-2 px-4 py-2 rounded-full border cursor-pointer transition-colors ${
              inStockOnly
                ? 'border-brand-gold bg-brand-gold text-brand-dark font-medium'
                : 'border-gray-300 dark:border-dark-border hover:border-brand-gold-ink dark:hover:border-brand-gold'
            }`}
          >
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
              className="accent-brand-gold-ink dark:accent-brand-gold"
            />
            In stock only
          </label>

          {filtersOn && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-4 py-2 rounded-full text-sm font-medium border border-brand-gold-ink text-brand-gold-ink dark:border-brand-gold dark:text-brand-gold hover:bg-brand-gold hover:text-brand-dark transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        {visibleProducts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              {query
                ? `Nothing matches "${query}".`
                : filtersOn
                  ? 'No products match your filters.'
                  : 'No products in this category yet.'}
            </p>
            <div className="mt-3 flex flex-wrap justify-center items-center gap-4">
              {filtersOn && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-sm font-medium text-brand-gold-ink dark:text-brand-gold underline underline-offset-4"
                >
                  Clear filters
                </button>
              )}
              {query && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Try a different search term or clear the search box above.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div
            className="grid gap-y-8 gap-x-6 pb-16"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
          >
            {/* Auto-fill: as many ≥260px columns as the screen allows, wrapping
                naturally on phones, tablets and desktops. */}
            {visibleProducts.map((product, i) => (
              <ProductCard key={product.id} product={product} onOpen={onOpenProduct} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HomeView;