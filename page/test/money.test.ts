import { describe, expect, it } from 'vitest'
import { formatUsdc, parseUsdc, splitEqual, sum } from '../src/money'

describe('parseUsdc', () => {
  it('parses whole and fractional amounts into 6-decimal units', () => {
    expect(parseUsdc('12')).toBe(12_000_000n)
    expect(parseUsdc('12.5')).toBe(12_500_000n)
    expect(parseUsdc('0.000001')).toBe(1n)
    expect(parseUsdc(' 25.00 ')).toBe(25_000_000n)
    expect(parseUsdc('0')).toBe(0n)
  })
  it('rejects malformed input', () => {
    for (const bad of ['', '-1', '1e3', '1.2345678', '12,5', 'abc', '.5', '5.']) {
      expect(() => parseUsdc(bad), bad).toThrow()
    }
  })
})

describe('formatUsdc', () => {
  it('shows at least two decimals and trims beyond that', () => {
    expect(formatUsdc(12_500_000n)).toBe('12.50')
    expect(formatUsdc(25_000_000n)).toBe('25.00')
    expect(formatUsdc(1n)).toBe('0.000001')
    expect(formatUsdc(1_234_560n)).toBe('1.23456')
    expect(formatUsdc(0n)).toBe('0.00')
    expect(formatUsdc(1_000_000_000_000n)).toBe('1000000.00')
  })
  it('round-trips with parseUsdc', () => {
    for (const s of ['0.01', '7.00', '19.99', '0.000001', '24.999999']) {
      expect(formatUsdc(parseUsdc(s))).toBe(s)
    }
  })
})

describe('splitEqual', () => {
  it('gives the remainder to the first shares and sums exactly', () => {
    expect(splitEqual(10_000_000n, 3)).toEqual([3_333_334n, 3_333_333n, 3_333_333n])
    expect(splitEqual(750_000n, 2)).toEqual([375_000n, 375_000n])
    expect(splitEqual(5n, 3)).toEqual([2n, 2n, 1n])
    for (const [total, n] of [
      [25_000_000n, 32],
      [1_000_001n, 7],
      [999_999n, 13],
    ] as const) {
      const s = splitEqual(total, n)
      expect(s).toHaveLength(n)
      expect(sum(s)).toBe(total)
      const mx = s.reduce((a, b) => (a > b ? a : b))
      const mn = s.reduce((a, b) => (a < b ? a : b))
      expect(mx - mn <= 1n).toBe(true)
      expect(mn > 0n).toBe(true)
    }
  })
  it('rejects impossible splits', () => {
    expect(() => splitEqual(2n, 3)).toThrow()
    expect(() => splitEqual(10n, 0)).toThrow()
    expect(() => splitEqual(10n, 1.5)).toThrow()
  })
})
