# Privacy policy for Jev

*Last updated: 21 September 2026*

Jev is a Chrome extension published by Gavan Smyth. It is not affiliated with TypeSafe.

## What the extension does

- **Drive:** you type a goal and the extension reads the current tab and asks TypeSafe's Jev model which link, button or field to use next, then performs that action in the tab.
- **Ask:** you highlight text (or paste it) and the extension asks Jev typed questions about it.

## What is sent, and to whom

**To TypeSafe (api.typesafe.ai, or the endpoint you set in Options):**

- *Drive:* on every step, your goal, the current tab's URL, title and visible text (up to the character limit set in Options, 6,000 by default), a list of the interactive elements on the page (their labels, current values and link targets), and the last ten actions taken.
- *Ask:* the text you highlighted or pasted, and the questions being asked.

**To a text model of your choice (optional):** only if you enable *Use a text model* in Options. When a Drive step needs text typed, the goal, the field's label and an excerpt of the page text (up to 1,500 characters) are sent to the provider and model you configured (for example Anthropic, OpenAI, Google, OpenRouter, DeepSeek, Groq, Mistral, or a local Ollama server on your own machine). By default this is off, and the extension asks you what to type instead.

Nothing is sent anywhere else. There is no analytics, telemetry, advertising or crash reporting. The publisher never receives any of your data.

## What is stored on your computer

In `chrome.storage.local` on your own browser: your API keys, your settings, your last eight goals, and any custom Ask questions you write. You can clear all of it by removing the extension.

## What is never read

- Password fields are never read, listed or filled.
- Chrome's internal pages and the Chrome Web Store are never touched.
- Tabs where you have not started a run are never read. The extension only acts on the tab that was active when you pressed Run.

## Permissions, in plain terms

| Permission | Why |
|---|---|
| Access to web pages you visit | To read and act on the tab you choose to drive, and to send highlighted text to Jev when you ask. |
| `debugger` | To send real mouse clicks and keystrokes to the tab during a run, because many sites ignore simulated ones. It is attached only while a run is active and detached when it ends. You can turn it off in Options. |
| `storage` | To keep your keys and settings on your machine. |
| `sidePanel`, `contextMenus`, `tabs`, `scripting` | The panel, the right-click menu, following a link that opens a new tab, and loading the page reader into a tab that was open before the extension was installed. |

## Third parties

TypeSafe's handling of the data it receives is governed by its own terms and privacy policy at https://typesafe.ai. The same applies to any text-model provider you choose to configure.

## Changes and contact

Changes to this policy are published at https://github.com/gavansmyth-arch/jev-chrome-extension/blob/main/PRIVACY.md. Questions: open an issue at https://github.com/gavansmyth-arch/jev-chrome-extension/issues.
