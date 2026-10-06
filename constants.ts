
import type { Product } from './types';

const img = (seed: string) => `https://picsum.photos/seed/${seed}/600/600`;

/**
 * Seed catalogue used the very first time the app runs. Because products now
 * persist to localStorage, this is only the starting point -- edit it any time
 * from the admin panel.
 */
export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'seed-kente-scarf',
    name: 'Kente Cloth Scarf',
    price: 45,
    compareAtPrice: null,
    description:
      'Vibrantly colored, handwoven Kente cloth scarf from Ghana, representing a rich cultural heritage.',
    images: [img('kente'), img('kente-2')],
    category: 'Apparel',
    sku: 'FAS-APP-001',
    stock: 24,
    variants: [],
    status: 'live',
    createdAt: 1700000000000,
    // Contact details are per-listing; these seeds use the store-wide ones.
    contactName: '',
    contactPhone: '',
    contactEmail: '',
  },
  {
    id: 'seed-maasai-necklace',
    name: 'Beaded Maasai Necklace',
    price: 75.5,
    compareAtPrice: 95,
    description:
      'Intricate, handmade Maasai beaded necklace, a stunning statement piece of wearable art from Kenya.',
    images: [img('maasai')],
    category: 'Jewelry',
    sku: 'FAS-JWL-001',
    stock: 12,
    variants: [],
    status: 'live',
    createdAt: 1700000001000,
    // Contact details are per-listing; these seeds use the store-wide ones.
    contactName: '',
    contactPhone: '',
    contactEmail: '',
  },
  {
    id: 'seed-mudcloth-blanket',
    name: 'Mudcloth Throw Blanket',
    price: 120,
    compareAtPrice: null,
    description:
      'Authentic Bogolanfini (mudcloth) from Mali, featuring symbolic patterns on hand-dyed cotton.',
    images: [img('mudcloth')],
    category: 'Home Decor',
    sku: 'FAS-HOM-001',
    stock: 8,
    variants: [],
    status: 'live',
    createdAt: 1700000002000,
    // Contact details are per-listing; these seeds use the store-wide ones.
    contactName: '',
    contactPhone: '',
    contactEmail: '',
  },
  {
    id: 'seed-ebony-figurine',
    name: 'Carved Ebony Figurine',
    price: 95,
    compareAtPrice: null,
    description:
      'A sleek, polished ebony wood figurine, skillfully carved by Makonde artisans in Tanzania.',
    images: [img('ebony')],
    category: 'Art & Collectibles',
    sku: 'FAS-ART-001',
    stock: 5,
    variants: [],
    status: 'live',
    createdAt: 1700000003000,
    // Contact details are per-listing; these seeds use the store-wide ones.
    contactName: '',
    contactPhone: '',
    contactEmail: '',
  },
  {
    id: 'seed-bolga-basket',
    name: 'Woven Bolga Basket',
    price: 60,
    compareAtPrice: null,
    description:
      'A durable and beautiful shopping basket, handwoven from elephant grass in Bolgatanga, Ghana.',
    images: [img('basket')],
    category: 'Bags & Baskets',
    sku: 'FAS-BAG-001',
    stock: 30,
    variants: [],
    status: 'live',
    createdAt: 1700000004000,
    // Contact details are per-listing; these seeds use the store-wide ones.
    contactName: '',
    contactPhone: '',
    contactEmail: '',
  },
  {
    id: 'seed-zulu-shield',
    name: 'Zulu Shield Replica',
    price: 150,
    compareAtPrice: 180,
    description:
      'A decorative replica of a traditional Zulu shield, crafted from cowhide and wood.',
    images: [img('zulu')],
    category: 'Home Decor',
    sku: 'FAS-HOM-002',
    stock: 4,
    variants: [],
    status: 'live',
    createdAt: 1700000005000,
    // Contact details are per-listing; these seeds use the store-wide ones.
    contactName: '',
    contactPhone: '',
    contactEmail: '',
  },
  {
    id: 'seed-adinkra-tee',
    name: 'Adinkra Print T-Shirt',
    price: 38,
    compareAtPrice: null,
    description:
      'Soft cotton tee screen-printed with a classic Ghanaian Adinkra symbol, cut in a relaxed unisex fit.',
    images: [img('adinkra')],
    category: 'Apparel',
    sku: 'FAS-APP-002',
    stock: 0,
    // Demonstrates variants: shoppers pick a size, each size has its own stock.
    variants: [
      { id: 'S', options: { Size: 'S' }, price: 38, stock: 14, sku: 'FAS-APP-002-S' },
      { id: 'M', options: { Size: 'M' }, price: 38, stock: 9, sku: 'FAS-APP-002-M' },
      { id: 'L', options: { Size: 'L' }, price: 38, stock: 0, sku: 'FAS-APP-002-L' },
      { id: 'XL', options: { Size: 'XL' }, price: 40, stock: 6, sku: 'FAS-APP-002-XL' },
    ],
    status: 'live',
    createdAt: 1700000006000,
    // Contact details are per-listing; these seeds use the store-wide ones.
    contactName: '',
    contactPhone: '',
    contactEmail: '',
  },
  {
    id: 'seed-shears',
    name: 'Ethiopian Coffee Serving Set',
    price: 64,
    compareAtPrice: null,
    description:
      'A hand-thrown ceramic jebena and serving cups, traditionally used to prepare and share Ethiopian coffee.',
    images: [img('jebena')],
    category: 'Home Decor',
    sku: 'FAS-HOM-003',
    stock: 0,
    variants: [],
    // Products can be hidden from the storefront without being deleted.
    status: 'draft',
    createdAt: 1700000007000,
    // Contact details are per-listing; these seeds use the store-wide ones.
    contactName: '',
    contactPhone: '',
    contactEmail: '',
  },
];