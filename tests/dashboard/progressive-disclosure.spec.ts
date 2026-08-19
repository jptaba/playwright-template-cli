import { anApplication, expect, reopenSteps, test } from './harness';

/**
 * One step at a time, behind a panel that says what the whole thing needs.
 *
 * Every section used to render on first paint carrying `inert`. The gating was
 * honest — each one said what would unlock it — and what a first-time operator
 * met was still 3888px at 1280x720 before typing a character, 61% of it
 * sections nothing could touch. Measured on the running page, not estimated.
 *
 * So a step that cannot be reached is not on the page, and the overview panel
 * is what pays for that: reveal without a stated shape is a wizard whose end
 * nobody can see, which is worse than a long page. The two halves are tested
 * together here because neither is correct on its own.
 */

const shown = ['s2', 's3', 's4', 's5'] as const;

test('opens on one step, with the shape of the rest stated above it', async ({ dashboard }) => {
  const { page } = dashboard;

  await expect(page.locator('#pre')).toBeVisible();
  await expect(page.locator('#pre')).toContainText('a test deployment, never production');
  await expect(page.locator('#pre'), 'the overview says what is read for you').toContainText(
    'OpenAPI',
  );
  await expect(page.locator('#s1')).toBeVisible();

  for (const id of shown) {
    await expect(page.locator(`#${id}`), `${id} is on the page before it can be used`).toBeHidden();
  }
});

test('reading the application brings on the two steps it answers', async ({ dashboard }) => {
  const { page } = dashboard;
  await page.fill('#name', 'shop');
  await page.fill('#baseURL', 'https://staging.shop.test');
  await page.check('#confirmTest');
  await page.click('#probe');

  await expect(page.locator('#s2')).toBeVisible();
  await expect(page.locator('#s3')).toBeVisible();
  await expect(page.locator('#s4'), 'and no more than those two').toBeHidden();
  await expect(page.locator('#s5')).toBeHidden();

  await page.click('#preview');
  await expect(page.locator('#s4')).toBeVisible();
  await expect(page.locator('#s5')).toBeVisible();
});

test('skipping the read brings them on too — it is the same claim', async ({ dashboard }) => {
  const { page } = dashboard;
  await page.click('#skipProbe');
  await expect(page.locator('#s2')).toBeVisible();
  await expect(page.locator('#s3')).toBeVisible();
});

test('a reload puts back the steps the draft has already earned', async ({ dashboard }) => {
  /*
     The lesson from the item before this one. A draft restores step 2's
     readings into fields nobody could then reach; restoring the answers and
     hiding the section they are in is the same defect wearing the reveal.
  */
  const { page } = dashboard;
  await page.fill('#name', 'shop');
  await page.fill('#baseURL', 'https://staging.shop.test');
  await page.check('#confirmTest');
  await page.click('#probe');
  await expect.poll(() => dashboard.recorder.draft.fields.uName).toBe('Email address *');

  await dashboard.reopen();

  await expect(page.locator('#s2')).toBeVisible();
  await expect(page.locator('#s3')).toBeVisible();
  await expect(page.locator('#testId')).toHaveValue('data-test');
  await expect(page.locator('#s4'), 'the preview is not a state to restore').toBeHidden();
});

test('a step that is not on the page is not a link to it', async ({ dashboard }) => {
  /*
     Disabled both ways. Pointer-events alone leaves a rail entry reachable by
     keyboard and by nothing else, which is a control broken for exactly the
     people least able to tell that it is.
  */
  const { page } = dashboard;
  const locked = page.locator('#stepRail li[data-for="s4"] a');
  await expect(locked).toHaveAttribute('aria-disabled', 'true');
  await expect(locked).toHaveAttribute('tabindex', '-1');

  await page.fill('#name', 'shop');
  await page.fill('#baseURL', 'https://staging.shop.test');
  await page.check('#confirmTest');
  await page.click('#probe');
  // The probe has to have finished: the button below it is inside the section
  // the probe is what puts on the page.
  await expect(page.locator('#s3')).toBeVisible();
  await page.click('#preview');

  await expect(locked).not.toHaveAttribute('aria-disabled', 'true');
  await expect(locked).not.toHaveAttribute('tabindex', '-1');
});

test.describe('an application that is already onboarded', () => {
  test('shows its settings, and lets an edit reach them', async ({ dashboard }) => {
    /*
       Steps 2 and 3 hold everything a profile can be edited to — the test-id
       attribute, the roles, the secret source, the four layers. They stayed
       `inert` while "Change its settings" offered Save and un-disabled the
       inputs, so on the page as it was, none of those could be focused or
       changed and the only editable values were step 1's. Selecting an
       application is what puts them on the page; the edit is what makes them
       writable.
    */
    const { page } = dashboard;
    dashboard.recorder.applications = [anApplication({ name: 'shop-one' })];
    await dashboard.reopen();
    await page.selectOption('#pick', 'shop-one');

    await expect(page.locator('#s2')).toBeVisible();
    await expect(page.locator('#s3')).toBeVisible();
    await expect(page.locator('#testId'), 'read-only until asked for').toBeDisabled();
    await expect(page.locator('#s4'), 'this one is written; there is nothing to do to it').toBeHidden();
    await expect(page.locator('#s5')).toBeHidden();

    await page.click('#editApp');
    await page.fill('#testId', 'data-qa');
    await expect(page.locator('#testId')).toHaveValue('data-qa');
  });

  test('and choosing a new one puts them away again', async ({ dashboard }) => {
    const { page } = dashboard;
    dashboard.recorder.applications = [anApplication({ name: 'shop-one' })];
    await dashboard.reopen();
    await page.selectOption('#pick', 'shop-one');
    await expect(page.locator('#s2')).toBeVisible();

    await page.selectOption('#pick', '');

    await expect(page.locator('#s2'), 'a fresh start looks like a fresh start').toBeHidden();
    await expect(page.locator('#s3')).toBeHidden();
    await expect(page.locator('#s2 .badge')).toHaveText('Locked');
  });
});

