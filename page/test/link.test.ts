import { describe, expect, it } from 'vitest'
import { formatBillLink, parseBillLink } from '../src/link'

const C = '0x5FbDB2315678afecb367f032d93F642f64180aa3'

describe('parseBillLink', () => {
  it('parses a mainnet link and checksums the address', () => {
    const r = parseBillLink(`?chain=5042&c=${C.toLowerCase()}&bill=1`)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.link.chainId).toBe(5042)
      expect(r.link.contract).toBe(C)
      expect(r.link.billId).toBe(1n)
    }
  })
  it('parses a testnet link without the leading question mark', () => {
    const r = parseBillLink(`chain=5042002&c=${C}&bill=42`)
    expect(r.ok && r.link.chainId === 5042002 && r.link.billId === 42n).toBe(true)
  })
  it('reports empty when no bill parameters are present', () => {
    expect(parseBillLink('')).toEqual({ ok: false, reason: 'empty' })
    expect(parseBillLink('?utm=x')).toEqual({ ok: false, reason: 'empty' })
  })
  it('rejects unknown chains, bad addresses and bad bill ids', () => {
    expect(parseBillLink(`?chain=1&c=${C}&bill=1`)).toEqual({ ok: false, reason: 'chain' })
    expect(parseBillLink(`?c=${C}&bill=1`)).toEqual({ ok: false, reason: 'chain' })
    expect(parseBillLink(`?chain=5042&c=0x1234&bill=1`)).toEqual({ ok: false, reason: 'contract' })
    expect(parseBillLink(`?chain=5042&c=${C}&bill=0`)).toEqual({ ok: false, reason: 'bill' })
    expect(parseBillLink(`?chain=5042&c=${C}&bill=-1`)).toEqual({ ok: false, reason: 'bill' })
    expect(parseBillLink(`?chain=5042&c=${C}&bill=1.5`)).toEqual({ ok: false, reason: 'bill' })
    expect(parseBillLink(`?chain=5042&c=${C}`)).toEqual({ ok: false, reason: 'bill' })
  })
})

describe('formatBillLink', () => {
  it('produces the documented format and round-trips', () => {
    const url = formatBillLink('https://example.invalid/chip-in/', { chainId: 5042, contract: C, billId: 7n })
    expect(url).toBe(`https://example.invalid/chip-in/?chain=5042&c=${C}&bill=7`)
    const r = parseBillLink(new URL(url).search)
    expect(r.ok && r.link.billId === 7n && r.link.contract === C).toBe(true)
  })
})
