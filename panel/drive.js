// The Drive tab: goal in, run/step/stop, live step log, and the prompts Jev
// raises when it needs a decision or some text from the person.

const RECENT_KEY = 'recentGoals';
const RECENT_MAX = 8;
const ACTIVE = new Set(['running', 'waiting', 'paused']);
const EXAMPLES = Object.freeze([
  'Search Wikipedia for "espresso" and open the article',
  'Open the comments of the top story on Hacker News',
  'On this page, find the pricing page and open it',
  'Search this site for "return policy" and open the first result',
  'Scroll down and open the newest release on this GitHub page',
]);

const $ = (id) => document.getElementById(id);
const ui = {
  goal: $('goal'), examples: $('examples'), run: $('run'), step: $('step'), stop: $('stop'),
  status: $('driveStatus'), error: $('driveError'), waiting: $('waiting'), waitPrompt: $('waitPrompt'),
  waitText: $('waitText'), waitInput: $('waitInput'), waitSend: $('waitSend'), waitConfirm: $('waitConfirm'),
  waitYes: $('waitYes'), waitNo: $('waitNo'), steps: $('steps'), outcome: $('outcome'),
  copyTrace: $('copyTrace'), traceStatus: $('traceStatus'), recentList: $('recentList'),
};

let run = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}
const append = (parent, ...kids) => { kids.filter(Boolean).forEach((k) => parent.appendChild(k)); return parent; };
const pct = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`);

async function send(msg) {
  const reply = await chrome.runtime.sendMessage(msg);
  if (!reply?.ok) throw new Error(reply?.error || 'The extension did not reply. Try reloading it.');
  return reply;
}

function showError(message) {
  ui.error.textContent = message || '';
  ui.error.hidden = !message;
}

/* ---- recent goals ---- */

async function loadRecent() {
  try {
    const stored = await chrome.storage.local.get(RECENT_KEY);
    renderRecent(stored[RECENT_KEY] || []);
  } catch (err) {
    console.error('Jev: could not load recent goals', err);
  }
}

async function addRecent(goal) {
  try {
    const stored = await chrome.storage.local.get(RECENT_KEY);
    const list = [goal, ...(stored[RECENT_KEY] || []).filter((g) => g !== goal)].slice(0, RECENT_MAX);
    await chrome.storage.local.set({ [RECENT_KEY]: list });
    renderRecent(list);
  } catch (err) {
    console.error('Jev: could not save recent goal', err);
  }
}

function renderRecent(list) {
  ui.recentList.replaceChildren(...list.map((goal) => {
    const button = el('button', 'ghost small', goal);
    button.type = 'button';
    button.addEventListener('click', () => { ui.goal.value = goal; ui.goal.focus(); });
    return append(el('li'), button);
  }));
}

/* ---- rendering ---- */

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function statusText(r) {
  if (!r) return 'Type a goal and press Run. Jev will click, type and scroll in the current tab.';
  const where = r.visited?.length ? hostOf(r.visited[r.visited.length - 1]) : '';
  const base = `Step ${r.step} of ${r.maxSteps}${where ? ` · ${where}` : ''}`;
  if (r.status === 'running') return `${base} · ${r.message || 'working…'}`;
  if (r.status === 'paused') return `${base} · ${r.message}`;
  if (r.status === 'waiting') return `${base} · needs you`;
  return `${base} · ${r.status}`;
}

function meter(label, value, tone) {
  const fill = el('span', 'fill');
  fill.style.width = `${Math.max(0, Math.min(100, (Number(value) || 0) * 100))}%`;
  return append(el('div', `meter ${tone || ''}`), el('span', null, label), append(el('span', 'track'), fill), el('span', 'val', pct(value)));
}

function stepItem(s) {
  const head = append(el('div', 'head'), el('span', 'n', `#${s.n}`), el('span', 'summary', s.summary), el('span', 'lat', `${s.ms} ms`));
  const meters = append(el('div', 'meters'),
    meter('action', s.actionConfidence, 'conf'),
    s.targetConfidence != null ? meter('target', s.targetConfidence, 'conf') : null,
    meter('done?', s.goalDone, 'done'),
    meter('stuck?', s.stuck, 'stuck'));
  const failed = String(s.effect || '').startsWith('failed');
  const source = s.source ? el('span', 'src', `text from ${s.source}`) : null;
  return append(el('li', 'step'), head, meters, el('div', failed ? 'effect failed' : 'effect', s.effect), source);
}

