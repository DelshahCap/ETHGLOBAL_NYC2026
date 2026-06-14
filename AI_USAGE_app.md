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
