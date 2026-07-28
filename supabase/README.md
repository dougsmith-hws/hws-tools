# Supabase persistence — Buyer Strategy Engine

Database architecture for the BSE, reproducible from this directory. **No secrets are stored here or anywhere in this repository.**

```
supabase/
├── migrations/
│   ├── 0001_bse_schema.sql          seven tables, constraints, indexes, RLS, triggers
│   └── 0002_seed_reference_data.sql tax methods + the immutable 2026.07-baseline assumption set
└── local-verify/
    └── 00_auth_stub.sql             LOCAL ONLY — recreates auth.uid()/auth.role() on plain Postgres
```

There is deliberately **no `mapping/` directory**. The canonical↔row mapping lives in the
application itself, inside `BSEPersistence` in `internal/buyer-strategy/index.html`, and the
test suite calls it *inside the page*. A second copy of that mapping in this directory would
have been a second source of truth — exactly the defect Gate B.5 removed from `gatherInputs()`.

## Status

Applied. Both migrations were run in the `hws-buyer-strategy` Supabase project on
**2026-07-28** and all seven verification checks passed. The schema, constraints and RLS
policies are additionally verified against a real PostgreSQL 16 instance on every test run,
so they remain reproducible without Supabase.

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

That suite runs the real application headless, captures canonical state, writes it through
**the application's own mapping** into the real schema **with RLS enabled and forced**, reads
it back as the owning user, restores it, and asserts round-trip identity, cross-user denial,
constraint enforcement, and the repeat-save write strategy (D12).

The client half — save/load orchestration, debounce, single-flight, failure handling — needs
no database at all:

```bash
node tests/persistence-client.test.js internal/buyer-strategy/index.html
```

## A note on how rounds are written

`negotiation_round` rows are **upserted on the natural key `(property_scenario_id,
round_number)`**, never deleted and re-inserted. Delete-and-reinsert is rejected by
`bse_round_delete_guard` the moment a scenario leaves `draft`, which would make every autosave
after the first client presentation fail. Test `D12a` pins that behaviour so the strategy
cannot quietly regress.

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
