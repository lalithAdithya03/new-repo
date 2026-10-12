#!/usr/bin/env bash
# Applies every migration to a throwaway PostgreSQL cluster (with a small Supabase shim)
# and runs the RLS / security tests in supabase/tests. Needs PostgreSQL 15+ binaries.
#   npm run test:db
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PGBIN="${PGBIN:-$(dirname "$(command -v initdb)")}"
PORT="${PGPORT_TEST:-54329}"
DATA="$(mktemp -d)"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then RUN_AS=(runuser -u postgres --); chown postgres "$DATA"; fi

cleanup() { "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

"${RUN_AS[@]}" "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
"${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=''" -w start >/dev/null

PSQL=(psql -h /tmp -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f "$ROOT/supabase/tests/00_supabase_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrate  $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
if [ -f "$ROOT/supabase/seed.sql" ]; then echo "seed     seed.sql"; "${PSQL[@]}" -f "$ROOT/supabase/seed.sql"; fi
for f in "$ROOT"/supabase/tests/[1-9]*.sql; do
  echo "test     $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
echo "All database tests passed."
