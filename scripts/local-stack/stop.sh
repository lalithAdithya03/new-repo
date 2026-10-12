#!/usr/bin/env bash
# Stops the stack started by start.sh and deletes its data.
STATE="${STACK_DIR:-/tmp/macro-stack}"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
for p in gateway postgrest gotrue smtp; do [ -f "$STATE/$p.pid" ] && kill "$(cat "$STATE/$p.pid")" 2>/dev/null; done
RUN_AS=(); [ "$(id -u)" = "0" ] && RUN_AS=(runuser -u postgres --)
"${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$STATE/data" -m fast stop >/dev/null 2>&1
rm -rf "$STATE"
echo "Local stack stopped."
