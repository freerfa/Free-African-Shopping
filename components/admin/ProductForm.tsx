import React, { useState } from 'react';
import type { Product, ProductVariant } from '../../types';
import { useStore } from '../../contexts/StoreContext';
import { slugify } from '../../lib/format';
import { createId } from '../../lib/storage';
import { isEnquiryCategory } from '../../storeConfig';
import { generateProductDescription } from '../../services/geminiService';
import { inputClass, labelClass, primaryButtonClass } from '../ui';
import Spinner from '../Spinner';
import { fileToImageDataUrl } from '../../lib/images';

/** Hard cap per product — keeps a photo-heavy catalogue inside the browser's
 *  ~5 MB localStorage quota (uploads are stored as compressed data URLs). */
const MAX_IMAGES = 10;

export interface ProductDraft {
  id: string | null;
  name: string;
  category: string;
  price: string;
  compareAtPrice: string;
  stock: string;
  sku: string;
  description: string;
  /** Ordered photo list: pasted http(s) URLs plus data URLs produced by
   *  uploading a file from the admin's computer. First entry is the cover. */
  images: string[];
  status: 'live' | 'draft';
  hasVariants: boolean;
  variantOptionName: string;
  variantValues: string;
  /** Stock keyed by option value, e.g. { S: '14', M: '9' }. Lets the admin edit
   *  per-variant stock before the product is saved for the first time. */
  variantStocks: Record<string, string>;
  /** Per-listing contact details, offered for Services and Jobs only. */
  contactName: string;
  contactPhone: string;
  contactEmail: string;
}

export const emptyDraft = (): ProductDraft => ({
  id: null,
  name: '',
  category: '',
  price: '',
  compareAtPrice: '',
  stock: '',
  sku: '',
  description: '',
  images: [],
  status: 'live',
  hasVariants: false,
  variantOptionName: 'Size',
  variantValues: '',
  variantStocks: {},
  contactName: '',
  contactPhone: '',
  contactEmail: '',
});

/** Turns a stored product back into editable form state. */
export const toDraft = (product: Product): ProductDraft => {
  const firstOption = product.variants[0];
  const optionName = firstOption ? Object.keys(firstOption.options)[0] ?? 'Size' : 'Size';
  const values = firstOption
    ? Array.from(new Set(product.variants.map((v) => v.options[optionName]).filter(Boolean) as string[]))
    : [];
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    price: product.price === null ? '' : String(product.price),
    compareAtPrice: product.compareAtPrice === null ? '' : String(product.compareAtPrice),
    stock: product.stock === null ? '' : String(product.stock),
    sku: product.sku,
    description: product.description,
    images: [...product.images],
    status: product.status,
    hasVariants: product.variants.length > 0,
    variantOptionName: optionName,
    variantValues: values.join(', '),
    variantStocks: Object.fromEntries(
      product.variants
        .map((v) => [v.options[optionName], String(v.stock)] as const)
        .filter(([value]) => Boolean(value)),
    ),
    contactName: product.contactName ?? '',
    contactPhone: product.contactPhone ?? '',
    contactEmail: product.contactEmail ?? '',
  };
};

/** Builds variants from the comma-separated option values, preserving any
   price/stock already entered for a value the admin typed earlier. */
const buildVariants = (draft: ProductDraft, previous: ProductVariant[]): ProductVariant[] => {
  const optionName = draft.variantOptionName.trim() || 'Option';
  const values = draft.variantValues
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  // Variants always carry a real price (a variant of a price-on-enquiry
  // listing is itself 0), so fall back to 0 rather than NaN here.
  const basePrice = parseFloat(draft.price) || 0;
  return values.map((value) => {
    const existing = previous.find((v) => v.options[optionName] === value);
    // The draft's own stock wins so a value added this session keeps what the
    // admin just typed; otherwise fall back to the saved product, then zero.
    // Typed as `string | undefined` because the lookup can genuinely miss.
    const typed: string | undefined = draft.variantStocks[value];
    const stock =
      typed !== undefined
        ? Math.max(0, parseInt(typed, 10) || 0)
        : (existing?.stock ?? 0);
    return {
      id: existing?.id ?? `${slugify(optionName)}-${slugify(value)}`,
      options: { [optionName]: value },
      price: existing ? existing.price : basePrice,
      stock,
      sku: existing?.sku ?? '',
    };
  });
};

