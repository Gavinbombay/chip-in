// Deployment the page knows about. Filled in at deploy time; the page shows a
// "known contract" badge when a bill link points at one of these addresses and
// a warning when it does not. A null entry means no deployment on that chain.
import type { Address } from 'viem'
import { ARC_MAINNET_ID, ARC_TESTNET_ID, type ArcChainId } from './chains'

export const KNOWN_DEPLOYMENTS: Record<ArcChainId, Address | null> = {
  [ARC_MAINNET_ID]: null,
  [ARC_TESTNET_ID]: null,
}

/** Demo bills to show on the home page, per chain. Filled in after the demo transactions. */
export const DEMO_BILLS: Record<ArcChainId, { billId: bigint; label: string }[]> = {
  [ARC_MAINNET_ID]: [],
  [ARC_TESTNET_ID]: [],
}

/** Which chain the home page targets by default. */
export const DEFAULT_CHAIN_ID: ArcChainId = ARC_MAINNET_ID

/** Public repository shown in the footer. */
export const REPO_URL = 'https://github.com/⟦GITHUB_ACCOUNT⟧/chip-in'
