// The Drive agent. One run at a time: read the page → ask Jev → check the
// answer → act → wait for the page to settle → repeat. Pauses for the person
// when Jev is unsure, when a click looks risky, or when text is needed.

import { loadSettings, isBlockedHost, parseList } from '../shared/settings.js';
import {
  ACTIONS, selectCandidates, quotedStrings, buildState, buildQuestions, parseAnswers,
  isRiskyElement, detectLoop, describeEffect, summariseAction, elementKey, DecisionError,
} from '../shared/decision.js';
import { askTypeSafe, TypeSafeError } from '../shared/typesafe.js';
import { sendToTab, waitForTabLoad, isDrivableUrl, hostOf } from './tabs.js';
import { TrustedInput } from './input.js';
import { resolveTypedText } from './typer.js';

const NO_CHANGE_LIMIT = 3;
const VETO_THRESHOLD = 0.5;
const WAIT_ACTION_MS = 1000;
const NAV_GRACE_MS = 150;
const LOAD_TIMEOUT_MS = 8000;
const TARGET_FAIL_LIMIT = 2;
const TOP_PROBS = 5;
const KEEPALIVE_MS = 20000;
const ATTACH_SETTLE_MS = 300;
const PAUSED_MESSAGE = 'Paused. Press Step for the next action.';
const GATED_ACTIONS = new Set([ACTIONS.CLICK, ACTIONS.TYPE, ACTIONS.SELECT]);
const ENDED = new Set(['done', 'blocked', 'stopped', 'error']);

const trusted = new TrustedInput();
const listeners = new Set();
let run = null;
let settings = null;
let pending = null; // decision waiting on the person
let stopRequested = false;
let newTabId = null;
let busy = false;
let keepalive = null;

/* ---- public API ---- */

export function onRunChange(fn) { listeners.add(fn); }
export function currentRun() { return run; }
export function isActive() { return Boolean(run) && !ENDED.has(run.status); }

export async function startRun({ goal, mode, tab }) {
  if (isActive()) throw new Error('A run is already in progress. Stop it first.');
  settings = await loadSettings();
  const text = String(goal || '').trim();
  if (!text) throw new Error('Type a goal first.');
  if (!settings.typesafe.apiKey) throw new Error('Add your TypeSafe API key in Options first.');
  if (!tab || !isDrivableUrl(tab.url)) throw new Error('Jev can only drive normal web pages. Open a website in this tab first.');
  if (isBlockedHost(hostOf(tab.url), settings.drive.blockedSites)) throw new Error(`${hostOf(tab.url)} is on your blocked sites list.`);

  stopRequested = false;
  pending = null;
  newTabId = null;
  run = null;
  setRun({
    id: Date.now().toString(36), goal: text, mode: mode === 'step' ? 'step' : 'run',
    tabId: tab.id, openerTabId: null, status: 'running', message: 'Starting…',
    step: 0, maxSteps: settings.drive.maxSteps, steps: [], notes: [], history: [], visited: [tab.url],
    targets: [], targetFailures: {}, noChange: 0, vetoedDone: false, vetoedBlocked: false,
    loopWarnings: {}, retried: false, waiting: null, trusted: settings.drive.trustedInput,
    startedAt: Date.now(), endedAt: null,
  });
  startKeepalive();
  loop();
  return run;
}

export async function stepRun() {
  if (!run || run.status !== 'paused') throw new Error('Nothing is paused.');
  setRun({ status: 'running', waiting: null, message: 'Running one step…' });
  loop();
}

export async function stopRun() {
  if (!isActive()) return;
  stopRequested = true;
  if (run.status !== 'running') end('stopped', 'Stopped.');
}

export async function answerRun({ ok, value }) {
  if (!run || run.status !== 'waiting' || !pending) {
    throw new Error(run && ENDED.has(run.status) ? 'That run has already ended. Start a new one.' : 'Jev is not waiting for an answer.');
  }
  const decision = pending;
  pending = null;
  if (ok === false) return end('stopped', 'Stopped at your request.');
  if (decision.waitKind === 'text') {
    decision.value = String(value ?? '').trim();
    decision.source = 'user';
    if (!decision.value) return end('stopped', 'No text was given.');
  }
  decision.passed.add(decision.waitKind);
  setRun({ status: 'running', waiting: null, message: 'Continuing…' });
  return resume(decision);
}

