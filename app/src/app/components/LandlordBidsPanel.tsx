'use client'
import { useCallback, useEffect, useState } from 'react'
import { VIOLATIONS } from '@/lib/violations'
import { fetchBids, acceptBid, type Bid } from '@/lib/bids'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const descFor = (row: number) => VIOLATIONS.find((v) => v.row === row)?.description ?? `Violation ${row}`

// Landlord: review contractor bids and accept one per violation. The accepted
// contractor + fee then flow into the tenant's escrow, and that contractor is
// paid their fee from the escrow once the violation closes.
export function LandlordBidsPanel() {
  const [bids, setBids] = useState<Bid[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => { setBids(await fetchBids()) }, [])

  useEffect(() => {
    let on = true
    const tick = () => { if (on) void load() }
    tick()
    const t = setInterval(tick, 5000)
    return () => { on = false; clearInterval(t) }
  }, [load])

  const onAccept = async (id: string) => {
    setBusyId(id); setMsg('')
    try {
      await acceptBid(id)
      setMsg('Bid accepted — it will fund the contractor when the violation closes')
      await load()
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="rounded-2xl border border-[#D7E0EC] bg-white p-5 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5A6B85]">Contractor bids</h2>

      {bids.length === 0 ? (
        <p className="mt-2 text-sm text-[#5A6B85]">No bids yet. Contractors’ repair bids will appear here to accept.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {bids.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#EDF1F7] px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{descFor(b.row)}</p>
                <p className="text-xs text-[#5A6B85]">
                  #{b.violationId} · {b.fee} USDC · <span className="font-[family-name:var(--font-mono)]">{short(b.contractor)}</span>
                </p>
              </div>
              {b.status === 'accepted' ? (
                <span className="shrink-0 rounded-full bg-[#ECFDF5] px-2.5 py-1 text-xs font-semibold text-[#047857]">Accepted</span>
              ) : (
                <button
                  onClick={() => onAccept(b.id)}
                  disabled={busyId === b.id}
                  className="shrink-0 rounded-lg bg-[#1D4ED8] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1A44BE] disabled:opacity-50"
                >
                  {busyId === b.id ? 'Accepting…' : 'Accept'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="mt-2 text-xs text-[#5A6B85]">{msg}</p>}
    </section>
  )
}
