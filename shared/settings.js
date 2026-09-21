// Settings shape, defaults and storage. Everything the extension remembers
// lives in chrome.storage.local under one key.

export const STORAGE_KEY = 'settings';

// Every preset speaks the OpenAI-style chat/completions format. `needsKey`
// is false for local servers that take no API key.
export const TEXT_MODEL_PRESETS = Object.freeze({
  anthropic: { label: 'Claude (Anthropic)', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-opus-5', needsKey: true },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', needsKey: true },
  gemini: { label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', needsKey: true },
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat', needsKey: true },
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', needsKey: true },
  groq: { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', needsKey: true },
  mistral: { label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', needsKey: true },
  ollama: { label: 'Ollama (local, no key)', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', needsKey: false },
  custom: { label: 'Private / self-hosted server (any OpenAI-compatible URL)', baseUrl: '', model: '', needsKey: false },
});

export const DEFAULT_SETTINGS = Object.freeze({
  typesafe: Object.freeze({
    apiKey: '',
    model: 'jev-latest',
    endpoint: 'https://api.typesafe.ai/v1/systemone',
  }),
  textModel: Object.freeze({
    mode: 'ask', // 'ask' = ask the user in the panel; 'model' = call a chat model
    provider: 'openrouter',
    baseUrl: TEXT_MODEL_PRESETS.openrouter.baseUrl,
    apiKey: '',
    model: TEXT_MODEL_PRESETS.openrouter.model,
  }),
  drive: Object.freeze({
    maxSteps: 25,
    stepDelayMs: 400,
    badges: true,
    trustedInput: true,
    confirmRisky: true,
    riskyWords: '',
    askBelow: 0, // off: with 50-100 controls on a page, confidence in any one is naturally low
    blockedSites: '',
    maxTextChars: 6000,
    maxElements: 120,
  }),
  ask: Object.freeze({
    pack: 'triage',
    customQuestions: null,
  }),
});

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function mergeSettings(base, patch) {
  if (!isPlainObject(patch)) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isPlainObject(value) && isPlainObject(base[key]) ? mergeSettings(base[key], value) : value;
  }
  return out;
}

export function parseList(text) {
  return String(text ?? '')
    .split(/[\n,]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isBlockedHost(hostname, blockedSites) {
  const host = String(hostname ?? '').toLowerCase();
  return parseList(blockedSites).some((site) => host === site || host.endsWith(`.${site}`));
}

export async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return mergeSettings(DEFAULT_SETTINGS, stored[STORAGE_KEY]);
  } catch (err) {
    console.error('Jev: could not load settings', err);
    return mergeSettings(DEFAULT_SETTINGS, {});
  }
}

export async function saveSettings(patch) {
  const current = await loadSettings();
  const next = mergeSettings(current, patch);
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}
