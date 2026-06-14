'use client'
import { useCallback, useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useEscrowWallet } from '@/lib/useEscrowWallet'
import { createEscrow, fundEscrow, claim } from '@/lib/escrow-actions'
import { readUsdcBalance, readWithdrawable, findEscrowFor, type EscrowView, type Party } from '@/lib/reads'
import { toMicro, formatUsdc } from '@/lib/usdc'
import { DEMO, DEMO_PARTIES_SET } from '@/lib/demo'
import { FAUCET } from '@/lib/chain'
import type { Violation } from '@/lib/server/store'

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '…')

export default function TenantView() {
  const [violation, setViolation] = useState<Violation | null>(null)
  useEffect(() => {
    fetch('/api/violation').then((r) => r.json()).then(setViolation).catch(() => {})
  }, [])
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID

  return (
    <main className="mx-auto max-w-md space-y-5 p-5">
      <h1 className="text-2xl font-bold">Your apartment</h1>

      <section className="rounded-lg border border-slate-800 p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-300">HPD violation</h2>
        {violation ? (
          <div className="text-sm">
            <p className="font-medium">#{violation.violationId} · {violation.address}</p>
            <p className="text-slate-400">{violation.description}</p>
            <p className="mt-1">status: <b>{violation.status}</b></p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No violation on file.</p>
        )}
      </section>

      {appId ? (
        <TenantPortal />
      ) : (
        <p className="rounded-lg border border-slate-800 p-4 text-sm text-slate-500">
          Sign-in unavailable — NEXT_PUBLIC_PRIVY_APP_ID is not set.
        </p>
      )}

      <p className="text-xs text-slate-500">
        Your rent is held in escrow while the HPD violation is open. Yield accrues to you and
        becomes claimable once the violation is resolved on-chain.
      </p>
    </main>
  )
}

function TenantPortal() {
  const { ready, authenticated, login, logout } = usePrivy()
  const { address, getWriteWallet } = useEscrowWallet()
  const [bal, setBal] = useState<bigint | null>(null)
  const [esc, setEsc] = useState<EscrowView | null>(null)
  const [role, setRole] = useState<Party | null>(null)
  const [wd, setWd] = useState<bigint | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [violationId, setViolationId] = useState(DEMO.violationId)

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
    const tick = () => refresh().catch((e) => { if (on) setMsg(`read error: ${(e as Error).message}`) })
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
      setMsg(`${label} ✓`)
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string }
      setMsg(`${label} ✗ ${err.shortMessage ?? err.message ?? 'failed'}`)
    } finally {
      setBusy(false)
    }
  }

  const onCreate = run('Create escrow', async () => {
    if (!address) throw new Error('No wallet connected')
    if (!/^\d+$/.test(violationId.trim())) throw new Error('Enter a numeric HPD violation ID')
    const w = await getWriteWallet()
    await createEscrow(w, {
      tenant: address,
      landlord: DEMO.landlord,
      contractor: DEMO.contractor,
      violationId: violationId.trim(),
      contractorFee: toMicro(DEMO.contractorFee),
    })
  })
  const onFund = run('Fund rent', async () => {
    if (!esc) throw new Error('No escrow')
    const w = await getWriteWallet()
    await fundEscrow(w, BigInt(esc.id), toMicro(DEMO.principal))
  })
  const onClaim = run('Claim yield', async () => {
    const w = await getWriteWallet()
    await claim(w)
  })

  if (!ready) return <Card><p className="text-sm text-slate-400">Loading…</p></Card>
  if (!authenticated)
    return (
      <Card>
        <button
          onClick={login}
          className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold hover:bg-emerald-500"
        >
          Log in to your apartment
        </button>
      </Card>
    )

  return (
    <Card>
      <div className="flex items-center justify-between text-sm">
        <span>Wallet <code className="text-slate-300">{short(address)}</code></span>
        <button onClick={logout} className="text-xs text-slate-400 underline">log out</button>
      </div>
      <p className="text-sm">USDC (gas + rent): <b>{bal != null ? formatUsdc(bal) : '…'}</b></p>

      {bal === 0n && address && (
        <div className="rounded-md bg-amber-500/10 p-3 text-xs text-amber-300">
          Your wallet has no USDC. On Arc, USDC is also the gas token — fund this address before transacting:
          <br /><code className="break-all">{address}</code>
          <br /><a className="underline" href={FAUCET} target="_blank" rel="noreferrer">Open Circle faucet ↗</a>
        </div>
      )}

      {!DEMO_PARTIES_SET && esc == null && (
        <p className="text-xs text-amber-300">
          Demo landlord/contractor not configured (set NEXT_PUBLIC_DEMO_LANDLORD / _CONTRACTOR).
        </p>
      )}

      {esc == null && (
        <div className="space-y-2">
          <label className="block text-sm text-slate-300">
            HPD violation ID
            <input
              value={violationId}
              onChange={(e) => setViolationId(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 18100032"
              className="mt-1 w-full rounded-md bg-slate-800 px-3 py-2 text-base"
            />
            <span className="mt-1 block text-xs text-slate-500">
              The open violation on your apartment — the oracle watches this ID to release your rent.
            </span>
          </label>
          <Action busy={busy} onClick={onCreate}>Create my rent escrow</Action>
        </div>
      )}

      {esc && !esc.funded && role === 'tenant' && (
        <Action busy={busy} onClick={onFund}>Fund rent — {DEMO.principal} USDC</Action>
      )}

      {esc && esc.funded && !esc.settled && (
        <div className="rounded-md bg-slate-800/60 p-3 text-sm">
          <p>🔒 Rent locked: <b>{formatUsdc(esc.principal)}</b></p>
          <p className="text-slate-400">Status: {esc.statusName} — earning yield until HPD resolves the violation.</p>
        </div>
      )}

      {esc && esc.settled && (
        <div className="space-y-2 rounded-md bg-emerald-500/10 p-3 text-sm">
          <p>✅ Resolved: <b>{esc.statusName}</b></p>
          <p>Yield accrued to you: <b>{wd != null ? formatUsdc(wd) : '…'}</b></p>
          {wd != null && wd > 0n && <Action busy={busy} onClick={onClaim}>Claim my yield</Action>}
        </div>
      )}

      {msg && <p className="text-xs text-slate-400">{msg}</p>}
    </Card>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="space-y-3 rounded-lg border border-slate-800 p-4">{children}</section>
}

function Action({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy: boolean }) {
  return (
    <button
      disabled={busy}
      onClick={onClick}
      className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold hover:bg-indigo-500 disabled:opacity-50"
    >
      {children}
    </button>
  )
}
