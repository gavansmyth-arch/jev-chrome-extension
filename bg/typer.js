// Works out what to type into a field. Order of preference: text quoted in
// the goal (Jev picks between several), then an optional chat model, then
// the person at the keyboard. Never invents personal data.

const TIMEOUT_MS = 20000;
const MAX_PAGE_EXCERPT = 1500;
const MAX_TOKENS = 2048; // room for models that think before answering
const RAW_SNIPPET = 160;
const MAX_PLAIN_REPLY = 200;

const SYSTEM_PROMPT = [
  'You fill in exactly one form field for a browser agent that is carrying out a task on a web page.',
  'Work out the best text to type from the task and the page excerpt: a search box gets the search words, a filter gets the filter value, a message box gets the message, and so on.',
  'Reply with JSON only, in the form {"text": "<the exact text to type>"}.',
  'Reply {"text": null} only if the field needs personal or sensitive data that the task does not provide: a real name, address, email, phone number, password, one-time code, or payment details.',
].join(' ');

export function extractJsonObject(text) {
  const raw = String(text ?? '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

const ANTHROPIC_HOST = /(^|\/\/)api\.anthropic\.com(\/|$)/i;

// Headers for an OpenAI-style request. Local servers take no key. Anthropic
// refuses requests that carry a browser Origin (an extension's do) unless this
// extra header confirms the key is meant to live in the browser; here it is
// the person's own key, stored only on their machine.
export function providerHeaders(base, apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (ANTHROPIC_HOST.test(base)) headers['anthropic-dangerous-direct-browser-access'] = 'true';
  return headers;
}

const OPENAI_HOST = /(^|\/\/)api\.openai\.com(\/|$)/i;

// The request body. No sampling settings: the newest Claude and OpenAI
// models reject `temperature`, and a one-line answer does not need it.
// OpenAI's current models want `max_completion_tokens`; everyone else
// understands `max_tokens`.
export function chatRequest(base, model, messages, { tokenField, omit = [] } = {}) {
  const field = tokenField || (OPENAI_HOST.test(base) ? 'max_completion_tokens' : 'max_tokens');
  const body = { model, messages, [field]: MAX_TOKENS };
  for (const key of omit) delete body[key];
  return body;
}

// When a provider answers 400 naming the token field we sent (its message
// may name both fields), says how to retry with the other one.
export function rejectedField(response, body, sentTokenField) {
  if (response.ok || response.status !== 400) return null;
  const message = String(body?.error?.message || body?.message || '');
  if (sentTokenField && new RegExp(`\\b${sentTokenField}\\b`, 'i').test(message)) {
    return { tokenField: sentTokenField === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens' };
  }
  if (/temperature|top_p/i.test(message)) return { omit: ['temperature', 'top_p'] };
  return null;
}

async function postChat(base, headers, request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: 'POST', headers, body: JSON.stringify(request), signal: controller.signal,
    });
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'The text helper took too long to answer.' : 'Could not reach the text helper.');
  } finally {
    clearTimeout(timer);
  }
  const bodyText = await response.text();
  return { response, bodyText, body: extractJsonObject(bodyText) };
}

export function pickQuoted(quoted, typeValueKey) {
  if (quoted.length === 1) return quoted[0];
  if (quoted.length > 1 && typeof typeValueKey === 'string') {
    const index = Number(typeValueKey.replace(/^q/, ''));
    if (Number.isInteger(index) && quoted[index]) return quoted[index];
  }
  return null;
}

