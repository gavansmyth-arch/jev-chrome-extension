import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, TEXT_MODEL_PRESETS, mergeSettings, parseList, isBlockedHost } from '../shared/settings.js';

test('text model presets cover the main providers and say whether a key is needed', () => {
  assert.equal(TEXT_MODEL_PRESETS.anthropic.baseUrl, 'https://api.anthropic.com/v1');
  assert.equal(TEXT_MODEL_PRESETS.anthropic.needsKey, true);
  assert.equal(TEXT_MODEL_PRESETS.ollama.needsKey, false);
  for (const [id, preset] of Object.entries(TEXT_MODEL_PRESETS)) {
    assert.ok(preset.label, `${id} has a label`);
    assert.ok(Array.isArray(preset.models), `${id} has a models list`);
    if (id !== 'custom') assert.match(preset.baseUrl, /^https?:\/\/[^\s]+[^/]$/, `${id} has a URL without a trailing slash`);
    if (preset.models.length) assert.equal(preset.models[0], preset.model, `${id} defaults to the first suggested model`);
    if (preset.needsKey) assert.match(preset.keyUrl, /^https:\/\//, `${id} links to where to get a key`);
  }
  assert.equal(TEXT_MODEL_PRESETS[DEFAULT_SETTINGS.textModel.provider] !== undefined, true);
});

test('mergeSettings deep-merges a partial patch without touching defaults', () => {
  const merged = mergeSettings(DEFAULT_SETTINGS, { drive: { maxSteps: 5 }, typesafe: { apiKey: 'k' } });
  assert.equal(merged.drive.maxSteps, 5);
  assert.equal(merged.drive.stepDelayMs, DEFAULT_SETTINGS.drive.stepDelayMs);
  assert.equal(merged.typesafe.apiKey, 'k');
  assert.equal(DEFAULT_SETTINGS.drive.maxSteps, 25);
});

test('mergeSettings ignores junk patches and replaces arrays whole', () => {
  assert.deepEqual(mergeSettings({ a: 1 }, null), { a: 1 });
  assert.deepEqual(mergeSettings({ a: [1, 2] }, { a: [3] }), { a: [3] });
});

test('parseList splits on commas and newlines and lowercases', () => {
  assert.deepEqual(parseList('Bank.com, Example.org\nfoo.test'), ['bank.com', 'example.org', 'foo.test']);
  assert.deepEqual(parseList(''), []);
});

test('isBlockedHost matches a domain and its subdomains only', () => {
  assert.equal(isBlockedHost('online.bank.com', 'bank.com'), true);
  assert.equal(isBlockedHost('bank.com', 'bank.com'), true);
  assert.equal(isBlockedHost('notbank.com', 'bank.com'), false);
  assert.equal(isBlockedHost('bank.com', ''), false);
});
