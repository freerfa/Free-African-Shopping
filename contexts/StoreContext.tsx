import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  CartItem,
  DetailedCartItem,
  Order,
  OrderStatus,
  PaymentInfo,
  Product,
  StoreConfig,
  StorePayments,
  StoreSnapshot,
  User,
} from '../types';
import { DEFAULT_PAYMENTS, DEFAULT_STORE_CONFIG, COLOR_VAR_MAP, normalizePayments } from '../storeConfig';
import { hexToRgbTriplet } from '../lib/format';
import { chargeablePrice, isContactOnly } from '../lib/product';
import { api } from '../lib/api';
import {
  STORAGE_KEYS,
  createSnapshot,
  downloadSnapshot,
  loadState,
  normalizeProducts,
  parseSnapshot,
  readFileAsText,
  saveState,
} from '../lib/storage';
import Spinner from '../components/Spinner';
import { primaryButtonClass } from '../components/ui';

interface StoreContextValue {
  config: StoreConfig;
  products: Product[];
  cart: CartItem[];
  orders: Order[];
  user: User | null;
  /** Cart lines joined with live product data. */
  detailedCart: DetailedCartItem[];
  cartCount: number;
  cartSubtotal: number;
  liveProducts: Product[];
  categories: string[];
  /** Payment settings, always fully populated (older configs have no `payments`). */
  payments: StorePayments;

  /** Local-first edit; the server sync is debounced (settings forms fire per keystroke). */
  updateConfig: (patch: Partial<StoreConfig>) => void;
  /** Merge one level into `config.payments`; also debounced through updateConfig. */
  updatePayments: (patch: Partial<StorePayments>) => void;
  /** Resolves false when the server rejected the save (list is re-synced). */
  saveProduct: (product: Product) => Promise<boolean>;
  deleteProduct: (id: string) => Promise<void>;
  toggleProductStatus: (id: string) => Promise<void>;

  addToCart: (productId: string, variantId: string | null, quantity: number) => void;
  updateCartQuantity: (key: string, quantity: number) => void;
  removeFromCart: (key: string) => void;
  clearCart: () => void;

  /** Validates stock server-side and persists the order; throws with a
   *  shopper-readable message when it cannot be fulfilled. `payment` is the
   *  manual method the shopper chose — the server re-checks it is still
   *  enabled, and it may be omitted while the payment system is hidden. */
  placeOrder: (
    details: { name: string; email: string; phone: string; address: string; payment?: PaymentInfo },
  ) => Promise<Order>;
  updateOrderStatus: (id: string, status: OrderStatus) => Promise<void>;
  /** Admin bookkeeping for a manual payment: tick it off, add a note, or both. */
  updateOrderPayment: (id: string, patch: { confirmed?: boolean; note?: string }) => Promise<void>;
  /** Admin → Database: edit one order's customer details, status or payment
   *  bookkeeping. Re-throws when the server refuses, so a form stays open. */
  updateOrder: (id: string, patch: Partial<Order>) => Promise<void>;
  /** Admin → Database: delete one order. Re-throws when the server refuses. */
  deleteOrder: (id: string) => Promise<void>;
  /** Admin → Database: file an order taken outside the site; the server prices
   *  it and decrements stock like checkout. */
  createAdminOrder: (input: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    status?: OrderStatus;
    paymentNote?: string;
    lines: { productId: string; variantId: string | null; quantity: number }[];
  }) => Promise<Order>;

  /** Resolves null on success, or the server's error message. */
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => void;

  exportStore: () => void;
  importStore: (file: File) => Promise<{ ok: boolean; message: string }>;
  resetToDefaults: () => Promise<void>;
  /** Purges every order from the database (Admin → Database). Resolves with
   *  the number of orders removed; products and settings are untouched. */
  clearOrders: () => Promise<number>;
}

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

export const makeCartKey = (productId: string, variantId: string | null): string =>
  variantId ? `${productId}::${variantId}` : productId;

