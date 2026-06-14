# `app/` Scaffold + Admin Panel + Tenant View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a Next.js app in `app/` whose first job is an admin/test panel that exercises every EscrowVault function/workflow from `docs/INTEGRATION.md`, plus a read-only tenant view, deployable to Vercel as a PWA.

**Architecture:** Client UI (`/admin`, `/tenant`) reads chain state directly via a viem public client and never holds private keys. Privileged actions post to Next.js API routes that sign with server-held test keys (`/api/tx/*`) or read/write a shared store (`/api/violation`, `/api/clock`, `/api/roles`). The shared store (Vercel KV with in-memory dev fallback) holds human-readable mock violation details + a demo clock; the chain stays the source of truth for money.

**Tech Stack:** Next.js 15 (App Router, TypeScript, `src/` dir, `@/*` alias), Tailwind, viem, `@privy-io/react-auth`, `@vercel/kv`, Vitest (unit), Playwright (smoke).

---

## Repo policy (read before any commit)

Per `docs/app/` conventions and `AI_USAGE_app.md`:
- All code lives under `app/`. Do **not** touch contract/Foundry code (`src/`, `test/`, `script/`, `scripts/`, `lib/`, `foundry.toml`, `deployments/`).
- **Do not auto-commit.** Commit steps below are checkpoints — pause and get Nilesh's explicit go-ahead for each commit. Keep AI attribution on (Co-Authored-By; human is author).
- Log the session in `AI_USAGE_app.md` (Task 18), never the root `AI_USAGE.md`.

## Contract facts this plan depends on (verified against `src/`)

- EscrowVault `0x83B757a2DB265c185Ed837564fC3b3de3052CF3D`, MockYieldSource `0xB61090E2e397Cd7bda07be495A0554a7b6780736`, USDC `0x3600000000000000000000000000000000000000` (6 decimals, **is the gas token**). Chain id `5042002`, RPC `https://rpc.testnet.arc.network`, explorer `https://testnet.arcscan.app`.
- `createEscrow(address tenant,address landlord,address contractor,uint256 violationId,uint256 contractorFee) → uint256 id` — no auth; emits `EscrowCreated(id, tenant, violationId)`.
- `fund(uint256 id,uint256 amount)` — pulls USDC from `msg.sender`; needs prior `approve`; reverts `FeeExceedsPrincipal()` if `contractorFee > amount`; emits `Funded`.
- `updateStatus(uint256 id,uint8 status)` — **onlyOracle**; terminal status emits `Settled`, `Open` emits `StatusUpdated`.
- `withdraw()` — pull-payment; reverts `NothingToWithdraw()`; emits `Withdrawn`.
- Simulate yield = `USDC.transfer(MockYieldSource, amount)`.
- `escrows(id)` returns tuple in order: `tenant,landlord,contractor,violationId,principal,shares,contractorFee,status,funded,settled`.

## File structure

```
app/
  package.json, next.config.mjs, tsconfig.json, postcss/tailwind config, vitest.config.ts
  .env.local.example, .gitignore (Next default)
  playwright.config.ts
  public/ manifest.webmanifest, sw.js, icons/icon-192.png, icons/icon-512.png
  src/
    lib/
      chain.ts          # viem Arc chain + public client
      contracts.ts      # addresses + ABI fragments (EscrowVault, ERC20, MockYieldSource)
      usdc.ts           # 6-decimal parse/format  (UNIT TESTED)
      reads.ts          # client-side read helpers over publicClient
      server/
        keys.ts         # role -> private key (server only)
        wallets.ts      # role -> viem wallet client (server only)
        kv.ts           # Vercel KV wrapper + in-memory fallback  (UNIT TESTED)
        store.ts        # typed violation + clock accessors over kv  (UNIT TESTED)
      usdc.test.ts
      server/store.test.ts
    app/
      layout.tsx, providers.tsx, globals.css, page.tsx
      admin/page.tsx
      admin/components/{StatusBar,RolePanel,LifecycleRunner,ViolationEditor,FunctionTester,EventLog,PrivyPanel}.tsx
      tenant/page.tsx
      api/tx/[action]/route.ts
      api/violation/route.ts
      api/clock/route.ts
      api/roles/route.ts
  tests/admin.spec.ts
```

---

## Task 1: Scaffold the Next.js app

**Files:**
- Create: everything under `app/` from the generator.

- [x] **Step 1: Generate the app (non-interactive)**

Run from repo root:
```bash
npx create-next-app@latest app \
  --ts --tailwind --app --src-dir --import-alias "@/*" \
  --no-eslint --use-npm --yes
```
Expected: `app/` created with `src/app/`, Tailwind wired, `package.json` present.

- [x] **Step 2: Add runtime + dev dependencies**

```bash
cd app
npm install viem @privy-io/react-auth @vercel/kv
npm install -D vitest @playwright/test
```
Expected: installs succeed; `package.json` lists all five.

- [x] **Step 3: Add scripts to `app/package.json`**

In the `"scripts"` block, ensure these exist (merge with generated `dev`/`build`/`start`):
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "e2e": "playwright test"
  }
}
```

- [x] **Step 4: Verify the dev server boots**

Run: `npm run dev` (from `app/`), open `http://localhost:3000`, confirm the Next welcome page renders, then stop it (Ctrl-C).
Expected: page loads with no console errors.

- [x] **Step 5: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors.

- [x] **Step 6: Commit (checkpoint — get authorization)**

```bash
git add app
git commit -m "feat(app): scaffold Next.js + Tailwind app in app/"
```

---

## Task 2: Chain + contracts config

**Files:**
- Create: `app/src/lib/chain.ts`, `app/src/lib/contracts.ts`

- [x] **Step 1: Write `app/src/lib/chain.ts`**

```ts
import { createPublicClient, defineChain, http } from 'viem'

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 }, // USDC is the gas token
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
  blockExplorers: { default: { name: 'Arcscan', url: 'https://testnet.arcscan.app' } },
  testnet: true,
})

export const RPC_URL = 'https://rpc.testnet.arc.network'
export const EXPLORER = 'https://testnet.arcscan.app'
export const FAUCET = 'https://faucet.circle.com'

// Shared by client and server reads.
export const publicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL) })
```

- [x] **Step 2: Write `app/src/lib/contracts.ts` (addresses + ABI fragments)**

