// Injected (EIP-1193) wallets only. Discovery through EIP-6963 with a
// window.ethereum fallback. No hosted connector service, no project ID.
import { createWalletClient, custom, type Address, type Chain, type EIP1193Provider, type WalletClient } from 'viem'
import { addChainParams } from './chains'

export interface InjectedWallet {
  uuid: string
  name: string
  icon: string
  provider: EIP1193Provider
}

interface Eip6963Detail {
  info: { uuid: string; name: string; icon: string; rdns: string }
  provider: EIP1193Provider
}

/** Collect wallets announced via EIP-6963 within `waitMs`; fall back to window.ethereum. */
export function discoverWallets(waitMs = 300): Promise<InjectedWallet[]> {
  return new Promise((resolve) => {
    const found = new Map<string, InjectedWallet>()
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent<Eip6963Detail>).detail
      if (d?.info?.uuid && d.provider) {
        found.set(d.info.uuid, { uuid: d.info.uuid, name: d.info.name, icon: d.info.icon, provider: d.provider })
      }
    }
    window.addEventListener('eip6963:announceProvider', onAnnounce)
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce)
      if (found.size === 0) {
        const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum
        if (eth) found.set('window.ethereum', { uuid: 'window.ethereum', name: 'Browser wallet', icon: '', provider: eth })
      }
      resolve([...found.values()])
    }, waitMs)
  })
}

export async function requestAccounts(provider: EIP1193Provider): Promise<Address[]> {
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as Address[]
  return accounts
}

export async function currentChainId(provider: EIP1193Provider): Promise<number> {
  const hex = (await provider.request({ method: 'eth_chainId' })) as string
  return Number.parseInt(hex, 16)
}

/**
 * Switch the wallet to `chain`; if the wallet does not know it (error 4902),
 * add it with the Arc docs parameters and switch again. Throws if the user
 * rejects.
 */
export async function ensureChain(provider: EIP1193Provider, chain: Chain): Promise<void> {
  const chainId = `0x${chain.id.toString(16)}`
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
  } catch (err) {
    const code = (err as { code?: number })?.code
    if (code === 4902 || code === -32603) {
      await provider.request({ method: 'wallet_addEthereumChain', params: [addChainParams(chain)] })
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
    } else {
      throw err
    }
  }
}

export function walletClientFor(provider: EIP1193Provider, chain: Chain, account: Address): WalletClient {
  return createWalletClient({ account, chain, transport: custom(provider) })
}

/** Human message for the common wallet errors. */
export function describeWalletError(err: unknown): string {
  const e = err as { code?: number; shortMessage?: string; message?: string }
  if (e?.code === 4001) return 'You rejected the request in your wallet.'
  const m = e?.shortMessage ?? e?.message ?? ''
  if (/insufficient funds/i.test(m)) return 'Not enough USDC in this wallet to cover the amount plus gas.'
  if (/BillExpired/.test(m)) return 'This bill reached its deadline. Payments are closed.'
  if (/SharePaidAlready/.test(m)) return 'That share was just paid by someone else. Pick another share.'
  if (/BillNotOpen/.test(m)) return 'This bill is already covered.'
  if (/NotYourShare/.test(m)) return 'That share is assigned to a different address.'
  if (/NotRefundable/.test(m)) return 'Refunds open only after the deadline, and only if the bill is not covered.'
  if (/NothingToRefund/.test(m)) return 'This wallet has nothing to refund on this bill.'
  if (/NotFunded/.test(m)) return 'The bill is not fully covered yet.'
  if (/AlreadyReleased/.test(m)) return 'This bill was already released to the payee.'
  if (/Blocklisted|blocklist/i.test(m)) return 'The transfer was refused by the USDC blocklist.'
  return m ? `The wallet reported: ${m}` : 'Something went wrong. Nothing was sent.'
}
