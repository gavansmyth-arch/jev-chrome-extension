import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDrivableUrl, hostOf } from '../bg/tabs.js';

test('isDrivableUrl accepts web pages and refuses browser pages and the Web Store', () => {
  assert.equal(isDrivableUrl('https://en.wikipedia.org/wiki/Coffee'), true);
  assert.equal(isDrivableUrl('http://localhost:3000/'), true);
  assert.equal(isDrivableUrl('chrome://extensions'), false);
  assert.equal(isDrivableUrl('chrome-extension://abc/panel.html'), false);
  assert.equal(isDrivableUrl('https://chromewebstore.google.com/detail/x'), false);
  assert.equal(isDrivableUrl(undefined), false);
});

test('hostOf returns the hostname or an empty string', () => {
  assert.equal(hostOf('https://online.bank.com/login'), 'online.bank.com');
  assert.equal(hostOf('not a url'), '');
});
