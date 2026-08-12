import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type { AxeRunner, RawAxeResult } from './scanner';

/**
 * The browser half: inject axe and run it.
 *
 * Kept to this one file so everything that decides *what* gets checked — the
 * standard-to-tag ladder, the waivers, the shaping of a result — stays pure
 * and testable without a browser. This part is thin enough to be reviewed by
 * eye, which is the trade for not being able to unit-test it.
 */
export const runAxe: AxeRunner = async (page: Page, tags, options): Promise<RawAxeResult> => {
  let builder = new AxeBuilder({ page }).withTags(tags);
  if (options.include) builder = builder.include(options.include);
  if (options.exclude) builder = builder.exclude(options.exclude);
  if (options.disableRules?.length) builder = builder.disableRules(options.disableRules);
  return (await builder.analyze()) as unknown as RawAxeResult;
};
