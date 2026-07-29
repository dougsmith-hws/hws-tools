#!/usr/bin/env python3
"""BSE Phase 3 Gate D — production deployment readiness.

Applies to the closed Gate C.5a application. Four changes, all in the
persistence layer. Nothing in the Engine, gatherInputs, recalc, BSEModel or
BSEState is touched.

  §10  configuration validation — a malformed project URL or key fails with a
       message that names the problem, instead of an opaque "Failed to fetch"
  §11  the Supabase client is loaded from a vendored local file, not a CDN
  §13  session expiry mid-edit — the binding is parked, not destroyed, and a
       workspace can never be saved under a different account than authored it
  §17  save failures are classified — offline, auth-expired and genuine
       failures are distinguishable and say different things
"""
import sys, hashlib

PATH = sys.argv[1]
EXPECT_MD5 = "4dec9aada934ee5bdb8fba83dc80d11b"   # Gate C.5a closed state (b0524b5)

src = open(PATH, encoding="utf-8").read()
before = hashlib.md5(src.encode("utf-8")).hexdigest()
if before != EXPECT_MD5:
    sys.exit("REFUSING: source md5 %s != closed Gate C.5a baseline %s" % (before, EXPECT_MD5))

n = 0
def rep(a, b):
    global src, n
    if src.count(a) != 1:
        sys.exit("REFUSING: anchor matched %d times: %s" % (src.count(a), a[:70]))
    src = src.replace(a, b); n += 1

# ---------------------------------------------------------------- §11 + §10 --
rep("""  libraryUrl: 'https://esm.sh/@supabase/supabase-js@2'
});""",
"""  /* Gate D §11: vendored locally. The production tool must not become
     unusable because a third-party CDN is having a bad day, and an internal
     tool holding client financial data should not be executing script fetched
     from a third party on every load. Pinned, licence retained alongside,
     integrity recorded in docs/BSE-Phase3-GateD-Report.md §11. */
  libraryUrl: 'vendor/supabase-js-2.111.0.umd.js',
  libraryVersion: '2.111.0'
});

/* Gate D §10: configuration is public, but it still has to be RIGHT.
   A 19-character project ref cost a full test cycle in Gate C (§57c) because
   the only symptom was a browser-level "Failed to fetch". Validate the shape
   and say what is wrong. */
function bseValidateConfig(cfg){
  const problems = [];
  const m = /^https:\\/\\/([a-z0-9]+)\\.supabase\\.co\\/?$/.exec(cfg.url || '');
  if(!m) problems.push('Project URL should look like https://<ref>.supabase.co');
  else if(m[1].length !== 20) problems.push('Project ref is ' + m[1].length +
        ' characters; a Supabase project ref is exactly 20');
  const k = cfg.publishableKey || '';
  if(!/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(k) && !/^eyJ[A-Za-z0-9_-]{20,}\\./.test(k))
    problems.push('Publishable key does not look like a Supabase anon/publishable key');
  if(/^sb_secret_|service_role/.test(k))
    problems.push('SECRET KEY DETECTED — this must never appear in browser code');
  return problems;
}""")

# --------------------------------------------------------------------- §13 --
rep("""  let booted = false;         // boot() has reached a terminal state
  let transportInjected = false;  // a transport was installed outside boot()""",
"""  let booted = false;         // boot() has reached a terminal state
  let transportInjected = false;  // a transport was installed outside boot()

  /* ---- Gate D §13: surviving a session that ends mid-edit ----
     When a token refresh fails, Supabase signs the user out. Everything the
     officer typed is still on screen, but the record binding used to be
     destroyed with the session — so the next save minted new ids and forked
     the buyer, which is the §57e failure wearing a different hat.

     parkedCtx holds the binding across the gap. It is only ever handed back to
     the SAME user id that owned it. workspaceOwner is the harder guard: it
     records whose financial data is actually on screen, and a save is refused
     outright if the signed-in user is not that person. Two officers sharing a
     laptop must never be able to file one buyer's numbers under the other's
     account, no matter what sequence of sign-ins got them there. */
  let parkedCtx = null;       // binding held across an unexpected session loss
  let parkedOwner = null;     // the user id that binding belongs to
  let workspaceOwner = null;  // whose data is in the workspace right now
  let dirtySinceSave = false; // authored edits not yet written""")

