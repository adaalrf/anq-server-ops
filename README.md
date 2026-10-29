# ANQ Server Ops

A single-owner operations journal for game servers. Keep an inventory, record
maintenance and incidents, and distinguish a backup record from a tested restore.
React, TypeScript, Fastify, and PostgreSQL. No remote execution or monitoring agents.

![Inventory screenshot](docs/screenshots/inventory-desktop.png)

## What works

- Search and filter inventory; create, edit, archive, and restore server records.
- Append maintenance, incident, backup, and restore-drill records with event times.
- Show overdue or missing backup records against a per-server interval target.
- Keep restore evidence separate from backup completion. Failed and planned
  backups never reset the completed-backup timestamp.
- Owner authentication with expiring server-side sessions, or an explicitly
  read-only demo containing fictional records.
- Export the complete inventory and journal as JSON from one database snapshot.
- Reject stale edits instead of silently overwriting another session's changes.

## Run locally

### Editable local workspace

On Linux with Node.js 24+ and rootless Podman, run:

```sh
npm ci
npm run setup:local
npm run dev
```

Open **http://localhost:5173** and sign in as `owner`. Your generated password is
in `.local/owner-credentials.json`; open that private file to read it. Setup never
prints the password. Use the localhost URL so the browser Origin matches the
owner configuration.

Setup reuses the `server-ops-dev-db` development container at 127.0.0.1:55432 and
creates a separate `server_ops_owner` database with the fictional sample fleet.
It creates the container with a persistent volume if needed. The older `server_ops`
demo database is preserved. Repeating setup preserves credentials and inventory
edits and does not seed duplicate records. Different existing `.env` settings are
rejected without overwriting them.

`.env` and `.local/owner-credentials.json` are private (mode 600); `.local/` is
excluded from Git, the Docker build context, and Vite filesystem serving. Keep it
private even though the initial records are fictional. Do not use the documented
development database password for a publicly hosted database.

`dev:local` checks ports before starting the API and Vite together. Ctrl-C stops
both development processes and leaves PostgreSQL and its data intact. To resume,
run `npm run dev:local` again. No VPS or publication step is involved.

With the workspace running, `npm run test:local` checks the actual Vite-served
client, owner login, API proxy, links, logout, and private-file denial without
editing inventory. It reads the generated local credentials privately. On NixOS,
set `CHROMIUM_EXECUTABLE` as described in the verification section below.

The activity journal has **Record work** with a required active-server selector.
Backup records has **Record backup**, offering backup and restore-drill entries.
Recording from a server's details keeps that server fixed. View and server links
are stored in query parameters, so refresh, direct links, and Back/Forward work
under both `/` and `/ops/`. Archived servers stay readable but cannot receive work.

### Manual configuration or read-only demo

Node.js 24+ and PostgreSQL 17 are required. Docker Compose is optional; the supplied
Compose file runs only a localhost development database, with a development-only
password. An equivalent rootless Podman command is:

```sh
podman run -d --name server-ops-dev-db \
  -e POSTGRES_PASSWORD=local-development-only -e POSTGRES_DB=server_ops \
  -p 127.0.0.1:55432:5432 \
  -v server-ops-development-data:/var/lib/postgresql/data docker.io/library/postgres:17-alpine
npm ci
cp .env.example .env
node --env-file=.env --import tsx src/server/migrate.ts
SEED_DEMO=true node --env-file=.env --import tsx src/server/seed.ts
node --env-file=.env --import tsx --watch src/server/main.ts
```

In another terminal run `npm run dev:client`, then open http://localhost:5173.
The default example is a read-only demo. Seeding is explicit, refuses a non-empty
inventory, and uses `.invalid` hostnames and fictional recovery evidence.

For an editable local workspace, set `DEMO_MODE=false` and provide a password
hash. Generate it without putting the password in a process argument or history:

```sh
read -rs -p 'Owner password (12+ characters): ' ops_password
printf '%s' "$ops_password" | npm run --silent password
unset ops_password
```

Copy the resulting hash into `.env` as `OWNER_PASSWORD_HASH` (no plaintext
password). The `read` command above uses Bash. Restart the server after editing
configuration. Owner mode requires HTTPS except on localhost. `APP_ORIGIN` is
the exact browser origin, without a trailing slash; all mutations check it.

## Verify

```sh
npm run typecheck
npm run build
TEST_DATABASE_URL=postgres://postgres:local-development-only@127.0.0.1:55432/server_ops npm test
npx playwright install chromium
TEST_DATABASE_URL=postgres://postgres:local-development-only@127.0.0.1:55432/server_ops npm run test:browser
```

API and browser tests create and drop their own randomly named schemas. Never
point them at production. On NixOS, use a Nix Chromium package and set
`CHROMIUM_EXECUTABLE=/absolute/path/to/bin/chromium` for browser tests.
Browser tests use the production build and exercise sign-in, create/edit/archive,
journaling, persistence, export, demo restrictions, search, navigation, mobile
layout, and an automated WCAG A/AA inventory scan. Screenshots use fictional data.

## Publish

Build `podman build -t server-ops .`; the image listens on port 8080, serves the
React build and API together, and supports a read-only filesystem. The Node base
image is pinned by digest. `/healthz` returns 200 only if the database and initial
schema are readable. Startup does not migrate or seed data automatically.

With `anq-publish`, enable PostgreSQL and backups and set
`MIGRATION_COMMAND=(node dist/server/migrate.js)`. The deployer takes a backup
before migrations. Provide `DATABASE_URL`, `APP_ORIGIN`, and either owner
credentials or `DEMO_MODE=true` through the protected app environment file.
See [operations](docs/OPERATIONS.md) and [design decisions](docs/DESIGN.md).

The disposable demo uses a build argument `VITE_BASE_PATH=/ops/` and a proxy
that strips `/ops` before forwarding. Normal deployments use the default `/`.

## Scope and limits

Single owner, no invitations or multi-tenant authorization. Journal entries are
append-only in the application, not a tamper-proof audit log against a database
administrator. Add a correction entry for an inaccurate record. The journal shows
25 entries per page with server, kind, result, date, and text filters; export includes all entries. Inventory is unpaginated
and intended for a small fleet. Backup records do not verify a backup repository.
There is no background probing, scheduler, notifications, or game-server control.

The current fictional read-only demo is live at https://ops.demo.adaalrf.dev. The current
source-organization/interface pass is deployed and verified over public HTTPS.
GitHub publication remains a separate step.

## Source organization

Page views live in `src/client/pages/`, shared controls and record forms in
`components/`, and the sidebar/topbar/reading area in `layouts/Workspace.tsx`.
`App.tsx` coordinates authenticated data and mutations. Client types and display
formatting live in `types.ts` and `lib/presentation.ts`. Navigation keeps the
existing deployment prefix. See [editing guide](docs/SOURCE-STRUCTURE.md).

## Working on the project

See [contributing and development](CONTRIBUTING.md) for the source map, everyday
commands, test prerequisites and troubleshooting. `npm run dev` starts both the
API and Vite after local setup; `dev:local` remains an alias. For a custom manual
configuration, run `npm run dev:server` and `npm run dev:client` separately.
