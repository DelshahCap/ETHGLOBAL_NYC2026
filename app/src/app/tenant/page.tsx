'use client'
import { useEffect, useState } from 'react'
import { readEscrow, readWithdrawable, type EscrowView } from '@/lib/reads'
import { formatUsdc } from '@/lib/usdc'
import type { Violation } from '@/lib/server/store'

export default function TenantView() {
  const [violation, setViolation] = useState<Violation | null>(null)
  const [clock, setClock] = useState<string>('')
  const [id, setId] = useState('0')
  const [esc, setEsc] = useState<EscrowView | null>(null)
  const [wd, setWd] = useState<bigint | null>(null)

  useEffect(() => {
    fetch('/api/violation').then((r) => r.json()).then(setViolation)
    fetch('/api/clock').then((r) => r.json()).then((d) => setClock(d?.now ?? ''))
  }, [])
  useEffect(() => {
    let on = true
    const tick = async () => {
      try {
        const e = await readEscrow(Number(id)); if (!on) return
        setEsc(e); setWd(await readWithdrawable(e.tenant))
      } catch { /* no such escrow yet */ }
    }
    tick(); const t = setInterval(tick, 5000)
    return () => { on = false; clearInterval(t) }
  }, [id])

  return (
    <main className="mx-auto max-w-xl space-y-5 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Your apartment</h1>
        {clock && <span className="text-xs text-slate-400">demo date: {clock}</span>}
      </div>
      <label className="text-sm">escrow id <input className="ml-1 w-16 bg-slate-800 px-1" value={id} onChange={(e) => setId(e.target.value)} /></label>

      <section className="rounded border border-slate-800 p-4">
        <h2 className="mb-1 font-semibold">HPD violation</h2>
        {violation ? (
          <div className="text-sm">
            <p>#{violation.violationId} · {violation.address}</p>
            <p className="text-slate-400">{violation.description}</p>
            <p className="mt-1">status: <b>{violation.status}</b>{violation.date ? ` · ${violation.date}` : ''}</p>
          </div>
        ) : <p className="text-slate-500">No violation on file.</p>}
      </section>

      <section className="rounded border border-slate-800 p-4 text-sm">
        <h2 className="mb-1 font-semibold">Your escrow</h2>
        {esc ? (
          <div className="space-y-1">
            <p>on-chain status: <b>{esc.statusName}</b> · {esc.settled ? 'settled' : esc.funded ? 'funded & locked' : 'awaiting funding'}</p>
            <p>rent locked: <b>{formatUsdc(esc.principal)}</b></p>
            <p>yield accruing to you{esc.settled ? ' (claimable)' : ''}: <b>{wd != null ? formatUsdc(wd) : '…'}</b></p>
          </div>
        ) : <p className="text-slate-500">No escrow at id {id}.</p>}
        <p className="mt-2 text-xs text-slate-500">Read-only view. Funding/withdrawing comes in the tenant portal.</p>
      </section>
    </main>
  )
}
