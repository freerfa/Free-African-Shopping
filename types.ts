export type Theme = 'light' | 'dark';

export type ProductStatus = 'live' | 'draft';

export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered';

export interface ProductVariant {
  id: string;
  /** Option selections, e.g. { Size: 'M', Color: 'Red' } */
  options: Record<string, string>;
  price: number;
  stock: number;
  sku: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  /** Null when the listing has no fixed price — a Service or a Job, which are
   *  agreed per enquiry. Rendered as "Contact us" and charged at 0 on an order. */
  price: number | null;
  /** Original price, rendered struck through. Null when not on sale. */
  compareAtPrice: number | null;
  images: string[];
  category: string;
  sku: string;
  /** Null when stock is not tracked (Services and Jobs): the listing is never
   *  sold out, never caps the quantity stepper and is not decremented by an
   *  order. Distinct from 0, which really does mean "sold out". */
  stock: number | null;
  /** Empty when the product has no options. */
  variants: ProductVariant[];
  status: ProductStatus;
  createdAt: number;
  /** Who to ask about a Service or a Job, shown by its "Contact us" panel.
   *  Empty for ordinary products, where the store-wide contact details are
   *  used instead. Optional on purpose: a listing may fall back to the store's
   *  own email/phone rather than repeating them per listing. */
  contactName: string;
  contactPhone: string;
  contactEmail: string;
}

export interface CartItem {
  /** Unique per product+variant pair. */
  key: string;
  productId: string;
  variantId: string | null;
  quantity: number;
}

/** A cart line joined with its live product data. */
export interface DetailedCartItem extends CartItem {
  product: Product;
  variant: ProductVariant | null;
  /** Null for a price-on-enquiry listing; `lineTotal` is then 0. */
  unitPrice: number | null;
  lineTotal: number;
  /** Units the shopper may still add. `null` means stock is not tracked for
   *  this listing, so the quantity is effectively unlimited. */
  available: number | null;
}

export interface OrderLine {
  name: string;
  variantLabel: string | null;
  price: number;
  quantity: number;
}

/** How the shopper chose to pay. Manual methods are confirmed by the admin
 *  after the fact — the server never touches real money. */
export type PaymentMethod = 'bankTransfer' | 'mobileMoney' | 'payOnDelivery';

/** Master switch for the whole payment system (Admin → Settings → Payments).
 *
 *  - `active`   — normal: checkout shows the methods and requires one.
 *  - `hide`     — checkout hides the payment section; the order still goes
 *                 through without a payment method and you settle up directly.
 *  - `inactive` — no orders are accepted at all (checkout is closed). */
export type PaymentSystemStatus = 'active' | 'hide' | 'inactive';

/** Details the shopper records at checkout, echoed back on the order.
 *
 *  `accountName` / `accountNumber` / `network` are a SNAPSHOT of the store's own
 *  receiving account taken from the config at order time, so an old order still
 *  shows exactly which account it was told to pay into even after the admin
 *  edits the store's bank details. */
export interface PaymentInfo {
  method: PaymentMethod;
  /** Bank the shopper was asked to transfer into (destination snapshot). */
  bankName?: string;
  /** Where the money was sent: the store's bank account name or wallet name. */
  accountName?: string;
  /** Where the money was sent: bank account number or MoMo wallet number. */
  accountNumber?: string;
  /** Mobile-money network of the receiving wallet (MTN, Airtel, …). */
  network?: string;
  /** Shopper's own name as it appears on the transfer, when they gave it. */
  payerName?: string;
  /** Shopper's own wallet/account the money left from, when they gave it. */
  payerNumber?: string;
  /** Shopper-supplied proof: transfer or MoMo transaction reference/ID. */
  transactionRef?: string;
}

export interface Order {
  id: string;
  reference: string;
  createdAt: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  lines: OrderLine[];
  total: number;
  status: OrderStatus;
  /** How the shopper paid (or will pay). Absent on pre-payment orders. */
  payment?: PaymentInfo;
  /** Set by the admin once the money actually arrived (see Admin → Orders). */
  paymentConfirmed?: boolean;
  /** Admin note, e.g. "Stanbic transfer verified against the statement". */
  paymentNote?: string;
}

/**
 * A single administrative right. Staff accounts hold a set of these; the owner
 * (the seeded admin) always holds all of them.
 *
 * Kept as one flat, closed union rather than a tree so adding a right is a
 * deliberate two-line change here plus a guard on the route — an unlisted
 * string can never arrive from the client and be honoured.
 */
export type Permission =
  /** See the products list, including drafts. */
  | 'products.view'
  /** Create, edit, publish/unpublish and delete products. */
  | 'products.manage'
  /** See the orders list and its customer details. */
  | 'orders.view'
  /** Move an order along its status and tick off a manual payment. */
  | 'orders.manage'
  /** Record an order taken outside the site, and edit/delete existing ones. */
  | 'orders.editRecords'
  /** Edit store details, colours, categories and contact information. */
  | 'settings.manage'
  /** Edit payment methods, the bank account and mobile-money wallets. */
  | 'payments.manage'
  /** Browse the raw database records table. */
  | 'database.view'
  /** Run database file tools: integrity check, optimize, backup, purge orders. */
  | 'database.manage'
  /** Export the store and import a snapshot over it. */
  | 'data.import'
  /** Wipe the store back to its defaults. */
  | 'data.reset'
  /** Add, edit and remove staff accounts, and change their rights. */
  | 'staff.manage';

