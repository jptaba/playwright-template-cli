/** A product as the store displays it. */
export interface CatalogItem {
  name: string;
  price: number;
}

/** Delivery details required by checkout step one. */
export interface Customer {
  firstName: string;
  lastName: string;
  postalCode: string;
}

/** The three figures on the checkout overview. */
export interface OrderTotals {
  subtotal: number;
  tax: number;
  total: number;
}

/**
 * The reference target's catalogue is fixed and public, so it is stated here
 * rather than scraped. A `testData` builder that reads the application to
 * decide what to expect is not a test — it is the application agreeing with
 * itself (the same failure mode §09 keeps the case author away from).
 */
export const CATALOG: readonly CatalogItem[] = [
  { name: 'Sauce Labs Backpack', price: 29.99 },
  { name: 'Sauce Labs Bike Light', price: 9.99 },
  { name: 'Sauce Labs Bolt T-Shirt', price: 15.99 },
  { name: 'Sauce Labs Fleece Jacket', price: 49.99 },
  { name: 'Sauce Labs Onesie', price: 7.99 },
  { name: 'Test.allTheThings() T-Shirt (Red)', price: 15.99 },
];

/** The tax rate the store applies at checkout. */
export const TAX_RATE = 0.08;

export const SORT_OPTIONS = [
  'Name (A to Z)',
  'Name (Z to A)',
  'Price (low to high)',
  'Price (high to low)',
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number];
