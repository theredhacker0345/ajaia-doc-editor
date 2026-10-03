Ajaia Docs — AI-Native Full Stack Developer Assignment
Candidate: Ubaid ur Rehman (arifubaid0345@gmail.com)

Live app: https://ajaia-doc-editor.arifubaid0345.workers.dev
Source code: [Google Drive folder link]
Walkthrough video: [REPLACE with your Loom/YouTube link]

WHAT I BUILT
A lightweight collaborative document editor ("Ajaia Docs") on Cloudflare Workers + D1 + React/TipTap — a single free-tier deployment, no paid dependencies.
- Documents: create / rename / delete, rich text (bold, italic, underline, H1-H3, blockquote, bullet & numbered lists), autosave (~1s) with an honest 4-state save pill, formatting persisted as structured ProseMirror JSON, one-click Markdown export (.md download).
- Sign-in: one-click mock auth (allowed by the brief) gated by an ALTCHA proof-of-work (altcha.org v1) — implemented from scratch on Web Crypto, zero deps; solved puzzles are single-use via a D1 replay ledger.
- File upload: import .txt / .md / .docx into a new editable document (parsed client-side via mammoth/marked) + attachments up to 2 MB (types limited to txt, md, markdown, docx, pdf, png, jpg, jpeg, gif, csv, json — stated in the UI and README).
- Sharing: owner grants editor or viewer by email (recipients auto-provisioned), owned vs "Shared with me" sections, share avatars, revoke UI. All access checks enforced server-side.
- Profile page: usage stats (owned docs, shared with me, grants, collaborators, attachments), recent documents, editable name/title/bio/location/website — every field sanitized server-side.
- Security headers: X-Content-Type-Options, X-Frame-Options: DENY, Referrer-Policy, Cache-Control: no-store, Permissions-Policy, and a CSP on both the API and the static SPA.
- Quality: 33 unit tests (permission matrix, validation, session tokens, ALTCHA PoW) + a 51-check end-to-end curl smoke suite; strict TypeScript; SQL migrations + seeds; full docs (README, ARCHITECTURE.md, AI_WORKFLOW.md, SUBMISSION.md).

HOW TO TEST IN 2 MINUTES
1. Open the live URL, sign in with one click as "Ubaid" (ubaid@aajaia.dev) — an ALTCHA pill verifies you're human automatically (~1s).
2. New document -> type, apply formatting, watch the save pill (unsaved -> saving -> saved).
3. Export as Markdown, or import a .docx / .md file from the dashboard.
4. Share -> add aisha@aajaia.dev as "Can edit" -> sign out -> sign in as Aisha -> edit under "Shared with me".
5. As Ubaid: switch Aisha to "Can view" (read-only), try Attachments (<= 2 MB), and open the Profile page.

CREDENTIALS (mock auth, one-click, no passwords)
ubaid@aajaia.dev / aisha@aajaia.dev / carlos@aajaia.dev / priya@aajaia.dev

WHAT'S WORKING END-TO-END
Editing + honest autosave + persistence across refresh, Markdown export, import, sharing roles + revoke, attachments, profile page, ALTCHA-gated sign-in (replay-proof), security headers, error handling (400/401/403/404), deployment, tests.

WHAT'S INCOMPLETE (DELIBERATE CUTS — rationale in ARCHITECTURE.md)
Real-time multi-user editing (autosave + last-write-wins instead), version history, real OAuth (mock auth + ALTCHA per the brief), PDF export, R2 for large attachments.

WITH 2-4 MORE HOURS I WOULD BUILD
Durable-Objects-backed live presence/cursors (TipTap + yjs provider), then version history.

STACK & WHY (short)
Cloudflare Workers + D1: one artifact, free tier, relational data for ownership/shares. Hono: lightweight Workers-native API. Vite + React SPA served by the same Worker. TipTap: structured JSON content model so formatting survives round-trips. Client-side file parsing keeps the API stateless.

AI USAGE (honest, detailed version in AI_WORKFLOW.md)
I used an agentic AI coding assistant heavily across two sessions (core build, then a v2 hardening/UI pass with a styling subagent), driving it with my own product/architecture decisions. It materially compressed boilerplate time; my verification loop caught seven real defects it introduced (anonymous-access edge case, a routing base-path bug, D1 BLOB serialization, over-scoped roles, plus a useEffect-cleanup crash, an autosave race, and a mobile layout bug caught only by browser E2E) — all fixed and covered by tests.
