# AI Usage Log — Frontend (`app/`)

A running record of where AI (Claude Code, Opus 4.8) assisted on the **frontend**
work, kept separate from the root [`AI_USAGE.md`](AI_USAGE.md) to avoid merge
conflicts between the frontend (Nilesh) and contracts (Don) tracks. Same rules
apply: AI is a directed tool, a human authors every commit and reviews every diff,
and AI attribution stays on (Co-Authored-By trailer). Frontend planning artifacts
live in [`docs/app/`](docs/app/).

## Log

### 2026-06-13 — Frontend app design (brainstorm → spec)
- **Directed by:** Nilesh (frontend owner).
- **What:** Ran a structured brainstorming pass for the first frontend slice — a new
  isolated `app/` directory whose first job is an admin/test panel exercising every
  function and workflow in `docs/INTEGRATION.md`, plus a read-only tenant view.
  Settled the stack and approach through Q&A: Next.js (App Router) + Tailwind on
  Vercel, hybrid signing (server-side configured test keys for fast function testing
  + a minimal Privy path to validate the real embedded-wallet flow), fully-mocked
  NYC violation status backed by a shared Vercel KV store the tenant view also reads,
  PWA shell for phone-homescreen demos. Existing contract/Foundry code untouched.
  Wrote the design to `docs/app/`. No implementation code yet; implementation plan next.
- **Files touched:** `docs/app/2026-06-13-app-admin-panel-design.md`, `AI_USAGE_app.md`.

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

### 2026-06-14 — Subagent-driven execution, review & merge to main
- **Directed by:** Nilesh (frontend owner).
- **What:** Executed the plan (`docs/app/2026-06-14-app-admin-panel-plan.md`) via
  subagent-driven development — a fresh implementer subagent per task, each followed
  by a two-stage review (spec compliance, then code quality) before the change was
  committed. The reviews caught and fixed real issues rather than rubber-stamping:
  the `.env.local.example` `.gitignore` trap (file could never be committed), a
  wrong-status write in `/api/tx/[action]` (now validates status is 0–2), the Privy
  v3 nested `embeddedWallets` API change, a no-`PrivyProvider` crash when Privy is
  disabled (fixed via an outer/inner component split), and an ambiguous Playwright
  selector. Also bumped the tsconfig target to ES2020 (BigInt literals) and wrote an
  admin-panel usage/test guide. Final whole-implementation review passed; verification
  sweep green (typecheck, 6 Vitest tests, production build, Playwright smoke 2/2).
- **Merged:** `feat/app-admin-panel` → `main` (merge commit `12bc864`), bringing the
  frontend slice in alongside Don's Chainlink CRE oracle track.
- **Files touched:** everything under `app/`, `docs/app/admin-test-panel-guide.md`,
  `AI_USAGE_app.md`.

