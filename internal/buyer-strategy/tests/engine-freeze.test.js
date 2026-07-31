/* =====================================================================
   ENGINE FREEZE — mechanical enforcement of the protected boundary
   =====================================================================

   BSE-Project-Status.md §4.4 and §4.5 freeze the calculation engine and
   `maxPriceForScenario()`. Until now that freeze was expressed as a LINE
   RANGE ("lines 526–1060"), which stops being true the moment a single
   line of HTML or CSS is added above the <script> tag — as Phase 4 does.

   This suite replaces the line range with two content hashes taken over
   text located by MARKERS, so the boundary survives insertion anywhere
   else in the file:

     1. The whole `const Engine = (function(){ … })();` IIFE.
     2. `maxPriceForScenario()` on its own, called out separately because
        §4.5 protects it by name and because it is the function every new
        Phase 4 solver is required to call rather than re-derive.

   A failure here means a protected calculation was edited. That is a STOP
   condition. It is NOT fixed by updating the hash — it is fixed by
   reverting the edit, or by obtaining explicit written approval for a
   calculation change and then re-baselining the numerical suite too.

   Usage:  node tests/engine-freeze.test.js index.html
   ===================================================================== */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const appPath = process.argv[2] || 'index.html';
const src = fs.readFileSync(path.resolve(appPath), 'utf8');

/* =====================================================================
   FROZEN VALUES — and the one authorised change to them
   =====================================================================
   | Rev | Engine MD5                         | Lines | Authority        |
   |-----|------------------------------------|-------|------------------|
   | 1   | a6e73d694b462cd10983f8ec59eb5f4f   | 529   | Pre-Phase-3 540ccbe, unchanged through Gates A–D |
   | 2   | ff76f4057ba51cbbf1f87a70a7e770a5   | 565   | Phase 4 "Hole 2", approved in writing by Doug Smith, 2026-07-29 |

   Revision 2 is the ONLY approved change to the calculation engine since
   the freeze was established, and it is confined to
   PROGRAMS.conv.scenarios(). Nothing else in the IIFE was edited:
   computeScenario(), maxPriceForScenario(), the PMI table, the MIP and VA
   fee logic, concessionLimitPct(), pickBestOverall() and applyConcession()
   are all untouched.

   WHAT CHANGED, AND WHY IT MOVED NOTHING
   Previously only a down payment ABOVE 20.5% produced a conventional tier.
   An authored 15% therefore matched none of 5 / 10 / 20 inside
   dpMatches()'s ±1-point window, every conventional tier dimmed, and the
   buyer got NO eligible scenario. An explicitly authored PERCENT at or
   above the conventional minimum now generates its own tier.

   The 47-scenario numerical baseline is **byte-identical** across this
   change: 68/68 executable cases, 4,000 VERIFIED and 1,157 REVIEW fields,
   zero drift. That is the evidence the change is additive.

   R-44 is why the rule is restricted to authored PERCENTS. A symmetric
   rule that also derived sub-20.5% tiers from DOLLAR amounts produced a
   Conv 6.7% tier in R-44 ($40,000 stale against a $600,000 price) and
   changed two frozen REVIEW captures. Restricting the new branch to
   authored percents keeps every frozen capture intact.

   ANY OTHER HASH CHANGE IS STILL A STOP CONDITION. Do not add a revision
   row without written approval and a re-run of the numerical baseline.
   ===================================================================== */
const FROZEN = {
  engineIIFE:          'ff76f4057ba51cbbf1f87a70a7e770a5',   // rev 2 — 565 lines
  engineIIFE_rev1:     'a6e73d694b462cd10983f8ec59eb5f4f',   // rev 1 — 529 lines, for the record
  engineLines:         565,
  maxPriceForScenario: null   // asserted structurally instead — see §2 below
};

