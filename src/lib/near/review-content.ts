/** Bounded exact-content encoding for unsigned reviews. Not contract Borsh, authority or truth. */
import { fail, object } from "./records.ts";

export function canonicalReviewContent(value: unknown): string {
  let bytes = 0;
  const charge = (text: string) => {
    bytes += new TextEncoder().encode(text).length;
    if (bytes > 1_048_576) return fail("ACTION_REVIEW_INPUT_LIMIT");
    return text;
  };
  function encode(v: unknown, depth: number): string {
    if (depth > 24) return fail("ACTION_REVIEW_DEPTH_LIMIT");
    if (Array.isArray(v)) {
      const keys = Object.keys(v);
      if (v.length > 4096 || keys.length !== v.length || keys.some((key, index) => key !== String(index))
        || Object.values(Object.getOwnPropertyDescriptors(v)).some(d => d.get || d.set)) return fail("INVALID_REVIEW_ARRAY");
      charge("[]" + ",".repeat(Math.max(0, v.length - 1)));
      return `[${v.map(item => encode(item, depth + 1)).join(",")}]`;
    }
    if (v !== null && typeof v === "object") {
      const entries = Object.entries(object(v)).sort(([a], [b]) => a.localeCompare(b));
      if (entries.length > 128) return fail("ACTION_REVIEW_FIELD_LIMIT");
      charge("{}" + ",".repeat(Math.max(0, entries.length - 1)));
      return `{${entries.map(([key, item]) => `${charge(JSON.stringify(key) + ":")}${encode(item, depth + 1)}`).join(",")}}`;
    }
    if (v !== null && typeof v !== "string" && typeof v !== "boolean"
      && !(typeof v === "number" && Number.isFinite(v))) return fail("NON_JSON_REVIEW_CONTENT");
    return charge(JSON.stringify(v));
  }
  return encode(value, 0);
}
export async function reviewContentHash(value: unknown) {
  const bytes = new TextEncoder().encode(canonicalReviewContent(value));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(v => v.toString(16).padStart(2, "0")).join("");
}
