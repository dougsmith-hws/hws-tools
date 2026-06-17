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
    el.id = 'hws-client-tag';
    el.textContent = '\u{1F464} ' + client;

    // The Hub button is the anchor point (top-right in all buyer tools).
    var hub = document.getElementById('hws-hub-btn')
           || document.querySelector('a.btn-hub')
           || document.querySelector('a.back-link');

    var fixedHub = hub && getComputedStyle(hub).position === 'fixed';

    if (hub && !fixedHub && hub.parentNode) {
      // In-flow hub (inside a flex header): drop a small chip just before it.
      el.style.cssText = [
        'display:inline-flex','align-items:center',
        'font-size:12px','font-weight:600',
        'color:#94a3b8',
        'border:1px solid #475569','border-radius:6px',
        'padding:5px 11px','margin-right:8px',
        'white-space:nowrap','flex-shrink:0',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      ].join(';');
      hub.parentNode.insertBefore(el, hub);
      return;
    }

    if (fixedHub) {
      // Fixed hub (position:fixed top-right): place a matching pill to its left,
      // and reserve right-padding on the header so existing header text (e.g.
      // "Doug Smith, CMA® | President") shifts clear and nothing overlaps.
      el.style.cssText = [
        'position:fixed','z-index:9999',
        'display:inline-flex','align-items:center','box-sizing:border-box',
        'background:rgba(28,43,58,0.92)',
        'color:rgba(255,255,255,0.92)',
        'font-size:12px','font-weight:600',
        'padding:0 12px','border-radius:8px',
        'white-space:nowrap',
        'box-shadow:0 2px 8px rgba(0,0,0,0.25)',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      ].join(';');
      document.body.appendChild(el);

      var header = hub.closest('.header') || hub.parentElement;
      var prevPadR = header ? parseFloat(getComputedStyle(header).paddingRight) || 0 : 0;

      var position = function () {
        var r = hub.getBoundingClientRect();
        el.style.top    = r.top + 'px';
        el.style.height = r.height + 'px';
        el.style.right  = (window.innerWidth - r.left + 10) + 'px'; // 10px gap left of Hub
        if (header) {
          var t = el.getBoundingClientRect();
          // push header content to clear the tag's left edge (+12px breathing room)
          var needed = Math.ceil(window.innerWidth - t.left + 12);
          header.style.paddingRight = Math.max(prevPadR, needed) + 'px';
        }
      };
      position();
      window.addEventListener('resize', position);
      return;
    }

    // Last-resort fallback: small fixed pill, top-right corner.
    el.style.cssText = [
      'position:fixed','top:14px','right:16px','z-index:9998',
      'background:#1a2332','color:white',
      'font-size:12px','font-weight:600',
      'padding:5px 13px','border-radius:8px',
      'box-shadow:0 2px 10px rgba(0,0,0,0.2)','pointer-events:none',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');
    document.body.appendChild(el);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
