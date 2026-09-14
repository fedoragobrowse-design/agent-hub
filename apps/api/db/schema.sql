-- PostgreSQL source-of-truth schema. Production deployments run this through a migration tool.
create table if not exists app_user (
  id uuid primary key, github_user_id text unique not null, login text not null, email text,
  created_at timestamptz not null default now()
);
create table if not exists github_connection (
  id uuid primary key, user_id uuid not null references app_user(id) on delete cascade,
  token_ref text not null, scopes text[] not null, created_at timestamptz not null default now(), revoked_at timestamptz
);
create table if not exists repository_connection (
  id uuid primary key, user_id uuid not null references app_user(id) on delete cascade,
  github_connection_id uuid not null references github_connection(id), full_name text not null, default_ref text not null
);
create table if not exists credential_reference (
  id uuid primary key, user_id uuid not null references app_user(id) on delete cascade,
  provider text not null, vault_ref text not null unique, created_at timestamptz not null default now()
);
create table if not exists extension_artifact (
  id uuid primary key, owner_id uuid references app_user(id), name text not null, version text not null, digest text not null,
  kind text not null check (kind in ('mcp','skill','plugin')), source_type text not null, source_url text not null,
  publisher text not null, capabilities jsonb not null default '[]', compatibility jsonb not null, scan_status text not null,
  visibility text not null check (visibility in ('public','private')), unique(source_url, digest)
);
create table if not exists approval_grant (
  id uuid primary key, user_id uuid not null references app_user(id) on delete cascade,
  artifact_id uuid not null references extension_artifact(id), digest text not null, harness text not null, scope text not null,
  capabilities jsonb not null, granted_at timestamptz not null, expires_at timestamptz
);
create table if not exists run (
  id uuid primary key, user_id uuid not null references app_user(id) on delete cascade, repository_id uuid references repository_connection(id),
  harness text not null, target text not null, ref text not null, prompt text not null, state text not null,
  credential_ref_id uuid references credential_reference(id), created_at timestamptz not null, updated_at timestamptz not null, expires_at timestamptz not null
);
create table if not exists run_event (
  id uuid primary key, run_id uuid not null references run(id) on delete cascade, occurred_at timestamptz not null,
  type text not null, message text not null, encrypted_raw bytea
);
create index if not exists run_user_created_idx on run(user_id, created_at desc);
create index if not exists run_event_run_time_idx on run_event(run_id, occurred_at);
