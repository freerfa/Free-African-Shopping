import React from 'react';
import type { Order, OrderStatus } from '../../types';
import { formatPrice } from '../../lib/format';
import { inputClass, labelClass } from '../ui';

const ORDER_STATUSES: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered'];

/** Editable slice of an order — the fields this form is allowed to change. */
export interface OrderEditValues {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  status: OrderStatus;
  paymentConfirmed: boolean;
  paymentNote: string;
}

export const toEditValues = (order: Order): OrderEditValues => ({
  customerName: order.customerName,
  customerEmail: order.customerEmail,
  customerPhone: order.customerPhone,
  shippingAddress: order.shippingAddress,
  status: order.status,
  paymentConfirmed: order.paymentConfirmed === true,
  paymentNote: order.paymentNote ?? '',
});

export const emptyEditValues = (): OrderEditValues => ({
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  shippingAddress: '',
  status: 'pending',
  paymentConfirmed: false,
  paymentNote: '',
});

interface OrderEditorProps {
  values: OrderEditValues;
  setValues: (values: OrderEditValues) => void;
  onSubmit: (patch: Partial<Order>) => void;
  onCancel: () => void;
  submitLabel: string;
  saving: boolean;
  /** Read-only summary shown beside the fields (which items, what total). */
  summary?: React.ReactNode;
}

/**
 * The edit form for one order in Admin → Database.
 *
 * Deliberately covers only the fields a human corrects — a mistyped phone
 * number, a wrong status, a payment ticked off. The items, the total and the
 * payment snapshot are set by checkout and shown as a read-only summary, so this
 * form can never be used to change what a customer was charged.
 */
const OrderEditor: React.FC<OrderEditorProps> = ({
  values, setValues, onSubmit, onCancel, submitLabel, saving, summary,
}) => {
  const set = <K extends keyof OrderEditValues>(key: K, value: OrderEditValues[K]) =>
    setValues({ ...values, [key]: value });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          customerName: values.customerName.trim(),
          customerEmail: values.customerEmail.trim(),
          customerPhone: values.customerPhone.trim(),
          shippingAddress: values.shippingAddress.trim(),
          status: values.status,
          paymentConfirmed: values.paymentConfirmed,
          paymentNote: values.paymentNote.trim(),
        });
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="oe-name">Customer name</label>
          <input
            id="oe-name" type="text" required value={values.customerName}
            onChange={(e) => set('customerName', e.target.value)} className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="oe-phone">Phone</label>
          <input
            id="oe-phone" type="text" value={values.customerPhone}
            onChange={(e) => set('customerPhone', e.target.value)} className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="oe-email">Email</label>
          <input
            id="oe-email" type="email" value={values.customerEmail}
            onChange={(e) => set('customerEmail', e.target.value)} className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="oe-status">Status</label>
          <select
            id="oe-status" value={values.status}
            onChange={(e) => set('status', e.target.value as OrderStatus)} className={inputClass}
          >
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="oe-address">Shipping address</label>
        <textarea
          id="oe-address" rows={2} value={values.shippingAddress}
          onChange={(e) => set('shippingAddress', e.target.value)} className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="oe-note">Payment note</label>
        <input
          id="oe-note" type="text" value={values.paymentNote}
          onChange={(e) => set('paymentNote', e.target.value)} className={inputClass}
          placeholder="e.g. transfer verified against the statement"
        />
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        <input
          type="checkbox" checked={values.paymentConfirmed}
          onChange={(e) => set('paymentConfirmed', e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-brand-gold-ink dark:border-dark-border dark:focus:ring-brand-gold focus:ring-brand-gold"
        />
        Payment received
      </label>

      {summary}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit" disabled={saving}
          className="bg-brand-dark text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
        <button
          type="button" onClick={onCancel} disabled={saving}
          className="px-4 py-2.5 rounded-full text-sm font-semibold border border-gray-300 dark:border-dark-border text-gray-600 dark:text-gray-300 hover:border-brand-gold-ink transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

/** The items and total of an order, shown as a read-only block. */
export const OrderLinesSummary: React.FC<{ order: Order; currency: string }> = ({
  order,
  currency,
}) => (
  <div className="rounded-md border border-gray-200 dark:border-dark-border p-3 bg-gray-50 dark:bg-dark-bg/40">
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
      Items (set by checkout — not editable here)
    </p>
    <ul className="space-y-1">
      {order.lines.map((line, index) => (
        <li key={`${line.name}-${index}`} className="text-sm dark:text-dark-text flex justify-between gap-3">
          <span className="min-w-0 truncate">
            {line.name}
            {line.variantLabel && <span className="text-gray-500"> · {line.variantLabel}</span>}
            <span className="text-gray-500"> × {line.quantity}</span>
          </span>
          <span className="shrink-0">{formatPrice(line.price * line.quantity, currency)}</span>
        </li>
      ))}
    </ul>
    <p className="text-sm font-bold mt-2 pt-2 border-t border-gray-200 dark:border-dark-border dark:text-dark-text">
      Total: {formatPrice(order.total, currency)}
    </p>
  </div>
);

export default OrderEditor;

