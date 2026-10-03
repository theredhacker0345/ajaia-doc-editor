# AI Workflow Note — Ajaia Docs

> **Personalize before submitting:** this note is intentionally honest about heavy AI use, because the role is AI-native and the assignment grades *practical, mature* AI usage — not the absence of it. Edit the tool names and details below to match what you actually did, and make sure you can explain every decision in it during the interview.

## What I built and with what

I built **Ajaia Docs** — a collaborative document editor on Cloudflare Workers + D1 + React/TipTap — as a human-AI pair. I drove product decisions, architecture, and review; AI tools (an agentic coding assistant) executed scaffolding, implementation, and test generation under my direction. I treated the AI like a fast junior engineer whose work I merge only after review.

The build happened in two sessions. **Session 1** shipped the core slice (documents, sharing, attachments, tests). **Session 2 (v2)** was a hardening + UX pass on the working app: an ALTCHA proof-of-work gate on sign-in, a profile page, security headers + CSP, a full design-system rewrite, and a round of bug fixes — details below, including two real bugs that only the browser E2E caught.

## Tools used

- **Agentic AI coding assistant** (chat-driven, repo-aware): scaffolding the Vite/Workers/D1 project, implementing the Hono API routes, React components, CSS, tests, and docs.
- **A frontend-styling subagent** (session 2): executed the design-system rewrite — token-based `index.css`, shell/sidebar/topbar, save pill, toasts, modals, responsive breakpoints — against my direction and screenshots, then I reviewed it in the browser.
- **A UI/UX skill pack (`ui-ux-pro-max`)**: consulted before the rewrite for design-token conventions (type scale, spacing, focus rings, accessible contrast) — useful as a checklist, not followed blindly.
- **AI-assisted debugging**: reading error logs from `wrangler dev` and the smoke suite to locate fixes fast.

## Where AI materially sped things up

1. **Boilerplate & plumbing** — package.json/wrangler config/tsconfig, D1 migration SQL, Hono route skeletons, the debounced-autosave hook. This is hours of typing compressed to minutes.
2. **Breadth of the API surface** — documents, sharing, and attachments endpoints plus consistent JSON error semantics were generated against my spec, then I reviewed each access check line-by-line.
3. **Test generation** — the permission-matrix unit tests and the curl smoke script were drafted by AI from my test plan, then tightened by me (now 33 unit tests + 51 smoke checks).
4. **ALTCHA proof-of-work, implemented from the spec** — I pointed the assistant at the altcha.org v1 protocol and the constraint "Web Crypto only, zero dependencies"; it produced the challenge/verify module, the blob-URL solver Web Worker, the replay ledger, and the 8 unit tests in one pass. Reviewing crypto-adjacent code took longer than writing it would have, but it was review, not authorship.
5. **Docs** — first drafts of README/ARCHITECTURE from my bullet-point decisions; I edited for accuracy and voice.

## What I changed or rejected from AI output

- **Rejected real-time collaboration via Durable Objects**: the AI proposed it early; I cut it to protect the timebox and recorded it as roadmap. Scope judgment stayed human.
- **Caught a real security bug during review/testing**: the anonymous-access path of the access resolver returned `canView: true` if a stale share role existed. My test suite flagged it; I fixed the resolver to fail-closed. This is exactly why I never trust generated code without adversarial tests.
- **Caught an integration bug**: D1 returns BLOBs as number arrays; the naive attachment-download response stringified bytes. The smoke suite's byte-fidelity check caught it; fixed with an explicit `Uint8Array` normalization.
- **Fixed a routing bug**: document-scoped attachment routes were mounted at the wrong base path (`/api/attachments/:id/attachments`). Smoke suite caught it at 404s.
- **Simplified AI's sharing proposal** from three roles (owner/editor/viewer/commenter) to two — commenter was out of scope and would dilute testing depth.
- **Rewrote generated CSS** to match the Google-Docs-ish look I wanted (clean sheet layout, sticky toolbar) rather than accepting the generic dashboard styling — then, in session 2, had the styling subagent redo it properly as a token-based design system instead of patching the old CSS again.

Session 2 added three more catches — all found by browser E2E (Playwright), not by the unit suite, which is exactly why that step exists:

- **A `useEffect`-destroys-the-page crash**: a braceless arrow in `ScrollToTop` (`useEffect(() => window.scrollTo(...))`) returned the `window.scrollTo` return value as the effect's cleanup function, so React threw on unmount. Classic one-character-class bug; fixed by adding braces.
- **A phantom-autosave race**: typing that landed while a save was in flight could be overwritten by the stale response, and the pill could show "Saved" for content that had changed. Fixed with a content-reference + last-saved-JSON guard (stale responses detected by reference equality, no-op normalizations never mark the doc dirty) — described from the architecture side in ARCHITECTURE.md §5.
- **A mobile layout bug**: the sidebar didn't collapse to a top bar on small screens until the flex direction was fixed at the ≤900px breakpoint; verified at 390px width.

## How I verified correctness, UX, and reliability

1. **Automated**: 33 unit tests (permissions, validation, session tokens, ALTCHA proof-of-work) + 51-check end-to-end smoke suite (ALTCHA challenge/replay, auth, CRUD, sharing roles, revoke, attachments, profile, error codes) — all green.
2. **Type safety**: strict TypeScript across `src/` and `worker/` with clean `tsc --noEmit` runs.
3. **Browser E2E (Playwright)**: full user flow — sign in with the ALTCHA pill, dashboard, editor typing with dirty→saved pill, share with Aisha, profile stats, Markdown export, mobile 390px layout, sign-out/sign-in round-trip — browser console clean. This is the layer that caught the three session-2 bugs above.
4. **Deployment check**: verified on a local `wrangler dev` (same runtime as production) before deploying.

## Reflection

AI was a genuine accelerator — probably 3-4x on implementation speed — but every judgment call that the brief grades (scope cuts, permission matrix, storage choices, what to test adversarially) was made by me, verified by tests I specified, and is defensible in a walkthrough. Where AI output was wrong (four instances in session 1, three more in session 2), my verification loop is what caught it — and in session 2 it was the browser, not the unit suite, doing the catching.
