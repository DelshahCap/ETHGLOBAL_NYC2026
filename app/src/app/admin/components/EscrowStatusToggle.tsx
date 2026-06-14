'use client'
import { useCallback, useEffect, useState } from 'react'
import { readConfig, readEscrow, type EscrowView } from '@/lib/reads'

// The demo's HPD status control, moved out of the tenant tab. Flipping the most
// recent escrow's violation Open -> Closed has the server ORACLE key settle it
// on-chain (updateStatus). The tenant/landlord/contractor tabs poll the chain, so
// they react to the settlement on their own — no cross-tab wiring needed. It also
// flips the shared violation store to "Closed" so every portal's card updates.
export function EscrowStatusToggle() {
  const [esc, setEsc] = useState<EscrowView | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    try {
      const { nextEscrowId } = await readConfig()
      if (nextEscrowId <= 0) { setEsc(null); return }
      setEsc(await readEscrow(nextEscrowId - 1))
    } catch (e) {
      setMsg(`read error: ${(e as Error).message}`)
    }
  }, [])

  useEffect(() => {
    let on = true
    const tick = () => { if (on) void load() }
    tick()
    const t = setInterval(tick, 5000)
    return () => { on = false; clearInterval(t) }
  }, [load])

  const closed = !!esc?.settled

  const onToggle = async () => {
    if (!esc || closed) return
    setBusy(true); setMsg('Closing violation & settling escrow…')
    try {
      const r = await fetch('/api/tx/updateStatus', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: String(esc.id), status: 1 }), // 1 = Closed (Settled)
      })
      const d = (await r.json()) as { hash?: string; error?: string }
      if (!r.ok) throw new Error(d.error ?? 'settle failed')
      // Reflect in the shared store so all portals' violation cards show Closed.
      const cur = await fetch('/api/violation').then((x) => x.json()).catch(() => null)
      if (cur?.violationId) {
        await fetch('/api/violation', {
          method: 'PUT', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...cur, status: 'Closed' }),
        }).catch(() => {})
      }
      setMsg(`Settled — escrow #${esc.id} closed (${d.hash?.slice(0, 10)}…). Funds released to parties.`)
      await load()
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded border border-slate-800 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">HPD violation status</h2>
        {esc && <span className="text-xs text-slate-400">escrow #{esc.id} · violation #{esc.violationId.toString()}</span>}
      </div>
      {!esc ? (
        <p className="text-sm text-slate-500">No escrow yet — the tenant hasn’t created one.</p>
      ) : (
        <div className="flex items-center gap-3">
          <span className={`text-sm font-semibold ${closed ? 'text-emerald-400' : 'text-amber-400'}`}>{closed ? 'Closed' : 'Open'}</span>
          <button
            type="button"
            role="switch"
            aria-checked={closed}
            aria-label="Toggle HPD violation status"
            disabled={busy || closed || !esc.funded}
            onClick={onToggle}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: closed ? '#047857' : '#B45309' }}
          >
            <span className="inline-block h-5 w-5 rounded-full bg-white transition-transform" style={{ transform: closed ? 'translateX(22px)' : 'translateX(2px)' }} />
          </button>
          <span className="text-xs text-slate-400">
            {closed
              ? 'Settled — contractor fee, landlord principal, tenant interest are now withdrawable.'
              : esc.funded ? 'Flip to Closed to settle and release the escrow.' : 'Waiting for the tenant to fund the escrow.'}
          </span>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-slate-400">{msg}</p>}
    </section>
  )
}