```ts
export const VAULT = '0x83B757a2DB265c185Ed837564fC3b3de3052CF3D' as const
export const YIELD_SOURCE = '0xB61090E2e397Cd7bda07be495A0554a7b6780736' as const
export const USDC = '0x3600000000000000000000000000000000000000' as const

export type StatusName = 'Open' | 'Closed' | 'Dismissed'
export const STATUS_TO_NUM: Record<StatusName, number> = { Open: 0, Closed: 1, Dismissed: 2 }
export const NUM_TO_STATUS: StatusName[] = ['Open', 'Closed', 'Dismissed']

export const escrowVaultAbi = [
  { type: 'function', name: 'nextEscrowId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'oracle', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'usdc', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'yieldSource', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'withdrawable', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  {
    type: 'function', name: 'escrows', stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [
      { name: 'tenant', type: 'address' }, { name: 'landlord', type: 'address' },
      { name: 'contractor', type: 'address' }, { name: 'violationId', type: 'uint256' },
      { name: 'principal', type: 'uint256' }, { name: 'shares', type: 'uint256' },
      { name: 'contractorFee', type: 'uint256' }, { name: 'status', type: 'uint8' },
      { name: 'funded', type: 'bool' }, { name: 'settled', type: 'bool' },
    ],
  },
  {
    type: 'function', name: 'createEscrow', stateMutability: 'nonpayable',
    inputs: [
      { name: 'tenant', type: 'address' }, { name: 'landlord', type: 'address' },
      { name: 'contractor', type: 'address' }, { name: 'violationId', type: 'uint256' },
      { name: 'contractorFee', type: 'uint256' },
    ],
    outputs: [{ name: 'id', type: 'uint256' }],
  },
  { type: 'function', name: 'fund', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'withdraw', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'updateStatus', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }, { name: 'status', type: 'uint8' }], outputs: [] },
  { type: 'function', name: 'setOracle', stateMutability: 'nonpayable', inputs: [{ name: 'oracle', type: 'address' }], outputs: [] },
  { type: 'function', name: 'setYieldSource', stateMutability: 'nonpayable', inputs: [{ name: 'yieldSource', type: 'address' }], outputs: [] },
  { type: 'event', name: 'EscrowCreated', inputs: [{ name: 'id', type: 'uint256', indexed: true }, { name: 'tenant', type: 'address', indexed: true }, { name: 'violationId', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'Funded', inputs: [{ name: 'id', type: 'uint256', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'StatusUpdated', inputs: [{ name: 'id', type: 'uint256', indexed: true }, { name: 'status', type: 'uint8', indexed: false }] },
  { type: 'event', name: 'Settled', inputs: [{ name: 'id', type: 'uint256', indexed: true }, { name: 'status', type: 'uint8', indexed: false }] },
  { type: 'event', name: 'Withdrawn', inputs: [{ name: 'account', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }] },
] as const

export const erc20Abi = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

export const mockYieldSourceAbi = [
  { type: 'function', name: 'totalAssets', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalShares', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const
```

- [x] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors.

- [x] **Step 4: Commit (checkpoint)**

```bash
git add src/lib/chain.ts src/lib/contracts.ts
git commit -m "feat(app): add Arc chain config and contract ABIs"
```

---

## Task 3: USDC 6-decimal helpers (TDD)

**Files:**
- Create: `app/src/lib/usdc.ts`, `app/src/lib/usdc.test.ts`
- Create: `app/vitest.config.ts`

- [x] **Step 1: Write `app/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
```

- [x] **Step 2: Write the failing test `app/src/lib/usdc.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { toMicro, fromMicro, formatUsdc } from '@/lib/usdc'

describe('usdc 6-decimal helpers', () => {
  it('toMicro parses a decimal string to micro-USDC bigint', () => {
    expect(toMicro('1')).toBe(1_000_000n)
    expect(toMicro('1.1')).toBe(1_100_000n)
    expect(toMicro('0.000001')).toBe(1n)
  })
  it('fromMicro is the inverse of toMicro', () => {
    expect(fromMicro(1_100_000n)).toBe('1.1')
    expect(fromMicro(toMicro('1.1'))).toBe('1.1')
  })
  it('formatUsdc renders a human label', () => {
    expect(formatUsdc(1_100_000n)).toBe('1.1 USDC')
  })
})
```

- [x] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `@/lib/usdc` / functions not defined.

- [x] **Step 4: Write `app/src/lib/usdc.ts`**

```ts
import { parseUnits, formatUnits } from 'viem'

export const USDC_DECIMALS = 6

export function toMicro(amount: string): bigint {
  return parseUnits(amount, USDC_DECIMALS)
}

export function fromMicro(micro: bigint): string {
  return formatUnits(micro, USDC_DECIMALS)
}

export function formatUsdc(micro: bigint): string {
  return `${fromMicro(micro)} USDC`
}
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS (3 tests).

- [x] **Step 6: Commit (checkpoint)**

```bash
git add src/lib/usdc.ts src/lib/usdc.test.ts vitest.config.ts
git commit -m "feat(app): add 6-decimal USDC helpers with tests"
```

---

## Task 4: Shared store — KV wrapper + typed accessors (TDD)

**Files:**
- Create: `app/src/lib/server/kv.ts`, `app/src/lib/server/store.ts`, `app/src/lib/server/store.test.ts`

- [x] **Step 1: Write `app/src/lib/server/kv.ts` (Vercel KV with in-memory fallback)**

```ts
import 'server-only'

// Uses Vercel KV when KV_REST_API_URL + KV_REST_API_TOKEN are present;
// otherwise an in-memory map so local dev and unit tests work with no service.
type KvLike = {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<unknown>
}

function makeMemoryKv(): KvLike {
  const m = new Map<string, unknown>()
  return {
    async get<T>(key: string) { return (m.has(key) ? (m.get(key) as T) : null) },
    async set<T>(key: string, value: T) { m.set(key, value); return 'OK' },
  }
}

let client: KvLike | null = null

export async function getKv(): Promise<KvLike> {
  if (client) return client
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const { kv } = await import('@vercel/kv')
    client = kv as unknown as KvLike
  } else {
    client = makeMemoryKv()
  }
  return client
}
```

- [x] **Step 2: Write the failing test `app/src/lib/server/store.test.ts`**

```ts
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
```

- [x] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `@/lib/server/store`.

- [x] **Step 4: Write `app/src/lib/server/store.ts`**

```ts
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
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS (all usdc + store tests).

Note: the in-memory KV is module-scoped, so the three store tests share state within one run — written so they don't conflict (the first asserts null before any `setViolation`).

- [x] **Step 6: Commit (checkpoint)**

```bash
git add src/lib/server
git commit -m "feat(app): add shared KV store with in-memory fallback + tests"
```

---

## Task 5: Server keys + wallet clients

**Files:**
- Create: `app/src/lib/server/keys.ts`, `app/src/lib/server/wallets.ts`, `app/.env.local.example`

- [x] **Step 1: Write `app/.env.local.example`**

```bash
# Server-only signing keys (4 funded Arc testnet accounts). NEVER prefix with NEXT_PUBLIC.
TENANT_PRIVATE_KEY=0x...
LANDLORD_PRIVATE_KEY=0x...
CONTRACTOR_PRIVATE_KEY=0x...
ORACLE_PRIVATE_KEY=0x...

# Privy (client) — minimal real-wallet path
NEXT_PUBLIC_PRIVY_APP_ID=

# Vercel KV (omit locally to use the in-memory fallback)
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

- [x] **Step 2: Write `app/src/lib/server/keys.ts`**

```ts
import 'server-only'
import type { Hex } from 'viem'

export type Role = 'tenant' | 'landlord' | 'contractor' | 'oracle'
export const ROLES: Role[] = ['tenant', 'landlord', 'contractor', 'oracle']

const ENV_BY_ROLE: Record<Role, string> = {
  tenant: 'TENANT_PRIVATE_KEY',
  landlord: 'LANDLORD_PRIVATE_KEY',
  contractor: 'CONTRACTOR_PRIVATE_KEY',
  oracle: 'ORACLE_PRIVATE_KEY',
}

export function keyFor(role: Role): Hex {
  const v = process.env[ENV_BY_ROLE[role]]
  if (!v) throw new Error(`Missing env ${ENV_BY_ROLE[role]} for role "${role}"`)
  return (v.startsWith('0x') ? v : `0x${v}`) as Hex
}

