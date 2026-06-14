'use client'
import { useCallback, useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useEscrowWallet } from '@/lib/useEscrowWallet'
import { createEscrow, fundEscrow, claim } from '@/lib/escrow-actions'
import { readUsdcBalance, readWithdrawable, findEscrowFor, type EscrowView, type Party } from '@/lib/reads'
import { toMicro, formatUsdc } from '@/lib/usdc'
import { DEMO } from '@/lib/demo'
import { FAUCET } from '@/lib/chain'
import { AddFundsButton } from '@/app/components/AddFundsButton'
import { fetchParties, type Parties } from '@/lib/profile'
import { VIOLATIONS, violationLabel } from '@/lib/violations'
import { fetchBids, acceptedBidFor, type Bid } from '@/lib/bids'
// `import type` is erased at build, so the `server-only` guard in store.ts never
// reaches this client bundle. Keep it type-only — a value import here would break the build.
import type { Violation } from '@/lib/server/store'

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '…')

const DISPLAY = 'font-[family-name:var(--font-display)]'
const MONO = 'font-[family-name:var(--font-mono)]'

export default function TenantView() {
  const [violation, setViolation] = useState<Violation | null>(null)
  useEffect(() => {
    fetch('/api/violation').then((r) => r.json()).then(setViolation).catch(() => {})
  }, [])
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  const [selectedRow, setSelectedRow] = useState<number>(VIOLATIONS[0]?.row ?? 0)

  return (
    <main
      className="min-h-screen bg-[#EAEFF6] font-[family-name:var(--font-body)] text-[#0E1A33]"
    >
      <div className="mx-auto max-w-[440px] space-y-4 px-5 pb-12 pt-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield tone="#1D4ED8" size={22} />
            <span className="text-sm font-semibold tracking-tight">RentShield</span>
          </div>
          <span className="text-xs text-[#5A6B85]">NYC · HPD escrow</span>
        </header>

        {appId ? (
          <Portal violation={violation} selectedRow={selectedRow} setSelectedRow={setSelectedRow} />
        ) : (
          <Card>
            <p className="text-sm text-[#5A6B85]">
              Sign-in unavailable — set <span className={MONO}>NEXT_PUBLIC_PRIVY_APP_ID</span> to enable login.
            </p>
          </Card>
        )}
      </div>
    </main>
  )
}

