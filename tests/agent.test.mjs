// End-to-end tests of the Drive loop with a fake Chrome and a scripted Jev.
import { test } from 'node:test';
import assert from 'node:assert/strict';

/* ---- fake page (what the content scripts would report) ---- */

const page = { url: '', title: '', text: '', elements: [], hash: 1, actions: [] };
let onExecute = () => {};

function setPage(next) {
  Object.assign(page, { actions: [], hash: page.hash + 1 }, next);
}

async function contentReply(msg) {
  switch (msg.type) {
    case 'jev:snapshot':
      return { ok: true, snapshot: { url: page.url, title: page.title, text: page.text, elements: page.elements, scroll: { canDown: false, canUp: false }, focused: null, canGoBack: false } };
    case 'jev:fingerprint': return { ok: true, url: page.url, hash: page.hash };
    case 'jev:prepare': return { ok: true, x: 10, y: 10 };
    case 'jev:execute':
      page.actions.push(msg);
      onExecute(msg);
      return { ok: true };
    default: return { ok: true };
  }
}

/* ---- fake Chrome ---- */

const settings = {
  typesafe: { apiKey: 'test-key', model: 'jev-latest', endpoint: 'https://example.test/systemone' },
  textModel: { mode: 'ask' },
  drive: { maxSteps: 6, stepDelayMs: 0, badges: false, trustedInput: false, confirmRisky: true, riskyWords: '', askBelow: 0, blockedSites: 'bank.test', maxTextChars: 6000, maxElements: 120 },
};
const noop = { addListener() {}, removeListener() {} };
const sessionStore = {};
globalThis.chrome = {
  storage: {
    local: { get: async () => ({ settings }) },
    session: { get: async (key) => ({ [key]: sessionStore[key] }), set: async (v) => Object.assign(sessionStore, v) },
  },
  tabs: {
    sendMessage: async (_tabId, msg) => contentReply(msg),
    get: async (id) => ({ id, status: 'complete', url: page.url }),
    onUpdated: noop, onCreated: noop, onRemoved: noop,
    goBack: async () => {}, update: async () => {},
  },
  scripting: { executeScript: async () => {} },
  debugger: { onDetach: noop, attach: async () => {}, detach: async () => {}, sendCommand: async () => {} },
  runtime: { getPlatformInfo: async () => ({}) },
};

/* ---- scripted Jev ---- */

const choice = (key) => ({ type: 'choice', choice: key, confidence: 0.9, probabilities: { [key]: 1 } });
const noul = (v) => ({ type: 'noul', noul: v });
let script = [];
const requests = [];
globalThis.fetch = async (_url, opts) => {
  const body = JSON.parse(opts.body);
  requests.push(body);
  const next = script.shift();
  if (!next) throw new Error('Jev script exhausted');
  return new Response(JSON.stringify({ model: 'jev-test', answers: next(body.questions) }), { status: 200 });
};

const agent = await import('../bg/agent.js');
const tab = { id: 7, url: 'https://site.test/' };

async function until(predicate, ms = 2000) {
  const start = Date.now();
  while (!predicate(agent.currentRun())) {
    if (Date.now() - start > ms) throw new Error(`Timed out; run is ${JSON.stringify(agent.currentRun()?.status)}`);
    await new Promise((r) => setTimeout(r, 5));
  }
  return agent.currentRun();
}
const ended = (r) => r && ['done', 'blocked', 'stopped', 'error'].includes(r.status);

const link = { id: 'e1', role: 'link', name: 'Espresso', kind: 'click', inView: true, href: 'https://site.test/espresso' };
const box = { id: 'e1', role: 'textbox', name: 'Search', kind: 'type', inView: true };