/**
 * A step the page has an answer for folds to one line, and comes back.
 *
 * Revealing one step at a time fixed the *opening* of this page and left the
 * far end alone. Measured on the running wizard with all five steps reached:
 * 4090px at 1280x720, of which 2675px was steps already answered, and the step
 * somebody was actually on was 234px of it.
 *
 * The trigger is the preview and only the preview, which is the one moment the
 * page holds an answer for all three steps above it. Steps 4 and 5 are never
 * folded — they arrive together and step 4 is still an input, which is exactly
 * what the rail's own "done" state gets wrong.
 */
test.describe('folding a step the page has answered', () => {
  async function previewed(dashboard: Parameters<Parameters<typeof test>[2]>[0]['dashboard']) {
    const { page } = dashboard;
    await page.fill('#name', 'shop');
    await page.fill('#baseURL', 'https://staging.shop.test');
    await page.check('#confirmTest');
    await page.click('#probe');
    await expect(page.locator('#s3')).not.toHaveAttribute('inert', '');
    await page.click('#preview');
    await expect(page.locator('#s5')).not.toHaveAttribute('inert', '');
  }

  test('the preview folds the three steps above it, and not the two below', async ({
    dashboard,
  }) => {
    const { page } = dashboard;
    await previewed(dashboard);

    for (const id of ['s1', 's2', 's3']) {
      await expect(page.locator(`#${id}`), `${id} is folded once it is answered`).toHaveAttribute(
        'data-folded',
        'true',
      );
    }
    for (const id of ['s4', 's5']) {
      await expect(
        page.locator(`#${id}`),
        `${id} arrives with the preview and is still an input`,
      ).not.toHaveAttribute('data-folded', 'true');
    }
  });

  test('a folded step says what it holds, rather than only that it is done', async ({
    dashboard,
  }) => {
    // The line is what makes folding a way of checking rather than a way of
    // hiding: read off the fields themselves, so it cannot drift from them.
    const { page } = dashboard;
    await previewed(dashboard);

    await expect(page.locator('#s1 .fold-what')).toHaveText('shop · https://staging.shop.test');
    await expect(page.locator('#s2 .fold-what')).toContainText('data-test');
    await expect(page.locator('#s2 .fold-what'), 'the names the read found').toContainText(
      'Email address *',
    );
    await expect(page.locator('#s3 .fold-what')).toContainText('standard');
  });

  test('"Change this" puts it back with everything still in it', async ({ dashboard }) => {
    const { page } = dashboard;
    await previewed(dashboard);
    await expect(page.locator('#name')).toBeHidden();

    await page.click('#s1 .fold button');

    await expect(page.locator('#s1')).not.toHaveAttribute('data-folded', 'true');
    await expect(page.locator('#name'), 'the field is reachable again').toBeVisible();
    await expect(page.locator('#name'), 'and nothing was lost folding it').toHaveValue('shop');
  });

  test('the rail is a way back, so it unfolds what it points at', async ({ dashboard }) => {
    // Scrolling to a folded step lands on its summary line, which reads as a
    // link that did nothing to the person who asked to go back.
    const { page } = dashboard;
    await previewed(dashboard);

    await page.click('#stepRail li[data-for="s2"] a');

    await expect(page.locator('#s2')).not.toHaveAttribute('data-folded', 'true');
    await expect(page.locator('#testId')).toBeVisible();
  });

  test('a plan that goes stale unfolds what it was computed from', async ({ dashboard }) => {
    /*
       The same defect as the stale plan itself, one section up: a step folded
       on the strength of a preview that no longer describes the form is a
       summary claiming to be settled when it is not.
    */
    const { page } = dashboard;
    await previewed(dashboard);
    await reopenSteps(page);

    await page.check('#lA11y');

    for (const id of ['s1', 's2', 's3']) {
      await expect(page.locator(`#${id}`)).not.toHaveAttribute('data-folded', 'true');
    }
    await expect(page.locator('#plan')).toContainText('no longer what');
  });

  test('folding is most of the height of a finished wizard', async ({ dashboard }) => {
    /*
       The tripwire, in the unit the complaint was in. Unfolded, the end of
       this journey measured 5.68 screens on the running page with the step
       somebody was on at the bottom of it. This is not a design rule about
       what looks nice; it is the guard against the far end growing back.
    */
    const { page } = dashboard;
    await page.setViewportSize({ width: 1280, height: 720 });
    await previewed(dashboard);

    const folded = await page.evaluate(() => document.documentElement.scrollHeight);
    await reopenSteps(page);
    const open = await page.evaluate(() => document.documentElement.scrollHeight);

    /*
       Four screens, deliberately loose, in the spirit of the budgets in
       `page-height.spec.ts`: a tripwire for the far end growing back, not a
       number tight enough to be raised by the first person it inconveniences.
       Unfolded this journey measured 5.68 screens.
    */
    expect(folded, `the finished wizard is ${(folded / 720).toFixed(2)} screens`).toBeLessThan(
      720 * 4,
    );
    expect(open, 'and folding is what buys that, not a smaller page').toBeGreaterThan(folded);
  });
});
