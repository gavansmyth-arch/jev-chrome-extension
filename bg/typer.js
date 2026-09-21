// Works out what to type into a field. Order of preference: text quoted in
// the goal (Jev picks between several), then an optional chat model, then
// the person at the keyboard. Never invents personal data.

const TIMEOUT_MS = 20000;
const MAX_PAGE_EXCERPT = 1500;
const MAX_TOKENS = 200;

const SYSTEM_PROMPT = [
  'You fill in exactly one form field for a browser agent that is carrying out a task.',
  'Reply with JSON only, in the form {"text": "<the exact text to type>"}.',
  'If the right value is not stated in the task, or it would be personal data, a password, a payment detail or anything you would have to make up, reply {"text": null}.',
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers = { 'Content-Type': 'application/json' };
  if (textModel.apiKey) headers.Authorization = `Bearer ${textModel.apiKey}`; // local servers take no key
  let response;
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: textModel.model,
        temperature: 0,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Task: ${goal}\nField: ${field}\nPage excerpt: ${String(pageText || '').slice(0, MAX_PAGE_EXCERPT)}` },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'The text helper took too long to answer.' : 'Could not reach the text helper.');
  } finally {
    clearTimeout(timer);
  }
  const bodyText = await response.text();
  if (!response.ok) throw new Error(`The text helper returned an error (${response.status}).`);
  const content = extractJsonObject(bodyText)?.choices?.[0]?.message?.content;
  const parsed = extractJsonObject(content);
  return typeof parsed?.text === 'string' && parsed.text.trim() ? parsed.text : null;
}

export async function resolveTypedText({ goal, field, pageText, quoted, typeValueKey, textModel }) {
  const fromGoal = pickQuoted(quoted, typeValueKey);
  if (fromGoal) return { value: fromGoal, source: quoted.length === 1 ? 'goal' : 'jev' };
  if (textModel?.mode === 'model' && textModel.baseUrl && textModel.model) {
    const value = await askTextModel({ goal, field, pageText, textModel });
    if (value) return { value, source: 'model' };
  }
  return { needUser: true };
}

export async function testTextModel(textModel) {
  const value = await askTextModel({ goal: 'Search for "espresso"', field: "searchbox 'Search'", pageText: '', textModel });
  if (!value) throw new Error('The text helper answered, but did not return a value for a simple test.');
  return value;
}
