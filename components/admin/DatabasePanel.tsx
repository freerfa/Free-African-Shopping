import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Order, Product } from '../../types';
import { api } from '../../lib/api';
import type { DatabaseInfo, IntegrityResult } from '../../lib/api';
import { useStore } from '../../contexts/StoreContext';
import { formatBytes, formatPrice, formatPriceOrEnquiry } from '../../lib/format';
import { totalStock } from '../../lib/product';
import { STORAGE_KEYS, loadState } from '../../lib/storage';
import OrderEditor, { OrderLinesSummary, toEditValues } from './OrderEditor';
import type { OrderEditValues } from './OrderEditor';
import ProductForm from './ProductForm';
import { emptyDraft, toDraft } from './ProductForm';
import type { ProductDraft } from './ProductForm';

/** The same small pill the rest of the admin panel uses for actions. */
const smallButton =
  'px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-300 dark:border-dark-border hover:border-brand-gold-ink hover:text-brand-gold-ink dark:hover:border-brand-gold dark:hover:text-brand-gold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

/** The same pill in red, for destructive actions. */
const dangerButton = `${smallButton} border-red-300 text-red-500 hover:border-red-500 hover:text-red-600 dark:border-red-500 dark:text-red-400`;

/** Filled pill used for the collection switcher. */
const tabButton = (active: boolean) =>
  `px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
    active
      ? 'bg-brand-dark text-white'
      : 'bg-white dark:bg-dark-card text-gray-600 dark:text-gray-300 hover:text-brand-gold-ink dark:hover:text-brand-gold'
  }`;

/** Shared table styling for the two data tables. */
const thClass = 'text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 px-3 py-2';
const tdClass = 'px-3 py-2.5 text-sm dark:text-dark-text align-top';

const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : 'Unexpected error.';

const formatDate = (ms: number): string =>
  Number.isFinite(ms) ? new Date(ms).toLocaleDateString() : '—';

type Collection = 'products' | 'orders';

/** One labelled figure in the overview grid. */
const Stat: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
      {label}
    </dt>
    <dd className="text-sm font-semibold break-all text-brand-dark dark:text-dark-text">
      {children}
    </dd>
  </div>
);

interface DatabasePanelProps {
  /** Flash notice shared with the rest of the admin panel. */
  onNotice: (ok: boolean, text: string) => void;
}


/**
 * Admin → Database.
 *
 * A simple browser over what the database actually holds: every product and
 * every order, searchable, with Add / Edit / Delete right here in the view.
 *
 * The split is deliberate. Records go through the normal validated API (the same
 * one the Products and Orders tabs use), so a hand-typed price or a bad status
 * is still rejected by the server. Raw-file tools — integrity check, VACUUM,
 * backup, wiping the order book — live in the collapsed "File tools" card at the
 * bottom, out of the way of the everyday editing.
 */
