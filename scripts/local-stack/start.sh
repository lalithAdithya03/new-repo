#!/usr/bin/env bash
# Boots a throwaway Supabase-like stack for end-to-end tests without Docker:
#   Postgres :54322, GoTrue (Supabase Auth) :9999, PostgREST :3000, gateway :54321
# Needs PostgreSQL 15+ binaries plus the GoTrue and PostgREST release binaries:
#   GOTRUE_BIN=/path/to/auth  GOTRUE_MIGRATIONS=/path/to/migrations  POSTGREST_BIN=/path/to/postgrest
# Outgoing auth emails land in $STACK_DIR/mail. Writes .env.local for Vite. Stop everything with scripts/local-stack/stop.sh.
# Prefer `supabase start` (Docker) when it is available; this script exists for Docker-less machines.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
STATE="${STACK_DIR:-/tmp/macro-stack}"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PGBIN="${PGBIN:-$(dirname "$(command -v initdb)")}"
: "${GOTRUE_BIN:?set GOTRUE_BIN to the Supabase Auth (GoTrue) binary}"
: "${GOTRUE_MIGRATIONS:?set GOTRUE_MIGRATIONS to its migrations directory}"
: "${POSTGREST_BIN:?set POSTGREST_BIN to the PostgREST binary}"
JWT_SECRET="${JWT_SECRET:-local-dev-jwt-secret-at-least-32-characters}"
PGPORT=54322
PG_URL="postgresql://postgres@127.0.0.1:$PGPORT/postgres"

[ -x "$HERE/stop.sh" ] && STACK_DIR="$STATE" "$HERE/stop.sh" >/dev/null 2>&1 || true
rm -rf "$STATE"; mkdir -p "$STATE/data" "$STATE/storage"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then RUN_AS=(runuser -u postgres --); chown postgres "$STATE/data"; fi
"${RUN_AS[@]}" "$PGBIN/initdb" -D "$STATE/data" -U postgres -A trust >/dev/null
"${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$STATE/data" -l "$STATE/data/pg.log" \
  -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1" -w start >/dev/null
PSQL=(psql "$PG_URL" -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f "$HERE/bootstrap.sql"

SMTP_PORT=2500 MAIL_DIR="$STATE/mail" nohup node "$HERE/smtp-sink.mjs" >"$STATE/smtp.log" 2>&1 & echo $! >"$STATE/smtp.pid"

# GoTrue runs its own migrations into the auth schema on start.
GOTRUE_DB_DRIVER=postgres \
GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:local-dev-only@127.0.0.1:$PGPORT/postgres?search_path=auth" \
GOTRUE_DB_MIGRATIONS_PATH="$GOTRUE_MIGRATIONS" \
GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated \
GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
GOTRUE_SITE_URL=http://localhost:5173 GOTRUE_URI_ALLOW_LIST="http://localhost:5173/**" \
API_EXTERNAL_URL=http://127.0.0.1:54321/auth/v1 GOTRUE_API_HOST=127.0.0.1 PORT=9999 \
GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_DISABLE_SIGNUP=false \
GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=2500 GOTRUE_SMTP_ADMIN_EMAIL=noreply@macro.test \
GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 GOTRUE_LOG_LEVEL=warn \
  nohup "$GOTRUE_BIN" >"$STATE/gotrue.log" 2>&1 & echo $! >"$STATE/gotrue.pid"
for _ in $(seq 60); do
  curl -sf http://127.0.0.1:9999/health >/dev/null && break; sleep 0.5
done
curl -sf http://127.0.0.1:9999/health >/dev/null || { cat "$STATE/gotrue.log"; exit 1; }

for f in "$ROOT"/supabase/migrations/*.sql; do echo "migrate  $(basename "$f")"; "${PSQL[@]}" -f "$f"; done

PGRST_DB_URI="postgres://authenticator:local-dev-only@127.0.0.1:$PGPORT/postgres" \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$JWT_SECRET" \
PGRST_SERVER_HOST=127.0.0.1 PGRST_SERVER_PORT=3000 PGRST_DB_CHANNEL_ENABLED=true \
  nohup "$POSTGREST_BIN" >"$STATE/postgrest.log" 2>&1 & echo $! >"$STATE/postgrest.pid"

JWT_SECRET="$JWT_SECRET" PG_URL="$PG_URL" STORAGE_DIR="$STATE/storage" \
  nohup node "$HERE/gateway.mjs" >"$STATE/gateway.log" 2>&1 & echo $! >"$STATE/gateway.pid"
for _ in $(seq 40); do
  curl -sf http://127.0.0.1:3000/ >/dev/null && curl -s http://127.0.0.1:54321/ >/dev/null && break; sleep 0.5
done

ANON_KEY="$(node "$HERE/jwt.mjs" anon "$JWT_SECRET")"
SERVICE_KEY="$(node "$HERE/jwt.mjs" service_role "$JWT_SECRET")"
cat >"$ROOT/.env.local" <<EOF
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=$ANON_KEY
VITE_TUTOR_FUNCTION=tutor
EOF
echo "$SERVICE_KEY" >"$STATE/service_key"
echo "Local stack ready. API http://127.0.0.1:54321  DB $PG_URL"
