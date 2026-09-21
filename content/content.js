// Message router for the content scripts. Installed once per page even if
// the files are injected again after a navigation.
var JevContent = globalThis.JevContent || (globalThis.JevContent = {});

(function (ns) {
  'use strict';
  if (ns.routerInstalled) return;
  ns.routerInstalled = true;

  async function handle(msg) {
    switch (msg.type) {
      case 'jev:ping': return { ok: true };
      case 'jev:snapshot': return { ok: true, snapshot: ns.snapshot(msg) };
      case 'jev:fingerprint': return { ok: true, ...ns.fingerprint() };
      case 'jev:badges':
        if (msg.items) ns.showBadges(msg.items); else ns.clearBadges();
        return { ok: true };
      case 'jev:status': ns.status(msg.text); return { ok: true };
      case 'jev:prepare': return ns.prepare(msg.id);
      case 'jev:focus': return ns.focusAndSelect(msg.id);
      case 'jev:execute': return ns.execute(msg);
      case 'jev:settle': return ns.settle(msg);
      case 'jev:cleanup': ns.removeOverlay(); return { ok: true };
      default: return { ok: false, reason: `Unknown message "${msg.type}".` };
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('jev:')) return false;
    handle(msg).then(sendResponse, (err) => {
      console.error('Jev content script failed', err);
      sendResponse({ ok: false, reason: String(err && err.message ? err.message : err) });
    });
    return true;
  });

  addEventListener('scroll', () => ns.clearBadges(), { passive: true });
})(JevContent);
