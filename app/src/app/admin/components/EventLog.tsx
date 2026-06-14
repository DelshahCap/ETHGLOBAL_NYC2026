'use client'
import { useEffect, useState } from 'react'
import { publicClient } from '@/lib/chain'
import { VAULT, escrowVaultAbi } from '@/lib/contracts'

export function EventLog() {
  const [lines, setLines] = useState<string[]>([])
  useEffect(() => {
    const unwatch = publicClient.watchContractEvent({
      address: VAULT, abi: escrowVaultAbi,
      onLogs: (logs) => setLines((prev) => [
        ...logs.map((l) => `${l.eventName} ${JSON.stringify(l.args, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}`),
        ...prev,
      ].slice(0, 50)),
      onError: (e) => setLines((p) => [`watch error: ${e.message}`, ...p]),
    })
    return () => unwatch()
  }, [])
  return (
    <section className="rounded border border-slate-800 p-4">
      <h2 className="mb-2 font-semibold">Live events</h2>
      <pre className="max-h-48 overflow-auto rounded bg-black/40 p-2 text-xs">{lines.join('\n') || 'waiting for events…'}</pre>
    </section>
  )
}
