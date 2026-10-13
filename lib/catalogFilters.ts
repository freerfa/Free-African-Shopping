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

// ---- sorting ---------------------------------------------------------------

/** The choices offered in the grid's "Sort by" dropdown. */
export type SortKey = 'featured' | 'priceAsc' | 'priceDesc' | 'nameAsc' | 'newest';

export const SORT_LABELS: Record<SortKey, string> = {
  featured: 'Featured',
  priceAsc: 'Price: low to high',
  priceDesc: 'Price: high to low',
  nameAsc: 'Name: A–Z',
  newest: 'Newest first',
};

/** Pure sort for the storefront grid.
 *
 *  - `featured` keeps the order the server sent (admin-curated sort_index).
 *  - Price sorts push price-on-enquiry listings (price null) to the end —
 *    they have no number to compare, and hiding them would be worse than
 *    trailing them. Sorts are stable for equal keys (Array#sort is stable). */
export const sortProducts = (products: Product[], sort: SortKey): Product[] => {
  const list = [...products];
  switch (sort) {
    case 'priceAsc':
      return list.sort((a, b) => {
        if (a.price === null && b.price === null) return 0;
        if (a.price === null) return 1;
        if (b.price === null) return -1;
        return a.price - b.price;
      });
    case 'priceDesc':
      return list.sort((a, b) => {
        if (a.price === null && b.price === null) return 0;
        if (a.price === null) return 1;
        if (b.price === null) return -1;
        return b.price - a.price;
      });
    case 'nameAsc':
      return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    case 'newest':
      return list.sort((a, b) => b.createdAt - a.createdAt);
    case 'featured':
    default:
      return list;
  }
};

// ---- pagination ------------------------------------------------------------

/** How many cards one page of the home grid holds (4×3 on a large screen). */
export const PAGE_SIZE = 12;

export interface Page<T> {
  items: T[];
  /** 1-based current page, clamped into range (a shrinking filter can leave
   *  the page pointer beyond the last page). */
  page: number;
  totalPages: number;
  total: number;
}

/** Slices `items` to the requested page. Garbage page numbers are treated as
 *  page 1 and the result is always clamped, so an empty page can never render. */
export const paginate = <T,>(items: T[], page: number, pageSize: number = PAGE_SIZE): Page<T> => {
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(items.length / safeSize));
  const safePage = Number.isFinite(page) ? Math.min(Math.max(1, Math.floor(page)), totalPages) : 1;
  const start = (safePage - 1) * safeSize;
  return {
    items: items.slice(start, start + safeSize),
    page: safePage,
    totalPages,
    total: items.length,
  };
};
