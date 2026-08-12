import { expect, test } from '@playwright/test';
import { Project } from 'ts-morph';
import {
  firstDocLine,
  readFixtureInterfaces,
  readVocabulary,
} from '../../src/support/catalog/extract';

/**
 * The catalog is what stops helper-method hallucination (§07), so the
 * extraction that produces it is worth pinning down. A vocabulary shape this
 * misses is a whole surface the agent cannot see — and the failure is silent,
 * which is the worst kind for a generated file.
 */
function sourceFor(code: string) {
  return new Project({ useInMemoryFileSystem: true }).createSourceFile('vocab.ts', code);
}

test.describe('vocabulary extraction', () => {
  test('reads an exported object literal — the UI action shape', () => {
    const entries = readVocabulary(
      sourceFor(`
        export const checkout = {
          /** Open the cart from the header badge. */
          async openCart(page: string): Promise<void> {},
          /** Read the three figures on the overview step. */
          readTotals: async (page: string): Promise<number> => 0,
        };
      `),
    );

    expect(entries.map((entry) => entry.name)).toEqual(['checkout.openCart', 'checkout.readTotals']);
    expect(entries[0]!.doc).toBe('Open the cart from the header badge.');
    // A property assignment is not JSDocable in ts-morph; the doc must still
    // be found, from the leading trivia.
    expect(entries[1]!.doc).toBe('Read the three figures on the overview step.');
  });

  test('reads a factory that returns its vocabulary — the HTTP and DB shape', () => {
    // This is the shape a vocabulary takes when a client must be injected.
    // Missing it would hide every api/ and db/ verb from the agent.
    const entries = readVocabulary(
      sourceFor(`
        export function ordersApi(client: string) {
          return {
            /** Create an order and register it for cleanup. */
            async create(order: string): Promise<string> { return ''; },
            /** Read one order by id. */
            async get(id: string): Promise<string> { return ''; },
          };
        }
      `),
    );

    expect(entries.map((entry) => entry.name)).toEqual(['ordersApi.create', 'ordersApi.get']);
    expect(entries[0]!.doc).toBe('Create an order and register it for cleanup.');
  });

  test('ignores anything not exported, so internal helpers stay out of the vocabulary', () => {
    const entries = readVocabulary(
      sourceFor(`
        const internalHelper = { async hidden(): Promise<void> {} };
        function alsoHidden() { return { async nope(): Promise<void> {} }; }
        export const visible = { async shown(): Promise<void> {} };
      `),
    );

    expect(entries.map((entry) => entry.name)).toEqual(['visible.shown']);
  });

  test('captures the signature, so the agent sees what to pass', () => {
    const entries = readVocabulary(
      sourceFor(`
        export const inventory = {
          async addToCart(page: string, names: readonly string[], dryRun?: boolean): Promise<number> { return 0; },
        };
      `),
    );

    expect(entries[0]!.signature).toBe(
      '(page: string, names: readonly string[], dryRun?: boolean) => Promise<number>',
    );
  });
});

test.describe('fixture extraction', () => {
  test('lists the members of the matching interfaces only', () => {
    const entries = readFixtureInterfaces(
      sourceFor(`
        export interface FrameworkWorkerFixtures {
          /** The resolved target profile. */
          target: string;
        }
        export interface SomethingElse {
          ignored: string;
        }
      `),
      /^Framework(WorkerFixtures|TestFixtures|Options)$/,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'target', doc: 'The resolved target profile.' });
  });

  test('collapses a whole vocabulary object rather than dumping a truncated type', () => {
    const entries = readFixtureInterfaces(
      sourceFor(`
        export interface AppFixtures {
          /** The product listing. */
          inventory: { open(page: string): Promise<void>; addToCart(page: string): Promise<void> };
        }
      `),
      /Fixtures$/,
    );

    expect(entries[0]!.signature).toBe('named actions — see the table below');
  });
});

test.describe('doc extraction', () => {
  test('takes the first sentence', () => {
    expect(firstDocLine('Submit the sign-in form. Does not assert the outcome.')).toBe(
      'Submit the sign-in form.',
    );
  });

  test('does not end a sentence on an abbreviation', () => {
    expect(firstDocLine('The heading of the signed-in page, e.g. "Products".')).toBe(
      'The heading of the signed-in page, e.g. "Products".',
    );
  });

  test('drops JSDoc tags, which are not descriptions', () => {
    expect(firstDocLine('Lease an account.\n@throws PoolExhaustedError when none are free')).toBe(
      'Lease an account.',
    );
  });

  test('an undocumented member yields an empty string rather than throwing', () => {
    expect(firstDocLine(undefined)).toBe('');
  });
});
