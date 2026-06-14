'use client'
import { useEffect, useState } from 'react'
import { STATUS_TO_NUM, NUM_TO_STATUS, type StatusName } from '@/lib/contracts'

export function ViolationEditor() {
  const [id, setId] = useState('')
  const [v, setV] = useState({ violationId: '999999', address: '123 Demo St', description: 'No heat/hot water', status: 'Open' as StatusName, date: '2026-06-14' })
  const [msg, setMsg] = useState('')

  useEffect(() => { fetch('/api/violation').then((r) => r.json()).then((d) => { if (d) setV(d) }) }, [])

  const saveStore = async () => {
    const r = await fetch('/api/violation', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(v) })
    setMsg(r.ok ? 'store updated' : 'store error')
  }
  const saveAndPost = async () => {
    await saveStore()
    if (id === '' || v.status === 'Open') { setMsg('store updated (no terminal on-chain post)'); return }
    const r = await fetch('/api/tx/updateStatus', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status: STATUS_TO_NUM[v.status] }) })
    const d = await r.json()
    setMsg(r.ok ? `store + on-chain updateStatus ok (${d.hash})` : `on-chain error: ${d.error}`)
  }

  return (
    <section className="rounded border border-slate-800 p-4 space-y-2">
      <h2 className="font-semibold">Mock violation (shared store)</h2>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label>violationId <input className="ml-1 bg-slate-800 px-1" value={v.violationId} onChange={(e) => setV({ ...v, violationId: e.target.value })} /></label>
        <label>date <input className="ml-1 bg-slate-800 px-1" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></label>
        <label className="col-span-2">address <input className="ml-1 w-2/3 bg-slate-800 px-1" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} /></label>
        <label className="col-span-2">description <input className="ml-1 w-2/3 bg-slate-800 px-1" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></label>
        <label>status
          <select className="ml-1 bg-slate-800 px-1" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as StatusName })}>
            {NUM_TO_STATUS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>escrow id (for on-chain) <input className="ml-1 w-20 bg-slate-800 px-1" value={id} onChange={(e) => setId(e.target.value)} /></label>
      </div>
      <div className="flex gap-2">
        <button onClick={saveStore} className="rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600">Save store only</button>
        <button onClick={saveAndPost} className="rounded bg-indigo-600 px-2 py-1 text-xs hover:bg-indigo-500">Save store + post status on-chain</button>
      </div>
      {msg && <p className="text-xs text-slate-400">{msg}</p>}
    </section>
  )
}
