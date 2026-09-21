# Jev for Chrome

Type a goal, and Jev clicks, types and scrolls the tab you're looking at until it's done. Or highlight any text and ask it quick yes/no, pick-one and rating questions.

Built on [TypeSafe Jev](https://docs.typesafe.ai/introduction), a decision model that picks the next action in a few hundred milliseconds instead of writing paragraphs. You need your own TypeSafe API key.

---

## Install (about 2 minutes, no coding)

1. **Download** [`jev-chrome-extension.zip`](../../releases/latest/download/jev-chrome-extension.zip) and double-click it to unzip. Keep the folder somewhere permanent (e.g. Documents). Chrome runs the extension from it.
2. In Chrome, go to **`chrome://extensions`** and turn on **Developer mode** (top-right switch).
3. Click **Load unpacked** and choose the unzipped folder (the one containing `manifest.json`).
4. Click the 🧩 puzzle icon in the toolbar and **pin** Jev.
5. Click the yellow **Jev** icon → **Options** → paste your key from [console.typesafe.ai/keys](https://console.typesafe.ai/keys) → press **Test**, then **Save**.

That's it. `Alt+J` opens the panel from anywhere.

---

## Drive: let Jev work the page

1. Open any website.
2. Click the Jev icon. The side panel opens on **Drive**.
3. Type a goal, e.g. *Search Wikipedia for "espresso" and open the article*, and press **Run**.

Jev reads the page as a numbered list of links, buttons and fields (you'll see the numbers appear on the page), asks TypeSafe which one to use next, does it, and repeats. Every step shows up in the panel with how sure Jev was.

- **Step** does one action and then pauses, so you can watch decisions one at a time.
- **Stop** ends the run at any point.
- **Copy trace** puts the whole run on the clipboard as JSON, handy for bug reports.

### Put text in quotes

Jev only *chooses*; it doesn't write. When a step needs typing, it uses whatever you put in quotes in the goal (`Search for "espresso"`). If there are several quoted bits, Jev picks the right one for the field. If there's nothing quoted, the panel **asks you** what to type. You can also plug in a text model (OpenRouter, DeepSeek, OpenAI or anything compatible) under Options → Typing text.

### Jev checks with you

- **Risky clicks.** Anything that looks like it would buy, pay, checkout, send, post, publish, delete, remove, subscribe, transfer, book or sign up pauses for a **Yes / No** first. Add your own words in Options.
- **Low confidence.** If Jev is less than 40% sure about a step (adjustable), it asks before doing it.
- **Blocked sites.** List your bank or anything else under Options → Never drive these sites.

### Built-in safety

- Two independent checks run on every step: *is the task already achieved?* and *is the run going in circles?* A premature "done" or "blocked" is held back once and Jev is told to keep going.
- Password fields are never read or filled. `chrome://` pages are refused.
- A control that keeps failing is dropped; three actions that change nothing end the run; runs stop at the step limit (25 by default).
- **Real clicks and keystrokes** go through Chrome's DevTools protocol so sites see genuine input. Chrome shows a *"Jev started debugging this browser"* bar during a run. Turn it off in Options to use synthetic events instead.
- If a click opens a new tab, Jev follows it, and comes back if that tab closes.

### What it can't do (yet)

Cross-origin iframes, canvas apps, file uploads, drag and drop, CAPTCHAs, and controls hidden inside closed shadow roots. "Done" is Jev's opinion, not proof, so check the page.

---

## Ask: quick judgements on any text

1. Highlight text on any page → right-click → **Ask Jev about "…"**. The panel switches to **Ask** and answers straight away.
2. Or open the **Ask** tab, paste text, choose a check, press **Ask Jev** (⌘/Ctrl + Enter).

Built-in checks: **Support triage**, **Scam / phishing check**, **Content moderation**, **Sentiment & tone**, **Lead qualification**. Open *Edit questions* to write your own.

Reading the answers: **Yes** (green) means 0.8 or above, **No** (red) 0.2 or below, **Unsure** (amber) in between. An *unsure* tag on a pick or rating means low confidence.

---

## Options

| Setting | What it does |
|---|---|
| TypeSafe API key, model, endpoint | Required. **Test** sends one tiny request. |
| Typing text | *Ask me* (default) or a text model with its own key. |
| Max steps, pause between steps | Run length and pace. |
| Ask me when confidence is below | 0 = never ask. Applies to Run, not Step. |
| Show numbered badges | The yellow numbers drawn on the page. |
| Real clicks and keystrokes | DevTools-protocol input (recommended). |
| Confirm before risky clicks, extra words | The Yes/No gate and your additions. |
| Never drive these sites | One domain per line; subdomains included. |
| Page text sent to Jev | Characters of visible text per step (default 6,000). |

---

## Privacy

Each Drive step sends one request to TypeSafe with your goal, the page's URL, title and visible text (up to the limit above), the list of interactive elements with their labels, values and link targets, and the last ten actions. If you enable a text model, typing steps send the goal, the field and a page excerpt to it. Nothing goes anywhere else and there is no telemetry. Keys stay in `chrome.storage.local` on your machine.

Permissions: `storage`, `sidePanel`, `contextMenus`, `tabs`, `scripting` and access to web pages so the extension can read and act on the tab you point it at; `debugger` only for sending real clicks and keystrokes during a run. It does nothing on tabs where you haven't pressed Run.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Add your TypeSafe API key" | Options → paste key → Test → Save |
| "Your TypeSafe API key was rejected" | Copy it again from console.typesafe.ai/keys |
| Nothing happens on a page | Reload the page once after installing; content scripts load on fresh pages |
| "Chrome does not let extensions act on this page" | Chrome's own pages and the Web Store are off limits |
| Clicks don't register on a site | Make sure *Real clicks and keystrokes* is on, then try again |
| No "Ask Jev" in the right-click menu | Highlight text first; if still missing, reload the extension |

## Updating

Download the new zip, replace the folder's contents, then press ↻ on the Jev card in `chrome://extensions`.

---

## For developers

Plain JavaScript, Manifest V3, no build step.

```
bg/        service worker: agent loop, TypeSafe calls, trusted input, tab handling
content/   page reader (numbered elements + text), badges, executor
panel/     side panel: Drive and Ask tabs
options/   settings page
shared/    pure logic: decisions, settings, TypeSafe client, Ask packs and cards
tests/     node:test suites, no dependencies
```

```bash
npm test
```

Runs the unit tests for the decision logic, settings, text resolution and URL checks, plus an end-to-end test of the Drive loop against a fake Chrome and a scripted Jev.

Publishing to the Chrome Web Store: see [PUBLISHING.md](PUBLISHING.md); the listing text and screenshots are in [store/](store/).
