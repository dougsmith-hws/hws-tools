<!--
BUYER STRATEGY ENGINE — PHASE 3, GATE D REPORT
File: docs/BSE-Phase3-GateD-Report.md
Status: PARTIALLY READY. Code and configuration complete and verified locally.
        Preview verification BLOCKED — no route to Netlify from this session.
        Production verification NOT PERFORMED. Nothing deployed. Not merged.
Origin: Cowork session of 2026-07-29.
-->

# BUYER STRATEGY ENGINE — PHASE 3, GATE D
## Production Deployment Readiness — Report

**HomeWealth Solutions LLC** · Company NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082
Prepared for: Doug Smith, President & Broker, CMA®
Date: **July 29, 2026**

> ## GATE D STATUS: PARTIALLY READY
>
> **500 automated assertions, 0 failures.** The engine remains byte-identical to
> the pre-Phase-3 baseline `540ccbe`.
>
> **Two defects were found and fixed** — a responsive defect that made the buyer
> name field unreachable on any phone (§18), and a **public information-disclosure
> exposure that merging this branch would have created** (§12.1). The second is
> the most important finding in this gate and is not an application defect at all.
>
> **Preview verification is BLOCKED.** `api.netlify.com` is unreachable from this
> sandbox, no Netlify connector is available, and I have no push credentials —
> and will not ask for any. Creating the preview is an action only you can take.
> §21 is the exact procedure.
>
> **Production verification NOT PERFORMED. Nothing was deployed. `main` remains
> `540ccbe`, not merged, not modified.**
>
> **I do not recommend authorizing production yet.** §25 explains what I would
> want to see first, and none of it is large.

---

## 1–7. Baseline verification

Every item in the authorization's §7 was verified **before** any file was touched.

| Check | Expected | Found |
|---|---|---|
| Git status | clean | **clean** |
| Branch | `phase3/gate-c-supabase-persistence` | **matched** |
| HEAD | `662c87f` | **matched** |
| `main` | `540ccbe` | **matched** |
| Application MD5 | `4dec9aada934ee5bdb8fba83dc80d11b` | **matched**, git object and working tree identical |
| Automated suite | 453 / 0 | **453 assertions, 0 failures** |
| Protected engine | unchanged | **`96e6bea541a19e1ac3ec3f82cd45525c`** |
| Schema / RLS | unchanged since Gate C | **`supabase/migrations/` last modified at `d7dbbcf`** |
| Secrets | none committed | **clean** |
| Protected files | unchanged | `property-tax.html` `1cd00523…`, Comfort Calculator `772de6d1…`, Staging BSE `01830ac6…` |

Nothing disagreed with the authorization. Branch `phase3/gate-d-deployment-readiness`
created from `662c87f`.

## 8. Production URL — recommendation

**`https://tools.homewealthsolutions.com/internal/buyer-strategy/`**

This is not an invention; it is the existing convention. The repository root *is*
the Netlify publish directory — verified live: `TOOL-MANIFEST.md`, a plain
Markdown file at the repo root, is served at
`https://tools.homewealthsolutions.com/TOOL-MANIFEST.md`. Every tool is therefore
reachable at its repository path, and `internal/` already holds ten internal
tools deployed exactly this way.

The BSE needs **no redirect, no rewrite and no routing change** — it will be
served at that path the moment the branch reaches `main`.

**No navigation link is added.** The tool is reachable by URL and is not listed
anywhere. Authentication and RLS are the security controls, as specified; the
absence of a link is convenience, not security, and is not treated as such.

## 9. Supabase Auth — production configuration required

**These are dashboard changes only you can make. Nothing here is done yet.**

Supabase dashboard → **Authentication → URL Configuration**:

**Site URL** — set to:
```
https://tools.homewealthsolutions.com
```
Site URL is the fallback Supabase uses when a magic link carries no valid
redirect. It should be the production origin, so a stray link lands on the real
site rather than on a developer laptop.

**Redirect URLs** — the list should end up containing exactly these four:
```
http://localhost:8080/**
https://tools.homewealthsolutions.com/internal/buyer-strategy/**
https://tools.homewealthsolutions.com/**
https://<branch>--<your-netlify-site>.netlify.app/**
```

