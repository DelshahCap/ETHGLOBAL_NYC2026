import { describe, it, expect } from 'vitest'
import { getViolation, setViolation, getClock, setClock } from '@/lib/server/store'

describe('shared store (in-memory fallback)', () => {
  it('returns null before a violation is set', async () => {
    expect(await getViolation()).toBeNull()
  })
  it('round-trips a violation', async () => {
    const v = { violationId: '999999', address: '123 Demo St', description: 'No heat', status: 'Open' as const, date: '2026-06-14' }
    await setViolation(v)
    expect(await getViolation()).toEqual(v)
  })
  it('round-trips the demo clock', async () => {
    await setClock({ now: '2026-06-14' })
    expect(await getClock()).toEqual({ now: '2026-06-14' })
  })
})
