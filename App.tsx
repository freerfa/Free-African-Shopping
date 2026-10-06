import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from './types';
import type { Order } from './types';
import { StoreProvider, useStore } from './contexts/StoreContext';
import { ToastProvider, useToast } from './contexts/ToastContext';
import Header from './components/Header';
import Footer from './components/Footer';
import HomeView from './components/HomeView';
import ErrorBoundary from './components/ErrorBoundary';
import ProductDetail from './components/ProductDetail';
import CartView from './components/CartView';
import CheckoutView from './components/CheckoutView';
import LoginView from './components/LoginView';
import Spinner from './components/Spinner';
import { formatPrice } from './lib/format';

// AdminView (and the Gemini SDK it pulls in) only loads once an admin opens the
// panel, keeping that weight out of the shopper's initial bundle.
const AdminView = React.lazy(() => import('./components/admin/AdminView'));

/**
 * Hash routing: every view gets a `#/…` address so product pages and carts
 * survive a refresh and can be shared. Hashes rather than path URLs mean any
 * static host serves the app with no rewrite rules.
 */
type RouteState = { view: View; productId: string | null };

const HOME_ROUTE: RouteState = { view: View.Home, productId: null };

/** decodeURIComponent throws on malformed %-sequences; never let a bad URL crash the app. */
const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const parseHash = (): RouteState => {
  const raw = window.location.hash.replace(/^#\/?/, ''); // '#/cart' -> 'cart'
  const [head, param] = raw.split('/');
  switch (head) {
    case 'product':
      return param ? { view: View.Product, productId: safeDecode(param) } : HOME_ROUTE;
    case 'cart':
      return { view: View.Cart, productId: null };
    case 'checkout':
      return { view: View.Checkout, productId: null };
    case 'login':
      return { view: View.Login, productId: null };
    case 'admin':
      return { view: View.Admin, productId: null };
    default:
      return HOME_ROUTE;
  }
};

/** Address for a view; null means "no hash" (Home), keeping entry URLs clean. */
const hashForRoute = (view: View, productId: string | null): string | null => {
  switch (view) {
    case View.Product:
      return productId ? `#/product/${encodeURIComponent(productId)}` : null;
    case View.Cart:
      return '#/cart';
    case View.Checkout:
      return '#/checkout';
    case View.Login:
      return '#/login';
    case View.Admin:
      return '#/admin';
    default:
      return null;
  }
};

/** Parsed once at module load so deep links apply before the first render. */
const INITIAL_ROUTE = parseHash();

const Storefront: React.FC = () => {
  const { user, config, products, cartCount, addToCart, logout } = useStore();
  const { toast } = useToast();

  // The initial view comes from the URL, so a shared `#/product/…` link opens
  // the right page on the very first render.
  const [view, setView] = useState<View>(INITIAL_ROUTE.view);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    INITIAL_ROUTE.productId,
  );
  const [searchQuery, setSearchQuery] = useState('');
  // The freshly placed order, held only long enough to show the thank-you panel
  // with the payment instructions (reference, bank/wallet details).
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);

  const selectedProduct = useMemo(
    () => (selectedProductId ? products.find((p) => p.id === selectedProductId) : undefined),
    [products, selectedProductId],
  );

  // New views should start at the top, the way a page load would behave.
  // selectedProductId is included so navigating product → related product also
  // scrolls, since the `view` enum does not change in that case.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [view, placedOrder, selectedProductId]);

  // A shopper who is not an admin must never be able to sit on the admin view,
  // e.g. by logging out while it is open.
  useEffect(() => {
    if (view === View.Admin && !user?.isAdmin) setView(View.Home);
  }, [view, user]);

  // Navigating elsewhere (header links, search, footer) dismisses the order
  // confirmation. Placing an order does not change `view`, so this never wipes
  // the reference at the moment it is set.
  useEffect(() => {
    setPlacedOrder(null);
  }, [view]);

  // URL -> state: back/forward, manual hash edits and typed deep links all
  // arrive as `hashchange`. Products load synchronously from localStorage, so
  // there is no async loading state to manage.
  useEffect(() => {
    const onHashChange = () => {
      const route = parseHash();
      setView(route.view);
      setSelectedProductId(route.productId);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // State -> URL. pushState does not fire `hashchange`, so this direction
  // never round-trips into the listener above. Home is written hash-free; a
  // valid deep link on first load already matches its target and is left
  // untouched, so the URL bar never flickers.
  useEffect(() => {
    const target = hashForRoute(view, selectedProductId);
    if (target === null) {
      if (window.location.hash) {
        history.pushState(null, '', window.location.pathname + window.location.search);
      }
    } else if (target !== window.location.hash) {
      history.pushState(null, '', target);
    }
  }, [view, selectedProductId]);

  // Keep the tab/bookmark label in step with the route; index.html can only
  // ship one static title for the whole SPA.
  useEffect(() => {
    switch (view) {
      case View.Product:
        document.title = selectedProduct
          ? `${selectedProduct.name} · ${config.storeName}`
          : `Product · ${config.storeName}`;
        break;
      case View.Cart:
        document.title = `Cart · ${config.storeName}`;
        break;
      case View.Checkout:
        document.title = `Checkout · ${config.storeName}`;
        break;
      case View.Login:
        document.title = `Sign in · ${config.storeName}`;
        break;
      case View.Admin:
        document.title = `Admin · ${config.storeName}`;
        break;
      default:
        document.title = config.storeName;
    }
  }, [view, selectedProduct, config.storeName]);

  const goHome = useCallback(() => {
    setView(View.Home);
    setSearchQuery('');
  }, []);

  // Typing in the header search while on any other view would otherwise be
  // invisible (only HomeView renders results), so jump home as soon as a
  // non-empty query is entered.
  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (query.trim().length > 0 && view !== View.Home) setView(View.Home);
    },
    [view],
  );

  const openProduct = useCallback((productId: string) => {
    setSelectedProductId(productId);
    setView(View.Product);
  }, []);

  const handleOrderPlaced = useCallback((order: Order) => {
    setPlacedOrder(order);
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    setView(View.Home);
  }, [logout]);

  return (
    <div className="min-h-screen flex flex-col bg-brand-offwhite dark:bg-dark-bg transition-colors duration-300">
      <Header
        user={user}
        cartItemCount={cartCount}
        setView={setView}
        onLogout={handleLogout}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
      />

      <main className="flex-grow">
        {view === View.Home && (
          <HomeView searchQuery={searchQuery} onOpenProduct={openProduct} />
        )}

        {view === View.Product && (
          <ProductDetail
            product={selectedProduct}
            onBack={goHome}
            onOpen={openProduct}
            onAdd={(productId, variantId, quantity) => {
              addToCart(productId, variantId, quantity);
              // ProductDetail is rendered with the live product list, so look the
              // name up after adding rather than closing over a stale copy.
              const added = products.find((p) => p.id === productId);
              toast(`Added ${added?.name ?? 'item'} to your cart.`);
              // Stay on the page so shoppers can keep browsing; the toast and
              // the header's cart badge already confirm the add.
            }}
          />
        )}

        {view === View.Cart && (
          <CartView
            onCheckout={() => setView(View.Checkout)}
            onContinueShopping={goHome}
          />
        )}

        {/* Hidden while the thank-you panel is up: the cart is already cleared,
            so CheckoutView would otherwise render its "cart is empty" fallback
            directly above the confirmation. */}
        {view === View.Checkout && !placedOrder && (
          <CheckoutView
            onDone={handleOrderPlaced}
            onBackToCart={() => setView(View.Cart)}
          />
        )}

        {view === View.Login && <LoginView onDone={goHome} />}

        {view === View.Admin && user?.isAdmin && (
          <React.Suspense
            fallback={
              <div className="container mx-auto px-4 py-16">
                <Spinner />
              </div>
            }
          >
            <AdminView onExit={goHome} />
          </React.Suspense>
        )}

        {placedOrder && (
          <div className="container mx-auto px-4 sm:px-6 py-16">
            <div className="max-w-xl mx-auto bg-white dark:bg-dark-card shadow-xl rounded-lg p-10">
              <div className="text-center">
                <h1 className="text-4xl font-bold text-brand-dark dark:text-dark-text">
                  Thank you!
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-4">
                  Your order has been placed. Keep this reference for your records:
                </p>
                <p className="text-3xl font-bold text-brand-gold-ink dark:text-brand-gold mt-4 tracking-wider">
                  {placedOrder.reference}
                </p>
              </div>

              {/* Manual payments: spell out exactly where the money goes and what
                  to quote, so the admin can match the payment to the order. */}
              {placedOrder.payment && (
                <div className="mt-8 rounded-md bg-brand-offwhite dark:bg-dark-bg p-5 text-sm space-y-3">
                  <p className="font-semibold text-brand-dark dark:text-dark-text">
                    {placedOrder.payment.method === 'bankTransfer' && 'Complete your bank transfer'}
                    {placedOrder.payment.method === 'mobileMoney' && 'Complete your mobile-money payment'}
                    {placedOrder.payment.method === 'payOnDelivery' && 'Pay when your order arrives'}
                  </p>

                  {placedOrder.payment.method === 'payOnDelivery' ? (
                    <p className="text-gray-600 dark:text-gray-300">
                      Nothing to pay now — our courier collects{' '}
                      <strong className="text-brand-dark dark:text-dark-text">
                        {formatPrice(placedOrder.total, config.currency)}
                      </strong>{' '}
                      when the order is delivered.
                    </p>
                  ) : (
                    <>
                      <p className="text-gray-600 dark:text-gray-300">
                        Send{' '}
                        <strong className="text-brand-dark dark:text-dark-text">
                          {formatPrice(placedOrder.total, config.currency)}
                        </strong>{' '}
                        to:
                      </p>
                      <dl className="space-y-1 text-gray-600 dark:text-gray-300">
                        <div className="flex justify-between gap-4">
                          <dt>{placedOrder.payment.method === 'bankTransfer' ? 'Bank' : 'Network'}</dt>
                          <dd className="font-medium text-right text-brand-dark dark:text-dark-text">
                            {placedOrder.payment.bankName || placedOrder.payment.network || '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt>Account name</dt>
                          <dd className="font-medium text-right text-brand-dark dark:text-dark-text">
                            {placedOrder.payment.accountName || '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt>Account number</dt>
                          <dd className="font-mono font-bold text-brand-gold-ink dark:text-brand-gold">
                            {placedOrder.payment.accountNumber || '—'}
                          </dd>
                        </div>
                      </dl>
                      <p className="text-gray-600 dark:text-gray-300">
                        Quote{' '}
                        <strong className="text-brand-gold-ink dark:text-brand-gold">
                          {placedOrder.reference}
                        </strong>{' '}
                        as the{' '}
                        {placedOrder.payment.method === 'bankTransfer' ? 'narration' : 'reason'} so we
                        can match your payment.
                      </p>
                      {placedOrder.payment.transactionRef && (
                        <p className="text-gray-600 dark:text-gray-300">
                          Reference on file: {placedOrder.payment.transactionRef}
                        </p>
                      )}
                    </>
                  )}

                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Our team checks every payment by hand and updates your order once the money
                    arrives. Nothing was charged on this site.
                  </p>
                </div>
              )}

              {/* No method on the order: the payment system was hidden at
                  checkout, so payment is arranged with the shopper directly. */}
              {!placedOrder.payment && (
                <div className="mt-8 rounded-md bg-brand-offwhite dark:bg-dark-bg p-5 text-sm text-gray-600 dark:text-gray-300">
                  <p className="font-semibold text-brand-dark dark:text-dark-text mb-1">
                    Payment to be arranged
                  </p>
                  <p>
                    We'll be in touch shortly to arrange payment and confirm your delivery for
                    order{' '}
                    <strong className="text-brand-gold-ink dark:text-brand-gold">
                      {placedOrder.reference}
                    </strong>
                    .
                  </p>
                </div>
              )}

              <div className="text-center">
                <button
                  onClick={() => {
                    setPlacedOrder(null);
                    goHome();
                  }}
                  className="mt-8 bg-brand-dark text-white py-3 px-8 rounded-full font-semibold hover:bg-gray-800 transition-colors duration-300"
                >
                  Continue shopping
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer onNavigate={setView} />
    </div>
  );
};

/**
 * The provider has to sit above anything that calls useStore, so it wraps the
 * whole tree here rather than in index.tsx (which only owns the theme).
 */
const App: React.FC = () => (
  <StoreProvider>
    <ToastProvider>
      {/* The boundary sits below the providers so its fallback can render on its
          own, but above Storefront so any view's render crash is caught. */}
      <ErrorBoundary>
        <Storefront />
      </ErrorBoundary>
    </ToastProvider>
  </StoreProvider>
);

export default App;