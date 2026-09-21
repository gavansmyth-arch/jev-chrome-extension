// One client for the TypeSafe System One endpoint, shared by Ask and Drive.

export const DEFAULT_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const DEFAULT_MODEL = 'jev-latest';
const TIMEOUT_MS = 30000;
const MAX_STATE_CHARS = 120000;
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAY_MS = 800;

const STATUS_MESSAGES = Object.freeze({
  400: 'TypeSafe rejected the request. Check the questions are valid.',
  401: 'Your TypeSafe API key was rejected. Check it in Options.',
  403: 'This TypeSafe API key is not allowed to do that.',
  404: 'That model was not found. Try "jev-latest".',
  429: 'TypeSafe is rate-limiting you. Wait a moment and try again.',
});

export class TypeSafeError extends Error {
  constructor(message, status = 0, detail = '') {
    super(message);
    this.name = 'TypeSafeError';
    this.status = status;
    this.detail = detail;
  }
}

export function validateRequest({ apiKey, state, questions }) {
  if (!apiKey) throw new TypeSafeError('Add your TypeSafe API key in Options first.');
  const stateText = typeof state === 'string' ? state : JSON.stringify(state ?? '');
  if (!stateText.trim() || stateText === '""') throw new TypeSafeError('There is nothing for Jev to look at.');
  if (stateText.length > MAX_STATE_CHARS) {
    throw new TypeSafeError(`That is too much text for one request (${stateText.length} characters, max ${MAX_STATE_CHARS}).`);
  }
  const isObject = questions && typeof questions === 'object' && !Array.isArray(questions);
  if (!isObject || !Object.keys(questions).length) throw new TypeSafeError('Add at least one question.');
}

function extractDetail(bodyText) {
  try {
    const parsed = JSON.parse(bodyText);
    const detail = parsed?.error?.message || parsed?.message || parsed?.detail;
    return typeof detail === 'string' ? detail : bodyText;
  } catch {
    return bodyText;
  }
}

async function post(endpoint, apiKey, payload, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    const message = err.name === 'AbortError'
      ? 'TypeSafe took too long to answer. Try again.'
      : 'Could not reach TypeSafe. Check your internet connection.';
    throw new TypeSafeError(message, 0, String(err));
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function askTypeSafe({ apiKey, model, endpoint, state, questions, timeoutMs = TIMEOUT_MS, retry = true }) {
  validateRequest({ apiKey, state, questions });
  const url = endpoint || DEFAULT_ENDPOINT;
  const payload = { model: model || DEFAULT_MODEL, state, questions };
  const started = performance.now();

  let response = await post(url, apiKey, payload, timeoutMs);
  if (retry && RETRY_STATUSES.has(response.status)) {
    await sleep(RETRY_DELAY_MS);
    response = await post(url, apiKey, payload, timeoutMs);
  }
  const bodyText = await response.text();
  const ms = Math.round(performance.now() - started);

  if (!response.ok) {
    const message = STATUS_MESSAGES[response.status] || `TypeSafe returned an error (${response.status}).`;
    throw new TypeSafeError(message, response.status, extractDetail(bodyText));
  }

  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw new TypeSafeError('TypeSafe sent back something that is not JSON.', response.status, bodyText);
  }
  if (!data || typeof data.answers !== 'object' || data.answers === null) {
    throw new TypeSafeError('TypeSafe returned an unexpected response.', response.status, bodyText);
  }
  return { data, ms };
}
