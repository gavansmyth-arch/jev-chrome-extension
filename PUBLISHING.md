# Publishing Jev to the Chrome Web Store

Once it's in the store, anyone can install it with one click from the store link. Until then, the only way to install is *Load unpacked* (see the README).

Everything below is copy-and-paste; the words are in [store/LISTING.md](store/LISTING.md). Allow about 15 minutes, plus Google's review time (usually 1–3 days, sometimes longer for extensions that use the `debugger` permission).

## 1. Register as a developer (one time, $5)

1. Go to **https://chrome.google.com/webstore/devconsole** and sign in with the Google account you want to publish under.
2. Accept the developer agreement and pay the one-off **$5** registration fee.
3. Under **Account**, add a contact email and verify it. The store won't let you publish until it's verified.

## 2. Upload the package

1. Download **`jev-webstore-upload.zip`** from the [latest release](https://github.com/gavansmyth-arch/jev-chrome-extension/releases/latest). This is the store version, with `manifest.json` at the top level of the zip. Don't unzip it.
2. In the dashboard click **New item** → **Choose file** → pick the zip → **Upload**.

## 3. Store listing

Open the **Store listing** tab and fill in, from [store/LISTING.md](store/LISTING.md):

- **Description** — paste the long description.
- **Category** — Tools. **Language** — English.
- **Store icon** — upload `icons/icon128.png` (from the unzipped extension folder).
- **Screenshots** — upload the three PNGs in the `store/` folder of the repo.
- **Small promo tile** — upload `store/promo-440x280.png`.
- **Official URL** and **Support URL** — as listed.

Click **Save draft**.

## 4. Privacy practices

Open the **Privacy practices** tab. Paste the **single purpose** text, then one **justification per permission** (the store shows a box for each). Answer **Remote code: No**. Tick **Website content** and **User activity** under data usage, tick the three certifications, and paste the **privacy policy URL**. Save.

## 5. Distribution

Open the **Distribution** tab. Choose **Public** (searchable) or **Unlisted** (works only for people who have the link). Leave regions as *All*, payments as *Free*. Save.

## 6. Submit

Click **Submit for review** (top right). You can tick *Publish automatically after review* so it goes live the moment it's approved.

You'll get an email when the review finishes. If it passes, your install link is:

```
https://chromewebstore.google.com/detail/<your-item-id>
```

The item ID is shown on the dashboard. Paste that link into the README's Install section and send it to whoever you like.

## If the review comes back with questions

The two things reviewers most often ask about are the `debugger` permission and access to all websites. The justifications in LISTING.md explain both. If they still refuse `debugger`, a version without real-input support (synthetic events only) can be published instead; it needs one manifest change and drops the "started debugging" bar.

## Updating later

Bump `"version"` in `manifest.json`, upload the new zip on the item's **Package** tab, and submit again. Existing users get the update automatically.
