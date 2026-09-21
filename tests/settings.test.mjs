import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, mergeSettings, parseList, isBlockedHost } from '../shared/settings.js';

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
