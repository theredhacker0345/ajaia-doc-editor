# Ajaia Docs

A lightweight collaborative document editor built for the **Ajaia AI-Native Full Stack Developer assignment**. Create, edit, import, share, and attach — deployed as a single Cloudflare Worker with a D1 database, fully inside the free tier.

**Live app:** _paste your `https://ajaia-docs.<your-subdomain>.workers.dev` URL here_

---

## Features

- **Documents** — create, rename (inline, owner-only), edit, delete. Rich-text editing via TipTap: **bold**, *italic*, <u>underline</u>, H1–H3, bulleted & numbered lists, undo/redo.
- **Autosave** — debounced 900 ms after you stop typing, with a live save-state indicator ("Saving…" / "Saved"). Content is stored as TipTap (ProseMirror) JSON, so structure and formatting survive reloads.
- **File import** — upload a `.txt`, `.md`, or `.docx` file and it becomes a new editable document. Parsing happens client-side (mammoth for .docx, marked for .md); the API only receives normalized TipTap JSON.
- **Sharing** — owners grant **editor** (can edit + attach) or **viewer** (read-only) access by email. Recipients are auto-provisioned as users, so the flow never dead-ends. Clear "Owned documents" vs "Shared with me" sections, per-doc share avatars, and a revoke UI.
- **Attachments** — attach files (max **2 MB**) to any document you can edit; download requires view access. Allowed types: `txt, md, markdown, docx, pdf, png, jpg, jpeg, gif, csv, json` (limits are stated in the UI as well).
- **Mock auth** — the assignment explicitly allows simulated users. Sign in with one click as a seeded user (or create one with name + email). Sessions are HMAC-SHA256-signed, HTTP-only cookies — a real session mechanism, just no passwords.

## Stack

| Layer      | Choice                          | Why |
|------------|---------------------------------|-----|
| Runtime    | Cloudflare **Workers**          | one deployable, global edge, generous free tier, no card required |
| Database   | Cloudflare **D1** (SQLite)      | zero-infra relational store co-located with the Worker |
| API        | **Hono**                        | tiny, fast, first-class Workers support |
| Frontend   | **React + Vite** SPA            | fast build, served by the same Worker via assets binding |
| Editor     | **TipTap** (ProseMirror)        | structured JSON content model = reliable formatting persistence |
| Tests      | **Vitest** + curl smoke suite   | permission matrix, validation rules, session tokens, E2E API flow |

## Quick start (local)

Prereqs: Node 18+, npm. (A Cloudflare account is only needed for deployment.)

```bash
npm install
npm run db:migrate:local   # create local D1 schema
npm run db:seed:local      # insert demo users
npm run dev                # builds once, then runs API (8787) + Vite (5173)
```

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
npm test          # 25 unit tests: permission matrix, validation, session tokens
npm run smoke     # 38-check end-to-end API flow (requires a running server + seeded DB)
```

The smoke suite covers the full surface: auth, CRUD, sharing (editor vs viewer vs revoked), attachments (upload/download/validation/cascade-delete), and error codes (400/401/403/404).

## Deploy to Cloudflare

```bash
npx wrangler login                          # one-time auth
npx wrangler d1 create ajaia-docs           # copy the database_id it prints
# -> paste database_id into wrangler.jsonc

npm run db:migrate:remote                   # create schema in production D1
npm run db:seed:remote                      # seed demo users
npm run deploy                              # build + deploy Worker + assets
```

Then open the URL wrangler prints (`https://ajaia-docs.<your-subdomain>.workers.dev`).

> Change `APP_SECRET` in `wrangler.jsonc` to any long random string before deploying (or wire it up as a proper secret — see ARCHITECTURE.md).

## Project layout

```
├── migrations/            # 0001_init.sql (schema) + seed.sql (demo users), idempotent
├── worker/                # Hono API (runs on Cloudflare Workers)
│   ├── index.ts           # entry: routing, middleware, error handling
│   ├── auth.ts            # HMAC-signed session cookies + requireAuth middleware
│   ├── permissions.ts     # pure access-control rules (unit tested)
│   ├── validation.ts      # pure input validation (unit tested)
│   └── routes/            # auth, documents (+sharing), attachments
├── src/                   # React SPA (built by Vite into dist/)
│   ├── pages/             # Login, Dashboard, Doc (editor + autosave)
│   ├── components/        # Toolbar, ShareModal, Attachments
│   └── lib/               # client-side .txt/.md/.docx import, formatting
├── tests/                 # Vitest unit tests
├── scripts/smoke.sh       # end-to-end API smoke test
├── ARCHITECTURE.md        # design decisions, tradeoffs, scope cuts
├── AI_WORKFLOW.md         # how AI was used in this build
└── SUBMISSION.md          # deliverables checklist
```

## Known limits (stated on purpose)

- **Mock auth** — no passwords/OAuth by design; roles and ownership are real and enforced server-side.
- **Attachments ≤ 2 MB** stored as D1 BLOBs; R2 would be the production choice.
- **No real-time multi-user editing** — autosave + last-write-wins; Durable Objects + CRDT is the natural next step (see ARCHITECTURE.md).
