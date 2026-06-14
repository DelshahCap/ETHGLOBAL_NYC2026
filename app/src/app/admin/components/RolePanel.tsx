'use client'
import { useEffect, useState } from 'react'
import { readUsdcBalance, readWithdrawable } from '@/lib/reads'
import { formatUsdc } from '@/lib/usdc'
import { FAUCET } from '@/lib/chain'

export type Roles = Record<'tenant' | 'landlord' | 'contractor' | 'oracle', `0x${string}`>

export function RolePanel({ roles }: { roles: Roles | null }) {
  const [rows, setRows] = useState<Record<string, { bal: bigint; wd: bigint }>>({})
  useEffect(() => {
    if (!roles) return
    let on = true
    const tick = async () => {
      const entries = await Promise.all(
        Object.entries(roles).map(async ([k, addr]) => [k, { bal: await readUsdcBalance(addr), wd: await readWithdrawable(addr) }] as const),
      )
      if (on) setRows(Object.fromEntries(entries))
    }
    tick(); const t = setInterval(tick, 5000)
    return () => { on = false; clearInterval(t) }
  }, [roles])

  if (!roles) return <p className="text-slate-500">Loading roles… (set the 4 key env vars)</p>
  return (
    <section className="rounded border border-slate-800 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Roles</h2>
        <a className="text-xs text-indigo-400 underline" href={FAUCET} target="_blank">Circle faucet ↗</a>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-slate-400"><tr><th>Role</th><th>Address</th><th>USDC (gas)</th><th>Withdrawable</th></tr></thead>
        <tbody>
          {Object.entries(roles).map(([role, addr]) => (
            <tr key={role} className="border-t border-slate-800">
              <td className="py-1 capitalize">{role}</td>
              <td><code>{addr.slice(0, 8)}…{addr.slice(-6)}</code></td>
              <td className={rows[role] && rows[role].bal === 0n ? 'text-red-400' : ''}>{rows[role] ? formatUsdc(rows[role].bal) : '…'}</td>
              <td>{rows[role] ? formatUsdc(rows[role].wd) : '…'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
