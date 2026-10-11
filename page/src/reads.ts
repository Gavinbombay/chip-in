// Read-only chain access. All amounts are 6-decimal bigints.
import { erc20Abi, type Address, type PublicClient } from 'viem'
import { chipInAbi } from './abi'
import { USDC_ADDRESS } from './chains'

export type BillState = 'open' | 'funded' | 'released' | 'expired'
const STATES: readonly BillState[] = ['open', 'funded', 'released', 'expired']

export interface Bill {
  creator: Address
  payee: Address
  deadline: bigint // unix seconds
  total: bigint
  paid: bigint
  shareCount: bigint
  state: BillState
}

export interface Share {
  payer: Address // zero address = open share
  amount: bigint
  paid: boolean
}

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

export async function readBill(client: PublicClient, contract: Address, billId: bigint): Promise<Bill> {
  const v = await client.readContract({ address: contract, abi: chipInAbi, functionName: 'getBill', args: [billId] })
  return {
    creator: v.creator,
    payee: v.payee,
    deadline: v.deadline,
    total: v.total,
    paid: v.paid,
    shareCount: v.shareCount,
    state: STATES[v.state] ?? 'open',
  }
}

export async function readShares(client: PublicClient, contract: Address, billId: bigint): Promise<Share[]> {
  const s = await client.readContract({ address: contract, abi: chipInAbi, functionName: 'getShares', args: [billId] })
  return s.map((x) => ({ payer: x.payer, amount: x.amount, paid: x.paid }))
}

export async function readContributed(
  client: PublicClient,
  contract: Address,
  billId: bigint,
  account: Address,
): Promise<bigint> {
  return client.readContract({ address: contract, abi: chipInAbi, functionName: 'contributed', args: [billId, account] })
}

export async function readBillCount(client: PublicClient, contract: Address): Promise<bigint> {
  return client.readContract({ address: contract, abi: chipInAbi, functionName: 'billCount' })
}

export async function readCap(client: PublicClient, contract: Address): Promise<bigint> {
  return client.readContract({ address: contract, abi: chipInAbi, functionName: 'maxBillAmount' })
}

export async function readMaxDuration(client: PublicClient, contract: Address): Promise<bigint> {
  return client.readContract({ address: contract, abi: chipInAbi, functionName: 'maxBillDuration' })
}

/** USDC balance through the 6-decimal ERC-20 view. Never eth_getBalance. */
export async function readUsdcBalance(client: PublicClient, account: Address): Promise<bigint> {
  return client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [account] })
}

export async function readAllowance(client: PublicClient, owner: Address, spender: Address): Promise<bigint> {
  return client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [owner, spender] })
}

/** True when the address has contract code (used to tell "no such contract" from "bill not found"). */
export async function hasCode(client: PublicClient, address: Address): Promise<boolean> {
  const code = await client.getCode({ address })
  return code !== undefined && code !== '0x'
}

/** Index of the first unpaid open share, or -1. */
export function firstOpenShare(shares: readonly Share[]): number {
  return shares.findIndex((s) => !s.paid && s.payer === ZERO_ADDRESS)
}

/** Indexes of unpaid shares assigned to `account`. */
export function mySharesToPay(shares: readonly Share[], account: Address): number[] {
  const a = account.toLowerCase()
  return shares.flatMap((s, i) => (!s.paid && s.payer.toLowerCase() === a ? [i] : []))
}
