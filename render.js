// Turns Jev answers into readable cards. Builds DOM nodes directly — never
// injects API or page text as HTML.

const YES_THRESHOLD = 0.8;
const NO_THRESHOLD = 0.2;
const LOW_CONFIDENCE = 0.6;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function append(parent, ...children) {
  children.filter(Boolean).forEach((child) => parent.appendChild(child));
  return parent;
}

const fmt = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '–');
const pct = (n) => `${Math.max(0, Math.min(100, (Number(n) || 0) * 100))}%`;

function humanise(id) {
  const words = String(id).replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function barRow(label, value, isTop) {
  const fill = el('span', 'bar-fill');
  fill.style.width = pct(value);
  return append(
    el('div', isTop ? 'bar on' : 'bar'),
    el('span', 'bar-label', label),
    append(el('span', 'bar-track'), fill),
    el('span', 'bar-val', fmt(value)),
  );
}

function confidenceNote(confidence) {
  if (confidence == null) return null;
  const isLow = Number(confidence) < LOW_CONFIDENCE;
  return el('span', isLow ? 'conf low' : 'conf', `${isLow ? 'unsure · ' : ''}confidence ${fmt(confidence)}`);
}

function noulVerdict(value) {
  if (value >= YES_THRESHOLD) return { word: 'Yes', tone: 'yes' };
  if (value <= NO_THRESHOLD) return { word: 'No', tone: 'no' };
  return { word: 'Unsure', tone: 'maybe' };
}

function renderNoul(answer) {
  const value = Number(answer.noul) || 0;
  const verdict = noulVerdict(value);
  const fill = el('span', `meter-fill ${verdict.tone}`);
  fill.style.width = pct(value);
  return {
    verdict: append(el('div', `verdict ${verdict.tone}`), el('strong', null, verdict.word), el('span', 'num', fmt(value))),
    detail: append(el('div', 'meter'), fill),
  };
}

function renderChoice(answer, question) {
  const probs = answer.probabilities || {};
  const criteria = (question && question.criteria) || {};
  const keys = Object.keys(probs).sort((a, b) => (probs[b] || 0) - (probs[a] || 0));
  const description = criteria[answer.choice];
  return {
    verdict: append(
      el('div', 'verdict pick'),
      el('strong', null, humanise(answer.choice)),
      confidenceNote(answer.confidence),
    ),
    detail: append(
      el('div'),
      description ? el('p', 'desc', description) : null,
      append(el('div', 'bars'), ...keys.map((k) => barRow(humanise(k), probs[k], k === answer.choice))),
    ),
  };
}

function renderScore(answer, question) {
  const probs = answer.probabilities || {};
  const levels = Array.isArray(question && question.criteria) ? question.criteria : [];
  const keys = Object.keys(probs).sort((a, b) => Number(a) - Number(b));
  const score = Number(answer.score) || 0;
  const label = levels[Math.round(score)] || `Level ${fmt(score)}`;
  const top = keys.length ? Number(keys[keys.length - 1]) : levels.length - 1;
  const bestKey = keys.reduce((best, k) => ((probs[k] || 0) > (probs[best] || -1) ? k : best), keys[0]);
  return {
    verdict: append(
      el('div', 'verdict pick'),
      el('strong', null, label),
      el('span', 'num', `${fmt(score)} of 0–${top}`),
      confidenceNote(answer.confidence),
    ),
    detail: append(el('div', 'bars'), ...keys.map((k) => barRow(levels[Number(k)] || k, probs[k], k === bestKey))),
  };
}

const RENDERERS = Object.freeze({ noul: renderNoul, choice: renderChoice, score: renderScore });

function renderAnswer(id, answer, question) {
  const type = (answer && answer.type) || 'unknown';
  const renderer = RENDERERS[type];
  const parts = renderer
    ? renderer(answer, question)
    : { verdict: null, detail: el('pre', null, JSON.stringify(answer, null, 2)) };

  return append(
    el('article', 'card'),
    append(el('header'), el('span', 'q', (question && question.instructions) || humanise(id)), el('span', 'tag', type)),
    parts.verdict,
    parts.detail,
  );
}

export function renderResults(container, { data, ms }, questions) {
  const asked = Object.keys(questions);
  const returned = Object.keys(data.answers);
  const order = [
    ...asked.filter((k) => returned.includes(k)),
    ...returned.filter((k) => !asked.includes(k)),
  ];

  const meta = [data.model, data.usage?.input_tokens != null ? `${data.usage.input_tokens} tokens in` : null, `${ms} ms`]
    .filter(Boolean)
    .join(' · ');

  const raw = append(el('details', 'raw'), el('summary', null, 'Raw response'), el('pre', null, JSON.stringify(data, null, 2)));

  container.replaceChildren(
    ...order.map((id) => renderAnswer(id, data.answers[id], questions[id])),
    el('p', 'meta', meta),
    raw,
  );
}

export function renderError(container, err) {
  const box = append(el('div', 'error'), el('strong', null, err.message || 'Something went wrong.'));
  if (err.detail && err.detail !== err.message) {
    append(box, append(el('details'), el('summary', null, 'Details'), el('pre', null, String(err.detail).slice(0, 2000))));
  }
  container.replaceChildren(box);
}

export function renderLoading(container) {
  container.replaceChildren(append(el('div', 'loading'), el('span', 'spinner'), el('span', null, 'Asking Jev…')));
}

export function renderEmpty(container) {
  container.replaceChildren(
    el('p', 'empty', 'Highlight text on any page, right-click and choose "Ask Jev", or paste text above and press Ask.'),
  );
}
