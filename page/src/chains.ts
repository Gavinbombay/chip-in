// Chain definitions taken from the Arc developer docs (connect-to-arc page).
// Both are defined here on purpose: viem's built-in `arcTestnet` points at
// different hosts (rpc.testnet.arc.network, testnet.arcscan.app) than the Arc
// docs (rpc.testnet.arc.io, explorer.testnet.arc.io), so it is not used.
import { defineChain, type Chain } from 'viem'

export const ARC_MAINNET_ID = 5042 as const
export const ARC_TESTNET_ID = 5042002 as const
export type ArcChainId = typeof ARC_MAINNET_ID | typeof ARC_TESTNET_ID

/** Arc's ERC-20 interface for USDC. Same address on mainnet and testnet. 6 decimals. */
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const

/** Arc drops transactions whose maxFeePerGas is below 20 gwei. */
export const MIN_MAX_FEE_PER_GAS = 20_000_000_000n
/** A small tip the Arc docs suggest for inclusion during busy periods. */
export const MIN_PRIORITY_FEE_PER_GAS = 1_000_000_000n

export const arcMainnet = defineChain({
  id: ARC_MAINNET_ID,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11', blockCreated: 0 } },
})

export const arcTestnet = defineChain({
  id: ARC_TESTNET_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Testnet Explorer', url: 'https://explorer.testnet.arc.io' } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11', blockCreated: 0 } },
  testnet: true,
})

export const CHAINS: Record<ArcChainId, Chain> = {
  [ARC_MAINNET_ID]: arcMainnet,
  [ARC_TESTNET_ID]: arcTestnet,
}

export function isArcChainId(id: number): id is ArcChainId {
  return id === ARC_MAINNET_ID || id === ARC_TESTNET_ID
}

export function chainById(id: number): Chain | undefined {
  return isArcChainId(id) ? CHAINS[id] : undefined
}

export function explorerAddressUrl(chain: Chain, address: string): string {
  return `${chain.blockExplorers!.default.url}/address/${address}`
}

export function explorerTxUrl(chain: Chain, hash: string): string {
  return `${chain.blockExplorers!.default.url}/tx/${hash}`
}

/** Parameters for EIP-3085 wallet_addEthereumChain, built from the docs values above. */
export function addChainParams(chain: Chain) {
  return {
    chainId: `0x${chain.id.toString(16)}`,
    chainName: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: [...chain.rpcUrls.default.http],
    blockExplorerUrls: [chain.blockExplorers!.default.url],
  }
}
