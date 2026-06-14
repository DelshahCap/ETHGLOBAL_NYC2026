'use client'
import { useState } from 'react'
import { fundWallet } from '@/lib/faucet'

// Shared "Add test USDC" button used in the tenant/landlord/contractor wallet
// rows. Calls the server faucet, then triggers the caller's refresh so the new
// balance shows immediately (rather than waiting for the next poll).
export function AddFundsButton({
  to, amount = 5, onFunded,
}: {
  to?: string
  amount?: number
  onFunded?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const go = async () => {
    if (!to) return
    setBusy(true); setMsg('')
    try {
      await fundWallet(to, amount)
      setMsg(`+${amount} USDC sent`)
      onFunded?.()
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={go}
        disabled={busy || !to}
        className="rounded-lg bg-[#1D4ED8] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1A44BE] disabled:opacity-50"
      >
        {busy ? 'Adding…' : `Add ${amount} test USDC`}
      </button>
      {msg && <span className="text-xs text-[#5A6B85]">{msg}</span>}
    </div>
  )
}
