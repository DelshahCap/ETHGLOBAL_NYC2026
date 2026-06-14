'use client'
import { useState } from 'react'
import { publicClient } from '@/lib/chain'
import { VAULT, escrowVaultAbi } from '@/lib/contracts'

// Read-any: pick a view function, supply comma-separated args, see the raw result.
const READS = ['nextEscrowId', 'oracle', 'owner', 'usdc', 'yieldSource', 'withdrawable', 'escrows'] as const

export function FunctionTester() {
  const [fn, setFn] = useState<(typeof READS)[number]>('nextEscrowId')
  const [args, setArgs] = useState('')
  const [out, setOut] = useState('')

  const call = async () => {
    try {
      const parsed = args.trim() === '' ? [] : args.split(',').map((a) => {
        const s = a.trim()
        return /^\d+$/.test(s) ? BigInt(s) : s
      })
      const res = await publicClient.readContract({ address: VAULT, abi: escrowVaultAbi, functionName: fn, args: parsed as never })
      setOut(JSON.stringify(res, (_k, val) => (typeof val === 'bigint' ? val.toString() : val), 2))
    } catch (e) { setOut(`error: ${(e as Error).message}`) }
  }

  return (
    <section className="rounded border border-slate-800 p-4 space-y-2">
      <h2 className="font-semibold">Generic read tester</h2>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select className="bg-slate-800 px-1" value={fn} onChange={(e) => setFn(e.target.value as never)}>
          {READS.map((r) => <option key={r}>{r}</option>)}
        </select>
        <input className="w-64 bg-slate-800 px-1" placeholder="args, comma-separated (e.g. 0 or 0xabc…)" value={args} onChange={(e) => setArgs(e.target.value)} />
        <button onClick={call} className="rounded bg-indigo-600 px-2 py-1 text-xs hover:bg-indigo-500">call</button>
      </div>
      <p className="text-xs text-slate-500">Writes (createEscrow/fund/withdraw/updateStatus/setOracle/setYieldSource) run via the Lifecycle runner / API routes so they sign with the right role key.</p>
      <pre className="max-h-40 overflow-auto rounded bg-black/40 p-2 text-xs">{out}</pre>
    </section>
  )
}
