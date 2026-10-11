// End-to-end test of the data layer against a local node with the Chip In
// contract deployed. Skipped unless CHIPIN_RPC and CHIPIN_CONTRACT are set.
// Local node: arc-anvil --network arc (runbook R2) or any anvil with a
// 6-decimal ERC-20 at the USDC address.
import { createPublicClient, createWalletClient, defineChain, http, parseEventLogs, type Abi, type Address } from 'viem'

// Node's process.env without pulling in @types/node.
declare const process: { env: Record<string, string | undefined> }

interface PreparedWrite {
  address: Address
  abi: Abi | readonly unknown[]
  functionName: string
  args?: readonly unknown[]
}
import { privateKeyToAccount } from 'viem/accounts'
import { ipc } from 'viem/node'
import { describe, expect, it } from 'vitest'
import { chipInAbi } from '../src/abi'
import {
  firstOpenShare,
  hasCode,
  mySharesToPay,
  readAllowance,
  readBill,
  readBillCount,
  readCap,
  readContributed,
  readMaxDuration,
  readShares,
  readUsdcBalance,
  ZERO_ADDRESS,
} from '../src/reads'
import { describeWalletError } from '../src/wallet'
import { feeOverrides, prepareApprove, prepareCreateBill, preparePay, prepareRefund, prepareRelease } from '../src/writes'

const RPC = process.env.CHIPIN_RPC
const CONTRACT = process.env.CHIPIN_CONTRACT as Address | undefined
const CHAIN_ID = Number(process.env.CHIPIN_CHAIN_ID ?? '31337')

// Well-known local dev keys (anvil / arc-anvil default mnemonic). Never hold real funds.
const KEYS = {
  creator: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  payerA: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  payerB: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
} as const

const run = RPC && CONTRACT ? describe : describe.skip

