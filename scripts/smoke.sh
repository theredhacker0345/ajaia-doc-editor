#!/usr/bin/env bash
#
# End-to-end API smoke test for Ajaia Docs.
# Prereqs: `wrangler dev` running with a migrated + seeded local D1:
#   npm run db:migrate:local && npm run db:seed:local
#   npm run build && npm run dev:api   (or: npx wrangler dev --port 8787)
#
# Usage: npm run smoke   (BASE env var overrides http://127.0.0.1:8787)

set -u
BASE="${BASE:-http://127.0.0.1:8787}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$HERE/.smoke-tmp"
mkdir -p "$TMP"
PASS=0
FAIL=0

# --- helpers ---------------------------------------------------------------

req() { # method url jar [json-body]
  local m="$1" u="$2" jar="$3" data="${4:-}"
  if [ -n "$data" ]; then
    curl -s -o "$TMP/body" -w "%{http_code}" -X "$m" -b "$TMP/$jar" -c "$TMP/$jar" \
      -H "Content-Type: application/json" -d "$data" "$BASE$u"
  else
    curl -s -o "$TMP/body" -w "%{http_code}" -X "$m" -b "$TMP/$jar" -c "$TMP/$jar" "$BASE$u"
  fi
}

expect() { # name want got
  if [ "$2" = "$3" ]; then
    PASS=$((PASS + 1)); echo "  PASS  $1"
  else
    FAIL=$((FAIL + 1)); echo "  FAIL  $1 (want $2, got $3)  body: $(head -c 160 "$TMP/body")"
  fi
}

expect_contains() { # name needle [file]
  local file="${3:-$TMP/body}"
  if rg -q "$2" "$file" 2>/dev/null; then
    PASS=$((PASS + 1)); echo "  PASS  $1"
  else
    FAIL=$((FAIL + 1)); echo "  FAIL  $1 (missing: $2)  body: $(head -c 160 "$file")"
  fi
}

jsonget() { # python-expression over parsed body json
  python3 -c "import json,sys; d=json.load(open('$TMP/body')); print(eval(sys.argv[1]))" "$1"
}

# Solve the ALTCHA proof-of-work the same way the browser does: fetch a
# challenge, brute-force SHA-256(salt+n) === challenge, emit the base64 payload.
altcha_solve() {
  curl -s "$BASE/api/altcha/challenge" | python3 -c '
import json, sys, hashlib, base64
ch = json.load(sys.stdin)
salt, target, mx = ch["salt"], ch["challenge"], ch["maxnumber"]
n = next((i for i in range(mx + 1) if hashlib.sha256(f"{salt}{i}".encode()).hexdigest() == target), None)
if n is None:
    sys.exit(1)
payload = {"algorithm": ch["algorithm"], "challenge": target, "number": n,
           "salt": salt, "signature": ch["signature"]}
sys.stdout.write(base64.b64encode(json.dumps(payload).encode()).decode())
'
}

# --- flow ------------------------------------------------------------------

echo "Smoke-testing $BASE"

expect "health endpoint" 200 "$(req GET /api/health anon.jar)"
expect_contains "health payload ok" '"ok":true'

expect "public user list" 200 "$(req GET /api/auth/users anon.jar)"
expect_contains "seeded user present" 'ubaid@aajaia.dev'

expect "me without session -> 401" 401 "$(req GET /api/me anon.jar)"

# ALTCHA challenge endpoint (public, pre-auth)
expect "altcha challenge endpoint" 200 "$(req GET /api/altcha/challenge anon.jar)"
expect_contains "challenge carries difficulty" '"maxnumber"'
expect_contains "challenge carries signature" '"signature"'

# Login is refused without a solved proof-of-work
expect "login without altcha -> 400" 400 "$(req POST /api/auth/login noaltcha.jar '{"email":"ubaid@aajaia.dev"}')"
expect_contains "altcha error code returned" 'altcha_malformed'

ALTCHA="$(altcha_solve)" || { echo "FAIL  altcha_solve helper"; exit 1; }
expect "login as ubaid (with ALTCHA)" 200 "$(req POST /api/auth/login ubaid.jar "{\"email\":\"ubaid@aajaia.dev\",\"altcha\":\"$ALTCHA\"}")"

# A solved challenge is single-use - replaying it must be rejected
expect "replayed altcha -> 400" 400 "$(req POST /api/auth/login replay.jar "{\"email\":\"ubaid@aajaia.dev\",\"altcha\":\"$ALTCHA\"}")"

# Profile endpoints
expect "get profile" 200 "$(req GET /api/me/profile ubaid.jar)"
expect_contains "profile carries stats" '"owned_docs"'
expect_contains "profile carries member_since" '"member_since"'
expect "update profile" 200 "$(req PATCH /api/me/profile ubaid.jar '{"name":"Ubaid ur Rehman","title":"Full Stack Developer","bio":"AI orchestrator building production-grade web software.","location":"Pakistan","website":"https://ubaid-ur-rehmanportfolio.vercel.app/"}')"
expect_contains "profile persisted" 'Full Stack Developer'
expect "invalid website -> 400" 400 "$(req PATCH /api/me/profile ubaid.jar '{"website":"definitely not a url"}')"
expect "empty name -> 400" 400 "$(req PATCH /api/me/profile ubaid.jar '{"name":"   "}')"

