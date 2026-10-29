# Operations

- Keep the owner workspace behind HTTPS; never put real inventory into the
  public demo. A `DEMO_MODE=true` instance exposes its entire export to visitors.
- Store app configuration and credentials outside Git and outside the image.
- Migrate explicitly before first startup. Do not run the fictional seed command
  on an actual workspace; it refuses an inventory containing any server.
- Back up PostgreSQL to encrypted off-server storage and test an isolated restore.
  The disposable VPS currently uses local test backup storage only.
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
