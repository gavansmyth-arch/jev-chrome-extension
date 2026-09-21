import { PACKS, DEFAULT_PACK } from './packs.js';
import { askJev, JevError } from './api.js';
import { renderResults, renderError, renderLoading, renderEmpty } from './render.js';

const CUSTOM = 'custom';
const PENDING_KEY = 'pendingSelection';
const STATUS_CLEAR_MS = 2500;

const $ = (id) => document.getElementById(id);
const ui = {
  settings: $('settings'),
  settingsToggle: $('settingsToggle'),
  apiKey: $('apiKey'),
  revealKey: $('revealKey'),
  model: $('model'),
  saveSettings: $('saveSettings'),
  settingsStatus: $('settingsStatus'),
  state: $('state'),
  source: $('source'),
  pack: $('pack'),
  packHint: $('packHint'),
  editor: $('editor'),
  questions: $('questions'),
  questionsStatus: $('questionsStatus'),
  resetQuestions: $('resetQuestions'),
  ask: $('ask'),
  results: $('results'),
};

let settings = Object.freeze({ apiKey: '', model: 'jev-latest', pack: DEFAULT_PACK, customQuestions: null });

async function saveSettings(patch) {
  settings = Object.freeze({ ...settings, ...patch });
  try {
    await chrome.storage.local.set(settings);
  } catch (err) {
    console.error('Jev: failed to save settings', err);
    flash(ui.settingsStatus, 'Could not save settings.', true);
  }
}

function flash(node, message, isBad = false) {
  node.textContent = message;
  node.classList.toggle('bad', isBad);
  if (!isBad) setTimeout(() => { if (node.textContent === message) node.textContent = ''; }, STATUS_CLEAR_MS);
}

function toggleSettings(open) {
  ui.settings.hidden = !open;
  ui.settingsToggle.setAttribute('aria-expanded', String(open));
  if (open) ui.apiKey.focus();
}

/* ---- question packs ---- */

function currentQuestions() {
  if (settings.pack === CUSTOM && settings.customQuestions) return settings.customQuestions;
  return (PACKS[settings.pack] || PACKS[DEFAULT_PACK]).questions;
}

function populatePacks() {
  const options = [
    ...Object.entries(PACKS).map(([id, pack]) => new Option(pack.label, id)),
    new Option('Custom questions', CUSTOM),
  ];
  ui.pack.replaceChildren(...options);
}

function showPack() {
  ui.pack.value = settings.pack;
  ui.packHint.textContent = settings.pack === CUSTOM
    ? 'Your own questions — edit them below.'
    : PACKS[settings.pack]?.hint || '';
  ui.questions.value = JSON.stringify(currentQuestions(), null, 2);
  ui.questionsStatus.textContent = '';
}

function parseQuestionsEditor() {
  const parsed = JSON.parse(ui.questions.value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Questions must be a JSON object, e.g. { "is_urgent": { "type": "noul", ... } }');
  }
  return parsed;
}

function onQuestionsEdited() {
  try {
    const questions = parseQuestionsEditor();
    saveSettings({ pack: CUSTOM, customQuestions: questions });
    ui.pack.value = CUSTOM;
    ui.packHint.textContent = 'Your own questions — edit them below.';
    flash(ui.questionsStatus, 'Saved');
  } catch (err) {
    flash(ui.questionsStatus, `Invalid JSON: ${err.message}`, true);
  }
}

/* ---- asking ---- */

async function ask() {
  if (ui.ask.disabled) return;
  if (!settings.apiKey) {
    toggleSettings(true);
    renderError(ui.results, new JevError('Add your TypeSafe API key first, then press Save.'));
    return;
  }

  let questions;
  try {
    questions = ui.editor.open ? parseQuestionsEditor() : currentQuestions();
  } catch (err) {
    renderError(ui.results, new JevError(`Your questions are not valid JSON: ${err.message}`));
    return;
  }

  ui.ask.disabled = true;
  renderLoading(ui.results);
  try {
    const result = await askJev({
      apiKey: settings.apiKey,
      model: settings.model,
      state: ui.state.value,
      questions,
    });
    renderResults(ui.results, result, questions);
  } catch (err) {
    if (!(err instanceof JevError)) console.error('Jev: unexpected error', err);
    renderError(ui.results, err instanceof JevError ? err : new JevError('Something went wrong.', 0, String(err)));
  } finally {
    ui.ask.disabled = false;
  }
}

/* ---- selection hand-off from the right-click menu ---- */

function describeSource(url) {
  try {
    return url ? `From ${new URL(url).hostname}` : '';
  } catch {
    return '';
  }
}

async function takePendingSelection() {
  let pending;
  try {
    pending = (await chrome.storage.session.get(PENDING_KEY))[PENDING_KEY];
  } catch (err) {
    console.error('Jev: could not read selection', err);
    return;
  }
  if (!pending?.text) return;

  await chrome.storage.session.remove(PENDING_KEY).catch((err) => console.error('Jev: could not clear selection', err));
  ui.state.value = pending.text;
  const label = describeSource(pending.source);
  ui.source.textContent = label;
  ui.source.hidden = !label;
  if (settings.apiKey) ask();
}

/* ---- boot ---- */

function bindEvents() {
  ui.settingsToggle.addEventListener('click', () => toggleSettings(ui.settings.hidden));
  ui.revealKey.addEventListener('click', () => {
    const isHidden = ui.apiKey.type === 'password';
    ui.apiKey.type = isHidden ? 'text' : 'password';
    ui.revealKey.textContent = isHidden ? 'Hide' : 'Show';
  });
  ui.saveSettings.addEventListener('click', async () => {
    const apiKey = ui.apiKey.value.trim();
    if (!apiKey) return flash(ui.settingsStatus, 'Enter an API key.', true);
    await saveSettings({ apiKey, model: ui.model.value.trim() || 'jev-latest' });
    flash(ui.settingsStatus, 'Saved');
  });

  ui.pack.addEventListener('change', () => {
    saveSettings({ pack: ui.pack.value });
    showPack();
  });
  ui.questions.addEventListener('change', onQuestionsEdited);
  ui.resetQuestions.addEventListener('click', () => {
    saveSettings({ pack: DEFAULT_PACK, customQuestions: null });
    showPack();
  });

  ui.ask.addEventListener('click', ask);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      ask();
    }
  });
  ui.state.addEventListener('input', () => { ui.source.hidden = true; });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes[PENDING_KEY]?.newValue) takePendingSelection();
  });
}

async function init() {
  try {
    const stored = await chrome.storage.local.get(['apiKey', 'model', 'pack', 'customQuestions']);
    const pack = stored.pack === CUSTOM || PACKS[stored.pack] ? stored.pack : DEFAULT_PACK;
    settings = Object.freeze({ ...settings, ...stored, pack });
  } catch (err) {
    console.error('Jev: could not load settings', err);
  }

  ui.apiKey.value = settings.apiKey || '';
  ui.model.value = settings.model || 'jev-latest';
  populatePacks();
  showPack();
  renderEmpty(ui.results);
  bindEvents();
  if (!settings.apiKey) toggleSettings(true);
  await takePendingSelection();
}

init();
