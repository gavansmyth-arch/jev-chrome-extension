// Thin client for the TypeSafe System One endpoint.

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const TIMEOUT_MS = 30000;
const MAX_STATE_CHARS = 20000;

const STATUS_MESSAGES = Object.freeze({
  400: 'Jev rejected the request. Check your questions are valid.',
  401: 'Your API key was rejected. Check it in Settings.',
  403: 'This API key is not allowed to do that.',
  404: 'That model was not found. Try "jev-latest".',
  429: 'Too many requests. Wait a moment and try again.',
});

export class JevError extends Error {
  constructor(message, status = 0, detail = '') {
    super(message);
    this.name = 'JevError';
    this.status = status;
    this.detail = detail;
  }
}

export function validateRequest({ apiKey, state, questions }) {
  if (!apiKey) throw new JevError('Add your TypeSafe API key in Settings first.');
  if (!state || !state.trim()) throw new JevError('Paste or highlight some text for Jev to look at.');
  if (state.length > MAX_STATE_CHARS) {
    throw new JevError(`That text is too long (${state.length} characters, max ${MAX_STATE_CHARS}).`);
  }
  const isObject = questions && typeof questions === 'object' && !Array.isArray(questions);
  if (!isObject || !Object.keys(questions).length) {
    throw new JevError('Add at least one question.');
  }
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

async function post(apiKey, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    const message = err.name === 'AbortError'
      ? 'Jev took too long to answer. Try again.'
      : 'Could not reach TypeSafe. Check your internet connection.';
    throw new JevError(message, 0, String(err));
  } finally {
    clearTimeout(timer);
  }
}

export async function askJev({ apiKey, model, state, questions }) {
  validateRequest({ apiKey, state, questions });

  const started = performance.now();
  const response = await post(apiKey, { model: model || 'jev-latest', state, questions });
  const bodyText = await response.text();
  const ms = Math.round(performance.now() - started);

  if (!response.ok) {
    const message = STATUS_MESSAGES[response.status] || `TypeSafe returned an error (${response.status}).`;
    throw new JevError(message, response.status, extractDetail(bodyText));
  }

  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw new JevError('TypeSafe sent back something that is not JSON.', response.status, bodyText);
  }
  if (!data || typeof data.answers !== 'object' || data.answers === null) {
    throw new JevError('TypeSafe returned an unexpected response.', response.status, bodyText);
  }
  return { data, ms };
}