| Entry | Why |
|---|---|
| `http://localhost:8080/**` | **Retain.** Every regression cycle runs here. Removing it ends local testing, and it cannot be used by anyone who is not already on your machine. Remove it only when local testing stops, which is not now. |
| `…/internal/buyer-strategy/**` | The actual production callback. The client sends `window.location.origin + window.location.pathname`, so the link returns to the exact page. |
| `https://tools.homewealthsolutions.com/**` | Covers the Site URL fallback and any future path move. Optional but harmless. |
| `https://<branch>--<site>.netlify.app/**` | Needed **only** for §21 preview validation. Fill in the real hostname once the preview exists, and remove it after Gate D closes. |

**Do not add**, and I have not asked for: the service-role key, the Supabase
secret key, or the database password. None exists anywhere in this repository or
in this session. The browser carries only the project URL and the publishable
key, both public. **RLS remains the authorization boundary.**

## 10. Public client configuration

**Decision: keep the values directly in the client. Do not introduce a build
step.**

They are intentionally public. A build system that injects them would add a
toolchain, a CI dependency and a new class of deploy failure in exchange for
hiding nothing — the values are readable in the shipped bundle either way. The
authorization says as much, and I agree with it.

What was missing was not secrecy but **correctness checking**. Gate C §57c cost a
full test cycle because a project URL was one character short and the only
symptom was a browser-level `Failed to fetch`. Gate D adds validation that runs
before any network call:

```js
function bseValidateConfig(cfg){
  const problems = [];
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(cfg.url || '');
  if(!m) problems.push('Project URL should look like https://<ref>.supabase.co');
  else if(m[1].length !== 20) problems.push('Project ref is ' + m[1].length +
        ' characters; a Supabase project ref is exactly 20');
  …
  if(/^sb_secret_|service_role/.test(k))
    problems.push('SECRET KEY DETECTED — this must never appear in browser code');
  return problems;
}
```

A misconfigured deploy now shows **Configuration error** with the fault named,
instead of looking like a network problem. The 19-character URL from §57c is
caught by name — asserted in P13a. A secret key pasted where the publishable key
belongs is detected and called out explicitly.

**Repository secret scan after all changes: clean.** Three files match the
pattern `sb_secret|service_role`; all three were inspected and every match is
*detection logic* — my validator, and Supabase's own key-prefix check inside the
vendored library. No credential value appears anywhere.

## 11. Supabase client dependency — vendored

**Decision: vendor the prebuilt UMD bundle. No npm, no bundler, no build step.**

Gate C loaded the client from `https://esm.sh/@supabase/supabase-js@2` at runtime.
Two problems: a CDN outage would leave the production tool unable to save, and an
internal tool holding client financial data was executing third-party script
fetched fresh on every load.

The npm package **ships a prebuilt, self-contained UMD bundle**, so vendoring
needs no build infrastructure at all — the authorization's preferred outcome.

| | |
|---|---|
| Package | `@supabase/supabase-js` |
| Version | **2.111.0** — pinned, and the version is in the filename |
| File | `internal/buyer-strategy/vendor/supabase-js-2.111.0.umd.js` |
| Size | 210,547 bytes |
| SHA-256 | `7396012594aa6d23bb373ebc25d1080bf3672fa847c3713f756520b40fd13453` |
| SHA-384 (SRI) | `sha384-faMlYZUtkJj+Sh6Bmu/L0GzPcraRWN6CW+9RH3GUrK/Z0WS9tgaNNt0tHiLxsbdb` |
| Licence | MIT, retained verbatim at `vendor/LICENSE-supabase-js-2.111.0.txt` |

Verified in a real browser before adoption: `createClient`, `auth.signInWithOtp`,
`auth.onAuthStateChange` and `from` are all present and functional. Loaded via a
same-origin `<script>` resolved relative to `document.baseURI`, so it works at
any deployment path.

