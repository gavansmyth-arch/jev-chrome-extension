// Side panel shell: the Drive / Ask tabs, the Options link, and the Ask tab
// (highlight text on a page → typed questions → readable cards).

import { PACKS, DEFAULT_PACK } from '../shared/ask-packs.js';
import { askTypeSafe, TypeSafeError } from '../shared/typesafe.js';
import { renderResults, renderError, renderLoading, renderEmpty } from '../shared/ask-render.js';
import { loadSettings, saveSettings } from '../shared/settings.js';
import { initDrive } from './drive.js';

const CUSTOM = 'custom';
const PENDING_KEY = 'pendingSelection';
const STATUS_CLEAR_MS = 2500;
const CUSTOM_HINT = 'Your own questions — edit them below.';

const $ = (id) => document.getElementById(id);
const ui = {
  tabDrive: $('tabDrive'), tabAsk: $('tabAsk'), drive: $('drive'), ask: $('ask'),
  openOptions: $('openOptions'), setupHint: $('setupHint'), setupLink: $('setupLink'),
  state: $('state'), source: $('source'), pack: $('pack'), packHint: $('packHint'), editor: $('editor'),
  questions: $('questions'), questionsStatus: $('questionsStatus'), resetQuestions: $('resetQuestions'),
  askButton: $('askButton'), results: $('results'),
};

let settings = null;

/* ---- tabs and options ---- */

function showTab(name) {
  const isDrive = name === 'drive';
  ui.drive.hidden = !isDrive;
  ui.ask.hidden = isDrive;
  ui.tabDrive.setAttribute('aria-selected', String(isDrive));
  ui.tabAsk.setAttribute('aria-selected', String(!isDrive));
  try { localStorage.setItem('tab', name); } catch { /* per-viewer convenience only */ }
}

function openOptions(e) {
  e?.preventDefault();
  chrome.runtime.openOptionsPage().catch((err) => console.error('Jev: could not open options', err));
}

/* ---- ask tab ---- */

function flash(node, message, isBad = false) {
  node.textContent = message;
  node.classList.toggle('bad', isBad);
  if (!isBad) setTimeout(() => { if (node.textContent === message) node.textContent = ''; }, STATUS_CLEAR_MS);
}

function currentQuestions() {
  if (settings.ask.pack === CUSTOM && settings.ask.customQuestions) return settings.ask.customQuestions;
  return (PACKS[settings.ask.pack] || PACKS[DEFAULT_PACK]).questions;
}

function showPack() {
  ui.pack.value = settings.ask.pack;
  ui.packHint.textContent = settings.ask.pack === CUSTOM ? CUSTOM_HINT : PACKS[settings.ask.pack]?.hint || '';
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

async function persistAsk(patch) {
  try {
    settings = await saveSettings({ ask: patch });
  } catch (err) {
    console.error('Jev: could not save Ask settings', err);
    flash(ui.questionsStatus, 'Could not save.', true);
  }
}

async function onQuestionsEdited() {
  try {
    const questions = parseQuestionsEditor();
    await persistAsk({ pack: CUSTOM, customQuestions: questions });
    ui.pack.value = CUSTOM;
    ui.packHint.textContent = CUSTOM_HINT;
    flash(ui.questionsStatus, 'Saved');
  } catch (err) {
    flash(ui.questionsStatus, `Invalid JSON: ${err.message}`, true);
  }
}

async function ask() {
  if (ui.askButton.disabled) return;
  if (!settings.typesafe.apiKey) {
    renderError(ui.results, new TypeSafeError('Add your TypeSafe API key in Options first.'));
    return;
  }
  let questions;
  try {
    questions = ui.editor.open ? parseQuestionsEditor() : currentQuestions();
  } catch (err) {
    renderError(ui.results, new TypeSafeError(`Your questions are not valid JSON: ${err.message}`));
    return;
  }
  ui.askButton.disabled = true;
  renderLoading(ui.results);
  try {
    const result = await askTypeSafe({ ...settings.typesafe, state: ui.state.value, questions });
    renderResults(ui.results, result, questions);
  } catch (err) {
    if (!(err instanceof TypeSafeError)) console.error('Jev: Ask failed', err);
    renderError(ui.results, err instanceof TypeSafeError ? err : new TypeSafeError('Something went wrong.', 0, String(err)));
  } finally {
    ui.askButton.disabled = false;
  }
}

function describeSource(url) {
  try { return url ? `From ${new URL(url).hostname}` : ''; } catch { return ''; }
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
  showTab('ask');
  ui.state.value = pending.text;
  const label = describeSource(pending.source);
  ui.source.textContent = label;
  ui.source.hidden = !label;
  if (settings.typesafe.apiKey) ask();
}

function bindAsk() {
  ui.pack.replaceChildren(
    ...Object.entries(PACKS).map(([id, pack]) => new Option(pack.label, id)),
    new Option('Custom questions', CUSTOM),
  );
  ui.pack.addEventListener('change', async () => {
    await persistAsk({ pack: ui.pack.value });
    showPack();
  });
  ui.questions.addEventListener('change', onQuestionsEdited);
  ui.resetQuestions.addEventListener('click', async () => {
    await persistAsk({ pack: DEFAULT_PACK, customQuestions: null });
    showPack();
  });
  ui.askButton.addEventListener('click', ask);
  ui.state.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ask(); }
  });
  ui.state.addEventListener('input', () => { ui.source.hidden = true; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes[PENDING_KEY]?.newValue) takePendingSelection();
    if (area === 'local' && changes.settings?.newValue) {
      settings = changes.settings.newValue;
      ui.setupHint.hidden = Boolean(settings.typesafe?.apiKey);
    }
  });
}

/* ---- boot ---- */

async function init() {
  settings = await loadSettings();
  ui.tabDrive.addEventListener('click', () => showTab('drive'));
  ui.tabAsk.addEventListener('click', () => showTab('ask'));
  ui.openOptions.addEventListener('click', openOptions);
  ui.setupLink.addEventListener('click', openOptions);
  ui.setupHint.hidden = Boolean(settings.typesafe.apiKey);

  let remembered = 'drive';
  try { remembered = localStorage.getItem('tab') || 'drive'; } catch { /* storage may be blocked */ }
  showTab(remembered === 'ask' ? 'ask' : 'drive');

  bindAsk();
  showPack();
  renderEmpty(ui.results);
  await initDrive();
  await takePendingSelection();
}

init().catch((err) => console.error('Jev: panel failed to start', err));
