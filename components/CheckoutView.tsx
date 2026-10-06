import React, { useMemo, useState } from 'react';
import type { Order, PaymentInfo, PaymentMethod } from '../types';
import { useStore } from '../contexts/StoreContext';
import { formatPrice } from '../lib/format';
import { primaryImage } from '../lib/product';
import { checkoutShowsPayment, checkoutTakesOrders, enabledPaymentMethods, PAYMENT_METHOD_LABELS, usableWallets } from '../lib/payments';
import { goldButtonClass, inputClass, labelClass, Section } from './ui';

interface CheckoutViewProps {
  /** Hands back the placed order so the confirmation can show where to pay. */
  onDone: (order: Order) => void;
  onBackToCart: () => void;
}

const CheckoutView: React.FC<CheckoutViewProps> = ({ onDone, onBackToCart }) => {
  const { config, payments, detailedCart, cartSubtotal, placeOrder } = useStore();
  const methods = useMemo(() => enabledPaymentMethods(payments), [payments]);
  const wallets = useMemo(() => usableWallets(payments), [payments]);
  const bank = payments.bank;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('bankTransfer');
  /** Chosen wallet, tracked by its account number (unique per wallet row). */
  const [walletNumber, setWalletNumber] = useState('');
  const [payerName, setPayerName] = useState('');
  const [payerNumber, setPayerNumber] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // The admin can switch a method off while a checkout is open, so fall back to
  // the first one still on offer instead of posting a method the server rejects.
  const activeMethod: PaymentMethod | undefined = methods.includes(method) ? method : methods[0];
  const activeWallet = wallets.find((w) => w.accountNumber === walletNumber) ?? wallets[0];
  // Master switch: `hide` keeps checkout open but drops the payment step,
  // `inactive` (handled below) closes checkout altogether.
  const hidePayment = !checkoutShowsPayment(payments);

  /** One line under each radio button explaining what that method involves. */
  const methodHint = (option: PaymentMethod): string => {
    if (option === 'bankTransfer') {
      return `Transfer to ${bank.bankName}${bank.accountNumber ? ` · ${bank.accountNumber}` : ''}`;
    }
    if (option === 'mobileMoney') return 'Send from your phone to one of our wallets.';
    return payments.payOnDeliveryNote;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!name.trim() || !email.trim() || !phone.trim() || !address.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (!hidePayment) {
      if (!activeMethod) {
        setError('This store has not switched on a payment method yet. Please contact us to order.');
        return;
      }
      if (activeMethod === 'mobileMoney' && !activeWallet) {
        setError('Choose the mobile-money wallet you are paying into.');
        return;
      }
    }

    // Only the fields that matter for the chosen method travel; the server
    // fills in the receiving account from its own settings. While payments are
    // hidden nothing travels at all — the order goes through methodless.
    const payment: (PaymentInfo & { wallet?: string }) | undefined =
      hidePayment || !activeMethod
        ? undefined
        : {
            method: activeMethod,
            ...(payerName.trim() ? { payerName: payerName.trim() } : {}),
            ...(transactionRef.trim() ? { transactionRef: transactionRef.trim() } : {}),
            ...(activeMethod === 'mobileMoney'
              ? {
                  wallet: activeWallet?.accountNumber ?? '',
                  ...(payerNumber.trim() ? { payerNumber: payerNumber.trim() } : {}),
                }
              : {}),
          };

    setSubmitting(true);
    try {
      const order = await placeOrder({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        address: address.trim(),
        payment,
      });
      onDone(order);
    } catch (err) {
      // placeOrder rejects orders for stock that is no longer available, so the
      // shopper is sent back to the cart to fix the quantities.
      const message = err instanceof Error ? err.message : 'Could not place the order.';
      if (/cart is empty/i.test(message)) {
        onBackToCart();
        return;
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (detailedCart.length === 0) {
    return (
      <div className="container mx-auto px-6 py-16 text-center">
        <Section title="Checkout" subtitle="Your cart is empty." />
        <button onClick={onBackToCart} className={goldButtonClass}>Back to cart</button>
      </div>
    );
  }

  // `inactive`: the payment system is switched off completely, so checkout is
  // closed too — the server refuses orders in this state as well.
  if (!checkoutTakesOrders(payments)) {
    return (
      <div className="container mx-auto px-6 py-16 text-center">
        <Section
          title="Checkout"
          subtitle="We're not taking orders right now — please check back soon."
        />
        <button onClick={onBackToCart} className={goldButtonClass}>Back to shop</button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 py-12">
      <Section
        title="Checkout"
        subtitle="Pay by bank transfer, mobile money or on delivery — our team confirms your payment."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <form onSubmit={handleSubmit} className="lg:col-span-2 bg-white dark:bg-dark-card shadow-xl rounded-lg p-6 space-y-5">
          {error && <p className="text-red-500 bg-red-100 dark:bg-red-900/50 dark:text-red-300 p-3 rounded-md">{error}</p>}

          <div>
            <label className={labelClass} htmlFor="co-name">Full name</label>
            <input id="co-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
          </div>
          <div>
            <label className={labelClass} htmlFor="co-email">Email</label>
            <input id="co-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required />
          </div>
          <div>
            <label className={labelClass} htmlFor="co-phone">Phone</label>
            <input
              id="co-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
              placeholder="+234 801 234 5678"
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="co-address">Shipping address</label>
            <textarea id="co-address" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} required />
          </div>

          {/* `hide`: no payment step at all — the shopper just leaves their
              delivery details and we settle the payment with them afterwards. */}
          {!hidePayment && (
            <fieldset className="space-y-3 pt-4 border-t dark:border-dark-border">
              <legend className={`${labelClass} mb-2`}>How would you like to pay?</legend>

            {methods.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                This store has not switched on a payment method yet. Please contact us to place
                your order.
              </p>
            ) : (
              methods.map((option) => (
                <label
                  key={option}
                  className={`flex gap-3 items-start p-3 rounded-md border cursor-pointer transition-colors ${
                    activeMethod === option
                      ? 'border-brand-gold-ink dark:border-brand-gold bg-brand-gold/10'
                      : 'border-gray-300 dark:border-dark-border hover:border-brand-gold-ink dark:hover:border-brand-gold'
                  }`}
                >
                  <input
                    type="radio"
                    name="payment-method"
                    value={option}
                    checked={activeMethod === option}
                    onChange={() => setMethod(option)}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-brand-dark dark:text-dark-text">
                      {PAYMENT_METHOD_LABELS[option]}
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      {methodHint(option)}
                    </span>
                  </span>
                </label>
              ))
            )}

            {activeMethod === 'bankTransfer' && (
              <div className="rounded-md bg-brand-offwhite dark:bg-dark-bg p-4 space-y-3 text-sm">
                <p className="font-semibold text-brand-dark dark:text-dark-text">
                  Pay into this account
                </p>
                <dl className="space-y-1 text-gray-600 dark:text-gray-300">
                  <div className="flex justify-between gap-4">
                    <dt>Bank</dt>
                    <dd className="font-medium text-brand-dark dark:text-dark-text">{bank.bankName}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Account name</dt>
                    <dd className="font-medium text-brand-dark dark:text-dark-text text-right">
                      {bank.accountName}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Account number</dt>
                    <dd className="font-mono font-bold text-brand-gold-ink dark:text-brand-gold tracking-wide">
                      {bank.accountNumber}
                    </dd>
                  </div>
                  {bank.branch && (
                    <div className="flex justify-between gap-4">
                      <dt>Branch</dt>
                      <dd className="font-medium text-brand-dark dark:text-dark-text">{bank.branch}</dd>
                    </div>
                  )}
                </dl>
                <p className="text-xs text-gray-600 dark:text-gray-400">{bank.instructions}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Place the order and the next screen shows your reference — quote it in the
                  transfer narration so we can match your payment.
                </p>
                <div>
                  <label className={labelClass} htmlFor="co-payer-name">
                    Name on the transfer <span className="font-normal">(optional)</span>
                  </label>
                  <input
                    id="co-payer-name"
                    type="text"
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                    className={inputClass}
                    placeholder="Name shown on the bank receipt"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="co-transfer-ref">
                    Transfer reference <span className="font-normal">(optional)</span>
                  </label>
                  <input
                    id="co-transfer-ref"
                    type="text"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className={inputClass}
                    placeholder="If you have already sent the money"
                  />
                </div>
              </div>
            )}

            {activeMethod === 'mobileMoney' && (
              <div className="rounded-md bg-brand-offwhite dark:bg-dark-bg p-4 space-y-3 text-sm">
                {wallets.length === 0 ? (
                  <p className="text-gray-600 dark:text-gray-400">
                    No mobile-money wallet is set up yet. Please choose another method.
                  </p>
                ) : (
                  <>
                    <div>
                      <label className={labelClass} htmlFor="co-wallet">
                        Wallet to send to
                      </label>
                      <select
                        id="co-wallet"
                        value={activeWallet?.accountNumber ?? ''}
                        onChange={(e) => setWalletNumber(e.target.value)}
                        className={inputClass}
                      >
                        {wallets.map((wallet) => (
                          <option
                            key={`${wallet.label}-${wallet.accountNumber}`}
                            value={wallet.accountNumber}
                          >
                            {[wallet.label, wallet.network, wallet.accountNumber]
                              .filter(Boolean)
                              .join(' · ')}
                          </option>
                        ))}
                      </select>
                    </div>
                    {activeWallet && (
                      <p className="text-gray-600 dark:text-gray-300">
                        Send to{' '}
                        <span className="font-medium text-brand-dark dark:text-dark-text">
                          {activeWallet.accountName}
                        </span>{' '}
                        on{' '}
                        <span className="font-mono font-bold text-brand-gold-ink dark:text-brand-gold">
                          {activeWallet.accountNumber}
                        </span>
                        , quoting the order reference shown after you place the order.
                      </p>
                    )}
                    <div>
                      <label className={labelClass} htmlFor="co-payer-number">
                        The number you are paying from <span className="font-normal">(optional)</span>
                      </label>
                      <input
                        id="co-payer-number"
                        type="tel"
                        inputMode="tel"
                        value={payerNumber}
                        onChange={(e) => setPayerNumber(e.target.value)}
                        className={inputClass}
                        placeholder="0244 000 000"
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="co-momo-ref">
                        Transaction ID <span className="font-normal">(optional)</span>
                      </label>
                      <input
                        id="co-momo-ref"
                        type="text"
                        value={transactionRef}
                        onChange={(e) => setTransactionRef(e.target.value)}
                        className={inputClass}
                        placeholder="From your mobile-money receipt"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {activeMethod === 'payOnDelivery' && (
              <div className="rounded-md bg-brand-offwhite dark:bg-dark-bg p-4 text-sm text-gray-600 dark:text-gray-300">
                {payments.payOnDeliveryNote}
              </div>
            )}

            {activeMethod && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Payments are confirmed by our team once the money arrives — we never take card
                details on this site.
              </p>
            )}
            </fieldset>
          )}

          {hidePayment && (
            <p className="text-xs text-gray-500 dark:text-gray-400 pt-4 border-t dark:border-dark-border">
              Nothing to pay up front — after you place the order we'll contact you to arrange
              payment and delivery.
            </p>
          )}

          <button
            type="submit"
            className={goldButtonClass}
            disabled={submitting || (!hidePayment && methods.length === 0)}
          >
            {submitting ? 'Placing order…' : 'Place order'}
          </button>
        </form>

        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-dark-card shadow-xl rounded-lg p-6 lg:sticky lg:top-32">
            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-text mb-4">Your Items</h3>
            {detailedCart.map((item) => (
              <div key={item.key} className="flex items-center gap-3 mb-3">
                <img src={primaryImage(item.product)} alt="" className="w-12 h-12 object-cover rounded" />
                <div className="flex-grow min-w-0">
                  <p className="text-sm font-medium dark:text-dark-text truncate">{item.product.name}</p>
                  <p className="text-xs text-gray-500">Qty {item.quantity}</p>
                </div>
                <span className="text-sm font-semibold dark:text-dark-text">
                  {formatPrice(item.lineTotal, config.currency)}
                </span>
              </div>
            ))}
            {!hidePayment && (
              <div className="flex justify-between text-sm pt-4 border-t dark:border-dark-border">
                <span className="text-gray-600 dark:text-gray-300">Payment</span>
                <span className="font-medium text-brand-dark dark:text-dark-text">
                  {activeMethod ? PAYMENT_METHOD_LABELS[activeMethod] : '—'}
                </span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-2">
              <span className="text-brand-dark dark:text-dark-text">Total</span>
              <span className="text-brand-dark dark:text-dark-text">{formatPrice(cartSubtotal, config.currency)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutView;