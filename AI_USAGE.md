# AI Usage Log

A running record of where AI (Claude Code, Opus 4.8) assisted on this project and
which files each session touched. Per ETHGlobal "From Scratch" rules, AI is a
directed tool: a human authors every commit, reviews every diff, and AI
attribution stays on (Co-Authored-By trailer). Prompts, specs, and planning
artifacts that directed the AI live in [specs/](specs/).

## Log

### 2026-06-13 — Repo setup
- **Directed by:** Don
- **What:** Bootstrapped the repository scaffolding for the build.
- **Files touched:**
  - `CLAUDE.md` — committed the project-context file (authored separately).
  - `AI_USAGE.md` — created this log, seeded with this session.
  - `specs/README.md` — created the specs folder and its README.
  - `.gitignore` — added Foundry + Node ignore rules.
- **Notes:** Each step landed as its own commit. `forge init` was deferred —
  Foundry is not yet installed in this environment; the contracts will be
  scaffolded in a later session.