function Portal({ violation, selectedRow, setSelectedRow }: {
  violation: Violation | null
  selectedRow: number
  setSelectedRow: (row: number) => void
}) {
  const { ready, authenticated, login, logout } = usePrivy()
  const { address, getWriteWallet } = useEscrowWallet()
  const [bal, setBal] = useState<bigint | null>(null)
  const [esc, setEsc] = useState<EscrowView | null>(null)
  const [role, setRole] = useState<Party | null>(null)
  const [wd, setWd] = useState<bigint | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [parties, setParties] = useState<Parties>({})
  const [bids, setBids] = useState<Bid[]>([])
  const [rent, setRent] = useState(DEMO.principal)
  const [interest, setInterest] = useState<bigint | null>(null) // interest the tenant received on settlement

  // The chosen catalog violation. The tenant always creates against the OPEN
  // HPD number; the admin/oracle settles it Closed from the admin tab.
  const selected = VIOLATIONS.find((v) => v.row === selectedRow) ?? VIOLATIONS[0]
  const violationId = selected ? selected.open.violationId : ''
  // The contractor + fee come from the bid the landlord accepted for this violation.
  const acceptedBid = selected ? acceptedBidFor(bids, selected.row) : undefined
  const canCreate = !!(parties.landlord && acceptedBid)

  // Resolve the landlord from sign-ups and the contractor bids (poll so both
  // appear as those parties act) instead of hardcoded env addresses.
  useEffect(() => {
    let on = true
    const tick = () => {
      fetchParties().then((p) => { if (on) setParties(p) }).catch(() => {})
      fetchBids().then((b) => { if (on) setBids(b) }).catch(() => {})
    }
    tick()
    const t = setInterval(tick, 5000)
    return () => { on = false; clearInterval(t) }
  }, [])

  const refresh = useCallback(async () => {
    if (!address) return
    const [b, found] = await Promise.all([readUsdcBalance(address), findEscrowFor(address)])
    setBal(b)
    setEsc(found?.escrow ?? null)
    setRole(found?.role ?? null)
    setWd(found ? await readWithdrawable(address) : null)
  }, [address])

  useEffect(() => {
    if (!address) return
    let on = true
    const tick = () => refresh().catch((e) => { if (on) setMsg(`Couldn't read chain: ${(e as Error).message}`) })
    tick()
    const t = setInterval(tick, 5000)
    return () => { on = false; clearInterval(t) }
  }, [address, refresh])

  const run = (label: string, fn: () => Promise<unknown>) => async () => {
    setBusy(true)
    setMsg(`${label}…`)
    try {
      await fn()
      await refresh()
      setMsg(`${label} done`)
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string }
      setMsg(`${label} failed — ${err.shortMessage ?? err.message ?? 'try again'}`)
    } finally {
      setBusy(false)
    }
  }

  const onCreate = run('Creating escrow', async () => {
    if (!address) throw new Error('No wallet connected')
    if (!/^\d+$/.test(violationId)) throw new Error('Select a violation')
    if (!parties.landlord) throw new Error('Waiting for a landlord to sign up')
    if (!acceptedBid) throw new Error('No accepted contractor bid for this violation yet')
    const w = await getWriteWallet()
    await createEscrow(w, {
      tenant: address,
      landlord: parties.landlord as `0x${string}`,
      contractor: acceptedBid.contractor as `0x${string}`,
      violationId,
      contractorFee: toMicro(acceptedBid.fee),
    })
  })
  const onFund = run('Funding rent', async () => {
    if (!esc) throw new Error('No escrow')
    const principal = toMicro(rent)
    if (principal <= 0n) throw new Error('Enter a rent amount')
    // Guard the FeeExceedsPrincipal() revert: fund reverts if the contractor fee
    // (set at creation) is larger than the funded rent.
    if (esc.contractorFee > principal) throw new Error('Contractor fee is larger than the rent amount')
    const w = await getWriteWallet()
    await fundEscrow(w, BigInt(esc.id), principal)
  })
  // "Receive funds": once the admin/oracle has closed the violation (settling the
  // escrow on-chain), the tenant withdraws the interest they're owed. The tenant's
  // withdrawable on a closed escrow is the accrued interest — principal went to the
  // landlord/contractor — so capture it to show what they received.
  const onReceive = run('Receiving funds', async () => {
    if (!esc) throw new Error('No escrow')
    if (!esc.settled) throw new Error('Not released yet — waiting for HPD to close the violation')
    if (!address) throw new Error('No wallet connected')
    const claimable = await readWithdrawable(address)
    if (claimable > 0n) {
      const w = await getWriteWallet()
      await claim(w)
    }
    setInterest(claimable)
  })

  if (!ready) {
    return <Card><p className="text-sm text-[#5A6B85]">Loading…</p></Card>
  }

  if (!authenticated) {
    return (
      <>
        <Hero tone="protect" eyebrow="Your rent, protected" amount={DEMO.principal} caption="Held safely on-chain while HPD reviews the violation — and the yield is yours." />
        <ViolationCard violation={violation} />
        <Card>
          <Button busy={false} onClick={login}>Log in to your apartment</Button>
          <p className="text-center text-xs text-[#5A6B85]">Email or phone — a wallet is created for you.</p>
        </Card>
      </>
    )
  }

  const phase: 'protect' | 'locked' | 'settled' = esc?.settled ? 'settled' : esc?.funded ? 'locked' : 'protect'
  const heroAmount = esc && esc.funded ? formatUsdc(esc.principal).replace(' USDC', '') : DEMO.principal

  return (
    <>
      <Hero
        tone={phase}
        eyebrow={phase === 'settled' ? 'Violation resolved' : phase === 'locked' ? 'Rent protected' : 'Ready to protect'}
        amount={heroAmount}
        caption={
          phase === 'settled'
            ? 'The violation closed on-chain. The interest your rent earned while locked is yours.'
            : phase === 'locked'
              ? `Locked in escrow, earning interest until HPD resolves violation #${esc!.violationId.toString()}.`
              : 'Create your escrow, then fund this month’s rent to lock it.'
        }
        yieldLabel={esc?.settled ? 'Interest earned' : esc?.funded ? 'Interest so far' : undefined}
        yieldValue={interest != null ? formatUsdc(interest) : wd != null ? formatUsdc(wd) : '…'}
      />

      <ViolationCard violation={violation} />

      <Card>
        {/* state machine */}
        {esc == null && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="violation" className="block text-sm font-medium">Open HPD violation on your apartment</label>
              <select
                id="violation"
                value={selectedRow}
                onChange={(e) => setSelectedRow(Number(e.target.value))}
                className="w-full rounded-xl border border-[#D7E0EC] bg-white px-4 py-3 text-base outline-none focus:border-[#1D4ED8]"
              >
                {VIOLATIONS.map((v) => (
                  <option key={v.row} value={v.row}>{violationLabel(v)} — #{v.open.violationId}</option>
                ))}
              </select>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#5A6B85]">The oracle watches this HPD ID to release your rent.</span>
                <span className={`${MONO} font-semibold text-[#B45309]`}>#{violationId}</span>
              </div>
            </div>
            <div className="rounded-xl bg-[#F8FAFC] px-3 py-2.5 text-xs">
              {acceptedBid ? (
                <span className="text-[#445166]">
                  Contractor accepted — fee <span className="font-semibold">{acceptedBid.fee} USDC</span> to{' '}
                  <span className={MONO}>{short(acceptedBid.contractor)}</span>
                </span>
              ) : (
                <span className="text-[#B45309]">No accepted contractor bid yet — a contractor must bid and the landlord must accept it.</span>
              )}
            </div>
            <label className="block text-sm font-medium">
              Monthly rent to send to escrow (USDC)
              <input
                value={rent}
                onChange={(e) => setRent(e.target.value)}
                inputMode="decimal"
                className={`mt-1.5 w-full rounded-xl border border-[#D7E0EC] bg-white px-4 py-3 text-base outline-none focus:border-[#1D4ED8] ${MONO}`}
              />
            </label>
            {!parties.landlord && <p className="text-xs text-[#B45309]">Waiting for a landlord to sign up.</p>}
            <Button busy={busy || !canCreate} onClick={onCreate}>Create my rent escrow</Button>
          </div>
        )}

        {esc && !esc.funded && role === 'tenant' && (
          <div className="space-y-3">
            <label className="block text-sm font-medium">
              Rent to send to escrow (USDC)
              <input
                value={rent}
                onChange={(e) => setRent(e.target.value)}
                inputMode="decimal"
                className={`mt-1.5 w-full rounded-xl border border-[#D7E0EC] bg-white px-4 py-3 text-base outline-none focus:border-[#1D4ED8] ${MONO}`}
              />
            </label>
            <Button busy={busy} onClick={onFund}>Send rent to escrow — {rent} USDC</Button>
          </div>
        )}

        {esc && esc.funded && !esc.settled && (
          <p className="text-center text-sm text-[#5A6B85]">
            Nothing to do — your rent is safe. It releases automatically once HPD closes the violation.
          </p>
        )}

        {esc && esc.settled && interest == null && (
          <Button busy={busy} onClick={onReceive}>
            {wd != null && wd > 0n ? `Receive my interest — ${formatUsdc(wd)}` : 'Receive funds from escrow'}
          </Button>
        )}

        {interest != null && (
          interest > 0n
            ? <div className="rounded-2xl border border-[#A7F3D0] bg-[#ECFDF5] p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#047857]">Interest received</p>
                <p className={`mt-1 text-2xl font-bold text-[#047857] ${DISPLAY}`}>{formatUsdc(interest)}</p>
                <p className="mt-1 text-xs text-[#5A6B85]">Your principal was released to the landlord; the interest it earned is yours.</p>
              </div>
            : <p className="text-center text-sm text-[#5A6B85]">Resolved — your principal returned to the landlord; no interest accrued this period.</p>
        )}

        {msg && <p className="mt-3 text-center text-xs text-[#5A6B85]">{msg}</p>}
      </Card>

      <WalletRow address={address} bal={bal} onLogout={logout} onFunded={refresh} />
    </>
  )
}

