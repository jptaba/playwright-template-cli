import { expect, test } from './harness';

/**
 * Light, dark, or follow the system — in a browser that has an origin.
 *
 * `tests/framework/` asserts the control is in the markup and that the restore
 * runs in the head, which is worth doing and proves nothing about whether a
 * choice survives. `localStorage` needs a real origin, and this harness serves
 * the page over a loopback socket, so a reload here is a reload.
 *
 * The state worth being careful about is **auto**, because it is the absence
 * of a choice rather than a third value of one: no stored key, no `data-theme`
 * attribute, and the media query in charge. Store "auto" as a word and the
 * guards in the stylesheet stop meaning what they say.
 */

const root = (page: Parameters<typeof choose>[0]) =>
  page.locator('html').getAttribute('data-theme');

async function choose(page: import('@playwright/test').Page, label: string): Promise<void> {
  await page.getByRole('group', { name: 'Colour theme' }).getByRole('button', { name: label }).click();
}

test('offers the three states, and starts on the one that follows the system', async ({
  dashboard,
}) => {
  const { page } = dashboard;
  const group = page.getByRole('group', { name: 'Colour theme' });

  await expect(group.getByRole('button')).toHaveText(['Light', 'Dark', 'Auto']);
  await expect(await root(page), 'auto is no attribute at all').toBe(null);
  await expect(group.getByRole('button', { name: 'Auto' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('a choice takes effect, and is still there after a reload', async ({ dashboard }) => {
  const { page } = dashboard;
  await choose(page, 'Dark');

  expect(await root(page)).toBe('dark');
  await expect(page.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'false');

  await dashboard.reopen();

  expect(await root(page), 'the head script puts it back').toBe('dark');
  await expect(page.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
});

test('going back to auto forgets it, rather than storing a third word', async ({ dashboard }) => {
  const { page } = dashboard;
  await choose(page, 'Dark');
  expect(await root(page)).toBe('dark');

  await choose(page, 'Auto');

  expect(await root(page)).toBe(null);
  expect(
    await page.evaluate(() => localStorage.getItem('theme')),
    'auto is stored by not being stored',
  ).toBe(null);

  await dashboard.reopen();
  expect(await root(page)).toBe(null);
});

test('an explicit light wins over a system that says dark', async ({ dashboard }) => {
  /*
     The direction that is easy to get wrong. The dark palette lives behind a
     media query, so without the :not([data-theme="light"]) guard the media
     query would keep applying to somebody who explicitly asked for light — and
     the button would look pressed while the page ignored it.
  */
  const { page } = dashboard;
  await page.emulateMedia({ colorScheme: 'dark' });
  await choose(page, 'Light');

  const ink = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({ colorScheme: 'light' });
  expect(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    'the same ground in both, because the choice is what decides',
  ).toBe(ink);
});

test('the page actually repaints, rather than only setting an attribute', async ({ dashboard }) => {
  const { page } = dashboard;
  await page.emulateMedia({ colorScheme: 'light' });
  const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await choose(page, 'Dark');

  const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(after, 'the attribute moved and nothing else did').not.toBe(before);
});
