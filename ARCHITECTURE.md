# Architecture Note — Ajaia Docs

**Author:** Ubaid ur Rehman · **Scope:** AI-Native Full Stack Developer assignment

## 1. Reading the brief as a product slice

The brief asks for "the strongest working version within the timebox", explicitly valuing deliberate scope cuts over shallow breadth. I treated it as a **product-engineering slice**: one core loop (create → edit → persist), one differentiator (sharing with real role semantics), one productivity hook (file import), and enough engineering hygiene (tests, migrations, smoke suite, docs) to show how I work. Everything else — real-time collaboration, version history, comments — was consciously cut and documented as a roadmap (§6).

Once the core slice was green end-to-end, a second hardening pass spent the remaining budget where reviewers actually look: proof-of-work human verification on sign-in (ALTCHA), a profile surface, security headers + CSP, a real design system, and a set of race/UX bug fixes caught by browser E2E (§4/§5). This note describes the app as it ships.

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
users(id, name, email UNIQUE, color, title, bio, location, website, created_at)
documents(id, title, content JSON, owner_id → users, created_at, updated_at)
document_access(id, document_id → documents, user_id → users,
                role CHECK (role IN ('viewer','editor')), UNIQUE(document_id, user_id))
attachments(id, document_id → documents, filename, mime, size, data BLOB,
            uploaded_by → users, created_at)
altcha_seen(challenge PRIMARY KEY, seen_at INTEGER)   -- replay ledger for sign-in PoW
```

Key points:

- **Ownership vs sharing is a single source of truth**: `documents.owner_id` + `document_access` rows. No denormalized flags to drift.
- `content` is TipTap JSON (text). Validated server-side: must parse, must have `type === "doc"` with an array `content`, capped at 2 MB.
- Timestamps are ISO-8601 UTC (`strftime`), so `new Date(iso)` is correct everywhere.
- **Migrations are sequential files**: `0001_init.sql` (schema, fully idempotent) and `0002_profile.sql` (four `ALTER TABLE` profile columns + the `altcha_seen` replay ledger). SQLite can't make `ALTER TABLE` idempotent, so 0002 runs once — the `db:migrate:local` / `db:migrate:remote` scripts apply both files in order.
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

### Sign-in is gated by an ALTCHA proof-of-work

Mock sign-in is still one click, but it is no longer free for a script. The flow is the [ALTCHA v1](https://altcha.org) protocol, implemented from scratch on Web Crypto (`worker/altcha.ts` — zero dependencies):

```
1. challenge   GET /api/altcha/challenge (public, Cache-Control: no-store)
               server returns {algorithm:"SHA-256", challenge, maxnumber:60000,
               salt, signature} where salt = "<random-hex>|<expires-in-2-min-ms>"
               and signature = HMAC-SHA256(APP_SECRET, salt|challenge).
               No server-side state: the puzzle self-verifies via the signature.

2. solve       the client's Web Worker (src/lib/altcha.ts, spawned from a blob
               URL so the CSP only needs worker-src 'self' blob:) brute-forces
               the number n with SHA-256(salt + n) === challenge in 64-wide
               parallel crypto.subtle batches — ~a second, main thread never
               blocks.

3. submit      POST /api/auth/login carries base64(JSON{…, number:n}) in the
               "altcha" field. Server re-checks, in order: signature
               (constant-time), salt shape, expiry, then hash. Any failure →
               400 with a code like altcha_malformed / altcha_replay.

4. replay      a solved challenge is recorded in the altcha_seen D1 ledger
               (INSERT … ON CONFLICT DO NOTHING; a zero-changes result means
               replay → 400). Every solved puzzle is single-use; expired
               ledger rows are opportunistically deleted in the same batch.
