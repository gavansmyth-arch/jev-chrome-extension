// Service worker: toolbar button, right-click menu, keyboard shortcut, and
// the message bridge between the side panel and the Drive agent.

import { startRun, stepRun, stopRun, answerRun, currentRun, onRunChange, exportTrace, ready } from './agent.js';

const MENU_ID = 'ask-jev';
const PENDING_KEY = 'pendingSelection';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_ID, title: 'Ask Jev about "%s"', contexts: ['selection'] });
  });
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error('Jev: could not set side panel behaviour', err));

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.windowId) return;
  chrome.sidePanel.open({ windowId: tab.windowId }).catch((err) => console.error('Jev: could not open side panel', err));
  const text = (info.selectionText || '').trim();
  if (!text) return;
  chrome.storage.session
    .set({ [PENDING_KEY]: { text, source: tab.url || '', at: Date.now() } })
    .catch((err) => console.error('Jev: could not hand selection to panel', err));
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-panel') return;
  try {
    const win = await chrome.windows.getLastFocused();
    await chrome.sidePanel.open({ windowId: win.id });
  } catch (err) {
    console.error('Jev: could not open side panel from shortcut', err);
  }
});

onRunChange((run) => {
  // No listener means the panel is closed; that is normal, not an error.
  chrome.runtime.sendMessage({ type: 'run:update', run }).catch(() => {});
});

async function handle(msg) {
  await ready;
  switch (msg.type) {
    case 'run:get': return { run: currentRun() };
    case 'run:start': {
      const tab = msg.tabId
        ? await chrome.tabs.get(msg.tabId)
        : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
      return { run: await startRun({ goal: msg.goal, mode: msg.mode, tab }) };
    }
    case 'run:step': await stepRun(); return {};
    case 'run:stop': await stopRun(); return {};
    case 'run:answer': await answerRun({ ok: msg.ok, value: msg.value }); return {};
    case 'run:trace': return { trace: exportTrace() };
    default: throw new Error(`Unknown message "${msg.type}".`);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('run:')) return false;
  handle(msg).then(
    (result) => sendResponse({ ok: true, ...result }),
    (err) => sendResponse({ ok: false, error: err?.message || String(err) }),
  );
  return true;
});
