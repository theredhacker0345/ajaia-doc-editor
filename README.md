# Ajaia Docs

A lightweight collaborative document editor built for the **Ajaia AI-Native Full Stack Developer assignment**. Create, edit, import, share, and attach — deployed as a single Cloudflare Worker with a D1 database, fully inside the free tier.

**Live app:** _paste your `https://ajaia-docs.<your-subdomain>.workers.dev` URL here_

---

## Features

- **Documents** — create, rename (inline, owner-only), edit, delete. Rich-text editing via TipTap: **bold**, *italic*, <u>underline</u>, H1–H3, blockquote, bulleted & numbered lists, undo/redo — plus one-click **Markdown export** (TipTap JSON → `.md` download, fully client-side).
- **Autosave** — debounced 900 ms after you stop typing, with an honest 4-state save pill (unsaved edits / saving / saved / error) and a statusbar (words, characters, reading time, last edited, Ctrl+S hint). A content-reference guard means edits landing mid-save are never lost and never faked as "Saved". Content is stored as TipTap (ProseMirror) JSON, so structure and formatting survive reloads.
- **Human verification (ALTCHA)** — sign-in is gated by an ALTCHA v1 proof-of-work (altcha.org protocol), implemented from scratch on Web Crypto with zero dependencies. The browser solves the puzzle in a background Web Worker (~a second); there are no CAPTCHA clicks, no cookies, no third-party calls, and a server-side replay ledger makes every solved challenge single-use.
- **Profile** — a `/profile` page with avatar/banner hero, usage stats (owned docs, shared with you, grants given, collaborators, attachments), recent documents, and an edit modal (name, title, bio, location, website — all sanitized server-side).
- **File import** — upload a `.txt`, `.md`, or `.docx` file and it becomes a new editable document. Parsing happens client-side (mammoth for .docx, marked for .md); the API only receives normalized TipTap JSON.
- **Sharing** — owners grant **editor** (can edit + attach) or **viewer** (read-only) access by email. Recipients are auto-provisioned as users, so the flow never dead-ends. Clear "Owned documents" vs "Shared with me" sections, per-doc share avatars, and a revoke UI.
- **Attachments** — attach files (max **2 MB**) to any document you can edit; download requires view access. Allowed types: `txt, md, markdown, docx, pdf, png, jpg, jpeg, gif, csv, json` (limits are stated in the UI as well).
- **Mock auth** — the assignment explicitly allows simulated users. Sign in with one click as a seeded user (or create one with name + email). Sessions are HMAC-SHA256-signed, HTTP-only cookies — a real session mechanism, just no passwords (ALTCHA proof-of-work stands in for the anti-bot layer).

## Stack

| Layer      | Choice                          | Why |
|------------|---------------------------------|-----|
| Runtime    | Cloudflare **Workers**          | one deployable, global edge, generous free tier, no card required |
| Database   | Cloudflare **D1** (SQLite)      | zero-infra relational store co-located with the Worker |
| API        | **Hono**                        | tiny, fast, first-class Workers support |
| Frontend   | **React + Vite** SPA            | fast build, served by the same Worker via assets binding |
| Editor     | **TipTap** (ProseMirror)        | structured JSON content model = reliable formatting persistence |
| Tests      | **Vitest** + curl smoke suite   | permission matrix, validation, session tokens, ALTCHA PoW, E2E API flow |
| Design     | Token-based CSS design system   | Linear/Notion-grade light theme, dark ink sidebar, Inter / Space Grotesk / Geist Mono, responsive down to 390 px |

## Quick start (local)

Prereqs: Node 18+, npm. (A Cloudflare account is only needed for deployment.)

```bash
npm install
npm run db:migrate:local   # apply D1 migrations 0001 (schema) + 0002 (profile + ALTCHA ledger)
npm run db:seed:local      # insert demo users
npm run dev                # builds once, then runs API (8787) + Vite (5173)
```