```

The unit suite covers the challenge shape, the solve round-trip, wrong solutions, tampered signatures, wrong secrets, expiry, and malformed payloads; the smoke suite logs in by actually solving the puzzle, and asserts login without / with-bad / replayed proof-of-work all return 400.

- Hardening path for production is straightforward and documented: move the secret to `wrangler secret put`, add rate limiting, swap mock sign-in for OAuth/Passkeys behind the same `requireAuth` contract.

## 5. Engineering quality

- **Migrations + seed are reviewable SQL files** run via `wrangler d1 execute` for both local and remote D1 — no ORM lock-in. 0001 is idempotent; 0002 (`ALTER TABLE`) runs once, and the npm migrate scripts chain both files in order.
- **Unit tests (Vitest, 33)**: the full permission matrix (including anonymous-with-stale-share-row, which started as a real bug the test caught), validation rules (title, email, role, attachment type/size, TipTap JSON shape, profile fields), session tokens (round-trip, tamper, expiry, wrong secret), and 8 ALTCHA proof-of-work tests (challenge shape, solve round-trip, wrong solution, tampered signature, wrong secret, expiry, malformed/wrong-algorithm payloads).
- **Smoke suite (bash + curl, 51 checks)**: end-to-end API flow across three seeded users — ALTCHA challenge + login rejection without/bad/replayed proof-of-work (the suite solves the real puzzle via a python3 helper), auth, CRUD, sharing semantics (editor can't rename/share/delete; viewer can't save; revoke cuts access immediately), attachment upload/download byte-fidelity, profile GET/PATCH incl. invalid-website and empty-name 400s, 400/401/403/404 paths, cascade delete. Reviewers can run it against any deployment: `npm run smoke`.
- **Validation is layered**: client-side for fast feedback, server-side always (defense in depth).
- **Autosave is a small state machine, not a timer plus hope.** The editor keeps a `contentRef` mirror and the JSON of the last successful save; a save only fires when the serialized content actually differs, a response whose content no longer matches `contentRef` is detected as stale (reference equality) and superseded instead of overwriting newer keystrokes, and editor normalization no-ops never mark the doc dirty. That is what makes the 4-state pill (unsaved / saving / saved / error) honest: it can't show "Saved" while edits are still in flight, and it can't lose a keystroke that landed mid-save. Best-effort flush on tab-hide; the API is an idempotent PATCH, so worst case under flaky networks is a retry, not corruption. Switching documents remounts the editor by URL pathname (`App.tsx` keys the doc page), so stale content from the previous document can never leak into a new one.
- **The profile surface is two endpoints** (`worker/routes/profile.ts`): `GET /api/me/profile` returns user + profile fields, five usage counters (owned docs, shared with me, grants given, collaborators, attachments) computed in a single `DB.batch`, the five most recent owned documents, and `member_since`; `PATCH /api/me/profile` updates name/title/bio/location/website through the same server-side sanitizers used elsewhere (`sanitizeProfileText`, `sanitizeWebsite` — the website is normalized to an absolute https URL or rejected with 400). The client renders from the returned row, so UI and storage can't drift.
- **Security headers everywhere**: an API middleware sets `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, and `Cache-Control: no-store` on every `/api` response; `public/_headers` applies the same set to the static SPA plus `Permissions-Policy` and a CSP (`script-src 'self'; worker-src 'self' blob:` — the blob allowance exists for the ALTCHA solver; `style-src` includes Google Fonts; `img-src 'self' data: blob:`).

## 6. Deliberate scope cuts & what I'd build next (2–4 h)

| Cut | Why | Next step |
|---|---|---|
| Real-time collaborative editing | Needs Durable Objects + CRDT (yjs); high complexity, not required by the brief | Durable Object per document owning a yjs doc; TipTap has a yjs provider |
| Version history | Storage + UI cost, low demo value per hour | `document_versions` table, snapshot on save-diff, restore endpoint |
| Real auth | Brief explicitly allows mocked users; ALTCHA PoW now gates sign-in | OAuth (Google) or passkeys behind existing `requireAuth` (ALTCHA stays as bot defense) |
| R2 attachments | D1 BLOB keeps the stack single-product | Move `attachments.data` to R2, keep metadata in D1 |
| PDF export | Headless rendering doesn't fit a stateless Worker | Client-side print stylesheet, or a render service |
| Markdown export (server-side) | Shipped in v2 the cheap way: client-side TipTap JSON → `.md` download, no Worker code needed | Server-side rendering only if email/pipeline integrations demand it |

## 7. Security notes (honest inventory)

Implemented: parameterized SQL everywhere (no string interpolation), per-route access checks, input validation + size caps, signed HTTP-only SameSite cookies, constant-time signature compare, extension allowlist + 2 MB cap on uploads, safe `Content-Disposition` filenames, JSON error responses with no stack leakage, ALTCHA proof-of-work on sign-in with a D1 single-use replay ledger, security headers + CSP on both API and static responses, and server-side sanitizers on every profile field (website normalized to absolute https or rejected).

Not implemented (and acknowledged): per-IP rate limiting (the proof-of-work raises the cost of scripted sign-in spam but doesn't replace it), CSRF tokens (SameSite=Lax + JSON-only API narrows the window but a production build should add them), secret rotation, audit logging.
