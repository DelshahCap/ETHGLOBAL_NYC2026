import Link from 'next/link'

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-8 space-y-6">
      <h1 className="text-2xl font-bold">HPD Rent Escrow — Dev Console</h1>
      <p className="text-slate-400">Arc testnet (chain 5042002). Internal tooling.</p>
      <div className="flex gap-4">
        <Link href="/admin" className="rounded bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500">Admin / Test Panel</Link>
        <Link href="/tenant" className="rounded bg-slate-700 px-4 py-2 font-medium hover:bg-slate-600">Tenant View</Link>
      </div>
    </main>
  )
}
