import type { Coupon } from '../types';

/**
 * Pure coupon logic shared by the checkout UI and the server.
 *
 * The client uses it to preview a discount as the shopper types; the server
 * uses the very same functions when it prices an order, so what the shopper
 * sees and what they are charged can never disagree. Nothing here touches the
 * network or the database — validation against the stored codes lives in
 * `server/index.ts`.
 */

/** Upper-cases and trims a shopper-typed code so `save10` matches `SAVE10`
 *  (codes are stored normalised, keeping the UNIQUE index honest). */
export const normalizeCouponCode = (raw: string): string => raw.trim().toUpperCase();

/** Why a coupon cannot be applied right now, or null when it can.
 *  `reason` doubles as the shopper-facing message. */
export interface CouponProblem {
  reason: 'inactive' | 'expired' | 'minimum';
  message: string;
}

/** Currency-agnostic minimum-subtotal wording; the caller adds the currency. */
export const couponProblem = (
  coupon: Coupon,
  subtotal: number,
  formatAmount: (value: number) => string,
  now: number = Date.now(),
): CouponProblem | null => {
  if (!coupon.active) {
    return { reason: 'inactive', message: 'That discount code is no longer active.' };
  }
  if (coupon.expiresAt !== null && now > coupon.expiresAt) {
    return { reason: 'expired', message: 'That discount code has expired.' };
  }
  if (subtotal < coupon.minSubtotal) {
    return {
      reason: 'minimum',
      message: `Spend at least ${formatAmount(coupon.minSubtotal)} to use this code.`,
    };
  }
  return null;
};

/** The discount a coupon takes off a subtotal, rounded to 2 decimals and
 *  clamped to [0, subtotal] — a 100% code never pays out more than the cart
 *  and a fixed code cannot turn an order into credit. */
export const couponDiscount = (coupon: Coupon, subtotal: number): number => {
  if (subtotal <= 0) return 0;
  const raw =
    coupon.kind === 'percent'
      ? (subtotal * Math.min(Math.max(coupon.value, 0), 100)) / 100
      : Math.max(coupon.value, 0);
  const rounded = Math.round(Math.min(raw, subtotal) * 100) / 100;
  return Math.max(0, rounded);
};
