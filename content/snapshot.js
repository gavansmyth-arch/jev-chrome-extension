// Reads the page as a numbered table of interactive elements plus its visible
// text. Classic content script: shares the JevContent namespace with the
// other content files and tolerates being injected more than once.
var JevContent = globalThis.JevContent || (globalThis.JevContent = {});

(function (ns) {
  'use strict';

  const SELECTOR = [
    'a[href]', 'button', 'input', 'select', 'textarea', 'summary',
    '[contenteditable=""]', '[contenteditable="true"]', '[contenteditable="plaintext-only"]',
    '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]', '[role="tab"]',
    '[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]', '[role="option"]',
    '[role="combobox"]', '[role="textbox"]', '[role="searchbox"]', '[role="switch"]', '[role="slider"]',
    '[role="treeitem"]', '[onclick]', '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'number', 'date', 'datetime-local', 'month', 'week', 'time']);
  const SKIP_INPUT_TYPES = new Set(['hidden', 'password', 'file']);
  const CHECKABLE_ROLES = new Set(['checkbox', 'radio', 'switch', 'menuitemcheckbox', 'menuitemradio']);
  const NAME_MAX = 100;
  const VALUE_MAX = 80;
  const SECTION_MAX = 60;
  const HREF_MAX = 160;
  const OPTIONS_MAX = 30;
  const NEAR_VIEW_FRACTION = 0.5; // half a viewport above and below still counts
  const FINGERPRINT_CHARS = 4000;

  let registry = new Map(); // id → element, for the latest snapshot

  const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const shorten = (s, max) => (clean(s).length > max ? `${clean(s).slice(0, max - 1)}…` : clean(s));
  const textOf = (el) => clean(el.innerText ?? el.textContent);

  function collect(root, out) {
    root.querySelectorAll(SELECTOR).forEach((el) => out.push(el));
    root.querySelectorAll('*').forEach((el) => { if (el.shadowRoot) collect(el.shadowRoot, out); });
  }

  function isVisible(el) {
    if (el.closest('[aria-hidden="true"]')) return false;
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  const isDisabled = (el) => Boolean(el.disabled) || el.getAttribute('aria-disabled') === 'true';

  function roleOf(el) {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button' || tag === 'summary') return 'button';
    if (tag === 'select') return 'select';
    if (tag === 'textarea') return 'textarea';
    if (tag === 'input') {
      const type = (el.type || 'text').toLowerCase();
      if (type === 'checkbox' || type === 'radio') return type;
      if (['submit', 'button', 'reset', 'image'].includes(type)) return 'button';
      if (type === 'range') return 'slider';
      return type === 'search' ? 'searchbox' : 'textbox';
    }
    if (el.isContentEditable) return 'textbox';
    return 'clickable';
  }

  function kindOf(el, role) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'select') return 'select';
    if (tag === 'textarea' || el.isContentEditable) return 'type';
    if (tag === 'input' && TEXT_INPUT_TYPES.has((el.type || 'text').toLowerCase())) return 'type';
    if (tag === 'input' && (role === 'textbox' || role === 'searchbox' || role === 'combobox')) return 'type';
    return 'click';
  }

  function labelledBy(el) {
    const ids = el.getAttribute('aria-labelledby');
    if (!ids) return '';
    const root = el.getRootNode();
    return ids.split(/\s+/)
      .map((id) => (root.getElementById ? root.getElementById(id) : document.getElementById(id)))
      .filter(Boolean).map(textOf).filter(Boolean).join(' ');
  }

  function nameOf(el) {
    const isButtonInput = el.tagName === 'INPUT' && ['submit', 'button', 'reset'].includes(el.type);
    const candidates = [
      el.getAttribute('aria-label'), labelledBy(el),
      el.labels && el.labels.length ? textOf(el.labels[0]) : '',
      el.getAttribute('placeholder'), el.getAttribute('title'),
      el.querySelector ? el.querySelector('img[alt]')?.getAttribute('alt') : '',
      isButtonInput ? el.value : '',
      el.isContentEditable ? '' : textOf(el),
      el.getAttribute('name'), el.id,
    ];
    return shorten(candidates.find((c) => c && clean(c)) || '', NAME_MAX);
  }

  function valueOf(el, kind, role) {
    if (el.tagName === 'SELECT') {
      const option = el.selectedOptions && el.selectedOptions[0];
      return option ? shorten(textOf(option) || option.value, VALUE_MAX) : '';
    }
    if (kind === 'type') return shorten(el.isContentEditable ? textOf(el) : el.value, VALUE_MAX);
    if (role === 'combobox' || role === 'slider') return shorten(el.value ?? el.getAttribute('aria-valuenow'), VALUE_MAX);
    return '';
  }

  function checkedOf(el, role) {
    if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) return el.checked;
    if (CHECKABLE_ROLES.has(role)) {
      const aria = el.getAttribute('aria-checked');
      return aria === 'true' ? true : aria === 'false' ? false : null;
    }
    return null;
  }

  function hrefOf(el) {
    if (el.tagName !== 'A') return '';
    const raw = el.getAttribute('href') || '';
    if (/^\s*javascript:/i.test(raw)) return '';
    try { return shorten(new URL(raw, location.href).href, HREF_MAX); } catch { return ''; }
  }

  function optionsOf(el) {
    if (el.tagName !== 'SELECT') return undefined;
    return Array.from(el.options).slice(0, OPTIONS_MAX).map((o) => shorten(textOf(o) || o.value, VALUE_MAX));
  }

  function sectionOf(el) {
    const scope = el.parentElement && el.parentElement.closest(
      'form, section, article, nav, aside, header, footer, main, dialog, [role="dialog"], [role="navigation"], [role="region"], [aria-label]',
    );
    if (!scope) return '';
    const label = scope.getAttribute('aria-label');
    if (label) return shorten(label, SECTION_MAX);
    const heading = scope.querySelector('h1, h2, h3, h4, legend, [role="heading"]');
    return heading ? shorten(textOf(heading), SECTION_MAX) : '';
  }

  function related(el, hit) {
    if (!hit) return false;
    if (el === hit || el.contains(hit) || hit.contains(el)) return true;
    if (hit.shadowRoot && hit.shadowRoot.contains(el)) return true;
    return Boolean(el.labels && Array.from(el.labels).some((l) => l.contains(hit)));
  }
  ns.related = related;

  function isCovered(el, r) {
    const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
    const y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
    const root = el.getRootNode();
    const hit = (root instanceof ShadowRoot ? root : document).elementFromPoint(x, y);
    return !related(el, hit);
  }

  function deepActiveElement() {
    let active = document.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) active = active.shadowRoot.activeElement;
    return active;
  }

  function describe(el, id, r, inView) {
    const role = roleOf(el);
    const kind = kindOf(el, role);
    return {
      id, role, kind,
      name: nameOf(el),
      value: valueOf(el, kind, role),
      checked: checkedOf(el, role),
      href: hrefOf(el),
      section: sectionOf(el),
      options: optionsOf(el),
      inView,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
    };
  }

  function visibleText(max) {
    const text = (document.body ? document.body.innerText : '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  ns.snapshot = function snapshot({ maxText = 6000 } = {}) {
    const raw = [];
    collect(document, raw);
    const vh = innerHeight;
    const vw = innerWidth;
    const elements = [];
    registry = new Map();
    for (const el of raw) {
      if (isDisabled(el)) continue;
      if (el.tagName === 'INPUT' && SKIP_INPUT_TYPES.has((el.type || '').toLowerCase())) continue;
      if (!isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      const near = r.bottom > -vh * NEAR_VIEW_FRACTION && r.top < vh * (1 + NEAR_VIEW_FRACTION);
      if (!near) continue;
      const inView = r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
      if (inView && isCovered(el, r)) continue;
      const id = `e${elements.length + 1}`;
      registry.set(id, el);
      elements.push(describe(el, id, r, inView));
    }

    const active = deepActiveElement();
    const focusedEntry = active ? elements.find((e) => registry.get(e.id) === active) : null;
    const scrollHeight = document.documentElement.scrollHeight;
    return {
      url: location.href,
      title: document.title,
      text: visibleText(maxText),
      elements,
      scroll: { canDown: scrollY + vh < scrollHeight - 2, canUp: scrollY > 2 },
      focused: focusedEntry ? { id: focusedEntry.id, hasText: Boolean(focusedEntry.value) } : null,
      canGoBack: history.length > 1,
      viewport: { w: vw, h: vh },
    };
  };

  ns.resolve = function resolve(id) {
    const el = registry.get(id);
    return el && el.isConnected ? el : null;
  };

  function hashOf(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16);
  }

  // Form values are part of the fingerprint so that typing or selecting
  // counts as a change; password values are never read.
  function formValues() {
    return Array.from(document.querySelectorAll('input, textarea, select'))
      .map((el) => ((el.type || '').toLowerCase() === 'password' ? '' : `${el.value}${el.checked ? '*' : ''}`))
      .join('');
  }

  ns.fingerprint = function fingerprint() {
    const text = document.body ? document.body.innerText.slice(0, FINGERPRINT_CHARS) : '';
    const count = document.querySelectorAll(SELECTOR).length;
    return { url: location.href, hash: hashOf(`${text}|${count}|${scrollY | 0}|${formValues()}`) };
  };

  ns.deepActiveElement = deepActiveElement;
})(JevContent);
