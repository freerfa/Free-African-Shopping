import React, { useCallback, useEffect, useState } from 'react';
import type { Coupon, CouponKind } from '../../types';
import { api, ApiError } from '../../lib/api';
import { useStore } from '../../contexts/StoreContext';
import { formatPrice } from '../../lib/format';
import { inputClass, labelClass } from '../ui';

interface CouponPanelProps {
  onNotice: (ok: boolean, text: string) => void;
}

/** Epoch ms -> `<input type="date">` value (yyyy-mm-dd), or '' for "never". */
const toDateInput = (ms: number | null): string => {
  if (ms === null) return '';
  const d = new Date(ms);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

/** `<input type="date">` value -> end-of-that-day epoch ms, or null when blank. */
const fromDateInput = (value: string): number | null => {
  if (!value) return null;
  const ms = new Date(`${value}T23:59:59.999`).getTime();
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Admin → Coupons: create, edit, activate/park and delete discount codes.
 *
 * The panel only ever shows a shopper-facing preview of the discount (it reuses
 * the same maths as the server), but every write goes through the API — the
 * server is the authority on what a code is worth. Reached only with
 * `coupons.manage`; the server guards each route with the same right.
 */
const CouponPanel: React.FC<CouponPanelProps> = ({ onNotice }) => {
  const { config } = useStore();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // The blank id means "create a new one"; otherwise the row is being edited.
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<CouponKind>('percent');
  const [value, setValue] = useState('');
  const [minSubtotal, setMinSubtotal] = useState('');
  const [expires, setExpires] = useState('');
  const [active, setActive] = useState(true);

  const currency = config.currency;
  const previewAmount = (amount: number) => formatPrice(amount, currency);

  const load = useCallback(async () => {
    try {
      const result = await api.getCoupons();
      setCoupons(result.coupons);
    } catch (error) {
      onNotice(false, error instanceof ApiError ? error.message : 'Could not load the discount codes.');
    } finally {
      setLoading(false);
    }
  }, [onNotice]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditing(null);
    setCode('');
    setKind('percent');
    setValue('');
    setMinSubtotal('');
    setExpires('');
    setActive(true);
  };

  const startNew = () => {
    setEditing('new');
    setCode('');
    setKind('percent');
    setValue('');
    setMinSubtotal('');
    setExpires('');
    setActive(true);
  };

  const startEdit = (coupon: Coupon) => {
    setEditing(coupon.id);
    setCode(coupon.code);
    setKind(coupon.kind);
    setValue(String(coupon.value));
    setMinSubtotal(coupon.minSubtotal ? String(coupon.minSubtotal) : '');
    setExpires(toDateInput(coupon.expiresAt));
    setActive(coupon.active);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const numericValue = Number(value);
    if (!code.trim()) {
      onNotice(false, 'Give the discount code a code.');
      return;
    }
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      onNotice(false, 'Enter a discount value of 0 or more.');
      return;
    }
    if (kind === 'percent' && numericValue > 100) {
      onNotice(false, 'A percentage discount cannot exceed 100%.');
      return;
    }
    const fields = {
      code: code.trim(),
      kind,
      value: numericValue,
      minSubtotal: Number(minSubtotal) > 0 ? Number(minSubtotal) : 0,
      expiresAt: fromDateInput(expires),
      active,
    };
    setSaving(true);
    try {
      if (editing === 'new') {
        // `id` is ignored by the server on create (it mints its own), but the
        // client type requires one — a placeholder keeps the call typed.
        await api.createCoupon({ id: 'pending', ...fields });
        onNotice(true, `Created the code ${fields.code}.`);
      } else if (editing) {
        await api.updateCoupon(editing, fields);
        onNotice(true, `Saved ${fields.code}.`);
      }
      resetForm();
      await load();
    } catch (error) {
      onNotice(false, error instanceof ApiError ? error.message : 'Could not save that discount code.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (coupon: Coupon) => {
    try {
      await api.updateCoupon(coupon.id, { active: !coupon.active });
      onNotice(true, `${coupon.code} is now ${coupon.active ? 'paused' : 'active'}.`);
      await load();
    } catch (error) {
      onNotice(false, error instanceof ApiError ? error.message : 'Could not update that code.');
    }
  };

  const handleDelete = async (coupon: Coupon) => {
    if (!window.confirm(`Delete the discount code ${coupon.code}? This cannot be undone.`)) return;
    try {
      await api.deleteCoupon(coupon.id);
      onNotice(true, `Deleted ${coupon.code}.`);
      if (editing === coupon.id) resetForm();
      await load();
    } catch (error) {
      onNotice(false, error instanceof ApiError ? error.message : 'Could not delete that code.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white dark:bg-dark-card shadow rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-brand-dark dark:text-dark-text">Discount codes</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Shoppers apply these at checkout. Paused codes stay on file but stop working.
            </p>
          </div>
          {editing === null && (
            <button
              onClick={startNew}
              className="bg-brand-dark text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-gray-800 transition-colors"
            >
              + New code
            </button>
          )}
        </div>
      </div>

      {editing !== null && (
        <form onSubmit={handleSave} className="bg-white dark:bg-dark-card shadow rounded-lg p-6 space-y-4">
          <h3 className="font-bold text-brand-dark dark:text-dark-text">
            {editing === 'new' ? 'New discount code' : `Edit ${code}`}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="coupon-code">Code</label>
              <input
                id="coupon-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={inputClass}
                placeholder="SAVE10"
                autoComplete="off"
                required
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Stored in UPPERCASE.</p>
            </div>
            <div>
              <label className={labelClass} htmlFor="coupon-kind">Type</label>
              <select
                id="coupon-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as CouponKind)}
                className={inputClass}
              >
                <option value="percent">Percentage off</option>
                <option value="fixed">Fixed amount off</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="coupon-value">
                {kind === 'percent' ? 'Percent off (0–100)' : `Amount off (${currency})`}
              </label>
              <input
                id="coupon-value"
                type="number"
                min={0}
                max={kind === 'percent' ? 100 : undefined}
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className={inputClass}
                placeholder={kind === 'percent' ? '10' : '500'}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="coupon-min">
                Minimum spend ({currency}) <span className="font-normal">(optional)</span>
              </label>
              <input
                id="coupon-min"
                type="number"
                min={0}
                step="0.01"
                value={minSubtotal}
                onChange={(e) => setMinSubtotal(e.target.value)}
                className={inputClass}
                placeholder="0"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="coupon-expires">
                Expires on <span className="font-normal">(optional)</span>
              </label>
              <input
                id="coupon-expires"
                type="date"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 pb-2">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-gold-ink dark:text-brand-gold"
                />
                Active (uncheck to pause)
              </label>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-brand-dark text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save code'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-5 py-2.5 rounded-full text-sm font-semibold border border-gray-300 dark:border-dark-border hover:border-brand-gold-ink dark:hover:border-brand-gold transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-center text-gray-600 dark:text-gray-400 py-12">Loading discount codes…</p>
      ) : coupons.length === 0 ? (
        <p className="text-center text-gray-600 dark:text-gray-400 py-12">
          No discount codes yet. Create one to offer shoppers a promotion.
        </p>
      ) : (
        <ul className="space-y-3">
          {coupons.map((coupon) => (
            <li key={coupon.id} className="bg-white dark:bg-dark-card shadow rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-bold text-brand-dark dark:text-dark-text tracking-wider">{coupon.code}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {coupon.kind === 'percent'
                    ? `${coupon.value}% off`
                    : `${previewAmount(coupon.value)} off`}
                  {coupon.minSubtotal > 0 && ` on orders over ${previewAmount(coupon.minSubtotal)}`}
                  {coupon.expiresAt !== null && ` · expires ${new Date(coupon.expiresAt).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`text-xs font-bold px-2 py-1 rounded-full ${
                    coupon.active
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                      : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                  }`}
                >
                  {coupon.active ? 'Active' : 'Paused'}
                </span>
                <button onClick={() => handleToggle(coupon)} className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-300 dark:border-dark-border hover:border-brand-gold-ink dark:hover:border-brand-gold transition-colors">
                  {coupon.active ? 'Pause' : 'Activate'}
                </button>
                <button onClick={() => startEdit(coupon)} className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-300 dark:border-dark-border hover:border-brand-gold-ink dark:hover:border-brand-gold transition-colors">
                  Edit
                </button>
                <button onClick={() => handleDelete(coupon)} className="px-3 py-1.5 rounded-full text-xs font-semibold text-red-600 hover:text-red-700">
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default CouponPanel;

