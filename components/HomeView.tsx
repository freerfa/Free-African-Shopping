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
        {/* Layered ambient glows give the flat dark band depth without an image. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[42rem] h-[42rem] rounded-full bg-brand-gold/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -right-24 w-[30rem] h-[30rem] rounded-full bg-brand-gold/10 blur-3xl"
        />
        <div className="relative container mx-auto px-4 sm:px-6 py-20 md:py-28 text-center">
          <p className="fas-reveal is-visible text-xs font-semibold uppercase tracking-[0.35em] text-brand-gold-light mb-4">
            Handcrafted with heritage
          </p>
          <h1 className="fas-gold-text font-display font-bold text-5xl sm:text-6xl md:text-7xl leading-[1.05]">
            {config.storeName}
          </h1>
          <p className="text-lg md:text-xl mt-6 text-brand-offwhite/80 max-w-2xl mx-auto">
            {config.tagline}
          </p>
          <div className="mt-8 flex flex-wrap justify-center items-center gap-4">
            <a
              href="#catalog-filters"
              className="inline-flex items-center justify-center gap-2 py-3 px-8 rounded-full text-sm font-bold text-brand-dark bg-brand-gold hover:bg-brand-gold-light hover:shadow-gold transition-all duration-300 hover:-translate-y-0.5"
            >
              Shop the collection
            </a>
            <span className="inline-flex items-center gap-2 py-3 px-8 rounded-full text-sm font-medium text-brand-offwhite/90 ring-1 ring-inset ring-brand-offwhite/20">
              Shipped worldwide
            </span>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 sm:px-6">
        <Section title="Our Collection" subtitle={subtitle} eyebrow="Curated for you" />

        {/* One unified filter bar for the whole grid: category, price and
            availability in a single row (the old category-pill row was folded
            in here). Local state: leaving Home resets it, Clear resets all. */}
        <div
          id="catalog-filters"
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 mb-10 text-sm"
        >
          <span className="font-semibold text-brand-dark dark:text-dark-text">Filters</span>
          {availableCategories.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="font-medium text-gray-700 dark:text-gray-300">Category</span>
              <select
                value={activeCategory}
                onChange={(e) => setActiveCategory(e.target.value)}
                aria-label="Filter by category"
                className="px-4 py-2 rounded-full text-sm border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card dark:text-dark-text cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-gold-ink focus:border-brand-gold-ink dark:focus:ring-brand-gold"
              >
                {[ALL, ...availableCategories].map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </span>
          )}

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
            className="grid gap-y-6 gap-x-4 pb-16"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
          >
            {/* Auto-fit: as many ≥260px columns as the screen allows, each stretching to share space equally. Replaces fixed breakpoint column counts so the catalog fits phones, tablets and desktops. */}
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