rep("""  const LABEL = { 'no-save':'Not connected', 'signed-out':'Sign in to save',
                  unsaved:'Not saved', dirty:'Unsaved changes',
                  saving:'Saving…', saved:'Saved',
                  failed:'Save failed', 'signin-failed':'Sign-in failed' };""",
"""  const LABEL = { 'no-save':'Not connected', 'signed-out':'Sign in to save',
                  unsaved:'Not saved', dirty:'Unsaved changes',
                  saving:'Saving…', saved:'Saved',
                  failed:'Save failed', 'signin-failed':'Sign-in failed',
                  // Gate D
                  'config-error':'Configuration error',
                  'auth-lost':'Session expired — sign in to save your changes',
                  offline:'Offline — changes not saved',
                  'foreign-workspace':'Different account — reload to start fresh' };""")

rep("""    el.className = 'bse-save ' + (s === 'signin-failed' ? 'failed' : s);""",
"""    el.className = 'bse-save ' + (['signin-failed','auth-lost','offline',
                                   'config-error','foreign-workspace'].indexOf(s) >= 0 ? 'failed' : s);""")

rep("""             : s === 'dirty'         ? 'You have changes that have not been written yet.'
             : '';""",
"""             : s === 'dirty'         ? 'You have changes that have not been written yet.'
             : s === 'auth-lost'     ? 'Your work is still on screen and has NOT been lost. Sign in again and it will save to the same buyer.'
             : s === 'offline'       ? 'Your work is still on screen. It will save once the connection is back.'
             : s === 'config-error'  ? 'The tool is misconfigured and cannot save. ' + reason
             : s === 'foreign-workspace' ? 'This workspace was authored under a different account. Reload the page to start fresh — nothing has been saved to the wrong account.'
             : '';""")

# ---- saveNow: workspace-owner guard, dirty tracking, error classification ----
rep("""    if(!session){ setState('signed-out'); return { ok:false, reason:'not authenticated' }; }
    if(inFlight){ pending = true; return { ok:true, queued:true }; }""",
"""    if(!session){ setState(dirtySinceSave ? 'auth-lost' : 'signed-out');
                  return { ok:false, reason:'not authenticated' }; }
    /* Gate D §13: the hard boundary. Whoever authored what is on screen is the
       only person it may be saved for. */
    if(workspaceOwner && session.user && session.user.id !== workspaceOwner){
      setState('foreign-workspace');
      return { ok:false, reason:'workspace belongs to a different account' };
    }
    if(inFlight){ pending = true; return { ok:true, queued:true }; }""")

rep("""      savedRevision = rev;
      inFlight = false;
      if(pending){ pending = false; return saveNow(); }
      setState('saved');""",
"""      savedRevision = rev;
      inFlight = false;
      workspaceOwner = session.user ? session.user.id : workspaceOwner;
      dirtySinceSave = false;
      if(pending){ pending = false; return saveNow(); }
      setState('saved');""")

rep("""    } catch(e){
      inFlight = false;
      setState('failed', e);
      return { ok:false, error: String(e.message || e) };   // in-memory state untouched
    }
  }""",
"""    } catch(e){
      inFlight = false;
      /* Gate D §17: "Save failed" must not mask a connectivity or
         authentication problem the tool can actually identify. */
      const kind = classifyFailure(e);
      setState(kind, kind === 'failed' ? e : null);
      return { ok:false, error: String(e.message || e), kind: kind };  // in-memory state untouched
    }
  }

  /* Gate D §17. Deliberately conservative: anything not clearly offline or
     clearly an auth problem stays a plain save failure with its real message. */
  function classifyFailure(e){
    const msg = String((e && (e.message || e.msg)) || e || '');
    const code = e && (e.status || e.statusCode || e.code);
    if(typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
    if(code === 401 || code === 403 ||
       /\\bJWT\\b|jwt expired|token.*expired|invalid.*token|not authenticated|session.*expired/i.test(msg))
      return 'auth-lost';
    if(/Failed to fetch|NetworkError|ERR_INTERNET|ERR_NETWORK|network ?(error|unreachable)/i.test(msg))
      return 'offline';
    return 'failed';
  }""")

