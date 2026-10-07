import type {
  BankDetails,
  MobileMoneyWallet,
  PaymentSystemStatus,
  StoreConfig,
  StorePayments,
} from './types';

/** Every value the master switch (`payments.status`) and each method's own
 *  switch may hold — anything else falls back to the default so a hand-edited
 *  config can never lock the store out. */
export const PAYMENT_SYSTEM_STATUSES: readonly PaymentSystemStatus[] = [
  'active',
  'hide',
  'inactive',
];

/**
 * The identity of the store. Everything here is editable at runtime from
 * Admin -> Settings, so a single codebase can be re-skinned as any store
 * without touching a line of code.
 *
 * `adminEmail` / `adminPassword` are only the FIRST-RUN SEED for the server's
 * credentials (server/auth.ts stores a scrypt hash — the password itself never
 * reaches the browser). Override them with the ADMIN_EMAIL / ADMIN_PASSWORD
 * environment variables when starting the server.
 */
export const DEFAULT_BANK: BankDetails = {
  bankName: 'Stanbic Bank',
  accountName: 'Free Mirghani Elizara Cherewa',
  accountNumber: '0200000077576',
  branch: '',
  instructions: 'Use your order reference as the transfer narration so we can match your payment.',
};

export const DEFAULT_MOBILE_MONEY: MobileMoneyWallet[] = [
  { label: 'Store MoMo wallet', network: 'MTN', accountName: 'Free Mirghani Elizara Cherewa', accountNumber: '' },
];

export const DEFAULT_PAYMENTS: StorePayments = {
  status: 'active',
  bankTransferStatus: 'active',
  bank: DEFAULT_BANK,
  mobileMoneyStatus: 'active',
  mobileMoney: DEFAULT_MOBILE_MONEY,
  payOnDeliveryStatus: 'active',
  payOnDeliveryNote: 'Pay in cash or by mobile money when your order arrives.',
};

/**
 * Repairs stored settings: older builds (and hand-edited snapshots) have no
 * `payments` key at all, so merge every level instead of replacing wholesale.
 */
export const normalizePayments = (
  raw?: Partial<StorePayments> | null,
): StorePayments => {
  const stored = (raw ?? {}) as Partial<StorePayments> & {
    /** Builds from before the per-method switches stored a boolean each. */
    bankTransferEnabled?: unknown;
    mobileMoneyEnabled?: unknown;
    payOnDeliveryEnabled?: unknown;
  };
  const storedBank = (stored.bank ?? {}) as Partial<BankDetails>;
  // Only a MISSING value (or the wrong type) falls back to the default. An
  // empty string is a real choice, not a gap — otherwise the admin's inputs
  // would snap back to "Stanbic Bank" the moment they cleared the field to
  // retype it.
  const text = (value: unknown, fallback: string): string =>
    typeof value === 'string' ? value : fallback;
  /** A method's own switch. Prefer a real status; older builds stored a plain
   *  boolean (`true` → Active, `false` → Inactive); anything else → default. */
  const methodStatus = (
    value: unknown,
    legacyEnabled: unknown,
    fallback: PaymentSystemStatus,
  ): PaymentSystemStatus => {
    if (PAYMENT_SYSTEM_STATUSES.includes(value as PaymentSystemStatus)) {
      return value as PaymentSystemStatus;
    }
    if (typeof legacyEnabled === 'boolean') return legacyEnabled ? 'active' : 'inactive';
    return fallback;
  };
  return {
    // Unknown values (a hand-edited export, an old snapshot) fall back to the
    // default rather than silently closing or opening the store.
    status: PAYMENT_SYSTEM_STATUSES.includes(stored.status as PaymentSystemStatus)
      ? (stored.status as PaymentSystemStatus)
      : DEFAULT_PAYMENTS.status,
    bankTransferStatus: methodStatus(
      stored.bankTransferStatus,
      stored.bankTransferEnabled,
      DEFAULT_PAYMENTS.bankTransferStatus,
    ),
    bank: {
      bankName: text(storedBank.bankName, DEFAULT_PAYMENTS.bank.bankName),
      accountName: text(storedBank.accountName, DEFAULT_PAYMENTS.bank.accountName),
      accountNumber: text(storedBank.accountNumber, DEFAULT_PAYMENTS.bank.accountNumber),
      branch: text(storedBank.branch, ''),
      instructions: text(storedBank.instructions, DEFAULT_PAYMENTS.bank.instructions),
    },
    mobileMoneyStatus: methodStatus(
      stored.mobileMoneyStatus,
      stored.mobileMoneyEnabled,
      DEFAULT_PAYMENTS.mobileMoneyStatus,
    ),
    mobileMoney: Array.isArray(stored.mobileMoney)
      ? stored.mobileMoney
          .filter((w) => w && typeof w === 'object')
          .map((w, i) => {
            const wallet = w as Partial<MobileMoneyWallet>;
            return {
              label: text(wallet.label, `Wallet ${i + 1}`),
              network: text(wallet.network, ''),
              accountName: text(wallet.accountName, ''),
              accountNumber: text(wallet.accountNumber, ''),
            };
          })
      : DEFAULT_PAYMENTS.mobileMoney.map((w) => ({ ...w })),
    payOnDeliveryStatus: methodStatus(
      stored.payOnDeliveryStatus,
      stored.payOnDeliveryEnabled,
      DEFAULT_PAYMENTS.payOnDeliveryStatus,
    ),
    payOnDeliveryNote: text(stored.payOnDeliveryNote, DEFAULT_PAYMENTS.payOnDeliveryNote),
  };
};