async function askTextModel({ goal, field, pageText, textModel }) {
  const base = String(textModel.baseUrl || '').replace(/\/+$/, '');
  if (!base || !textModel.model) throw new Error('The text helper needs a base URL and a model name. Check Options.');
  const headers = providerHeaders(base, textModel.apiKey);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Task: ${goal}\nField: ${field}\nPage excerpt: ${String(pageText || '').slice(0, MAX_PAGE_EXCERPT)}` },
  ];
  const label = `The text model (${textModel.model})`;
  let request = chatRequest(base, textModel.model, messages);
  let { response, bodyText, body } = await postChat(base, headers, request);
  // A provider that rejects one of our fields gets one more try without it.
  const retry = rejectedField(response, body, 'max_tokens' in request ? 'max_tokens' : 'max_completion_tokens');
  if (retry) {
    request = chatRequest(base, textModel.model, messages, retry);
    ({ response, bodyText, body } = await postChat(base, headers, request));
  }
  if (!response.ok) {
    const detail = body?.error?.message || body?.message || bodyText.slice(0, 160);
    throw new Error(`${label} returned an error (${response.status}${detail ? `: ${detail}` : ''}).`);
  }
  const content = replyContent(body);
  if (content == null) {
    const detail = body?.error?.message || bodyText.trim().slice(0, RAW_SNIPPET) || 'empty reply';
    return { value: null, reason: `${label} sent back a reply the extension could not read: ${detail}` };
  }
  const value = replyText(content);
  if (value) return { value };
  const finish = body?.choices?.[0]?.finish_reason;
  if (finish === 'length' || !content.trim()) return { value: null, reason: `${label} ran out of room before answering.` };
  return { value: null, reason: `${label} declined to fill this field (it said: ${content.trim().slice(0, 120)}).` };
}

// Servers differ in where they put the text: OpenAI-style message.content
// (a string or a list of parts), the older choices[].text, or Ollama's
// native message.content / response. Returns null when none is present.
export function replyContent(body) {
  const choice = body?.choices?.[0];
  const candidates = [choice?.message?.content, choice?.text, body?.message?.content, body?.response, body?.output_text];
  for (const c of candidates) {
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('');
  }
  return null;
}

// Accepts the JSON the prompt asks for, and also a short plain reply, since
// many models answer with just the text despite instructions.
export function replyText(content) {
  const parsed = extractJsonObject(content);
  if (parsed && Object.hasOwn(parsed, 'text')) {
    return typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text.trim() : null;
  }
  const plain = String(content ?? '').replace(/```[a-z]*\n?|```/g, '').trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
  if (!plain || plain.length > MAX_PLAIN_REPLY || /^null$/i.test(plain)) return null;
  return plain;
}

export async function resolveTypedText({ goal, field, pageText, quoted, typeValueKey, textModel }) {
  const fromGoal = pickQuoted(quoted, typeValueKey);
  if (fromGoal) return { value: fromGoal, source: quoted.length === 1 ? 'goal' : 'jev' };
  const tm = textModel || {};
  if (tm.mode !== 'model') return { needUser: true, reason: null };
  if (!tm.baseUrl || !tm.model) return { needUser: true, reason: 'The text model is not fully set up: the base URL or model name is missing in Options.' };
  try {
    const { value, reason } = await askTextModel({ goal, field, pageText, textModel: tm });
    return value ? { value, source: 'model' } : { needUser: true, reason };
  } catch (err) {
    console.error('Jev: text model failed', err);
    return { needUser: true, reason: err.message };
  }
}

// Asks the provider for its current model list. OpenAI-style servers answer
// GET {baseUrl}/models with {data: [{id}]}; Anthropic's native list needs its
// own headers; Gemini prefixes ids with "models/".
export async function listModels(textModel) {
  const base = String(textModel.baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('Enter the base URL first.');
  const isAnthropic = textModel.listModels === 'anthropic' || ANTHROPIC_HOST.test(base);
  const headers = {};
  let url = `${base}/models`;
  if (isAnthropic) {
    headers['x-api-key'] = textModel.apiKey || '';
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    url += '?limit=100';
  } else if (textModel.apiKey) {
    headers.Authorization = `Bearer ${textModel.apiKey}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, { headers, signal: controller.signal });
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'The provider took too long to answer.' : `Could not reach ${base}.`);
  } finally {
    clearTimeout(timer);
  }
  const body = extractJsonObject(await response.text());
  if (!response.ok) {
    const detail = body?.error?.message || body?.message || '';
    throw new Error(`Could not list models (${response.status}${detail ? `: ${detail}` : ''}).`);
  }
  const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : [];
  const ids = rows.map((m) => String(m?.id || m?.name || '').replace(/^models\//, '')).filter(Boolean);
  if (!ids.length) throw new Error('The provider returned no models. Check the base URL and key.');
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

export async function testTextModel(textModel) {
  const { value, reason } = await askTextModel({ goal: 'Search the site for coffee grinders', field: "searchbox 'Search'", pageText: '', textModel });
  if (!value) throw new Error(reason || 'The text model answered, but did not return a value for a simple test.');
  return value;
}