**This changed a documented behaviour, and the change is an improvement.** Under
Gate C, no network meant no library, so the tool booted into `no-save` and read
*Not connected*. The library is now local, so it always loads: the tool boots
with a real transport and honestly reports *Sign in to save*. `no-save` is now
reserved for a **missing or corrupt vendored file**, which P13i covers. The M-10
promise is unchanged and still asserted — no account, no network, and the
calculator still works.

Five test premises across P1, P5, P7 and P10 encoded the old behaviour and were
corrected. **They were stale premises, not defects**, and each correction is
recorded in the test file next to the assertion.

## 12. Security headers

### 12.1 — The finding that matters most in this gate

**The repository root is the public web root.** Verified live, not assumed:
`https://tools.homewealthsolutions.com/TOOL-MANIFEST.md` returns the raw file.

Merging this branch to `main` would therefore have published, to the open web:

| Path | Content |
|---|---|
| `/docs/BSE-Phase0-1-Forensic-Audit.md` | The complete forensic audit of your tools |
| `/docs/BSE-Phase2-Architecture.md` | The full data model |
| `/docs/BSE-Phase3-GateC-Report.md` | Every defect found, in detail |
| `/supabase/migrations/0001_bse_schema.sql` | The schema **and the exact text of every RLS policy** |
| `/internal/buyer-strategy/tests/*` | The entire test suite and baselines |

**No credentials — the scan is clean.** But publishing the exact text of your
authorization boundary tells anyone who reads it precisely where to probe, and
the audit documents describe the tool's internals in depth. There is no reason
for any of it to be on the public web, and this would have shipped silently the
first time the branch was merged.

Three `[[redirects]]` now return **404** for `/docs/*`, `/supabase/*` and
`/internal/buyer-strategy/tests/*`. 404 rather than 403 deliberately — a 403
confirms the path exists.

**These rules cannot affect any existing tool:** none of those three paths exists
in `main` today, verified with `git cat-file` against `main`.

### 12.2 — Headers, scoped to the BSE

The site currently sends **no security headers at all**. A site-wide policy would
change behaviour for every tool at once and is out of scope, so the headers are
scoped to `/internal/buyer-strategy/*`, which no other tool touches.

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://oxvtuvoguulphgycgixg.supabase.co wss://oxvtuvoguulphgycgixg.supabase.co; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cache-Control` | `no-store, max-age=0` |

`connect-src` names the real Supabase endpoints the tool uses — REST and Auth
over HTTPS, Realtime over WSS. **The CSP was not weakened to make anything work.**

**One honest concession, recorded rather than hidden:** `script-src` requires
`'unsafe-inline'` because the BSE is a single self-contained HTML file with an
inline `<script>`. That is the existing architecture, not a Gate D choice.
Removing it would mean extracting ~4,000 lines of application script to an
external file — a real change to the application's shape, well outside this
gate. It is listed in §23 as a deferred item.

`Cache-Control: no-store` on the application: a tool that renders client
financial data should not sit in a shared browser cache. The vendored library is
immutable and version-pinned, so it gets `max-age=31536000, immutable`.

### 12.3 — HSTS — RESOLVED at Gate D.1

**Final: `Strict-Transport-Security: max-age=31536000` — host-only. No
`includeSubDomains`, no `preload`. No change to what Gate D already shipped.**

Investigated by DNS inspection of the live deployment:

```
tools.homewealthsolutions.com  ->  CNAME hws-tools.netlify.app
                                   2600:1f18:16e:df01::258 / ::259
```

| Probe | Result |
|---|---|
| Wildcard `*.tools.homewealthsolutions.com` (two random labels) | **no record** — no wildcard |
| 12 plausible subdomains (`www api app dev staging test admin preview beta docs cdn assets`) | **no record** for any |
| `homewealthsolutions.com`, `www.homewealthsolutions.com` | resolve — but these are the **parent and a sibling**, which an HSTS header on `tools.` cannot affect in either direction |

The evidence points toward `includeSubDomains` being harmless: nothing appears to
live under `*.tools.homewealthsolutions.com`, and Netlify branch previews live on
`*.netlify.app`, which is a different registrable domain entirely.

