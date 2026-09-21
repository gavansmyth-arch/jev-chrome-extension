// Settings shape, defaults and storage. Everything the extension remembers
// lives in chrome.storage.local under one key.

export const STORAGE_KEY = 'settings';

// Every preset speaks the OpenAI-style chat/completions format at baseUrl.
// `models` is a suggested list (the first is the default); the Options page
// can replace it with the provider's live list via GET {baseUrl}/models.
// `needsKey` is false for local servers that take no API key.
export const TEXT_MODEL_PRESETS = Object.freeze({
  anthropic: {
    label: 'Claude (Anthropic)',
    baseUrl: 'https://api.anthropic.com/v1',
    keyUrl: 'https://platform.claude.com/settings/keys',
    listModels: 'anthropic',
    needsKey: true,
    // Haiku answers in well under a second and does not think before replying,
    // which suits a one-line field filler inside an agent loop.
    model: 'claude-haiku-4-5',
    models: ['claude-haiku-4-5', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-fable-5-1'],
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    needsKey: true,
    model: 'gpt-5-mini',
    models: ['gpt-5-mini', 'gpt-5-nano', 'gpt-5', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o'],
  },
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyUrl: 'https://aistudio.google.com/apikey',
    needsKey: true,
    model: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'],
  },
  openrouter: {
    label: 'OpenRouter (many models, one key)',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    needsKey: true,
    model: 'deepseek/deepseek-chat',
    models: ['deepseek/deepseek-chat', 'anthropic/claude-haiku-4.5', 'openai/gpt-5-mini', 'google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct', 'mistralai/mistral-small-3.2-24b-instruct'],
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    needsKey: true,
    model: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys',
    needsKey: true,
    model: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3-32b'],
  },
  mistral: {
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai/api-keys',
    needsKey: true,
    model: 'mistral-small-latest',
    models: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest', 'codestral-latest'],
  },
  xai: {
    label: 'xAI Grok',
    baseUrl: 'https://api.x.ai/v1',
    keyUrl: 'https://console.x.ai',
    needsKey: true,
    model: 'grok-4-fast-non-reasoning',
    models: ['grok-4-fast-non-reasoning', 'grok-4-fast-reasoning', 'grok-4', 'grok-3-mini', 'grok-3'],
  },
  qwen: {
    label: 'Qwen (Alibaba Cloud Model Studio)',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    keyUrl: 'https://modelstudio.console.alibabacloud.com',
    needsKey: true,
    model: 'qwen-turbo',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-flash'],
  },
  ollama: {
    label: 'Ollama (local, no key)',
    baseUrl: 'http://localhost:11434/v1',
    keyUrl: '',
    needsKey: false,
    model: 'llama3.2',
    models: [], // whatever is installed: press "Load models"
  },
  lmstudio: {
    label: 'LM Studio (local, no key)',
    baseUrl: 'http://localhost:1234/v1',
    keyUrl: '',
    needsKey: false,
    model: '',
    models: [], // whatever is loaded: press "Load models"
  },
  custom: {
    label: 'Private / self-hosted server (any OpenAI-compatible URL)',
    baseUrl: '',
    keyUrl: '',
    needsKey: false,
    model: '',
    models: [],
  },
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
