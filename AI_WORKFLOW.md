# AI Workflow Note — Ajaia Docs

> **Personalize before submitting:** this note is intentionally honest about heavy AI use, because the role is AI-native and the assignment grades *practical, mature* AI usage — not the absence of it. Edit the tool names and details below to match what you actually did, and make sure you can explain every decision in it during the interview.

## What I built and with what

I built **Ajaia Docs** — a collaborative document editor on Cloudflare Workers + D1 + React/TipTap — as a human-AI pair. I drove product decisions, architecture, and review; AI tools (an agentic coding assistant) executed scaffolding, implementation, and test generation under my direction. I treated the AI like a fast junior engineer whose work I merge only after review.

## Tools used

- **Agentic AI coding assistant** (chat-driven, repo-aware): scaffolding the Vite/Workers/D1 project, implementing the Hono API routes, React components, CSS, tests, and docs.
- **AI-assisted debugging**: reading error logs from `wrangler dev` and the smoke suite to locate fixes fast.

## Where AI materially sped things up

1. **Boilerplate & plumbing** — package.json/wrangler config/tsconfig, D1 migration SQL, Hono route skeletons, the debounced-autosave hook. This is hours of typing compressed to minutes.
2. **Breadth of the API surface** — documents, sharing, and attachments endpoints plus consistent JSON error semantics were generated against my spec, then I reviewed each access check line-by-line.
3. **Test generation** — the permission-matrix unit tests and the 38-check curl smoke script were drafted by AI from my test plan, then tightened by me.
4. **Docs** — first drafts of README/ARCHITECTURE from my bullet-point decisions; I edited for accuracy and voice.

## What I changed or rejected from AI output

- **Rejected real-time collaboration via Durable Objects**: the AI proposed it early; I cut it to protect the timebox and recorded it as roadmap. Scope judgment stayed human.
- **Caught a real security bug during review/testing**: the anonymous-access path of the access resolver returned `canView: true` if a stale share role existed. My test suite flagged it; I fixed the resolver to fail-closed. This is exactly why I never trust generated code without adversarial tests.
- **Caught an integration bug**: D1 returns BLOBs as number arrays; the naive attachment-download response stringified bytes. The smoke suite's byte-fidelity check caught it; fixed with an explicit `Uint8Array` normalization.
- **Fixed a routing bug**: document-scoped attachment routes were mounted at the wrong base path (`/api/attachments/:id/attachments`). Smoke suite caught it at 404s.
- **Simplified AI's sharing proposal** from three roles (owner/editor/viewer/commenter) to two — commenter was out of scope and would dilute testing depth.
- **Rewrote generated CSS** to match the Google-Docs-ish look I wanted (clean sheet layout, sticky toolbar) rather than accepting the generic dashboard styling.

## How I verified correctness, UX, and reliability

1. **Automated**: 25 unit tests (permissions, validation, session tokens) + 38-check end-to-end smoke suite (auth, CRUD, sharing roles, revoke, attachments, error codes) — all green.
2. **Type safety**: strict TypeScript across `src/` and `worker/` with clean `tsc --noEmit` runs.
3. **Manual pass**: full user flow in the browser — sign in as seeded users, create/format/edit with autosave, rename, import .docx/.md/.txt, share editor vs viewer across two sessions, upload/download attachments, verify persistence across refresh.
4. **Deployment check**: verified on a local `wrangler dev` (same runtime as production) before deploying.

## Reflection

AI was a genuine accelerator — probably 3-4x on implementation speed — but every judgment call that the brief grades (scope cuts, permission matrix, storage choices, what to test adversarially) was made by me, verified by tests I specified, and is defensible in a walkthrough. Where AI output was wrong (four instances above), my verification loop is what caught it.
