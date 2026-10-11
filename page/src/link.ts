// Shareable bill links: ?chain=5042&c=<contract>&bill=<id>
// The page reads everything else from the chain.
import { getAddress, isAddress, type Address } from 'viem'
import { isArcChainId, type ArcChainId } from './chains'

export interface BillLink {
  chainId: ArcChainId
  contract: Address
  billId: bigint
}

export type ParsedLink =
  | { ok: true; link: BillLink }
  | { ok: false; reason: 'empty' | 'chain' | 'contract' | 'bill' }

/** Parse a query string (with or without the leading '?'). */
export function parseBillLink(search: string): ParsedLink {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const chain = q.get('chain')
  const c = q.get('c')
  const bill = q.get('bill')
  if (chain === null && c === null && bill === null) return { ok: false, reason: 'empty' }

  if (chain === null || !/^[0-9]{1,9}$/.test(chain) || !isArcChainId(Number(chain))) {
    return { ok: false, reason: 'chain' }
  }
  if (c === null || !isAddress(c, { strict: false })) return { ok: false, reason: 'contract' }
  if (bill === null || !/^[1-9][0-9]{0,30}$/.test(bill)) return { ok: false, reason: 'bill' }

  return {
    ok: true,
    link: { chainId: Number(chain) as ArcChainId, contract: getAddress(c), billId: BigInt(bill) },
  }
}

/** Build a link. `base` is the page URL without a query string. */
export function formatBillLink(base: string, link: BillLink): string {
  const q = new URLSearchParams({
    chain: String(link.chainId),
    c: getAddress(link.contract),
    bill: link.billId.toString(),
  })
  return `${base}?${q.toString()}`
}
