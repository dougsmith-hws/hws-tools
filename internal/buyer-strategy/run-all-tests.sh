#!/bin/bash
# =====================================================================
# BSE regression runner — every suite that does not require PostgreSQL.
#
#   ./run-all-tests.sh              runs against ./index.html
#   ./run-all-tests.sh other.html   runs against another application file
#
# The M-1 differential suite needs the pre-Phase-3 baseline. If it is not
# already at /tmp/bse-baseline.html this script extracts it from git:
#
#   git cat-file -p 540ccbe:internal/buyer-strategy/index.html
#
# `git cat-file` is read-only plumbing and does not take a lock, so it
# works through the Cowork device bridge where `checkout` and `commit` do
# not. See BSE-Project-Status.md §6.
#
# Exit 0 = every suite green.
# =====================================================================
cd "$(dirname "$0")" || exit 1
APP="${1:-index.html}"
BASELINE=/tmp/bse-baseline.html
FAILED=0

if [ ! -f "$BASELINE" ]; then
  if git -C ../.. cat-file -p 540ccbe:internal/buyer-strategy/index.html > "$BASELINE" 2>/dev/null; then
    echo "  (extracted 540ccbe baseline -> $BASELINE)"
  else
    rm -f "$BASELINE"
    echo "  WARNING: could not extract the 540ccbe baseline; M-1 will be skipped."
  fi
fi

# The Comfort Calculator is opened READ-ONLY by the R-47 cross-tool suite.
CC=""
for p in ../../buyer/comfort-calculator.html ../buyer/comfort-calculator.html; do
  [ -f "$p" ] && CC="$p" && break
done

run() {
  local label="$1"; shift
  printf "  %-34s " "$label"
  if "$@" > /tmp/bse-last.log 2>&1; then
    local n
    n=$(grep -oE "PASS [0-9]+ +FAIL [0-9]+|passing: +[0-9]+" /tmp/bse-last.log | tail -1)
    echo "OK    ${n}"
  else
    echo "FAIL  — see /tmp/bse-last.log"
    cp /tmp/bse-last.log "/tmp/bse-fail-${label// /_}.log"
    FAILED=1
  fi
}

echo "======================================================="
echo "  BSE REGRESSION"
echo "  app:  $APP"
echo "  md5:  $(md5sum "$APP" 2>/dev/null | cut -d' ' -f1)"
echo "======================================================="
run "engine-freeze (protected calc)"  node tests/engine-freeze.test.js "$APP"
run "bse-regression (47 scenarios)"   node tests/bse-regression.test.js "$APP"
run "dp-solver (Fernando, N-1)"       node tests/dp-solver.test.js "$APP"
run "answer-layer (Job 1 + Job 2)"    node tests/answer-layer.test.js "$APP"
run "shopping authored inputs"          node tests/shopping-dp-target.test.js "$APP"
run "job1 what-if (required down)"     node tests/job1-whatif.test.js "$APP"
run "job1 closeout (presentation)"     node tests/job1-closeout.test.js "$APP"
run "job1 rate impact"                 node tests/job1-rate-impact.test.js "$APP"
run "job2 property strategy"           node tests/job2-property-strategy.test.js "$APP"
run "fl-tax (WP-1 FL/homestead)"       node tests/fl-tax.test.js "$APP"
run "cash-model (WP-2 cash/CTC)"       node tests/cash-model.test.js "$APP"
run "buyer-priority (WP-3)"            node tests/buyer-priority.test.js "$APP"
if [ -f "$BASELINE" ]; then
  run "m1-canonical-units"            node tests/m1-canonical-units.test.js "$BASELINE" "$APP"
else
  echo "  m1-canonical-units                 SKIPPED (no 540ccbe baseline)"
fi
run "canonical-state"                 node tests/canonical-state.test.js "$APP"
run "c4b-presentation-integrity"      node tests/c4b-presentation-integrity.test.js "$APP"
run "model-authority"                 node tests/model-authority.test.js "$APP"
run "persistence-contract"            node tests/persistence-contract.test.js "$APP"
run "persistence-client"              node tests/persistence-client.test.js "$APP"
if [ -n "$CC" ]; then
  run "r47-cross-tool"                node tests/r47-cross-tool.test.js "$APP" "$CC"
else
  echo "  r47-cross-tool                     SKIPPED (comfort-calculator.html not found)"
fi
# persistence-db needs a real PostgreSQL. It is RUN when one is reachable — set
# PGHOST/PGPORT (see supabase/README.md) — and skipped with a notice otherwise.
if [ -n "$PGHOST" ] && command -v psql >/dev/null 2>&1 && \
   psql -U "${PGUSER:-claude}" -d bse_verify -c 'select 1' >/dev/null 2>&1; then
  run "persistence-db (schema/RLS)"     node tests/persistence-db.test.js "$APP"
else
  echo "  persistence-db                     SKIPPED (no PostgreSQL reachable; see supabase/README.md)"
fi
echo "======================================================="
if [ $FAILED -eq 0 ]; then echo "  ALL GREEN"; else echo "  FAILURES PRESENT — STOP"; fi
echo "======================================================="
exit $FAILED
