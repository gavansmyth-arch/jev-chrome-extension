import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJsonObject, pickQuoted, replyText, resolveTypedText } from '../bg/typer.js';

const model = { mode: 'model', baseUrl: 'https://llm.test/v1', model: 'test-model', apiKey: 'secret' };
const chat = (content, finish_reason = 'stop') => JSON.stringify({ choices: [{ message: { content }, finish_reason }] });
let lastRequest = null;
function mockFetch(status, body) {
  globalThis.fetch = async (url, opts) => {
    lastRequest = { url, headers: opts.headers, body: JSON.parse(opts.body) };
    return new Response(body, { status });
  };
}
const ask = (textModel = model) => resolveTypedText({ goal: 'find stories about Tesla', field: "searchbox 'Search stories'", pageText: 'Top stories', quoted: [], typeValueKey: null, textModel });

test('replyText accepts the JSON form, a plain reply, and rejects null or long prose', () => {
  assert.equal(replyText('{"text": "Tesla"}'), 'Tesla');
  assert.equal(replyText('```json\n{"text": "Tesla"}\n```'), 'Tesla');
  assert.equal(replyText('"Tesla"'), 'Tesla');
  assert.equal(replyText('{"text": null}'), null);
  assert.equal(replyText('null'), null);
  assert.equal(replyText('x'.repeat(300)), null);
});

test('a configured text model is called and its answer is typed', async () => {
  mockFetch(200, chat('{"text": "Tesla"}'));
  assert.deepEqual(await ask(), { value: 'Tesla', source: 'model' });
  assert.equal(lastRequest.url, 'https://llm.test/v1/chat/completions');
  assert.equal(lastRequest.headers.Authorization, 'Bearer secret');
  assert.equal(lastRequest.body.model, 'test-model');
  assert.match(lastRequest.body.messages[1].content, /Tesla/);
});

test('a local model without a key gets no Authorization header', async () => {
  mockFetch(200, chat('Tesla'));
  assert.deepEqual(await ask({ ...model, apiKey: '' }), { value: 'Tesla', source: 'model' });
  assert.equal(lastRequest.headers.Authorization, undefined);
});

test('when the model runs out of room or declines, the person is asked with the reason', async () => {
  mockFetch(200, chat('', 'length'));
  let result = await ask();
  assert.equal(result.needUser, true);
  assert.match(result.reason, /ran out of room/);
  mockFetch(200, chat('{"text": null}'));
  result = await ask();
  assert.match(result.reason, /declined/);
});

test('replies in other common shapes are read too', async () => {
  mockFetch(200, JSON.stringify({ choices: [{ message: { content: [{ type: 'text', text: '{"text": "Tesla"}' }] } }] }));
  assert.deepEqual(await ask(), { value: 'Tesla', source: 'model' });
  mockFetch(200, JSON.stringify({ choices: [{ text: 'Tesla' }] }));
  assert.deepEqual(await ask(), { value: 'Tesla', source: 'model' });
  mockFetch(200, JSON.stringify({ message: { role: 'assistant', content: 'Tesla' } }));
  assert.deepEqual(await ask(), { value: 'Tesla', source: 'model' });
});

test('an unreadable reply shows what the server actually sent', async () => {
  mockFetch(200, JSON.stringify({ result: { answer: 'Tesla' } }));
  const result = await ask();
  assert.equal(result.needUser, true);
  assert.match(result.reason, /could not read: \{"result"/);
});

test('an HTTP error from the model becomes a readable reason, not a crash', async () => {
  mockFetch(401, JSON.stringify({ error: { message: 'invalid x-api-key' } }));
  const result = await ask();
  assert.equal(result.needUser, true);
  assert.match(result.reason, /401.*invalid x-api-key/);
});

test('extractJsonObject finds the object inside chatter and rejects junk', () => {
  assert.deepEqual(extractJsonObject('Sure! {"text": "espresso"} hope that helps'), { text: 'espresso' });
  assert.equal(extractJsonObject('no json here'), null);
  assert.equal(extractJsonObject('{broken'), null);
});

test('pickQuoted uses the only quote, or the one Jev chose', () => {
  assert.equal(pickQuoted(['espresso'], null), 'espresso');
  assert.equal(pickQuoted(['one', 'two'], 'q1'), 'two');
  assert.equal(pickQuoted(['one', 'two'], 'q9'), null);
  assert.equal(pickQuoted([], null), null);
});

test('resolveTypedText asks the person when nothing is quoted and no model is set', async () => {
  const result = await resolveTypedText({ goal: 'fill the form', field: 'textbox', pageText: '', quoted: [], typeValueKey: null, textModel: { mode: 'ask' } });
  assert.deepEqual(result, { needUser: true, reason: null });
});

test('resolveTypedText explains when the model mode has no URL or model set', async () => {
  const result = await resolveTypedText({ goal: 'fill it in', field: 'f', pageText: '', quoted: [], typeValueKey: null, textModel: { mode: 'model', apiKey: 'k', baseUrl: '', model: '' } });
  assert.equal(result.needUser, true);
  assert.match(result.reason, /not fully set up/);
});

test('resolveTypedText prefers quoted text over the model', async () => {
  const result = await resolveTypedText({ goal: 'x', field: 'f', pageText: '', quoted: ['latte'], typeValueKey: null, textModel: { mode: 'model', apiKey: 'k' } });
  assert.deepEqual(result, { value: 'latte', source: 'goal' });
});