export function isRole(x: unknown): x is Role {
  return typeof x === 'string' && (ROLES as string[]).includes(x)
}
```

- [x] **Step 3: Write `app/src/lib/server/wallets.ts`**

```ts
import 'server-only'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet, RPC_URL } from '@/lib/chain'
import { keyFor, type Role } from './keys'

export function accountFor(role: Role) {
  return privateKeyToAccount(keyFor(role))
}

export function walletFor(role: Role) {
  return createWalletClient({ account: accountFor(role), chain: arcTestnet, transport: http(RPC_URL) })
}
```

- [x] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors.

- [x] **Step 5: Commit (checkpoint)**

```bash
git add src/lib/server/keys.ts src/lib/server/wallets.ts .env.local.example
git commit -m "feat(app): add server-side role keys and wallet clients"
```

---

## Task 6: `/api/roles` — expose role addresses (no keys)

**Files:**
- Create: `app/src/app/api/roles/route.ts`

- [x] **Step 1: Write `app/src/app/api/roles/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { ROLES } from '@/lib/server/keys'
import { accountFor } from '@/lib/server/wallets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const out = Object.fromEntries(ROLES.map((r) => [r, accountFor(r).address]))
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

- [x] **Step 2: Verify manually with placeholder keys**

Create `app/.env.local` with four throwaway test keys (any valid 32-byte hex; for a real run use funded Arc keys). Run `npm run dev`, then:
```bash
curl -s http://localhost:3000/api/roles
```
Expected: JSON `{"tenant":"0x...","landlord":"0x...","contractor":"0x...","oracle":"0x..."}`.

- [x] **Step 3: Commit (checkpoint)**

```bash
git add src/app/api/roles/route.ts
git commit -m "feat(app): add /api/roles to expose role addresses"
```

---

## Task 7: `/api/violation` and `/api/clock` routes

**Files:**
- Create: `app/src/app/api/violation/route.ts`, `app/src/app/api/clock/route.ts`

- [x] **Step 1: Write `app/src/app/api/violation/route.ts`**

```ts
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
```

- [x] **Step 2: Write `app/src/app/api/clock/route.ts`**

```ts
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
```

- [x] **Step 3: Verify manually**

With `npm run dev` running:
```bash
curl -s -X PUT http://localhost:3000/api/violation \
  -H 'content-type: application/json' \
  -d '{"violationId":"999999","address":"123 Demo St","description":"No heat","status":"Open","date":"2026-06-14"}'
curl -s http://localhost:3000/api/violation
```
Expected: the PUT echoes the record; the GET returns the same. (Resets on server restart unless KV env is set — expected.)

- [x] **Step 4: Commit (checkpoint)**

```bash
git add src/app/api/violation src/app/api/clock
git commit -m "feat(app): add shared violation + clock API routes"
```

---

## Task 8: `/api/tx/[action]` — server-signed transactions

**Files:**
- Create: `app/src/app/api/tx/[action]/route.ts`

- [x] **Step 1: Write `app/src/app/api/tx/[action]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { parseEventLogs } from 'viem'
import { publicClient } from '@/lib/chain'
import { VAULT, USDC, YIELD_SOURCE, escrowVaultAbi, erc20Abi } from '@/lib/contracts'
import { walletFor } from '@/lib/server/wallets'
import { isRole, type Role } from '@/lib/server/keys'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = Record<string, unknown>

function roleFrom(b: Body, fallback: Role): Role {
  return isRole(b.role) ? b.role : fallback
}

export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params
  const b = (await req.json().catch(() => ({}))) as Body
  try {
    switch (action) {
      case 'createEscrow': {
        const wallet = walletFor(roleFrom(b, 'oracle'))
        const hash = await wallet.writeContract({
          address: VAULT, abi: escrowVaultAbi, functionName: 'createEscrow',
          args: [b.tenant as `0x${string}`, b.landlord as `0x${string}`, b.contractor as `0x${string}`,
                 BigInt(b.violationId as string), BigInt(b.contractorFee as string)],
        })
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        const logs = parseEventLogs({ abi: escrowVaultAbi, eventName: 'EscrowCreated', logs: receipt.logs })
        const id = logs[0]?.args.id?.toString() ?? null
        return NextResponse.json({ hash, id })
      }
      case 'fund': {
        const wallet = walletFor(roleFrom(b, 'tenant'))
        const id = BigInt(b.id as string)
        const amount = BigInt(b.amount as string)
        const approveHash = await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: 'approve', args: [VAULT, amount] })
        await publicClient.waitForTransactionReceipt({ hash: approveHash })
        const fundHash = await wallet.writeContract({ address: VAULT, abi: escrowVaultAbi, functionName: 'fund', args: [id, amount] })
        await publicClient.waitForTransactionReceipt({ hash: fundHash })
        return NextResponse.json({ approveHash, fundHash })
      }
      case 'simulateYield': {
        const wallet = walletFor(roleFrom(b, 'landlord'))
        const amount = BigInt(b.amount as string)
        const hash = await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: 'transfer', args: [YIELD_SOURCE, amount] })
        await publicClient.waitForTransactionReceipt({ hash })
        return NextResponse.json({ hash })
      }
      case 'updateStatus': {
        const wallet = walletFor('oracle') // forced: updateStatus is onlyOracle
        const hash = await wallet.writeContract({
          address: VAULT, abi: escrowVaultAbi, functionName: 'updateStatus',
          args: [BigInt(b.id as string), Number(b.status)],
        })
        await publicClient.waitForTransactionReceipt({ hash })
        return NextResponse.json({ hash })
      }
      case 'withdraw': {
        const wallet = walletFor(roleFrom(b, 'landlord'))
        const hash = await wallet.writeContract({ address: VAULT, abi: escrowVaultAbi, functionName: 'withdraw', args: [] })
        await publicClient.waitForTransactionReceipt({ hash })
        return NextResponse.json({ hash })
      }
      default:
        return NextResponse.json({ error: `unknown action "${action}"` }, { status: 404 })
    }
  } catch (e: unknown) {
    const err = e as { shortMessage?: string; message?: string }
    return NextResponse.json({ error: err.shortMessage ?? err.message ?? 'tx failed' }, { status: 400 })
  }
}
```

- [x] **Step 2: Verify the route is reachable (expected on-chain failure without funded keys is fine)**

With `npm run dev` and real funded keys in `.env.local`, this is exercised end-to-end in Task 10. For now just confirm the route compiles:
Run: `npm run typecheck`
Expected: no errors.

- [x] **Step 3: Commit (checkpoint)**

```bash
git add src/app/api/tx
git commit -m "feat(app): add server-signed /api/tx/[action] route"
```

---

## Task 9: Client read helpers

**Files:**
- Create: `app/src/lib/reads.ts`

- [x] **Step 1: Write `app/src/lib/reads.ts`**

