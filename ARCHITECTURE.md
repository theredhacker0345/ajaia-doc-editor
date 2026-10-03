# Architecture Note — Ajaia Docs

**Author:** Ubaid ur Rehman · **Scope:** AI-Native Full Stack Developer assignment

## 1. Reading the brief as a product slice

The brief asks for "the strongest working version within the timebox", explicitly valuing deliberate scope cuts over shallow breadth. I treated it as a **product-engineering slice**: one core loop (create → edit → persist), one differentiator (sharing with real role semantics), one productivity hook (file import), and enough engineering hygiene (tests, migrations, smoke suite, docs) to show how I work. Everything else — real-time collaboration, version history, comments — was consciously cut and documented as a roadmap (§6).

## 2. Stack rationale

| Decision | Alternative considered | Why I chose this |
|---|---|---|
| Cloudflare Workers + D1 | Vercel + Supabase / Node + Postgres | The brief forbids paid dependencies; Workers + D1 is free, deploys as a single artifact (API + static assets), needs no VPC/db provisioning, and D1's SQLite is fully relational for ownership/share queries. Reviewers can clone → 5 commands → live URL. |
| Hono | Express (unsupported on Workers), itty-router | First-class Workers support, Web-standard Request/Response, tiny surface, TypeScript-native. |
| React + Vite SPA | Next.js / SSR | The product is an authenticated app with no SEO surface; a SPA served by the same Worker removes an entire deployment target and origin/CORS complexity. Vite build < 10 s keeps iteration fast. |
| TipTap (ProseMirror) | Quill / contenteditable+execCommand | Content is stored as **ProseMirror JSON**, so formatting structure survives round-trips exactly (the brief calls this out). TipTap's schema also makes future features (comments anchored to ranges, suggestion mode) tractable. execCommand is deprecated and unreliable. |
| Client-side import parsing (mammoth, marked) | Server-side parsing | .docx/.md parsing in the browser keeps the Worker stateless and small; the API only ever receives validated TipTap JSON. Also avoids shipping LibreOffice-grade parsing to a server. |

## 3. Data model

```
users(id, name, email UNIQUE, color, created_at)
documents(id, title, content JSON, owner_id → users, created_at, updated_at)
document_access(id, document_id → documents, user_id → users,
                role CHECK (role IN ('viewer','editor')), UNIQUE(document_id, user_id))
attachments(id, document_id → documents, filename, mime, size, data BLOB,
            uploaded_by → users, created_at)
```

Key points:

- **Ownership vs sharing is a single source of truth**: `documents.owner_id` + `document_access` rows. No denormalized flags to drift.
- `content` is TipTap JSON (text). Validated server-side: must parse, must have `type === "doc"` with an array `content`, capped at 2 MB.
- Timestamps are ISO-8601 UTC (`strftime`), so `new Date(iso)` is correct everywhere.
- Deletes are explicit three-statement `DB.batch()` transactions (attachments → access → document), so behavior doesn't depend on FK cascade settings.

## 4. Access control

All rules live in one pure function (`worker/permissions.ts::resolveAccess`) that is unit tested:

| Role | View | Edit content | Attach | Rename | Delete | Share/revoke |
|---|---|---|---|---|---|---|
| owner | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| editor | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| viewer | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| stranger / anonymous | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

- **Every** mutating route re-resolves access server-side from the session user — the client's role badge is display-only.
- Sessions are HMAC-SHA256-signed cookies (`userId.expiry.signature`), compared in constant time; the signing secret comes from config (`APP_SECRET`).
- Hardening path for production is straightforward and documented: move the secret to `wrangler secret put`, add rate limiting, swap mock sign-in for OAuth/Passkeys behind the same `requireAuth` contract.

## 5. Engineering quality

- **Migrations + seeds are idempotent SQL files** run via `wrangler d1 execute` for both local and remote D1 — no ORM lock-in, fully reviewable.
- **Unit tests (Vitest, 25)**: the full permission matrix (including anonymous-with-stale-share-row, which started as a real bug the test caught), validation rules (title, email, role, attachment type/size, TipTap JSON shape), and session tokens (round-trip, tamper, expiry, wrong secret).
- **Smoke suite (bash + curl, 38 checks)**: end-to-end API flow across three seeded users — auth, CRUD, sharing semantics (editor can't rename/share/delete; viewer can't save; revoke cuts access immediately), attachment upload/download byte-fidelity, 400/401/403/404 paths, cascade delete. Reviewers can run it against any deployment: `npm run smoke`.
- **Validation is layered**: client-side for fast feedback, server-side always (defense in depth).
- **Autosave** is debounced (900 ms) with a visible save-state chip and a best-effort flush on tab-hide; the API is idempotent PATCH, so worst case under flaky networks is a retry, not corruption.

## 6. Deliberate scope cuts & what I'd build next (2–4 h)

| Cut | Why | Next step |
|---|---|---|
| Real-time collaborative editing | Needs Durable Objects + CRDT (yjs); high complexity, not required by the brief | Durable Object per document owning a yjs doc; TipTap has a yjs provider |
| Version history | Storage + UI cost, low demo value per hour | `document_versions` table, snapshot on save-diff, restore endpoint |
| Real auth | Brief explicitly allows mocked users | OAuth (Google) or passkeys behind existing `requireAuth` |
| R2 attachments | D1 BLOB keeps the stack single-product | Move `attachments.data` to R2, keep metadata in D1 |
| Export (PDF/Markdown) | JSON → Markdown is easy, PDF needs headless rendering | Markdown export server-side from TipTap JSON |

## 7. Security notes (honest inventory)

Implemented: parameterized SQL everywhere (no string interpolation), per-route access checks, input validation + size caps, signed HTTP-only SameSite cookies, constant-time signature compare, extension allowlist + 2 MB cap on uploads, safe `Content-Disposition` filenames, JSON error responses with no stack leakage.

Not implemented (and acknowledged): rate limiting, CSRF tokens (SameSite=Lax + JSON-only API narrows the window but a production build should add them), secret rotation, audit logging.