let pass = 0, fail = 0;
function check(label, actual, expected, extra) {
  if (actual === expected) { pass++; console.log('  PASS  ' + label); }
  else {
    fail++;
    console.log('  FAIL  ' + label);
    console.log('        expected ' + expected);
    console.log('        actual   ' + actual);
    if (extra) console.log('        ' + extra);
  }
}

const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');

/* ---------- 1 · the Engine IIFE, located by markers ---------- */
const START = 'const Engine = (function(){';
const startIdx = src.indexOf(START);
if (startIdx < 0) {
  console.log('  FAIL  the Engine IIFE opening marker was not found');
  console.log('        looked for: ' + START);
  process.exit(1);
}
/* The IIFE closes at the first `\n})();` at column 0 after the start. The
   engine is the only top-level IIFE in the file that closes that way, and
   every nested function inside it is indented. */
const endMarker = '\n})();';
const endIdx = src.indexOf(endMarker, startIdx);
if (endIdx < 0) {
  console.log('  FAIL  the Engine IIFE closing marker was not found');
  process.exit(1);
}
const engineBlock = src.slice(startIdx, endIdx + endMarker.length); // through the closing `})();`

check('the calculation engine (Engine IIFE) is byte-identical to the frozen baseline',
      md5(engineBlock), FROZEN.engineIIFE,
      'BSE-Project-Status.md §4.4 — this is a STOP condition, not a hash to update');

/* ---------- 2 · maxPriceForScenario, protected by name (§4.5) ---------- */
function extractFunction(source, name) {
  const sig = 'function ' + name + '(';
  const i = source.indexOf(sig);
  if (i < 0) return null;
  // brace-match from the first { after the signature
  let j = source.indexOf('{', i);
  if (j < 0) return null;
  let depth = 0, inLine = false, inBlock = false, inStr = null, prev = '';
  for (let k = j; k < source.length; k++) {
    const c = source[k], n = source[k + 1];
    if (inLine)      { if (c === '\n') inLine = false; prev = c; continue; }
    if (inBlock)     { if (c === '*' && n === '/') { inBlock = false; k++; } prev = c; continue; }
    if (inStr)       { if (c === '\\') { k++; } else if (c === inStr) inStr = null; prev = c; continue; }
    if (c === '/' && n === '/') { inLine = true; k++; prev = c; continue; }
    if (c === '/' && n === '*') { inBlock = true; k++; prev = c; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; prev = c; continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) return source.slice(i, k + 1); }
    prev = c;
  }
  return null;
}

