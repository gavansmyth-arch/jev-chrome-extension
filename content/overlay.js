// Draws numbered badges on the elements Jev can see and a small status bar.
// Lives in a closed shadow root so page styles cannot touch it and it never
// intercepts clicks.
var JevContent = globalThis.JevContent || (globalThis.JevContent = {});

(function (ns) {
  'use strict';

  const HOST_ID = 'jev-drive-overlay';
  const STYLE = `
    :host { all: initial; }
    .badge {
      position: fixed; z-index: 1; transform: translate(-2px, -100%);
      font: 600 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #facc15; color: #18181b; padding: 2px 5px; border-radius: 4px;
      box-shadow: 0 1px 2px rgba(0,0,0,.35); pointer-events: none; white-space: nowrap;
    }
    .bar {
      position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%); z-index: 2;
      max-width: min(92vw, 640px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font: 500 12px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #18181b; color: #f4f4f5; border: 1px solid #facc15; border-radius: 999px;
      padding: 7px 14px; box-shadow: 0 4px 14px rgba(0,0,0,.35); pointer-events: none;
    }
    .bar[hidden] { display: none; }
  `;

  let host = null;
  let badgeLayer = null;
  let bar = null;

  function ensure() {
    if (host && host.isConnected) return;
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    badgeLayer = document.createElement('div');
    bar = document.createElement('div');
    bar.className = 'bar';
    bar.hidden = true;
    shadow.append(style, badgeLayer, bar);
    (document.documentElement || document.body).appendChild(host);
  }

  ns.showBadges = function showBadges(items) {
    ensure();
    const badges = items.map(({ id, rect }) => {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = String(id).replace(/^e/, '');
      b.style.left = `${Math.max(0, rect.x)}px`;
      b.style.top = `${Math.max(12, rect.y)}px`;
      return b;
    });
    badgeLayer.replaceChildren(...badges);
  };

  ns.clearBadges = function clearBadges() {
    if (badgeLayer) badgeLayer.replaceChildren();
  };

  ns.status = function status(text) {
    ensure();
    bar.hidden = !text;
    bar.textContent = text || '';
  };

  ns.removeOverlay = function removeOverlay() {
    if (host) host.remove();
    host = null;
    badgeLayer = null;
    bar = null;
  };
})(JevContent);