export function exportTrace() {
  if (!run) return null;
  const { goal, mode, status, message, startedAt, endedAt, steps, notes, history, visited } = run;
  return JSON.stringify({
    version: 2, goal, mode, status, message, startedAt, endedAt, steps, notes, history, visited,
    settings: settings ? {
      model: settings.typesafe.model, maxSteps: settings.drive.maxSteps,
      trustedInput: settings.drive.trustedInput, textHelper: settings.textModel.mode,
    } : null,
  }, null, 2);
}

/* ---- run state ---- */

function setRun(patch) {
  run = { ...run, ...patch };
  listeners.forEach((fn) => fn(run));
  // Kept in session storage so a recycled service worker can recover cleanly.
  chrome.storage.session.set({ run }).catch((err) => console.debug('Jev: could not save run state', err?.message || err));
}
const note = (text) => setRun({ notes: [...run.notes, text] });
const remember = (line) => setRun({ history: [...run.history, line] });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pct = (v) => `${Math.round(v * 100)}%`;
const topProbs = (probs) => Object.entries(probs || {}).sort((a, b) => b[1] - a[1]).slice(0, TOP_PROBS)
  .map(([key, p]) => ({ key, p }));

function quiet(promise, what) {
  return Promise.resolve(promise).catch((err) => {
    console.debug(`Jev: ${what} skipped`, err?.message || err);
    return null;
  });
}

function startKeepalive() {
  clearInterval(keepalive);
  keepalive = setInterval(() => {
    if (!isActive()) return clearInterval(keepalive);
    chrome.runtime.getPlatformInfo().catch(() => {});
  }, KEEPALIVE_MS);
}

function end(status, message) {
  if (!run || ENDED.has(run.status)) return;
  pending = null;
  clearInterval(keepalive);
  setRun({ status, message, waiting: null, endedAt: Date.now() });
  quiet(trusted.detach(), 'detach');
  quiet(sendToTab(run.tabId, { type: 'jev:cleanup' }, { inject: false }), 'cleanup');
}

function friendly(err) {
  if (err instanceof TypeSafeError) return err.message;
  if (err instanceof DecisionError) return `Jev gave an answer the extension could not use: ${err.message}`;
  const text = String(err?.message || err);
  if (/No tab with id/i.test(text)) return 'The tab being driven was closed.';
  if (/Cannot access|chrome:\/\/|extensions gallery/i.test(text)) return 'Chrome does not let extensions act on this page.';
  return text;
}

/* ---- the loop ---- */

async function guarded(work) {
  if (busy) return false;
  busy = true;
  try {
    return await work();
  } catch (err) {
    console.error('Jev run failed', err);
    end('error', friendly(err));
    return false;
  } finally {
    busy = false;
  }
}

function loop() {
  return guarded(async () => {
    while (run.status === 'running') {
      if (stopRequested) return end('stopped', 'Stopped.');
      if (run.step >= run.maxSteps) return end('blocked', `Reached the limit of ${run.maxSteps} steps.`);
      const decision = await decide();
      if (!decision) continue;
      if (!(await gate(decision))) return false;
      await act(decision);
      if (run.status !== 'running') return false;
      if (run.mode === 'step') return setRun({ status: 'paused', message: PAUSED_MESSAGE });
      await sleep(settings.drive.stepDelayMs);
    }
    return false;
  });
}

async function resume(decision) {
  const carryOn = await guarded(async () => {
    if (!(await gate(decision))) return false;
    await act(decision);
    if (run.status !== 'running') return false;
    if (run.mode === 'step') {
      setRun({ status: 'paused', message: PAUSED_MESSAGE });
      return false;
    }
    return true;
  });
  if (carryOn) loop();
}

/* ---- decide ---- */

