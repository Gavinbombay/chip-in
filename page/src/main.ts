// Chip In page: one static file, reads from a public RPC, writes through the
// user's own injected wallet. No server, no storage, no telemetry.
import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  parseEventLogs,
  type Abi,
  type Address,
  type Chain,
  type EIP1193Provider,
  type Hash,
  type PublicClient,
  custom,
} from 'viem'
import { chipInAbi } from './abi'
import { ARC_MAINNET_ID, chainById, explorerAddressUrl, explorerTxUrl, type ArcChainId } from './chains'
import { DEFAULT_CHAIN_ID, DEMO_BILLS, KNOWN_DEPLOYMENTS, REPO_URL } from './config'
import { formatBillLink, parseBillLink, type BillLink } from './link'
import { formatUsdc, parseUsdc, splitEqual, sum } from './money'
import {
  firstOpenShare,
  hasCode,
  mySharesToPay,
  readAllowance,
  readBill,
  readCap,
  readContributed,
  readMaxDuration,
  readShares,
  readUsdcBalance,
  ZERO_ADDRESS,
  type Bill,
  type Share,
} from './reads'
import { currentChainId, describeWalletError, discoverWallets, ensureChain, requestAccounts, walletClientFor, type InjectedWallet } from './wallet'
import { feeOverrides, prepareApprove, prepareCreateBill, preparePay, prepareRefund, prepareRelease } from './writes'


// Static hero markup (visual only, no data).
const HERO_HTML = `
<div class="hero-grid">
  <div class="hero-copy">
    <span class="eyebrow">Live on Arc mainnet</span>
    <h1 class="hero-title">Split the bill.<br><span>Settle in USDC.</span></h1>
    <p class="hero-sub">On Arc, USDC is the gas, so nobody needs a second token. If the bill doesn't fill by the deadline, everyone gets refunded.</p>
    <div class="hero-ctas">
      <a class="btn btn-primary" data-cta="demo" href="#">Try a demo bill</a>
      <a class="btn btn-ghost" data-cta="source" href="#" target="_blank" rel="noopener">View source</a>
    </div>
  </div>
  <div class="hero-art" aria-hidden="true">
    <div class="receipt">
      <div class="r-head"><span class="r-title">Dinner · Bill 1</span><span class="r-pill">0.75 USDC</span></div>
      <div class="r-line"></div><div class="r-line short"></div>
      <div class="r-chips">
        <span class="chip c1">A</span><span class="chip c2">B</span><span class="chip c3">C</span>
      </div>
      <div class="r-bar"><div></div></div>
      <div class="r-foot"><span>3 of 3 chipped in</span><span class="r-ok">Released</span></div>
    </div>
    <span class="coin k1"></span><span class="coin k2"></span>
  </div>
</div>
<ol class="hero-steps">
  <li><span class="n">1</span><div><strong>Create</strong><span>Set the total, shares and deadline.</span></div></li>
  <li><span class="n">2</span><div><strong>Friends chip in</strong><span>Each pays their share from their own wallet.</span></div></li>
  <li><span class="n">3</span><div><strong>Released or refunded</strong><span>Paid in full goes to the payee; short gets refunded.</span></div></li>
</ol>`

// ---------------------------------------------------------------- state

interface WalletState {
  provider: EIP1193Provider
  name: string
  account: Address
  chainId: number
}

const state: { wallet: WalletState | null; wallets: InjectedWallet[] } = { wallet: null, wallets: [] }

const $main = document.getElementById('main') as HTMLElement
const $walletSlot = document.getElementById('wallet-slot') as HTMLElement
const $toast = document.getElementById('toast') as HTMLElement
const $footLinks = document.getElementById('foot-links') as HTMLElement

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string | null | undefined)[]) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v
    else if (k === 'text') e.textContent = v
    else e.setAttribute(k, v)
  }
  for (const c of children) if (c !== null && c !== undefined) e.append(c)
  return e
}

function toast(msg: string) {
  $toast.textContent = msg
  $toast.hidden = false
  setTimeout(() => ($toast.hidden = true), 4000)
}

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function publicClientFor(chain: Chain): PublicClient {
  // Reads go to the public RPC. If the browser cannot reach it (for example a
  // cross-origin restriction) and a wallet is connected on this chain, reads
  // fall back to the wallet's provider.
  if (state.wallet && state.wallet.chainId === chain.id) {
    return createPublicClient({ chain, transport: custom(state.wallet.provider) })
  }
  return createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) })
}