# ---- load(): record who owns the workspace, clear dirty ----
rep("""    setState('saved');
    return { ok:true, result_summary: recomputed, cache_discarded: cachedSummary,""",
"""    workspaceOwner = session.user ? session.user.id : null;
    dirtySinceSave = false;
    setState('saved');
    return { ok:true, result_summary: recomputed, cache_discarded: cachedSummary,""")

# ---- every authored edit marks the workspace dirty, session or no session ----
rep("""  function scheduleSave(){
    if(!session || !db) return;
    // The moment the buyer's state diverges from what is stored, say so.
    if(state === 'saved' || state === 'unsaved') setState('dirty');""",
"""  function scheduleSave(){
    /* Gate D §13: an edit made while the session is gone still has to COUNT as
       an unsaved edit, or the tool cannot tell the officer there is work at
       risk. Mark it dirty first, decide whether we can write second. */
    dirtySinceSave = true;
    if(!session || !db){
      if(state === 'signed-out' || state === 'auth-lost') setState('auth-lost');
      return;
    }
    if(workspaceOwner && session.user && session.user.id !== workspaceOwner){
      setState('foreign-workspace'); return;
    }
    // The moment the buyer's state diverges from what is stored, say so.
    if(state === 'saved' || state === 'unsaved') setState('dirty');""")

# ---- endSessionUI parks the binding instead of destroying it ----
rep("""  function endSessionUI(){
    ctx = null; assumptionSetId = null;""",
"""  function endSessionUI(){
    /* Gate D §13: park the binding rather than destroy it. It is handed back
       only to the same user id, in handleAuthChange below. */
    if(ctx){ parkedCtx = ctx; parkedOwner = ctx.owner_user_id || workspaceOwner; }
    ctx = null; assumptionSetId = null;""")

# ---- handleAuthChange: rebind same user, refuse to inherit for a different one --
rep("""    if(nextUser && nextUser === prevUser) return;   // same officer, same buyer
    endSessionUI();
    setState(nextUser ? 'unsaved' : 'signed-out');
    if(nextUser) refreshBuyerList();
  }""",
"""    if(nextUser && nextUser === prevUser) return;   // same officer, same buyer
    endSessionUI();

    if(!nextUser){
      // Gate D §13: the session ended. Say so honestly, and loudly if there is
      // unsaved work on screen. Nothing the officer typed is discarded.
      setState(dirtySinceSave ? 'auth-lost' : 'signed-out');
      return;
    }

    /* Gate D §13: the SAME officer came back. Give them their buyer back so the
       pending work saves to the record it belongs to, instead of forking a new
       one. */
    if(parkedCtx && parkedOwner === nextUser){
      ctx = parkedCtx;
      workspaceOwner = nextUser;
      renderCurrentBuyer();
      setState(dirtySinceSave ? 'dirty' : 'saved');
      if(dirtySinceSave) scheduleSave();
      refreshBuyerList();
      return;
    }

    /* A DIFFERENT officer. The parked binding is discarded, never inherited.
       workspaceOwner is deliberately left as-is: it still describes whose
       numbers are on screen, and it is what makes saveNow() refuse. */
    parkedCtx = null; parkedOwner = null;
    setState(workspaceOwner && workspaceOwner !== nextUser ? 'foreign-workspace' : 'unsaved');
    refreshBuyerList();
  }""")

# ---- an explicit sign-out is deliberate: drop the parked binding too ----
rep("""      if(db) await db.signOut();
      session = null; endSessionUI(); setState('signed-out');""",
"""      if(db) await db.signOut();
      /* An explicit sign-out is deliberate, unlike an expiry. Drop the parked
         binding as well so nothing lingers on a shared workstation. */
      session = null; endSessionUI();
      parkedCtx = null; parkedOwner = null;
      setState(dirtySinceSave ? 'auth-lost' : 'signed-out');""")

