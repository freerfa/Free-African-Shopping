import React from 'react';
import type { BankDetails, MobileMoneyWallet, PaymentSystemStatus } from '../../types';
import { useStore } from '../../contexts/StoreContext';
import {
  PAYMENT_METHOD_STATUS_BLURB,
  PAYMENT_SYSTEM_BLURB,
  PAYMENT_SYSTEM_LABELS,
} from '../../lib/payments';
import { PAYMENT_SYSTEM_STATUSES } from '../../storeConfig';
import { inputClass, labelClass } from '../ui';

/**
 * The three-position (Active / Hide / Inactive) switch. Used once for the whole
 * payment system and once per method, so each method can sit in a different
 * state at the same time.
 */
const StatusSwitch: React.FC<{
  label: string;
  value: PaymentSystemStatus;
  onChange: (status: PaymentSystemStatus) => void;
}> = ({ label, value, onChange }) => (
  <div
    role="radiogroup"
    aria-label={label}
    className="inline-flex rounded-md border border-gray-300 dark:border-dark-border overflow-hidden"
  >
    {PAYMENT_SYSTEM_STATUSES.map((option) => {
      const selected = value === option;
      return (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={selected}
          onClick={() => onChange(option)}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${
            selected
              ? 'bg-brand-gold-ink text-white dark:bg-brand-gold dark:text-dark-bg'
              : 'bg-white dark:bg-dark-card text-gray-600 dark:text-gray-300 hover:bg-brand-offwhite dark:hover:bg-dark-bg'
          }`}
        >
          {PAYMENT_SYSTEM_LABELS[option]}
        </button>
      );
    })}
  </div>
);

/** A method's heading: its name, its own switch, and what the position in use
 *  means for checkout. */
const MethodStatusRow: React.FC<{
  name: string;
  value: PaymentSystemStatus;
  onChange: (status: PaymentSystemStatus) => void;
}> = ({ name, value, onChange }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <p className="text-sm font-semibold text-brand-dark dark:text-dark-text">{name}</p>
      <StatusSwitch label={name} value={value} onChange={onChange} />
    </div>
    <p className="text-xs text-gray-500 dark:text-gray-400">{PAYMENT_METHOD_STATUS_BLURB[value]}</p>
  </div>
);

/**
 * Admin → Settings → Payments.
 *
 * Everything here is a MANUAL method: the store never charges a card, it shows
 * these details at checkout and an admin confirms the money afterwards under
 * Orders. Edits are local-first and pushed by the same debounced config sync the
 * rest of the settings form uses.
 */
const PaymentSettings: React.FC = () => {
  const { payments, updatePayments } = useStore();
  const bank = payments.bank;

  const setBank = (patch: Partial<BankDetails>) =>
    updatePayments({ bank: { ...bank, ...patch } });

  const setWallet = (index: number, patch: Partial<MobileMoneyWallet>) =>
    updatePayments({
      mobileMoney: payments.mobileMoney.map((wallet, i) =>
        i === index ? { ...wallet, ...patch } : wallet,
      ),
    });

  const addWallet = () =>
    updatePayments({
      mobileMoney: [
        ...payments.mobileMoney,
        {
          label: `Wallet ${payments.mobileMoney.length + 1}`,
          network: '',
          accountName: '',
          accountNumber: '',
        },
      ],
    });

  const removeWallet = (index: number) =>
    updatePayments({ mobileMoney: payments.mobileMoney.filter((_, i) => i !== index) });

  // "Active" is what checkout lists; Hide and Inactive both keep a method off it.
  const noActiveMethods =
    payments.bankTransferStatus !== 'active' &&
    payments.mobileMoneyStatus !== 'active' &&
    payments.payOnDeliveryStatus !== 'active';

  return (
    <div className="bg-white dark:bg-dark-card shadow rounded-lg p-6 space-y-6">
      <div>
        <h3 className="font-bold text-brand-dark dark:text-dark-text">Payments</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Shoppers pick one of these at checkout and are shown the details below. The money moves
          outside this site — you confirm each payment under <strong>Orders</strong>.
        </p>
      </div>

      {noActiveMethods && payments.status === 'active' && (
        <p className="text-xs text-red-600 dark:text-red-400">
          No method is set to Active, so checkout has nothing to offer. Set at least one to Active.
        </p>
      )}

      {/* ---- master switch: active / hide / inactive ---------------------- */}
      <div className="border-t dark:border-dark-border pt-5 space-y-3">
        <p className="text-sm font-semibold text-brand-dark dark:text-dark-text">Payment system</p>

        <StatusSwitch
          label="Payment system"
          value={payments.status}
          onChange={(status) => updatePayments({ status })}
        />

        <p className="text-xs text-gray-500 dark:text-gray-400">{PAYMENT_SYSTEM_BLURB[payments.status]}</p>

        {payments.status === 'hide' && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Orders now arrive without a payment method — settle them directly with the shopper.
          </p>
        )}
        {payments.status === 'inactive' && (
          <p className="text-xs text-red-600 dark:text-red-400">
            Checkout is closed: shoppers can browse, but no orders are accepted.
          </p>
        )}
        {payments.status !== 'active' && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            While the store-wide switch is not Active, the switches below don't change what
            shoppers see (an Inactive method is still refused).
          </p>
        )}
      </div>

      {/* ---- bank transfer ------------------------------------------------ */}
      <div className="border-t dark:border-dark-border pt-5 space-y-4">
        <MethodStatusRow
          name="Bank transfer"
          value={payments.bankTransferStatus}
          onChange={(status) => updatePayments({ bankTransferStatus: status })}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="pay-bank-name">Bank</label>
            <input
              id="pay-bank-name"
              type="text"
              value={bank.bankName}
              onChange={(e) => setBank({ bankName: e.target.value })}
              className={inputClass}
              placeholder="Stanbic Bank"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="pay-bank-account-name">Account name</label>
            <input
              id="pay-bank-account-name"
              type="text"
              value={bank.accountName}
              onChange={(e) => setBank({ accountName: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="pay-bank-account-no">Account number</label>
            <input
              id="pay-bank-account-no"
              type="text"
              inputMode="numeric"
              value={bank.accountNumber}
              onChange={(e) => setBank({ accountNumber: e.target.value.trim() })}
              className={`${inputClass} font-mono`}
              placeholder="0200000077576"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="pay-bank-branch">Branch (optional)</label>
            <input
              id="pay-bank-branch"
              type="text"
              value={bank.branch}
              onChange={(e) => setBank({ branch: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="pay-bank-instructions">
            Instructions shown at checkout
          </label>
          <textarea
            id="pay-bank-instructions"
            rows={2}
            value={bank.instructions}
            onChange={(e) => setBank({ instructions: e.target.value })}
            className={inputClass}
          />
        </div>

        {payments.bankTransferStatus === 'active' && !bank.accountNumber.trim() && (
          <p className="text-xs text-red-600 dark:text-red-400">
            Enter an account number — bank transfer stays hidden at checkout until you do.
          </p>
        )}
      </div>

      {/* ---- mobile money ------------------------------------------------- */}
      <div className="border-t dark:border-dark-border pt-5 space-y-4">
        <MethodStatusRow
          name="Mobile money"
          value={payments.mobileMoneyStatus}
          onChange={(status) => updatePayments({ mobileMoneyStatus: status })}
        />

        {payments.mobileMoney.length === 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            No wallet yet. Add one so shoppers know which number to send to.
          </p>
        )}

        {payments.mobileMoney.map((wallet, index) => (
          <div
            key={index}
            className="rounded-md border border-gray-200 dark:border-dark-border p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-brand-dark dark:text-dark-text">
                {wallet.label || `Wallet ${index + 1}`}
              </p>
              <button
                type="button"
                onClick={() => removeWallet(index)}
                className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors"
              >
                Remove
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor={`pay-momo-label-${index}`}>Label</label>
                <input
                  id={`pay-momo-label-${index}`}
                  type="text"
                  value={wallet.label}
                  onChange={(e) => setWallet(index, { label: e.target.value })}
                  className={inputClass}
                  placeholder="Store MoMo wallet"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor={`pay-momo-network-${index}`}>Network</label>
                <input
                  id={`pay-momo-network-${index}`}
                  type="text"
                  value={wallet.network}
                  onChange={(e) => setWallet(index, { network: e.target.value })}
                  className={inputClass}
                  placeholder="MTN"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor={`pay-momo-name-${index}`}>Account name</label>
                <input
                  id={`pay-momo-name-${index}`}
                  type="text"
                  value={wallet.accountName}
                  onChange={(e) => setWallet(index, { accountName: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor={`pay-momo-number-${index}`}>Wallet number</label>
                <input
                  id={`pay-momo-number-${index}`}
                  type="tel"
                  inputMode="tel"
                  value={wallet.accountNumber}
                  onChange={(e) => setWallet(index, { accountNumber: e.target.value.trim() })}
                  className={`${inputClass} font-mono`}
                  placeholder="0244 000 000"
                />
              </div>
            </div>

            {!wallet.accountNumber.trim() && (
              <p className="text-xs text-red-600 dark:text-red-400">
                This wallet is hidden at checkout until you add its number.
              </p>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={addWallet}
          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-300 dark:border-dark-border hover:border-brand-gold-ink hover:text-brand-gold-ink dark:hover:border-brand-gold dark:hover:text-brand-gold transition-colors"
        >
          Add wallet
        </button>
      </div>

      {/* ---- pay on delivery ---------------------------------------------- */}
      <div className="border-t dark:border-dark-border pt-5 space-y-3">
        <MethodStatusRow
          name="Pay on delivery"
          value={payments.payOnDeliveryStatus}
          onChange={(status) => updatePayments({ payOnDeliveryStatus: status })}
        />
        <div>
          <label className={labelClass} htmlFor="pay-pod-note">Note shown at checkout</label>
          <input
            id="pay-pod-note"
            type="text"
            value={payments.payOnDeliveryNote}
            onChange={(e) => updatePayments({ payOnDeliveryNote: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
};

export default PaymentSettings;