export const DEFAULT_STORE_CONFIG: StoreConfig = {
  storeName: 'Free African Shopping',
  tagline: 'Handcrafted goods with a rich heritage',
  currency: '$',
  // Announcement marquee (top of every page), shown only when non-empty. It
  // repeats 8 times across the scrolling track, so keep it short and truthful:
  // the claim scrolls on every page and must match what checkout actually does.
  announcement: 'Delivery available everywhere in Juba, South Sudan.',
  colors: {
    gold: '#D4AF37',
    goldLight: '#EAD585',
    dark: '#1a1a1a',
    offwhite: '#F5F5F5',
  },
  contactEmail: 'freerfa3@gmail.com',
  contactPhone: '',
  contactAddress: '',
  adminEmail: 'freerfa3@gmail.com',
  adminPassword: 'Contact',
  payments: DEFAULT_PAYMENTS,
  categories: [
    'Apparel',
    'Jewelry',
    'Home Decor',
    'Art & Collectibles',
    'Bags & Baskets',
    'Services',
    'Jobs',
  ],
};

/**
 * Categories whose listings are not sold like physical goods.
 *
 * A Service (a tailoring slot, a repair, a lesson) or a Job (a role you are
 * hiring for) has no shelf price and no unit count: the price is agreed per
 * enquiry and the listing stays open indefinitely. The admin form therefore
 * leaves Price and Stock blank for these instead of demanding numbers, and the
 * storefront shows "Contact us" and never marks them sold out.
 *
 * Compared case-insensitively against the product's category so "services"
 * and "Services" both qualify.
 */
export const ENQUIRY_CATEGORIES: readonly string[] = ['Services', 'Jobs'];

/** True when this listing's category treats price and stock as optional. */
export const isEnquiryCategory = (category: string): boolean =>
  ENQUIRY_CATEGORIES.some(
    (name) => name.trim().toLowerCase() === category.trim().toLowerCase(),
  );

/** Tailwind colour slot -> CSS custom property, applied to <html>. */
export const COLOR_VAR_MAP: Record<keyof StoreConfig['colors'], string> = {
  gold: '--color-gold',
  goldLight: '--color-gold-light',
  dark: '--color-dark',
  offwhite: '--color-offwhite',
};

/**
 * The colour slots, in menu order. Derived from COLOR_VAR_MAP rather than
 * repeated, so a new entry in StoreConfig['colors'] shows up in the admin
 * pickers automatically and cannot drift out of sync with the variables.
 */
export const COLOR_KEYS = Object.keys(COLOR_VAR_MAP) as (keyof StoreConfig['colors'])[];