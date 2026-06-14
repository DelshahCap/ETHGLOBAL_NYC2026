import Link from 'next/link'
import { TenantAuth } from './components/TenantAuth'

export default function Home() {
  const privyEnabled = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID
  return (
    <main className="mx-auto max-w-2xl p-8 space-y-6">
      <h1 className="text-2xl font-bold">HPD Rent Escrow — Dev Console</h1>
      <p className="text-slate-400">Arc testnet (chain 5042002). Internal tooling.</p>

      {privyEnabled ? (
        <TenantAuth />
      ) : (
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">
            Login disabled — set <span className="font-mono">NEXT_PUBLIC_PRIVY_APP_ID</span> to enable email sign-in.
          </p>
        </section>
      )}

      <div className="flex gap-4 border-t border-slate-800 pt-6">
        <Link href="/admin" className="rounded bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500">Admin / Test Panel</Link>
        <Link href="/tenant" className="rounded bg-slate-700 px-4 py-2 font-medium hover:bg-slate-600">Tenant View</Link>
      </div>
    </main>
  )
}
