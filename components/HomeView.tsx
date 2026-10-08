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
      <section className="bg-brand-dark text-brand-offwhite">
        <div className="container mx-auto px-4 sm:px-6 py-16 md:py-24 text-center">
          <h2 className="text-4xl md:text-6xl font-display font-bold text-brand-gold">
            {config.storeName}
          </h2>
          <p className="text-lg md:text-xl mt-4 text-brand-offwhite/80 max-w-2xl mx-auto">
            {config.tagline}
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 sm:px-6">
        <Section title="Our Collection" subtitle={subtitle} />

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-16">
            {visibleProducts.map((product) => (
              <ProductCard key={product.id} product={product} onOpen={onOpenProduct} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HomeView;