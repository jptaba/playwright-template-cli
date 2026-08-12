import type { EndpointDescriptor } from '../../../integrations/http/api-client';
import { authEndpoints } from '../endpoints/auth';
import { catalogEndpoints } from '../endpoints/catalog';
import { favoriteEndpoints, lookupEndpoints, messageEndpoints } from '../endpoints/engagement';
import {
  cartEndpoints,
  invoiceEndpoints,
  paymentEndpoints,
  reportEndpoints,
} from '../endpoints/orders';

/**
 * L2 — every endpoint this pack declares, flattened.
 *
 * It exists so the `contract` project can ask "does what we think the API is
 * agree with what the API says it is?" A spec may not import from `endpoints/`
 * — that is L1, and `layer-boundaries` forbids it — so the inventory is
 * exposed here, where a vocabulary is allowed to compose primitives.
 *
 * The check it enables is the one that catches the quietest mistake in the
 * whole pack: a descriptor whose path is *equivalent* to the document's but not
 * *identical* — `/users/{id}` where the document says `/users/{userId}` — is
 * never validated against any schema, because the registry looks the path up
 * by exact string. The endpoint keeps working, the contract check silently
 * stops happening, and the coverage view reports a number nobody has earned.
 */
export interface DeclaredEndpoint extends EndpointDescriptor {
  /** Which group of the pack declares it, for a readable failure message. */
  group: string;
}

function flatten(group: string, endpoints: Record<string, EndpointDescriptor>): DeclaredEndpoint[] {
  return Object.values(endpoints).map((endpoint) => ({ ...endpoint, group }));
}

export function endpointInventory(): DeclaredEndpoint[] {
  return [
    ...flatten('auth', authEndpoints),
    ...flatten('catalog', catalogEndpoints),
    ...flatten('cart', cartEndpoints),
    ...flatten('invoices', invoiceEndpoints),
    ...flatten('payment', paymentEndpoints),
    ...flatten('reports', reportEndpoints),
    ...flatten('messages', messageEndpoints),
    ...flatten('favorites', favoriteEndpoints),
    ...flatten('lookup', lookupEndpoints),
  ];
}