/** Every right, in the order the admin panel lists them. */
export const ALL_PERMISSIONS: readonly Permission[] = [
  'products.view',
  'products.manage',
  'orders.view',
  'orders.manage',
  'orders.editRecords',
  'settings.manage',
  'payments.manage',
  'database.view',
  'database.manage',
  'data.import',
  'data.reset',
  'staff.manage',
];

/** Plain-English description of each right, shown beside its checkbox. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  'products.view': 'View products, including unpublished drafts',
  'products.manage': 'Add, edit, publish and delete products',
  'orders.view': 'View orders and customer details',
  'orders.manage': 'Change order status and confirm payments',
  'orders.editRecords': 'Record offline orders, and edit or delete order records',
  'settings.manage': 'Change store details, colours, categories and contact info',
  'payments.manage': 'Change payment methods, bank account and mobile money',
  'database.view': 'Browse the raw database records',
  'database.manage': 'Run database tools (check, optimize, backup, purge orders)',
  'data.import': 'Export the store and import a snapshot',
  'data.reset': 'Reset the store back to its defaults',
  'staff.manage': 'Add and remove staff, and change their rights',
};

/** Ready-made bundles an admin can apply with one click. */
export interface RolePreset {
  id: string;
  label: string;
  description: string;
  permissions: Permission[];
}

export const ROLE_PRESETS: readonly RolePreset[] = [
  {
    id: 'full',
    label: 'Full access',
    description: 'Everything an owner can do except managing staff and resetting the store.',
    permissions: ALL_PERMISSIONS.filter(
      (p) => p !== 'staff.manage' && p !== 'data.reset',
    ),
  },
  {
    id: 'orders',
    label: 'Orders only',
    description: 'Handles orders and payments without touching the catalogue or settings.',
    permissions: ['orders.view', 'orders.manage'],
  },
  {
    id: 'catalogue',
    label: 'Catalogue manager',
    description: 'Runs the product list, including drafts, without seeing orders.',
    permissions: ['products.view', 'products.manage'],
  },
  {
    id: 'stock',
    label: 'Stock clerk',
    description: 'Sees products and orders, updates statuses, cannot delete anything.',
    permissions: ['products.view', 'orders.view', 'orders.manage'],
  },
  {
    id: 'readonly',
    label: 'View only',
    description: 'Can look at products and orders but change nothing.',
    permissions: ['products.view', 'orders.view'],
  },
];

/** A staff account created by the owner, with its own rights. */
export interface StaffMember {
  email: string;
  permissions: Permission[];
  createdAt: number;
  /** Set when the admin changed the password since it was first created. */
  hasPassword: boolean;
}

/** The signed-in user, with whatever rights they hold. */
export interface User {
  email: string;
  isAdmin: boolean;
  /** True only for the seeded owner account, which holds every right and
   *  cannot be removed or demoted. */
  isOwner?: boolean;
  /** Rights this account holds. The owner always holds all of them. */
  permissions?: Permission[];
  /** Every right this account *could* hold — lets the UI grey out choices the
   *  signed-in admin is not allowed to grant. */
  grantablePermissions?: Permission[];
}

export enum View {
  Home,
  Product,
  Cart,
  Checkout,
  Admin,
  Login,
}

export interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

export interface StoreColors {
  gold: string;
  goldLight: string;
  dark: string;
  offwhite: string;
}

export interface StoreConfig {
  storeName: string;
  tagline: string;
  currency: string;
  announcement: string;
  colors: StoreColors;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
  adminEmail: string;
  adminPassword: string;
  categories: string[];
  /** Manual payment details shown at checkout (Admin → Settings → Payments).
   *  Missing on snapshots written by older builds — treat every field as
   *  optional and fall back to DEFAULT_PAYMENTS. */
  payments?: StorePayments;
}

/** Bank account the store accepts transfers into (Stanbic by default). */
export interface BankDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch: string;
  instructions: string;
}

/** One mobile-money wallet the store accepts payment to. */
export interface MobileMoneyWallet {
  label: string;
  network: string;
  accountName: string;
  accountNumber: string;
}

/** Everything Admin → Settings → Payments edits. */
export interface StorePayments {
  /** Master switch: is the payment system running, hidden or off (see
   *  `PaymentSystemStatus`). Individual methods below only matter when this
   *  is `active`. */
  status: PaymentSystemStatus;
  /** Each method carries its OWN switch, so they can sit in different states
   *  at the same time (applied only while the master `status` is `active`):
   *  `active` — shown at checkout; `hide` — off the list but a checkout already
   *  open may still complete; `inactive` — off and rejected by the API. */
  bankTransferStatus: PaymentSystemStatus;
  bank: BankDetails;
  mobileMoneyStatus: PaymentSystemStatus;
  mobileMoney: MobileMoneyWallet[];
  payOnDeliveryStatus: PaymentSystemStatus;
  payOnDeliveryNote: string;
}

/** The shape written to and read from a `.json` export file. */
export interface StoreSnapshot {
  version: 1;
  exportedAt: string;
  config: StoreConfig;
  products: Product[];
  orders: Order[];
}