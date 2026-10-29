CREATE TABLE servers (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  hostname text NOT NULL CHECK (length(hostname) <= 253),
  provider text NOT NULL CHECK (length(provider) <= 80),
  region text NOT NULL CHECK (length(region) <= 80),
  game text NOT NULL CHECK (length(game) <= 80),
  status text NOT NULL CHECK (status IN ('operational','degraded','offline','unknown')),
  notes text NOT NULL CHECK (length(notes) <= 4000),
  backup_interval_hours integer NOT NULL CHECK (backup_interval_hours BETWEEN 1 AND 8760),
  archived boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE entries (
  id uuid PRIMARY KEY,
  server_id uuid NOT NULL REFERENCES servers(id),
  kind text NOT NULL CHECK (kind IN ('maintenance','incident','backup','restore')),
  outcome text NOT NULL CHECK (outcome IN ('completed','planned','failed')),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  notes text NOT NULL CHECK (length(notes) <= 8000),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entries_server_time ON entries(server_id, occurred_at DESC);
CREATE INDEX entries_time ON entries(occurred_at DESC);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