**It is still not set, and that is deliberate.** Twelve negative DNS guesses and
no wildcard is inductive evidence, not positive proof — a subdomain I did not
guess would not have shown up. The authorization is explicit that
`includeSubDomains` goes in only if safety can be *positively established*, and
that uncertainty resolves toward the narrow policy.

The trade is also lopsided. With no subdomains to protect, the benefit is
approximately zero; the cost of being wrong is an HTTP-only subdomain that stops
loading, with a one-year browser-cached memory of the mistake. `preload` is worse
still: it requires `includeSubDomains`, is submitted to a list baked into browser
binaries, and is removed on a timescale of months.

Host-only HSTS on a site that already 301s HTTP→HTTPS captures essentially all of
the real security benefit at none of that risk.

### 12.4 — Pre-existing observation, deliberately not changed

`node_modules/` is tracked in `main` and therefore publicly served today at
`/node_modules/*`. It contains only `@netlify/blobs`, a public package, and no
secret. This predates Gate D and is not something Gate D introduced. Blocking it
would be a one-line addition, but it sits next to the existing Netlify Functions
and is outside this authorization. **Reported, not changed.** Recommended for a
follow-up.

## 13. Session expiry mid-edit

The deferred Gate C item, and the largest code change in Gate D.

**What was wrong.** When a token refresh failed, Supabase signed the user out.
The authored workspace stayed on screen — good — but the record binding was
destroyed with the session. The next save minted fresh ids and **forked the
buyer**, which is §57e wearing a different hat. Worse: the previous user's
unsaved financial data was still in the workspace, so a *different* officer
signing in on the same machine could have saved User A's numbers under their own
account.

**The fix — two mechanisms, both small.**

`parkedCtx` holds the binding across the gap and is handed back **only** to the
same user id that owned it.

`workspaceOwner` is the harder guard: it records whose financial data is on
screen right now, and `saveNow()` refuses outright if the signed-in user is not
that person. Two officers sharing a laptop cannot file one buyer's numbers under
the other's account, by any sequence of sign-ins.

**Behaviour against every requirement in the authorization:**

| Requirement | Behaviour | Test |
|---|---|---|
| Never silently discard authored state | Nothing is cleared. Price, income, every input and the recommendation stay on screen | P13d |
| Never falsely display Saved | Chip reads **Session expired — sign in to save your changes** | P13d |
| Never create a new buyer because identity disappeared | Binding parked; no write occurs; row count unchanged | P13d |
| Clearly tell the LO authentication is required | Distinct red state with the tooltip "Your work is still on screen and has NOT been lost." | P13d |
| Preserve the workspace long enough to reauthenticate | Indefinitely — nothing is torn down but presentation | P13d |
| Same user reauthenticates → rebind and save safely | Same buyer rebinds, pending edit saves to the same record, no fork | P13e |
| **Different user must never inherit A's data** | Parked binding discarded; save **refused**; autosave cannot sneak it through; nothing written under B | P13f |

## 14. Network failure

Automated: P13g takes an authenticated saved buyer offline, edits, lets autosave
run, and asserts the chip reads **Offline — changes not saved** and never
*Saved*; the authored state stays visible; the save succeeds on reconnection; and
recovery updates **the same record** with no duplicate.

**A real-browser run is still required** and is step 6 of the checklist in §24.

## 15. Offline cold start

Opening the tool with no network: the vendored library loads from our own origin,
so the tool comes up with a transport and reads **Sign in to save**. The
calculator works fully. It never claims *Saved* and never claims a connected
account. If the vendored file itself is missing or corrupt, the loader raises a
named error and the calculator still runs (P13i).

## 16. Saved-buyer data safety — re-verified

| Property | Status |
|---|---|
| `listBuyers()` owner-scoped | RLS-enforced; no client-side filtering, deliberately |
| `load(id)` owner-scoped | P11g, P12d |
| Save/update owner-scoped | P2 — owner always taken from the session, never from the page |
| Autosave cannot create cross-user records | **P13f** — new in Gate D |
| Sign-out clears presentation, not data | P9, and manual test 9 at Gate C |
| Account switching cannot expose prior names | P11g, P12d |
| `TOKEN_REFRESHED` preserves same-user binding | P12a–c |
| Different user does not inherit active context | **P13f** — strengthened in Gate D |

