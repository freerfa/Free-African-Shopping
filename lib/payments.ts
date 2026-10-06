/**
 * Labels and formatting shared by the three places that talk about payments:
 * checkout (choosing one), the order confirmation (where to send the money) and
 * the admin order list (what the shopper says they paid with).
 *
 * Every method here is MANUAL: the store never charges a card, it tells the
 * shopper where to send the money and an admin confirms it afterwards.
 */
import type { PaymentInfo, PaymentMethod, PaymentSystemStatus, StorePayments } from '../types';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bankTransfer: 'Bank transfer',
  mobileMoney: 'Mobile money',
  payOnDelivery: 'Pay on delivery',
};

/** What the admin's three-position switch is called in the UI. */
export const PAYMENT_SYSTEM_LABELS: Record<PaymentSystemStatus, string> = {
  active: 'Active',
  hide: 'Hide',
  inactive: 'Inactive',
};

/** What each position actually does, shown under the switch. */
export const PAYMENT_SYSTEM_BLURB: Record<PaymentSystemStatus, string> = {
  active: 'Checkout shows the payment methods and asks the shopper to pick one.',
  hide: 'Checkout hides the payment section — orders come in without a method and you settle up with the shopper directly.',
  inactive: 'Checkout is closed: the store is not taking orders until you switch it back on.',
};

/** May shoppers place orders at all? (Everything but `inactive`.) */
export const checkoutTakesOrders = (payments: StorePayments): boolean =>
  payments.status !== 'inactive';

/** Should checkout ask HOW the shopper is paying? (Only `active`.) */
export const checkoutShowsPayment = (payments: StorePayments): boolean =>
  payments.status === 'active';

/** The order checkout lists them in — bank transfer first, the default. */
export const PAYMENT_METHOD_ORDER: PaymentMethod[] = ['bankTransfer', 'mobileMoney', 'payOnDelivery'];

/** What a method's OWN switch does at each position — the wording shown under
 *  that method's toggle in Admin → Payments. */
export const PAYMENT_METHOD_STATUS_BLURB: Record<PaymentSystemStatus, string> = {
  active: 'Shown at checkout and offered to shoppers.',
  hide: 'Off the list — a checkout opened before you hid it can still complete.',
  inactive: 'Off for good: hidden from checkout and rejected by the server.',
};

/** One method's own switch, read straight off the settings. */
export const paymentMethodStatus = (
  payments: StorePayments,
  method: PaymentMethod,
): PaymentSystemStatus => {
  switch (method) {
    case 'bankTransfer':
      return payments.bankTransferStatus;
    case 'mobileMoney':
      return payments.mobileMoneyStatus;
    case 'payOnDelivery':
      return payments.payOnDeliveryStatus;
    default:
      return 'inactive';
  }
};

/** Somewhere to send the money (a mobile-money option with no wallet number is
 *  unusable) — the switch position itself is checked separately. */
const hasPaymentDestination = (payments: StorePayments, method: PaymentMethod): boolean => {
  switch (method) {
    case 'bankTransfer':
      return payments.bank.accountNumber.trim().length > 0;
    case 'mobileMoney':
      return payments.mobileMoney.some((wallet) => wallet.accountNumber.trim().length > 0);
    case 'payOnDelivery':
      return true;
    default:
      return false;
  }
};

/** A method is offered when its own switch is Active AND it has somewhere to
 *  send the money. Hidden and Inactive methods never reach the checkout list. */
export const isPaymentMethodAvailable = (
  payments: StorePayments,
  method: PaymentMethod,
): boolean =>
  paymentMethodStatus(payments, method) === 'active' && hasPaymentDestination(payments, method);

/** Methods shoppers can pick, in display order — every one set to Active. */
export const enabledPaymentMethods = (payments: StorePayments): PaymentMethod[] =>
  PAYMENT_METHOD_ORDER.filter((method) => isPaymentMethodAvailable(payments, method));

/** Wallets that can actually receive money (a number has been filled in). */
export const usableWallets = (payments: StorePayments) =>
  payments.mobileMoney.filter((wallet) => wallet.accountNumber.trim().length > 0);

/** "Stanbic Bank · 0200000077576" — where the money was (or will be) sent. */
export const paymentDestination = (payment: PaymentInfo): string => {
  if (payment.method === 'payOnDelivery') return 'Paid on delivery';
  const heading = payment.bankName || payment.network;
  return [heading, payment.accountNumber].filter(Boolean).join(' · ') || payment.accountName || '—';
};

/** One line for the admin list: the method plus whatever proof the shopper gave. */
export const paymentSummary = (payment: PaymentInfo): string => {
  const parts: string[] = [PAYMENT_METHOD_LABELS[payment.method] ?? payment.method];
  if (payment.accountNumber) parts.push(`to ${paymentDestination(payment)}`);
  if (payment.payerName) parts.push(`from ${payment.payerName}`);
  if (payment.payerNumber) parts.push(`payer no. ${payment.payerNumber}`);
  if (payment.transactionRef) parts.push(`ref ${payment.transactionRef}`);
  return parts.join(' · ');
};
