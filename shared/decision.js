// Pure decision logic for the Drive agent: turns a page snapshot into the
// questions sent to Jev, and turns Jev's answers back into one validated
// action. No browser APIs here, so every function is unit-testable.

export const ACTIONS = Object.freeze({
  CLICK: 'click',
  TYPE: 'type',
  SELECT: 'select',
  SCROLL_DOWN: 'scroll_down',
  SCROLL_UP: 'scroll_up',
  PRESS_ENTER: 'press_enter',
  GO_BACK: 'go_back',
  WAIT: 'wait',
  DONE: 'done',
  BLOCKED: 'blocked',
});

// Actions that need an element, mapped to the question that names it.
export const TARGET_QUESTION = Object.freeze({
  [ACTIONS.CLICK]: 'click_target',
  [ACTIONS.TYPE]: 'type_target',
  [ACTIONS.SELECT]: 'select_target',
});

const ACTION_DESCRIPTIONS = Object.freeze({
  click: 'Click one control from the click_target list: a link, button, checkbox, radio, tab, menu item or similar',
  type: 'Type text into one text field from the type_target list; the field is focused and cleared first',
  select: 'Pick an option in one dropdown from the select_target list',
  scroll_down: 'Scroll down to reveal more of the page below the current view',
  scroll_up: 'Scroll up to reveal more of the page above the current view',
  press_enter: 'Press Enter in the focused text field to submit what was just typed',
  go_back: 'Go back to the previous page in this tab',
  wait: 'Wait a moment for the page to finish loading or changing',
  done: 'The task is already fully achieved on the current page; nothing more is needed',
  blocked: 'No offered operation can make progress: a login, CAPTCHA, error page or missing feature stands in the way',
});

const RISKY_WORDS = Object.freeze([
  'buy', 'purchase', 'pay', 'checkout', 'check out', 'place order', 'order now', 'confirm order',
  'subscribe', 'unsubscribe', 'send', 'post', 'publish', 'tweet', 'reply', 'comment',
  'delete', 'remove', 'transfer', 'book now', 'reserve', 'apply now', 'sign up', 'agree',
]);

export const DEFAULT_MAX_CANDIDATES = 120;
export const RECENT_ACTIONS_KEPT = 10;
export const VISITED_URLS_KEPT = 15;
const PROBABILITY_TOLERANCE = 0.05;
const LOOP_WINDOW = 6;
const LOOP_TIMES = 3;

export class DecisionError extends Error {
  constructor(message, detail = null) {
    super(message);
    this.name = 'DecisionError';
    this.detail = detail;
  }
}

/* ---- candidates ---- */

export function selectCandidates(elements, cap = DEFAULT_MAX_CANDIDATES) {
  const list = Array.isArray(elements) ? elements : [];
  const inView = list.filter((el) => el.inView);
  const offscreen = list.filter((el) => !el.inView);
  return [...inView, ...offscreen].slice(0, cap);
}

function shorten(text, max) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Element ids change with every snapshot; this key stays stable for the same
// control across snapshots, so loops and failures can be tracked.
export function elementKey(el) {
  return el ? `${el.role}|${el.name}|${el.href || ''}` : null;
}

export function describeElement(el) {
  const parts = [`${el.role} '${shorten(el.name || '(no label)', 80)}'`];
  if (el.kind === 'type' && el.value) parts.push(`= "${shorten(el.value, 60)}"`);
  if (el.kind === 'select' && el.value) parts.push(`= ${shorten(el.value, 60)}`);
  if (el.checked === true) parts.push('[checked]');
  if (el.checked === false && (el.role === 'checkbox' || el.role === 'radio' || el.role === 'switch')) parts.push('[unchecked]');
  if (el.href) parts.push(`→ ${shorten(el.href, 120)}`);
  if (el.section) parts.push(`(in ${shorten(el.section, 50)})`);
  if (!el.inView) parts.push('[off-screen]');
  return parts.join(' ');
}

/* ---- goal parsing ---- */

const QUOTE_RE = /"([^"]+)"|'([^']+)'|“([^”]+)”|‘([^’]+)’/g;

export function quotedStrings(goal) {
  const found = [];
  for (const m of String(goal ?? '').matchAll(QUOTE_RE)) {
    const text = (m[1] || m[2] || m[3] || m[4] || '').trim();
    if (text && !found.includes(text)) found.push(text);
  }
  return found;
}