```ts
import { publicClient } from '@/lib/chain'
import { VAULT, USDC, YIELD_SOURCE, escrowVaultAbi, erc20Abi, mockYieldSourceAbi, NUM_TO_STATUS } from '@/lib/contracts'

export type EscrowView = {
  id: number
  tenant: `0x${string}`; landlord: `0x${string}`; contractor: `0x${string}`
  violationId: bigint; principal: bigint; shares: bigint; contractorFee: bigint
  status: number; statusName: string; funded: boolean; settled: boolean
}

export async function readConfig() {
  const [oracle, owner, usdc, yieldSource, nextId] = await Promise.all([
    publicClient.readContract({ address: VAULT, abi: escrowVaultAbi, functionName: 'oracle' }),
    publicClient.readContract({ address: VAULT, abi: escrowVaultAbi, functionName: 'owner' }),
    publicClient.readContract({ address: VAULT, abi: escrowVaultAbi, functionName: 'usdc' }),
    publicClient.readContract({ address: VAULT, abi: escrowVaultAbi, functionName: 'yieldSource' }),
    publicClient.readContract({ address: VAULT, abi: escrowVaultAbi, functionName: 'nextEscrowId' }),
  ])
  return { oracle, owner, usdc, yieldSource, nextEscrowId: Number(nextId) }
}

export async function readEscrow(id: number): Promise<EscrowView> {
  const r = await publicClient.readContract({ address: VAULT, abi: escrowVaultAbi, functionName: 'escrows', args: [BigInt(id)] })
  const [tenant, landlord, contractor, violationId, principal, shares, contractorFee, status, funded, settled] = r
  return { id, tenant, landlord, contractor, violationId, principal, shares, contractorFee, status, statusName: NUM_TO_STATUS[status] ?? String(status), funded, settled }
}

export async function readWithdrawable(account: `0x${string}`) {
  return publicClient.readContract({ address: VAULT, abi: escrowVaultAbi, functionName: 'withdrawable', args: [account] })
}

export async function readUsdcBalance(account: `0x${string}`) {
  return publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [account] })
}

export async function readYieldInfo() {
  const [totalAssets, totalShares] = await Promise.all([
    publicClient.readContract({ address: YIELD_SOURCE, abi: mockYieldSourceAbi, functionName: 'totalAssets' }),
    publicClient.readContract({ address: YIELD_SOURCE, abi: mockYieldSourceAbi, functionName: 'totalShares' }),
  ])
  return { totalAssets, totalShares }
}
```

- [x] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors.

- [x] **Step 3: Commit (checkpoint)**

```bash
git add src/lib/reads.ts
git commit -m "feat(app): add client-side chain read helpers"
```

---

## Task 10: App shell, providers, home page

**Files:**
- Create: `app/src/app/providers.tsx`
- Modify: `app/src/app/layout.tsx`, `app/src/app/page.tsx`, `app/src/app/globals.css` (keep Tailwind directives)

- [x] **Step 1: Write `app/src/app/providers.tsx` (Privy provider, client)**

```tsx
'use client'
import { PrivyProvider } from '@privy-io/react-auth'
import { arcTestnet } from '@/lib/chain'

export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  if (!appId) return <>{children}</> // Privy optional; app works without it
  return (
    <PrivyProvider
      appId={appId}
      config={{
        defaultChain: arcTestnet,
        supportedChains: [arcTestnet],
        embeddedWallets: { createOnLogin: 'users-without-wallets' },
      }}
    >
      {children}
    </PrivyProvider>
  )
}
```

- [x] **Step 2: Replace `app/src/app/layout.tsx`**

```tsx
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'HPD Rent Escrow — Admin',
  manifest: '/manifest.webmanifest',
}
export const viewport: Viewport = { themeColor: '#0f172a' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

- [x] **Step 3: Replace `app/src/app/page.tsx`**

```tsx
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
```

- [x] **Step 4: Verify it renders**

Run: `npm run dev`, open `/`, confirm the two links render and route to `/admin` and `/tenant` (those pages come next; a 404 for now is fine). Stop the server.

- [x] **Step 5: Commit (checkpoint)**

```bash
git add src/app/providers.tsx src/app/layout.tsx src/app/page.tsx
git commit -m "feat(app): add app shell, Privy provider, home page"
```

---

## Task 11: Admin page + StatusBar + RolePanel

**Files:**
- Create: `app/src/app/admin/page.tsx`, `app/src/app/admin/components/StatusBar.tsx`, `app/src/app/admin/components/RolePanel.tsx`

- [x] **Step 1: Write `app/src/app/admin/components/StatusBar.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { readConfig, readYieldInfo } from '@/lib/reads'
import { formatUsdc } from '@/lib/usdc'
import { EXPLORER } from '@/lib/chain'
import { VAULT } from '@/lib/contracts'

export function StatusBar() {
  const [cfg, setCfg] = useState<Awaited<ReturnType<typeof readConfig>> | null>(null)
  const [yieldInfo, setYieldInfo] = useState<Awaited<ReturnType<typeof readYieldInfo>> | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let on = true
    const tick = async () => {
      try {
        const [c, y] = await Promise.all([readConfig(), readYieldInfo()])
        if (on) { setCfg(c); setYieldInfo(y); setErr(null) }
      } catch (e) { if (on) setErr((e as Error).message) }
    }
    tick(); const t = setInterval(tick, 5000)
    return () => { on = false; clearInterval(t) }
  }, [])

  return (
    <section className="rounded border border-slate-800 p-4 text-sm">
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span>Chain <b>5042002</b></span>
        <a className="text-indigo-400 underline" href={`${EXPLORER}/address/${VAULT}`} target="_blank">Vault ↗</a>
        {cfg && <><span>oracle <code>{short(cfg.oracle)}</code></span><span>owner <code>{short(cfg.owner)}</code></span><span>nextId <b>{cfg.nextEscrowId}</b></span></>}
        {yieldInfo && <span>pool {formatUsdc(yieldInfo.totalAssets)} / {yieldInfo.totalShares.toString()} shares</span>}
      </div>
      {err && <p className="mt-2 text-red-400">read error: {err}</p>}
    </section>
  )
}
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
```

- [x] **Step 2: Write `app/src/app/admin/components/RolePanel.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { readUsdcBalance, readWithdrawable } from '@/lib/reads'
import { formatUsdc } from '@/lib/usdc'
import { FAUCET } from '@/lib/chain'

export type Roles = Record<'tenant' | 'landlord' | 'contractor' | 'oracle', `0x${string}`>

