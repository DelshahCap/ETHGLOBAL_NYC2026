'use client'
import { useCallback, useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useEscrowWallet } from '@/lib/useEscrowWallet'
import { claim } from '@/lib/escrow-actions'
import { readUsdcBalance, readWithdrawable, findEscrowFor, type EscrowView, type Party } from '@/lib/reads'
import { formatUsdc } from '@/lib/usdc'
import { FAUCET } from '@/lib/chain'
import type { Violation } from '@/lib/server/store'
import { AddFundsButton } from './AddFundsButton'
import { ContractorBidPanel } from './ContractorBidPanel'
import { LandlordBidsPanel } from './LandlordBidsPanel'

// Desktop dashboard for the landlord and contractor. Both roles do the same
// thing on-chain — watch the escrow and pull their share once it settles
// (withdrawable + withdraw() is a pull-payment) — so this one component serves
// both, parameterized by `role` for copy. Create/fund stay tenant-only.

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '…')
const DISPLAY = 'font-[family-name:var(--font-display)]'
const MONO = 'font-[family-name:var(--font-mono)]'

type Role = Extract<Party, 'landlord' | 'contractor'>

const COPY: Record<Role, { title: string; eyebrow: string }> = {
  landlord: { title: 'Landlord', eyebrow: 'Your building’s rent' },
  contractor: { title: 'Contractor', eyebrow: 'Your repair payment' },
}