**RLS was not weakened.** The schema and policies are untouched: `supabase/migrations/`
last modified at `d7dbbcf`, before Gate C.5 even began. **No migration was
created or required.**

## 17. Production error handling

Errors are now classified rather than collapsed into one message:

| Condition | Chip |
|---|---|
| Malformed configuration | **Configuration error** — with the fault named |
| Library missing | **Not connected** |
| Not signed in | **Sign in to save** |
| Session expired mid-edit | **Session expired — sign in to save your changes** |
| Offline / network unreachable | **Offline — changes not saved** |
| Sign-in failed | **Sign-in failed — <reason>** |
| Wrong account for this workspace | **Different account — reload to start fresh** |
| Anything else | **Save failed — <reason>** |

Classification is deliberately conservative: 401/403 and JWT-expiry language map
to auth loss, fetch/network language maps to offline, and **anything not clearly
one of those stays a plain save failure carrying its real message** (P13c). No
message exposes implementation detail or any credential.

## 18. Responsive readiness — one blocking defect found and fixed

Measured at six widths, signed out and signed in.

**Signed out:** clean everywhere — no horizontal overflow at any width.

**Signed in — blocking defect.** The bar grew to 577px. In a 375px viewport it
sat at `left: -210px` and pushed the **Buyer name field entirely off screen**. On
a phone an officer could not name or rename a buyer at all. Q-6 is locked at
**full phone editing**, so this is deployment-blocking.

**Fix: CSS only** — `flex-wrap`, a viewport-relative max width, and a ≤700px rule
that pins the bar to both edges and lets the controls flow. No layout
restructuring, no logic change, nothing outside this bar.

| Width | Before | After |
|---|---|---|
| 375 × 667 | 577px at left −210 · **name field off screen** | 359px at left 8 · all controls reachable |
| 430 × 932 | 577px at left −155 · **name field off screen** | 414px at left 8 · all controls reachable |
| 768 × 1024 | fits | fits |
| 1440 × 900 | fits | fits |

Pinned by 12 assertions (P14). No horizontal page scroll at any width.

**Non-blocking, deferred:** sign-in and Save buttons are 26–40px tall against a
44px accessibility guideline; the fixed bar overlays the top-right of the page on
narrow screens; there is no phone-specific layout for the results panels. None
prevents editing, authentication, saving, loading or signing out.

## 19. Data-governance recheck

The Phase 0 prohibition holds. **No storage was added for anything on the
prohibited list** — no SSN, DOB, government ID, account or routing numbers, card
numbers, passwords, credit reports, paystubs, W-2s, tax returns, bank statements,
or uploaded documents of any kind. Gate D added no new persisted field at all.

Reviewed specifically for accidental leakage:

- **No `console.log`/`debug`/`info`/`warn` anywhere in the persistence layer.**
- **No borrower data in URLs** — no `location.search`, no `history.pushState`, no
  `URLSearchParams`. The magic-link callback carries only Supabase's own tokens.
- No analytics and no error-reporting service is present or added.
- The only new client-held values are a buyer *display name* the officer types
  and record UUIDs.

## 20. Testing

**500 assertions, 0 failures**, against the final Gate D application.

