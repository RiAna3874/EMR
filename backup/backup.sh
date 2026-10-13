#!/usr/bin/env bash
# Nightly off-site backup of the Meridian database. Runs as a Render Cron Job (see
# docs/BACKUPS.md) from the image built by backup/Dockerfile.
#
# 1. Dumps the database, and counts every table's rows in the same snapshot.
# 2. Restores the dump into a throwaway PostgreSQL inside this container and checks every
#    count matches. A backup that doesn't restore fails the job, so Render emails you.
# 3. Encrypts the dump with age to the public key(s) in BACKUP_AGE_RECIPIENTS. Only the
#    matching private key, kept off the server, can read it.
# 4. Uploads it to an S3-compatible bucket in a different account from the database.
#
# Environment:
#   DATABASE_URL                         the database to back up
#   BACKUP_AGE_RECIPIENTS                one or more age public keys (age1...), space-separated
#   S3_BUCKET, S3_REGION                 e.g. meridian-backups, ap-southeast-1
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY   a key that may only upload (PutObject)
#   S3_ENDPOINT    optional, for non-AWS storage; default https://s3.<region>.amazonaws.com
#   S3_PREFIX      optional folder in the bucket; default daily
#   BACKUP_HEARTBEAT_URL   optional, fetched after a good backup so a monitor notices a missed one
set -euo pipefail
. "$(dirname "$0")/common.sh"

for v in DATABASE_URL BACKUP_AGE_RECIPIENTS S3_BUCKET S3_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  [ -n "${!v:-}" ] || die "$v is not set"
done
endpoint=${S3_ENDPOINT:-https://s3.$S3_REGION.amazonaws.com}
stamp=$(date -u +%Y-%m-%dT%H%M%SZ)
name="meridian-$stamp.tar.age"

work=$(mktemp -d)
pg_running=""
# initdb refuses to run as root, which is what Render runs the job as.
as_postgres() { if [ "$(id -u)" = 0 ]; then gosu postgres "$@"; else "$@"; fi; }
cleanup() {
  [ -n "$pg_running" ] && as_postgres pg_ctl -D "$work/pg" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

# --- 1. Dump, with row counts from the same snapshot ---------------------------------
# A second session holds a read-only transaction open and exports its snapshot; the counts
# and pg_dump both read from it, so they describe exactly the same data.
log "Dumping $(sed -E 's#.*@([^/:?]+).*#\1#' <<<"$DATABASE_URL")"
coproc SNAP { psql -X -q -t -A -F $'\t' -v ON_ERROR_STOP=1 --dbname="$DATABASE_URL"; }
printf '%s\n' "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;" "SELECT pg_export_snapshot();" >&"${SNAP[1]}"
read -r -t 60 snapshot <&"${SNAP[0]}" || die "could not open a snapshot"
printf '%s\n' "$COUNTS_SQL" "SELECT '--end--';" >&"${SNAP[1]}"
: > "$work/counts.tsv"
while :; do
  read -r -t 600 line <&"${SNAP[0]}" || die "could not count rows"
  [ "$line" = "--end--" ] && break
  printf '%s\n' "$line" >> "$work/counts.tsv"
done
pg_dump --format=custom --no-owner --no-privileges --snapshot="$snapshot" --dbname="$DATABASE_URL" --file="$work/meridian.dump"
printf '%s\n' "COMMIT;" '\q' >&"${SNAP[1]}"
wait "$SNAP_PID" 2>/dev/null || true
{
  echo "taken_at=$stamp"
  echo "pg_dump=$(pg_dump --version)"
  echo "server=$(psql -X -t -A --dbname="$DATABASE_URL" -c 'SHOW server_version')"
} > "$work/info.txt"
log "Dumped $(wc -l < "$work/counts.tsv") tables, $(du -h "$work/meridian.dump" | cut -f1)"

# --- 2. Prove it restores ---------------------------------------------------------------
[ "$(id -u)" = 0 ] && chown postgres "$work"
as_postgres initdb -D "$work/pg" -U postgres --auth=trust >/dev/null
as_postgres pg_ctl -D "$work/pg" -o "-c listen_addresses='' -k $work" -l "$work/pg.log" -w start >/dev/null
pg_running=1
psql -X -q -h "$work" -U postgres -d postgres -c "CREATE DATABASE meridian_check" >/dev/null
restore_and_check "$work" "postgresql:///meridian_check?host=$work&user=postgres"
as_postgres pg_ctl -D "$work/pg" -m fast stop >/dev/null
pg_running=""

# --- 3. Encrypt ---------------------------------------------------------------------------
recipients=()
for r in $BACKUP_AGE_RECIPIENTS; do recipients+=(-r "$r"); done
tar -C "$work" -cf - meridian.dump counts.tsv info.txt | age "${recipients[@]}" > "$work/$name"
sha=$(sha256sum "$work/$name" | cut -d' ' -f1)

# --- 4. Upload ----------------------------------------------------------------------------
key="${S3_PREFIX:-daily}/$name"
log "Uploading $key ($(du -h "$work/$name" | cut -f1)) to $S3_BUCKET"
curl --fail-with-body --silent --show-error --retry 4 --retry-all-errors \
  --aws-sigv4 "aws:amz:$S3_REGION:s3" --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -H "x-amz-content-sha256: $sha" -H "Content-Type: application/octet-stream" \
  --upload-file "$work/$name" "$endpoint/$S3_BUCKET/$key" >/dev/null || die "upload failed"

if [ -n "${BACKUP_HEARTBEAT_URL:-}" ]; then
  curl --silent --show-error --retry 3 --max-time 15 "$BACKUP_HEARTBEAT_URL" >/dev/null || log "heartbeat ping failed (the backup itself is fine)"
fi
log "Backup $name done."
