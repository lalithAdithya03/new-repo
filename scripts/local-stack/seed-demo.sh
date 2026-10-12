#!/usr/bin/env bash
# Creates demo accounts through the real Auth API, promotes the admin, then loads supabase/demo/demo_content.sql.
#   student@macro.test / teacher@macro.test / admin@macro.test, password Passw0rd!23
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
API="${API:-http://127.0.0.1:54321}"
KEY="$(grep VITE_SUPABASE_ANON_KEY "$ROOT/.env.local" | cut -d= -f2)"
PG_URL="${PG_URL:-postgresql://postgres@127.0.0.1:54322/postgres}"
for u in student teacher admin; do
  curl -sf -o /dev/null -X POST "$API/auth/v1/signup" -H "apikey: $KEY" -H 'content-type: application/json' \
    -d "{\"email\":\"$u@macro.test\",\"password\":\"Passw0rd!23\",\"data\":{\"full_name\":\"Demo ${u^}\"}}"
done
psql "$PG_URL" -X -q -v ON_ERROR_STOP=1 -c "update public.profiles set role = 'admin' where email = 'admin@macro.test'" \
  -f "$ROOT/supabase/demo/demo_content.sql"
echo "Demo accounts and content ready."
