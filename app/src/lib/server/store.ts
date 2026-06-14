import 'server-only'
import { getKv } from './kv'
import type { StatusName } from '@/lib/contracts'

export type Violation = {
  violationId: string
  address: string
  description: string
  status: StatusName
  date: string
}
export type Clock = { now: string }

const VIOLATION_KEY = 'violation:current'
const CLOCK_KEY = 'clock:current'

export async function getViolation(): Promise<Violation | null> {
  return (await getKv()).get<Violation>(VIOLATION_KEY)
}
export async function setViolation(v: Violation): Promise<void> {
  await (await getKv()).set(VIOLATION_KEY, v)
}
export async function getClock(): Promise<Clock | null> {
  return (await getKv()).get<Clock>(CLOCK_KEY)
}
export async function setClock(c: Clock): Promise<void> {
  await (await getKv()).set(CLOCK_KEY, c)
}