async function decide() {
  const { drive, typesafe } = settings;
  await waitForTabLoad(run.tabId, LOAD_TIMEOUT_MS);
  // Attach before measuring anything: Chrome's "started debugging" bar shifts the page.
  if (run.trusted && (await attachTrusted())) await sleep(ATTACH_SETTLE_MS);
  const snap = await snapshot();
  const host = hostOf(snap.url);
  if (isBlockedHost(host, drive.blockedSites)) {
    end('blocked', `${host} is on your blocked sites list, so the run stopped there.`);
    return null;
  }
  const usable = snap.elements.filter((el) => (run.targetFailures[elementKey(el)] || 0) < TARGET_FAIL_LIMIT);
  const candidates = selectCandidates(usable, drive.maxElements);
  const quoted = quotedStrings(run.goal);
  const questions = buildQuestions({ snapshot: snap, candidates, quoted });
  const state = buildState({ goal: run.goal, snapshot: snap, candidates, history: run.history, visited: run.visited, notes: run.notes });

  if (drive.badges) {
    const items = candidates.filter((c) => c.inView).map(({ id, rect }) => ({ id, rect }));
    await quiet(sendToTab(run.tabId, { type: 'jev:badges', items }), 'badges');
  }
  await status(`Step ${run.step + 1} · asking Jev…`);

  const { data, ms } = await askTypeSafe({ ...typesafe, state, questions });
  let decision;
  try {
    decision = parseAnswers(data.answers, questions, candidates);
  } catch (err) {
    if (!(err instanceof DecisionError) || run.retried) throw err;
    setRun({ retried: true });
    note(`Jev's last answer could not be used (${err.message}); asked again.`);
    return null;
  }
  setRun({ retried: false });
  if (!passesVetoes(decision)) return null;
  return { ...decision, snap, candidates, quoted, ms, passed: new Set(), value: null, source: null, waitKind: null };
}

function passesVetoes(d) {
  if (d.action === ACTIONS.DONE && d.goalDone < VETO_THRESHOLD && !run.vetoedDone) {
    setRun({ vetoedDone: true });
    note(`A "done" was withheld: the goal check only gave ${pct(d.goalDone)}. Keep going until the page shows the task achieved.`);
    remember(`done withheld (goal check ${pct(d.goalDone)})`);
    return false;
  }
  if (d.action === ACTIONS.BLOCKED && d.stuck < VETO_THRESHOLD && !run.vetoedBlocked) {
    setRun({ vetoedBlocked: true });
    note(`A "blocked" was withheld: the stuck check only gave ${pct(d.stuck)}. Try another offered operation first.`);
    remember(`blocked withheld (stuck check ${pct(d.stuck)})`);
    return false;
  }
  const key = elementKey(d.targetElement);
  if (key && detectLoop(run.targets, key)) {
    if (run.loopWarnings[key]) {
      end('blocked', `Kept returning to ${d.targetLabel} without finishing the task.`);
      return false;
    }
    setRun({ loopWarnings: { ...run.loopWarnings, [key]: 1 } });
    note(`${d.targetLabel} has been used repeatedly without finishing the task; choose something else.`);
    return false;
  }
  return true;
}

/* ---- gate: things that pause for the person ---- */

async function gate(d) {
  const { drive, textModel } = settings;

  if (d.action === ACTIONS.TYPE && d.value == null) {
    const result = await resolveTypedText({
      goal: run.goal, field: d.targetLabel, pageText: d.snap.text,
      quoted: d.quoted, typeValueKey: d.typeValueKey, textModel,
    });
    if (result.needUser) return waitFor(d, 'text', `What should Jev type into ${d.targetLabel}?`);
    d.value = result.value;
    d.source = result.source;
  }
  if (d.action === ACTIONS.SELECT && d.value == null) {
    d.optionIndex = await chooseOption(d);
    d.value = d.targetElement.options[d.optionIndex];
  }

  if (!d.passed.has('unsure') && run.mode === 'run' && drive.askBelow > 0 && GATED_ACTIONS.has(d.action)) {
    const confidence = Math.min(d.actionConfidence, d.targetConfidence ?? 1);
    if (confidence < drive.askBelow) {
      return waitFor(d, 'unsure', `Jev is only ${pct(confidence)} sure about this step: ${summariseAction(d, d.value)}. Do it?`);
    }
  }
  if (!d.passed.has('confirm') && d.action === ACTIONS.CLICK && drive.confirmRisky
    && isRiskyElement(d.targetElement, parseList(drive.riskyWords))) {
    return waitFor(d, 'confirm', `This click may buy, pay, send, post or delete: ${d.targetLabel}. Go ahead?`);
  }
  return true;
}

function waitFor(d, kind, prompt) {
  d.waitKind = kind;
  pending = d;
  setRun({ status: 'waiting', waiting: { kind, prompt, label: d.targetLabel }, message: 'Waiting for you.' });
  return false;
}

