#!/usr/bin/env bash
# Prints a short summary of a Meridian database (patients, accounts, newest access log entry,
# latest migration), for checking a point-in-time recovery copy. See docs/BACKUPS.md.
#   check-db.sh DATABASE_URL
set -euo pipefail
. "$(dirname "$0")/common.sh"
[ -n "${1:-}" ] || die "usage: check-db.sh DATABASE_URL"
db_summary "$1"
