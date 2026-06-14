import { NextResponse } from 'next/server'
import { getViolation, setViolation, type Violation } from '@/lib/server/store'
import { NUM_TO_STATUS } from '@/lib/contracts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await getViolation())
}

export async function PUT(req: Request) {
  const b = (await req.json()) as Partial<Violation>
  if (!b.violationId || !b.status || !NUM_TO_STATUS.includes(b.status)) {
    return NextResponse.json({ error: 'violationId and a valid status are required' }, { status: 400 })
  }
  const v: Violation = {
    violationId: String(b.violationId),
    address: b.address ?? '',
    description: b.description ?? '',
    status: b.status,
    date: b.date ?? '',
  }
  await setViolation(v)
  return NextResponse.json(v)
}
