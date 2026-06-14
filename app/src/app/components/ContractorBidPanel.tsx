'use client'
import { useCallback, useEffect, useState } from 'react'
import { VIOLATIONS, violationLabel } from '@/lib/violations'
import { fetchBids, submitBid, type Bid } from '@/lib/bids'

// Contractor: bid a fee to fix an open violation. Bids go to the landlord to
// accept; the accepted bid's fee is what the contractor earns from the escrow
// when the violation closes.
export function ContractorBidPanel({ address, email }: { address?: string; email?: string }) {
  const [row, setRow] = useState<number>(VIOLATIONS[0]?.row ?? 0)
  const [fee, setFee] = useState('0.3')
  const [mine, setMine] = useState<Bid[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    if (!address) return
    const all = await fetchBids()
    setMine(all.filter((b) => b.contractor.toLowerCase() === address.toLowerCase()))
  }, [address])

  useEffect(() => {
    let on = true
    const tick = () => { if (on) void load() }
    tick()
    const t = setInterval(tick, 5000)
    return () => { on = false; clearInterval(t) }
  }, [load])

  const onSubmit = async () => {
    if (!address) { setMsg('Connect a wallet first'); return }
    if (!(Number(fee) > 0)) { setMsg('Enter a fee greater than 0'); return }
    const v = VIOLATIONS.find((x) => x.row === row)
    if (!v) return
    setBusy(true); setMsg('')
    try {
      await submitBid({ row, violationId: v.open.violationId, contractor: address, contractorEmail: email, fee })
      setMsg('Bid submitted')
      await load()
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-[#D7E0EC] bg-white p-5 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5A6B85]">Bid on a repair</h2>

      <div className="mt-3 space-y-3">
        <label className="block text-sm font-medium">
          Violation
          <select
            value={row}
            onChange={(e) => setRow(Number(e.target.value))}
            className="mt-1.5 w-full rounded-xl border border-[#D7E0EC] bg-white px-4 py-3 text-base outline-none focus:border-[#1D4ED8]"
          >
            {VIOLATIONS.map((v) => (
              <option key={v.row} value={v.row}>{violationLabel(v)} — #{v.open.violationId}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Your fee (USDC)
          <input
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            inputMode="decimal"
            className="mt-1.5 w-full rounded-xl border border-[#D7E0EC] bg-white px-4 py-3 text-base outline-none focus:border-[#1D4ED8] font-[family-name:var(--font-mono)]"
          />
        </label>
        <button
          onClick={onSubmit}
          disabled={busy || !address}
          className="w-full rounded-xl bg-[#1D4ED8] px-4 py-3 text-base font-semibold text-white transition hover:bg-[#1A44BE] disabled:opacity-50"
        >
          {busy ? 'Submitting…' : 'Submit bid'}
        </button>
        {msg && <p className="text-center text-xs text-[#5A6B85]">{msg}</p>}
      </div>

      {mine.length > 0 && (
        <div className="mt-4 border-t border-[#EDF1F7] pt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#5A6B85]">Your bids</p>
          <ul className="space-y-1 text-sm">
            {mine.map((b) => (
              <li key={b.id} className="flex items-center justify-between">
                <span>#{b.violationId} · {b.fee} USDC</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${b.status === 'accepted' ? 'bg-[#ECFDF5] text-[#047857]' : 'bg-[#F1F5F9] text-[#5A6B85]'}`}>
                  {b.status === 'accepted' ? 'Accepted' : 'Pending'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
