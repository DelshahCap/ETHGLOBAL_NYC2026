import { NextResponse } from 'next/server'
import { getKv, kvBackend } from '@/lib/server/kv'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Diagnostic: confirms whether durable KV is wired up. Hit /api/kv-status on the
// deployment — expect { backend: "kv", roundtrip: true }. "memory" means the
// store credentials aren't visible to this environment (wrong var names, or not
// enabled for Preview), so profiles won't persist.
export async function GET() {
  const backend = kvBackend()
  let roundtrip = false
  let error: string | undefined
  try {
    const kv = await getKv()
    await kv.set('kv:health', { ok: true })
    const v = await kv.get<{ ok: boolean }>('kv:health')
    roundtrip = v?.ok === true
  } catch (e) {
    error = (e as Error).message
  }
  return NextResponse.json({ backend, roundtrip, ...(error ? { error } : {}) })
}
