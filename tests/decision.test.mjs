import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS, selectCandidates, describeElement, quotedStrings, isRiskyElement, detectLoop,
  describeEffect, buildState, buildQuestions, parseAnswers, summariseAction, DecisionError,
} from '../shared/decision.js';

const el = (id, over = {}) => ({ id, role: 'link', name: `Link ${id}`, kind: 'click', inView: true, ...over });

const snapshot = {
  url: 'https://en.wikipedia.org/wiki/Coffee', title: 'Coffee', text: 'Coffee is a drink.',
  scroll: { canDown: true, canUp: false }, focused: null, canGoBack: true,
};

function answersFor(questions, overrides = {}) {
  const choice = (key) => ({ type: 'choice', choice: key, confidence: 0.9, probabilities: { [key]: 1 } });
  return {
    action: choice('click'),
    click_target: choice('e1'),
    goal_done: { type: 'noul', noul: 0.1 },
    stuck: { type: 'noul', noul: 0.05 },
    ...overrides,
  };
}

test('selectCandidates puts in-view elements first and respects the cap', () => {
  const list = [el('a', { inView: false }), el('b'), el('c', { inView: false }), el('d')];
  const picked = selectCandidates(list, 3);
  assert.deepEqual(picked.map((e) => e.id), ['b', 'd', 'a']);
});

test('describeElement shows role, name, value, href and section', () => {
  const s = describeElement(el('e1', { role: 'textbox', kind: 'type', name: 'Search', value: 'espresso', section: 'Header' }));
  assert.equal(s, `textbox 'Search' = "espresso" (in Header)`);
  const link = describeElement(el('e2', { href: 'https://x.test/a', inView: false }));
  assert.match(link, /→ https:\/\/x\.test\/a \[off-screen\]$/);
});

test('quotedStrings finds straight and curly quotes without duplicates', () => {
  assert.deepEqual(quotedStrings(`search for "espresso" then type 'espresso' and “latte”`), ['espresso', 'latte']);
  assert.deepEqual(quotedStrings('no quotes here'), []);
});

test('isRiskyElement flags buying, sending and deleting but not searching', () => {
  assert.equal(isRiskyElement({ name: 'Place order' }), true);
  assert.equal(isRiskyElement({ name: 'Send message' }), true);
  assert.equal(isRiskyElement({ name: 'Delete account' }), true);
  assert.equal(isRiskyElement({ name: 'Search' }), false);
  assert.equal(isRiskyElement({ name: 'Postcode' }), false);
  assert.equal(isRiskyElement({ name: 'Launch rocket' }, ['launch']), true);
});