/* ---- risk ---- */

function wordPattern(word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i');
}

export function isRiskyElement(el, extraWords = []) {
  const label = `${el?.name ?? ''} ${el?.value ?? ''}`.toLowerCase();
  if (!label.trim()) return false;
  const words = [...RISKY_WORDS, ...extraWords.map((w) => String(w).trim().toLowerCase()).filter(Boolean)];
  return words.some((w) => wordPattern(w).test(label));
}

/* ---- loops and effects ---- */

export function detectLoop(recentTargetIds, targetId, { window = LOOP_WINDOW, times = LOOP_TIMES } = {}) {
  if (!targetId) return false;
  const recent = recentTargetIds.slice(-(window - 1));
  const hits = recent.filter((id) => id === targetId).length + 1;
  return hits >= times;
}

export function describeEffect(before, after) {
  if (!before || !after) return 'unknown';
  if (before.url !== after.url) return `navigated to ${after.url}`;
  if (before.hash !== after.hash) return 'page content changed';
  return 'no visible change';
}

/* ---- state and questions ---- */

export function buildState({ goal, snapshot, candidates, history = [], visited = [], notes = [] }) {
  return {
    task: goal,
    page: { url: snapshot.url, title: snapshot.title, visible_text: snapshot.text },
    elements: candidates.map((el) => ({
      id: el.id,
      role: el.role,
      name: el.name,
      ...(el.value ? { value: el.value } : {}),
      ...(el.checked != null ? { checked: el.checked } : {}),
      ...(el.href ? { href: el.href } : {}),
      ...(el.section ? { section: el.section } : {}),
      in_view: Boolean(el.inView),
    })),
    recent_actions: history.slice(-RECENT_ACTIONS_KEPT),
    visited_urls: visited.slice(-VISITED_URLS_KEPT),
    ...(notes.length ? { notes } : {}),
  };
}

function offeredActions(snapshot, candidates) {
  const offered = [];
  if (candidates.length) offered.push(ACTIONS.CLICK);
  if (candidates.some((el) => el.kind === 'type')) offered.push(ACTIONS.TYPE);
  if (candidates.some((el) => el.kind === 'select')) offered.push(ACTIONS.SELECT);
  if (snapshot.scroll?.canDown) offered.push(ACTIONS.SCROLL_DOWN);
  if (snapshot.scroll?.canUp) offered.push(ACTIONS.SCROLL_UP);
  if (snapshot.focused?.hasText) offered.push(ACTIONS.PRESS_ENTER);
  if (snapshot.canGoBack) offered.push(ACTIONS.GO_BACK);
  offered.push(ACTIONS.WAIT, ACTIONS.DONE, ACTIONS.BLOCKED);
  return offered;
}

function targetQuestion(kind, list) {
  const verb = { click: 'clicked', type: 'typed into', select: 'changed' }[kind];
  return {
    type: 'choice',
    instructions: {
      question: `If the operation is ${kind}, which element should be ${verb}?`,
      focus: 'Prefer the element whose label, link target, current value and section best match the next thing the task needs. Off-screen elements are less likely.',
    },
    criteria: Object.fromEntries(list.map((el) => [el.id, describeElement(el)])),
  };
}

export function buildQuestions({ snapshot, candidates, quoted = [] }) {
  const offered = offeredActions(snapshot, candidates);
  const questions = {
    action: {
      type: 'choice',
      instructions: {
        question: 'Which single operation moves the task forward from the current page?',
        focus: 'Judge from the task, the visible text, the elements and what recent actions changed. Choose done only when the page already shows the task fully achieved. Choose blocked only when nothing offered can make progress.',
      },
      criteria: Object.fromEntries(offered.map((a) => [a, ACTION_DESCRIPTIONS[a]])),
    },
  };

  const byKind = (kind) => (kind === 'click' ? candidates : candidates.filter((el) => el.kind === kind));
  for (const kind of Object.keys(TARGET_QUESTION)) {
    const list = byKind(kind);
    if (list.length) questions[TARGET_QUESTION[kind]] = targetQuestion(kind, list);
  }

  if (quoted.length > 1) {
    questions.type_value = {
      type: 'choice',
      instructions: 'If the operation is type, which quoted text from the task belongs in the chosen field?',
      criteria: Object.fromEntries(quoted.map((q, i) => [`q${i}`, q])),
    };
  }

  questions.goal_done = {
    type: 'noul',
    instructions: 'Judging only from the current page, is the task already fully achieved?',
    criteria: {
      true: 'The page itself shows the end state the task asks for: the right article, result, confirmation or setting is visible now',
      false: 'Something the task asks for is still missing, not yet visible, or only partly done',
    },
  };
  questions.stuck = {
    type: 'noul',
    instructions: 'Do the recent actions show the run repeating itself or making no progress toward the task?',
    criteria: {
      true: 'The same control keeps being used, actions change nothing, or the page keeps bouncing between the same states',
      false: 'Each recent action moved the page closer to the task, or there are no recent actions yet',
    },
  };
  return questions;
}

