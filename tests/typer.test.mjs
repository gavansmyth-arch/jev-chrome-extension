import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJsonObject, pickQuoted, resolveTypedText } from '../bg/typer.js';

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
  assert.deepEqual(result, { needUser: true });
});

test('resolveTypedText asks the person when the model mode has no URL or model set', async () => {
  const result = await resolveTypedText({ goal: 'fill it in', field: 'f', pageText: '', quoted: [], typeValueKey: null, textModel: { mode: 'model', apiKey: 'k', baseUrl: '', model: '' } });
  assert.deepEqual(result, { needUser: true });
});

test('resolveTypedText prefers quoted text over the model', async () => {
  const result = await resolveTypedText({ goal: 'x', field: 'f', pageText: '', quoted: ['latte'], typeValueKey: null, textModel: { mode: 'model', apiKey: 'k' } });
  assert.deepEqual(result, { value: 'latte', source: 'goal' });
});
