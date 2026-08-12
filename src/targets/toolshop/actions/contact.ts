import { test, type Page } from '@playwright/test';
import { contactLocators } from '../locators/contact';
import { navigationLocators } from '../locators/navigation';

export interface ContactEnquiry {
  firstName?: string;
  lastName?: string;
  email?: string;
  subject: string;
  message: string;
}

/**
 * L2 — the contact form.
 *
 * Signed in, the application pre-fills and disables the name and email fields;
 * signed out it does not. `send` fills only what it was given, so one verb
 * serves both journeys and neither has to know which one it is in.
 */
export const contact = {
  async open(page: Page): Promise<void> {
    await test.step('Open the contact form', async () => {
      await page.goto('/contact');
      await contactLocators.message(page).waitFor();
    });
  },

  async send(page: Page, enquiry: ContactEnquiry): Promise<void> {
    await test.step(`Send a "${enquiry.subject}" enquiry`, async () => {
      if (enquiry.firstName) await contactLocators.firstName(page).fill(enquiry.firstName);
      if (enquiry.lastName) await contactLocators.lastName(page).fill(enquiry.lastName);
      if (enquiry.email) await contactLocators.email(page).fill(enquiry.email);
      await contactLocators.subject(page).selectOption({ label: enquiry.subject });
      await contactLocators.message(page).fill(enquiry.message);
      await contactLocators.submit(page).click();
    });
  },

  /** Submit with nothing filled in, to see what the form insists on. */
  async submitEmpty(page: Page): Promise<void> {
    await test.step('Send the enquiry with nothing filled in', async () => {
      await contactLocators.submit(page).click();
    });
  },

  /** The validation message under one field, or null when it is satisfied. */
  async fieldError(page: Page, field: string): Promise<string | null> {
    const error = contactLocators.fieldError(page, field);
    if (!(await error.isVisible())) return null;
    return (await error.textContent())?.trim() ?? null;
  },

  /** The confirmation the application announces after a successful send. */
  async readConfirmation(page: Page): Promise<string | null> {
    const toast = navigationLocators.toast(page);
    await toast.waitFor().catch(() => undefined);
    if (!(await toast.isVisible())) return null;
    return (await toast.textContent())?.trim() ?? null;
  },

  /** The subjects this deployment offers, as a customer sees them. */
  async readSubjects(page: Page): Promise<string[]> {
    const options = await contactLocators.subject(page).getByRole('option').allTextContents();
    return options.map((option) => option.trim()).filter((option) => !option.startsWith('Select'));
  },
};