### 2026-06-14 — Homepage login/sign-up with Privy email + role capture
- **Directed by:** Nilesh (frontend owner).
- **What:** Added a real login/sign-up entry on the homepage. Reviewed the Privy v3
  React SDK (via Context7) against our stack and corrected the described flow to how
  Privy actually works: passwordless email + one-time passcode (no password), a single
  unified login/sign-up call (Privy decides new-vs-returning — no manual "email not
  found" branch), and automatic embedded-wallet provisioning via the existing
  `embeddedWallets.createOnLogin = 'users-without-wallets'` provider config (no manual
  create-wallet call). Used the prebuilt Privy email modal for auth (`useLogin` with an
  `onComplete`/`isNewUser` callback) and added the one thing the modal can't ask — a
  one-time role step (tenant/landlord/contractor) for new sign-ups. Persisted the
  self-declared role per Privy user id in the existing KV store via a new `/api/profile`
  route (in-memory fallback locally). Note: this `UserRole` is distinct from the four
  fixed demo signer roles in `lib/server/keys.ts`; the POST is unauthenticated for the
  demo (flagged in-code to verify the Privy access token in production). Typecheck green.
- **Files touched:** `app/src/lib/profile.ts`, `app/src/lib/server/profiles.ts`,
  `app/src/app/api/profile/route.ts`, `app/src/app/components/TenantAuth.tsx`,
  `app/src/app/page.tsx`, `AI_USAGE_app.md`.

### 2026-06-14 — Landlord & contractor dashboards + role-based routing
- **Directed by:** Nilesh (frontend owner).
- **What:** Added desktop dashboards for the other two parties. Verified the on-chain
  model first: `withdrawable(account)` + `withdraw()` is a pull-payment that already
  serves all parties (landlord pulls principal, contractor pulls fee on the corrected
  path), and create/fund stay tenant-only — so both roles share one `PartyDashboard`
  component parameterized by role (status hero, HPD violation card, wallet row, and a
  Withdraw button that appears once the escrow settles). Added `/landlord` and
  `/contractor` routes (guarded on `NEXT_PUBLIC_PRIVY_APP_ID` like the tenant view),
  wired role-based routing in `TenantAuth` (tenant→/tenant, landlord→/landlord,
  contractor→/contractor) for both the post-signup step and returning users, and added
  dev-console quick links. Reused the existing read/action layer and the tenant view's
  RentShield visual language (self-contained to avoid touching the working tenant page).
  Privy email login confirmed working live on Vercel (after allowlisting the preview
  origin in the Privy dashboard — `invalid_origin` was a dashboard setting, not code).
  Typecheck + production build green; `/landlord` and `/contractor` register.
- **Files touched:** `app/src/app/components/PartyDashboard.tsx`,
  `app/src/app/landlord/page.tsx`, `app/src/app/contractor/page.tsx`,
  `app/src/app/components/TenantAuth.tsx`, `app/src/app/page.tsx`, `AI_USAGE_app.md`.

### 2026-06-14 — Admin users list + profile persistence diagnosis
- **Directed by:** Nilesh (frontend owner).
- **What:** Nilesh reported a returning email re-asked the role. Diagnosed (not a
  lookup bug): profiles are keyed by stable Privy DID, but `getKv()` falls back to an
  in-memory Map when `KV_REST_API_*` is unset, which on Vercel serverless is
  per-invocation/ephemeral — the POST saved, but later GETs (and the redeploy) saw an
  empty store. Fix is two-part: provision Vercel KV (infra, Nilesh's side) + add a
  durable user index. Implemented the index: `setProfile` now also maintains a
  `profile:index` list and records the embedded wallet address; added `listProfiles()`
  and `/api/profile?all=1`; built an admin **Users** panel (email, role, wallet, Privy
  id) with a refresh + an empty-state hint pointing at KV config. Typecheck + build green.
- **Files touched:** `app/src/lib/profile.ts`, `app/src/lib/server/profiles.ts`,
  `app/src/app/api/profile/route.ts`, `app/src/app/components/TenantAuth.tsx`,
  `app/src/app/admin/components/UsersPanel.tsx`, `app/src/app/admin/page.tsx`,
  `AI_USAGE_app.md`.

### 2026-06-14 — Provision KV; switch store to @upstash/redis
- **Directed by:** Nilesh (frontend owner).
- **What:** Nilesh provisioned a Vercel-connected Upstash store (`upstash-kv-carmine-mirror`,
  standard `KV_REST_API_*` env). Made `kv.ts` accept either `KV_REST_API_*` or
  `UPSTASH_REDIS_REST_*` naming and added a `/api/kv-status` diagnostic (reports
  `{ backend, roundtrip }`). On review, an `npm install` had added two unused runtime
  deps (`@upstash/redis`, plus the `vercel` CLI as a prod dependency); per Nilesh's
  call, kept `@upstash/redis` and rewired `kv.ts` to use its `Redis` client directly,
  then removed the unused `vercel` and `@vercel/kv` deps (cleaning the transitive
  lockfile bloat). Secrets stay in gitignored `.env.local` / Vercel env — never committed.
  Typecheck, 9 unit tests, and production build all green.
- **Files touched:** `app/src/lib/server/kv.ts`, `app/src/app/api/kv-status/route.ts`,
  `app/package.json`, `app/package-lock.json`, `AI_USAGE_app.md`.

### 2026-06-14 — In-app test-USDC faucet (funding as a workflow step)
- **Directed by:** Nilesh (frontend owner).
- **What:** Made wallet funding a first-class step instead of a passive Circle-faucet
  hint. Added a server-signed faucet: `/api/fund` transfers test USDC from a funded
  `FAUCET_PRIVATE_KEY` account to the connected Privy wallet (USDC is gas on Arc),
  capped at 25/req with graceful "not configured" when the key is absent. Built a
  shared `AddFundsButton` ("Add 5 test USDC") wired into the tenant and
  landlord/contractor wallet rows, refreshing the balance on success. Nilesh chose the
  server-faucet approach over a guided Circle-faucet step, accepting a low-value funded
  key in Vercel env (a deliberate exception to the "no server keys on Vercel" default,
  scoped to a demo faucet). Documented `FAUCET_PRIVATE_KEY` in `.env.local.example`.
  Typecheck, 9 unit tests, and production build green; `/api/fund` registers.
- **Files touched:** `app/src/lib/server/keys.ts`, `app/src/lib/server/wallets.ts`,
  `app/src/app/api/fund/route.ts`, `app/src/lib/faucet.ts`,
  `app/src/app/components/AddFundsButton.tsx`, `app/src/app/tenant/page.tsx`,
  `app/src/app/components/PartyDashboard.tsx`, `app/.env.local.example`, `AI_USAGE_app.md`.