> Both `db:migrate:*` scripts run the two migration files sequentially. 0001 is fully idempotent (`IF NOT EXISTS`); 0002 uses `ALTER TABLE`, which SQLite cannot make idempotent — run it once per database.

Open **http://localhost:5173** (the Vite dev server proxies `/api` to `wrangler dev` on 8787).

### Seeded demo users

| Name | Email |
|------|-------|
| Ubaid ur Rehman | `ubaid@aajaia.dev` |
| Aisha Khan | `aisha@aajaia.dev` |
| Carlos Mendez | `carlos@aajaia.dev` |
| Priya Sharma | `priya@aajaia.dev` |

To demo sharing: sign in as Ubaid, create a doc, click **Share**, add `aisha@aajaia.dev` as editor, then sign out and sign in as Aisha — the document appears under **Shared with me**.

## Tests

```bash
npm test          # 33 unit tests: permission matrix, validation, session tokens, ALTCHA PoW
npm run smoke     # 51-check end-to-end API flow (requires a running server + seeded DB)
```

The smoke suite covers the full surface: ALTCHA challenge + login rejection without/bad/replayed proof-of-work, auth, CRUD, sharing (editor vs viewer vs revoked), attachments (upload/download/validation/cascade-delete), profile GET/PATCH (incl. invalid website / empty name), and error codes (400/401/403/404). Every scripted login solves the real proof-of-work, exactly like the browser does.

## Deploy to Cloudflare

```bash
npx wrangler login                          # one-time auth
npx wrangler d1 create ajaia-docs           # copy the database_id it prints
# -> paste database_id into wrangler.jsonc

npm run db:migrate:remote                   # apply migrations 0001 + 0002 in production D1
npm run db:seed:remote                      # seed demo users
npm run deploy                              # build + deploy Worker + assets
```

Then open the URL wrangler prints (`https://ajaia-docs.<your-subdomain>.workers.dev`).

> Change `APP_SECRET` in `wrangler.jsonc` to any long random string before deploying (or wire it up as a proper secret — see ARCHITECTURE.md).

## Project layout

```
├── migrations/            # 0001_init.sql (schema), 0002_profile.sql (profile + ALTCHA ledger), seed.sql
├── worker/                # Hono API (runs on Cloudflare Workers)
│   ├── index.ts           # entry: routing, security-headers middleware, error handling
│   ├── auth.ts            # HMAC-signed session cookies + requireAuth middleware
│   ├── altcha.ts          # ALTCHA proof-of-work: sign/verify challenges (Web Crypto, zero deps)
│   ├── permissions.ts     # pure access-control rules (unit tested)
│   ├── validation.ts      # pure input validation + profile sanitizers (unit tested)
│   └── routes/            # auth, altcha, documents (+sharing), attachments, profile
├── src/                   # React SPA (built by Vite into dist/)
│   ├── pages/             # Login (ALTCHA-gated), Dashboard, Doc (editor + autosave), Profile
│   ├── components/        # Toolbar, ShareModal, Attachments, Shell, ConfirmDialog
│   ├── index.css          # design-system tokens + component styles
│   └── lib/               # ALTCHA solver (blob Web Worker), .txt/.md/.docx import, formatting
├── tests/                 # Vitest unit tests
├── scripts/smoke.sh       # end-to-end API smoke test
├── ARCHITECTURE.md        # design decisions, tradeoffs, scope cuts
├── AI_WORKFLOW.md         # how AI was used in this build
└── SUBMISSION.md          # deliverables checklist
```

## Known limits (stated on purpose)

- **Mock auth** — no passwords/OAuth by design (ALTCHA proof-of-work is the anti-bot layer); roles and ownership are real and enforced server-side.
- **No rate limiting** — the ALTCHA proof-of-work raises the cost of scripted sign-in spam, but a production build should still add per-IP limits.
- **Attachments ≤ 2 MB** stored as D1 BLOBs; R2 would be the production choice.
- **No real-time multi-user editing** — autosave + last-write-wins; Durable Objects + CRDT is the natural next step (see ARCHITECTURE.md).
