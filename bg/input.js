// Trusted input: real mouse and keyboard events sent through Chrome's
// DevTools protocol, so pages receive them exactly as from a human.

const PROTOCOL_VERSION = '1.3';
const ENTER_KEY = Object.freeze({ key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });

export class TrustedInput {
  constructor() {
    this.tabId = null;
    this.attached = false;
    this.onLost = null;
    chrome.debugger.onDetach.addListener((source, reason) => {
      if (source.tabId !== this.tabId || !this.attached) return;
      this.attached = false;
      if (typeof this.onLost === 'function') this.onLost(reason);
    });
  }

  async attach(tabId) {
    if (this.attached && this.tabId === tabId) return;
    await this.detach();
    await chrome.debugger.attach({ tabId }, PROTOCOL_VERSION);
    this.tabId = tabId;
    this.attached = true;
  }

  async detach() {
    if (!this.attached) return;
    const tabId = this.tabId;
    this.attached = false;
    try {
      await chrome.debugger.detach({ tabId });
    } catch (err) {
      console.debug('Jev: debugger was already detached', err?.message || err);
    }
  }

  send(method, params) {
    if (!this.attached) throw new Error('Trusted input is not attached to the tab.');
    return chrome.debugger.sendCommand({ tabId: this.tabId }, method, params);
  }

  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  async insertText(text) {
    await this.send('Input.insertText', { text });
  }

  async pressEnter() {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', text: '\r', unmodifiedText: '\r', ...ENTER_KEY });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...ENTER_KEY });
  }
}
