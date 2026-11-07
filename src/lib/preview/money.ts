import { integerAmount } from "../purchasing/commitment.ts";

export const YOCTO = 10n ** 24n;

/** Decimal user input to exact native NEAR units, never through Number. */
export function parseNear(value: string): string {
  if (!/^(0|[1-9][0-9]{0,14})(\.[0-9]{1,24})?$/u.test(value)) throw new Error("Enter a positive NEAR amount with up to 24 decimal places.");
  const [whole, fraction = ""] = value.split(".");
  return integerAmount((BigInt(whole) * YOCTO + BigInt(fraction.padEnd(24, "0"))).toString()).toString();
}

/** Exact decimal formatting; at least two decimals, no rounded authorization. */
export function formatNear(value: string): string {
  const amount = integerAmount(value);
  const fraction = (amount % YOCTO).toString().padStart(24, "0").replace(/0+$/u, "");
  return `${amount / YOCTO}.${fraction.padEnd(2, "0")}`;
}

/** Geometry only: bounded basis points obtained AFTER integer financial math. */
export function visualPercent(value: string, total: string): string {
  const denominator = integerAmount(total);
  const numerator = integerAmount(value);
  if (denominator === 0n || numerator > denominator) throw new Error("Invalid visualization partition");
  const basisPoints = numerator * 10_000n / denominator;
  return `${basisPoints / 100n}.${(basisPoints % 100n).toString().padStart(2, "0")}%`;
}