test('detectLoop triggers on the third use of a target within six steps', () => {
  assert.equal(detectLoop(['e1', 'e2', 'e1'], 'e1'), true);
  assert.equal(detectLoop(['e1', 'e2'], 'e1'), false);
  assert.equal(detectLoop(['e1', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6'], 'e1'), false);
  assert.equal(detectLoop([], null), false);
});

test('describeEffect reports navigation, change, or nothing', () => {
  assert.equal(describeEffect({ url: 'a', hash: 1 }, { url: 'b', hash: 1 }), 'navigated to b');
  assert.equal(describeEffect({ url: 'a', hash: 1 }, { url: 'a', hash: 2 }), 'page content changed');
  assert.equal(describeEffect({ url: 'a', hash: 1 }, { url: 'a', hash: 1 }), 'no visible change');
});

test('buildQuestions offers only actions the page supports', () => {
  const candidates = [el('e1'), el('e2', { role: 'textbox', kind: 'type', name: 'Search' })];
  const q = buildQuestions({ snapshot, candidates });
  assert.deepEqual(Object.keys(q.action.criteria), ['click', 'type', 'scroll_down', 'go_back', 'wait', 'done', 'blocked']);
  assert.deepEqual(Object.keys(q.click_target.criteria), ['e1', 'e2']);
  assert.deepEqual(Object.keys(q.type_target.criteria), ['e2']);
  assert.equal(q.select_target, undefined);
  assert.equal(q.goal_done.type, 'noul');
  assert.equal(q.stuck.type, 'noul');
});

test('buildQuestions offers press_enter only when the focused field holds text, and type_value for several quotes', () => {
  const q = buildQuestions({
    snapshot: { ...snapshot, focused: { id: 'e2', hasText: true } },
    candidates: [el('e2', { role: 'textbox', kind: 'type' })],
    quoted: ['one', 'two'],
  });
  assert.ok('press_enter' in q.action.criteria);
  assert.deepEqual(q.type_value.criteria, { q0: 'one', q1: 'two' });
});

test('buildState keeps only the last ten actions and includes compact elements', () => {
  const history = Array.from({ length: 14 }, (_, i) => `action ${i}`);
  const state = buildState({ goal: 'g', snapshot, candidates: [el('e1', { href: 'https://x' })], history, visited: ['u'] });
  assert.equal(state.recent_actions.length, 10);
  assert.equal(state.recent_actions[0], 'action 4');
  assert.deepEqual(state.elements[0], { id: 'e1', role: 'link', name: 'Link e1', href: 'https://x', in_view: true });
  assert.equal(state.notes, undefined);
});

test('parseAnswers returns the chosen action and target element', () => {
  const candidates = [el('e1'), el('e2')];
  const q = buildQuestions({ snapshot, candidates });
  const d = parseAnswers(answersFor(q), q, candidates);
  assert.equal(d.action, ACTIONS.CLICK);
  assert.equal(d.targetId, 'e1');
  assert.equal(d.targetElement.name, 'Link e1');
  assert.equal(d.goalDone, 0.1);
  assert.equal(d.stuck, 0.05);
});

test('parseAnswers rejects an action that was not offered', () => {
  const candidates = [el('e1')];
  const q = buildQuestions({ snapshot, candidates });
  const bad = answersFor(q, { action: { type: 'choice', choice: 'select', confidence: 1, probabilities: { select: 1 } } });
  assert.throws(() => parseAnswers(bad, q, candidates), DecisionError);
});

test('parseAnswers rejects a target outside the snapshot and bad probability sums', () => {
  const candidates = [el('e1')];
  const q = buildQuestions({ snapshot, candidates });
  const unknown = answersFor(q, { click_target: { type: 'choice', choice: 'e9', confidence: 1, probabilities: { e9: 1 } } });
  assert.throws(() => parseAnswers(unknown, q, candidates), /not offered/);
  const lopsided = answersFor(q, { action: { type: 'choice', choice: 'click', confidence: 1, probabilities: { click: 0.7, wait: 0.7 } } });
  assert.throws(() => parseAnswers(lopsided, q, candidates), /sum to/);
});

test('parseAnswers reads the quoted value pick', () => {
  const candidates = [el('e2', { role: 'textbox', kind: 'type' })];
  const q = buildQuestions({ snapshot, candidates, quoted: ['one', 'two'] });
  const a = answersFor(q, {
    action: { type: 'choice', choice: 'type', confidence: 0.8, probabilities: { type: 0.8, click: 0.2 } },
    type_target: { type: 'choice', choice: 'e2', confidence: 1, probabilities: { e2: 1 } },
    type_value: { type: 'choice', choice: 'q1', confidence: 0.9, probabilities: { q0: 0.1, q1: 0.9 } },
  });
  const d = parseAnswers(a, q, candidates);
  assert.equal(d.action, 'type');
  assert.equal(d.typeValueKey, 'q1');
});

test('summariseAction writes a readable line', () => {
  assert.equal(summariseAction({ action: 'type', targetLabel: `textbox 'Search'` }, 'espresso'), `type "espresso" into textbox 'Search'`);
  assert.equal(summariseAction({ action: 'scroll_down', targetLabel: null }), 'scroll down');
  assert.equal(summariseAction({ action: 'click', targetLabel: `button 'Go'` }), `click button 'Go'`);
});