export function PartyDashboard({ role }: { role: Role }) {
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { address, getWriteWallet } = useEscrowWallet()
  const [violation, setViolation] = useState<Violation | null>(null)
  const [esc, setEsc] = useState<EscrowView | null>(null)
  const [onchainRole, setOnchainRole] = useState<Party | null>(null)
  const [wd, setWd] = useState<bigint | null>(null)
  const [bal, setBal] = useState<bigint | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/violation').then((r) => r.json()).then(setViolation).catch(() => {})
  }, [])

  const refresh = useCallback(async () => {
    if (!address) return
    const [b, found] = await Promise.all([readUsdcBalance(address), findEscrowFor(address)])
    setBal(b)
    setEsc(found?.escrow ?? null)
    setOnchainRole(found?.role ?? null)
    setWd(found ? await readWithdrawable(address) : null)
  }, [address])

  useEffect(() => {
    if (!address) return
    let on = true
    const tick = () => refresh().catch((e) => { if (on) setMsg(`Couldn’t read chain: ${(e as Error).message}`) })
    tick()
    const t = setInterval(tick, 5000)
    return () => { on = false; clearInterval(t) }
  }, [address, refresh])

  const onWithdraw = async () => {
    setBusy(true); setMsg('Withdrawing…')
    try {
      const w = await getWriteWallet()
      await claim(w)
      await refresh()
      setMsg('Withdrawn to your wallet')
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string }
      setMsg(`Withdraw failed — ${err.shortMessage ?? err.message ?? 'try again'}`)
    } finally {
      setBusy(false)
    }
  }

  const c = COPY[role]
  const amount = role === 'landlord' ? esc?.principal : esc?.contractorFee
  const phase: 'pending' | 'locked' | 'settled' = esc?.settled ? 'settled' : esc?.funded ? 'locked' : 'pending'

  return (
    <main className="min-h-screen bg-[#EAEFF6] font-[family-name:var(--font-body)] text-[#0E1A33]">
      <div className="mx-auto max-w-3xl space-y-5 px-6 pb-16 pt-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield tone="#1D4ED8" size={22} />
            <span className="text-sm font-semibold tracking-tight">RentShield</span>
            <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-[#1D4ED8] ring-1 ring-[#C7D2FE]">{c.title}</span>
          </div>
          <span className="text-xs text-[#5A6B85]">NYC · HPD escrow</span>
        </header>

        {!ready ? (
          <Card><p className="text-sm text-[#5A6B85]">Loading…</p></Card>
        ) : !authenticated ? (
          <Card>
            <p className="mb-3 text-sm text-[#5A6B85]">Log in to view your escrow.</p>
            <Button busy={false} onClick={() => login({ loginMethods: ['email'] })}>Log in with email</Button>
          </Card>
        ) : (
          <>
          <div className="grid gap-5 md:grid-cols-5">
            {/* left: the money */}
            <section className="md:col-span-3 space-y-5">
              <div className="rounded-3xl border border-[#C7D2FE] bg-[#EEF2FD] p-6 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1D4ED8]">{c.eyebrow}</span>
                <div className={`mt-3 flex items-baseline gap-2 ${DISPLAY}`}>
                  <span className="text-5xl font-bold leading-none tracking-tight">{amount != null ? formatUsdc(amount).replace(' USDC', '') : '—'}</span>
                  <span className="text-xl font-semibold text-[#1D4ED8]">USDC</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[#445166]">
                  {StatusLine({ role, phase, esc, onchainRole })}
                </p>
                {esc?.settled && (
                  <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3">
                    <span className="text-xs font-medium text-[#5A6B85]">Ready to withdraw</span>
                    <span className={`text-base font-semibold ${DISPLAY}`} style={{ color: '#047857' }}>{wd != null ? formatUsdc(wd) : '…'}</span>
                  </div>
                )}
              </div>

              <Card>
                {esc == null && (
                  <p className="text-sm text-[#5A6B85]">No escrow is linked to your wallet yet. Once the tenant creates one naming your address, it appears here.</p>
                )}
                {esc && esc.settled && (
                  wd != null && wd > 0n
                    ? <Button busy={busy} onClick={onWithdraw}>Withdraw {formatUsdc(wd)}</Button>
                    : <p className="text-center text-sm text-[#5A6B85]">{role === 'contractor' ? 'Violation was dismissed — no repair payment is due.' : 'Settled — nothing left to withdraw.'}</p>
                )}
                {esc && !esc.settled && (
                  <p className="text-center text-sm text-[#5A6B85]">Nothing to do yet — funds release automatically when HPD’s status changes on-chain.</p>
                )}
                {msg && <p className="mt-3 text-center text-xs text-[#5A6B85]">{msg}</p>}
              </Card>
            </section>

            {/* right: context */}
            <section className="md:col-span-2 space-y-5">
              <ViolationCard violation={violation} />
              <WalletRow address={address} bal={bal} onLogout={logout} email={user?.email?.address} onFunded={refresh} />
            </section>
          </div>

          {role === 'contractor' && <ContractorBidPanel address={address} email={user?.email?.address} />}
          {role === 'landlord' && <LandlordBidsPanel />}
          </>
        )}
      </div>
    </main>
  )
}

function StatusLine({ role, phase, esc, onchainRole }: { role: Role; phase: string; esc: EscrowView | null; onchainRole: Party | null }) {
  if (!esc) return 'Waiting for an escrow that names your wallet.'
  if (onchainRole && onchainRole !== role) {
    return `Heads up: this wallet is the ${onchainRole} on the active escrow, not the ${role}.`
  }
  const id = esc.violationId.toString()
  if (phase === 'pending') return role === 'landlord'
    ? 'Escrow is open — waiting for the tenant to fund this month’s rent.'
    : 'Escrow is open — no funds deposited yet.'
  if (phase === 'locked') return role === 'landlord'
    ? `Rent is held in escrow, earning yield, until HPD violation #${id} closes.`
    : `You’ll be paid when HPD verifies violation #${id} is corrected.`
  return role === 'landlord'
    ? 'The violation resolved on-chain — your rent is ready to withdraw.'
    : 'The violation closed as corrected — your fee is ready to withdraw.'
}

/* ---------- presentational (self-contained; mirrors the tenant view’s look) ---------- */

function ViolationCard({ violation }: { violation: Violation | null }) {
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
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={open ? { backgroundColor: '#FFF7ED', color: '#B45309' } : { backgroundColor: '#ECFDF5', color: '#047857' }}
    >
      {open ? 'Open' : status}
    </span>
  )
}

function WalletRow({ address, bal, onLogout, email, onFunded }: { address?: string; bal: bigint | null; onLogout: () => void; email?: string; onFunded?: () => void }) {
  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-[#D7E0EC] bg-white px-4 py-3 text-sm">
        {email && <p className="mb-1 text-xs text-[#5A6B85]">{email}</p>}
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
          Your wallet needs USDC to pay gas on Arc — tap “Add test USDC” above.
        </div>
      )}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border border-[#D7E0EC] bg-white p-5 shadow-sm">{children}</section>
}

function Button({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy: boolean }) {
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
