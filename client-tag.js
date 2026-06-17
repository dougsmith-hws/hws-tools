/**
 * client-tag.js — HWS Client Name Display
 * Reads ?client= URL param and shows client name inside the tool header.
 * Injected automatically into all buyer tools via deploy script.
 */
(function () {
  var params = new URLSearchParams(window.location.search);
  var raw    = params.get('client');
  if (!raw) return;

  var client = decodeURIComponent(raw);

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function inject() {
    var el = document.createElement('span');

    // Try to insert before the ← Hub back-link (present in all buyer tools)
    var backLink = document.querySelector('a.back-link');
    if (backLink && backLink.parentNode) {
      el.style.cssText = [
        'font-size:11px',
        'font-weight:600',
        'color:rgba(255,255,255,0.85)',
        'background:rgba(0,0,0,0.18)',
        'border-radius:12px',
        'padding:3px 10px',
        'white-space:nowrap',
        'flex-shrink:0',
        'align-self:center',
        'margin-right:4px',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      ].join(';');
      el.textContent = '\u{1F464} ' + client;
      backLink.parentNode.insertBefore(el, backLink);
      return;
    }

    // Fallback: fixed pill bottom-left
    el.style.cssText = [
      'position:fixed',
      'bottom:16px',
      'left:16px',
      'z-index:9998',
      'background:#1a2332',
      'color:white',
      'font-size:11px',
      'font-weight:600',
      'padding:5px 13px',
      'border-radius:20px',
      'box-shadow:0 2px 10px rgba(0,0,0,0.2)',
      'pointer-events:none',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');
    el.textContent = '\u{1F464} ' + client;
    document.body.appendChild(el);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
