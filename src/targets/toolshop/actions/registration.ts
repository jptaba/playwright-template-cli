import { test, type Page } from '@playwright/test';
import { registrationLocators } from '../locators/sign-in';

export interface NewCustomer {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  street: string;
  houseNumber: string;
  postcode: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  email: string;
  password: string;
}

/**
 * L2 — customer registration.
 *
 * Every field is required and each renders its own error, so `errors` returns
 * the whole map: a spec asserting "the form rejected the date of birth" should
 * not have to know the shape of the summary banner, and there isn't one.
 */
export const registration = {
  async open(page: Page): Promise<void> {
    await test.step('Open the registration form', async () => {
      await page.goto('/auth/register');
      await registrationLocators.form(page).waitFor();
    });
  },

  async register(page: Page, customer: NewCustomer): Promise<void> {
    await test.step(`Register ${customer.email}`, async () => {
      await registrationLocators.firstName(page).fill(customer.firstName);
      await registrationLocators.lastName(page).fill(customer.lastName);
      await registrationLocators.dateOfBirth(page).fill(customer.dateOfBirth);
      await registrationLocators.street(page).fill(customer.street);
      await registrationLocators.houseNumber(page).fill(customer.houseNumber);
      await registrationLocators.postcode(page).fill(customer.postcode);
      await registrationLocators.city(page).fill(customer.city);
      await registrationLocators.state(page).fill(customer.state);
      await registrationLocators.country(page).selectOption({ label: customer.country });
      await registrationLocators.phone(page).fill(customer.phone);
      await registrationLocators.email(page).fill(customer.email);
      await registrationLocators.password(page).fill(customer.password);
      await registrationLocators.submit(page).click();
    });
  },

  /** Submit an empty form, to see which fields the application insists on. */
  async submitEmpty(page: Page): Promise<void> {
    await test.step('Submit the registration with nothing filled in', async () => {
      await registrationLocators.submit(page).click();
    });
  },

  /** The validation message under one field, or null when it is satisfied. */
  async fieldError(page: Page, field: string): Promise<string | null> {
    const error = registrationLocators.fieldError(page, field);
    if (!(await error.isVisible())) return null;
    return (await error.textContent())?.trim() ?? null;
  },

  /** Every field currently reporting a problem, in document order. */
  async errors(page: Page): Promise<Record<string, string>> {
    return test.step('Read the form’s validation messages', async () => {
      const fields = [
        'first-name',
        'last-name',
        'dob',
        'street',
        'postal_code',
        'city',
        'state',
        'country',
        'phone',
        'email',
        'password',
      ];
      const found: Record<string, string> = {};
      for (const field of fields) {
        const message = await this.fieldError(page, field);
        if (message) found[field] = message;
      }
      return found;
    });
  },
};
