/* =====================================================================
   BUYER STRATEGY ENGINE — PERMANENT NUMERICAL REGRESSION SUITE
   Phase 3 Gate B, Stage 1.

   The 47 audit scenarios (docs/BSE-Phase0-1-Forensic-Audit.md §11.3) are run
   against the application and compared to FIXED expected values held in
   tests/baseline/bse-expected-baseline.json.

   The suite NEVER recomputes an expected value. It compares the application
   against the frozen file. The frozen file's numbers were produced by an
   independent implementation of the documented specification
   (tests/oracle/reference_model.py), not by the application.

   Field statuses in the frozen file:
     EXPECTED VALUE VERIFIED        — independently derived; a mismatch is a
                                      calculation regression
     EXPECTED VALUE REQUIRES REVIEW — audit §11.5 says it cannot be established
                                      statically; the recorded value is a
                                      change-detector only, not a correctness claim

   Usage:
     node tests/bse-regression.test.js <app.html> [--verbose]

   Exit code 0 = every scenario matched the frozen baseline.
   ===================================================================== */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const harness = require('./lib/app-harness');

const APP = process.argv[2];
const VERBOSE = process.argv.includes('--verbose');
const BASELINE_PATH = path.join(__dirname, 'baseline', 'bse-expected-baseline.json');

if (!APP) { console.error('usage: node tests/bse-regression.test.js <app.html> [--verbose]'); process.exit(2); }

const REL = 1e-9, ABS = 1e-6;
function close(a, b) {
  if (a === null && b === null) return true;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;
  if (typeof a === 'boolean' || typeof b === 'boolean') return !!a === !!b;
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  if (a === b) return true;
  return Math.abs(a - b) <= Math.max(ABS, REL * Math.max(Math.abs(a), Math.abs(b)));
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

(async () => {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const cap = await harness.captureAll(APP, chromium);

  let scenariosPass = 0, scenariosFail = 0, notExecutable = 0;
  let verifiedChecked = 0, reviewChecked = 0;
  const failures = [];

  for (const [cid, exp] of Object.entries(baseline.cases)) {
    if (exp.status === 'NOT EXECUTABLE') {
      notExecutable++;
      if (VERBOSE) console.log('  SKIP  ' + cid + '  ' + exp.name + '  (not executable: ' + exp.reason.slice(0, 80) + '…)');
      continue;
    }
    const act = cap.cases[cid];
    const problems = [];
    if (!act) { problems.push('case missing from the run'); }
    else {
      // scenario set identity
      const expKeys = exp.scenarios.map(s => s.scenarioKey);
      const actKeys = act.scenarios.map(s => s.id + '@' + s.dp);
      if (!same(expKeys, actKeys)) problems.push('scenario set changed: expected [' + expKeys + '] got [' + actKeys + ']');
      else {
        exp.scenarios.forEach((es, i) => {
          const as = act.scenarios[i];
          for (const [field, status] of Object.entries(es.status)) {
            const want = es.expected[field], got = as[field];
            if (status === 'EXPECTED VALUE VERIFIED') verifiedChecked++; else reviewChecked++;
            if (!close(want, got)) {
              problems.push('[' + status + '] ' + es.scenarioKey + '.' + field +
                            ' expected ' + JSON.stringify(want) + ' got ' + JSON.stringify(got));
            }
          }
        });
      }
      // frozen non-numeric blocks (prose, selection, eliminations, rendered output)
      for (const [blk, rec] of Object.entries(exp.review || {})) {
        reviewChecked++;
        if (!same(rec.captured, act[blk])) problems.push('[REVIEW] ' + blk + ' changed vs the frozen baseline');
      }
      // unit + DOM state
      if (!same(exp.unitState, act.unitState)) problems.push('unitState changed: ' + JSON.stringify(act.unitState));
      if (!same(exp.domValues, act.domValues)) problems.push('DOM values changed: expected ' +
        JSON.stringify(exp.domValues) + ' got ' + JSON.stringify(act.domValues));
    }

    if (problems.length) {
      scenariosFail++;
      failures.push({ id: cid, name: exp.name, problems });
      console.log('  FAIL  ' + cid + '  ' + exp.name);
      problems.slice(0, 12).forEach(p => console.log('          ' + p));
      if (problems.length > 12) console.log('          … and ' + (problems.length - 12) + ' more');
    } else {
      scenariosPass++;
      if (VERBOSE) console.log('  PASS  ' + cid + '  ' + exp.name);
    }
  }

  const parents = new Set(Object.values(baseline.cases).map(c => c.parent || c.id.split(/[a-z]$/)[0]));
  console.log('\n=========================================================');
  console.log('  BSE PERMANENT NUMERICAL REGRESSION');
  console.log('  app under test:        ' + path.basename(APP));
  console.log('  audit scenarios:       ' + baseline.summary.audit_scenarios_total + ' (R-1…R-47)');
  console.log('  executable cases:      ' + (scenariosPass + scenariosFail));
  console.log('  passing:               ' + scenariosPass);
  console.log('  failing:               ' + scenariosFail);
  console.log('  not executable:        ' + notExecutable);
  console.log('  VERIFIED fields checked: ' + verifiedChecked);
  console.log('  REVIEW fields checked:   ' + reviewChecked);
  if (cap.pageErrors.length) console.log('  PAGE ERRORS: ' + cap.pageErrors.join(' | '));
  console.log('=========================================================');
  process.exit(scenariosFail || cap.pageErrors.length ? 1 : 0);
})();