function renderWaiting(r) {
  const waiting = r?.status === 'waiting' ? r.waiting : null;
  ui.waiting.hidden = !waiting;
  if (!waiting) return;
  ui.waitPrompt.textContent = waiting.prompt;
  const wantsText = waiting.kind === 'text';
  ui.waitText.hidden = !wantsText;
  ui.waitConfirm.hidden = wantsText;
  if (wantsText) {
    ui.waitInput.value = '';
    ui.waitInput.focus();
  }
}

function renderOutcome(r) {
  const ended = r && !ACTIVE.has(r.status);
  ui.outcome.hidden = !ended;
  if (!ended) return;
  ui.outcome.className = `outcome ${r.status}`;
  const heading = { done: 'Done', blocked: 'Blocked', stopped: 'Stopped', error: 'Something went wrong' }[r.status] || r.status;
  const notes = (r.notes || []).map((n) => el('div', 'fine', `Note: ${n}`));
  ui.outcome.replaceChildren(el('div', null, heading), el('div', 'fine', r.message || ''), ...notes);
}

export function render(next) {
  run = next;
  const active = Boolean(run) && ACTIVE.has(run.status);
  ui.status.textContent = statusText(run);
  ui.run.disabled = active;
  ui.step.disabled = Boolean(run) && (run.status === 'running' || run.status === 'waiting');
  ui.step.textContent = run?.status === 'paused' ? 'Next step' : 'Step';
  ui.stop.disabled = !active;
  ui.goal.disabled = active;
  if (run && !ui.goal.value) ui.goal.value = run.goal;
  ui.steps.replaceChildren(...(run?.steps || []).map(stepItem));
  renderWaiting(run);
  renderOutcome(run);
}

/* ---- actions ---- */

async function start(mode) {
  const goal = ui.goal.value.trim();
  if (!goal) return showError('Type a goal first.');
  showError('');
  try {
    await send({ type: 'run:start', goal, mode });
    await addRecent(goal);
  } catch (err) {
    showError(err.message);
  }
}

async function onStep() {
  if (run?.status === 'paused') {
    try { await send({ type: 'run:step' }); } catch (err) { showError(err.message); }
    return;
  }
  await start('step');
}

async function answer(payload) {
  try {
    await send({ type: 'run:answer', ...payload });
  } catch (err) {
    showError(err.message);
  }
}

async function copyTrace() {
  try {
    const { trace } = await send({ type: 'run:trace' });
    if (!trace) throw new Error('No run to copy yet.');
    await navigator.clipboard.writeText(trace);
    ui.traceStatus.textContent = 'Copied';
  } catch (err) {
    ui.traceStatus.textContent = err.message;
  }
  setTimeout(() => { ui.traceStatus.textContent = ''; }, 2500);
}

function bindEvents() {
  ui.examples.replaceChildren(ui.examples.firstElementChild, ...EXAMPLES.map((g) => new Option(g, g)));
  ui.examples.addEventListener('change', () => {
    if (ui.examples.value) ui.goal.value = ui.examples.value;
    ui.examples.value = '';
  });
  ui.run.addEventListener('click', () => start('run'));
  ui.step.addEventListener('click', onStep);
  ui.stop.addEventListener('click', () => send({ type: 'run:stop' }).catch((err) => showError(err.message)));
  ui.goal.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); start('run'); }
  });
  ui.waitSend.addEventListener('click', () => answer({ ok: true, value: ui.waitInput.value }));
  ui.waitInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') answer({ ok: true, value: ui.waitInput.value }); });
  ui.waitYes.addEventListener('click', () => answer({ ok: true }));
  ui.waitNo.addEventListener('click', () => answer({ ok: false }));
  ui.copyTrace.addEventListener('click', copyTrace);
  chrome.runtime.onMessage.addListener((msg) => { if (msg?.type === 'run:update') render(msg.run); });
}

export async function initDrive() {
  bindEvents();
  await loadRecent();
  try {
    const { run: current } = await send({ type: 'run:get' });
    render(current);
  } catch (err) {
    render(null);
    showError(err.message);
  }
}
