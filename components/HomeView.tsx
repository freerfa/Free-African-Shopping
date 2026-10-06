import React, { useMemo, useState } from 'react';
import { useStore } from '../contexts/StoreContext';
import ProductCard from './ProductCard';
import { Section } from './ui';

interface HomeViewProps {
  searchQuery: string;
  onOpenProduct: (productId: string) => void;
}

const ALL = 'All';

const HomeView: React.FC<HomeViewProps> = ({ searchQuery, onOpenProduct }) => {
  const { config, liveProducts, categories } = useStore();
  const [activeCategory, setActiveCategory] = useState<string>(ALL);

  const query = searchQuery.trim().toLowerCase();

  const visibleProducts = useMemo(() => {
    return liveProducts.filter((product) => {
      if (activeCategory !== ALL && product.category !== activeCategory) return false;
      if (!query) return true;
      return (
        product.name.toLowerCase().includes(query) ||
        product.description.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query)
      );
    });
  }, [liveProducts, activeCategory, query]);

  // Only offer categories that at least one live product actually uses.
  const availableCategories = useMemo(() => {
    const used = new Set(liveProducts.map((p) => p.category));
    return categories.filter((c) => used.has(c));
  }, [categories, liveProducts]);

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
        <Section
          title="Our Collection"
          subtitle={
            query
              ? `${visibleProducts.length} result(s) for "${searchQuery.trim()}"`
              : 'Pieces chosen for their craft and story.'
          }
        />

        {availableCategories.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {[ALL, ...availableCategories].map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                  activeCategory === category
                    ? 'border-brand-gold bg-brand-gold text-brand-dark'
                    : 'border-gray-300 dark:border-dark-border hover:border-brand-gold-ink dark:hover:border-brand-gold'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        )}

        {visibleProducts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              {query
                ? `Nothing matches "${searchQuery.trim()}".`
                : 'No products in this category yet.'}
            </p>
            {query && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Try a different search term or clear the search box above.
              </p>
            )}
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