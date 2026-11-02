# ANQ Server Ops

[![Checks](https://github.com/adaalrf/anq-server-ops/actions/workflows/check.yml/badge.svg)](https://github.com/adaalrf/anq-server-ops/actions/workflows/check.yml)

A server-inventory and maintenance journal with contextual forms and dated
history. Its interface keeps recorded status, backup records and restore drills
visible together while preserving their different meanings. Built with React,
TypeScript, Fastify and PostgreSQL.

[Explore the read-only demo](https://ops.demo.adaalrf.dev) · [Case study](https://adaalrf.dev/work/anq-server-ops/) · [Source map](CONTRIBUTING.md#where-changes-belong)

The public demo contains fictional servers and maintenance records.

![Server inventory](docs/screenshots/inventory-desktop.png)

## Review path

- [Inventory](src/client/pages/Inventory.tsx) brings recorded status and recovery evidence into one view.
- [RecordDialog](src/client/components/RecordDialog.tsx) keeps journal entries tied to an explicit server.
- [Browser workflows](tests/browser.ts) cover contextual forms, validation recovery, filtering and deep links.

## How this project is developed

AI coding agents implement and revise the application, with scope, architecture
and presentation directed by the maintainer. The [development guide](CONTRIBUTING.md)
keeps recorded evidence and live monitoring distinct. Database and browser tests
check record updates, history and the meaning of backup and restore indicators.

The [initial public release](https://github.com/adaalrf/anq-server-ops/commit/daca5cd) is a squashed snapshot of pre-publication development; subsequent changes are recorded incrementally.

## Run locally

Requires Linux, Node.js 24+, npm and rootless Podman:

```sh
npm ci
npm run setup:local
npm run dev
```

Open http://localhost:5173 and sign in as `owner`. Read the generated password
privately in `.local/owner-credentials.json`. Setup starts PostgreSQL 17 with a
persistent volume and fictional inventory. Repeating setup preserves records and
credentials. Ctrl-C stops the API and Vite, leaving the database intact.

## Use it

- Create, search, edit and archive servers; archived records retain their history.
- Record maintenance, incidents, backups and restore drills with event times.
- Review overdue/missing backups against each server's interval target.
- Keep restore evidence separate: planned or failed backups do not reset freshness.
- Export the complete inventory and journal as JSON.

Record work from a server's details or select an active server in the journal.
Stale edits return a conflict; reload and review before reapplying changes.
Correct journal mistakes with a new entry. View and server links survive refresh
and Back/Forward. The journal has filters and 25 entries per page.

## Configuration and limits

`.env.example` describes manual configuration. Owner mode uses
`DEMO_MODE=false`, `OWNER_USERNAME`, `OWNER_PASSWORD_HASH` and an exact
`APP_ORIGIN`. Generate a hash with `npm run --silent password`, passing the
password on stdin. HTTPS is required outside localhost. A demo exposes its entire
inventory and export; give it a separate database containing fictional records.

This app records human observations. It does not probe hosts, execute commands,
verify backup repositories, send notifications or control game servers. Inventory
is unpaginated and intended for a small fleet. Journal history is append-only
through the app, not tamper-proof against database administrators. Export has no
matching JSON import endpoint.

## Development and deployment

[Contributing](CONTRIBUTING.md) covers the source map, development commands and
isolated API/browser tests. [Design](docs/DESIGN.md) explains the domain rules and
authorization boundary. [Operations](docs/OPERATIONS.md) covers deployment and
recovery. Keep credentials private and never aim tests at production.

For a read-only sample prepared on a known UTC date, set `DEMO_DATE_ANCHOR=YYYY-MM-DD` alongside `DEMO_MODE=true`. API dates then move together relative to today; stored records, text and pagination keys remain unchanged. Leave it blank for stored dates. Owner mode rejects this setting. The demo banner explains the relative dates.

The journal summary uses the paginated endpoint’s exact total; loading the workspace does not download hundreds of full journal entries just to count them.