export function RolePanel({ roles }: { roles: Roles | null }) {
  const [rows, setRows] = useState<Record<string, { bal: bigint; wd: bigint }>>({})
  useEffect(() => {
    if (!roles) return
    let on = true
    const tick = async () => {
      const entries = await Promise.all(
        Object.entries(roles).map(async ([k, addr]) => [k, { bal: await readUsdcBalance(addr), wd: await readWithdrawable(addr) }] as const),
      )
      if (on) setRows(Object.fromEntries(entries))
    }
    tick(); const t = setInterval(tick, 5000)
    return () => { on = false; clearInterval(t) }
  }, [roles])

  if (!roles) return <p className="text-slate-500">Loading roles… (set the 4 key env vars)</p>
  return (
    <section className="rounded border border-slate-800 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Roles</h2>
        <a className="text-xs text-indigo-400 underline" href={FAUCET} target="_blank">Circle faucet ↗</a>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-slate-400"><tr><th>Role</th><th>Address</th><th>USDC (gas)</th><th>Withdrawable</th></tr></thead>
        <tbody>
          {Object.entries(roles).map(([role, addr]) => (
            <tr key={role} className="border-t border-slate-800">
              <td className="py-1 capitalize">{role}</td>
              <td><code>{addr.slice(0, 8)}…{addr.slice(-6)}</code></td>
              <td className={rows[role] && rows[role].bal === 0n ? 'text-red-400' : ''}>{rows[role] ? formatUsdc(rows[role].bal) : '…'}</td>
              <td>{rows[role] ? formatUsdc(rows[role].wd) : '…'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
```

- [x] **Step 3: Write `app/src/app/admin/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { StatusBar } from './components/StatusBar'
import { RolePanel, type Roles } from './components/RolePanel'

export default function AdminPage() {
  const [roles, setRoles] = useState<Roles | null>(null)
  useEffect(() => { fetch('/api/roles').then((r) => r.json()).then((d) => { if (!d.error) setRoles(d) }) }, [])
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-xl font-bold">Admin / Test Panel</h1>
      <StatusBar />
      <RolePanel roles={roles} />
    </main>
  )
}
```

- [x] **Step 4: Verify**

Run `npm run dev`, open `/admin` with funded keys in `.env.local`. Expect the status bar to show oracle/owner/nextId and the role table to show four addresses with USDC balances. Stop the server.

- [x] **Step 5: Commit (checkpoint)**

```bash
git add src/app/admin
git commit -m "feat(app): add admin page with status bar and role panel"
```

---

## Task 12: LifecycleRunner + escrow state table

**Files:**
- Create: `app/src/app/admin/components/LifecycleRunner.tsx`
- Modify: `app/src/app/admin/page.tsx` (mount it)

- [x] **Step 1: Write `app/src/app/admin/components/LifecycleRunner.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { readEscrow, type EscrowView } from '@/lib/reads'
import { toMicro, formatUsdc } from '@/lib/usdc'
import { STATUS_TO_NUM } from '@/lib/contracts'
import type { Roles } from './RolePanel'

async function tx(action: string, body: Record<string, unknown>) {
  const r = await fetch(`/api/tx/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error ?? 'tx failed')
  return d
}

export function LifecycleRunner({ roles }: { roles: Roles | null }) {
  const [id, setId] = useState('')
  const [amount, setAmount] = useState('1')
  const [fee, setFee] = useState('0')
  const [yieldAmt, setYieldAmt] = useState('0.1')
  const [violationId, setViolationId] = useState('999999')
  const [esc, setEsc] = useState<EscrowView | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const say = (m: string) => setLog((l) => [m, ...l].slice(0, 20))
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true)
    try { const d = await fn(); say(`✓ ${label}: ${JSON.stringify(d)}`) }
    catch (e) { say(`✗ ${label}: ${(e as Error).message}`) }
    finally { setBusy(false) }
  }
  const refresh = async () => { if (id !== '') setEsc(await readEscrow(Number(id))) }

  if (!roles) return null
  return (
    <section className="rounded border border-slate-800 p-4 space-y-3">
      <h2 className="font-semibold">Lifecycle runner</h2>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <label>id <input className="ml-1 w-20 bg-slate-800 px-1" value={id} onChange={(e) => setId(e.target.value)} /></label>
        <label>amount <input className="ml-1 w-20 bg-slate-800 px-1" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label>fee <input className="ml-1 w-20 bg-slate-800 px-1" value={fee} onChange={(e) => setFee(e.target.value)} /></label>
        <label>violationId <input className="ml-1 w-24 bg-slate-800 px-1" value={violationId} onChange={(e) => setViolationId(e.target.value)} /></label>
        <label>yield <input className="ml-1 w-20 bg-slate-800 px-1" value={yieldAmt} onChange={(e) => setYieldAmt(e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Btn busy={busy} onClick={() => run('createEscrow', async () => {
          const d = await tx('createEscrow', { role: 'landlord', tenant: roles.tenant, landlord: roles.landlord, contractor: roles.contractor, violationId, contractorFee: toMicro(fee).toString() })
          if (d.id != null) setId(String(d.id)); return d
        })}>1. createEscrow</Btn>
        <Btn busy={busy} onClick={() => run('fund (approve+fund)', () => tx('fund', { role: 'tenant', id, amount: toMicro(amount).toString() }))}>2. fund</Btn>
        <Btn busy={busy} onClick={() => run('simulateYield', () => tx('simulateYield', { role: 'landlord', amount: toMicro(yieldAmt).toString() }))}>3. yield</Btn>
        <Btn busy={busy} onClick={() => run('updateStatus Closed', () => tx('updateStatus', { id, status: STATUS_TO_NUM.Closed }))}>4a. Closed</Btn>
        <Btn busy={busy} onClick={() => run('updateStatus Dismissed', () => tx('updateStatus', { id, status: STATUS_TO_NUM.Dismissed }))}>4b. Dismissed</Btn>
        <Btn busy={busy} onClick={() => run('withdraw tenant', () => tx('withdraw', { role: 'tenant' }))}>5a. withdraw tenant</Btn>
        <Btn busy={busy} onClick={() => run('withdraw landlord', () => tx('withdraw', { role: 'landlord' }))}>5b. withdraw landlord</Btn>
        <Btn busy={busy} onClick={() => run('withdraw contractor', () => tx('withdraw', { role: 'contractor' }))}>5c. withdraw contractor</Btn>
        <Btn busy={busy} onClick={() => run('refresh', refresh)}>↻ read escrow</Btn>
      </div>
      {esc && (
        <table className="w-full text-xs">
          <tbody>
            {Object.entries({
              id: esc.id, status: `${esc.status} (${esc.statusName})`, funded: String(esc.funded), settled: String(esc.settled),
              violationId: esc.violationId.toString(), principal: formatUsdc(esc.principal), contractorFee: formatUsdc(esc.contractorFee),
              shares: esc.shares.toString(), tenant: esc.tenant, landlord: esc.landlord, contractor: esc.contractor,
            }).map(([k, v]) => (<tr key={k} className="border-t border-slate-800"><td className="py-0.5 pr-3 text-slate-400">{k}</td><td><code>{String(v)}</code></td></tr>))}
          </tbody>
        </table>
      )}
      <pre className="max-h-40 overflow-auto rounded bg-black/40 p-2 text-xs">{log.join('\n')}</pre>
    </section>
  )
}

function Btn({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy: boolean }) {
  return <button disabled={busy} onClick={onClick} className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium hover:bg-indigo-500 disabled:opacity-50">{children}</button>
}
```

- [x] **Step 2: Mount it in `app/src/app/admin/page.tsx`**

Add the import and render below `RolePanel`:
```tsx
import { LifecycleRunner } from './components/LifecycleRunner'
// ...inside <main>, after <RolePanel roles={roles} />:
      <LifecycleRunner roles={roles} />
```

- [x] **Step 3: Verify the full happy path end-to-end (needs funded keys)**

Run `npm run dev`, open `/admin`. Click 1→2→3→4b→5a→5b in order. Expected per the smoke test: after Dismissed + a 0.1 yield on a 1 USDC principal, tenant withdrawable ≈ 0.1, landlord ≈ 1.0. Use "↻ read escrow" to confirm `status=2 (Dismissed)`, `settled=true`.

- [x] **Step 4: Commit (checkpoint)**

```bash
git add src/app/admin
git commit -m "feat(app): add lifecycle runner with escrow state table"
```

---

## Task 13: ViolationEditor (shared store + matching updateStatus)

**Files:**
- Create: `app/src/app/admin/components/ViolationEditor.tsx`
- Modify: `app/src/app/admin/page.tsx`

- [x] **Step 1: Write `app/src/app/admin/components/ViolationEditor.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { STATUS_TO_NUM, NUM_TO_STATUS, type StatusName } from '@/lib/contracts'

export function ViolationEditor() {
  const [id, setId] = useState('')
  const [v, setV] = useState({ violationId: '999999', address: '123 Demo St', description: 'No heat/hot water', status: 'Open' as StatusName, date: '2026-06-14' })
  const [msg, setMsg] = useState('')

  useEffect(() => { fetch('/api/violation').then((r) => r.json()).then((d) => { if (d) setV(d) }) }, [])

  const saveStore = async () => {
    const r = await fetch('/api/violation', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(v) })
    setMsg(r.ok ? 'store updated' : 'store error')
  }
  const saveAndPost = async () => {
    await saveStore()
    if (id === '' || v.status === 'Open') { setMsg('store updated (no terminal on-chain post)'); return }
    const r = await fetch('/api/tx/updateStatus', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status: STATUS_TO_NUM[v.status] }) })
    const d = await r.json()
    setMsg(r.ok ? `store + on-chain updateStatus ok (${d.hash})` : `on-chain error: ${d.error}`)
  }

  return (
    <section className="rounded border border-slate-800 p-4 space-y-2">
      <h2 className="font-semibold">Mock violation (shared store)</h2>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label>violationId <input className="ml-1 bg-slate-800 px-1" value={v.violationId} onChange={(e) => setV({ ...v, violationId: e.target.value })} /></label>
        <label>date <input className="ml-1 bg-slate-800 px-1" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></label>
        <label className="col-span-2">address <input className="ml-1 w-2/3 bg-slate-800 px-1" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} /></label>
        <label className="col-span-2">description <input className="ml-1 w-2/3 bg-slate-800 px-1" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></label>
        <label>status
          <select className="ml-1 bg-slate-800 px-1" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as StatusName })}>
            {NUM_TO_STATUS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>escrow id (for on-chain) <input className="ml-1 w-20 bg-slate-800 px-1" value={id} onChange={(e) => setId(e.target.value)} /></label>
      </div>
      <div className="flex gap-2">
        <button onClick={saveStore} className="rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600">Save store only</button>
        <button onClick={saveAndPost} className="rounded bg-indigo-600 px-2 py-1 text-xs hover:bg-indigo-500">Save store + post status on-chain</button>
      </div>
      {msg && <p className="text-xs text-slate-400">{msg}</p>}
    </section>
  )
}
```

- [x] **Step 2: Mount it in `app/src/app/admin/page.tsx`** (import + render after `LifecycleRunner`).

- [x] **Step 3: Verify**

Run `npm run dev`, open `/admin`. Edit fields, "Save store only", then reload — fields persist (via GET). With a funded+settled-eligible escrow id, "Save store + post status on-chain" with status Dismissed/Closed should report a tx hash. Stop server.

- [x] **Step 4: Commit (checkpoint)**

```bash
git add src/app/admin
git commit -m "feat(app): add mock violation editor wired to shared store + oracle"
```

---

## Task 14: FunctionTester (generic call any function)

**Files:**
- Create: `app/src/app/admin/components/FunctionTester.tsx`
- Modify: `app/src/app/admin/page.tsx`

- [x] **Step 1: Write `app/src/app/admin/components/FunctionTester.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { publicClient } from '@/lib/chain'
import { VAULT, escrowVaultAbi } from '@/lib/contracts'

// Read-any: pick a view function, supply comma-separated args, see the raw result.
const READS = ['nextEscrowId', 'oracle', 'owner', 'usdc', 'yieldSource', 'withdrawable', 'escrows'] as const

export function FunctionTester() {
  const [fn, setFn] = useState<(typeof READS)[number]>('nextEscrowId')
  const [args, setArgs] = useState('')
  const [out, setOut] = useState('')

  const call = async () => {
    try {
      const parsed = args.trim() === '' ? [] : args.split(',').map((a) => {
        const s = a.trim()
        return /^\d+$/.test(s) ? BigInt(s) : s
      })
      const res = await publicClient.readContract({ address: VAULT, abi: escrowVaultAbi, functionName: fn, args: parsed as never })
      setOut(JSON.stringify(res, (_k, val) => (typeof val === 'bigint' ? val.toString() : val), 2))
    } catch (e) { setOut(`error: ${(e as Error).message}`) }
  }

  return (
    <section className="rounded border border-slate-800 p-4 space-y-2">
      <h2 className="font-semibold">Generic read tester</h2>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select className="bg-slate-800 px-1" value={fn} onChange={(e) => setFn(e.target.value as never)}>
          {READS.map((r) => <option key={r}>{r}</option>)}
        </select>
        <input className="w-64 bg-slate-800 px-1" placeholder="args, comma-separated (e.g. 0 or 0xabc…)" value={args} onChange={(e) => setArgs(e.target.value)} />
        <button onClick={call} className="rounded bg-indigo-600 px-2 py-1 text-xs hover:bg-indigo-500">call</button>
      </div>
      <p className="text-xs text-slate-500">Writes (createEscrow/fund/withdraw/updateStatus/setOracle/setYieldSource) run via the Lifecycle runner / API routes so they sign with the right role key.</p>
      <pre className="max-h-40 overflow-auto rounded bg-black/40 p-2 text-xs">{out}</pre>
    </section>
  )
}
```

- [x] **Step 2: Mount it in `app/src/app/admin/page.tsx`** (import + render after `ViolationEditor`).

- [x] **Step 3: Verify**

Run `npm run dev`, open `/admin`. Call `nextEscrowId` (no args), `escrows` with `0`, `withdrawable` with a role address. Confirm raw JSON output. Stop server.

- [x] **Step 4: Commit (checkpoint)**

```bash
git add src/app/admin
git commit -m "feat(app): add generic read-function tester"
```

---

## Task 15: EventLog (watch contract events)

**Files:**
- Create: `app/src/app/admin/components/EventLog.tsx`
- Modify: `app/src/app/admin/page.tsx`

- [x] **Step 1: Write `app/src/app/admin/components/EventLog.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { publicClient } from '@/lib/chain'
import { VAULT, escrowVaultAbi } from '@/lib/contracts'

export function EventLog() {
  const [lines, setLines] = useState<string[]>([])
  useEffect(() => {
    const unwatch = publicClient.watchContractEvent({
      address: VAULT, abi: escrowVaultAbi,
      onLogs: (logs) => setLines((prev) => [
        ...logs.map((l) => `${l.eventName} ${JSON.stringify(l.args, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}`),
        ...prev,
      ].slice(0, 50)),
      onError: (e) => setLines((p) => [`watch error: ${e.message}`, ...p]),
    })
    return () => unwatch()
  }, [])
  return (
    <section className="rounded border border-slate-800 p-4">
      <h2 className="mb-2 font-semibold">Live events</h2>
      <pre className="max-h-48 overflow-auto rounded bg-black/40 p-2 text-xs">{lines.join('\n') || 'waiting for events…'}</pre>
    </section>
  )
}
```

- [x] **Step 2: Mount it in `app/src/app/admin/page.tsx`** (import + render last).

- [x] **Step 3: Verify**

Run `npm run dev`, open `/admin`, run a lifecycle action (e.g. createEscrow). Within a few seconds the event appears in the log. Stop server.

- [x] **Step 4: Commit (checkpoint)**

```bash
git add src/app/admin
git commit -m "feat(app): add live event log"
```

---

## Task 16: Privy minimal real-wallet path

**Files:**
- Create: `app/src/app/admin/components/PrivyPanel.tsx`
- Modify: `app/src/app/admin/page.tsx`

- [x] **Step 1: Write `app/src/app/admin/components/PrivyPanel.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createWalletClient, custom } from 'viem'
import { arcTestnet } from '@/lib/chain'
import { VAULT, escrowVaultAbi } from '@/lib/contracts'
import { readUsdcBalance, readWithdrawable } from '@/lib/reads'
import { formatUsdc } from '@/lib/usdc'

export function PrivyPanel() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const [bal, setBal] = useState<bigint | null>(null)
  const [wd, setWd] = useState<bigint | null>(null)
  const [msg, setMsg] = useState('')

  const addr = wallets[0]?.address as `0x${string}` | undefined
  useEffect(() => {
    if (!addr) return
    readUsdcBalance(addr).then(setBal)
    readWithdrawable(addr).then(setWd)
  }, [addr])

  if (!appId) return <section className="rounded border border-slate-800 p-4 text-sm text-slate-500">Privy disabled (set NEXT_PUBLIC_PRIVY_APP_ID to enable the real-wallet path).</section>

  const withdraw = async () => {
    try {
      const w = wallets[0]; if (!w) throw new Error('no wallet')
      const provider = await w.getEthereumProvider()
      const client = createWalletClient({ account: addr!, chain: arcTestnet, transport: custom(provider) })
      const hash = await client.writeContract({ address: VAULT, abi: escrowVaultAbi, functionName: 'withdraw', args: [] })
      setMsg(`withdraw sent: ${hash}`)
    } catch (e) { setMsg(`error: ${(e as Error).message}`) }
  }

  return (
    <section className="rounded border border-slate-800 p-4 space-y-2 text-sm">
      <h2 className="font-semibold">Privy (real embedded wallet)</h2>
      {!ready ? <p>loading…</p> : !authenticated ? (
        <button onClick={login} className="rounded bg-emerald-600 px-3 py-1 hover:bg-emerald-500">Log in with Privy</button>
      ) : (
        <div className="space-y-1">
          <p>user: <code>{user?.id?.slice(0, 16)}…</code></p>
          <p>wallet: <code>{addr ?? '…'}</code></p>
          <p>USDC: {bal != null ? formatUsdc(bal) : '…'} · withdrawable: {wd != null ? formatUsdc(wd) : '…'}</p>
          <div className="flex gap-2">
            <button onClick={withdraw} className="rounded bg-indigo-600 px-2 py-1 hover:bg-indigo-500">withdraw() as this wallet</button>
            <button onClick={logout} className="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600">log out</button>
          </div>
        </div>
      )}
      {msg && <p className="text-xs text-slate-400">{msg}</p>}
    </section>
  )
}
```

- [x] **Step 2: Mount it in `app/src/app/admin/page.tsx`** (import + render; place after `RolePanel`).

- [x] **Step 3: Verify**

With `NEXT_PUBLIC_PRIVY_APP_ID` set, open `/admin`, click "Log in with Privy", complete login, confirm an embedded wallet address + USDC balance render. (Funding that wallet + a real withdraw is optional validation.) Without the env var, the panel shows the disabled note and the rest of the page works. Stop server.

- [x] **Step 4: Commit (checkpoint)**

```bash
git add src/app/admin
git commit -m "feat(app): add minimal Privy real-wallet validation panel"
```

---

## Task 17: Read-only tenant view

**Files:**
- Create: `app/src/app/tenant/page.tsx`

- [x] **Step 1: Write `app/src/app/tenant/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { readEscrow, readWithdrawable, type EscrowView } from '@/lib/reads'
import { formatUsdc } from '@/lib/usdc'
import type { Violation } from '@/lib/server/store'

export default function TenantView() {
  const [violation, setViolation] = useState<Violation | null>(null)
  const [clock, setClock] = useState<string>('')
  const [id, setId] = useState('0')
  const [esc, setEsc] = useState<EscrowView | null>(null)
  const [wd, setWd] = useState<bigint | null>(null)

  useEffect(() => {
    fetch('/api/violation').then((r) => r.json()).then(setViolation)
    fetch('/api/clock').then((r) => r.json()).then((d) => setClock(d?.now ?? ''))
  }, [])
  useEffect(() => {
    let on = true
    const tick = async () => {
      try {
        const e = await readEscrow(Number(id)); if (!on) return
        setEsc(e); setWd(await readWithdrawable(e.tenant))
      } catch { /* no such escrow yet */ }
    }
    tick(); const t = setInterval(tick, 5000)
    return () => { on = false; clearInterval(t) }
  }, [id])

  return (
    <main className="mx-auto max-w-xl space-y-5 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Your apartment</h1>
        {clock && <span className="text-xs text-slate-400">demo date: {clock}</span>}
      </div>
      <label className="text-sm">escrow id <input className="ml-1 w-16 bg-slate-800 px-1" value={id} onChange={(e) => setId(e.target.value)} /></label>

      <section className="rounded border border-slate-800 p-4">
        <h2 className="mb-1 font-semibold">HPD violation</h2>
        {violation ? (
          <div className="text-sm">
            <p>#{violation.violationId} · {violation.address}</p>
            <p className="text-slate-400">{violation.description}</p>
            <p className="mt-1">status: <b>{violation.status}</b>{violation.date ? ` · ${violation.date}` : ''}</p>
          </div>
        ) : <p className="text-slate-500">No violation on file.</p>}
      </section>

      <section className="rounded border border-slate-800 p-4 text-sm">
        <h2 className="mb-1 font-semibold">Your escrow</h2>
        {esc ? (
          <div className="space-y-1">
            <p>on-chain status: <b>{esc.statusName}</b> · {esc.settled ? 'settled' : esc.funded ? 'funded & locked' : 'awaiting funding'}</p>
            <p>rent locked: <b>{formatUsdc(esc.principal)}</b></p>
            <p>yield accruing to you{esc.settled ? ' (claimable)' : ''}: <b>{wd != null ? formatUsdc(wd) : '…'}</b></p>
          </div>
        ) : <p className="text-slate-500">No escrow at id {id}.</p>}
        <p className="mt-2 text-xs text-slate-500">Read-only view. Funding/withdrawing comes in the tenant portal.</p>
      </section>
    </main>
  )
}
```

- [x] **Step 2: Verify**

Run `npm run dev`. In `/admin`, set the violation in the store and run a lifecycle (create/fund id 0). Open `/tenant`, confirm it shows the same violation details + the on-chain escrow status/locked amount/withdrawable. Stop server.

- [x] **Step 3: Commit (checkpoint)**

```bash
git add src/app/tenant
git commit -m "feat(app): add read-only tenant view over shared store + chain"
```

---

## Task 18: PWA shell

**Files:**
- Create: `app/public/manifest.webmanifest`, `app/public/sw.js`, `app/public/icons/icon-192.png`, `app/public/icons/icon-512.png`
- Create: `app/src/app/sw-register.tsx`
- Modify: `app/src/app/layout.tsx` (mount the registrar)

- [x] **Step 1: Write `app/public/manifest.webmanifest`**

```json
{
  "name": "HPD Rent Escrow",
  "short_name": "RentEscrow",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#0f172a",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [x] **Step 2: Write `app/public/sw.js` (minimal, network-first)**

```js
self.addEventListener('install', (e) => self.skipWaiting())
self.addEventListener('activate', (e) => self.clients.claim())
self.addEventListener('fetch', (e) => {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)))
})
```

- [x] **Step 3: Generate the two PNG icons**

Create solid placeholder icons (replace with a real logo later). Run from `app/`:
```bash
mkdir -p public/icons
# 1x1 indigo PNGs scaled by the browser are acceptable placeholders; if ImageMagick is available:
command -v magick >/dev/null && magick -size 192x192 xc:#4f46e5 public/icons/icon-192.png || echo "create public/icons/icon-192.png manually"
command -v magick >/dev/null && magick -size 512x512 xc:#4f46e5 public/icons/icon-512.png || echo "create public/icons/icon-512.png manually"
```
Expected: both PNGs exist. If ImageMagick is absent, drop any 192px and 512px PNGs at those paths.

- [x] **Step 4: Write `app/src/app/sw-register.tsx`**

```tsx
'use client'
import { useEffect } from 'react'

export function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  return null
}
```

- [x] **Step 5: Mount it in `app/src/app/layout.tsx`**

Add the import and render inside `<body>` (alongside `<Providers>`):
```tsx
import { SwRegister } from './sw-register'
// inside <body>, before {children} provider:
        <SwRegister />
```

- [x] **Step 6: Verify installability**

Run `npm run build && npm run start`, open `http://localhost:3000` in Chrome, DevTools → Application → Manifest shows the manifest + icons and "Installable". Stop server.

- [x] **Step 7: Commit (checkpoint)**

```bash
git add public/manifest.webmanifest public/sw.js public/icons src/app/sw-register.tsx src/app/layout.tsx
git commit -m "feat(app): add PWA manifest, service worker, install support"
```

---

## Task 19: Playwright smoke + final verification

**Files:**
- Create: `app/playwright.config.ts`, `app/tests/admin.spec.ts`

- [x] **Step 1: Write `app/playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 60_000 },
  use: { baseURL: 'http://localhost:3000' },
})
```

- [x] **Step 2: Write `app/tests/admin.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test('admin panel renders its sections', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Admin / Test Panel' })).toBeVisible()
  await expect(page.getByText('Lifecycle runner')).toBeVisible()
  await expect(page.getByText('Mock violation (shared store)')).toBeVisible()
  await expect(page.getByText('Live events')).toBeVisible()
})

test('tenant view renders', async ({ page }) => {
  await page.goto('/tenant')
  await expect(page.getByRole('heading', { name: 'Your apartment' })).toBeVisible()
})
```

- [x] **Step 3: Install Playwright browser + run the smoke**

```bash
npx playwright install chromium
npm run e2e
```
Expected: both tests pass. (Requires `.env.local` with at least throwaway keys so `/api/roles` doesn't 500; the panel headings render regardless of chain state.)

- [x] **Step 4: Run the full verification sweep**

```bash
npm run typecheck && npm test && npm run build
```
Expected: typecheck clean, unit tests pass, production build succeeds.

- [x] **Step 5: Commit (checkpoint)**

```bash
git add playwright.config.ts tests
git commit -m "test(app): add Playwright smoke for admin + tenant"
```

---

## Task 20: Deployment notes + AI usage log

**Files:**
- Create: `app/README.md`
- Modify: `AI_USAGE_app.md` (repo root)

- [x] **Step 1: Write `app/README.md`**

````markdown
# app/ — HPD Rent Escrow frontend

Next.js admin/test panel + read-only tenant view for the EscrowVault on Arc testnet.

## Local dev
```bash
cd app
cp .env.local.example .env.local   # fill in 4 funded Arc testnet keys; KV optional (in-memory fallback)
npm install
npm run dev                        # http://localhost:3000/admin
```

## Env vars
- `TENANT_PRIVATE_KEY`, `LANDLORD_PRIVATE_KEY`, `CONTRACTOR_PRIVATE_KEY`, `ORACLE_PRIVATE_KEY` — server-only signers (Circle faucet: https://faucet.circle.com).
- `NEXT_PUBLIC_PRIVY_APP_ID` — optional, enables the Privy panel.
- `KV_REST_API_URL`, `KV_REST_API_TOKEN` — Vercel KV; omit locally for in-memory store.

## Deploy (Vercel)
1. New Vercel project, **Root Directory = `app`**.
2. Add the env vars above (mark the 4 keys + KV as not-public).
3. Add a Vercel KV (Upstash) integration to populate the KV vars.
4. Deploy → HTTPS URL works as a PWA (add to home screen).

## Scripts
`npm run dev | build | start | typecheck | test | e2e`
````

- [x] **Step 2: Append an entry to `AI_USAGE_app.md`**

Add under `## Log`:
```markdown
### 2026-06-14 — Frontend app implementation (scaffold + admin panel + tenant view)
- **Directed by:** Nilesh (frontend owner).
- **What:** Implemented the first frontend slice per `docs/app/2026-06-14-app-admin-panel-plan.md`:
  Next.js scaffold in `app/`, Arc chain + contract config, 6-decimal USDC helpers,
  shared Vercel KV store (in-memory fallback) with violation/clock API routes,
  server-signed `/api/tx/[action]` and `/api/roles`, client read helpers, the admin
  panel (status bar, role panel, lifecycle runner, violation editor, generic function
  tester, live event log, minimal Privy panel), the read-only tenant view, a PWA shell,
  and Vitest + Playwright smoke tests.
- **Files touched:** everything under `app/`, `AI_USAGE_app.md`.
```

- [x] **Step 3: Final verification**

Run from `app/`: `npm run typecheck && npm test && npm run build`
Expected: all green.

- [x] **Step 4: Commit (checkpoint)**

```bash
git add app/README.md AI_USAGE_app.md
git commit -m "docs(app): add app README and log frontend implementation in AI_USAGE_app.md"
```

---

## Self-review notes

- **Spec coverage:** scaffold (T1), Next.js+Tailwind+Vercel+API routes (T1,T6–T8), hybrid signing — server keys (T5,T8) + minimal Privy (T16); fully-mocked NYC status via shared store readable by tenant (T4,T7,T17); Vercel KV + in-memory fallback (T4); admin panel five parts — status bar (T11), lifecycle runner (T12), violation editor (T13), generic tester (T14), event log (T15), role/balances (T11); read-only tenant view (T17); error handling — 6dp helpers (T3), approve→wait→fund (T8), surfaced reverts (T8/T12 logs), gas balance highlight (T11), chain config guard (T2); PWA (T18); testing — usdc + store units (T3,T4), Playwright smoke (T19). All spec sections map to a task.
- **Type consistency:** `Role`, `StatusName`, `EscrowView`, `Violation`, `Roles`, `toMicro/fromMicro/formatUsdc`, `readEscrow/readConfig/readWithdrawable/readUsdcBalance/readYieldInfo`, `walletFor/accountFor/keyFor` are defined once and reused with matching signatures across tasks.
- **Open item resolved:** simulate-yield = `USDC.transfer(YIELD_SOURCE, amount)` (verified against `MockYieldSource.sol` + `scripts/smoke.sh`).
