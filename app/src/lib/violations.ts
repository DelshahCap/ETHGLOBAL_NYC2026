import data from '@/data/hpd-violations.json'

// Catalog of demo HPD violations (sourced from the wvxf-dwi5 dataset). Each
// record is the SAME violation in two states — `open` and `closed` each carry
// the HPD violation number for that state — so the tenant can pick an open
// violation and the header switch flips it to its closed number.
export type ViolationState = { status: string; violationId: string }
export type CatalogViolation = {
  row: number
  open: ViolationState
  closed: ViolationState
  class: string
  apartment: string | null
  reportedDate: string
  code: string
  description: string
}

export const VIOLATIONS = data.violations as CatalogViolation[]
export const CLASS_LEGEND = data.classLegend as Record<string, string>

export type ViolationStatus = 'open' | 'closed'

// The HPD number for a violation in the given state.
export function violationIdFor(v: CatalogViolation, status: ViolationStatus): string {
  return status === 'open' ? v.open.violationId : v.closed.violationId
}

// Short label for a dropdown option: "Class C · Fire safety / multi-code".
export function violationLabel(v: CatalogViolation): string {
  return `Class ${v.class} · ${v.description}`
}
