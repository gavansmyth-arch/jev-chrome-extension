// Prepares a target for input (scrolls it into view, waits for it to stop
// moving, checks nothing covers it) and performs synthetic actions when
// trusted input is off. Waits for the page to settle after an action.
var JevContent = globalThis.JevContent || (globalThis.JevContent = {});

(function (ns) {
  'use strict';

  const STABLE_CHECKS = 3;
  const STABLE_GAP_MS = 60;
  const SETTLE_QUIET_MS = 350;
  const SETTLE_MAX_MS = 2500;
  const SCROLL_FRACTION = 0.8;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const fail = (reason) => ({ ok: false, reason });

  async function waitStable(el) {
    let last = null;
    for (let i = 0; i < STABLE_CHECKS; i++) {
      const r = el.getBoundingClientRect();
      const key = `${r.left | 0},${r.top | 0},${r.width | 0},${r.height | 0}`;
      if (key === last) return;
      last = key;
      await sleep(STABLE_GAP_MS);
    }
  }

  ns.prepare = async function prepare(id) {
    const el = ns.resolve(id);
    if (!el) return fail('The element is no longer on the page.');
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    await waitStable(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return fail('The element has no size any more.');
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return fail('The element is outside the viewport.');
    const hit = document.elementFromPoint(x, y);
    if (!ns.related(el, hit)) return fail(`The element is covered by ${hit ? `<${hit.tagName.toLowerCase()}>` : 'something else'}.`);
    return { ok: true, x, y };
  };

  ns.focusAndSelect = function focusAndSelect(id) {
    const el = ns.resolve(id);
    if (!el) return fail('The element is no longer on the page.');
    el.focus({ preventScroll: true });
    if (typeof el.select === 'function') {
      el.select();
    } else if (el.isContentEditable) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    return { ok: true };
  };

  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value); else el.value = value;
  }

  function fire(el, type) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  function typeInto(el, value) {
    el.focus({ preventScroll: true });
    if (el.isContentEditable) {
      document.execCommand('selectAll', false, null);
      if (!document.execCommand('insertText', false, value)) el.textContent = value;
    } else {
      setNativeValue(el, value);
      fire(el, 'input');
      fire(el, 'change');
    }
    return { ok: true };
  }

  // Prefers the option's position (what Jev actually chose); falls back to matching text.
  function selectOption(el, value, index) {
    const wanted = String(value ?? '').replace(/\s+/g, ' ').trim();
    const options = Array.from(el.options || []);
    const option = (Number.isInteger(index) && options[index])
      || options.find((o) => (o.textContent || '').replace(/\s+/g, ' ').trim() === wanted)
      || options.find((o) => o.value === wanted);
    if (!option) return fail(`The dropdown has no option "${wanted}".`);
    el.value = option.value;
    fire(el, 'input');
    fire(el, 'change');
    return { ok: true };
  }

  function pressEnter() {
    const el = ns.deepActiveElement();
    if (!el || el === document.body) return fail('No text field is focused.');
    const init = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    const proceed = el.dispatchEvent(new KeyboardEvent('keydown', init));
    el.dispatchEvent(new KeyboardEvent('keypress', init));
    el.dispatchEvent(new KeyboardEvent('keyup', init));
    if (proceed && el.form) {
      if (typeof el.form.requestSubmit === 'function') el.form.requestSubmit(); else el.form.submit();
    }
    return { ok: true };
  }

  ns.execute = async function execute({ action, id, value, index }) {
    if (action === 'scroll_down' || action === 'scroll_up') {
      const sign = action === 'scroll_down' ? 1 : -1;
      window.scrollBy({ top: sign * innerHeight * SCROLL_FRACTION, behavior: 'instant' });
      return { ok: true };
    }
    if (action === 'press_enter') return pressEnter();

    const el = id ? ns.resolve(id) : null;
    if (!el) return fail('The element is no longer on the page.');
    if (action === 'click') {
      if (typeof el.focus === 'function') el.focus({ preventScroll: true });
      el.click();
      return { ok: true };
    }
    if (action === 'type') return typeInto(el, value);
    if (action === 'select') return selectOption(el, value, index);
    return fail(`Unknown action "${action}".`);
  };

  ns.settle = function settle({ quietMs = SETTLE_QUIET_MS, maxMs = SETTLE_MAX_MS } = {}) {
    return new Promise((resolve) => {
      let changed = false;
      let quietTimer = null;
      const observer = new MutationObserver(() => {
        changed = true;
        clearTimeout(quietTimer);
        quietTimer = setTimeout(finish, quietMs);
      });
      const cap = setTimeout(finish, maxMs);
      function finish() {
        observer.disconnect();
        clearTimeout(quietTimer);
        clearTimeout(cap);
        resolve({ ok: true, changed });
      }
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
      quietTimer = setTimeout(finish, quietMs);
    });
  };
})(JevContent);
