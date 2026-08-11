import type { Locator, Page } from '@playwright/test';

/** L1 — the persistent header and burger menu. */
export const navLocators = {
  cartLink: (page: Page): Locator => page.getByTestId('shopping-cart-link'),
  cartBadge: (page: Page): Locator => page.getByTestId('shopping-cart-badge'),
  openMenu: (page: Page): Locator => page.getByRole('button', { name: 'Open Menu' }),
  closeMenu: (page: Page): Locator => page.getByRole('button', { name: 'Close Menu' }),
  logout: (page: Page): Locator => page.getByTestId('logout-sidebar-link'),
  resetAppState: (page: Page): Locator => page.getByTestId('reset-sidebar-link'),
  pageTitle: (page: Page): Locator => page.getByTestId('title'),
};