async function chooseOption(d) {
  const options = d.targetElement.options || [];
  if (!options.length) throw new Error(`${d.targetLabel} has no options to choose from.`);
  const questions = {
    option: {
      type: 'choice',
      instructions: `Which option of the dropdown ${d.targetLabel} best serves the task?`,
      criteria: Object.fromEntries(options.map((o, i) => [`o${i}`, o])),
    },
  };
  const state = { task: run.goal, dropdown: d.targetLabel, options, page_title: d.snap.title };
  const { data } = await askTypeSafe({ ...settings.typesafe, state, questions });
  const index = Number(String(data.answers?.option?.choice ?? '').replace(/^o/, ''));
  if (!options[index]) throw new DecisionError('Jev did not pick a valid dropdown option.', data.answers);
  return index;
}

/* ---- act ---- */

async function act(d) {
  const summary = summariseAction(d, d.value);
  await status(`Step ${run.step + 1} · ${summary}`);

  if (d.action === ACTIONS.DONE || d.action === ACTIONS.BLOCKED) {
    record(d, summary, d.action);
    const message = d.action === ACTIONS.DONE
      ? 'Jev reports the task is complete. Check the page to be sure.'
      : 'Jev reports it cannot make progress on this page.';
    return end(d.action, message);
  }

  const before = await fingerprint();
  const outcome = await perform(d);
  if (!outcome.ok) return targetFailed(d, summary, outcome.reason);

  await settle();
  const after = await fingerprint();
  const effect = describeEffect(before, after);
  remember(`${summary} → ${effect}`);
  record(d, summary, effect);

  const key = elementKey(d.targetElement);
  const freshUrl = Boolean(after.url) && !run.visited.includes(after.url);
  setRun({
    visited: freshUrl ? [...run.visited, after.url] : run.visited,
    noChange: effect === 'no visible change' ? run.noChange + 1 : 0,
    // Reaching a new page is progress, not a loop, even through the same control ("Next page").
    targets: key && !freshUrl ? [...run.targets, key] : run.targets,
  });
  if (run.noChange >= NO_CHANGE_LIMIT) end('blocked', `${NO_CHANGE_LIMIT} actions in a row changed nothing on the page.`);
}

function record(d, summary, effect) {
  const entry = {
    n: run.step + 1, action: d.action, summary, targetLabel: d.targetLabel, value: d.value, source: d.source,
    actionConfidence: d.actionConfidence, targetConfidence: d.targetConfidence,
    actionProbs: topProbs(d.actionProbs), targetProbs: topProbs(d.targetProbs),
    goalDone: d.goalDone, stuck: d.stuck, ms: d.ms, effect, url: d.snap.url, at: Date.now(),
  };
  setRun({ steps: [...run.steps, entry], step: run.step + 1 });
}

function targetFailed(d, summary, reason) {
  const key = elementKey(d.targetElement);
  const failures = { ...run.targetFailures, [key]: (run.targetFailures[key] || 0) + 1 };
  remember(`${summary} → failed: ${reason}`);
  record(d, summary, `failed: ${reason}`);
  setRun({ targetFailures: failures });
  if (failures[key] >= TARGET_FAIL_LIMIT) note(`${d.targetLabel} could not be used (${reason}) and is no longer offered.`);
}

async function perform(d) {
  const { action, targetId, value, optionIndex } = d;
  switch (action) {
    case ACTIONS.CLICK: return clickTarget(targetId);
    case ACTIONS.TYPE: return typeTarget(targetId, value);
    case ACTIONS.SELECT: return sendToTab(run.tabId, { type: 'jev:execute', action, id: targetId, value, index: optionIndex });
    case ACTIONS.SCROLL_DOWN:
    case ACTIONS.SCROLL_UP: return sendToTab(run.tabId, { type: 'jev:execute', action });
    case ACTIONS.PRESS_ENTER: return pressEnter();
    case ACTIONS.GO_BACK: await chrome.tabs.goBack(run.tabId); return { ok: true };
    case ACTIONS.WAIT: await sleep(WAIT_ACTION_MS); return { ok: true };
    default: return { ok: false, reason: `Unknown action "${action}".` };
  }
}

async function attachTrusted() {
  try {
    return await trusted.attach(run.tabId);
  } catch (err) {
    console.error('Jev: trusted input could not attach, falling back to synthetic events', err);
    setRun({ trusted: false });
    note('Trusted input could not attach; using synthetic events instead.');
    return false;
  }
}

