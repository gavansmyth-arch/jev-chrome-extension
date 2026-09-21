# Jev for Chrome

Highlight any text on a web page → right-click → **Ask Jev** → get instant, structured answers in a side panel:

- **Yes / No** checks — "Is this a scam?", "Does this need a reply today?"
- **Pick one** — "Which team should handle this?" → *Billing, confidence 0.93*
- **Ratings** — "How urgent is this?" → *Needs attention now*

Powered by [TypeSafe Jev](https://docs.typesafe.ai/introduction). You need your own TypeSafe API key.

---

## Install (about 2 minutes)

This extension isn't on the Chrome Web Store, so you load it yourself. You can remove it any time.

### 1. Download it

- Go to the [latest release](../../releases/latest) and download **`jev-chrome-extension.zip`**
  *(or click the green **Code** button on this page → **Download ZIP**)*
- Double-click the zip to unzip it. Keep the folder somewhere permanent (e.g. your Documents folder). **Don't delete it** — Chrome runs the extension from this folder.

### 2. Load it into Chrome

1. Open a new tab and go to **`chrome://extensions`**
2. Turn on **Developer mode** (switch in the top-right corner)
3. Click **Load unpacked** (top-left)
4. Select the unzipped folder — the one that contains `manifest.json` — and click **Select**

Jev now appears in your extensions list.

### 3. Pin it and add your API key

1. Click the puzzle-piece icon 🧩 in Chrome's toolbar → click the pin 📌 next to **Jev**
2. Click the yellow **Jev** icon — a side panel opens
3. Get an API key at [console.typesafe.ai/keys](https://console.typesafe.ai/keys)
4. Paste it into **TypeSafe API key** and press **Save**

Done ✅

---

## How to use it

**Right-click (fastest)**
1. Highlight some text on any page — an email, a review, a comment, a message
2. Right-click → **Ask Jev about "…"**
3. The side panel opens and answers automatically

**Paste**
1. Click the Jev icon
2. Paste text into the box
3. Choose a check and press **Ask Jev** (or ⌘/Ctrl + Enter)

### Built-in checks

| Check | Good for |
|---|---|
| Support triage | Customer emails and tickets — urgent? which team? |
| Scam / phishing check | Suspicious emails, texts, offers |
| Content moderation | Comments and posts — allow, warn, remove, ban |
| Sentiment & tone | Reviews and feedback — positive? how satisfied? |
| Lead qualification | Enquiries — ready to buy? good fit? |

Open **Edit questions** to write your own. Your edits are saved as **Custom questions**.

### Reading the answers

- **Yes** (green) = Jev is confident it's true (0.8 or above)
- **No** (red) = confident it's false (0.2 or below)
- **Unsure** (amber) = somewhere in between — use your judgement
- An **"unsure"** tag on a pick or rating means Jev's confidence is low

---

## Updating

Download the new version, replace the old folder's contents, then go to `chrome://extensions` and click the ↻ reload icon on the Jev card.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Your API key was rejected" | Re-copy your key from console.typesafe.ai/keys, paste it in **Settings**, press **Save** |
| No "Ask Jev" in the right-click menu | Highlight text first. If still missing, reload the extension at `chrome://extensions` |
| "Manifest file is missing" when loading | Wrong folder — choose the one that directly contains `manifest.json` |
| Extension disappeared | The folder was moved or deleted — load it again |

## Privacy

- Your API key is stored only in your own browser (`chrome.storage.local`) and is sent only to `api.typesafe.ai`
- The extension **cannot read web pages on its own** — it only sees text you highlight and choose to send
- Permissions: `sidePanel`, `contextMenus`, `storage`, and access to `https://api.typesafe.ai/*` only

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Extension setup and permissions |
| `background.js` | Right-click menu → opens the side panel |
| `sidepanel.html` / `.css` / `.js` | The side panel |
| `packs.js` | Built-in question sets |
| `api.js` | Calls Jev, with friendly error messages |
| `render.js` | Turns answers into readable cards |
