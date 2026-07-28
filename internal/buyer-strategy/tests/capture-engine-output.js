/* =====================================================================
   BSE Gate B — scenario capture
   Runs every scenario in tests/scenarios/bse-regression-scenarios.json
   against an application file and writes the raw output to JSON.

   This script CAPTURES. It does not decide what is correct — expected
   values are produced independently by tests/oracle/reference_model.py
   via tests/build-expected-baseline.py.

   Usage: node tests/capture-engine-output.js <app.html> <out.json>
   ===================================================================== */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const harness = require('./lib/app-harness');

(async () => {
  const app = path.resolve(process.argv[2]);
  const out = path.resolve(process.argv[3]);
  const res = await harness.captureAll(app, chromium);
  fs.writeFileSync(out, JSON.stringify({ app: path.basename(app), cases: res.cases, pageErrors: res.pageErrors }, null, 1));
  console.log('captured ' + Object.keys(res.cases).length + ' cases -> ' + out);
  if (res.pageErrors.length) console.log('PAGE ERRORS: ' + res.pageErrors.join(' | '));
})();