export const StoreProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Data starts at safe defaults and `boot()` loads everything from the server
  // before any child renders — the provider shows a loading (or retry) screen
  // until then, so no view ever sees half-initialised data.
  const [booted, setBooted] = useState(false);
  const [bootError, setBootError] = useState('');
  const [config, setConfig] = useState<StoreConfig>(DEFAULT_STORE_CONFIG);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>(() => loadState<CartItem[]>(STORAGE_KEYS.cart, []));
  const [orders, setOrders] = useState<Order[]>([]);
  const [user, setUser] = useState<User | null>(null);
  // Last config the server knows about (boot value or last push); the
  // debounced sync skips unchanged values so boot/import never trigger a
  // pointless PUT back to the server.
  const lastSyncedConfig = useRef<StoreConfig | null>(null);

  const boot = useCallback(async () => {
    setBootError('');
    try {
      const token = loadState<string | null>(STORAGE_KEYS.authToken, null);
      const session = token
        ? api.me().then((r) => r.user).catch(() => null)
        : Promise.resolve(null);
      const [nextConfig, fetchedProducts, sessionUser] = await Promise.all([
        api.getConfig(),
        api.getProducts(),
        session,
      ]);
      setConfig(nextConfig);
      lastSyncedConfig.current = nextConfig;
      // Normalising heals odd records — same rule as the old localStorage load.
      setProducts(normalizeProducts(fetchedProducts));
      if (sessionUser) {
        setUser(sessionUser);
        // Only fetch orders when this account actually holds `orders.view`;
        // otherwise every sign-in would log a 403 and leave the tab empty.
        if (sessionUser.permissions?.includes('orders.view')) {
          try {
            setOrders(await api.getOrders());
          } catch (error) {
            console.error('[store] Could not load orders:', error);
          }
        }
      } else {
        setUser(null);
        setOrders([]);
        if (token) saveState(STORAGE_KEYS.authToken, null);
      }
      setBooted(true);
    } catch (error) {
      console.error('[store] Boot failed:', error);
      setBootError(error instanceof Error ? error.message : 'Could not load the store.');
    }
  }, []);

  useEffect(() => { void boot(); }, [boot]);

  // The cart stays per-browser: it is shopper state, not store data.
  useEffect(() => { saveState(STORAGE_KEYS.cart, cart); }, [cart]);

  // Debounced server sync for admin settings — updateConfig fires on every
  // keystroke, so coalesce bursts into one PUT ~600ms after typing stops.
  // Gated on `settings.manage` so a staff member without that right never
  // triggers a PUT that the server would refuse anyway.
  useEffect(() => {
    if (!booted || !user?.permissions?.includes('settings.manage')) return;
    const pending = config;
    if (lastSyncedConfig.current === null || lastSyncedConfig.current === pending) return;
    const timer = window.setTimeout(() => {
      lastSyncedConfig.current = pending;
      api.putConfig(pending).catch((error) => {
        console.error('[store] Could not save settings:', error);
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [config, booted, user]);

  // Push brand colours into CSS custom properties so Tailwind stays data-driven.
  useEffect(() => {
    const root = document.documentElement;
    (Object.keys(COLOR_VAR_MAP) as (keyof StoreConfig['colors'])[]).forEach((key) => {
      root.style.setProperty(COLOR_VAR_MAP[key], hexToRgbTriplet(config.colors[key]));
    });
    document.title = config.storeName;
  }, [config.colors, config.storeName]);

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const liveProducts = useMemo(() => products.filter((p) => p.status === 'live'), [products]);

  const categories = useMemo(() => {
    const set = new Set<string>(config.categories);
    products.forEach((p) => p.category && set.add(p.category));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [config.categories, products]);

  const detailedCart = useMemo<DetailedCartItem[]>(() => {
    return cart
      .map((item) => {
        const product = productsById.get(item.productId);
        // Drop lines whose product was deleted in the admin panel.
        if (!product) return null;
        // Same for a deleted variant: falling back to the base product's price and
        // stock would sell the wrong thing, and placeOrder would decrement nothing
        // for a variantId that no longer exists.
        if (item.variantId && !product.variants.some((v) => v.id === item.variantId)) return null;
        const variant = item.variantId
          ? product.variants.find((v) => v.id === item.variantId) ?? null
          : null;
        const unitPrice = variant ? variant.price : product.price;
        // `null` stock means this listing doesn't track stock (a Service or a
        // Job), so the shopper may add as many as they like.
        const available = variant ? variant.stock : product.stock;
        return {
          ...item,
          product,
          variant,
          unitPrice,
          lineTotal: chargeablePrice(unitPrice) * item.quantity,
          available,
        };
      })
      .filter((item): item is DetailedCartItem => item !== null);
  }, [cart, productsById]);

  const cartCount = useMemo(() => detailedCart.reduce((n, i) => n + i.quantity, 0), [detailedCart]);
  const cartSubtotal = useMemo(() => detailedCart.reduce((sum, i) => sum + i.lineTotal, 0), [detailedCart]);

  const updateConfig = useCallback((patch: Partial<StoreConfig>) => {
    // Local-first: the field updates instantly; the debounced sync effect
    // above pushes the merged config to the server.
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  /** Payment settings as the UI should see them: a config written before the
   *  payment feature has no `payments` key, so fill the gaps with defaults. */
  const payments = useMemo<StorePayments>(
    () => normalizePayments(config.payments ?? DEFAULT_PAYMENTS),
    [config.payments],
  );

  const updatePayments = useCallback((patch: Partial<StorePayments>) => {
    // Nested merge: the admin form edits one field at a time, and a plain
    // `...prev` would drop `bank`/`mobileMoney` whenever only a toggle changes.
    setConfig((prev) => ({ ...prev, payments: normalizePayments({ ...prev.payments, ...patch }) }));
  }, []);

  const refreshProducts = useCallback(async () => {
    try {
      setProducts(normalizeProducts(await api.getProducts()));
    } catch (error) {
      console.error('[store] Could not refresh products:', error);
    }
  }, []);

  const saveProduct = useCallback(
    async (product: Product): Promise<boolean> => {
      const exists = products.some((p) => p.id === product.id);
      // Optimistic update first (keeps the admin form snappy even with photo
      // data URLs), then confirm with the server; on failure re-sync so the
      // list reflects what actually got stored.
      setProducts((prev) =>
        exists ? prev.map((p) => (p.id === product.id ? product : p)) : [product, ...prev],
      );
      try {
        if (exists) await api.updateProduct(product);
        else await api.createProduct(product);
        return true;
      } catch (error) {
        console.error('[store] Could not save product:', error);
        await refreshProducts();
        return false;
      }
    },
    [products, refreshProducts],
  );

  const deleteProduct = useCallback(
    async (id: string): Promise<void> => {
      setProducts((prev) => prev.filter((p) => p.id !== id));
      // Keep the cart consistent with the catalogue.
      setCart((prev) => prev.filter((item) => item.productId !== id));
      try {
        await api.deleteProduct(id);
      } catch (error) {
        console.error('[store] Could not delete product:', error);
        await refreshProducts();
      }
    },
    [refreshProducts],
  );

  const toggleProductStatus = useCallback(
    async (id: string): Promise<void> => {
      const target = products.find((p) => p.id === id);
      if (!target) return;
      const updated: Product = { ...target, status: target.status === 'live' ? 'draft' : 'live' };
      setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
      try {
        await api.updateProduct(updated);
      } catch (error) {
        console.error('[store] Could not update product status:', error);
        await refreshProducts();
      }
    },
    [products, refreshProducts],
  );

  const addToCart = useCallback(
    (productId: string, variantId: string | null, quantity: number) => {
      const product = productsById.get(productId);
      if (!product) return;
      // Services and Jobs are enquiry-only: nothing to check out, so they never
      // enter the cart. The UI hides the button, this keeps a stale cart (or a
      // direct call) from sneaking one back in.
      if (isContactOnly(product)) return;
      const available = variantId
        ? product.variants.find((v) => v.id === variantId)?.stock ?? 0
        : product.stock;
      // `null` = stock isn't tracked (a Service or a Job): always addable, and
      // the quantity is left as asked for rather than capped.
      if (available !== null && available <= 0) return;

      const safeQty = Math.max(1, Math.floor(Number(quantity) || 1));
      const key = makeCartKey(productId, variantId);
      const cap = (qty: number): number => (available === null ? qty : Math.min(qty, available));
      setCart((prev) => {
        const existing = prev.find((item) => item.key === key);
        if (existing) {
          return prev.map((item) =>
            item.key === key ? { ...item, quantity: cap(item.quantity + safeQty) } : item,
          );
        }
        return [...prev, { key, productId, variantId, quantity: cap(safeQty) }];
      });
    },
    [productsById],
  );

  const updateCartQuantity = useCallback(
    (key: string, quantity: number) => {
      // Guard against NaN arriving from a cleared or malformed number input.
      if (!Number.isFinite(quantity)) return;
      setCart((prev) => {
        if (quantity <= 0) return prev.filter((item) => item.key !== key);
        const line = prev.find((item) => item.key === key);
        const product = line ? productsById.get(line.productId) : undefined;
        if (!line || !product) return prev;
        const available = line.variantId
          ? product.variants.find((v) => v.id === line.variantId)?.stock ?? 0
          : product.stock;
        return prev.map((item) =>
          item.key === key
            ? {
                ...item,
                quantity:
                  available === null
                    ? Math.max(1, Math.floor(quantity))
                    : Math.max(1, Math.min(Math.floor(quantity), Math.max(available, 1))),
              }
            : item,
        );
      });
    },
    [productsById],
  );

  const removeFromCart = useCallback((key: string) => {
    setCart((prev) => prev.filter((item) => item.key !== key));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const placeOrder = useCallback(
    async ({
      name,
      email,
      phone,
      address,
      payment,
    }: {
      name: string;
      email: string;
      phone: string;
      address: string;
      /** Omitted when the payment system is hidden (`payments.status === 'hide'`). */
      payment?: PaymentInfo;
    }): Promise<Order> => {
      // Stock can change between adding to the cart and checking out (another
      // browser tab, or an admin edit). Re-check here for instant feedback,
      // then let the server re-validate stock and compute the prices — it is
      // the source of truth.
      // `null` availability = stock isn't tracked, so it never counts as a shortage.
      const shortages = detailedCart.filter(
        (item) => item.available !== null && item.quantity > item.available,
      );
      if (shortages.length > 0) {
        throw new Error(
          shortages.length === 1
            ? `Only ${shortages[0].available} of "${shortages[0].product.name}" left. Please update your cart.`
            : `Not enough stock for: ${shortages.map((s) => s.product.name).join(', ')}. Please update your cart.`,
        );
      }
      if (detailedCart.length === 0) {
        throw new Error('Your cart is empty.');
      }

      // Reference generation, uniqueness checks and the authoritative stock
      // decrement all happen inside the server's order transaction.
      const order = await api.placeOrder(
        { name, email, phone, address },
        detailedCart.map((item) => ({
          productId: item.product.id,
          variantId: item.variantId,
          quantity: item.quantity,
        })),
        payment,
      );
      setOrders((prev) => [order, ...prev]);
      // Optimistic stock decrement mirroring what the server just wrote.
      setProducts((prev) =>
        prev.map((product) => {
          // Every line for this product, not just the first: a shopper can hold
          // two variants of the same product at once (keys are per product+variant).
          const lines = detailedCart.filter((d) => d.product.id === product.id);
          if (lines.length === 0) return product;

          // Sum the sold quantity per variant so a variant bought across two
          // cart lines is decremented by both amounts, not just the first.
          const soldByVariant = new Map<string, number>();
          let soldUnvarianted = 0;
          lines.forEach((line) => {
            if (line.variantId) {
              soldByVariant.set(
                line.variantId,
                (soldByVariant.get(line.variantId) ?? 0) + line.quantity,
              );
            } else {
              soldUnvarianted += line.quantity;
            }
          });

          return {
            ...product,
            // A listing with no tracked stock (Services/Jobs) keeps its `null`;
            // subtracting from it would turn "not tracked" into "none left".
            stock: product.stock === null ? null : Math.max(0, product.stock - soldUnvarianted),
            variants: product.variants.map((v) => {
              const sold = soldByVariant.get(v.id);
              return sold ? { ...v, stock: Math.max(0, v.stock - sold) } : v;
            }),
          };
        }),
      );
      setCart([]);
      return order;
    },
    [detailedCart],
  );

  const updateOrderStatus = useCallback(async (id: string, status: OrderStatus): Promise<void> => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    try {
      await api.setOrderStatus(id, status);
    } catch (error) {
      console.error('[store] Could not update order status:', error);
      try {
        setOrders(await api.getOrders());
      } catch {
        // Server unreachable — keep the optimistic state for now.
      }
    }
  }, []);

  const updateOrderPayment = useCallback(
    async (id: string, patch: { confirmed?: boolean; note?: string }): Promise<void> => {
      // Optimistic: ticking a payment off should feel instant, and the server
      // echo below replaces the row with what it actually stored.
      setOrders((prev) =>
        prev.map((order) =>
          order.id === id
            ? {
                ...order,
                ...(patch.confirmed !== undefined ? { paymentConfirmed: patch.confirmed } : {}),
                ...(patch.note !== undefined ? { paymentNote: patch.note } : {}),
              }
            : order,
        ),
      );
      try {
        const updated = await api.setOrderPayment(id, patch);
        setOrders((prev) => prev.map((order) => (order.id === id ? updated : order)));
      } catch (error) {
        console.error('[store] Could not update the order payment:', error);
        try {
          setOrders(await api.getOrders());
        } catch {
          // Server unreachable — keep the optimistic state for now.
        }
      }
    },
    [],
  );

  /** Admin → Database: applies an edit to one order in place. Optimistic like the
   *  other order actions, and the server's stored copy replaces the row so the
   *  table always shows what is really in the database. Re-throws so the caller
   *  can report a rejected save and keep the form open. */
  const updateOrder = useCallback(async (id: string, patch: Partial<Order>): Promise<void> => {
    const previous = orders.find((o) => o.id === id);
    if (!previous) return;
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    try {
      const updated = await api.updateOrder(id, patch);
      setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch (error) {
      console.error('[store] Could not update the order:', error);
      setOrders((prev) => prev.map((o) => (o.id === id ? previous : o)));
      throw error;
    }
  }, [orders]);

  /** Admin → Database: deletes one order. */
  const deleteOrder = useCallback(async (id: string): Promise<void> => {
    const previous = orders;
    setOrders((prev) => prev.filter((o) => o.id !== id));
    try {
      await api.deleteOrder(id);
    } catch (error) {
      console.error('[store] Could not delete the order:', error);
      setOrders(previous);
      throw error;
    }
  }, [orders]);

  /** Admin → Database: records an order taken outside the site. The server
   *  prices the lines and decrements stock, so the catalogue is re-read to keep
   *  the product table's stock column honest. */
  const createAdminOrder = useCallback(
    async (input: {
      name: string;
      email?: string;
      phone?: string;
      address?: string;
      status?: OrderStatus;
      paymentNote?: string;
      lines: { productId: string; variantId: string | null; quantity: number }[];
    }): Promise<Order> => {
      const created = await api.createAdminOrder(input);
      setOrders((prev) => [created, ...prev]);
      await refreshProducts();
      return created;
    },
    [refreshProducts],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      try {
        const { token, user: signedIn } = await api.login(email, password);
        saveState(STORAGE_KEYS.authToken, token);
        setUser(signedIn);
        // Admins see drafts and the order book — refetch both with the token.
        setProducts(normalizeProducts(await api.getProducts()));
        setOrders(await api.getOrders());
        return null;
      } catch (error) {
        console.error('[store] Login failed:', error);
        return error instanceof Error ? error.message : 'Sign-in failed.';
      }
    },
    [],
  );

  const logout = useCallback(() => {
    // api.logout() reads the token synchronously, so fire it before clearing.
    void api.logout().catch(() => undefined);
    saveState(STORAGE_KEYS.authToken, null);
    setUser(null);
    setOrders([]);
  }, []);

  const exportStore = useCallback(() => {
    const snapshot = createSnapshot(config, products, orders);
    const safeName =
      config.storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    downloadSnapshot(snapshot, `${safeName || 'store'}-${new Date().toISOString().slice(0, 10)}.json`);
  }, [config, products, orders]);

  /** Applies a bulk server response that replaced config/products/orders
   *  wholesale (import and reset both return the stored, normalised result). */
  const applyServerStore = useCallback(
    (data: { config: StoreConfig; products: Product[]; orders: Order[] }) => {
      setConfig(data.config);
      lastSyncedConfig.current = data.config;
      setProducts(normalizeProducts(data.products));
      setOrders(data.orders);
    },
    [],
  );

  const importStore = useCallback(
    async (file: File) => {
      try {
        const raw = await readFileAsText(file);
        const result = parseSnapshot(raw);
        if (!result.ok) return { ok: false, message: result.error };
        const snapshot: StoreSnapshot = result.snapshot;
        // The server merges with defaults, validates and stores the snapshot;
        // credentials found in the file are deliberately ignored.
        const restored = await api.importSnapshot(snapshot);
        applyServerStore(restored);
        setCart([]);
        return {
          ok: true,
          message: `Loaded ${restored.products.length} product(s) into "${restored.config.storeName}".`,
        };
      } catch (error) {
        console.error('Import failed:', error);
        return {
          ok: false,
          message:
            error instanceof Error && error.message ? error.message : 'Could not read that file.',
        };
      }
    },
    [applyServerStore],
  );

  const resetToDefaults = useCallback(async (): Promise<void> => {
    // Throws on failure so the admin panel can report it instead of claiming
    // a reset that never happened.
    const restored = await api.reset();
    applyServerStore(restored);
    setCart([]);
  }, [applyServerStore]);

  const clearOrders = useCallback(async (): Promise<number> => {
    // Purges server-side, then empties the local list so the orders tab and
    // the Database tab counts agree with the database right away.
    const { cleared } = await api.clearOrders();
    setOrders([]);
    return cleared;
  }, []);

  const value = useMemo<StoreContextValue>(
    () => ({
      config, products, cart, orders, user, detailedCart, cartCount, cartSubtotal,
      liveProducts, categories, payments,
      updateConfig, updatePayments, saveProduct, deleteProduct, toggleProductStatus,
      addToCart, updateCartQuantity, removeFromCart, clearCart,
      placeOrder, updateOrderStatus, updateOrderPayment, updateOrder, deleteOrder,
      createAdminOrder, login, logout,
      exportStore, importStore, resetToDefaults, clearOrders,
    }),
    [
      config, products, cart, orders, user, detailedCart, cartCount, cartSubtotal,
      liveProducts, categories, payments,
      updateConfig, updatePayments, saveProduct, deleteProduct, toggleProductStatus,
      addToCart, updateCartQuantity, removeFromCart, clearCart,
      placeOrder, updateOrderStatus, updateOrderPayment, updateOrder, deleteOrder,
      createAdminOrder, login, logout,
      exportStore, importStore, resetToDefaults, clearOrders,
    ],
  );

  // All hooks run unconditionally above this gate (React rules) — the boot
  // screens simply replace the app tree until the server has answered.
  if (!booted) {
    if (bootError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
          <p role="alert" className="text-red-500 font-semibold">
            Could not load the store: {bootError}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Make sure the store server is running (
            <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-dark-card">npm run dev</code>
            ), then retry.
          </p>
          <button type="button" onClick={() => void boot()} className={primaryButtonClass}>
            Retry
          </button>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <Spinner />
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading the store…</p>
      </div>
    );
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

export const useStore = (): StoreContextValue => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error('useStore must be used within a StoreProvider');
  return context;
};