/* ---------- presentational pieces ---------- */

const TONES = {
  protect: { bg: '#EEF2FD', ring: '#C7D2FE', accent: '#1D4ED8' },
  locked: { bg: '#FFF7ED', ring: '#FED7AA', accent: '#B45309' },
  settled: { bg: '#ECFDF5', ring: '#A7F3D0', accent: '#047857' },
} as const

export function Hero({
  tone, eyebrow, amount, caption, yieldLabel, yieldValue,
}: {
  tone: keyof typeof TONES
  eyebrow: string
  amount: string
  caption: string
  yieldLabel?: string
  yieldValue?: string
}) {
  const t = TONES[tone]
  return (
    <section
      className="rounded-3xl border p-6 shadow-sm"
      style={{ backgroundColor: t.bg, borderColor: t.ring }}
    >
      <div className="flex items-center gap-2">
        <Shield tone={t.accent} size={18} />
        <span className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: t.accent }}>{eyebrow}</span>
      </div>
      <div className={`mt-3 flex items-baseline gap-2 ${DISPLAY}`}>
        <span className="text-5xl font-bold leading-none tracking-tight text-[#0E1A33]">{amount}</span>
        <span className="text-xl font-semibold" style={{ color: t.accent }}>USDC</span>
        <span className="text-sm font-medium text-[#5A6B85]">/ month</span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[#445166]">{caption}</p>
      {yieldLabel && (
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3">
          <span className="text-xs font-medium text-[#5A6B85]">{yieldLabel}</span>
          <span className={`text-base font-semibold ${DISPLAY}`} style={{ color: TONES.settled.accent }}>{yieldValue}</span>
        </div>
      )}
    </section>
  )
}

