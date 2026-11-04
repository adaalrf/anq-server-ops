# Architecture

## Overview

The React UI and JSON API share one origin. Fastify validates incoming objects
with strict Zod schemas; PostgreSQL adds foreign keys, checks, and transactions.
Parameterized queries carry user content. A version counter guards inventory
updates. Journaling takes a row lock so an archive operation cannot race a write.
Exports use repeatable-read isolation for a coherent inventory/journal snapshot.

SQL migrations run in a transaction under an advisory lock and are tracked by
filename. Migrations must remain compatible with the previous running image;
image rollback cannot undo arbitrary schema changes.

## Authentication and demo separation

Owner mode fails to start without a properly formatted password hash. Scrypt
derives the password hash; comparison is constant-time. Login is limited to eight
attempts a minute per client IP and process. Forwarded-IP headers are ignored unless
`TRUST_PROXY_IPS` names exact sanitizing-proxy addresses. The `self` value resolves
current container addresses for verified rootless forwarding; it requires
loopback-only published ports and a proxy that discards client-supplied forwarding
headers. Shared public IPs still share a budget.
Sessions use random 256-bit cookies, store only SHA-256 token hashes in PostgreSQL,
expire after 12 hours, and use HttpOnly/SameSite=Strict; HTTPS adds Secure.

Every mutation requires the configured browser Origin. The UI uses same-origin
JSON requests and no CORS permission is granted. Content Security Policy allows
only first-party scripts and styles. No HTML from notes is rendered as markup.

Demo mode is explicit, denies every mutation before handling the route, and
allows unauthenticated reading and export. All demo data is public by design.
There is no public demo login or shared writable account.

## Product boundaries

Status is a person's latest recorded assessment, not a live health claim. Backup
freshness uses only past, completed backup events. Restore drills have their own
timestamp and notes. Neither timestamp means a backup can be recovered now.
The application never opens a server hostname, executes commands, or accepts
credentials for game servers.

The inventory is unpaginated and intended for a small fleet. The journal has filters
and 25 entries per page, and its summary uses that endpoint's exact total, so loading
the workspace doesn't download every entry just to count them. Journal history is
append-only through the app, but it isn't tamper-proof against database
administrators.

## Local owner workflow

The editable local workspace uses its own server_ops_owner database, separate
from the earlier read-only seed database. Bootstrap is explicit and repeatable;
it preserves existing configuration and records. Generated credentials live in
an ignored private directory excluded from both Docker context and Vite serving.

Navigation uses query parameters for the view and selected server. This keeps
refresh and browser history working without needing server-side SPA rewrites,
including when the proxy strips an /ops prefix. Global journal/backup recording
requires an active-server selection; recording within details fixes the server
to the current record. Existing API validation and demo restrictions are unchanged.

## Verification

API tests cover authentication, Origin enforcement, invalid input, stale edits,
backup/restore semantics, archiving, export, demo mode, expiry, and logout against
real PostgreSQL. Browser tests use a temporary schema and the compiled client.
See [deployment](DEPLOYMENT.md) for the container and database contract.
