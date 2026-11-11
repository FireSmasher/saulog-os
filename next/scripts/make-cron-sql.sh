#!/bin/sh
# Makes next/.secrets/nudge-cron.sql (git-ignored) from supabase/nudge-setup.sql with the real
# CRON_SECRET and project ref filled in, and puts it on the clipboard. Prints no secret.
# Edwin runs it himself: sh ~/Documents/Projects/food-tracker-app.nosync/next/scripts/make-cron-sql.sh
set -e
cd "$(dirname "$0")/.."
set -a
. ./.secrets/push.env
set +a
REF=$(sed -n 's#.*https://\([a-z0-9]*\)\.supabase\.co.*#\1#p' src/lib/supabase.ts | head -1)
[ -n "$CRON_SECRET" ] || { echo "STOP: CRON_SECRET is empty in .secrets/push.env"; exit 1; }
[ -n "$REF" ] || { echo "STOP: project ref not found in src/lib/supabase.ts"; exit 1; }
umask 077
sed -e "s/PASTE_CRON_SECRET/$CRON_SECRET/" -e "s/PASTE_PROJECT_REF/$REF/" ../supabase/nudge-setup.sql > .secrets/nudge-cron.sql
if grep -q 'PASTE_' .secrets/nudge-cron.sql; then echo "STOP: a placeholder was not filled"; exit 1; fi
pbcopy < .secrets/nudge-cron.sql
echo "ok: cron SQL is on the clipboard ($(wc -l < .secrets/nudge-cron.sql | tr -d ' ') lines). Paste it into the SQL editor and Run."
