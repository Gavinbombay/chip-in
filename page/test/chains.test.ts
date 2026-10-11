import { arc, arcTestnet as viemArcTestnet } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { addChainParams, arcMainnet, arcTestnet, chainById, isArcChainId, USDC_ADDRESS } from '../src/chains'
import { clampFees } from '../src/writes'

describe('chain definitions follow the Arc docs', () => {
  it('mainnet matches viem built-in id and primary RPC and explorer', () => {
    expect(arcMainnet.id).toBe(5042)
    expect(arc.id).toBe(5042)
    expect(arcMainnet.rpcUrls.default.http[0]).toBe('https://rpc.mainnet.arc.io')
    expect(arc.rpcUrls.default.http[0]).toBe('https://rpc.mainnet.arc.io')
    expect(arcMainnet.blockExplorers?.default.url).toBe('https://explorer.arc.io')
    expect(arc.blockExplorers?.default.url).toBe('https://explorer.arc.io')
    expect(arcMainnet.nativeCurrency).toEqual({ name: 'USDC', symbol: 'USDC', decimals: 18 })
  })
  it('testnet uses the docs hosts, which differ from viem built-in', () => {
    expect(arcTestnet.id).toBe(5042002)
    expect(arcTestnet.rpcUrls.default.http[0]).toBe('https://rpc.testnet.arc.io')
    expect(arcTestnet.blockExplorers?.default.url).toBe('https://explorer.testnet.arc.io')
    expect(viemArcTestnet.rpcUrls.default.http[0]).not.toBe('https://rpc.testnet.arc.io')
  })
  it('exposes the USDC interface address and helpers', () => {
    expect(USDC_ADDRESS).toBe('0x3600000000000000000000000000000000000000')
    expect(isArcChainId(5042) && isArcChainId(5042002) && !isArcChainId(1)).toBe(true)
    expect(chainById(5042)?.name).toBe('Arc')
    expect(chainById(31337)).toBeUndefined()
  })
  it('builds wallet_addEthereumChain params with hex chain ids', () => {
    expect(addChainParams(arcMainnet).chainId).toBe('0x13b2')
    expect(addChainParams(arcTestnet).chainId).toBe('0x4cef52')
    expect(addChainParams(arcMainnet).rpcUrls).toEqual(['https://rpc.mainnet.arc.io'])
    expect(addChainParams(arcMainnet).blockExplorerUrls).toEqual(['https://explorer.arc.io'])
  })
})

describe('clampFees respects the 20 gwei floor', () => {
  it('raises low estimates and keeps high ones', () => {
    expect(clampFees(undefined)).toEqual({ maxFeePerGas: 20_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n })
    expect(clampFees({ maxFeePerGas: 5_000_000_000n, maxPriorityFeePerGas: 0n }).maxFeePerGas).toBe(20_000_000_000n)
    expect(clampFees({ maxFeePerGas: 60_000_000_000n, maxPriorityFeePerGas: 2_000_000_000n })).toEqual({
      maxFeePerGas: 60_000_000_000n,
      maxPriorityFeePerGas: 2_000_000_000n,
    })
  })
})
