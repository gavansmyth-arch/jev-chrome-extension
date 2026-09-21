# Chrome Web Store listing — copy and paste from here

Everything the Developer Dashboard asks for, in the order it asks. The zip to upload is `jev-webstore-upload.zip` from the latest release (manifest at the root, which the store requires).

---

## Store listing tab

**Title** (taken from the manifest): Jev

**Summary** (taken from the manifest, 132 characters max):
Drive the tab you're on with TypeSafe Jev, or highlight text and ask it yes/no, pick-one and rating questions. Unofficial.

**Description:**

Type a goal, and Jev clicks, types and scrolls the tab you're looking at until it's done.

Jev is TypeSafe's decision model: instead of writing paragraphs, it picks the next action in a few hundred milliseconds. This extension reads the page as a numbered list of links, buttons and fields, asks Jev which one to use next, does it, and repeats — right in your own browser, with your own logins, no separate automation browser needed.

DRIVE
• Type a goal like "Search Wikipedia for "espresso" and open the article" and press Run
• Numbered badges show what Jev can see; every step shows how sure it was
• Step mode runs one action at a time; Stop ends the run any time
• Put text in quotes and Jev types it; otherwise it asks you — no second AI key needed (a text model is optional)
• Real clicks and keystrokes, so sites respond as they would to you

JEV CHECKS WITH YOU
• Pauses for a Yes/No before clicks that buy, pay, send, post, publish, delete, subscribe or transfer
• Can ask before acting when it's unsure (optional, off by default)
• Blocked-sites list for your bank and anything else off limits
• Two independent checks stop it declaring "done" early
• Password fields are never read or filled

ASK
• Highlight any text → right-click → Ask Jev
• Instant yes/no, pick-one and rating answers: support triage, scam check, moderation, sentiment, lead qualification, or your own questions

PRIVACY
• Your keys stay in your browser; page content goes only to TypeSafe (and, if you enable it, the text model you choose)
• No analytics, no telemetry, no accounts

You need a TypeSafe API key from console.typesafe.ai. Unofficial project, not affiliated with TypeSafe.

**Category:** Tools

**Language:** English

**Store icon:** `icons/icon128.png` (128 × 128)

**Screenshots** (1280 × 800): `store/screenshot-1-drive.png`, `store/screenshot-2-confirm.png`, `store/screenshot-3-ask.png`

**Small promo tile** (440 × 280): `store/promo-440x280.png`

**Official URL / Homepage:** https://github.com/gavansmyth-arch/jev-chrome-extension

**Support URL:** https://github.com/gavansmyth-arch/jev-chrome-extension/issues

---

## Privacy practices tab

**Single purpose description:**
Lets the user carry out a typed goal on the current tab, and answer questions about selected text, using the TypeSafe Jev decision model.

**Permission justifications** (one box per permission):

- **storage** — Saves the user's TypeSafe API key and settings locally in chrome.storage.local. Nothing is synced or sent to the publisher.
- **sidePanel** — The extension's whole interface is a side panel (Drive and Ask tabs).
- **contextMenus** — Adds the "Ask Jev about …" item to the right-click menu on selected text.
- **tabs** — Reads the URL and title of the tab being driven, and detects when a click opens a new tab so the run can follow it.
- **scripting** — Injects the page reader into the tab when the user starts a run on a page that was already open before the extension was installed.
- **debugger** — Sends genuine mouse clicks and keystrokes to the tab during a run the user has started, because many websites ignore simulated events. It is attached only while a run is active, detached the moment the run ends, never reads anything through the protocol, and can be switched off in Options (synthetic events are then used).
- **Host permission (http://*/* and https://*/*)** — Reads the interactive elements and visible text of whichever tab the user chooses to drive, and the text the user highlights for Ask. The extension does nothing on tabs where the user has not pressed Run.

**Are you using remote code?** No. All code ships in the package; the extension only exchanges JSON with the TypeSafe API.

**Data usage — what the extension collects:**
- ☑ Website content (the visible text and control labels of the tab the user drives, sent to TypeSafe to choose the next action)
- ☑ User activity (the goal the user types and the text they highlight)
- ☐ Everything else unticked (no PII, health, financial, authentication, personal communications, location or web history is collected by the extension itself)

**Certifications** (tick all three):
- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:**
https://github.com/gavansmyth-arch/jev-chrome-extension/blob/main/PRIVACY.md

---

## Distribution tab

**Visibility:** *Public* if you want anyone to find it by searching the store, or *Unlisted* if you want a working one-click install link that only people you give it to can use. Both go through the same review.

**Regions:** All regions.

**Payments:** Free.
