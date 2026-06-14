import { NextResponse } from 'next/server'
import { getClock, setClock } from '@/lib/server/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await getClock())
}

export async function PUT(req: Request) {
  const b = (await req.json()) as { now?: string }
  if (!b.now) return NextResponse.json({ error: 'now (date string) required' }, { status: 400 })
  await setClock({ now: b.now })
  return NextResponse.json({ now: b.now })
}
