'use client'
import { useState } from 'react'
import { readEscrow, type EscrowView } from '@/lib/reads'
import { toMicro, formatUsdc } from '@/lib/usdc'
import { STATUS_TO_NUM } from '@/lib/contracts'
import type { Roles } from './RolePanel'

async function tx(action: string, body: Record<string, unknown>) {
  const r = await fetch(`/api/tx/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error ?? 'tx failed')
  return d
}

export function LifecycleRunner({ roles }: { roles: Roles | null }) {
  const [id, setId] = useState('')
  const [amount, setAmount] = useState('1')
  const [fee, setFee] = useState('0')
  const [yieldAmt, setYieldAmt] = useState('0.1')
  const [violationId, setViolationId] = useState('999999')
  const [esc, setEsc] = useState<EscrowView | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const say = (m: string) => setLog((l) => [m, ...l].slice(0, 20))
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true)
    try { const d = await fn(); say(`✓ ${label}: ${JSON.stringify(d)}`) }
    catch (e) { say(`✗ ${label}: ${(e as Error).message}`) }
    finally { setBusy(false) }
  }
  const refresh = async () => { if (id !== '') setEsc(await readEscrow(Number(id))) }

  if (!roles) return null
  return (
    <section className="rounded border border-slate-800 p-4 space-y-3">
      <h2 className="font-semibold">Lifecycle runner</h2>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <label>id <input className="ml-1 w-20 bg-slate-800 px-1" value={id} onChange={(e) => setId(e.target.value)} /></label>
        <label>amount <input className="ml-1 w-20 bg-slate-800 px-1" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label>fee <input className="ml-1 w-20 bg-slate-800 px-1" value={fee} onChange={(e) => setFee(e.target.value)} /></label>
        <label>violationId <input className="ml-1 w-24 bg-slate-800 px-1" value={violationId} onChange={(e) => setViolationId(e.target.value)} /></label>
        <label>yield <input className="ml-1 w-20 bg-slate-800 px-1" value={yieldAmt} onChange={(e) => setYieldAmt(e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Btn busy={busy} onClick={() => run('createEscrow', async () => {
          const d = await tx('createEscrow', { role: 'landlord', tenant: roles.tenant, landlord: roles.landlord, contractor: roles.contractor, violationId, contractorFee: toMicro(fee).toString() })
          if (d.id != null) setId(String(d.id)); return d
        })}>1. createEscrow</Btn>
        <Btn busy={busy} onClick={() => run('fund (approve+fund)', () => tx('fund', { role: 'tenant', id, amount: toMicro(amount).toString() }))}>2. fund</Btn>
        <Btn busy={busy} onClick={() => run('simulateYield', () => tx('simulateYield', { role: 'landlord', amount: toMicro(yieldAmt).toString() }))}>3. yield</Btn>
        <Btn busy={busy} onClick={() => run('updateStatus Closed', () => tx('updateStatus', { id, status: STATUS_TO_NUM.Closed }))}>4a. Closed</Btn>
        <Btn busy={busy} onClick={() => run('updateStatus Dismissed', () => tx('updateStatus', { id, status: STATUS_TO_NUM.Dismissed }))}>4b. Dismissed</Btn>
        <Btn busy={busy} onClick={() => run('withdraw tenant', () => tx('withdraw', { role: 'tenant' }))}>5a. withdraw tenant</Btn>
        <Btn busy={busy} onClick={() => run('withdraw landlord', () => tx('withdraw', { role: 'landlord' }))}>5b. withdraw landlord</Btn>
        <Btn busy={busy} onClick={() => run('withdraw contractor', () => tx('withdraw', { role: 'contractor' }))}>5c. withdraw contractor</Btn>
        <Btn busy={busy} onClick={() => run('refresh', refresh)}>↻ read escrow</Btn>
      </div>
      {esc && (
        <table className="w-full text-xs">
          <tbody>
            {Object.entries({
              id: esc.id, status: `${esc.status} (${esc.statusName})`, funded: String(esc.funded), settled: String(esc.settled),
              violationId: esc.violationId.toString(), principal: formatUsdc(esc.principal), contractorFee: formatUsdc(esc.contractorFee),
              shares: esc.shares.toString(), tenant: esc.tenant, landlord: esc.landlord, contractor: esc.contractor,
            }).map(([k, v]) => (<tr key={k} className="border-t border-slate-800"><td className="py-0.5 pr-3 text-slate-400">{k}</td><td><code>{String(v)}</code></td></tr>))}
          </tbody>
        </table>
      )}
      <pre className="max-h-40 overflow-auto rounded bg-black/40 p-2 text-xs">{log.join('\n')}</pre>
    </section>
  )
}

function Btn({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy: boolean }) {
  return <button disabled={busy} onClick={onClick} className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50">{children}</button>
}
