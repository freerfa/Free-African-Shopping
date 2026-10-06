import React, { useRef, useState } from 'react';
import type { OrderStatus, Permission, Product } from '../../types';
import { useStore } from '../../contexts/StoreContext';
import { COLOR_KEYS } from '../../storeConfig';
import { formatPrice, formatPriceOrEnquiry } from '../../lib/format';
import { isOnSale, primaryImage, totalStock } from '../../lib/product';
import { paymentSummary } from '../../lib/payments';
import { inputClass, labelClass, Section } from '../ui';
import EditIcon from '../icons/EditIcon';
import TrashIcon from '../icons/TrashIcon';
import ProductForm from './ProductForm';
import { emptyDraft, toDraft } from './ProductForm';
import type { ProductDraft } from './ProductForm';
import PaymentSettings from './PaymentSettings';
import DatabasePanel from './DatabasePanel';
import StaffPanel from './StaffPanel';

type Tab = 'products' | 'orders' | 'settings' | 'database' | 'staff';

/** Which right each tab needs. A tab the signed-in admin lacks is not rendered
 *  at all — the server enforces the same rule, this just avoids a dead end. */
const TAB_PERMISSION: Record<Tab, Permission> = {
  products: 'products.view',
  orders: 'orders.view',
  settings: 'settings.manage',
  database: 'database.view',
  staff: 'staff.manage',
};

/** Settings holds two cards with different rights: the store details need
 *  `settings.manage`, the payment block needs `payments.manage`. */
const NEEDS_PAYMENTS: Permission = 'payments.manage';

const ORDER_STATUSES: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered'];

const tabClass = (active: boolean) =>
  `px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
    active
      ? 'bg-brand-gold text-brand-dark'
      : 'bg-white dark:bg-dark-card text-gray-600 dark:text-gray-300 hover:text-brand-gold-ink dark:hover:text-brand-gold'
  }`;

const smallButton =
  'px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-300 dark:border-dark-border hover:border-brand-gold-ink hover:text-brand-gold-ink dark:hover:border-brand-gold dark:hover:text-brand-gold transition-colors';

/** Same pill, in green, for the "payment received" state. */
const confirmedButton = `${smallButton} border-green-400 text-green-700 hover:border-green-600 hover:text-green-700 dark:border-green-500 dark:text-green-400`;

/**
 * Payment note with an explicit Save button: the note is only PUT to the server
 * when the admin asks, instead of on every keystroke like the settings fields.
 */
