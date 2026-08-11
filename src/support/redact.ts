/**
 * Secret scrubbing for traces, logs, reports and attachments — §11, §22.
 *
 * The failure this exists to prevent: doing Vault properly and then base64-ing
 * an unscrubbed trace of a login flow into PractiTest. Every value the
 * `secrets` fixture resolves is registered here at fetch time, and everything
 * about to leave the process goes through `redact()` first.
 *
 * Registration is process-global on purpose. A worker fetches a credential
 * once and it can surface in a reporter, a triage payload or an attachment
 * written by entirely different code much later.
 */

export interface RegisteredSecret {
  label: string;
  /** Every serialisation of the value that could appear in an artifact. */
  variants: string[];
}

const registry = new Map<string, RegisteredSecret>();

/** Values below this length are too generic to redact without destroying text. */
const MIN_REDACTABLE_LENGTH = 4;

export const REDACTION_PLACEHOLDER = (label: string): string => `«redacted:${label}»`;

function variantsOf(value: string): string[] {
  const variants = new Set<string>([value]);
  variants.add(encodeURIComponent(value));
  variants.add(Buffer.from(value, 'utf8').toString('base64'));
  // JSON escaping — a password containing a quote or backslash appears
  // differently inside a serialised network payload than it does in a log line.
  const jsonEscaped = JSON.stringify(value).slice(1, -1);
  variants.add(jsonEscaped);
  return [...variants].filter((variant) => variant.length >= MIN_REDACTABLE_LENGTH);
}

/**
 * Register a secret value so it is scrubbed from any artifact.
 *
 * @param label what to show in its place — a description, never a hint at the
 * value. `«redacted:vault:qa/app/password»` is useful during triage;
 * `«redacted:sec...ce»` is a leak with extra steps.
 */
export function registerSecret(value: unknown, label: string): void {
  if (typeof value !== 'string' || value.length < MIN_REDACTABLE_LENGTH) return;
  registry.set(value, { label, variants: variantsOf(value) });
}

/** Register every string leaf of a secret payload, keyed by `label.field`. */
export function registerSecretPayload(payload: Record<string, unknown>, label: string): void {
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'string') registerSecret(value, `${label}.${key}`);
  }
}

/** Replace every registered secret in `text` with its placeholder. */
export function redact(text: string): string {
  let output = text;
  for (const { label, variants } of registry.values()) {
    for (const variant of variants) {
      if (output.includes(variant)) output = output.split(variant).join(REDACTION_PLACEHOLDER(label));
    }
  }
  return output;
}

/** Redact every string in a structure, preserving its shape. */
export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redact(value) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => redactDeep(item)) as unknown as T;
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = redactDeep(item);
    }
    return output as unknown as T;
  }
  return value;
}

/** Redact a Buffer's UTF-8 view. Used before an attachment is encoded. */
export function redactBuffer(buffer: Buffer): Buffer {
  return Buffer.from(redact(buffer.toString('utf8')), 'utf8');
}

/**
 * True when `text` still carries a registered secret. The leak test in §22
 * asserts this is false for every artifact about to be uploaded, using a
 * deliberately planted canary value.
 */
export function containsSecret(text: string): boolean {
  for (const { variants } of registry.values()) {
    if (variants.some((variant) => text.includes(variant))) return true;
  }
  return false;
}

export function registeredSecretCount(): number {
  return registry.size;
}

/** Test-only. Never call this from framework code — it disarms the scrubber. */
export function resetSecretRegistry(): void {
  registry.clear();
}
