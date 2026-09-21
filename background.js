// Service worker: wires the toolbar button and right-click menu to the side panel.

const MENU_ID = 'ask-jev';
const PENDING_KEY = 'pendingSelection';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Ask Jev about "%s"',
    contexts: ['selection'],
  });
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error('Jev: could not set side panel behaviour', err));

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.windowId) return;

  // sidePanel.open must run synchronously inside the user gesture, before any await.
  chrome.sidePanel
    .open({ windowId: tab.windowId })
    .catch((err) => console.error('Jev: could not open side panel', err));

  const text = (info.selectionText || '').trim();
  if (!text) return;

  chrome.storage.session
    .set({ [PENDING_KEY]: { text, source: tab.url || '', at: Date.now() } })
    .catch((err) => console.error('Jev: could not hand selection to panel', err));
});
