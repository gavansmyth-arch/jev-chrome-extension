// Options page: keys, the text helper, and how the Drive agent behaves.

import { loadSettings, saveSettings, TEXT_MODEL_PRESETS, DEFAULT_SETTINGS } from '../shared/settings.js';
import { askTypeSafe } from '../shared/typesafe.js';
import { testTextModel, listModels } from '../bg/typer.js';

const STATUS_CLEAR_MS = 3000;
const OTHER_MODEL = '__other';
const $ = (id) => document.getElementById(id);
const ui = {
  tsKey: $('tsKey'), tsReveal: $('tsReveal'), tsTest: $('tsTest'), tsStatus: $('tsStatus'), tsModel: $('tsModel'), tsEndpoint: $('tsEndpoint'),
  tmAsk: $('tmAsk'), tmModel: $('tmModel'), tmFields: $('tmFields'), tmProvider: $('tmProvider'), tmModelName: $('tmModelName'),
  tmModelSelect: $('tmModelSelect'), tmLoad: $('tmLoad'), tmLoadStatus: $('tmLoadStatus'), tmKeyLink: $('tmKeyLink'),
  tmBase: $('tmBase'), tmKey: $('tmKey'), tmReveal: $('tmReveal'), tmTest: $('tmTest'), tmStatus: $('tmStatus'),
  maxSteps: $('maxSteps'), stepDelay: $('stepDelay'), askBelow: $('askBelow'), maxText: $('maxText'),
  badges: $('badges'), trustedInput: $('trustedInput'), confirmRisky: $('confirmRisky'), riskyWords: $('riskyWords'),
  blockedSites: $('blockedSites'), save: $('save'), saveStatus: $('saveStatus'),
};

function flash(node, message, tone = '') {
  node.textContent = message;
  node.className = `status ${tone}`;
  if (tone !== 'bad') setTimeout(() => { if (node.textContent === message) node.textContent = ''; }, STATUS_CLEAR_MS);
}

function toggleReveal(input, button) {
  const hidden = input.type === 'password';
  input.type = hidden ? 'text' : 'password';
  button.textContent = hidden ? 'Hide' : 'Show';
}

/* ---- model list ---- */

function currentModel() {
  return ui.tmModelSelect.value === OTHER_MODEL ? ui.tmModelName.value.trim() : ui.tmModelSelect.value;
}

function toggleOtherModel() {
  ui.tmModelName.hidden = ui.tmModelSelect.value !== OTHER_MODEL;
}

// Shows `ids` (or the provider's suggested list) plus an "Other" entry, and
// selects `wanted`, falling back to "Other" when it is not in the list.
function fillModelSelect(providerId, wanted, ids = null) {
  const preset = TEXT_MODEL_PRESETS[providerId] || TEXT_MODEL_PRESETS.custom;
  const list = [...new Set(ids || preset.models)];
  ui.tmModelSelect.replaceChildren(...list.map((id) => new Option(id, id)), new Option('Other (type it in)', OTHER_MODEL));
  if (wanted && list.includes(wanted)) {
    ui.tmModelSelect.value = wanted;
  } else if (wanted) {
    ui.tmModelSelect.value = OTHER_MODEL;
    ui.tmModelName.value = wanted;
  } else {
    ui.tmModelSelect.value = list[0] || OTHER_MODEL;
  }
  toggleOtherModel();
}

function showKeyLink(providerId) {
  const url = TEXT_MODEL_PRESETS[providerId]?.keyUrl || '';
  ui.tmKeyLink.href = url || '#';
  ui.tmKeyLink.hidden = !url;
}

async function loadModels() {
  const { textModel } = read();
  ui.tmLoad.disabled = true;
  flash(ui.tmLoadStatus, 'Asking the provider…');
  try {
    const ids = await listModels({ ...textModel, listModels: TEXT_MODEL_PRESETS[textModel.provider]?.listModels });
    fillModelSelect(textModel.provider, ids.includes(textModel.model) ? textModel.model : ids[0], ids);
    flash(ui.tmLoadStatus, `${ids.length} models available. Pick one, then Save.`, 'good');
  } catch (err) {
    flash(ui.tmLoadStatus, err.message, 'bad');
  } finally {
    ui.tmLoad.disabled = false;
  }
}

function fill(settings) {
  const { typesafe, textModel, drive } = settings;
  ui.tsKey.value = typesafe.apiKey;
  ui.tsModel.value = typesafe.model;
  ui.tsEndpoint.value = typesafe.endpoint;
  (textModel.mode === 'model' ? ui.tmModel : ui.tmAsk).checked = true;
  ui.tmProvider.value = TEXT_MODEL_PRESETS[textModel.provider] ? textModel.provider : 'custom';
  fillModelSelect(ui.tmProvider.value, textModel.model);
  showKeyLink(ui.tmProvider.value);
  ui.tmBase.value = textModel.baseUrl;
  ui.tmKey.value = textModel.apiKey;
  ui.tmFields.hidden = textModel.mode !== 'model';
  ui.maxSteps.value = drive.maxSteps;
  ui.stepDelay.value = drive.stepDelayMs;
  ui.askBelow.value = drive.askBelow;
  ui.maxText.value = drive.maxTextChars;
  ui.badges.checked = drive.badges;
  ui.trustedInput.checked = drive.trustedInput;
  ui.confirmRisky.checked = drive.confirmRisky;
  ui.riskyWords.value = drive.riskyWords;
  ui.blockedSites.value = drive.blockedSites;
}

