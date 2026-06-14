import { test, expect, describe } from "bun:test"
import { mapStatus, Status } from "./main"
import fixture from "../../test/fixtures/hpd-4-6-manhattan.json"

// Real rows fetched live from NYC Open Data (wvxf-dwi5) for 4-6 Manhattan Ave —
// the 29 violations that transitioned Open -> terminal between the Jan and May 2026
// snapshots. See test/fixtures/hpd-4-6-manhattan.json.
type Row = {
  violationId: string
  violationstatus: string | null
  currentstatus: string | null
  status: number
  statusName: string
}

const rows = fixture.rows as Row[]

const byId = (id: string): Row => {
  const r = rows.find((x) => x.violationId === id)
  if (!r) throw new Error(`fixture missing violationId ${id}`)
  return r
}

// Convert a fixture row to the SocrataRow shape mapStatus consumes (null -> undefined).
const socrata = (r: Row) => ({
  violationstatus: r.violationstatus ?? undefined,
  currentstatus: r.currentstatus ?? undefined,
})

describe("mapStatus against real HPD rows (4-6 Manhattan Ave)", () => {
  test("all 29 real rows map to their recorded Status", () => {
    expect(rows.length).toBe(29)
    for (const r of rows) {
      expect(mapStatus(socrata(r))).toBe(r.status)
    }
  })

  // At least 2 real Closed cases (violationstatus "Close", currentstatus "VIOLATION CLOSED").
  test("real Closed rows -> Status.Closed (1)", () => {
    for (const id of ["18427251", "18100032", "13992453"]) {
      const r = byId(id)
      expect(r.statusName).toBe("Closed")
      expect(mapStatus(socrata(r))).toBe(Status.Closed)
    }
  })

  // Real Dismissed case (currentstatus contains "DISMISS").
  test("real Dismissed row -> Status.Dismissed (2)", () => {
    const r = byId("18427252")
    expect(r.statusName).toBe("Dismissed")
    expect(r.currentstatus?.toUpperCase()).toContain("DISMISS")
    expect(mapStatus(socrata(r))).toBe(Status.Dismissed)
  })

  // None of the 29 are still Open, so use a synthetic Open row to cover that branch.
  test("Open row -> Status.Open (0)", () => {
    expect(mapStatus({ violationstatus: "Open", currentstatus: "NOV SENT OUT" })).toBe(Status.Open)
  })

  // Missing data must never settle: undefined / empty row -> Open.
  test("missing data -> Status.Open (0)", () => {
    expect(mapStatus(undefined)).toBe(Status.Open)
    expect(mapStatus({})).toBe(Status.Open)
    expect(mapStatus({ violationstatus: undefined, currentstatus: undefined })).toBe(Status.Open)
  })
})
