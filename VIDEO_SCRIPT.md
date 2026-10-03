# Walkthrough Video Script (3–5 min)

Record with Loom (camera + screen). Rehearse once. Paste the unlisted link into `video-link.txt` and the portal.

## 0:00–0:20 — Intro
"Hi, I'm Ubaid. This is Ajaia Docs, my take on the assignment: a collaborative document editor on Cloudflare Workers and D1, with React and TipTap. One deployment, free tier, no paid services. Let me walk through what works end to end, what I cut on purpose, and how AI fit into my workflow."

## 0:20–1:10 — Core editing loop
- Sign in as **Ubaid** (one click, mock auth — point out sessions are signed cookies).
- New document → type → **bold / italic / underline / H1-H3 / bullet + numbered lists**.
- Point at the save chip: "Autosave fires ~1 second after I stop typing; content is stored as structured TipTap JSON so formatting survives refresh." → refresh the page to prove persistence.
- Rename inline (owner-only).

## 1:10–1:50 — File import
- Dashboard → **Import** → drop a `.docx` (have one ready; also show `.md`).
- "Parsing happens client-side — mammoth for docx, marked for markdown — so the API only receives normalized TipTap JSON. Limits are stated in the UI and README."

## 1:50–2:50 — Sharing (the differentiator)
- Open the doc → **Share** → add `aisha@aajaia.dev` as **Can edit**.
- "New recipients are auto-provisioned as users, so the flow never dead-ends."
- Sign out → sign in as **Aisha** → doc is under **Shared with me** → edit → show it saves.
- Sign back as Ubaid → change Aisha to **Can view** → (switch again briefly) show read-only editor.
- "Every role check re-runs server-side from a pure, unit-tested function — the UI badge is display-only."

## 2:50–3:30 — Attachments + engineering quality
- Attach a small file, download it; mention the 2 MB cap and allowlist.
- Quickly show: `npm test` (25 unit tests) and `npm run smoke` (38-check E2E API suite) — "the smoke suite covers editor/viewer/revoke semantics and caught two real bugs during development."

## 3:30–4:20 — Decisions, cuts, and AI
- "Stack reasoning: Workers + D1 = single free-tier artifact; Hono is Workers-native; a SPA removes a whole deployment surface."
- "Deliberate cuts: no real-time co-editing (autosave + last-write-wins), no version history, mock auth — all documented with next steps in ARCHITECTURE.md. With 2–4 more hours: Durable Objects + yjs for live cursors."
- "AI: I used an agentic assistant heavily for scaffolding, implementation, and tests — it caught nothing for me; my tests caught four of its bugs, including an anonymous-access edge case. That loop — AI proposes, I verify adversarially — is how I work AI-native."

## 4:20–4:40 — Wrap
- "Everything's in the Drive folder: README, ARCHITECTURE, AI_WORKFLOW, SUBMISSION, and the live URL. Thanks!"

## Recording tips
- Keep the doc you'll import open in Finder/Explorer beforehand.
- Do the Aisha switch with two browser profiles/windows side by side to avoid login churn.
- If something breaks live, don't panic-restart: narrate what you'd check — that reads as senior.