/* ---- answers ---- */

function assertChoice(name, answer, question) {
  if (!answer || answer.type !== 'choice') throw new DecisionError(`Jev did not answer "${name}" as a choice.`, answer);
  const keys = Object.keys(question.criteria);
  if (!keys.includes(answer.choice)) throw new DecisionError(`Jev chose "${answer.choice}" for "${name}", which was not offered.`, answer);
  const probs = answer.probabilities || {};
  const values = Object.values(probs).map(Number);
  if (values.some((v) => !Number.isFinite(v) || v < 0 || v > 1)) throw new DecisionError(`Probabilities for "${name}" are out of range.`, answer);
  if (Object.keys(probs).some((k) => !keys.includes(k))) throw new DecisionError(`Probabilities for "${name}" name an unknown option.`, answer);
  const sum = values.reduce((a, b) => a + b, 0);
  if (values.length && Math.abs(sum - 1) > PROBABILITY_TOLERANCE) throw new DecisionError(`Probabilities for "${name}" sum to ${sum.toFixed(2)}, not 1.`, answer);
  return { choice: answer.choice, confidence: clamp01(answer.confidence), probabilities: probs };
}

function readNoul(name, answer) {
  if (!answer || answer.type !== 'noul') throw new DecisionError(`Jev did not answer "${name}" as a yes/no.`, answer);
  const v = Number(answer.noul);
  if (!Number.isFinite(v) || v < 0 || v > 1) throw new DecisionError(`The yes/no value for "${name}" is out of range.`, answer);
  return v;
}

function clamp01(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

export function parseAnswers(answers, questions, candidates) {
  if (!answers || typeof answers !== 'object') throw new DecisionError('Jev returned no answers.', answers);
  const action = assertChoice('action', answers.action, questions.action);

  const targetName = TARGET_QUESTION[action.choice];
  let target = null;
  if (targetName) {
    if (!questions[targetName]) throw new DecisionError(`Jev chose ${action.choice} but no ${action.choice} target was offered.`, answers);
    const picked = assertChoice(targetName, answers[targetName], questions[targetName]);
    const element = candidates.find((el) => el.id === picked.choice) || null;
    if (!element) throw new DecisionError(`Jev chose element ${picked.choice}, which is not in the snapshot.`, answers);
    target = { ...picked, element };
  }

  let typeValueKey = null;
  if (questions.type_value && answers.type_value) {
    typeValueKey = assertChoice('type_value', answers.type_value, questions.type_value).choice;
  }

  return {
    action: action.choice,
    actionConfidence: action.confidence,
    actionProbs: action.probabilities,
    targetId: target ? target.element.id : null,
    targetElement: target ? target.element : null,
    targetLabel: target ? describeElement(target.element) : null,
    targetConfidence: target ? target.confidence : null,
    targetProbs: target ? target.probabilities : null,
    typeValueKey,
    goalDone: readNoul('goal_done', answers.goal_done),
    stuck: readNoul('stuck', answers.stuck),
  };
}

export function summariseAction(decision, value) {
  const { action, targetLabel } = decision;
  if (action === ACTIONS.TYPE) return `type "${shorten(value, 40)}" into ${targetLabel}`;
  if (action === ACTIONS.SELECT) return `select "${shorten(value, 40)}" in ${targetLabel}`;
  if (targetLabel) return `${action} ${targetLabel}`;
  return action.replace('_', ' ');
}
