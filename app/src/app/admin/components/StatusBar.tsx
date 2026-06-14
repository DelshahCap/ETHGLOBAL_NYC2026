'use client'
import { useEffect, useState } from 'react'
import { readConfig, readYieldInfo } from '@/lib/reads'
import { formatUsdc } from '@/lib/usdc'
import { EXPLORER } from '@/lib/chain'
import { VAULT } from '@/lib/contracts'

export function StatusBar() {
  const [cfg, setCfg] = useState<Awaited<ReturnType<typeof readConfig>> | null>(null)
  const [yieldInfo, setYieldInfo] = useState<Awaited<ReturnType<typeof readYieldInfo>> | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let on = true
    const tick = async () => {
      try {
        const [c, y] = await Promise.all([readConfig(), readYieldInfo()])
        if (on) { setCfg(c); setYieldInfo(y); setErr(null) }
      } catch (e) { if (on) setErr((e as Error).message) }
    }
    tick(); const t = setInterval(tick, 5000)
    return () => { on = false; clearInterval(t) }
  }, [])

  return (
    <section className="rounded border border-slate-800 p-4 text-sm">
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span>Chain <b>5042002</b></span>
        <a className="text-indigo-400 underline" href={`${EXPLORER}/address/${VAULT}`} target="_blank">Vault ↗</a>
        {cfg && <><span>oracle <code>{short(cfg.oracle)}</code></span><span>owner <code>{short(cfg.owner)}</code></span><span>nextId <b>{cfg.nextEscrowId}</b></span></>}
        {yieldInfo && <span>pool {formatUsdc(yieldInfo.totalAssets)} / {yieldInfo.totalShares.toString()} shares</span>}
      </div>
      {err && <p className="mt-2 text-red-400">read error: {err}</p>}
    </section>
  )
}
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
