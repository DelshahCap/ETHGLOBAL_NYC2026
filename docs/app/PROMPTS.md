initial with Claude code:

/superpowers:brainstorming read CLAUDE.md, and README.md I am responsible for creating the UI/UX - read FRONTEND-PLANS.md is a general outline, and the first task is to create an admin panel to run tests on all the functions and individual workflows in INTEGRATION.md; I do not want to touch the existing code base, but rather an "app" directory in this repository where I will work on the website either via lovable or from scratch - but it will have to be live and hostable. Additionally the app should be a PWA mobile friendly app - but could start off as a regular website, especially for testing.

/superpowers:brainstorming read CLAUDE.md, and README.md I am responsible for creating the UI/UX - read FRONTEND-PLANS.md as a general outline. ./docs/app/2026-06-13-app-admin-panel-design.md describes a first pass currently under review of the tech stack and plan for the admin/test page. The purpose of this sub-project is to start to create plans to mock up the homepage and various portals. 

---

## Conventions prompt — repo file placement & logging (frontend track)

> Paste at the start of any frontend session so it follows the house rules. It does
> NOT say what to build — describe that separately.

```
Before doing anything, read CLAUDE.md at the repo root (project context + working
rules) and obey my global ~/.claude/CLAUDE.md preferences.

This is an ETHGlobal NY 2026 monorepo with two tracks. Don owns the contracts; I
(Nilesh) own the frontend. Stay in the frontend track:

- DO NOT touch contract/Foundry code: src/, test/, script/, scripts/, lib/,
  foundry.toml, deployments/.
- ALL frontend application code goes under the top-level `app/` directory.
- Frontend planning, specs, and prompts go in `docs/app/`. (The `specs/` folder is
  the contracts track's planning area, per CLAUDE.md — don't put frontend docs there.)
- Reference, don't duplicate: docs/INTEGRATION.md is the verified contract interface;
  docs/app/ holds the design + outline.

LOGGING: record AI work in AI_USAGE_app.md (the FRONTEND log at repo root). Do NOT
edit the root AI_USAGE.md — that's the contracts track and editing it risks merge
conflicts with Don. Append a dated entry matching the existing format: who directed
it, what was done, and the files touched.

COMMITS: don't commit by default — leave changes in the working tree and tell me what
to review. You may author a commit, but only when I explicitly authorize that specific
commit (one go-ahead isn't standing permission). Keep AI attribution on when you do
commit (Co-Authored-By trailer; I am the author). Work in small, logical steps.
```

----
Based on our project description and the audience, generate a prompt to generate a design system for claude design

project description:
In NYC, landlords must fix conditions flagged by **HPD** (Housing Preservation &
Development). A tenant's usual options are to keep paying and hope, or withhold and
risk eviction. This gives a third option: the tenant pays rent **into an on-chain
escrow** while an HPD violation is open. The funds are real and committed but locked —
the landlord gets them only once the violation is officially resolved, turning "please
fix my apartment" into a funded incentive. While locked, the escrowed USDC earns yield,
and that **yield goes to the tenant**.

Audience:
Tenant - a renter of a multifamily apartment unit in NYC. Age may trend younger since this will be a web3 product and likely a mobile app (or PWA). 
Contractors and Landlords will trend towards less tech literacy so in all cases - best effort should be made to make this as user friendly as possible.

-> generated prompts from claude:
Plumb — Rent escrow that keeps everyone on the level.

Plumb is a NYC rent-escrow product. When a tenant has an open HPD (Housing
Preservation & Development) violation, they pay rent into an on-chain escrow
instead of straight to the landlord. The money is real and committed but
locked: the landlord receives it only once the violation is officially
resolved. While it's held, the balance sits as USDC and earns yield — and that
yield goes to the tenant.

Plumb puts tenant, landlord, and contractor on equal footing. Instead of "pay
and hope" or "withhold and risk eviction," repairs become a funded, fair
incentive everyone can see. The name says it: plumb and level are the tools
that tell you something's built true — Plumb keeps the rent relationship on
the level for all sides.

- and
DESIGN SYSTEM GOALS
Build a complete design system: color palette (semantic status tokens),
typography scale, spacing, and a core component set (buttons, inputs, cards,
status badges, progress/timeline, modals, tables, empty states, toasts). Show
light and dark modes.

BRAND METAPHOR — "ON THE LEVEL"
The name comes from the builder's tools: plumb (vertical/true) and level
(horizontal/fair). The whole brand should feel like something built correctly
and on the level — honest, square, balanced. Equal footing for everyone is the
core idea. Optional subtle visual motif: a spirit-level bubble or a true
horizon line that "centers" when a violation is resolved — usable as a
status/progress indicator.

AUDIENCE & TONE
Three very different users on the same product:
- Tenants: skew younger, mobile-first, app-comfortable. Primary user.
- Landlords and contractors: lower tech literacy, may distrust "crypto."
Tone is a trustworthy financial/civic utility, NOT a flashy crypto dapp. Calm,
plain-language, even-handed. Critically: never frame the landlord as the
villain — Plumb is neutral infrastructure that protects all sides and just
makes the deal work. Voice can lean on "on the level," "equal footing,"
"everyone can see where the money is." Hide blockchain jargon behind familiar
words (wallet = "your account," USDC = "your balance / dollars," on-chain
escrow = "held safely until repairs are done").

KEY UX MOMENTS TO DESIGN COMPONENTS FOR
- Escrow status timeline: Open violation -> Funds locked -> Resolved -> Funds
  released. Clear and reassuring; this is where the "level bubble" can live.
- Tenant earnings: yield shown as savings, not speculation.
- Landlord view: make the incentive obvious — "Resolve the violation to
  receive $X." Same facts visible to both sides = fairness.
- Trust/safety signals: where the money is, that it's real and committed, what
  happens next.

CONSTRAINTS
Mobile-first, PWA-friendly. High accessibility: large tap targets, strong
contrast (WCAG AA+), readable defaults for non-technical and older users.
Minimal cognitive load — one primary action per screen. Avoid neon/"degen"
aesthetics, heavy gradients, and dark-pattern urgency.

DIRECTION
Modern civic-fintech: confident, clean, a little warm. The trustworthiness of
a banking app crossed with the approachability of a tenant-rights tool. No
stock crypto imagery.
----
