# Image for the nightly backup job (Render Cron Job) and the restore drill.
# PG_MAJOR must match the live database's PostgreSQL version (Render: database → Info).
ARG PG_MAJOR=16
FROM postgres:${PG_MAJOR}-bookworm
RUN apt-get update \
  && apt-get install -y --no-install-recommends age curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY backup/*.sh /opt/meridian/
ENV PATH="/opt/meridian:${PATH}"
ENTRYPOINT []
CMD ["backup.sh"]
