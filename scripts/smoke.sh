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

# --- flow ------------------------------------------------------------------

echo "Smoke-testing $BASE"

expect "health endpoint" 200 "$(req GET /api/health anon.jar)"
expect_contains "health payload ok" '"ok":true'

expect "public user list" 200 "$(req GET /api/auth/users anon.jar)"
expect_contains "seeded user present" 'ubaid@aajaia.dev'

expect "me without session -> 401" 401 "$(req GET /api/me anon.jar)"

expect "login as ubaid" 200 "$(req POST /api/auth/login ubaid.jar '{"email":"ubaid@aajaia.dev"}')"

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
expect "login as aisha" 200 "$(req POST /api/auth/login aisha.jar '{"email":"aisha@aajaia.dev"}')"
expect "aisha lists shared docs" 200 "$(req GET /api/documents aisha.jar)"
expect_contains "shared doc visible with editor role" '"my_role":"editor"'

expect "editor can save content" 200 "$(req PATCH /api/documents/$DOC_ID aisha.jar "$TIPTAP")"
expect "editor cannot rename (owner-only)" 403 "$(req PATCH /api/documents/$DOC_ID aisha.jar '{"title":"Nope"}')"
expect "editor cannot share" 403 "$(req POST /api/documents/$DOC_ID/share aisha.jar '{"email":"carlos@aajaia.dev","role":"viewer"}')"
expect "editor cannot delete" 403 "$(req DELETE /api/documents/$DOC_ID aisha.jar)"

# Viewer role
expect "ubaid shares with carlos as viewer" 200 "$(req POST /api/documents/$DOC_ID/share ubaid.jar '{"email":"carlos@aajaia.dev","role":"viewer"}')"
expect "login as carlos" 200 "$(req POST /api/auth/login carlos.jar '{"email":"carlos@aajaia.dev"}')"
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