interface ProductFormProps {
  draft: ProductDraft;
  setDraft: (draft: ProductDraft) => void;
  onSubmit: (product: Product) => void;
  onCancel: () => void;
}

const ProductForm: React.FC<ProductFormProps> = ({ draft, setDraft, onSubmit, onCancel }) => {
  const { categories, products, config } = useStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  // Photos-block feedback renders inline, next to the controls that caused it.
  const [imageError, setImageError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [urlText, setUrlText] = useState('');

  const previousVariants =
    products.find((p) => p.id === draft.id)?.variants ?? [];

  const parsedVariants = draft.hasVariants ? buildVariants(draft, previousVariants) : [];

  // Services and Jobs have no shelf price and no unit count, so the two fields
  // below stop being required there and explain what a blank means.
  const enquiry = isEnquiryCategory(draft.category);

  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) =>
    setDraft({ ...draft, [key]: value });

  const removeImage = (index: number) =>
    set('images', draft.images.filter((_, i) => i !== index));

  const makeCover = (index: number) => {
    if (index === 0) return;
    const next = [...draft.images];
    const [chosen] = next.splice(index, 1);
    next.unshift(chosen);
    set('images', next);
  };

  /** Reads picked files on a canvas, shrinks them and appends the compressed
      data URLs to the draft — sequentially, so the chosen order is kept. */
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // Snapshot before the first await: the input's FileList is live and the
    // caller clears the input as soon as this resolves.
    const picked = Array.from(files);
    setImageError('');
    setIsUploading(true);
    try {
      const additions: string[] = [];
      for (const file of picked) {
        const dataUrl = await fileToImageDataUrl(file);
        if (!draft.images.includes(dataUrl) && !additions.includes(dataUrl)) {
          additions.push(dataUrl);
        }
      }
      if (additions.length === 0) {
        setImageError('Those photos are already in this product.');
        return;
      }
      const next = [...draft.images, ...additions];
      if (next.length > MAX_IMAGES) {
        setImageError(`A product can hold at most ${MAX_IMAGES} photos — remove a few first.`);
        return;
      }
      set('images', next);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : 'Could not read that photo.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddUrls = () => {
    const lines = urlText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    setImageError('');
    const bad = lines.find((url) => !/^(https?:\/\/|data:image\/)/i.test(url));
    if (bad) {
      setImageError(`"${bad.slice(0, 60)}" does not look like an image URL.`);
      return;
    }
    const next = [...draft.images];
    lines.forEach((url) => {
      if (!next.includes(url)) next.push(url);
    });
    if (next.length > MAX_IMAGES) {
      setImageError(`A product can hold at most ${MAX_IMAGES} photos — remove a few first.`);
      return;
    }
    set('images', next);
    setUrlText('');
  };

  const handleGenerate = async () => {
    if (!draft.name.trim() || !draft.category.trim()) {
      setError('Enter a product name and category first.');
      return;
    }
    setError('');
    setIsGenerating(true);
    try {
      const description = await generateProductDescription(
        draft.name.trim(),
        draft.category.trim(),
        config.storeName,
      );
      set('description', description);
    } catch (e) {
      console.error(e);
      // The service throws a human-readable reason (e.g. no API key), so show
      // that rather than masking a setup problem behind a generic message.
      setError(e instanceof Error ? e.message : 'Failed to generate a description. Please write one manually.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const name = draft.name.trim();
    if (!name) {
      setError('A product name is required.');
      return;
    }
    const category = draft.category.trim() || categories[0] || 'Uncategorised';
    // Services and Jobs are not sold like goods: the price is agreed per
    // enquiry and there is no unit count, so both fields may be left blank.
    const enquiry = isEnquiryCategory(category);

    const price = draft.price.trim() === '' ? null : parseFloat(draft.price);
    if (price === null) {
      if (!enquiry) {
        setError('Enter a valid price.');
        return;
      }
    } else if (!Number.isFinite(price) || price < 0) {
      setError('Enter a valid price.');
      return;
    }
    const compareAt = draft.compareAtPrice.trim() === '' ? null : parseFloat(draft.compareAtPrice);
    if (compareAt !== null && !Number.isFinite(compareAt)) {
      setError('Enter a valid "compare at" price, or leave it blank.');
      return;
    }
    if (compareAt !== null && (price === null || compareAt <= price)) {
      setError('"Compare at" must be higher than the price, or leave it blank.');
      return;
    }
    if (draft.hasVariants && parsedVariants.length === 0) {
      setError('Add at least one variant value, or turn variants off.');
      return;
    }

    const existing = draft.id ? products.find((p) => p.id === draft.id) : undefined;
    // Photos were curated in the block above (uploads compressed, URLs vetted).
    const images = draft.images.filter((src) => src.trim().length > 0);

    // Blank stock means "not tracked" rather than "none left" — but only where
    // that makes sense; elsewhere an empty box would silently sell out an item.
    const stockBlank = draft.stock.trim() === '';
    if (stockBlank && !enquiry) {
      setError('Enter the stock, or move this listing to Services or Jobs where stock is optional.');
      return;
    }
    const stock = stockBlank ? null : Math.max(0, parseInt(draft.stock, 10) || 0);

    // Per-listing contact details belong to Services/Jobs. They are cleared for
    // every other category so switching a product out of Services cannot leave a
    // stale phone number behind on something sold normally.
    const contactEmail = draft.contactEmail.trim();
    if (enquiry && contactEmail !== '' && !/^\S+@\S+\.\S+$/.test(contactEmail)) {
      setError('Enter a valid contact email, or leave it blank.');
      return;
    }
    const contactName = enquiry ? draft.contactName.trim() : '';
    const contactPhone = enquiry ? draft.contactPhone.trim() : '';
    const savedEmail = enquiry ? contactEmail : '';

    onSubmit({
      id: draft.id ?? createId('product'),
      name,
      description: draft.description.trim(),
      price,
      compareAtPrice: compareAt,
      images,
      category,
      sku: draft.sku.trim(),
      stock,
      variants: draft.hasVariants ? parsedVariants : [],
      status: draft.status,
      createdAt: existing?.createdAt ?? Date.now(),
      contactName,
      contactPhone,
      contactEmail: savedEmail,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-dark-card shadow-xl rounded-lg p-6 space-y-5">
      <h3 className="text-lg font-bold text-brand-dark dark:text-dark-text">
        {draft.id ? 'Edit product' : 'New product'}
      </h3>

      {error && (
        <p role="alert" className="text-red-500 bg-red-100 dark:bg-red-900/50 dark:text-red-300 p-3 rounded-md">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="pf-name">Name</label>
          <input id="pf-name" type="text" value={draft.name}
            onChange={(e) => set('name', e.target.value)} className={inputClass} required />
        </div>

        <div>
          <label className={labelClass} htmlFor="pf-category">Category</label>
          <input id="pf-category" type="text" list="pf-categories" value={draft.category}
            onChange={(e) => set('category', e.target.value)} className={inputClass}
            placeholder="e.g. Jewelry" />
          <datalist id="pf-categories">
            {categories.map((c) => (<option key={c} value={c} />))}
          </datalist>
        </div>

        <div>
          <label className={labelClass} htmlFor="pf-sku">SKU</label>
          <input id="pf-sku" type="text" value={draft.sku}
            onChange={(e) => set('sku', e.target.value)} className={inputClass}
            placeholder="FAS-JWL-002" />
        </div>

        <div>
          <label className={labelClass} htmlFor="pf-price">
            Price ({config.currency}){enquiry ? ' — optional' : ''}
          </label>
          <input id="pf-price" type="number" min="0" step="0.01" value={draft.price}
            onChange={(e) => set('price', e.target.value)} className={inputClass}
            required={!enquiry}
            placeholder={enquiry ? 'Blank = Contact us' : undefined} />
          {enquiry && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Leave blank and the listing shows &ldquo;Contact us&rdquo; instead of a price.
            </p>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor="pf-compare">Compare at price (optional)</label>
          <input id="pf-compare" type="number" min="0" step="0.01" value={draft.compareAtPrice}
            onChange={(e) => set('compareAtPrice', e.target.value)} className={inputClass}
            placeholder="Blank if not on sale" />
        </div>

        <div>
          <label className={labelClass} htmlFor="pf-stock">
            Stock{enquiry ? ' — optional' : ''}
          </label>
          <input id="pf-stock" type="number" min="0" step="1" value={draft.stock}
            onChange={(e) => set('stock', e.target.value)} className={inputClass}
            required={!enquiry && !draft.hasVariants}
            disabled={draft.hasVariants}
            placeholder={enquiry ? 'Blank = not tracked' : undefined} />
          {draft.hasVariants ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Stock is tracked per variant while variants are enabled.
            </p>
          ) : enquiry ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Leave blank and the listing is never marked sold out.
            </p>
          ) : null}
        </div>

        <div>
          <label className={labelClass} htmlFor="pf-status">Status</label>
          <select id="pf-status" value={draft.status}
            onChange={(e) => set('status', e.target.value as ProductDraft['status'])}
            className={inputClass}>
            <option value="live">Live — visible in the store</option>
            <option value="draft">Draft — hidden from shoppers</option>
          </select>
        </div>
      </div>

      {/* Per-listing contact details, for the enquiry categories only — this is
          what a shopper's "Contact us" message and call button point at. */}
      {enquiry && (
        <div className="border-t dark:border-dark-border pt-5">
          <h4 className={labelClass}>Who to contact about this</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-4">
            Shown on the listing&rsquo;s <strong>Contact us</strong> panel. Leave a field
            blank to fall back to the store-wide contact details from Admin &rarr;
            Settings.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="pf-cname">Contact name (optional)</label>
              <input id="pf-cname" type="text" value={draft.contactName}
                onChange={(e) => set('contactName', e.target.value)} className={inputClass}
                placeholder="e.g. Amara — Tailoring" />
            </div>
            <div>
              <label className={labelClass} htmlFor="pf-cphone">Contact phone (optional)</label>
              <input id="pf-cphone" type="tel" value={draft.contactPhone}
                onChange={(e) => set('contactPhone', e.target.value)} className={inputClass}
                placeholder="+256 77 123 4567" />
            </div>
            <div>
              <label className={labelClass} htmlFor="pf-cemail">Contact email (optional)</label>
              <input id="pf-cemail" type="email" value={draft.contactEmail}
                onChange={(e) => set('contactEmail', e.target.value)} className={inputClass}
                placeholder="Enquiries go here instead" />
            </div>
          </div>
        </div>
      )}

      <div className="border-t dark:border-dark-border pt-5">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={draft.hasVariants}
            onChange={(e) => set('hasVariants', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-gold-ink dark:text-brand-gold focus:ring-brand-gold"
          />
          This product has options (e.g. sizes or colours)
        </label>

        {draft.hasVariants && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className={labelClass} htmlFor="pf-vname">Option name</label>
              <input
                id="pf-vname"
                type="text"
                value={draft.variantOptionName}
                onChange={(e) => set('variantOptionName', e.target.value)}
                className={inputClass}
                placeholder="Size"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="pf-vvalues">Values (comma separated)</label>
              <input
                id="pf-vvalues"
                type="text"
                value={draft.variantValues}
                onChange={(e) => set('variantValues', e.target.value)}
                className={inputClass}
                placeholder="S, M, L, XL"
              />
            </div>

            {parsedVariants.length > 0 && (
              <div className="sm:col-span-2">
                <p className={labelClass}>Stock per option</p>
                <div className="space-y-2 mt-2">
                  {parsedVariants.map((variant) => (
                    <div key={variant.id} className="flex items-center gap-3">
                      <span className="w-24 text-sm dark:text-dark-text truncate">
                        {variant.options[draft.variantOptionName.trim() || 'Option']}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        aria-label={`Stock for ${variant.options[draft.variantOptionName.trim() || 'Option']}`}
                        value={variant.stock}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            variantStocks: {
                              ...draft.variantStocks,
                              [variant.options[draft.variantOptionName.trim() || 'Option']]: e.target.value,
                            },
                          })
                        }
                        className="w-24 px-2 py-1 border border-gray-300 dark:border-dark-border rounded-md bg-transparent dark:text-dark-text"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  New options start at zero stock; edit them after saving if needed.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="flex justify-between items-center gap-3">
          <label className={labelClass} htmlFor="pf-desc">Description</label>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="text-xs font-semibold text-brand-gold-ink hover:text-brand-dark dark:text-brand-gold dark:hover:text-brand-gold-light disabled:opacity-50 flex items-center gap-2"
          >
            {isGenerating && <Spinner />}
            {isGenerating ? 'Generating...' : 'Generate with AI'}
          </button>
        </div>
        <textarea
          id="pf-desc"
          rows={4}
          value={draft.description}
          onChange={(e) => set('description', e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Photos</label>

        {imageError && (
          <p
            role="alert"
            className="text-sm text-red-500 bg-red-100 dark:bg-red-900/50 dark:text-red-300 p-3 rounded-md mb-3"
          >
            {imageError}
          </p>
        )}

        {draft.images.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-3">
            {draft.images.map((src, index) => (
              <div key={index} className="relative w-24 h-24">
                <img
                  src={src}
                  alt={`Photo ${index + 1}`}
                  className="w-full h-full object-cover rounded-lg border border-gray-300 dark:border-dark-border"
                />
                {index === 0 ? (
                  <span className="absolute bottom-1 left-1 text-[10px] font-semibold bg-brand-gold text-brand-dark rounded-full px-1.5 py-0.5">
                    Cover
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => makeCover(index)}
                    title="Use as the cover photo"
                    className="absolute bottom-1 left-1 right-1 text-[10px] bg-black/60 hover:bg-black/80 text-white rounded px-1 py-0.5 truncate"
                  >
                    Make cover
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  title="Remove photo"
                  aria-label={`Remove photo ${index + 1}`}
                  className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white text-xs leading-none"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Dashed dropzone that doubles as the file picker trigger. */}
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!isUploading) void handleFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-lg px-4 py-5 text-sm text-center cursor-pointer transition-colors ${
            isUploading
              ? 'opacity-60 pointer-events-none border-gray-300 dark:border-dark-border'
              : 'border-gray-300 dark:border-dark-border hover:border-brand-gold-ink hover:text-brand-gold-ink dark:hover:border-brand-gold dark:hover:text-brand-gold text-gray-600 dark:text-gray-300'
          }`}
        >
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              const input = e.currentTarget;
              void handleFiles(input.files).finally(() => {
                input.value = '';
              });
            }}
          />
          {isUploading ? (
            <span className="flex items-center justify-center gap-2 font-semibold">
              <Spinner /> Optimising photo(s)…
            </span>
          ) : (
            <span className="font-semibold">
              Upload from your computer
              <span className="block text-xs font-normal text-gray-500 dark:text-gray-400 mt-1">
                Click to choose or drag images here — JPG, PNG or WebP, up to {MAX_IMAGES} photos
              </span>
            </span>
          )}
        </label>

        <textarea
          rows={2}
          value={urlText}
          onChange={(e) => setUrlText(e.target.value)}
          className={`${inputClass} mt-3`}
          placeholder={'…or paste image URLs, one per line:\nhttps://example.com/one.jpg'}
          aria-label="Image URLs, one per line"
        />
        <button
          type="button"
          onClick={handleAddUrls}
          className="mt-2 px-4 py-1.5 rounded-full text-xs font-semibold border border-gray-300 dark:border-dark-border hover:border-brand-gold-ink hover:text-brand-gold-ink dark:hover:border-brand-gold dark:hover:text-brand-gold transition-colors"
        >
          Add URLs
        </button>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          The first photo is the cover shown on cards. Photos are resized in your
          browser to keep storage usage low.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <button type="submit" className={`${primaryButtonClass} w-auto px-8`}>
          {draft.id ? 'Save changes' : 'Create product'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="py-3 px-6 rounded-full text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-brand-gold-ink dark:hover:text-brand-gold transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

export default ProductForm;
