# Shared by backup.sh and restore-drill.sh. Not run on its own.

# The PostgreSQL server programs (initdb, pg_ctl) live outside PATH on Debian and Ubuntu.
for d in /usr/lib/postgresql/*/bin; do [ -d "$d" ] && PATH="$PATH:$d"; done

log() { printf '%s %s\n' "$(date -u +%H:%M:%SZ)" "$*" >&2; }
die() { log "FAILED: $*"; exit 1; }

# One line per table: name, tab, exact row count. Run inside the dump's snapshot at backup
# time and again after a restore, so the two lists must match exactly.
COUNTS_SQL="SELECT c.relname, (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY c.relname;"

table_counts() { psql -X -q -t -A -F $'\t' -v ON_ERROR_STOP=1 --dbname="$1" -c "$COUNTS_SQL"; }

# Restores dir/meridian.dump into the empty database at $2 and checks every table has the
# row count recorded in dir/counts.tsv. Prints a short summary of what came back.
restore_and_check() {
  local dir=$1 url=$2
  pg_restore --exit-on-error --no-owner --no-privileges --single-transaction --dbname="$url" "$dir/meridian.dump" ||
    die "pg_restore could not restore the backup"
  table_counts "$url" > "$dir/restored-counts.tsv"
  if ! diff -u "$dir/counts.tsv" "$dir/restored-counts.tsv" >&2; then
    die "row counts after restore differ from the backup (lines above: - backup, + restored)"
  fi
  local tables rows
  tables=$(wc -l < "$dir/counts.tsv")
  rows=$(awk -F'\t' '{ s += $2 } END { print s + 0 }' "$dir/counts.tsv")
  [ "$tables" -gt 0 ] || die "the backup has no tables"
  log "Restore check passed: $tables tables, $rows rows, every count identical."
  db_summary "$url" >&2
}

# A few lines that show at a glance whose data this is and how recent.
db_summary() {
  psql -X -q -t -A -v ON_ERROR_STOP=1 --dbname="$1" <<'SQL'
SELECT 'Patients:          ' || count(*) FROM "Patient";
SELECT 'Staff accounts:    ' || count(*) FROM "Practitioner" WHERE username IS NOT NULL;
SELECT 'Newest access log: ' || coalesce(max("at")::text, 'none') FROM "AuditEvent";
SELECT 'Latest migration:  ' || coalesce(max(migration_name), 'none') FROM _prisma_migrations WHERE finished_at IS NOT NULL;
SELECT 'Access log locked: ' || CASE WHEN count(*) > 0 THEN 'yes' ELSE 'NO (trigger missing)' END FROM pg_trigger WHERE tgname = 'AuditEvent_append_only';
SQL
}