function fmtDeadline(unix: bigint) {
  return new Date(Number(unix) * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function remaining(unix: bigint): string {
  const s = Number(unix) - Math.floor(Date.now() / 1000)
  if (s <= 0) return 'deadline passed'
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h left`
  if (h > 0) return `${h}h ${m}m left`
  return `${m}m left`
}

// ---------------------------------------------------------------- wallet UI

async function connect(targetChainId: ArcChainId) {
  const chain = chainById(targetChainId)!
  try {
    if (state.wallets.length === 0) state.wallets = await discoverWallets()
    if (state.wallets.length === 0) {
      toast('No browser wallet found. Install one such as MetaMask or Rabby, then reload.')
      return
    }
    let w = state.wallets[0]!
    if (state.wallets.length > 1) {
      const names = state.wallets.map((x, i) => `${i + 1}. ${x.name}`).join('\n')
      const pick = window.prompt(`Choose a wallet by number:\n${names}`, '1')
      const idx = pick ? Number.parseInt(pick, 10) - 1 : -1
      if (!state.wallets[idx]) return
      w = state.wallets[idx]!
    }
    const [account] = await requestAccounts(w.provider)
    if (!account) return
    await ensureChain(w.provider, chain)
    const chainId = await currentChainId(w.provider)
    state.wallet = { provider: w.provider, name: w.name, account: getAddress(account), chainId }
    const p = w.provider as EIP1193Provider & { on?: (ev: string, cb: (x: unknown) => void) => void }
    p.on?.('accountsChanged', (accs) => {
      const a = (accs as string[])[0]
      if (!a) state.wallet = null
      else if (state.wallet) state.wallet.account = getAddress(a)
      render()
    })
    p.on?.('chainChanged', (hex) => {
      if (state.wallet) state.wallet.chainId = Number.parseInt(hex as string, 16)
      render()
    })
    render()
  } catch (err) {
    toast(describeWalletError(err))
  }
}

function renderWalletSlot(targetChainId: ArcChainId) {
  $walletSlot.replaceChildren()
  const chain = chainById(targetChainId)!
  if (!state.wallet) {
    $walletSlot.append(el('button', { class: 'primary', type: 'button', text: 'Connect wallet' }))
    $walletSlot.querySelector('button')!.addEventListener('click', () => connect(targetChainId))
    return
  }
  const onRight = state.wallet.chainId === targetChainId
  $walletSlot.append(
    el('span', { class: `badge ${onRight ? 'ok' : 'bad'}`, text: onRight ? chain.name : 'Wrong network' }),
    el('span', { class: 'mono', title: state.wallet.account, text: short(state.wallet.account) }),
  )
  if (!onRight) {
    const b = el('button', { type: 'button', text: `Switch to ${chain.name}` })
    b.addEventListener('click', async () => {
      try {
        await ensureChain(state.wallet!.provider, chain)
        state.wallet!.chainId = await currentChainId(state.wallet!.provider)
        render()
      } catch (err) {
        toast(describeWalletError(err))
      }
    })
    $walletSlot.append(b)
  }
}

// ---------------------------------------------------------------- tx helper

/** Shape returned by the prepare* helpers in writes.ts. */
interface PreparedWrite {
  address: Address
  abi: Abi | readonly unknown[]
  functionName: string
  args?: readonly unknown[]
}

async function sendTx(chain: Chain, request: PreparedWrite, onStatus: (s: string) => void): Promise<Hash> {
  const w = state.wallet!
  const pub = publicClientFor(chain)
  const fees = await feeOverrides(pub)
  const wc = walletClientFor(w.provider, chain, w.account)
  onStatus('Confirm in your wallet…')
  const hash = await wc.writeContract({ ...request, ...fees, chain, account: w.account } as never)
  onStatus('Sent. Waiting for the block…')
  const rcpt = await pub.waitForTransactionReceipt({ hash })
  if (rcpt.status !== 'success') throw new Error('The transaction was included but reverted.')
  return hash
}

// ---------------------------------------------------------------- home

function renderHome() {
  const chainId = DEFAULT_CHAIN_ID
  const chain = chainById(chainId)!
  renderWalletSlot(chainId)
  const contract = KNOWN_DEPLOYMENTS[chainId]

  const intro = el('section', { class: 'hero' })
  intro.innerHTML = HERO_HTML
  const demoHref = contract && DEMO_BILLS[chainId].length > 0 ? formatBillLink(location.origin + location.pathname, { chainId, contract, billId: DEMO_BILLS[chainId][0]!.billId }) : null
  const tryBtn = intro.querySelector<HTMLAnchorElement>('[data-cta="demo"]')!
  if (demoHref) tryBtn.href = demoHref
  else tryBtn.remove()
  intro.querySelector<HTMLAnchorElement>('[data-cta="source"]')!.href = REPO_URL

  const open = el('section', { class: 'panel' },
    el('h2', { text: 'Open a bill link' }),
    el('p', { class: 'muted', text: 'Paste a link someone sent you. It looks like ?chain=5042&c=0x…&bill=1' }),
  )
  const openForm = el('form', { class: 'row' })
  const openInput = el('input', { type: 'url', placeholder: 'https://…/chip-in/?chain=5042&c=0x…&bill=1', 'aria-label': 'Bill link', style: 'flex:1' }) as HTMLInputElement
  openForm.append(openInput, el('button', { type: 'submit', text: 'Open' }))
  openForm.addEventListener('submit', (e) => {
    e.preventDefault()
    try {
      const u = new URL(openInput.value)
      const r = parseBillLink(u.search)
      if (!r.ok) throw new Error('That link is missing a valid chain, contract or bill number.')
      location.search = u.search
    } catch (err) {
      toast((err as Error).message)
    }
  })
  open.append(openForm)

  const demo = el('section', { class: 'panel' }, el('h2', { text: 'Demo bills' }))
  if (contract && DEMO_BILLS[chainId].length > 0) {
    for (const d of DEMO_BILLS[chainId]) {
      const href = formatBillLink(location.origin + location.pathname, { chainId, contract, billId: d.billId })
      demo.append(el('p', {}, el('a', { href, text: `Bill ${d.billId.toString()}: ${d.label}` })))
    }
    demo.append(el('p', { class: 'muted' }, 'Contract on the explorer: ', el('a', { href: explorerAddressUrl(chain, contract), class: 'mono', target: '_blank', rel: 'noopener', text: contract })))
  } else {
    demo.append(el('p', { class: 'muted', text: `No deployment is configured for ${chain.name} in this build.` }))
  }

  $main.replaceChildren(intro, renderCreate(chainId, contract), open, demo)
}

// ---------------------------------------------------------------- create

function renderCreate(chainId: ArcChainId, contract: Address | null): HTMLElement {
  const chain = chainById(chainId)!
  const panel = el('section', { class: 'panel' }, el('h2', { text: 'Create a bill' }))
  if (!contract) {
    panel.append(el('p', { class: 'muted', text: 'Creating bills needs a configured contract.' }))
    return panel
  }
  if (!state.wallet) {
    panel.append(el('p', { class: 'muted', text: 'Connect a wallet to create a bill.' }))
    return panel
  }
  if (state.wallet.chainId !== chainId) {
    panel.append(el('p', { class: 'notice warn', text: `Your wallet is on another network. Switch to ${chain.name} to continue.` }))
    return panel
  }

  const form = el('form', { class: 'panel', style: 'border:none;padding:0' })
  const payee = el('input', { type: 'text', value: state.wallet.account, required: 'true', spellcheck: 'false' }) as HTMLInputElement
  const total = el('input', { type: 'text', inputmode: 'decimal', placeholder: '24.00', required: 'true' }) as HTMLInputElement
  const mode = el('select', {}, el('option', { value: 'equal', text: 'Split equally' }), el('option', { value: 'custom', text: 'Custom shares' })) as HTMLSelectElement
  const people = el('input', { type: 'number', min: '1', max: '32', value: '3', required: 'true' }) as HTMLInputElement
  const now = new Date(Date.now() + 24 * 3600 * 1000)
  now.setSeconds(0, 0)
  const deadline = el('input', { type: 'datetime-local', required: 'true', value: toLocalInput(now) }) as HTMLInputElement
  const capNote = el('p', { class: 'muted', text: 'Loading the per-bill cap…' })
  const customRows = el('div', { class: 'share-rows' })
  const addRow = el('button', { type: 'button', text: 'Add a share' })
  const customBox = el('div', { class: 'panel', style: 'padding:12px' }, el('p', { class: 'muted', text: 'Leave the address empty for a share anyone can pay.' }), customRows, addRow)
  customBox.hidden = true

  function shareRow() {
    const r = el('div', { class: 'share-row' })
    const addr = el('label', {}, 'Address (optional)', el('input', { type: 'text', placeholder: '0x… or empty', spellcheck: 'false' }))
    const amt = el('label', {}, 'Amount (USDC)', el('input', { type: 'text', inputmode: 'decimal', placeholder: '8.00', required: 'true' }))
    const rm = el('button', { type: 'button', 'aria-label': 'Remove share', text: '×' })
    rm.addEventListener('click', () => r.remove())
    r.append(addr, amt, rm)
    return r
  }
  customRows.append(shareRow(), shareRow())
  addRow.addEventListener('click', () => {
    if (customRows.children.length >= 32) return toast('A bill can have at most 32 shares.')
    customRows.append(shareRow())
  })
  mode.addEventListener('change', () => {
    customBox.hidden = mode.value !== 'custom'
    equalBox.hidden = mode.value === 'custom'
  })
  const equalBox = el('div', { class: 'grid2' }, el('label', {}, 'Total (USDC)', total), el('label', {}, 'People paying', people))

  const status = el('p', { class: 'muted', 'aria-live': 'polite' })
  const submit = el('button', { class: 'primary', type: 'submit', text: 'Review and create' })

  form.append(
    el('label', {}, 'Who gets paid (payee address)', payee),
    el('label', {}, 'How to split', mode),
    equalBox,
    customBox,
    el('label', {}, 'Pay by (deadline)', deadline),
    capNote,
    status,
    el('div', { class: 'row' }, submit),
  )

  const pub = publicClientFor(chain)
  let cap = 0n
  let maxDur = 0n
  Promise.all([readCap(pub, contract), readMaxDuration(pub, contract)])
    .then(([c, d]) => {
      cap = c
      maxDur = d
      capNote.textContent = `Bills on this contract are capped at ${formatUsdc(c)} USDC and at most ${Number(d) / 86400} days long.`
    })
    .catch(() => (capNote.textContent = 'Could not read the contract. Check your connection and the network.'))

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      if (!isAddress(payee.value, { strict: false })) throw new Error('The payee address is not valid.')
      const payeeAddr = getAddress(payee.value)
      const dl = BigInt(Math.floor(new Date(deadline.value).getTime() / 1000))
      const nowS = BigInt(Math.floor(Date.now() / 1000))
      if (dl <= nowS + 300n) throw new Error('The deadline must be at least five minutes from now.')
      if (maxDur && dl > nowS + maxDur) throw new Error(`The deadline is too far away. The limit is ${Number(maxDur) / 86400} days.`)
      let payers: Address[] = []
      let amounts: bigint[] = []
      if (mode.value === 'equal') {
        const t = parseUsdc(total.value)
        const n = Number.parseInt(people.value, 10)
        if (!(n >= 1 && n <= 32)) throw new Error('People paying must be between 1 and 32.')
        amounts = splitEqual(t, n)
        payers = amounts.map(() => ZERO_ADDRESS)
      } else {
        for (const r of Array.from(customRows.children)) {
          const [a, m] = Array.from(r.querySelectorAll('input')) as HTMLInputElement[]
          const addrV = a!.value.trim()
          if (addrV && !isAddress(addrV, { strict: false })) throw new Error(`"${addrV}" is not a valid address.`)
          payers.push(addrV ? getAddress(addrV) : ZERO_ADDRESS)
          amounts.push(parseUsdc(m!.value))
        }
        if (amounts.length === 0) throw new Error('Add at least one share.')
      }
      if (amounts.some((a) => a === 0n)) throw new Error('Every share must be more than zero.')
      const t = sum(amounts)
      if (cap && t > cap) throw new Error(`The total ${formatUsdc(t)} is over the cap of ${formatUsdc(cap)} USDC.`)
      const ok = window.confirm(
        `Create this bill?\n\nPayee: ${payeeAddr}\nTotal: ${formatUsdc(t)} USDC in ${amounts.length} share(s)\nPay by: ${fmtDeadline(dl)}\n\nCheck the payee address twice. Money released from this bill goes there and cannot be redirected.`,
      )
      if (!ok) return
      submit.disabled = true
      const hash = await sendTx(chain, prepareCreateBill(contract, payeeAddr, dl, payers, amounts), (s) => (status.textContent = s))
      const rcpt = await publicClientFor(chain).getTransactionReceipt({ hash })
      const logs = parseEventLogs({ abi: chipInAbi, logs: rcpt.logs, eventName: 'BillCreated' })
      const billId = logs[0]?.args.billId
      if (billId === undefined) throw new Error('Created, but the bill number could not be read. Check the explorer.')
      const link = formatBillLink(location.origin + location.pathname, { chainId, contract, billId })
      status.replaceChildren('Bill created. ', el('a', { href: link, text: `Open bill ${billId.toString()}` }), ' · ', el('a', { href: explorerTxUrl(chain, hash), target: '_blank', rel: 'noopener', text: 'transaction' }))
      try {
        await navigator.clipboard.writeText(link)
        toast('Bill link copied to your clipboard.')
      } catch {
        toast('Bill created. Copy the link above to share it.')
      }
    } catch (err) {
      status.textContent = describeWalletError(err)
    } finally {
      submit.disabled = false
    }
  })
  panel.append(form)
  return panel
}

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// ---------------------------------------------------------------- bill view

async function renderBill(link: BillLink) {
  const chain = chainById(link.chainId)!
  renderWalletSlot(link.chainId)
  const panel = el('section', { class: 'panel' }, el('h1', { text: `Bill ${link.billId.toString()}` }))
  $main.replaceChildren(panel, el('section', { class: 'panel' }, el('div', { class: 'skeleton' }), el('div', { class: 'skeleton', style: 'width:60%' })))

  const known = KNOWN_DEPLOYMENTS[link.chainId]
  const isKnown = known !== null && known.toLowerCase() === link.contract.toLowerCase()
  panel.append(
    el('p', { class: 'row' },
      el('span', { class: `badge ${isKnown ? 'ok' : 'warn'}`, text: isKnown ? 'Known contract' : 'Unknown contract' }),
      el('a', { class: 'mono', href: explorerAddressUrl(chain, link.contract), target: '_blank', rel: 'noopener', text: link.contract }),
    ),
  )
  if (!isKnown) {
    panel.append(el('p', { class: 'notice warn', text: 'This link points at a contract this page was not built for. Only continue if you trust the person who sent it. Payments approve exactly one share amount to that contract and nothing more.' }))
  }

  const pub = publicClientFor(chain)
  let bill: Bill
  let shares: Share[]
  try {
    if (!(await hasCode(pub, link.contract))) throw new Error('There is no contract at this address on this network.')
    ;[bill, shares] = await Promise.all([readBill(pub, link.contract, link.billId), readShares(pub, link.contract, link.billId)])
  } catch (err) {
    const raw = String((err as Error).message ?? err)
    const knownMsg = /UnknownBill/.test(raw)
      ? 'This bill number does not exist on this contract.'
      : raw.includes('There is no contract at this address on this network.')
        ? 'There is no contract at this address on this network.'
        : null
    const box = el('section', { class: 'panel' })
    if (knownMsg) {
      box.append(el('p', { class: 'notice bad', text: knownMsg }), el('p', {}, el('a', { href: './', text: 'Back to home' })))
    } else {
      box.append(el('p', { class: 'notice bad', text: 'Could not reach the network. Check your connection and try again.' }))
      const retry = el('button', { type: 'button', text: 'Retry' })
      retry.addEventListener('click', () => {
        void renderBill(link)
      })
      box.append(el('p', {}, retry))
    }
    $main.replaceChildren(panel, box)
    return
  }

  const stateLabel: Record<Bill['state'], [string, string]> = {
    open: ['Open', 'ok'],
    funded: ['Covered', 'ok'],
    released: ['Released', 'ok'],
    expired: ['Deadline passed', 'bad'],
  }
  const [label, cls] = stateLabel[bill.state]
  const pct = bill.total === 0n ? 0 : Number((bill.paid * 100n) / bill.total)

  const summary = el('section', { class: 'panel' },
    el('div', { class: 'row' }, el('span', { class: `badge ${cls}`, text: label }), el('span', { class: 'muted', text: bill.state === 'open' ? remaining(bill.deadline) : '' })),
    el('p', {}, el('strong', { text: `${formatUsdc(bill.paid)} of ${formatUsdc(bill.total)} USDC` }), el('span', { class: 'muted', text: ' covered' })),
    el('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, el('div', { style: `width:${pct}%` })),
    el('p', { class: 'muted small', text: `${shares.filter((s) => s.paid).length} of ${shares.length} shares paid` }),
    el('p', { class: 'muted' }, 'Pays out to ', el('a', { class: 'mono', href: explorerAddressUrl(chain, bill.payee), target: '_blank', rel: 'noopener', text: bill.payee })),
    el('p', { class: 'muted', text: `Pay by ${fmtDeadline(bill.deadline)} (your local time).` }),
  )

  const explain: Record<Bill['state'], string> = {
    open: 'Pay your share below. The money stays in the contract until the bill is fully covered or the deadline passes.',
    funded: 'Every share is paid. Anyone can release the total to the payee.',
    released: 'The total has been sent to the payee. Nothing is left to do.',
    expired: 'The deadline passed before the bill was covered. Everyone who paid can take their money back.',
  }
  summary.append(el('p', { text: explain[bill.state] }))

  // actions
  const actions = el('section', { class: 'panel' }, el('h2', { text: 'Shares' }))
  const tableWrap = el('div', { class: 'table-wrap' })
  const table = el('table', {}, el('thead', {}, el('tr', {}, el('th', { text: '#' }), el('th', { text: 'Who' }), el('th', { text: 'Amount' }), el('th', { text: 'Status' }))))
  const tbody = el('tbody')
  const me = state.wallet?.account
  const onRight = state.wallet?.chainId === link.chainId
  const status = el('p', { class: 'muted', 'aria-live': 'polite' })
  const steps = el('div', { class: 'steps' })

  async function payShare(idx: number) {
    if (!state.wallet) return connect(link.chainId)
    if (!onRight) return toast(`Switch your wallet to ${chain.name} first.`)
    const share = shares[idx]!
    try {
      const bal = await readUsdcBalance(pub, me!)
      if (bal < share.amount) throw new Error(`This wallet holds ${formatUsdc(bal)} USDC, less than the ${formatUsdc(share.amount)} share.`)
      const allowance = await readAllowance(pub, me!, link.contract)
      const needApprove = allowance < share.amount
      steps.replaceChildren(
        el('span', { class: `step ${needApprove ? 'active' : 'done'}`, text: '1. Approve exact amount' }),
        el('span', { class: 'step', text: '2. Pay share' }),
      )
      if (needApprove) {
        await sendTx(chain, prepareApprove(link.contract, share.amount), (s) => (status.textContent = `Approve: ${s}`))
        steps.children[0]!.className = 'step done'
      }
      steps.children[1]!.className = 'step active'
      const hash = await sendTx(chain, preparePay(link.contract, link.billId, BigInt(idx)), (s) => (status.textContent = `Pay: ${s}`))
      steps.children[1]!.className = 'step done'
      status.replaceChildren('Paid. ', el('a', { href: explorerTxUrl(chain, hash), target: '_blank', rel: 'noopener', text: 'View transaction' }))
      setTimeout(render, 800)
    } catch (err) {
      status.textContent = describeWalletError(err)
      if (/SharePaidAlready/.test(String((err as Error).message))) setTimeout(render, 800)
    }
  }

  shares.forEach((s, i) => {
    const isOpen = s.payer === ZERO_ADDRESS
    const mine = me !== undefined && s.payer.toLowerCase() === me.toLowerCase()
    const who = s.paid && isOpen ? '—' : isOpen ? 'Anyone' : mine ? 'You' : short(s.payer)
    const st = el('td')
    if (s.paid) st.append(el('span', { class: 'badge ok', text: 'Paid' }))
    else if (bill.state !== 'open') st.append(el('span', { class: 'badge open', text: 'Unpaid' }))
    else if (isOpen || mine) {
      const b = el('button', { class: 'primary', type: 'button', text: `Pay ${formatUsdc(s.amount)}` })
      b.addEventListener('click', () => payShare(i))
      st.append(b)
    } else st.append(el('span', { class: 'badge open', text: 'Waiting' }))
    tbody.append(el('tr', {}, el('td', { text: String(i + 1) }), el('td', { class: 'mono', title: isOpen ? '' : s.payer, text: who }), el('td', { text: `${formatUsdc(s.amount)} USDC` }), st))
  })
  table.append(tbody)
  tableWrap.append(table)
  actions.append(tableWrap)

  if (bill.state === 'open' && me && onRight) {
    const mine = mySharesToPay(shares, me)
    const open = firstOpenShare(shares)
    if (mine.length === 0 && open === -1) actions.append(el('p', { class: 'muted', text: 'Every share is assigned or paid. There is nothing for this wallet to pay.' }))
  }

  if (bill.state === 'funded') {
    const b = el('button', { class: 'primary', type: 'button', text: `Release ${formatUsdc(bill.total)} USDC to the payee` })
    b.addEventListener('click', async () => {
      if (!state.wallet) return connect(link.chainId)
      if (!onRight) return toast(`Switch your wallet to ${chain.name} first.`)
      try {
        b.disabled = true
        const hash = await sendTx(chain, prepareRelease(link.contract, link.billId), (s) => (status.textContent = s))
        status.replaceChildren('Released. ', el('a', { href: explorerTxUrl(chain, hash), target: '_blank', rel: 'noopener', text: 'View transaction' }))
        setTimeout(render, 800)
      } catch (err) {
        status.textContent = describeWalletError(err)
        b.disabled = false
      }
    })
    actions.append(el('div', { class: 'row' }, b))
  }

  const mineBox = el('section', { class: 'panel' }, el('h2', { text: 'Your contribution' }))
  if (!state.wallet) {
    mineBox.append(el('p', { class: 'muted', text: 'Connect a wallet to see what you paid and to pay or claim.' }))
  } else if (!onRight) {
    mineBox.append(el('p', { class: 'notice warn', text: `Your wallet is on another network. Switch to ${chain.name}.` }))
  } else {
    const c = await readContributed(pub, link.contract, link.billId, me!)
    mineBox.append(el('p', { text: `You have paid ${formatUsdc(c)} USDC into this bill.` }))
    if (bill.state === 'expired' && c > 0n) {
      const b = el('button', { class: 'primary', type: 'button', text: `Take back ${formatUsdc(c)} USDC` })
      b.addEventListener('click', async () => {
        try {
          b.disabled = true
          const hash = await sendTx(chain, prepareRefund(link.contract, link.billId), (s) => (status.textContent = s))
          status.replaceChildren('Refunded. ', el('a', { href: explorerTxUrl(chain, hash), target: '_blank', rel: 'noopener', text: 'View transaction' }))
          setTimeout(render, 800)
        } catch (err) {
          status.textContent = describeWalletError(err)
          b.disabled = false
        }
      })
      mineBox.append(el('div', { class: 'row' }, b))
    }
  }

  const shareBox = el('section', { class: 'panel' }, el('h2', { text: 'Share this bill' }))
  const url = formatBillLink(location.origin + location.pathname, link)
  const copy = el('button', { type: 'button', text: 'Copy link' })
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copied.')
    } catch {
      toast('Copy failed. Select the link text and copy it.')
    }
  })
  shareBox.append(el('p', { class: 'mono', text: url }), el('div', { class: 'row' }, copy))

  actions.append(steps, status)
  $main.replaceChildren(panel, summary, actions, mineBox, shareBox)
}

// ---------------------------------------------------------------- boot

function render() {
  const parsed = parseBillLink(location.search)
  const footChain = chainById(parsed.ok ? parsed.link.chainId : DEFAULT_CHAIN_ID)
  const footContract = parsed.ok ? parsed.link.contract : KNOWN_DEPLOYMENTS[DEFAULT_CHAIN_ID]
  $footLinks.replaceChildren(
    el('span', { text: footChain?.id === ARC_MAINNET_ID ? 'Arc mainnet' : (footChain?.name ?? 'Arc') }),
    ...(footChain && footContract ? [' · ', el('a', { href: explorerAddressUrl(footChain, footContract), target: '_blank', rel: 'noopener', text: 'Contract' })] : []),
    ' · ',
    el('a', { href: REPO_URL, target: '_blank', rel: 'noopener', text: 'Source' }),
  )
  if (parsed.ok) {
    void renderBill(parsed.link)
  } else if (parsed.reason !== 'empty') {
    renderWalletSlot(DEFAULT_CHAIN_ID)
    const why: Record<string, string> = {
      chain: 'The link names a network this page does not support. Supported: Arc (5042) and Arc Testnet (5042002).',
      contract: 'The link has an invalid contract address.',
      bill: 'The link has an invalid bill number.',
    }
    $main.replaceChildren(el('section', { class: 'panel' }, el('h1', { text: 'This link is not a bill' }), el('p', { class: 'notice bad', text: why[parsed.reason] ?? '' }), el('p', {}, el('a', { href: './', text: 'Go to the home page' }))))
  } else {
    renderHome()
  }
}

void ARC_MAINNET_ID
render()