DOC_TITLE="Smoke Test Doc $(date +%s)"
expect "create document" 201 "$(req POST /api/documents ubaid.jar "{\"title\":\"$DOC_TITLE\"}")"
DOC_ID="$(jsonget "d['document']['id']")"

TIPTAP='{"content":{"type":"doc","content":[{"type":"heading","attrs":{"level":1}},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"hello"}]}]}}'
expect "save content (owner)" 200 "$(req PATCH /api/documents/$DOC_ID ubaid.jar "$TIPTAP")"

expect "rename document (owner)" 200 "$(req PATCH /api/documents/$DOC_ID ubaid.jar '{"title":"Smoke Test Doc Renamed"}')"
expect "get document" 200 "$(req GET /api/documents/$DOC_ID ubaid.jar)"
expect_contains "content persisted" '"Smoke Test Doc Renamed"'

expect "patch without session -> 401" 401 "$(req PATCH /api/documents/$DOC_ID anon.jar "$TIPTAP")"
expect "get unknown doc -> 404" 404 "$(req GET /api/documents/doc-unknown ubaid.jar)"

expect "share with aisha as editor" 200 "$(req POST /api/documents/$DOC_ID/share ubaid.jar '{"email":"aisha@aajaia.dev","role":"editor"}')"
expect "sharing with owner email -> 400" 400 "$(req POST /api/documents/$DOC_ID/share ubaid.jar '{"email":"ubaid@aajaia.dev","role":"editor"}')"
expect "share with bad role -> 400" 400 "$(req POST /api/documents/$DOC_ID/share ubaid.jar '{"email":"someone@x.dev","role":"admin"}')"
expect "shares list shows aisha" 200 "$(req GET /api/documents/$DOC_ID/shares ubaid.jar)"
expect_contains "aisha in shares" 'aisha@aajaia.dev'

# Attachments
echo "smoke attachment content $(date)" > "$TMP/note.txt"
CODE="$(curl -s -o "$TMP/body" -w "%{http_code}" -b "$TMP/ubaid.jar" -F "file=@$TMP/note.txt" "$BASE/api/documents/$DOC_ID/attachments")"
expect "upload attachment" 201 "$CODE"
ATT_ID="$(jsonget "d['attachment']['id']")"

CODE="$(curl -s -o "$TMP/dl.txt" -w "%{http_code}" -b "$TMP/ubaid.jar" "$BASE/api/attachments/$ATT_ID/download")"
expect "download attachment" 200 "$CODE"
expect_contains "downloaded bytes match" "smoke attachment content" "$TMP/dl.txt"

expect "reject disallowed type" 400 "$(req POST /api/documents/$DOC_ID/attachments ubaid.jar '')"

# Second user: shared access semantics
ALTCHA_AISHA="$(altcha_solve)" || { echo "FAIL  altcha_solve (aisha)"; exit 1; }
expect "login as aisha (with ALTCHA)" 200 "$(req POST /api/auth/login aisha.jar "{\"email\":\"aisha@aajaia.dev\",\"altcha\":\"$ALTCHA_AISHA\"}")"
expect "aisha lists shared docs" 200 "$(req GET /api/documents aisha.jar)"
expect_contains "shared doc visible with editor role" '"my_role":"editor"'

expect "editor can save content" 200 "$(req PATCH /api/documents/$DOC_ID aisha.jar "$TIPTAP")"
expect "editor cannot rename (owner-only)" 403 "$(req PATCH /api/documents/$DOC_ID aisha.jar '{"title":"Nope"}')"
expect "editor cannot share" 403 "$(req POST /api/documents/$DOC_ID/share aisha.jar '{"email":"carlos@aajaia.dev","role":"viewer"}')"
expect "editor cannot delete" 403 "$(req DELETE /api/documents/$DOC_ID aisha.jar)"

# Viewer role
expect "ubaid shares with carlos as viewer" 200 "$(req POST /api/documents/$DOC_ID/share ubaid.jar '{"email":"carlos@aajaia.dev","role":"viewer"}')"
ALTCHA_CARLOS="$(altcha_solve)" || { echo "FAIL  altcha_solve (carlos)"; exit 1; }
expect "login as carlos (with ALTCHA)" 200 "$(req POST /api/auth/login carlos.jar "{\"email\":\"carlos@aajaia.dev\",\"altcha\":\"$ALTCHA_CARLOS\"}")"
expect "viewer can read" 200 "$(req GET /api/documents/$DOC_ID carlos.jar)"
expect "viewer cannot save" 403 "$(req PATCH /api/documents/$DOC_ID carlos.jar "$TIPTAP")"

# Revoke + cleanup
expect "ubaid revokes carlos" 200 "$(req DELETE /api/documents/$DOC_ID/share/u-carlos ubaid.jar)"
expect "carlos lost access -> 403" 403 "$(req GET /api/documents/$DOC_ID carlos.jar)"

expect "owner deletes document" 200 "$(req DELETE /api/documents/$DOC_ID ubaid.jar)"
expect "deleted doc gone -> 404" 404 "$(req GET /api/documents/$DOC_ID ubaid.jar)"
CODE="$(curl -s -o /dev/null -w "%{http_code}" -b "$TMP/ubaid.jar" "$BASE/api/attachments/$ATT_ID/download")"
expect "attachment cascaded away -> 404" 404 "$CODE"

echo
echo "Result: $PASS passed, $FAIL failed"
rm -rf "$TMP"
[ "$FAIL" -eq 0 ]
