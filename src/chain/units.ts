/**
 * Satoshi ↔ BTC formatting.
 *
 * Amounts cross the API as integer satoshi *strings*. A JS number holds 53
 * bits of integer precision, which covers any realistic balance, but the moment
 * a consumer sums outputs in floating point the totals stop reconciling — and a
 * deposit relay whose totals do not reconcile is worse than no relay. The
 * decimal form is provided alongside for display only.
 */

export const SATS_PER_BTC = 100_000_000n;

/** Fixed 8-decimal representation of a satoshi amount, e.g. "1.23450000". */
export function formatBtc(satoshis: bigint): string {
  const negative = satoshis < 0n;
  const abs = negative ? -satoshis : satoshis;
  const whole = abs / SATS_PER_BTC;
  const frac = abs % SATS_PER_BTC;
  return `${negative ? "-" : ""}${whole}.${frac.toString().padStart(8, "0")}`;
}

/** Parses a satoshi amount previously serialised as a decimal string. */
export function parseSat(value: string): bigint {
  return BigInt(value);
}