| # | Suite | Result |
|---|---|---|
| 1 | Permanent numerical regression (47 audit scenarios) | **68 / 68** |
| 2 | Gate A — M-1 canonical units | **80 / 80** |
| 3 | Gate B — canonical application state | **22 / 22** |
| 4 | Gate B.5 — C-4b presentation integrity | **64 / 64** |
| 5 | Gate B.5 — model authority | **12 / 12** |
| 6 | Gate B.75 — persistence contract | **40 / 40** |
| 7 | Cross-tool R-47 | **4 / 4** |
| 8 | Client orchestration (Gate C/C.5/C.5a/**D**) | **136 / 136** |
| 9 | Schema and RLS on PostgreSQL 16.13 | **74 / 74** |

**No numerical regression.** Not one frozen expected mortgage result was
touched. The engine hashes identically to `540ccbe`.

New in Gate D: **P13** (config validation, vendored dependency, session expiry
mid-edit, offline honesty, error classification) and **P14** (responsive).

**Two test premises of mine were wrong and were corrected, not worked around.**
Both asserted that a *recommendation existed* after an edit, when at $488,000 and
$523,500 on $9,500 income eliminating every program is the correct engine
behaviour. They now assert the engine **runs** and returns a summary. I made this
same mistake at Gate C.5a; it is recorded here so the pattern is visible.

## 20.1 Gate D.1 — baseline re-verification

Re-run at the start of Gate D.1, before anything was touched:

| Check | Result |
|---|---|
| Branch | `phase3/gate-d-deployment-readiness` |
| HEAD | `ccab37c` |
| `main` | `540ccbe` |
| Working tree | clean |
| Application MD5 | `99a82a680e74953782aa9c2ce1802fc4` — git object and working tree identical |
| Automated suite | **500 assertions, 0 failures** |
| Protected engine | `96e6bea541a19e1ac3ec3f82cd45525c` — byte-identical to `540ccbe` |
| Secret scan | **clean** — the single pattern match is the literal fixture `sb_secret_abcdefghijklmnopqrstuvwxyz` inside the test that asserts secret keys are *rejected* |

## 21. Preview validation — BLOCKED

**I cannot create a preview deployment, and I did not try to work around it.**

| Route | Status |
|---|---|
| `api.netlify.com` from this sandbox | **unreachable** (HTTP 000) |
| Netlify MCP connector | **not available** |
| `device_bash` network | **none** |
| Push credentials for `github.com/dougsmith-hws/hws-tools` | **none, and I will not ask for any** |
| `git ls-remote` from the device (re-tested at Gate D.1) | **`403 from proxy after CONNECT`** — the device bridge has no network by design |

**Netlify site identified at Gate D.1 without any Netlify access:**
`tools.homewealthsolutions.com` is a CNAME to **`hws-tools.netlify.app`**, and
that hostname serves the identical site (verified by fetching `TOOL-MANIFEST.md`
from both). The site name is therefore **`hws-tools`**, which fixes the expected
branch-deploy hostname:

```
https://phase3-gate-d-deployment-readiness--hws-tools.netlify.app
```

Netlify slugifies the branch name for the subdomain (`/` → `-`), giving a
34-character label, inside Netlify's 37-character limit — so no truncation is
expected. This is a prediction from the naming rule, not an observation, and must
be confirmed against the real deploy.

**This is a §26 stop condition and I am reporting it rather than routing around
it.** Creating the preview is an action only you can take.

**How to create it safely.** Pushing a non-production branch does **not** deploy
to production — Netlify only production-deploys from the production branch, which
is `main`:

```bash
cd ~/Tools/Live
git push -u origin phase3/gate-d-deployment-readiness
```

Then in Netlify → **Site configuration → Build & deploy → Branch deploys**,
confirm branch deploys are enabled. The preview appears at:

```
https://phase3-gate-d-deployment-readiness--<your-site-name>.netlify.app
```

Send me that URL and I will give you the exact validation sequence. **Before
signing in on it**, add its `/**` to the Supabase redirect list (§9) — magic
links will not return without it.

**If enabling branch deploys would change any production setting, stop and tell
me instead.** A preview does not authorize production.

## 22. Files changed

| File | Change |
|---|---|
| `internal/buyer-strategy/index.html` | Modified — §10 validation, §11 vendored loader, §13 session-expiry handling, §17 classification, §18 responsive CSS |
| `internal/buyer-strategy/vendor/supabase-js-2.111.0.umd.js` | **Added** — pinned, hashed, licence retained |
| `internal/buyer-strategy/vendor/LICENSE-supabase-js-2.111.0.txt` | **Added** — MIT, verbatim |
| `netlify.toml` | Modified — **additive only**; three 404 rules for paths absent from `main`, BSE-scoped headers, site-wide HSTS |
| `internal/buyer-strategy/tests/persistence-client.test.js` | +47 assertions (P13, P14); five stale premises corrected |
| `supabase/patch_gated.py` | **Added** — the guarded Gate D transform |
| `docs/BSE-Phase3-GateD-Report.md` | **Added** — this document |
| `docs/BSE-Project-Status.md` | Updated |

**Not touched:** every migration, every RLS policy, the Comfort Calculator,
`property-tax.html`, the Staging BSE, and every frozen expected result.

## 23. Known limitations and deferred items

1. **`'unsafe-inline'` in `script-src`** — required by the single-file
   architecture. Removing it means extracting the application script to an
   external file, which is a real structural change and not a Gate D decision.
2. **HSTS `includeSubDomains` and `preload` not set** — §12.3. Your call.
3. **`/node_modules/*` is publicly served today** — pre-existing, no secret,
   deliberately not changed (§12.4).
4. **No `404.html` exists.** The three blocking rules return HTTP 404 and Netlify
   serves its default body. Verifying that is checklist step 3. I did not add a
   site-wide `404.html`, because Netlify would then use it for **every** 404
   across every tool — a global behaviour change outside this gate.
5. **Preview and production verification not performed** — §21.
6. **Tap targets below 44px** and no phone-specific results layout — §18,
   non-blocking.
7. **Session expiry is proven by simulation, not by waiting out a real token.**
   The auth-change path is exercised exactly as Supabase drives it, but a genuine
   multi-hour expiry has not been observed.
8. Carried forward: `num()` coercion (M-4), floating `%` concession base (M-13),
   PMI band `c` unreachable, 1,157 review-only baseline fields, R-13d not
   executable, FL tax **not** integrated, Comfort Calculator **not** retired.

## 24. Production deployment checklist

Executable by someone who did not write the code. **Do not start until §21
preview validation has passed.**

### Facts

| | |
|---|---|
| Final URL | `https://tools.homewealthsolutions.com/internal/buyer-strategy/` |
| Netlify site | the site serving `tools.homewealthsolutions.com`, deployed from `github.com/dougsmith-hws/hws-tools` |
| Production branch | `main` — **merging to `main` IS deploying** |
| Branch to deploy | `phase3/gate-d-deployment-readiness` |
| Commit | recorded in §26 below |
| Known-good rollback commit | **`540ccbe`** |

### Before

1. ☐ Supabase → Authentication → URL Configuration → **Site URL** = `https://tools.homewealthsolutions.com`
2. ☐ Supabase → **Redirect URLs** include `https://tools.homewealthsolutions.com/internal/buyer-strategy/**`; `http://localhost:8080/**` **retained**
3. ☐ Preview: `https://<preview>/docs/BSE-Phase2-Architecture.md` returns **404**; same for `/supabase/migrations/0001_bse_schema.sql` and `/internal/buyer-strategy/tests/README.md`
4. ☐ Preview: response headers on the BSE include `Content-Security-Policy` and `X-Frame-Options: DENY`
5. ☐ Preview: sign in by magic link → chip reads **Not saved**
6. ☐ Preview: save a buyer → **Saved**; four linked rows in Supabase; `resolved_inputs` NULL
7. ☐ Preview: edit → **Unsaved changes** → **Saved**; still exactly one row per table
8. ☐ Preview: reload, open the saved buyer → inputs restore, calculations recompute
9. ☐ Preview: wi-fi off, edit → **Offline — changes not saved**, numbers still on screen; wi-fi on, Save → **Saved**, no duplicate
10. ☐ Preview: sign in as a second account → saved-buyer list empty
11. ☐ Preview on a **phone** → buyer name field reachable, save and sign-out usable
12. ☐ Automated suite green on the deploy commit — **500 / 0**
13. ☐ Secret scan clean
14. ☐ Working tree clean; note the exact commit hash

### Deploy

15. ☐ **You authorize the merge in writing**
16. ☐ `git checkout main && git merge --no-ff phase3/gate-d-deployment-readiness`
17. ☐ `git push origin main` — this is the deploy
18. ☐ Watch the Netlify deploy to "Published"

### After — smoke test, within 10 minutes

19. ☐ `https://tools.homewealthsolutions.com/internal/buyer-strategy/` loads
20. ☐ Chip reads **Sign in to save** (not *Configuration error*, not *Not connected*)
21. ☐ `/docs/BSE-Phase2-Architecture.md` → **404**
22. ☐ `/supabase/migrations/0001_bse_schema.sql` → **404**
23. ☐ Magic-link sign-in works **from production**
24. ☐ Save a throwaway buyer → four rows; delete it afterwards
25. ☐ Load it back → inputs restore, calculations recompute
26. ☐ Sign out → buyer list and name clear
27. ☐ **Spot-check one calculation against a known-good result from Gate B**
28. ☐ Confirm the other tools still work: `/property-tax.html`, `/buyer/comfort-calculator.html`, `/buyer/strategy-builder.html`, and a `/r/<id>` short link
29. ☐ Confirm the Netlify Functions still respond
30. ☐ Record the production commit and time in this document

## 25. Rollback plan

**Known-good commit: `540ccbe`** — the pre-Phase-3 state currently in production.

**Application rollback — the fast path.** Netlify → **Deploys** → select the last
good deploy → **Publish deploy**. This restores the previous site in seconds
without touching git, and is the correct first move if production is broken.

Then reconcile git so the next push does not re-deploy the failure:

```bash
git checkout main
git revert --no-ff -m 1 <merge-commit>
git push origin main
```

Use `git revert`, **not** `reset --hard`. History is shared with GitHub and
Netlify; rewriting it is how a bad deploy becomes two bad deploys.

**Database rollback is NOT required, and this distinction matters.**

- **Gate D created no migration and changed no schema or policy.** The database
  in production is exactly what Gate C put there.
- Rolling the application back to `540ccbe` yields a BSE with **no persistence
  at all** — it neither reads nor writes Supabase. Rows already saved are simply
  untouched. Nothing is orphaned, nothing is corrupted, and nothing needs undoing.
- **Never roll the database back to "match" an application rollback.** The
  application is disposable; buyer records are not. If a data problem ever
  appears, stop and diagnose it against the live data rather than reverting the
  schema.

**How to tell which you are looking at.** An application problem shows as a page
that fails to load, a chip stuck in an error state, or a calculation that differs
from Gate B's frozen results — fix by republishing the previous deploy. A
database problem shows as rows that are missing, duplicated, or visible to the
wrong account — **do not rollback; capture the evidence and stop**, exactly as we
did with the four-row investigation at Gate C.

## 26. Git

Branch **`phase3/gate-d-deployment-readiness`**, created from `662c87f`.

Commits are recorded in the closing section of this report. `main` remains
**`540ccbe`** — not merged, not modified.

---

## GATE D COMPLIANCE STATEMENT

- The full §7 baseline was verified before any file was modified, and the Gate D
  patch script **refuses to run** against any input other than the closed Gate
  C.5a hash.
- **No calculation, qualification, recommendation, scoring, DTI, PMI, buydown,
  concession, loan-program, tax or assumption-set constant was modified.** The
  engine region is byte-identical to `540ccbe`.
- **No FL property-tax work of any kind.** No millage, homestead or portability
  logic. `property-tax.html` untouched.
- **The Comfort Calculator was not retired, redirected, removed or modified.**
- **No schema migration was created, and none was required.** RLS was not
  weakened.
- **No secret credential appears in browser code, the repository, or this
  document.** The scan is clean; every pattern match is detection logic.
- **Nothing was deployed.** No production change, no DNS change, no preview.
- **`main` was not merged or modified.**
- Two defects were found and fixed — one responsive, one an information-disclosure
  exposure that merging would have created. Both are pinned or configured, not
  merely noted.
- The preview blocker was **reported rather than worked around**, per §26 of the
  authorization.

---

*Prepared for Doug Smith, President & Broker, CMA® · HomeWealth Solutions LLC · NMLS #2742458 · FL OFR Mortgage Broker License #MBR8082 · doug@homewealthsolutions.com · 813-733-7371*