test('clicks a link, sees the navigation, then finishes when the goal check agrees', async () => {
  setPage({ url: 'https://site.test/', title: 'Home', text: 'Coffee list', elements: [link] });
  onExecute = (msg) => { if (msg.action === 'click') setPage({ url: 'https://site.test/espresso', title: 'Espresso', text: 'Espresso article', elements: [] }); };
  script = [
    () => ({ action: choice('click'), click_target: choice('e1'), goal_done: noul(0.05), stuck: noul(0.02) }),
    () => ({ action: choice('done'), goal_done: noul(0.95), stuck: noul(0.02) }),
  ];
  await agent.startRun({ goal: 'Open the Espresso article', mode: 'run', tab });
  const run = await until(ended);
  assert.equal(run.status, 'done');
  assert.equal(run.steps.length, 2);
  assert.equal(run.steps[0].action, 'click');
  assert.equal(run.steps[0].effect, 'navigated to https://site.test/espresso');
  assert.deepEqual(run.visited, ['https://site.test/', 'https://site.test/espresso']);
  assert.equal(requests[0].state.task, 'Open the Espresso article');
});

test('withholds a premature done once, then accepts it', async () => {
  setPage({ url: 'https://site.test/', title: 'Home', text: 'x', elements: [link] });
  script = [
    () => ({ action: choice('done'), click_target: choice('e1'), goal_done: noul(0.2), stuck: noul(0.1) }),
    () => ({ action: choice('done'), click_target: choice('e1'), goal_done: noul(0.2), stuck: noul(0.1) }),
  ];
  await agent.startRun({ goal: 'g', mode: 'run', tab });
  const run = await until(ended);
  assert.equal(run.status, 'done');
  assert.equal(run.steps.length, 1);
  assert.match(run.notes[0], /"done" was withheld/);
  assert.match(requests.at(-1).state.notes[0], /withheld/);
});

test('types text quoted in the goal without asking anyone', async () => {
  setPage({ url: 'https://site.test/', title: 'Home', text: 'x', elements: [box] });
  onExecute = () => setPage({ url: 'https://site.test/?q=espresso', title: 'Results', text: 'results', elements: [] });
  script = [
    () => ({ action: choice('type'), type_target: choice('e1'), click_target: choice('e1'), goal_done: noul(0.1), stuck: noul(0.1) }),
    () => ({ action: choice('done'), goal_done: noul(0.9), stuck: noul(0.1) }),
  ];
  await agent.startRun({ goal: 'search for "espresso"', mode: 'run', tab });
  const run = await until(ended);
  assert.equal(run.status, 'done');
  assert.equal(run.steps[0].value, 'espresso');
  assert.equal(run.steps[0].source, 'goal');
  assert.equal(page.actions.length, 0); // the results page recorded no further actions
});

test('asks the person for text when the goal has none, then continues with their answer', async () => {
  setPage({ url: 'https://site.test/', title: 'Home', text: 'x', elements: [box] });
  const typed = [];
  onExecute = (msg) => { typed.push(msg.value); setPage({ url: 'https://site.test/done', title: 'Done', text: 'done', elements: [] }); };
  script = [
    () => ({ action: choice('type'), type_target: choice('e1'), click_target: choice('e1'), goal_done: noul(0.1), stuck: noul(0.1) }),
    () => ({ action: choice('done'), goal_done: noul(0.9), stuck: noul(0.1) }),
  ];
  await agent.startRun({ goal: 'fill in the search box', mode: 'run', tab });
  const waiting = await until((r) => r?.status === 'waiting');
  assert.equal(waiting.waiting.kind, 'text');
  await agent.answerRun({ ok: true, value: 'latte' });
  const run = await until(ended);
  assert.equal(run.status, 'done');
  assert.deepEqual(typed, ['latte']);
  assert.equal(run.steps[0].source, 'user');
});

test('pauses before a risky click and stops when the person says no', async () => {
  const buy = { id: 'e1', role: 'button', name: 'Place order', kind: 'click', inView: true };
  setPage({ url: 'https://shop.test/cart', title: 'Cart', text: 'x', elements: [buy] });
  script = [() => ({ action: choice('click'), click_target: choice('e1'), goal_done: noul(0.1), stuck: noul(0.1) })];
  await agent.startRun({ goal: 'buy it', mode: 'run', tab });
  const waiting = await until((r) => r?.status === 'waiting');
  assert.equal(waiting.waiting.kind, 'confirm');
  await agent.answerRun({ ok: false });
  const run = await until(ended);
  assert.equal(run.status, 'stopped');
  assert.equal(page.actions.length, 0);
});

