import type { Product } from '../types';
import { isSoldOut } from './product';

/**
 * Pure filtering for the storefront grid.
 *
 * Kept out of the component so the rules can be unit-tested and reused if a
 * second listing view appears. Matches the header search semantics that used
 * to live inline in `HomeView` (name, description, category, SKU).
 */
export interface CatalogFilters {
  /** Header search text; compared lowercased and trimmed. */
  query: string;
  /** `null` means "every category" (the "All" pill). */
  category: string | null;
  /** Raw text from the price inputs — blank or garbage means "no bound". */
  minPrice: string;
  maxPrice: string;
  /** Hide sold-out listings. Stock-untracked listings (services) never hide. */
  inStockOnly: boolean;
}

/** A price input as a usable number, or null when it should be ignored. */
const priceBound = (raw: string): number | null => {
  const value = Number(raw);
  return raw.trim() !== '' && Number.isFinite(value) && value >= 0 ? value : null;
};

/** True when anything other than the search box is narrowing the grid —
 *  drives the "Clear filters" button and the result count. */
export const hasActiveFilters = (filters: CatalogFilters): boolean =>
  filters.category !== null ||
  filters.inStockOnly ||
  priceBound(filters.minPrice) !== null ||
  priceBound(filters.maxPrice) !== null;

export const applyCatalogFilters = (
  products: Product[],
  filters: CatalogFilters,
): Product[] => {
  const min = priceBound(filters.minPrice);
  const max = priceBound(filters.maxPrice);
  const query = filters.query.trim().toLowerCase();

  return products.filter((product) => {
    if (filters.category !== null && product.category !== filters.category) return false;

    if (filters.inStockOnly && isSoldOut(product)) return false;

    // A price bound only makes sense for listings that have a price: enquiry
    // items (Services/Jobs, price null) drop out while a bound is set rather
    // than being compared against an invented number.
    if (min !== null || max !== null) {
      if (product.price === null) return false;
      if (min !== null && product.price < min) return false;
      if (max !== null && product.price > max) return false;
    }

    if (!query) return true;
    return (
      product.name.toLowerCase().includes(query) ||
      product.description.toLowerCase().includes(query) ||
      product.category.toLowerCase().includes(query) ||
      product.sku.toLowerCase().includes(query)
    );
  });
};