export function ViolationCard({ violation }: { violation: Violation | null }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5A6B85]">HPD violation</h2>
        {violation && <StatusPill status={violation.status} />}
      </div>
      {violation ? (
        <div className="mt-2">
          <p className="font-medium">{violation.address}</p>
          <p className="text-sm text-[#5A6B85]">{violation.description}</p>
          <p className={`mt-2 text-xs text-[#8190A6] ${MONO}`}>#{violation.violationId}{violation.date ? ` · ${violation.date}` : ''}</p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-[#5A6B85]">No violation on file yet.</p>
      )}
    </Card>
  )
}

function StatusPill({ status }: { status: string }) {
  const open = status === 'Open'
  const c = open ? TONES.locked : TONES.settled
  return (
    <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: c.bg, color: c.accent }}>
      {open ? 'Open' : status}
    </span>
  )
}

function WalletRow({ address, bal, onLogout, onFunded }: { address?: string; bal: bigint | null; onLogout: () => void; onFunded?: () => void }) {
  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-[#D7E0EC] bg-white px-4 py-3 text-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-[#5A6B85]">Wallet balance</p>
            <p className={`text-lg font-bold text-[#0E1A33] ${DISPLAY}`}>{bal != null ? formatUsdc(bal) : '…'}</p>
            <span className={`text-xs text-[#8190A6] ${MONO}`}>{short(address)}</span>
          </div>
          <button onClick={onLogout} className="text-xs text-[#5A6B85] underline">Log out</button>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <AddFundsButton to={address} onFunded={onFunded} />
          <a className="text-xs text-[#5A6B85] underline" href={FAUCET} target="_blank" rel="noreferrer">Circle faucet ↗</a>
        </div>
      </div>
      {bal === 0n && address && (
        <div className="rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] p-3 text-xs text-[#B45309]">
          Your wallet needs USDC to pay gas on Arc — tap “Add test USDC” above to get started.
        </div>
      )}
    </div>
  )
}

export function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border border-[#D7E0EC] bg-white p-5 shadow-sm">{children}</section>
}

export function Button({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy: boolean }) {
  return (
    <button
      disabled={busy}
      onClick={onClick}
      className="w-full rounded-xl bg-[#1D4ED8] px-4 py-3.5 text-base font-semibold text-white transition active:scale-[0.99] hover:bg-[#1A44BE] disabled:opacity-50"
    >
      {children}
    </button>
  )
}

function Shield({ tone, size }: { tone: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2.5 19.5 5v6c0 4.5-3.1 8.3-7.5 10C7.6 19.3 4.5 15.5 4.5 11V5L12 2.5Z" fill={tone} fillOpacity="0.14" stroke={tone} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9.2 12.2l2 2 3.6-4" stroke={tone} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
