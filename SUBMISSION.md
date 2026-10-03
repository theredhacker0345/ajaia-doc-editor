# SUBMISSION.md — Ajaia Docs (AI-Native Full Stack Developer Assignment)

**Candidate:** Ubaid ur Rehman (arifubaid0345@gmail.com)

> Checklist for reviewers — and for me, before I submit. Items marked ⬜ need my live links pasted in.

## Deliverables included

| # | Item | Where |
|---|------|-------|
| 1 | Source code | `/` root of this folder (also mirrored on the Drive folder link below) |
| 2 | README with local setup + run instructions | `README.md` |
| 3 | Architecture note | `ARCHITECTURE.md` |
| 4 | AI workflow note | `AI_WORKFLOW.md` |
| 5 | This manifest | `SUBMISSION.md` |
| 6 | Live deployment | ⬜ `https://ajaia-doc-editor.arifubaid0345.workers.dev` |
| 7 | Walkthrough video (3–5 min) | ⬜ paste Loom/YouTube URL (also in `video-link.txt`) |
| 8 | Automated tests | `npm test` (33 unit) + `npm run smoke` (51 E2E checks) |

## Test credentials (mock auth, one click — no passwords)

| User | Email | Use for |
|---|---|---|
| Ubaid ur Rehman | `ubaid@aajaia.dev` | owner flows: create, rename, share, delete |
| Aisha Khan | `aisha@aajaia.dev` | editor flows: edit shared doc, cannot rename/share |
| Carlos Mendez | `carlos@aajaia.dev` | viewer flows: read-only |
| Priya Sharma | `priya@aajaia.dev` | spare / new-user share flow |

## 2-minute reviewer script

1. Open the live URL → click **Ubaid** to sign in — the ALTCHA human-verification pill solves itself in the background (~1s), then you're in.
2. **New document** → type, try bold/italic/underline/H1/blockquote/lists → watch the save pill go unsaved → saving → **Saved**, and the statusbar count words.
3. **Export as Markdown** from the doc page → get a real `.md` download.
4. **Import .txt / .md / .docx** → becomes an editable document.
5. **Share** → add `aisha@aajaia.dev` as *Can edit* → Sign out → sign in as Aisha → document is under **Shared with me** → edit it.
6. Back as Ubaid: re-share Aisha as *Can view* (read-only), try **Attachments** (≤ 2 MB), rename/delete, and open the **Profile** page (stats + editable fields).

## Status summary (required by the brief)

**Working end-to-end:** document CRUD + rich text (incl. blockquote) + honest autosave/persistence · Markdown export (client-side) · file import (.txt/.md/.docx) · sharing with editor/viewer roles, auto-provisioned recipients, revoke · attachments (upload/download/limits) · profile page (stats + server-sanitized fields) · ALTCHA proof-of-work sign-in with replay protection · security headers + CSP · access control enforced server-side · automated tests + smoke suite · deployed on Cloudflare free tier.

**Partial / not built (deliberate scope cuts, rationale in ARCHITECTURE.md §6):** real-time collaborative editing (autosave + last-write-wins instead), version history, real OAuth (mock auth + ALTCHA per the brief), PDF export, R2-backed attachments (> 2 MB).

**With 2–4 more hours I would build:** Durable-Objects-powered live cursors/presence (the TipTap yjs provider makes this incremental), then version history.

## Links to paste before submitting

- **Google Drive folder:** ⬜
- **Live URL:** ⬜
- **Video URL:** ⬜