const DatabasePanel: React.FC<DatabasePanelProps> = ({ onNotice }) => {
  const {
    products, orders, config,
    saveProduct, deleteProduct, updateOrder, deleteOrder,
  } = useStore();

  const [collection, setCollection] = useState<Collection>('products');
  const [query, setQuery] = useState('');
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [productDraft, setProductDraft] = useState<ProductDraft | null>(null);
  const [editingOrder, setEditingOrder] = useState<string | null>(null);
  const [orderValues, setOrderValues] = useState<OrderEditValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState<DatabaseInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<'check' | 'optimize' | 'backup' | 'purge' | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setInfo(await api.getDatabaseInfo());
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A new row or product changes the row counts shown in the file stats, so the
  // overview is refreshed whenever the collections change underneath it.
  useEffect(() => {
    void load();
  }, [load, products.length, orders.length]);

  /** Leaving a collection closes whatever editor it had open. */
  const switchCollection = (next: Collection) => {
    setCollection(next);
    setQuery('');
    setEditingProduct(null);
    setProductDraft(null);
    setEditingOrder(null);
    setOrderValues(null);
  };

  const trimmed = query.trim().toLowerCase();
  const visibleProducts = useMemo(
    () =>
      trimmed === ''
        ? products
        : products.filter(
            (p) =>
              p.name.toLowerCase().includes(trimmed) ||
              p.category.toLowerCase().includes(trimmed) ||
              p.sku.toLowerCase().includes(trimmed),
          ),
    [products, trimmed],
  );
  const visibleOrders = useMemo(
    () =>
      trimmed === ''
        ? orders
        : orders.filter(
            (o) =>
              o.reference.toLowerCase().includes(trimmed) ||
              o.customerName.toLowerCase().includes(trimmed) ||
              o.customerEmail.toLowerCase().includes(trimmed) ||
              o.customerPhone.toLowerCase().includes(trimmed) ||
              o.status.includes(trimmed),
          ),
    [orders, trimmed],
  );

  // ---- products ------------------------------------------------------------
  const startCreateProduct = () => {
    setEditingOrder(null);
    setOrderValues(null);
    setEditingProduct('new');
    setProductDraft(emptyDraft());
  };

  const startEditProduct = (product: Product) => {
    setEditingOrder(null);
    setOrderValues(null);
    setEditingProduct(product.id);
    setProductDraft(toDraft(product));
  };

  const handleSaveProduct = async (product: Product) => {
    setSaving(true);
    const ok = await saveProduct(product);
    setSaving(false);
    if (!ok) {
      onNotice(false, 'Could not save: the store server rejected the change.');
      return; // keep the form open so nothing typed is lost
    }
    setEditingProduct(null);
    setProductDraft(null);
    onNotice(true, `Saved "${product.name}".`);
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    try {
      await deleteProduct(product.id);
      setEditingProduct(null);
      setProductDraft(null);
      onNotice(true, `Deleted "${product.name}".`);
    } catch (error) {
      onNotice(false, errorMessage(error));
    }
  };

  // ---- orders --------------------------------------------------------------
  const orderBeingEdited = editingOrder ? orders.find((o) => o.id === editingOrder) : undefined;

  const startEditOrder = (order: Order) => {
    setEditingProduct(null);
    setProductDraft(null);
    setEditingOrder(order.id);
    setOrderValues(toEditValues(order));
  };

  const handleSaveOrder = async (patch: Partial<Order>) => {
    if (!editingOrder) return;
    setSaving(true);
    try {
      await updateOrder(editingOrder, patch);
      setEditingOrder(null);
      setOrderValues(null);
      onNotice(true, `Order ${orderBeingEdited?.reference ?? ''} updated.`);
    } catch (error) {
      // The form stays open so the admin can correct and retry.
      onNotice(false, errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOrder = async (order: Order) => {
    if (!window.confirm(`Delete order ${order.reference}? This cannot be undone.`)) return;
    try {
      await deleteOrder(order.id);
      setEditingOrder(null);
      setOrderValues(null);
      onNotice(true, `Deleted order ${order.reference}.`);
    } catch (error) {
      onNotice(false, errorMessage(error));
    }
  };

  const runIntegrityCheck = async (): Promise<void> => {
    setBusy('check');
    try {
      setIntegrity(await api.checkDatabase());
    } catch (error) {
      onNotice(false, errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const runOptimize = async (): Promise<void> => {
    setBusy('optimize');
    try {
      setInfo(await api.optimizeDatabase());
      onNotice(true, 'Database optimized — the file was compacted and statistics refreshed.');
    } catch (error) {
      onNotice(false, errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  /** The backup route streams a file, so it is fetched directly rather than
   *  through `request()` (which always parses JSON). The admin token is read
   *  from the same place the API client reads it. */
  const downloadBackup = async (): Promise<void> => {
    setBusy('backup');
    try {
      const token = loadState<string | null>(STORAGE_KEYS.authToken, null);
      const response = await fetch('/api/database/backup', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        let message = `Backup failed (${response.status}).`;
        try {
          const payload = (await response.json()) as { error?: unknown };
          if (typeof payload.error === 'string') message = payload.error;
        } catch {
          // No JSON body — keep the default message.
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `store-backup-${new Date().toISOString().slice(0, 10)}.db`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      onNotice(true, 'Backup downloaded.');
    } catch (error) {
      onNotice(false, errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const purgeOrders = async (): Promise<void> => {
    if (
      !window.confirm(
        'Delete EVERY order at once? Products and settings are kept. This cannot be undone.',
      )
    )
      return;
    setBusy('purge');
    try {
      const { cleared } = await api.clearOrders();
      onNotice(true, `Deleted ${cleared} order(s) from the database.`);
    } catch (error) {
      onNotice(false, errorMessage(error));
    } finally {
      setBusy(null);
      void load(); // row counts changed
    }
  };

  const showingProducts = collection === 'products';
  const visibleCount = showingProducts ? visibleProducts.length : visibleOrders.length;
  const totalCount = showingProducts ? products.length : orders.length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ---- collection switcher + search --------------------------------- */}
      <div className="bg-white dark:bg-dark-card shadow rounded-lg p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button" onClick={() => switchCollection('products')}
              className={tabButton(showingProducts)}
            >
              Products ({products.length})
            </button>
            <button
              type="button" onClick={() => switchCollection('orders')}
              className={tabButton(!showingProducts)}
            >
              Orders ({orders.length})
            </button>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <input
              type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={showingProducts ? 'Search name, category, SKU…' : 'Search reference, customer…'}
              aria-label={`Search ${collection}`}
              className="w-56 px-3 py-2 rounded-full text-sm border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-brand-gold-ink dark:focus:ring-brand-gold"
            />
            {showingProducts && (
              <button
                type="button" onClick={startCreateProduct}
                className="bg-brand-dark text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-gray-800 transition-colors"
              >
                + Add product
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {trimmed
            ? `${visibleCount} of ${totalCount} ${showingProducts ? 'product' : 'order'}(s) match "${query.trim()}"`
            : `${totalCount} ${showingProducts ? 'product' : 'order'}(s) in the database`}
        </p>
      </div>
      {/* ---- product editor ------------------------------------------------ */}
      {showingProducts && productDraft && editingProduct && (
        <div className="bg-white dark:bg-dark-card shadow rounded-lg p-6">
          <h3 className="font-bold text-brand-dark dark:text-dark-text mb-4">
            {editingProduct === 'new' ? 'New product' : `Editing "${productDraft.name}"`}
          </h3>
          <ProductForm
            draft={productDraft}
            setDraft={setProductDraft}
            onSubmit={(product) => void handleSaveProduct(product)}
            onCancel={() => {
              setEditingProduct(null);
              setProductDraft(null);
            }}
          />
        </div>
      )}

      {/* ---- products table ----------------------------------------------- */}
      {showingProducts && (
        <div className="bg-white dark:bg-dark-card shadow rounded-lg overflow-hidden">
          {visibleProducts.length === 0 ? (
            <p className="text-center text-gray-600 dark:text-gray-400 py-12 px-6">
              {trimmed
                ? `No products match "${query.trim()}".`
                : 'No products yet. Use "+ Add product" to create your first one.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                <thead className="bg-gray-50 dark:bg-dark-bg/40">
                  <tr>
                    <th className={thClass}>Name</th>
                    <th className={thClass}>Category</th>
                    <th className={thClass}>Price</th>
                    <th className={thClass}>Stock</th>
                    <th className={thClass}>Status</th>
                    <th className={`${thClass} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                  {visibleProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-dark-bg/30">
                      <td className={tdClass}>
                        <span className="font-semibold block">{product.name}</span>
                        {product.sku && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">SKU {product.sku}</span>
                        )}
                      </td>
                      <td className={tdClass}>{product.category || '—'}</td>
                      <td className={`${tdClass} whitespace-nowrap`}>
                        {formatPriceOrEnquiry(product.price, config.currency)}
                      </td>
                      <td className={`${tdClass} whitespace-nowrap`}>
                        {totalStock(product) ?? '—'}
                      </td>
                      <td className={tdClass}>
                        <span
                          className={`text-xs font-bold px-2 py-1 rounded-full ${
                            product.status === 'live'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                              : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                          }`}
                        >
                          {product.status}
                        </span>
                      </td>
                      <td className={`${tdClass} text-right whitespace-nowrap`}>
                        <button
                          type="button" onClick={() => startEditProduct(product)}
                          className={`${smallButton} mr-2`}
                        >
                          Edit
                        </button>
                        <button
                          type="button" onClick={() => void handleDeleteProduct(product)}
                          className={dangerButton}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {/* ---- orders table -------------------------------------------------- */}
      {!showingProducts && (
        <div className="bg-white dark:bg-dark-card shadow rounded-lg overflow-hidden">
          {visibleOrders.length === 0 ? (
            <p className="text-center text-gray-600 dark:text-gray-400 py-12 px-6">
              {trimmed
                ? `No orders match "${query.trim()}".`
                : 'No orders yet. They appear here as soon as a shopper checks out.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                <thead className="bg-gray-50 dark:bg-dark-bg/40">
                  <tr>
                    <th className={thClass}>Reference</th>
                    <th className={thClass}>Customer</th>
                    <th className={thClass}>Items</th>
                    <th className={thClass}>Total</th>
                    <th className={thClass}>Status</th>
                    <th className={thClass}>Date</th>
                    <th className={`${thClass} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                  {visibleOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-dark-bg/30">
                      <td className={`${tdClass} font-mono text-xs whitespace-nowrap`}>
                        {order.reference}
                      </td>
                      <td className={tdClass}>
                        <span className="font-semibold block">{order.customerName || '—'}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 break-all">
                          {[order.customerPhone, order.customerEmail].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </td>
                      <td className={tdClass}>
                        {order.lines.length === 0
                          ? '—'
                          : order.lines
                              .slice(0, 2)
                              .map((l) => `${l.name} ×${l.quantity}`)
                              .join(', ') + (order.lines.length > 2 ? ` +${order.lines.length - 2}` : '')}
                      </td>
                      <td className={`${tdClass} whitespace-nowrap font-semibold`}>
                        {formatPrice(order.total, config.currency)}
                      </td>
                      <td className={tdClass}>
                        <span
                          className={`text-xs font-bold px-2 py-1 rounded-full ${
                            order.status === 'delivered'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                              : order.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                              : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className={`${tdClass} whitespace-nowrap text-xs`}>
                        {formatDate(order.createdAt)}
                      </td>
                      <td className={`${tdClass} text-right whitespace-nowrap`}>
                        <button
                          type="button" onClick={() => startEditOrder(order)}
                          className={`${smallButton} mr-2`}
                        >
                          Edit
                        </button>
                        <button
                          type="button" onClick={() => void handleDeleteOrder(order)}
                          className={dangerButton}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---- order editor -------------------------------------------------- */}
      {!showingProducts && orderValues && orderBeingEdited && (
        <div className="bg-white dark:bg-dark-card shadow rounded-lg p-6 space-y-4">
          <h3 className="font-bold text-brand-dark dark:text-dark-text">
            Editing order {orderBeingEdited.reference}
          </h3>
          <OrderEditor
            values={orderValues}
            setValues={setOrderValues}
            onSubmit={(patch) => void handleSaveOrder(patch)}
            onCancel={() => {
              setEditingOrder(null);
              setOrderValues(null);
            }}
            submitLabel="Save changes"
            saving={saving}
            summary={<OrderLinesSummary order={orderBeingEdited} currency={config.currency} />}
          />
        </div>
      )}
      {/* ---- file tools (collapsed, out of the everyday way) --------------- */}
      <details className="bg-white dark:bg-dark-card shadow rounded-lg">
        <summary className="cursor-pointer px-6 py-4 font-bold text-brand-dark dark:text-dark-text select-none">
          File tools &amp; backup
        </summary>

        <div className="px-6 pb-6 space-y-4">
          {loadError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
          ) : info ? (
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="File size">{formatBytes(info.sizeBytes)}</Stat>
              <Stat label="Records">
                {info.tables
                  .filter((t) => t.name === 'products' || t.name === 'orders')
                  .map((t) => `${t.rows} ${t.name}`)
                  .join(' · ') || '—'}
              </Stat>
              <Stat label="Journal">{info.journalMode}</Stat>
              <Stat label="Reclaimable">
                {formatBytes(info.freelistPages * info.pageSize)}
              </Stat>
            </dl>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button" onClick={() => void runIntegrityCheck()} disabled={busy !== null}
              className={smallButton}
            >
              {busy === 'check' ? 'Checking…' : 'Run integrity check'}
            </button>
            <button
              type="button" onClick={() => void runOptimize()} disabled={busy !== null}
              className={smallButton}
            >
              {busy === 'optimize' ? 'Optimizing…' : 'Optimize (VACUUM)'}
            </button>
            <button
              type="button" onClick={() => void downloadBackup()} disabled={busy !== null}
              className={smallButton}
            >
              {busy === 'backup' ? 'Preparing…' : 'Download backup (.db)'}
            </button>
          </div>

          {integrity &&
            (integrity.ok ? (
              <p className="text-sm text-green-700 dark:text-green-400">
                Integrity check passed — no problems found.
              </p>
            ) : (
              <div className="text-sm text-red-600 dark:text-red-400 space-y-1">
                <p className="font-semibold">Integrity check found problems:</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {integrity.messages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            ))}

          <div className="pt-4 border-t dark:border-dark-border">
            <h4 className="font-bold text-red-600 dark:text-red-400 text-sm">Danger zone</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-3">
              Deletes every order at once. Products and settings are kept — download a backup
              first if you need the history.
            </p>
            <button
              type="button" onClick={() => void purgeOrders()}
              disabled={busy !== null || orders.length === 0}
              className={dangerButton}
            >
              {busy === 'purge' ? 'Purging…' : `Delete all orders (${orders.length})`}
            </button>
          </div>
        </div>
      </details>
    </div>
  );
};

export default DatabasePanel;


