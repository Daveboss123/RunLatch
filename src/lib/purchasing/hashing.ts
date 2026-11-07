/** Independent typed Borsh encoder. Source binding, not signature/truth verification. */
import { calculateCommitment, integerAmount, type CommercialTerms } from "./commitment.ts";
export interface CanonicalQuoteInput {
  readonly quote_id: string; readonly provider_id: string; readonly recipient_id: string;
  readonly service_id: string; readonly category: string; readonly resource_key: string;
  readonly quantity: number; readonly price: string; readonly asset: "near-native"; readonly recurring: boolean;
  readonly expires_at_ns: string; readonly previous_quote_id: string | null;
  readonly commercial_terms: CommercialTerms | null;
}
export interface CanonicalQuoteTerms { readonly input: CanonicalQuoteInput; readonly publisher_id: string; readonly schema_version: 2 }
const text = new TextEncoder();
function integer(value: bigint, bytes: number): Uint8Array {
  if (value < 0n || value >= (1n << BigInt(bytes * 8))) throw new Error("ENCODING_INTEGER_LIMIT");
  const result = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) { result[i] = Number(value & 255n); value >>= 8n; }
  return result;
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; } return result;
}
function string(value: string): Uint8Array {
  if (typeof value !== "string" || text.encode(value).length > 128) throw new Error("ENCODING_STRING_LIMIT");
  const bytes = text.encode(value); return concat(integer(BigInt(bytes.length), 4), bytes);
}
function boolean(value: boolean): Uint8Array {
  if (typeof value !== "boolean") throw new Error("ENCODING_BOOLEAN_REQUIRED");
  return new Uint8Array([value ? 1 : 0]);
}
function termsBytes(terms: CommercialTerms): Uint8Array {
  const model = ["ONE_TIME", "FIXED_RECURRING", "UNKNOWN_EXPOSURE"].indexOf(terms.billing_model);
  const cadence = ["ONCE", "MONTHLY", "ANNUAL"].indexOf(terms.cadence);
  if (model < 0 || cadence < 0 || !Number.isSafeInteger(terms.required_periods)) throw new Error("INVALID_COMMERCIAL_ENCODING");
  return concat(new Uint8Array([model, cadence]), integer(integerAmount(terms.period_charge), 16), integer(BigInt(terms.required_periods), 4),
    integer(integerAmount(terms.mandatory_fees), 16), integer(integerAmount(terms.known_taxes), 16), integer(integerAmount(terms.setup_fees), 16),
    boolean(terms.auto_renew), string(terms.cancellation_terms_hash), string(terms.source_evidence_hash),
    boolean(terms.future_obligation_contingent_on_initial_payment));
}
export function commercialQuoteBytes(terms: CanonicalQuoteTerms, network: string, contract: string): Uint8Array {
  const q = terms.input;
  if (terms.schema_version !== 2 || q.asset !== "near-native" || !Number.isSafeInteger(q.quantity) || q.quantity < 1 || q.quantity > 50) throw new Error("UNSUPPORTED_QUOTE_ENCODING");
  calculateCommitment(q); // Reject structurally inconsistent amounts; unbounded terms remain encodable/deniable.
  if (typeof q.expires_at_ns !== "string" || !/^(0|[1-9][0-9]{0,19})$/u.test(q.expires_at_ns)) throw new Error("INVALID_QUOTE_TIME");
  return concat(string("runlatch.quote.v2"), string(network), string(contract),
    string(q.quote_id), string(q.provider_id), string(q.recipient_id), string(q.service_id), string(q.category), string(q.resource_key),
    integer(BigInt(q.quantity), 4), integer(integerAmount(q.price), 16), string(q.asset), boolean(q.recurring), integer(BigInt(q.expires_at_ns), 8),
    q.previous_quote_id === null ? new Uint8Array([0]) : concat(new Uint8Array([1]), string(q.previous_quote_id)),
    q.commercial_terms === null ? new Uint8Array([0]) : concat(new Uint8Array([1]), termsBytes(q.commercial_terms)),
    string(terms.publisher_id), new Uint8Array([2]));
}
export async function digestHex(bytes: Uint8Array): Promise<string> {
  const snapshot = new Uint8Array(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", snapshot));
  return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function commercialQuoteHash(terms: CanonicalQuoteTerms, network: string, contract: string): Promise<string> {
  return digestHex(commercialQuoteBytes(terms, network, contract));
}
export async function resourceFingerprint(project: string, q: CanonicalQuoteInput, network: string, contract: string): Promise<string> {
  return digestHex(concat(string("runlatch.resource.v2"), string(network), string(contract), string(project),
    string(q.provider_id), string(q.service_id), string(q.resource_key)));
}