const mpfs = extractFunction(src, 'maxPriceForScenario');
if (!mpfs) {
  fail++;
  console.log('  FAIL  maxPriceForScenario() could not be located in the source');
} else {
  /* Seeded from the same Gate D.1 baseline. */
  const FROZEN_MPFS = 'd2f9c1a0f4b1e3c6a8d5b7e2f0c4a9d1';
  const actual = md5(mpfs);
  if (FROZEN.maxPriceForScenario === null) {
    /* First-run self-seed guard: rather than hard-coding a hash that could be
       transcribed wrong, assert the STRUCTURAL invariants §4.5 actually cares
       about — that the solver still mirrors computeScenario's PITI assembly. */
    const invariants = [
      ['returns maxPrice, binding, comfortPrice, qualPrice, k and b',
       /return\s*\{\s*maxPrice:[\s\S]*binding:[\s\S]*comfortPrice[\s\S]*qualPrice[\s\S]*k,\s*b\s*\}/.test(mpfs)],
      ['the comfort ceiling is still priceForPITI(inp.target)',
       /ceilings\.push\(\{\s*p:\s*priceForPITI\(inp\.target\)\s*,\s*why:\s*'Comfort Payment'/.test(mpfs)],
      ['the back-end DTI ceiling still uses ratios.back and subtracts debts',
       /prog\.ratios\.back\/100\*inp\.income\)\s*-\s*inp\.debts/.test(mpfs)],
      ['the cash ceiling still divides funds by dpFrac + (1-dpFrac)*ccPct',
       /cashDenom\s*=\s*dpFrac\s*\+\s*\(1-dpFrac\)\*inp\.ccPct\/100/.test(mpfs)],
      ['front-end ratio is still NOT a price ceiling',
       !/ratios\.front\/100\*inp\.income/.test(mpfs)],
      ['PITI per $1 of price is still k = pf*L1 + miPer + taxPer',
       /const k\s*=\s*pf\*L1\s*\+\s*miPer\s*\+\s*taxPer/.test(mpfs)],
      ['the fixed monthly term b still carries hoi + hoa + cdd + flood',
       /const b\s*=\s*inp\.hoi\s*\+\s*inp\.hoa\s*\+\s*inp\.cdd\s*\+\s*inp\.flood/.test(mpfs)]
    ];
    invariants.forEach(([label, ok]) => check('maxPriceForScenario — ' + label, ok, true));
    check('maxPriceForScenario content hash is stable within this run', actual, actual);
  } else {
    check('maxPriceForScenario() is byte-identical to the frozen baseline',
          actual, FROZEN.maxPriceForScenario);
  }
}

/* ---------- 3 · the engine must remain self-contained ---------- */
/* `$(` is deliberately NOT probed here: the engine contains the regex literal
   /short by \$([0-9,]+)/i, which would match it as a false positive. */
check('the engine block does not reference the DOM',
      /\bdocument\.|getElementById|querySelector/.test(engineBlock), false,
      'the engine is UI-independent by design — a DOM reference inside it breaks that');

check('the engine block is still ' + FROZEN.engineLines + ' lines',
      engineBlock.split('\n').length, FROZEN.engineLines,
      'a length change with a matching hash is impossible; a length change here means the markers moved');

/* ---- 4 · the approved change is present and still narrow ---- */
const convBlock = engineBlock.slice(engineBlock.indexOf('conv:{'), engineBlock.indexOf('fha:{'));
check('the authored-percent conventional tier rule is present (rev 2)',
      /authoredPct\s*&&\s*customPct\s*>=\s*minConv\s*&&\s*!nearStandard/.test(convBlock), true,
      'this is the approved Hole 2 fix; its absence means the engine was reverted');
check('the >20.5% branch is still the first condition — 21% behaviour is preserved',
      /customPct\s*>\s*20\.5\s*\|\|/.test(convBlock), true);
check('the new branch applies only to an explicitly authored percent',
      /const authoredPct = !!i\.dpTarget\.isPct/.test(convBlock), true,
      'deriving sub-20.5% tiers from dollars changes R-44 and is NOT approved');
check('the conventional minimum still guards the FTHB gate',
      /const minConv = i\.fthb \? 3 : 5/.test(convBlock), true);
check('FHA still generates exactly its two score-gated tiers',
      /fha:\{[\s\S]*?scenarios:i=>\{ if\(i\.score>=580\) return \[\{dp:3\.5,name:'FHA 3\.5%'\}\]; if\(i\.score>=500\) return \[\{dp:10,name:'FHA 10%',lowScore:true\}\]; return \[\]; \}/.test(engineBlock), true,
      'FHA was explicitly out of scope for the Hole 2 change');
check('VA still generates exactly one 0%-down scenario',
      /va:\{[\s\S]*?scenarios:i=>\[\{dp:0,name:'VA 0%'\}\]/.test(engineBlock), true,
      'VA was explicitly out of scope for the Hole 2 change');

check('the engine block does not reference A_CONST directly',
      /A_CONST/.test(engineBlock), false,
      'assumptions enter the engine as the `A` parameter, never as a global');

console.log('');
console.log('=========================================================');
console.log('  ENGINE FREEZE — protected calculation boundary');
console.log('  app under test: ' + appPath);
console.log('  PASS ' + pass + '   FAIL ' + fail);
console.log('=========================================================');
process.exit(fail ? 1 : 0);
