import type { Product, ProductVariant } from '../types';

/** True when this listing is offered as a "Contact us" enquiry rather than an
 *  Add-to-cart purchase.
 *
 *  The trigger is simply having no fixed price — which the admin form only
 *  allows for Services and Jobs, so the two stay in step without duplicating
 *  the category check in every view. `ENQUIRY_CATEGORIES` still decides whether
 *  price *may* be left blank; this decides what a shopper is offered. */
export const isContactOnly = (product: Product): boolean => product.price === null;

/** Total sellable units: variant stock when the product has variants.
 *
 * `null` means the listing does not track stock at all (a Service or a Job), so
 * it is never sold out. Callers must not compare this with `<= 0` without
 * handling that case first — use `isSoldOut` for the sold-out question. */
export const totalStock = (product: Product): number | null => {
  if (product.stock === null && product.variants.length === 0) return null;
  return product.variants.length > 0
    ? product.variants.reduce((sum, v) => sum + v.stock, 0)
    : product.stock;
};

export const isSoldOut = (product: Product): boolean => totalStock(product) === 0;

/** Whether this listing has no fixed price (Services and Jobs): shown as
 *  "Contact us" and charged at 0. */
export const isPriceOnEnquiry = (product: Product): boolean => product.price === null;

/** The amount actually charged for one unit: 0 for a price-on-enquiry listing.
 *  Use for arithmetic; use `isPriceOnEnquiry` for anything shown to a shopper. */
export const chargeablePrice = (price: number | null): number =>
  price === null || !Number.isFinite(price) ? 0 : price;

export const isOnSale = (product: Product): boolean =>
  product.price !== null &&
  product.compareAtPrice !== null &&
  product.compareAtPrice > product.price;

export const primaryImage = (product: Product): string =>
  product.images[0] ?? 'https://picsum.photos/seed/placeholder/600/600';

/** Distinct option names across a product's variants, in insertion order. */
export const optionNames = (product: Product): string[] => {
  const names: string[] = [];
  product.variants.forEach((variant) => {
    Object.keys(variant.options).forEach((key) => {
      if (!names.includes(key)) names.push(key);
    });
  });
  return names;
};

export const valuesForOption = (product: Product, optionName: string): string[] => {
  const values: string[] = [];
  product.variants.forEach((variant) => {
    const value = variant.options[optionName];
    if (value !== undefined && !values.includes(value)) values.push(value);
  });
  return values;
};

/** Best match for the shopper's current selections, if any. */
export const findVariant = (
  product: Product,
  selection: Record<string, string>,
): ProductVariant | undefined => {
  const names = optionNames(product);
  if (names.length === 0) return undefined;
  const hasAll = names.every((name) => Boolean(selection[name]));
  if (!hasAll) return undefined;
  return product.variants.find((variant) =>
    names.every((name) => variant.options[name] === selection[name]),
  );
};

/** How a variant's options are spelled out, e.g. "Size: M". */
export const variantLabel = (variant: ProductVariant | null): string | null =>
  variant ? Object.entries(variant.options).map(([key, value]) => `${key}: ${value}`).join(', ') : null;
