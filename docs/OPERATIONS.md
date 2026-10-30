# Operations

- Keep the owner workspace behind HTTPS; never put real inventory into the
  public demo. A `DEMO_MODE=true` instance exposes its entire export to visitors.
- Store app configuration and credentials outside Git and outside the image.
- Migrate explicitly before first startup. Do not run the fictional seed command
  on an actual workspace; it refuses an inventory containing any server.
- Back up PostgreSQL to encrypted off-server storage and test an isolated restore.

- To revoke all sessions after a password rotation or incident, execute
  `DELETE FROM sessions` through an administrative database connection.
- Expired sessions are rejected on every request and removed on successful login.
- A 409 on inventory update means the record changed. Reload, review the latest
  version, then reapply the intended edit; do not blindly retry the old version.
- Archive instead of deleting servers. Archiving keeps their journal and rejects
  new entries; unarchive to record further work. Journal corrections are new entries.
- JSON export is an application-level data copy, not a replacement for a full
  PostgreSQL backup. There is no JSON import endpoint in v1.
- Logs omit request bodies and cookies by default. Avoid putting credentials in
  inventory notes or journal text. Do not configure request-body logging.

## Recovery drill

Restore a database dump into a fresh PostgreSQL instance, configure a separate
copy of the app with new credentials, and check sign-in, inventory, journal,
backup timestamps, and export. Keep the original app stopped during a real
cutover and account for any changes made after the backup. Test a previous-image
rollback after each schema change before publishing that change.

## Deployment

### Runtime

Build with `podman build -t localhost/anq-server-ops:release .`.
The image serves the built interface and API on port 8080 as an unprivileged user.
It supports a read-only filesystem with writable `/tmp` and requires PostgreSQL 17.
Container replacement must preserve the database volume; application containers
are disposable.

Supply `DATABASE_URL` and the exact HTTPS `APP_ORIGIN` through a protected host
environment file. Keep the database off the public network and terminate TLS at
the reverse proxy. `/healthz` checks database access and the initial schema;
it does not verify a backup or every migration.

### Database and access

Run `node dist/server/migrate.js` explicitly before startup. Startup does not
migrate or seed automatically. Back up existing data before applying migrations.
A previous image is usable for rollback only while its schema remains compatible;
image rollback does not undo database changes.

Set `DEMO_MODE=false`, `OWNER_USERNAME`, and `OWNER_PASSWORD_HASH` for a private
owner workspace. Generate the hash with `npm run --silent password`, supplying
the password on stdin. Owner mode requires HTTPS outside localhost.

A public demo must use `DEMO_MODE=true`, a separate database, and fictional data.
Run the seed command only for an empty demonstration database. Never copy owner
records or credentials into a demo, screenshot, or repository.

### ANQ Publish

Enable PostgreSQL and encrypted off-host backups, and configure:

```sh
MIGRATION_COMMAND=(node dist/server/migrate.js)
```

Keep each deployment's Unix account, database and secrets separate. Verify HTTPS,
sign-in, saved-record persistence after container replacement, and an isolated
restore before storing valuable data. Use the recovery procedure above.
