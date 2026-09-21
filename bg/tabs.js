// Talking to the tab being driven: messaging with on-demand injection of the
// content scripts, waiting for loads, and URL checks.

export const CONTENT_FILES = Object.freeze([
  'content/snapshot.js', 'content/overlay.js', 'content/executor.js', 'content/content.js',
]);

const NO_RECEIVER = /Receiving end does not exist|Could not establish connection/i;

export function isDrivableUrl(url) {
  const text = String(url || '');
  if (!/^https?:\/\//i.test(text)) return false;
  return !/^https?:\/\/chromewebstore\.google\.com/i.test(text);
}

export function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export async function sendToTab(tabId, message, { inject = true } = {}) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    if (!inject || !NO_RECEIVER.test(String(err?.message || err))) throw err;
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: [...CONTENT_FILES] });
  return chrome.tabs.sendMessage(tabId, message);
}

export async function waitForTabLoad(tabId, timeoutMs) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === 'complete') return;
  await new Promise((resolve) => {
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve();
    }
    function onUpdated(id, info) {
      if (id === tabId && info.status === 'complete') finish();
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}