function clampNumber(input, fallback) {
  const value = Number(input.value);
  if (!Number.isFinite(value)) return fallback;
  const min = input.min === '' ? -Infinity : Number(input.min);
  const max = input.max === '' ? Infinity : Number(input.max);
  return Math.min(max, Math.max(min, value));
}

function read() {
  const d = DEFAULT_SETTINGS.drive;
  return {
    typesafe: {
      apiKey: ui.tsKey.value.trim(),
      model: ui.tsModel.value.trim() || DEFAULT_SETTINGS.typesafe.model,
      endpoint: ui.tsEndpoint.value.trim() || DEFAULT_SETTINGS.typesafe.endpoint,
    },
    textModel: {
      mode: ui.tmModel.checked ? 'model' : 'ask',
      provider: ui.tmProvider.value,
      baseUrl: ui.tmBase.value.trim(),
      apiKey: ui.tmKey.value.trim(),
      model: currentModel(),
    },
    drive: {
      maxSteps: Math.round(clampNumber(ui.maxSteps, d.maxSteps)),
      stepDelayMs: Math.round(clampNumber(ui.stepDelay, d.stepDelayMs)),
      askBelow: clampNumber(ui.askBelow, d.askBelow),
      maxTextChars: Math.round(clampNumber(ui.maxText, d.maxTextChars)),
      badges: ui.badges.checked,
      trustedInput: ui.trustedInput.checked,
      confirmRisky: ui.confirmRisky.checked,
      riskyWords: ui.riskyWords.value.trim(),
      blockedSites: ui.blockedSites.value.trim(),
    },
  };
}

async function save() {
  const patch = read();
  if (patch.textModel.mode === 'model') {
    const { baseUrl, model, apiKey, provider } = patch.textModel;
    if (!baseUrl || !model) return flash(ui.saveStatus, 'The text model needs a base URL and a model name, or choose "Ask me".', 'bad');
    if (!apiKey && TEXT_MODEL_PRESETS[provider]?.needsKey) return flash(ui.saveStatus, 'This provider needs an API key. Paste it, or choose "Ask me".', 'bad');
  }
  try {
    await saveSettings(patch);
    flash(ui.saveStatus, 'Saved', 'good');
  } catch (err) {
    console.error('Jev: could not save options', err);
    flash(ui.saveStatus, 'Could not save. Try again.', 'bad');
  }
}

async function testTypeSafe() {
  const { typesafe } = read();
  ui.tsTest.disabled = true;
  flash(ui.tsStatus, 'Testing…');
  try {
    const { data, ms } = await askTypeSafe({
      ...typesafe,
      state: 'My card was charged twice and nobody has replied.',
      questions: { is_billing: { type: 'noul', instructions: 'Is this a billing problem?' } },
    });
    const value = Number(data.answers?.is_billing?.noul);
    flash(ui.tsStatus, `Works: ${data.model || typesafe.model} answered ${value.toFixed(2)} in ${ms} ms.`, 'good');
  } catch (err) {
    flash(ui.tsStatus, err.message, 'bad');
  } finally {
    ui.tsTest.disabled = false;
  }
}

async function testHelper() {
  const { textModel } = read();
  ui.tmTest.disabled = true;
  flash(ui.tmStatus, 'Testing…');
  try {
    const value = await testTextModel(textModel);
    flash(ui.tmStatus, `Works: it would type "${value}".`, 'good');
  } catch (err) {
    flash(ui.tmStatus, err.message, 'bad');
  } finally {
    ui.tmTest.disabled = false;
  }
}

function applyPreset() {
  const providerId = ui.tmProvider.value;
  const preset = TEXT_MODEL_PRESETS[providerId];
  if (!preset) return;
  ui.tmBase.value = preset.baseUrl; // empty for a private server: the person types theirs
  fillModelSelect(providerId, preset.model);
  showKeyLink(providerId);
  ui.tmLoadStatus.textContent = '';
}

function bind() {
  ui.tmProvider.replaceChildren(...Object.entries(TEXT_MODEL_PRESETS).map(([id, p]) => new Option(p.label, id)));
  ui.tmProvider.addEventListener('change', applyPreset);
  ui.tmModelSelect.addEventListener('change', toggleOtherModel);
  ui.tmLoad.addEventListener('click', loadModels);
  ui.tmAsk.addEventListener('change', () => { ui.tmFields.hidden = true; });
  ui.tmModel.addEventListener('change', () => { ui.tmFields.hidden = false; });
  ui.tsReveal.addEventListener('click', () => toggleReveal(ui.tsKey, ui.tsReveal));
  ui.tmReveal.addEventListener('click', () => toggleReveal(ui.tmKey, ui.tmReveal));
  ui.tsTest.addEventListener('click', testTypeSafe);
  ui.tmTest.addEventListener('click', testHelper);
  ui.save.addEventListener('click', save);
  document.addEventListener('keydown', (e) => {
    if (e.key === 's' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
  });
}

async function init() {
  bind();
  fill(await loadSettings());
}

init().catch((err) => console.error('Jev: options failed to start', err));
