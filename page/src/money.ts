// USDC amounts. Every amount that touches the contract is a bigint in
// 6-decimal units (the ERC-20 interface). The page never uses 18-decimal
// native units and never calls eth_getBalance.

export const USDC_DECIMALS = 6
export const ONE_USDC = 1_000_000n

/**
 * Parse user input like "12", "12.5", "0.000001" into 6-decimal units.
 * Throws on anything else: empty, negative, scientific notation, more than
 * six decimals, non-numeric characters.
 */
export function parseUsdc(input: string): bigint {
  const s = input.trim()
  const m = /^([0-9]+)(?:\.([0-9]{1,6}))?$/.exec(s)
  const wholeStr = m?.[1]
  if (!m || wholeStr === undefined) throw new Error('Enter an amount like 12.50 with at most six decimals')
  const fracStr = m[2]
  const whole = BigInt(wholeStr)
  const frac = fracStr ? BigInt(fracStr.padEnd(USDC_DECIMALS, '0')) : 0n
  return whole * ONE_USDC + frac
}

/**
 * Format 6-decimal units for display: at least two decimals, up to six,
 * trailing zeros beyond the second decimal removed. 12500000n -> "12.50",
 * 1n -> "0.000001", 25000000n -> "25.00".
 */
export function formatUsdc(amount: bigint): string {
  if (amount < 0n) throw new Error('negative amount')
  const whole = amount / ONE_USDC
  let frac = (amount % ONE_USDC).toString().padStart(USDC_DECIMALS, '0')
  while (frac.length > 2 && frac.endsWith('0')) frac = frac.slice(0, -1)
  return `${whole.toString()}.${frac}`
}

/**
 * Split a total into n equal shares in 6-decimal units. The remainder goes
 * to the first shares, so the shares always sum to the total and differ by
 * at most one unit. Mirrors the Solidity test helper `_splitEqual`.
 */
export function splitEqual(total: bigint, n: number): bigint[] {
  if (!Number.isInteger(n) || n < 1) throw new Error('n must be a positive integer')
  if (total < BigInt(n)) throw new Error('total is too small to give every share at least one unit')
  const base = total / BigInt(n)
  const rem = Number(total % BigInt(n))
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1n : 0n))
}

export function sum(amounts: readonly bigint[]): bigint {
  return amounts.reduce((a, b) => a + b, 0n)
}
