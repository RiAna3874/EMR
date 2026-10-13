#!/usr/bin/env bash
# Restores an off-site backup and checks every table's row count against the count taken
# when the backup was made. See docs/BACKUPS.md.
#
#   restore-drill.sh BACKUP_FILE                 drill: restore into a new database, meridian_restored
#   restore-drill.sh BACKUP_FILE NAME            drill into a new database called NAME
#   restore-drill.sh BACKUP_FILE postgresql://…  real recovery: restore into that database, which must be empty
#
# Environment:
#   BACKUP_AGE_IDENTITY   the age private key file (default /keys/meridian-backup-key.txt)
#   RESTORE_SERVER_URL    for a drill, the PostgreSQL server to create the database on
#                         (default: the docker-compose database on this computer)
set -euo pipefail
. "$(dirname "$0")/common.sh"

file=${1:-}
[ -n "$file" ] && [ -f "$file" ] || die "usage: restore-drill.sh BACKUP_FILE [NAME | DATABASE_URL] (file not found: ${file:-none})"
dest=${2:-meridian_restored}
identity=${BACKUP_AGE_IDENTITY:-/keys/meridian-backup-key.txt}
[ -f "$identity" ] || die "private key not found at $identity"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

log "Decrypting $(basename "$file")"
age --decrypt -i "$identity" "$file" | tar -C "$work" -xf - || die "could not decrypt (wrong key, or the file is damaged)"
sed 's/^/  /' "$work/info.txt" >&2

if [[ $dest =~ ^postgres(ql)?:// ]]; then
  target=$dest
  tables=$(psql -X -t -A -v ON_ERROR_STOP=1 --dbname="$target" -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'") ||
    die "cannot connect to the database"
  [ "$tables" = 0 ] || die "that database already has $tables tables. Restore only into a new, empty database."
  label="the database you gave"
else
  [[ $dest =~ ^[a-z_][a-z0-9_]*$ ]] || die "database name must be lower-case letters, digits and _"
  server=${RESTORE_SERVER_URL:-postgresql://meridian:meridian@host.docker.internal:5432/meridian}
  exists=$(psql -X -t -A -v ON_ERROR_STOP=1 --dbname="$server" -c "SELECT 1 FROM pg_database WHERE datname = '$dest'") ||
    die "cannot connect to $server"
  [ -z "$exists" ] || die "database $dest already exists. Drop it first (DROP DATABASE $dest) or pass another name."
  psql -X -q -v ON_ERROR_STOP=1 --dbname="$server" -c "CREATE DATABASE $dest" >/dev/null
  # Same server, other database: swap the path part of the URL.
  target=$(sed -E "s#^(postgres(ql)?://[^/]*)/[^?]*#\1/$dest#" <<<"$server")
  label="database $dest"
fi

log "Restoring into $label"
restore_and_check "$work" "$target"
log "Restore passed. The data is in $label."
[[ $dest =~ ^postgres ]] || log "It holds real patient records: drop it when you've finished (DROP DATABASE $dest)."