test('step mode does one action then pauses; stop ends it', async () => {
  setPage({ url: 'https://site.test/', title: 'Home', text: 'x', elements: [link] });
  onExecute = () => setPage({ url: 'https://site.test/2', title: '2', text: '2', elements: [link] });
  script = [() => ({ action: choice('click'), click_target: choice('e1'), goal_done: noul(0.1), stuck: noul(0.1) })];
  await agent.startRun({ goal: 'g', mode: 'step', tab });
  const paused = await until((r) => r?.status === 'paused');
  assert.equal(paused.steps.length, 1);
  await agent.stopRun();
  assert.equal(agent.currentRun().status, 'stopped');
});

test('refuses blocked sites and non-web pages up front', async () => {
  await assert.rejects(agent.startRun({ goal: 'g', mode: 'run', tab: { id: 1, url: 'https://online.bank.test/' } }), /blocked sites/);
  await assert.rejects(agent.startRun({ goal: 'g', mode: 'run', tab: { id: 1, url: 'chrome://extensions' } }), /normal web pages/);
});

test('stops as soon as a click lands on a blocked site', async () => {
  const bankLink = { ...link, id: 'e1', name: 'Online banking', href: 'https://online.bank.test/' };
  setPage({ url: 'https://site.test/', title: 'Home', text: 'x', elements: [bankLink] });
  onExecute = () => setPage({ url: 'https://online.bank.test/', title: 'Bank', text: 'Log in', elements: [link] });
  script = [
    () => ({ action: choice('click'), click_target: choice('e1'), goal_done: noul(0.1), stuck: noul(0.1) }),
    () => ({ action: choice('click'), click_target: choice('e1'), goal_done: noul(0.1), stuck: noul(0.1) }),
  ];
  await agent.startRun({ goal: 'check my balance', mode: 'run', tab });
  const run = await until(ended);
  assert.equal(run.status, 'blocked');
  assert.match(run.message, /blocked sites list/);
  assert.equal(run.steps.length, 1);
});

test('clicking "Next page" repeatedly is progress, not a loop', async () => {
  const next = { id: 'e1', role: 'link', name: 'Next page', kind: 'click', inView: true, href: 'https://site.test/list' };
  let pageNo = 1;
  setPage({ url: 'https://site.test/list?page=1', title: 'List', text: 'x', elements: [next] });
  onExecute = () => { pageNo += 1; setPage({ url: `https://site.test/list?page=${pageNo}`, title: 'List', text: `page ${pageNo}`, elements: [next] }); };
  const clickNext = () => ({ action: choice('click'), click_target: choice('e1'), goal_done: noul(0.1), stuck: noul(0.05) });
  script = [clickNext, clickNext, clickNext, clickNext, () => ({ action: choice('done'), goal_done: noul(0.9), stuck: noul(0.05) })];
  await agent.startRun({ goal: 'go to page 5', mode: 'run', tab });
  const run = await until(ended);
  assert.equal(run.status, 'done');
  assert.equal(run.steps.length, 5);
  assert.deepEqual(run.notes, []);
});

test('ends as blocked after three actions that change nothing', async () => {
  const other = { ...link, id: 'e2', name: 'Latte', href: 'https://site.test/latte' };
  setPage({ url: 'https://site.test/', title: 'Home', text: 'x', elements: [link, other] });
  onExecute = () => {}; // nothing changes
  const click = (id) => () => ({ action: choice('click'), click_target: choice(id), goal_done: noul(0.1), stuck: noul(0.1) });
  script = [click('e1'), click('e2'), click('e1'), click('e2')];
  await agent.startRun({ goal: 'g', mode: 'run', tab });
  const run = await until(ended);
  assert.equal(run.status, 'blocked');
  assert.match(run.message, /changed nothing/);
});
