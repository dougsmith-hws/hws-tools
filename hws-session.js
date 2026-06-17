/**
 * hws-session.js — HomeWealth Solutions Buyer Session Tagging
 * Version: 1.0 · June 2026
 *
 * DROP-IN: Add <script src="/hws-session.js"></script> before </body> in any buyer tool.
 * The module auto-injects a session bar and handles all logging.
 *
 * SETUP REQUIRED:
 *   1. Create a Google Sheet named "HWS Tool Runs"
 *   2. Deploy apps-script-logger.gs as a web app (see that file for instructions)
 *   3. Paste the web app URL below as HWS_SCRIPT_URL
 */

(function () {
  'use strict';

  // ─── CONFIGURATION ────────────────────────────────────────────────────────
  const HWS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbylPGtxYpbKBaqqmkR21tmJ4vd13oB2FRriFqMQBRQ3KUGEImORdGZbcG6rUWusw19qYQ/exec';  // Replace after deploying Apps Script
  const STORAGE_KEY    = 'hws_session_tag';
  const TOOL_NAME      = document.title.split('|')[0].split('—')[0].trim() || 'Unknown Tool';
  const TOOL_URL       = window.location.pathname;

  // ─── STYLES ───────────────────────────────────────────────────────────────
  const css = `
    #hws-session-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: #1a2332;
      border-top: 2px solid #2491EB;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      box-shadow: 0 -2px 12px rgba(0,0,0,0.25);
    }
    #hws-session-bar .hws-label {
      font-size: 10px;
      font-weight: 700;
      color: rgba(255,255,255,0.45);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    #hws-session-bar input {
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px;
      color: white;
      font-size: 12px;
      padding: 5px 8px;
      outline: none;
    }
    #hws-session-bar input::placeholder { color: rgba(255,255,255,0.35); }
    #hws-session-bar input:focus { border-color: #2491EB; background: rgba(36,145,235,0.15); }
    #hws-name-input  { width: 130px; }
    #hws-phone-input { width: 70px; }
    #hws-save-btn {
      background: #2491EB;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      padding: 6px 12px;
      cursor: pointer;
      white-space: nowrap;
    }
    #hws-save-btn:hover { background: #1a7fd4; }
    #hws-save-btn.saved { background: #8EC73F; }
    #hws-tag-display {
      font-size: 11px;
      color: #8EC73F;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }
    #hws-clear-btn {
      background: none;
      border: 1px solid rgba(255,255,255,0.2);
      color: rgba(255,255,255,0.5);
      border-radius: 5px;
      font-size: 10px;
      padding: 4px 8px;
      cursor: pointer;
      flex-shrink: 0;
    }
    #hws-clear-btn:hover { border-color: #ff6b6b; color: #ff6b6b; }
    #hws-status-msg {
      font-size: 10px;
      color: rgba(255,255,255,0.5);
      white-space: nowrap;
      flex-shrink: 0;
    }
    /* Nudge page content up so bar doesn't overlap */
    body { padding-bottom: 50px !important; }
  `;

  // ─── INJECT STYLES ────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ─── BUILD BAR ────────────────────────────────────────────────────────────
  const bar = document.createElement('div');
  bar.id = 'hws-session-bar';

  const existingTag = loadTag();

  if (existingTag) {
    // Compact mode: show active tag
    bar.innerHTML = `
      <span class="hws-label">Client</span>
      <span id="hws-tag-display">${escapeHtml(existingTag.name)} · ${escapeHtml(existingTag.phone4)}</span>
      <button id="hws-clear-btn" title="Clear client tag">✕ Clear</button>
      <button id="hws-save-btn">📋 Log Run</button>
      <span id="hws-status-msg"></span>
    `;
  } else {
    // Input mode: enter new tag
    bar.innerHTML = `
      <span class="hws-label">Client Tag</span>
      <input id="hws-name-input"  type="text" placeholder="First name" maxlength="40" autocomplete="off">
      <input id="hws-phone-input" type="text" placeholder="Last 4" maxlength="4" pattern="[0-9]{4}" autocomplete="off">
      <button id="hws-save-btn">Save &amp; Log</button>
      <span id="hws-status-msg"></span>
    `;
  }

  document.body.appendChild(bar);

  // ─── WIRE EVENTS ──────────────────────────────────────────────────────────
  document.getElementById('hws-save-btn').addEventListener('click', handleSave);

  const clearBtn = document.getElementById('hws-clear-btn');
  if (clearBtn) clearBtn.addEventListener('click', clearTag);

  // Phone input: digits only
  const phoneInput = document.getElementById('hws-phone-input');
  if (phoneInput) {
    phoneInput.addEventListener('input', () => {
      phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 4);
    });
  }

  // ─── HANDLERS ─────────────────────────────────────────────────────────────
  function handleSave() {
    let tag = loadTag();

    // If in input mode, read fields and save tag
    if (!tag) {
      const nameInput  = document.getElementById('hws-name-input');
      const phone4Input = document.getElementById('hws-phone-input');
      const name  = nameInput ? nameInput.value.trim() : '';
      const phone4 = phone4Input ? phone4Input.value.trim() : '';

      if (!name || phone4.length !== 4) {
        setStatus('Enter name + 4-digit phone last 4 first.', '#ff9f43');
        return;
      }
      tag = { name, phone4 };
      saveTag(tag);
    }

    // Scrape key outputs from the page
    const outputs = scrapeOutputs();

    // Log to Google Sheets
    logRun(tag, outputs);
  }

  function clearTag() {
    localStorage.removeItem(STORAGE_KEY);
    // Rebuild bar in input mode
    const b = document.getElementById('hws-session-bar');
    b.innerHTML = `
      <span class="hws-label">Client Tag</span>
      <input id="hws-name-input"  type="text" placeholder="First name" maxlength="40" autocomplete="off">
      <input id="hws-phone-input" type="text" placeholder="Last 4" maxlength="4" pattern="[0-9]{4}" autocomplete="off">
      <button id="hws-save-btn">Save &amp; Log</button>
      <span id="hws-status-msg"></span>
    `;
    document.getElementById('hws-save-btn').addEventListener('click', handleSave);
    const p = document.getElementById('hws-phone-input');
    if (p) p.addEventListener('input', () => { p.value = p.value.replace(/\D/g, '').slice(0, 4); });
  }

  // ─── LOGGING ──────────────────────────────────────────────────────────────
  function logRun(tag, outputs) {
    const payload = {
      name:   tag.name,
      phone4: tag.phone4,
      tool:   TOOL_NAME,
      url:    TOOL_URL,
      ts:     new Date().toISOString(),
      outputs: outputs
    };

    if (!HWS_SCRIPT_URL || HWS_SCRIPT_URL.startsWith('PASTE_')) {
      setStatus('⚠ Script URL not configured — run not logged.', '#ff9f43');
      flashSaved();
      return;
    }

    setStatus('Logging…', 'rgba(255,255,255,0.5)');

    fetch(HWS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain' }   // text/plain avoids CORS preflight
    })
    .then(r => r.json())
    .then(data => {
      if (data.status === 'ok') {
        setStatus('✓ Logged', '#8EC73F');
        flashSaved();
      } else {
        setStatus('⚠ Error logging run', '#ff9f43');
      }
    })
    .catch(() => {
      // Offline — queue for later
      queueOffline(payload);
      setStatus('⚠ Offline — queued', '#ff9f43');
      flashSaved();
    });
  }

  // ─── OUTPUT SCRAPING ──────────────────────────────────────────────────────
  // Captures visible result values from common patterns across HWS tools.
  // Does NOT read input fields or change any calculation state.
  function scrapeOutputs() {
    const results = {};
    const selectors = [
      '.result-value', '.result-amount', '.result-total',
      '[data-output]', '.calc-result', '.output-value',
      '.summary-value', '.key-number', '.big-number'
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach((el, i) => {
        const label = el.closest('[data-label]')?.dataset.label
          || el.previousElementSibling?.textContent?.trim()
          || sel.replace(/[\.\[\]]/g, '') + '_' + i;
        results[label] = el.textContent.trim();
      });
    });
    // Fallback: capture any <output> elements
    document.querySelectorAll('output').forEach((el, i) => {
      results['output_' + i] = el.textContent.trim();
    });
    return results;
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────
  function saveTag(tag) { localStorage.setItem(STORAGE_KEY, JSON.stringify(tag)); }
  function loadTag() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
  }
  function setStatus(msg, color) {
    const el = document.getElementById('hws-status-msg');
    if (el) { el.textContent = msg; el.style.color = color; }
  }
  function flashSaved() {
    const btn = document.getElementById('hws-save-btn');
    if (btn) {
      btn.classList.add('saved');
      btn.textContent = '✓ Logged';
      setTimeout(() => {
        btn.classList.remove('saved');
        btn.textContent = loadTag() ? '📋 Log Run' : 'Save & Log';
      }, 2500);
    }
  }
  function queueOffline(payload) {
    const queue = JSON.parse(localStorage.getItem('hws_offline_queue') || '[]');
    queue.push(payload);
    localStorage.setItem('hws_offline_queue', JSON.stringify(queue.slice(-20))); // keep last 20
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ─── FLUSH OFFLINE QUEUE on reconnect ────────────────────────────────────
  window.addEventListener('online', () => {
    const queue = JSON.parse(localStorage.getItem('hws_offline_queue') || '[]');
    if (!queue.length || !HWS_SCRIPT_URL || HWS_SCRIPT_URL.startsWith('PASTE_')) return;
    queue.forEach(payload => {
      fetch(HWS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'text/plain' }
      }).then(() => {}).catch(() => {});
    });
    localStorage.removeItem('hws_offline_queue');
  });

  // ─── PUBLIC API ───────────────────────────────────────────────────────────
  // Tools can call window.HWSSession.log(customOutputs) to force a log with specific values.
  window.HWSSession = {
    log: function (customOutputs) {
      const tag = loadTag();
      if (!tag) { setStatus('Set client tag first.', '#ff9f43'); return; }
      logRun(tag, customOutputs || scrapeOutputs());
    },
    getTag: loadTag,
    clear: clearTag
  };

})();
