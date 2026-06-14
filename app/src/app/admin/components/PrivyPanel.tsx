'use client'
import { useEffect, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createWalletClient, custom } from 'viem'
import { arcTestnet } from '@/lib/chain'
import { VAULT, escrowVaultAbi } from '@/lib/contracts'
import { readUsdcBalance, readWithdrawable } from '@/lib/reads'
import { formatUsdc } from '@/lib/usdc'

// Inner component — only rendered when PrivyProvider is present in the tree.
// Keeps all Privy hooks inside the provider boundary.
function PrivyPanelInner() {
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const [bal, setBal] = useState<bigint | null>(null)
  const [wd, setWd] = useState<bigint | null>(null)
  const [msg, setMsg] = useState('')

  const addr = wallets[0]?.address as `0x${string}` | undefined
  useEffect(() => {
    if (!addr) return
    let cancelled = false
    Promise.all([readUsdcBalance(addr), readWithdrawable(addr)])
      .then(([b, w]) => { if (!cancelled) { setBal(b); setWd(w) } })
      .catch((e) => { if (!cancelled) setMsg(`read error: ${(e as Error).message}`) })
    return () => { cancelled = true }
  }, [addr])

  const withdraw = async () => {
    try {
      const w = wallets[0]; if (!w) throw new Error('no wallet')
      const provider = await w.getEthereumProvider()
      const client = createWalletClient({ account: addr!, chain: arcTestnet, transport: custom(provider) })
      const hash = await client.writeContract({ address: VAULT, abi: escrowVaultAbi, functionName: 'withdraw', args: [] })
      setMsg(`withdraw sent: ${hash}`)
    } catch (e) { setMsg(`error: ${(e as Error).message}`) }
  }

  return (
    <section className="rounded border border-slate-800 p-4 space-y-2 text-sm">
      <h2 className="font-semibold">Privy (real embedded wallet)</h2>
      {!ready ? <p>loading…</p> : !authenticated ? (
        <button onClick={login} className="rounded bg-emerald-600 px-3 py-1 hover:bg-emerald-500">Log in with Privy</button>
      ) : (
        <div className="space-y-1">
          <p>user: <code>{user?.id?.slice(0, 16)}…</code></p>
          <p>wallet: <code>{addr ?? '…'}</code></p>
          <p>USDC: {bal != null ? formatUsdc(bal) : '…'} · withdrawable: {wd != null ? formatUsdc(wd) : '…'}</p>
          <div className="flex gap-2">
            <button onClick={withdraw} className="rounded bg-indigo-600 px-2 py-1 hover:bg-indigo-500">withdraw() as this wallet</button>
            <button onClick={logout} className="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600">log out</button>
          </div>
        </div>
      )}
      {msg && <p className="text-xs text-slate-400">{msg}</p>}
    </section>
  )
}

// Outer guard — checks for NEXT_PUBLIC_PRIVY_APP_ID before mounting the inner
// component. When appId is unset, PrivyProvider is not in the tree (see
// src/app/providers.tsx), so calling usePrivy/useWallets would use context
// defaults rather than live state. Rendering nothing meaningful is cleaner.
export function PrivyPanel() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  if (!appId) {
    return (
      <section className="rounded border border-slate-800 p-4 text-sm text-slate-500">
        Privy disabled (set NEXT_PUBLIC_PRIVY_APP_ID to enable the real-wallet path).
      </section>
    )
  }
  return <PrivyPanelInner />
}
