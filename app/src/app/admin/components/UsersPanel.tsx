'use client'
import { useCallback, useEffect, useState } from 'react'
import { fetchAllProfiles, ROLE_LABELS, type Profile } from '@/lib/profile'

// Lists everyone who has signed up via the Privy email flow, with the role they
// chose. Backed by /api/profile?all=1 (the KV profile index). Empty in local dev
// or if Vercel KV isn't provisioned, since the in-memory store doesn't persist.
export function UsersPanel() {
  const [users, setUsers] = useState<Profile[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try { setUsers(await fetchAllProfiles()) } finally { setBusy(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <section className="rounded border border-slate-800 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Users <span className="text-slate-500">({users?.length ?? 0})</span></h2>
        <button onClick={() => void load()} disabled={busy} className="text-xs text-indigo-400 underline disabled:opacity-50">
          {busy ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {users == null ? (
        <p className="text-slate-500">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-slate-500">
          No sign-ups yet. (If users have signed up but none show, Vercel KV likely isn’t configured — the
          in-memory store doesn’t persist across requests.)
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400"><tr><th>Email</th><th>Role</th><th>Wallet</th><th>Privy ID</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.userId} className="border-t border-slate-800">
                <td className="py-1">{u.email ?? <span className="text-slate-500">—</span>}</td>
                <td>{ROLE_LABELS[u.role]}</td>
                <td>{u.wallet ? <code>{u.wallet.slice(0, 8)}…{u.wallet.slice(-6)}</code> : <span className="text-slate-500">—</span>}</td>
                <td><code className="text-slate-500">{u.userId.replace('did:privy:', '').slice(0, 10)}…</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
