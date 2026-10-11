// Prepared write requests. Nothing here signs or sends; the wallet layer
// passes these to walletClient.writeContract. Fee fields respect Arc's
// 20 gwei maxFeePerGas floor.
import { erc20Abi, type Address, type PublicClient } from 'viem'
import { chipInAbi } from './abi'
import { MIN_MAX_FEE_PER_GAS, MIN_PRIORITY_FEE_PER_GAS, USDC_ADDRESS } from './chains'

export interface FeeOverrides {
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
}

function max(a: bigint, b: bigint): bigint {
  return a > b ? a : b
}

/** Estimate EIP-1559 fees from the RPC and clamp them to Arc's floor. */
export async function feeOverrides(client: PublicClient): Promise<FeeOverrides> {
  let est: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } | undefined
  try {
    est = await client.estimateFeesPerGas()
  } catch {
    est = undefined
  }
  return clampFees(est)
}

export function clampFees(est?: { maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint }): FeeOverrides {
  const maxFeePerGas = max(est?.maxFeePerGas ?? 0n, MIN_MAX_FEE_PER_GAS)
  const maxPriorityFeePerGas = max(est?.maxPriorityFeePerGas ?? 0n, MIN_PRIORITY_FEE_PER_GAS)
  return { maxFeePerGas, maxPriorityFeePerGas: maxPriorityFeePerGas > maxFeePerGas ? maxFeePerGas : maxPriorityFeePerGas }
}

/** Exact-amount approval of USDC to the Chip In contract. Never unlimited. */
export function prepareApprove(contract: Address, amount: bigint) {
  return { address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [contract, amount] } as const
}

export function prepareCreateBill(
  contract: Address,
  payee: Address,
  deadline: bigint,
  payers: readonly Address[],
  amounts: readonly bigint[],
) {
  return {
    address: contract,
    abi: chipInAbi,
    functionName: 'createBill',
    args: [payee, deadline, [...payers], [...amounts]],
  } as const
}

export function preparePay(contract: Address, billId: bigint, shareIndex: bigint) {
  return { address: contract, abi: chipInAbi, functionName: 'pay', args: [billId, shareIndex] } as const
}

export function prepareRelease(contract: Address, billId: bigint) {
  return { address: contract, abi: chipInAbi, functionName: 'release', args: [billId] } as const
}

export function prepareRefund(contract: Address, billId: bigint) {
  return { address: contract, abi: chipInAbi, functionName: 'refund', args: [billId] } as const
}