async function useTrusted(work) {
  if (!run.trusted) return false;
  try {
    await trusted.attach(run.tabId);
    await work();
    return true;
  } catch (err) {
    console.error('Jev: trusted input failed, falling back to synthetic events', err);
    setRun({ trusted: false });
    note('Trusted input failed; using synthetic events from now on.');
    return false;
  }
}

async function clickTarget(id) {
  const prep = await sendToTab(run.tabId, { type: 'jev:prepare', id });
  if (!prep.ok) return prep;
  if (await useTrusted(() => trusted.click(prep.x, prep.y))) return { ok: true };
  return sendToTab(run.tabId, { type: 'jev:execute', action: 'click', id });
}

async function typeTarget(id, value) {
  const prep = await sendToTab(run.tabId, { type: 'jev:prepare', id });
  if (!prep.ok) return prep;
  if (run.trusted && (await useTrusted(() => trusted.click(prep.x, prep.y)))) {
    const focus = await sendToTab(run.tabId, { type: 'jev:focus', id });
    if (!focus.ok) return focus;
    if (await useTrusted(() => trusted.insertText(value))) return { ok: true };
  }
  return sendToTab(run.tabId, { type: 'jev:execute', action: 'type', id, value });
}

async function pressEnter() {
  if (await useTrusted(() => trusted.pressEnter())) return { ok: true };
  return sendToTab(run.tabId, { type: 'jev:execute', action: 'press_enter' });
}

/* ---- page helpers ---- */

async function snapshot() {
  const reply = await sendToTab(run.tabId, { type: 'jev:snapshot', maxText: settings.drive.maxTextChars });
  if (!reply?.ok) throw new Error(reply?.reason || 'Could not read the page.');
  return reply.snapshot;
}

async function fingerprint() {
  const reply = await quiet(sendToTab(run.tabId, { type: 'jev:fingerprint' }), 'fingerprint');
  if (reply?.ok) return { url: reply.url, hash: reply.hash };
  const tab = await chrome.tabs.get(run.tabId);
  return { url: tab.url, hash: 'unavailable' };
}

function status(text) {
  return quiet(sendToTab(run.tabId, { type: 'jev:status', text }, { inject: false }), 'status bar');
}

async function settle() {
  await sleep(NAV_GRACE_MS);
  if (newTabId != null) {
    const id = newTabId;
    newTabId = null;
    await switchTab(id, 'a new tab opened; following it');
  }
  await waitForTabLoad(run.tabId, LOAD_TIMEOUT_MS);
  await quiet(sendToTab(run.tabId, { type: 'jev:settle' }), 'settle');
}

async function switchTab(tabId, why) {
  const opener = run.tabId;
  await quiet(trusted.detach(), 'detach');
  setRun({ tabId, openerTabId: opener });
  remember(why);
  await quiet(chrome.tabs.update(tabId, { active: true }), 'activate tab');
}

/* ---- browser events ---- */

chrome.tabs.onCreated.addListener((tab) => {
  if (isActive() && tab.openerTabId === run.tabId) newTabId = tab.id;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (!isActive() || tabId !== run.tabId) return;
  if (run.openerTabId != null) {
    const opener = run.openerTabId;
    setRun({ openerTabId: null });
    switchTab(opener, 'the new tab was closed; back to the original tab');
  } else {
    end('error', 'The tab being driven was closed.');
  }
});

trusted.onLost = (reason) => {
  if (!isActive() || !run.trusted) return;
  setRun({ trusted: false });
  note(`Trusted input was switched off (${reason}); using synthetic events instead.`);
};

/* ---- recovery after the service worker restarts ---- */

async function restoreRun() {
  try {
    const { run: saved } = await chrome.storage.session.get('run');
    if (!saved || run) return;
    if (ENDED.has(saved.status)) {
      run = saved;
      return;
    }
    // The worker was recycled mid-run: the loop is gone, so close the run out honestly.
    await quiet(chrome.debugger.detach({ tabId: saved.tabId }), 'detach after restart');
    run = { ...saved, status: 'error', waiting: null, endedAt: Date.now(), message: 'The extension restarted during this run. Please start it again.' };
    await chrome.storage.session.set({ run });
  } catch (err) {
    console.error('Jev: could not restore the previous run', err);
  }
}

export const ready = restoreRun();