const PaymentNoteEditor: React.FC<{
  note: string;
  onSave: (note: string) => Promise<void>;
}> = ({ note, onSave }) => {
  const [draft, setDraft] = useState(note);
  const [saving, setSaving] = useState(false);
  const dirty = draft.trim() !== note;

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Admin note (e.g. transfer verified against the statement)"
        aria-label="Payment note"
        className="flex-grow min-w-0 px-2 py-1 text-xs border border-gray-300 dark:border-dark-border rounded-md bg-transparent dark:text-dark-text"
      />
      <button
        type="button"
        disabled={!dirty || saving}
        onClick={async () => {
          setSaving(true);
          await onSave(draft.trim());
          setSaving(false);
        }}
        className={`${smallButton} disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        {saving ? 'Saving…' : 'Save note'}
      </button>
    </div>
  );
};

/** Human labels for the raw colour keys, e.g. "goldLight" -> "Gold light". */
const COLOR_LABELS: Record<string, string> = {
  gold: 'Gold',
  goldLight: 'Gold light',
  dark: 'Dark',
  offwhite: 'Off-white',
};

interface AdminViewProps {
  onExit: () => void;
}

const AdminView: React.FC<AdminViewProps> = ({ onExit }) => {
  const {
    products, orders, config, detailedCart, liveProducts, user,
    saveProduct, deleteProduct, toggleProductStatus, updateOrderStatus, updateOrderPayment,
    updateConfig, clearCart, exportStore, importStore, resetToDefaults,
  } = useStore();

  // Rights come from the signed-in user the server resolved. `can` is the single
  // helper every control below asks, so hiding a button and refusing the action
  // stay in step. The server still guards each route independently.
  const held = user?.permissions ?? [];
  const can = (permission: Permission): boolean => held.includes(permission);
  const availableTabs = (Object.keys(TAB_PERMISSION) as Tab[]).filter((t) =>
    t === 'settings'
      ? can('settings.manage') || can(NEEDS_PAYMENTS)
      : can(TAB_PERMISSION[t]),
  );

  // `tab` must start on something this admin can actually see, otherwise a
  // view-only staff member would land on an empty Products tab.
  const [tab, setTab] = useState<Tab>(availableTabs[0] ?? 'products');
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const flash = (ok: boolean, text: string) => {
    setNotice({ ok, text });
    window.setTimeout(() => setNotice(null), 4000);
  };

  // ---- products -----------------------------------------------------------
  const startCreate = () => setDraft(emptyDraft());
  const startEdit = (product: Product) => setDraft(toDraft(product));

  // Filter by name, category or SKU so the admin can find a product quickly
  // once the catalogue grows past what fits on one screen.
  const trimmedQuery = productQuery.trim().toLowerCase();
  const visibleProducts =
    trimmedQuery.length === 0
      ? products
      : products.filter(
          (p) =>
            p.name.toLowerCase().includes(trimmedQuery) ||
            p.category.toLowerCase().includes(trimmedQuery) ||
            (p.sku ?? '').toLowerCase().includes(trimmedQuery),
        );

  const handleSave = async (product: Product) => {
    if (!(await saveProduct(product))) {
      flash(
        false,
        'Could not save: the store server rejected the change. Check that the server is running, then try again.',
      );
      return; // keep the form open so nothing typed is lost
    }
    setDraft(null);
    flash(true, `Saved "${product.name}".`);
  };

  const handleDelete = async (product: Product) => {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    await deleteProduct(product.id);
    flash(true, `Deleted "${product.name}".`);
  };

  // ---- orders -------------------------------------------------------------
  const pendingCount = orders.filter((o) => o.status === 'pending').length;

  // ---- settings -----------------------------------------------------------
  const setColor = (key: keyof typeof config.colors, value: string) =>
    updateConfig({ colors: { ...config.colors, [key]: value } });

  const handleImportFile = async (file: File) => {
    setImporting(true);
    const result = await importStore(file);
    setImporting(false);
    flash(result.ok, result.message);
  };

  const handleReset = async () => {
    if (!window.confirm('Reset the store to its defaults? Your products, orders and settings will be replaced.')) return;
    try {
      await resetToDefaults();
      flash(true, 'Store reset to defaults.');
    } catch (error) {
      flash(false, error instanceof Error ? error.message : 'Could not reset the store.');
    }
  };

  return (
    <div className="container mx-auto px-4 sm:px-6 py-12">
      <Section title="Admin Panel" subtitle="Products, orders, store settings and your database records." />

      {notice && (
        <div
          role="status"
          className={`max-w-2xl mx-auto mb-6 p-3 rounded-md text-sm ${
            notice.ok
              ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
              : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
        {availableTabs.map((t) => (
          <button key={t} onClick={() => { setTab(t); setDraft(null); }} className={tabClass(tab === t)}>
            {t === 'products' ? `Products (${products.length})`
              : t === 'orders' ? `Orders (${orders.length})`
              : t === 'settings' ? 'Settings'
              : t === 'staff' ? 'Staff'
              : 'Database'}
            {t === 'orders' && pendingCount > 0 && (
              <span className="ml-2 text-xs">({pendingCount} new)</span>
            )}
          </button>
        ))}
        <button onClick={onExit} className={`${smallButton} px-4 py-2`}>Back to store</button>
      </div>

      {tab === 'products' && (
        <div className="max-w-5xl mx-auto">
          {draft ? (
            <ProductForm draft={draft} setDraft={setDraft} onSubmit={handleSave} onCancel={() => setDraft(null)} />
          ) : (
            <>
              <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {trimmedQuery
                    ? `${visibleProducts.length} of ${products.length} product(s) match "${productQuery.trim()}"`
                    : `${products.length} product(s) · ${liveProducts.length} live`}
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="search"
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder="Search products…"
                    aria-label="Search products"
                    className="w-48 px-3 py-2 rounded-full text-sm border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-brand-gold-ink dark:focus:ring-brand-gold"
                  />
                  {can('products.manage') && (
                    <button
                      onClick={startCreate}
                      className="bg-brand-dark text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-gray-800 transition-colors"
                    >
                      + New product
                    </button>
                  )}
                </div>
              </div>

              {products.length === 0 ? (
                <p className="text-center text-gray-600 dark:text-gray-400 py-12">
                  No products yet. Create your first one.
                </p>
              ) : visibleProducts.length === 0 ? (
                <p className="text-center text-gray-600 dark:text-gray-400 py-12">
                  No products match &ldquo;{productQuery.trim()}&rdquo;.
                </p>
              ) : (
                <ul className="space-y-3">
                  {visibleProducts.map((product) => {
                    const stock = totalStock(product);
                    return (
                      <li
                        key={product.id}
                        className="bg-white dark:bg-dark-card shadow rounded-lg p-4 flex flex-wrap sm:flex-nowrap items-center gap-4"
                      >
                        <img
                          src={primaryImage(product)}
                          alt=""
                          className="w-16 h-16 object-cover rounded shrink-0"
                        />

                        {/* Mobile: image + details share line 1 (img 4rem + slack),
                            status/actions wrap right-aligned to line 2. sm+ keeps
                            the single-row layout via flex-nowrap on the parent. */}
                        <div className="flex-grow min-w-0 basis-[calc(100%_-_5.5rem)] sm:basis-auto">
                          <p className="font-semibold dark:text-dark-text truncate">{product.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {product.category}
                            {product.sku && ` · ${product.sku}`}
                            {product.variants.length > 0 && ` · ${product.variants.length} variant(s)`}
                          </p>
                          <p className="text-sm mt-1">
                            {formatPriceOrEnquiry(product.price, config.currency)}
                            {isOnSale(product) && product.compareAtPrice !== null && (
                              <span className="text-gray-400 line-through ml-2 text-xs">
                                {formatPrice(product.compareAtPrice, config.currency)}
                              </span>
                            )}
                            <span className="text-gray-500 dark:text-gray-400 ml-3 text-xs">
                              {stock === null ? 'stock not tracked' : `${stock} in stock`}
                            </span>
                          </p>
                        </div>

                        <span
                          className={`ml-auto shrink-0 text-xs font-bold px-2 py-1 rounded-full ${
                            product.status === 'live'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                              : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                          }`}
                        >
                          {product.status}
                        </span>

                        {/* Without `products.manage` this is a read-only list. */}
                        {can('products.manage') && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => startEdit(product)} className={smallButton} aria-label={`Edit ${product.name}`}>
                              <EditIcon />
                            </button>
                            <button
                              onClick={() => toggleProductStatus(product.id)}
                              className={smallButton}
                            >
                              {product.status === 'live' ? 'Unpublish' : 'Publish'}
                            </button>
                            <button
                              onClick={() => handleDelete(product)}
                              className="p-2 text-red-500 hover:text-red-700 transition-colors"
                              aria-label={`Delete ${product.name}`}
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'orders' && (
        <div className="max-w-4xl mx-auto">
          {orders.length === 0 ? (
            <p className="text-center text-gray-600 dark:text-gray-400 py-12">
              No orders yet. They will appear here as soon as a shopper checks out.
            </p>
          ) : (
            <ul className="space-y-4">
              {orders.map((order) => (
                <li key={order.id} className="bg-white dark:bg-dark-card shadow rounded-lg p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b dark:border-dark-border">
                    <div>
                      <p className="font-bold text-brand-gold-ink dark:text-brand-gold">{order.reference}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(order.createdAt).toLocaleString()} &middot; {order.customerName} &middot;{' '}
                        <a href={`mailto:${order.customerEmail}`} className="hover:text-brand-gold-ink dark:hover:text-brand-gold">
                          {order.customerEmail}
                        </a>
                        {/* Orders placed before the phone field simply lack it. */}
                        {order.customerPhone ? (
                          <>
                            {' '} &middot;{' '}
                            <a
                              href={`tel:${order.customerPhone.replace(/[^+\d]/g, '')}`}
                              className="hover:text-brand-gold-ink dark:hover:text-brand-gold"
                            >
                              {order.customerPhone}
                            </a>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold dark:text-dark-text">
                        {formatPrice(order.total, config.currency)}
                      </span>
                      <select
                        value={order.status}
                        onChange={(e) => updateOrderStatus(order.id, e.target.value as OrderStatus)}
                        aria-label={`Status for order ${order.reference}`}
                        // Read-only for someone with `orders.view` but not
                        // `orders.manage`, rather than a control that 403s.
                        disabled={!can('orders.manage')}
                        className="text-sm px-2 py-1 border border-gray-300 dark:border-dark-border rounded-md bg-transparent dark:text-dark-text disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {ORDER_STATUSES.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <ul className="mt-3 space-y-1 text-sm">
                    {order.lines.map((line, i) => (
                      <li key={`${order.id}-${i}`} className="flex justify-between gap-4">
                        <span className="text-gray-600 dark:text-gray-300 min-w-0">
                          {line.quantity} &times; {line.name}
                          {line.variantLabel && (
                            <span className="text-brand-gold-ink dark:text-brand-gold text-xs ml-2">{line.variantLabel}</span>
                          )}
                        </span>
                        <span className="shrink-0 dark:text-dark-text">
                          {formatPrice(line.price * line.quantity, config.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                    Ships to:{' '}
                    {/* Address doubles as a map link so fulfilment can open it
                        directly; no API key needed for a search URL. */}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.shippingAddress)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-brand-gold-ink dark:hover:text-brand-gold"
                    >
                      {order.shippingAddress}
                    </a>
                  </p>

                  {/* Manual payment: the shopper's choice plus wherever they sent
                      the money, ticked off here once it shows up in the account.
                      The whole block is read-only without `orders.manage`. */}
                  <div className="mt-3 rounded-md bg-brand-offwhite dark:bg-dark-bg p-3 text-xs space-y-2">
                    {!can('orders.manage') && (
                      <p className="italic text-gray-500 dark:text-gray-400">
                        Your account can view orders but cannot update them.
                      </p>
                    )}
                    {order.payment ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-brand-dark dark:text-dark-text">
                            {paymentSummary(order.payment)}
                          </span>
                          {can('orders.manage') && (
                            <button
                              type="button"
                              onClick={() =>
                                updateOrderPayment(order.id, { confirmed: !order.paymentConfirmed })
                              }
                              className={order.paymentConfirmed ? confirmedButton : smallButton}
                            >
                              {order.paymentConfirmed ? 'Payment received ✓' : 'Mark received'}
                            </button>
                          )}
                        </div>
                        <p
                          className={
                            order.paymentConfirmed
                              ? 'text-green-700 dark:text-green-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }
                        >
                          {order.paymentConfirmed
                            ? 'Confirmed by the store.'
                            : 'Awaiting payment — check the account before shipping.'}
                        </p>
                        {can('orders.manage') && (
                          <PaymentNoteEditor
                            note={order.paymentNote ?? ''}
                            onSave={(note) => updateOrderPayment(order.id, { note })}
                          />
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-gray-500 dark:text-gray-400">
                          No payment method recorded (the payment system was hidden at checkout,
                          or the order predates it). Settle up with the shopper directly.
                        </p>
                        {can('orders.manage') && (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                updateOrderPayment(order.id, { confirmed: !order.paymentConfirmed })
                              }
                              className={order.paymentConfirmed ? confirmedButton : smallButton}
                            >
                              {order.paymentConfirmed ? 'Payment received ✓' : 'Mark received'}
                            </button>
                          </div>
                        )}
                        {can('orders.manage') && (
                          <PaymentNoteEditor
                            note={order.paymentNote ?? ''}
                            onSave={(note) => updateOrderPayment(order.id, { note })}
                          />
                        )}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Payments has its own right, so someone can be trusted with the bank
              details without also being able to re-skin the store. */}
          {can(NEEDS_PAYMENTS) ? (
            <PaymentSettings />
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Your account cannot change payment settings.
            </p>
          )}

          <div className="bg-white dark:bg-dark-card shadow rounded-lg p-6 space-y-4">
            <h3 className="font-bold text-brand-dark dark:text-dark-text">Store details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="st-name">Store name</label>
                <input id="st-name" type="text" value={config.storeName}
                  onChange={(e) => updateConfig({ storeName: e.target.value })} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="st-tagline">Tagline</label>
                <input id="st-tagline" type="text" value={config.tagline}
                  onChange={(e) => updateConfig({ tagline: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="st-currency">Currency symbol</label>
                <input id="st-currency" type="text" value={config.currency} maxLength={3}
                  onChange={(e) => updateConfig({ currency: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="st-announce">Announcement bar</label>
                <input id="st-announce" type="text" value={config.announcement}
                  onChange={(e) => updateConfig({ announcement: e.target.value })}
                  className={inputClass} placeholder="Leave blank to hide" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-card shadow rounded-lg p-6 space-y-4">
            <div>
              <h3 className="font-bold text-brand-dark dark:text-dark-text">Colours</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Changes apply live across the whole store.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {COLOR_KEYS.map((key) => (
                <div key={key}>
                  <label className={labelClass} htmlFor={`st-color-${key}`}>
                    {COLOR_LABELS[key] ?? key}
                  </label>
                  <input
                    id={`st-color-${key}`}
                    type="color"
                    value={config.colors[key]}
                    onChange={(e) => setColor(key, e.target.value)}
                    className="mt-1 h-10 w-full rounded cursor-pointer border border-gray-300 dark:border-dark-border bg-transparent"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-dark-card shadow rounded-lg p-6 space-y-4">
            <h3 className="font-bold text-brand-dark dark:text-dark-text">Categories</h3>
            <label className={labelClass} htmlFor="st-cats">One per line</label>
            <textarea
              id="st-cats"
              rows={5}
              value={config.categories.join('\n')}
              onChange={(e) =>
                updateConfig({
                  categories: e.target.value.split('\n').map((c) => c.trim()).filter(Boolean),
                })
              }
              className={inputClass}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Categories used by existing products are always kept, even if removed here.
            </p>
          </div>

          <div className="bg-white dark:bg-dark-card shadow rounded-lg p-6 space-y-4">
            <h3 className="font-bold text-brand-dark dark:text-dark-text">Contact</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="st-email">Contact email</label>
                <input id="st-email" type="email" value={config.contactEmail}
                  onChange={(e) => updateConfig({ contactEmail: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="st-phone">Phone</label>
                <input id="st-phone" type="text" value={config.contactPhone}
                  onChange={(e) => updateConfig({ contactPhone: e.target.value })} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="st-address">Address</label>
                <input id="st-address" type="text" value={config.contactAddress}
                  onChange={(e) => updateConfig({ contactAddress: e.target.value })} className={inputClass} />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  While set, the footer shows an interactive map of this address.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-card shadow rounded-lg p-6 space-y-4">
            <h3 className="font-bold text-brand-dark dark:text-dark-text">Admin access</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="st-admin-email">Admin email</label>
                <input id="st-admin-email" type="email" value={config.adminEmail}
                  onChange={(e) => updateConfig({ adminEmail: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="st-admin-pass">New admin password</label>
                <input id="st-admin-pass" type="password" autoComplete="new-password"
                  value={config.adminPassword} placeholder="Leave blank to keep current"
                  onChange={(e) => updateConfig({ adminPassword: e.target.value })} className={inputClass} />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              The password is checked and stored <strong>server-side as a hash</strong> — it never
              ships to this browser. Save the settings to change it; leave the field blank to keep
              the current one.
            </p>
          </div>

          <div className="bg-white dark:bg-dark-card shadow rounded-lg p-6 space-y-4">
            <h3 className="font-bold text-brand-dark dark:text-dark-text">Data</h3>
            <div className="flex flex-wrap gap-3">
              {/* Export/import/reset are destructive to the catalogue, so they
                  only appear for an account that holds the matching right. */}
              {can('data.import') && (
                <>
                  <button onClick={exportStore} className={smallButton}>Export store (JSON)</button>

                  <button onClick={() => fileInput.current?.click()} className={smallButton} disabled={importing}>
                    {importing ? 'Importing...' : 'Import store (JSON)'}
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      // Reset first so re-picking the same file still fires onChange.
                      e.target.value = '';
                      if (file) void handleImportFile(file);
                    }}
                  />
                </>
              )}

              {detailedCart.length > 0 && (
                <button
                  onClick={() => {
                    if (window.confirm('Empty the current cart?')) clearCart();
                  }}
                  className={smallButton}
                >
                  Empty cart ({detailedCart.length})
                </button>
              )}

              {can('data.reset') && (
                <button
                  onClick={handleReset}
                  className={`${smallButton} border-red-300 text-red-500 hover:border-red-500 hover:text-red-600`}
                >
                  Reset to defaults
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'staff' && user && <StaffPanel user={user} onNotice={flash} />}

      {tab === 'database' && <DatabasePanel onNotice={flash} />}

      <div className="max-w-3xl mx-auto text-center text-sm text-gray-500 dark:text-gray-400">
        <p>Signed in as {config.adminEmail}</p>
      </div>
    </div>
  );
};

export default AdminView;