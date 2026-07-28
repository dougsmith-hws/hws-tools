# Supabase persistence — Buyer Strategy Engine

Database architecture for the BSE, reproducible from this directory. **No secrets are stored here or anywhere in this repository.**

```
supabase/
├── migrations/
│   ├── 0001_bse_schema.sql          seven tables, constraints, indexes, RLS, triggers
│   └── 0002_seed_reference_data.sql tax methods + the immutable 2026.07-baseline assumption set
├── mapping/
│   └── canonical-to-db.js           BSEModel canonical state <-> database rows (pure, no network)
└── local-verify/
    └── 00_auth_stub.sql             LOCAL ONLY — recreates auth.uid()/auth.role() on plain Postgres
```

## Status

The schema, constraints, RLS policies and the canonical↔database mapping are **written and verified against a real PostgreSQL 16 instance**. They have **not** been applied to a Supabase project, because no Supabase project, credential, or connector was reachable from this session — see `docs/BSE-Phase3-GateC-Report.md` §5.

## Applying to Supabase (once a project exists)

Do **not** run `local-verify/00_auth_stub.sql` — Supabase already provides `auth.users`, `auth.uid()` and `auth.role()`.

```bash
supabase link --project-ref <ref>
supabase db push                    # applies migrations/ in order
```

or, with the SQL editor, run `0001` then `0002` once each. Both are idempotent (`if not exists` / `on conflict do nothing`) except the policy and trigger creations, which will error if re-run — drop them first if reapplying.

## Verifying locally (no Supabase required)

```bash
# a plain PostgreSQL 16 instance on port 5433
createdb bse_verify
psql -d bse_verify -f supabase/local-verify/00_auth_stub.sql   # LOCAL ONLY
psql -d bse_verify -f supabase/migrations/0001_bse_schema.sql
psql -d bse_verify -f supabase/migrations/0002_seed_reference_data.sql

PGHOST=/tmp/pgsock PGPORT=5433 node tests/persistence-db.test.js internal/buyer-strategy/index.html
```

That suite runs the real application headless, captures canonical state, writes it through the mapping into the real schema **with RLS enabled and forced**, reads it back as the owning user, restores it, and asserts round-trip identity, cross-user denial, and constraint enforcement.

## What the schema enforces, not just the application

| Rule | Mechanism |
|---|---|
| A `(value, unit)` pair can never be split | `CHECK ((value is null) = (unit is null))` on down payment and concession, on both plan and scenario. This is what makes the C-4(a) corruption impossible to *persist* |
| Authored NULL ≠ authored zero | Every inheritable column is nullable; the mapping writes SQL NULL for blank and `0` for an authored zero, and never writes a resolved default |
| A negotiation round requires a price | `price numeric not null` + `CHECK (price > 0)` |
| Negotiation intent does not require a round | `negotiation_mode`, `offer_concession_value/unit` live on `property_scenario` |
| Three-state cost fields | `CHECK ((status = 'known') = (value is not null))` — the value stays NULL in both zero cases |
| Exactly one active shopping plan per buyer | partial unique index |
| At most one accepted negotiation round | partial unique index |
| Exactly one current assumption set | partial unique index |
| Assumption sets are immutable | `BEFORE UPDATE OR DELETE` trigger raising an exception (M-9) |
| `fl_millage` requires a closing date | `CHECK` — the placeholder cannot be misused |
| Nothing a client was shown is hard-deletable | delete guards on `property_scenario` and `negotiation_round` |
| Users see only their own rows | RLS `enable` **and** `force`, `owner_user_id = auth.uid()`, on all five buyer-owned tables |

## Secrets

Never commit the service-role key, the database password, or any admin credential. The browser client may carry only the public project URL and the anon/publishable key, and security comes from Supabase Auth plus the RLS policies above — never from frontend filtering.
