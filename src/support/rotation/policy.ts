import crypto from 'node:crypto';

/**
 * Password generation against the application's real policy — §13.
 *
 * "Many enterprise applications enforce password history and minimum-age
 * rules, so the generator must produce values that satisfy the real policy and
 * rotation cannot run more often than the minimum age allows."
 *
 * A generator that produces a value the application rejects fails rotation
 * half-way, which is the state this whole design exists to avoid.
 */
export interface PasswordPolicy {
  minLength: number;
  maxLength?: number;
  requireUpper: boolean;
  requireLower: boolean;
  requireDigit: boolean;
  requireSymbol: boolean;
  /** Symbols the application actually accepts — this list differs wildly. */
  symbolSet: string;
  /** How many previous passwords the application refuses to reuse. */
  historyDepth: number;
  /** Rotation cannot run more often than this. */
  minAgeDays: number;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 16,
  maxLength: 64,
  requireUpper: true,
  requireLower: true,
  requireDigit: true,
  requireSymbol: true,
  symbolSet: '!@#$%^&*()-_=+[]{}',
  historyDepth: 12,
  minAgeDays: 1,
};

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGIT = '23456789';

export function generatePassword(
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
  randomInt: (max: number) => number = (max) => crypto.randomInt(max),
): string {
  const pools: string[] = [];
  if (policy.requireUpper) pools.push(UPPER);
  if (policy.requireLower) pools.push(LOWER);
  if (policy.requireDigit) pools.push(DIGIT);
  if (policy.requireSymbol) pools.push(policy.symbolSet);
  if (pools.length === 0) pools.push(`${UPPER}${LOWER}${DIGIT}`);

  const alphabet = pools.join('');
  const length = Math.max(policy.minLength, pools.length);

  // One character from each required class first, so the result cannot fail
  // the policy by chance, then fill from the union.
  const characters = pools.map((pool) => pool[randomInt(pool.length)]!);
  while (characters.length < length) characters.push(alphabet[randomInt(alphabet.length)]!);

  // Fisher-Yates, so the required characters are not always in the same slots.
  for (let i = characters.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [characters[i], characters[j]] = [characters[j]!, characters[i]!];
  }
  return characters.join('');
}

export interface PolicyViolation {
  rule: string;
  detail: string;
}

export function validatePassword(value: string, policy: PasswordPolicy): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  if (value.length < policy.minLength) {
    violations.push({ rule: 'minLength', detail: `needs ${policy.minLength}, got ${value.length}` });
  }
  if (policy.maxLength && value.length > policy.maxLength) {
    violations.push({ rule: 'maxLength', detail: `max ${policy.maxLength}, got ${value.length}` });
  }
  if (policy.requireUpper && !/[A-Z]/.test(value)) {
    violations.push({ rule: 'requireUpper', detail: 'no uppercase character' });
  }
  if (policy.requireLower && !/[a-z]/.test(value)) {
    violations.push({ rule: 'requireLower', detail: 'no lowercase character' });
  }
  if (policy.requireDigit && !/\d/.test(value)) {
    violations.push({ rule: 'requireDigit', detail: 'no digit' });
  }
  if (policy.requireSymbol) {
    const symbols = new Set(policy.symbolSet.split(''));
    if (![...value].some((character) => symbols.has(character))) {
      violations.push({ rule: 'requireSymbol', detail: `none of ${policy.symbolSet}` });
    }
  }
  return violations;
}
