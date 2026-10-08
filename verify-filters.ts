// Throwaway verification for lib/catalogFilters.ts — run with `npx tsx verify-filters.ts`.
import { applyCatalogFilters, hasActiveFilters } from './lib/catalogFilters';
import type { CatalogFilters } from './lib/catalogFilters';
import type { Product } from './types';

const p = (over: Record<string, unknown>): Product =>
  ({
    id: 'id',
    name: 'Item',
    description: '',
    category: 'Apparel',
    sku: '',
    price: 10,
    compareAtPrice: null,
    stock: 5,
    images: [],
    variants: [],
    status: 'live',
    ...over,
  }) as unknown as Product;

const base: CatalogFilters = {
  query: '',
  category: null,
  minPrice: '',
  maxPrice: '',
  inStockOnly: false,
};

let failures = 0;
const check = (label: string, cond: boolean) => {
  if (!cond) failures++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`);
};

const cheap = p({ id: 'cheap', name: 'Cheap tee', price: 20 });
const mid = p({ id: 'mid', name: 'Mid scarf', price: 45 });
const dear = p({ id: 'dear', name: 'Dear basket', price: 150, category: 'Bags & Baskets' });
const sold = p({ id: 'sold', name: 'Sold out thing', price: 30, stock: 0 });
const service = p({ id: 'svc', name: 'Connect Service', price: null, stock: null, category: 'Services' });
const all = [cheap, mid, dear, sold, service];
const ids = (list: Product[]) => list.map((x) => x.id).sort().join();

// No filters keeps everything.
check('no filters keeps all', applyCatalogFilters(all, { ...base }).length === 5);

// Category.
check('category filter', ids(applyCatalogFilters(all, { ...base, category: 'Services' })) === 'svc');

// Price bounds: enquiry listings (price null) drop out while a bound is set.
const minR = applyCatalogFilters(all, { ...base, minPrice: '30' });
check('min price keeps only >= min', minR.every((x) => x.price !== null && x.price >= 30));
check('min price drops enquiry listing', !minR.some((x) => x.id === 'svc'));
check('max price', ids(applyCatalogFilters(all, { ...base, maxPrice: '40' })) === 'cheap,sold');
check('price window', ids(applyCatalogFilters(all, { ...base, minPrice: '25', maxPrice: '100' })) === 'mid,sold');
check('enquiry listing visible when price bounds cleared',
  applyCatalogFilters(all, { ...base }).some((x) => x.id === 'svc'));

// Availability.
check('in stock excludes sold out', !applyCatalogFilters(all, { ...base, inStockOnly: true }).some((x) => x.id === 'sold'));
check('in stock keeps stock-untracked listing', applyCatalogFilters(all, { ...base, inStockOnly: true }).some((x) => x.id === 'svc'));

// Search semantics preserved from the old inline filter.
check('search by name, case-insensitive', ids(applyCatalogFilters(all, { ...base, query: 'CHEAP' })) === 'cheap');
check('search by sku', applyCatalogFilters([p({ id: 'sku1', sku: 'ABC-1' })], { ...base, query: 'abc-1' }).length === 1);
check('search by description', applyCatalogFilters([p({ id: 'd1', description: 'woven heritage' })], { ...base, query: 'HERITAGE' }).length === 1);
check('search by category', applyCatalogFilters(all, { ...base, query: 'services' }).length === 1);

// Garbage in the price inputs is ignored, not fatal.
check('garbage min ignored', applyCatalogFilters(all, { ...base, minPrice: 'abc' }).length === 5);
check('negative min ignored', applyCatalogFilters(all, { ...base, minPrice: '-5' }).length === 5);

// Combination.
check('combined category+price+stock', ids(applyCatalogFilters(all, { ...base, category: 'Apparel', minPrice: '10', inStockOnly: true })) === 'cheap,mid');

// hasActiveFilters drives the Clear button.
check('hasActiveFilters false at rest', !hasActiveFilters({ ...base }));
check('hasActiveFilters category', hasActiveFilters({ ...base, category: 'Apparel' }));
check('hasActiveFilters min price', hasActiveFilters({ ...base, minPrice: '10' }));
check('hasActiveFilters max price', hasActiveFilters({ ...base, maxPrice: '10' }));
check('hasActiveFilters stock toggle', hasActiveFilters({ ...base, inStockOnly: true }));
check('hasActiveFilters ignores search query', !hasActiveFilters({ ...base, query: 'tee' }));
check('hasActiveFilters ignores garbage price', !hasActiveFilters({ ...base, minPrice: 'abc' }));

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nall catalog filter checks passed');