run('data layer against a local node', () => {
  // CHIPIN_RPC may be an http(s) URL or a path to an IPC socket. When the
  // variables are absent the suite is skipped, but vitest still evaluates this
  // block, so a harmless local default keeps the transport constructor happy.
  const url = RPC ?? 'http://127.0.0.1:8545'
  const chain = defineChain({
    id: CHAIN_ID,
    name: 'local',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [url] } },
  })
  const transport = url.startsWith('/') ? ipc(url) : http(url)
  const pub = createPublicClient({ chain, transport })
  const creator = privateKeyToAccount(KEYS.creator)
  const payerA = privateKeyToAccount(KEYS.payerA)
  const payerB = privateKeyToAccount(KEYS.payerB)
  const wc = (acct: typeof creator) => createWalletClient({ account: acct, chain, transport })
  const contract = CONTRACT!

  async function send(acct: typeof creator, req: PreparedWrite) {
    const fees = await feeOverrides(pub)
    const hash = await wc(acct).writeContract({ ...req, ...fees } as never)
    const rcpt = await pub.waitForTransactionReceipt({ hash })
    expect(rcpt.status).toBe('success')
    return rcpt
  }

  it('reads the deployment config', async () => {
    expect(await hasCode(pub, contract)).toBe(true)
    expect(await readCap(pub, contract)).toBe(25_000_000n)
    expect(await readMaxDuration(pub, contract)).toBe(2_592_000n)
    expect(await readBillCount(pub, contract)).toBeGreaterThanOrEqual(0n)
    expect(await readUsdcBalance(pub, payerA.address)).toBeGreaterThan(0n)
  })

  it('creates, pays, funds and releases a bill (bill A shape)', async () => {
    const latest = await pub.getBlock()
    const deadline = latest.timestamp + 3600n
    const rcpt = await send(creator, prepareCreateBill(contract, creator.address, deadline, [payerA.address, ZERO_ADDRESS], [400_000n, 350_000n]))
    const created = parseEventLogs({ abi: chipInAbi, logs: rcpt.logs, eventName: 'BillCreated' })
    expect(created).toHaveLength(1)
    const billId = created[0]!.args.billId
    expect(created[0]!.args.total).toBe(750_000n)

    let bill = await readBill(pub, contract, billId)
    expect(bill).toMatchObject({ creator: creator.address, payee: creator.address, deadline, total: 750_000n, paid: 0n, shareCount: 2n, state: 'open' })
    let shares = await readShares(pub, contract, billId)
    expect(shares).toEqual([
      { payer: payerA.address, amount: 400_000n, paid: false },
      { payer: ZERO_ADDRESS, amount: 350_000n, paid: false },
    ])
    expect(mySharesToPay(shares, payerA.address)).toEqual([0])
    expect(firstOpenShare(shares)).toBe(1)

    // payer A: exact approve, then pay share 0
    const a0 = await readUsdcBalance(pub, payerA.address)
    await send(payerA, prepareApprove(contract, 400_000n))
    expect(await readAllowance(pub, payerA.address, contract)).toBe(400_000n)
    const payRcpt = await send(payerA, preparePay(contract, billId, 0n))
    const paidLogs = parseEventLogs({ abi: chipInAbi, logs: payRcpt.logs, eventName: 'SharePaid' })
    expect(paidLogs[0]!.args).toMatchObject({ billId, shareIndex: 0n, payer: payerA.address, amount: 400_000n, paidTotal: 400_000n })
    expect(a0 - (await readUsdcBalance(pub, payerA.address))).toBe(400_000n)
    expect(await readContributed(pub, contract, billId, payerA.address)).toBe(400_000n)
    expect(await readAllowance(pub, payerA.address, contract)).toBe(0n)

    // double pay is rejected with a decodable custom error
    await send(payerA, prepareApprove(contract, 400_000n))
    await expect(send(payerA, preparePay(contract, billId, 0n))).rejects.toThrow(/SharePaidAlready/)
    expect(describeWalletError(new Error('SharePaidAlready(1, 0)'))).toMatch(/just paid/)

    // payer B takes the open share; bill becomes funded
    await send(payerB, prepareApprove(contract, 350_000n))
    const payB = await send(payerB, preparePay(contract, billId, 1n))
    expect(parseEventLogs({ abi: chipInAbi, logs: payB.logs, eventName: 'BillFunded' })).toHaveLength(1)
    bill = await readBill(pub, contract, billId)
    expect(bill.state).toBe('funded')
    expect(bill.paid).toBe(750_000n)
    shares = await readShares(pub, contract, billId)
    expect(shares[1]).toEqual({ payer: payerB.address, amount: 350_000n, paid: true })

    // paying a covered bill is rejected
    await send(payerB, prepareApprove(contract, 1n))
    await expect(send(payerB, preparePay(contract, billId, 1n))).rejects.toThrow(/BillNotOpen|SharePaidAlready/)

    // anyone releases; payee receives the total
    const p0 = await readUsdcBalance(pub, creator.address)
    const rel = await send(payerB, prepareRelease(contract, billId))
    const relLogs = parseEventLogs({ abi: chipInAbi, logs: rel.logs, eventName: 'Released' })
    expect(relLogs[0]!.args).toMatchObject({ billId, payee: creator.address, amount: 750_000n })
    expect((await readUsdcBalance(pub, creator.address)) - p0).toBe(750_000n)
    expect((await readBill(pub, contract, billId)).state).toBe('released')
  })

  it('refunds a short bill after the deadline (bill B shape)', async () => {
    const latest = await pub.getBlock()
    const deadline = latest.timestamp + 900n // 15 minutes
    const rcpt = await send(creator, prepareCreateBill(contract, creator.address, deadline, [payerA.address, ZERO_ADDRESS], [300_000n, 300_000n]))
    const billId = parseEventLogs({ abi: chipInAbi, logs: rcpt.logs, eventName: 'BillCreated' })[0]!.args.billId

    await send(payerA, prepareApprove(contract, 300_000n))
    await send(payerA, preparePay(contract, billId, 0n))
    await expect(send(payerA, prepareRefund(contract, billId))).rejects.toThrow(/NotRefundable/)

    // move the local clock past the deadline
    await pub.request({ method: 'evm_increaseTime' as never, params: [901] as never })
    await pub.request({ method: 'evm_mine' as never, params: [] as never })
    expect((await readBill(pub, contract, billId)).state).toBe('expired')

    const a0 = await readUsdcBalance(pub, payerA.address)
    const ref = await send(payerA, prepareRefund(contract, billId))
    const refLogs = parseEventLogs({ abi: chipInAbi, logs: ref.logs, eventName: 'Refunded' })
    expect(refLogs[0]!.args).toMatchObject({ billId, payer: payerA.address, amount: 300_000n })
    expect((await readUsdcBalance(pub, payerA.address)) - a0).toBe(300_000n)
    expect(await readContributed(pub, contract, billId, payerA.address)).toBe(0n)
    await expect(send(payerA, prepareRefund(contract, billId))).rejects.toThrow(/NothingToRefund/)
    await expect(send(payerB, preparePay(contract, billId, 1n))).rejects.toThrow(/BillExpired/)
  })

  it('reports a missing bill as UnknownBill', async () => {
    await expect(readBill(pub, contract, 999_999n)).rejects.toThrow(/UnknownBill/)
  })
})