# --------------------------------------------------------------------- §11 --
rep("""    try {
      const mod = await import(BSE_SUPABASE.libraryUrl);
      const client = mod.createClient(BSE_SUPABASE.url, BSE_SUPABASE.publishableKey);""",
"""    /* Gate D §10: refuse to proceed on bad configuration, and name the fault.
       A misconfigured deploy should not look like a network problem. */
    const configProblems = bseValidateConfig(BSE_SUPABASE);
    if(configProblems.length){
      db = null; renderAuthUI();
      setState('config-error', new Error(configProblems.join('; ')));
      booted = true; return;
    }
    try {
      const mod = await loadSupabaseLibrary();
      const client = mod.createClient(BSE_SUPABASE.url, BSE_SUPABASE.publishableKey);""")

rep("""  /* ---------------- boot ---------------- */
  async function boot(){""",
"""  /* Gate D §11: load the vendored UMD bundle from our own origin. No CDN, no
     third-party script execution, and no build step — the npm package ships
     this bundle prebuilt. Resolved relative to the page so it works at any
     deployment path. */
  function loadSupabaseLibrary(){
    if(window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = new URL(BSE_SUPABASE.libraryUrl, document.baseURI).href;
      el.async = true;
      el.onload = () => (window.supabase && window.supabase.createClient)
        ? resolve(window.supabase)
        : reject(new Error('vendored Supabase library loaded but exported nothing'));
      el.onerror = () => reject(new Error('vendored Supabase library could not be loaded from ' + el.src));
      document.head.appendChild(el);
    });
  }

  /* ---------------- boot ---------------- */
  async function boot(){""")

# --------------------------------------------------------------------- §18 --
# Deployment-blocking responsive defect: signed in, the bar is ~577px wide. In a
# 375px viewport it sat at left:-210px and pushed the Buyer name field entirely
# off the screen, so a buyer could not be named or renamed on a phone. Q-6 locks
# FULL phone editing, so that is blocking. CSS only — no layout restructuring,
# no logic change, nothing outside this bar.
rep("""      '#bsePersistBar{position:fixed;top:8px;right:8px;z-index:99998;display:flex;gap:6px;align-items:center;' +
      'background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:6px 10px;font-size:12px;' +
      'box-shadow:0 2px 10px rgba(0,0,0,.12);font-family:-apple-system,BlinkMacSystemFont,sans-serif}' +""",
"""      '#bsePersistBar{position:fixed;top:8px;right:8px;z-index:99998;display:flex;gap:6px;align-items:center;' +
      'flex-wrap:wrap;justify-content:flex-end;max-width:calc(100vw - 16px);' +
      'background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:6px 10px;font-size:12px;' +
      'box-shadow:0 2px 10px rgba(0,0,0,.12);font-family:-apple-system,BlinkMacSystemFont,sans-serif}' +
      '@media (max-width:700px){#bsePersistBar{left:8px;right:8px;max-width:none}' +
      '#bsePersistBar input,#bsePersistBar select{flex:1 1 130px;width:auto;min-width:0;max-width:100%}' +
      '#bseCurrentBuyer{flex:1 1 100%;max-width:100%}' +
      '#bsePersistBar button{min-height:36px}}' +""")

# ---- testing surface ----
rep("""    __refreshBuyerList: refreshBuyerList,
    __loadBuyer: loadBuyer,""",
"""    __refreshBuyerList: refreshBuyerList,
    __loadBuyer: loadBuyer,
    __validateConfig: bseValidateConfig,
    __validateShipped: () => bseValidateConfig(BSE_SUPABASE),
    __classifyFailure: classifyFailure,
    __config: () => ({ url: BSE_SUPABASE.url, libraryUrl: BSE_SUPABASE.libraryUrl,
                       libraryVersion: BSE_SUPABASE.libraryVersion }),
    __gateD: () => ({ parkedCtx: parkedCtx, parkedOwner: parkedOwner,
                      workspaceOwner: workspaceOwner, dirty: dirtySinceSave }),
    __setWorkspaceOwner: o => { workspaceOwner = o; },""")

open(PATH, "w", encoding="utf-8").write(src)
print("PATCHED OK — %d edits" % n)
print("  before md5:", before)
print("  after  md5:", hashlib.md5(src.encode("utf-8")).hexdigest())
