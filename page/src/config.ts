// Deployment the page knows about. Filled in at deploy time; the page shows a
// "known contract" badge when a bill link points at one of these addresses and
// a warning when it does not. A null entry means no deployment on that chain.
import type { Address } from 'viem'
import { ARC_MAINNET_ID, ARC_TESTNET_ID, type ArcChainId } from './chains'

export const KNOWN_DEPLOYMENTS: Record<ArcChainId, Address | null> = {
  [ARC_MAINNET_ID]: '0x4bfa3A3D1da2b4906889105A15aD8d31b904Ae4f',
  [ARC_TESTNET_ID]: '0xa24184E58e30D9b97EC28084d27f9F1Cfe1E964B',
}

/** Demo bills to show on the home page, per chain. Filled in after the demo transactions. */
export const DEMO_BILLS: Record<ArcChainId, { billId: bigint; label: string }[]> = {
  [ARC_MAINNET_ID]: [{ billId: 1n, label: 'covered and released' }, { billId: 2n, label: 'short and refunded' }],
  [ARC_TESTNET_ID]: [{ billId: 1n, label: 'covered and released' }, { billId: 2n, label: 'short and refunded' }],
}

/** Which chain the home page targets by default. */
export const DEFAULT_CHAIN_ID: ArcChainId = ARC_MAINNET_ID

/** Public repository shown in the footer. */
export const REPO_URL = 'https://github.com/Gavinbombay/chip-in'
