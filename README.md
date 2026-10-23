# Trace

**Email, in focus.** A minimal English-language browser extension for Gmail and Outlook on the web, backed by a self-hosted collector. Version **0.4.0 beta**.

Send normally. Trace inserts a transparent 1×1 image automatically, then shows image-load signals in your native Sent list and a quiet activity dashboard. There is no per-message copying and no visible footer or link. Email bodies never leave the mailbox through Trace.

## What works

- A per-message **Trace on / Trace off** switch and a global pause.
- Normal Send and Ctrl/Cmd+Enter in recognized HTML compose editors.
- Native Gmail and Outlook Sent indicators: **Open signal**, **No signal yet**, or **No data** when no record is linked.
- A dashboard with provider filters, search, event details and CSV export.
- Sender-preview suppression using scoped browser request rules, a document-start guard, a sender cookie and auditable exclusion windows.
- A single-user Node.js / SQLite collector with an authenticated private API.

An image-load signal is **not proof of reading**. Blocking, caching, proxies and security prefetching limit accuracy. Reading duration and individual attribution in a shared group email are **not implemented**. The image is discoverable in message source and by privacy tools.

## Install once

1. Clone this repository into a permanent directory.
2. Start a collector using [DEPLOYMENT.md](DEPLOYMENT.md).
3. Open `chrome://extensions` or `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/`.
4. Open Trace → Settings. Enter your collector's HTTPS origin and private access token; grant access to that server.
5. For Gmail, select **Enable proxy protection** and allow the optional Google image proxy permission.
6. Reload open mailbox tabs.

The suggested server URL is the author's deployment. Use your own server URL and token for a separate installation. No access token is distributed with the source.

To update, keep the installed directory and browser storage, replace its extension files, click **Reload** on the extension card, and reload mailbox tabs. Update the backend too and preserve its data volume. Unpacked extensions do not update automatically from GitHub.

If the source and installed extension live in different directories, create an ignored `.trace-local.json`:

```json
{"extensionInstallDir":"/absolute/path/to/installed/extension"}
```

Then run `npm run install:local`. This copies from the canonical source; edit source files only.

## Sending and status

Tracking is automatic when **Trace on** is selected. Turning it off removes Trace markers before native sending. If preparation fails, native sending continues without tracking and a notice appears. “Send initiated” records a requested Send action, not delivery, Undo Send or provider validation.

The initial Sent association requires provider, exact subject, a timestamp within 90 seconds, recipient evidence when available, and an unambiguous match. Native thread/conversation identifiers are then retained locally. An opened message containing a known tracking image provides an exact ID association and can fill missing metadata from older versions. Ambiguous rows remain **No data**; old untracked mail cannot gain historical tracking.

## Sender-open protection

- Direct collector images from supported mailbox origins are blocked by browser request rules.
- Optional Gmail proxy protection blocks this collector's raw or encoded image URL inside Google image proxy URLs. It does not install scripts on Google image hosts.
- A document-start guard strips recognized tracking sources outside compose editors.
- Authenticated collector requests establish a sender cookie, subject to browser policy.
- Before-send loads and likely scanner requests are retained but excluded.
- Detected previews mark overlapping requests from 3 seconds before to 8 seconds after as uncertain and exclude them. A simultaneous recipient request may also be excluded. The window is triggered by actual preview rendering, not repeatedly extended while the mail stays open.

These layers cover the installed browser. Other clients, phones, background prefetching and privacy services can still produce false or missing signals. Old events migrated from earlier schemas remain visible as `legacy-unverified` rather than counted as established recipient activity.

## Per-recipient delivery

The current native-send flow inserts **one ID per message**. Every recipient of a group message receives the same ID, so it cannot identify which person opened it.

A future provider-authorized sending integration could prepare a distinct tracked payload for each recipient while retaining a single Send action in the UI. It needs one-time Gmail or Microsoft authorization, confirmed message IDs, and explicit handling of To/Cc, Reply All, attachments and retries. Sending separate deliveries changes mail semantics and is not silently enabled in this build. No Gmail or Microsoft developer application is required for the current native-send mode.

## Development

Requires Node.js **24+**; there are no npm dependencies.

```sh
npm run check
npm test
npm run preview
```

Preview: `http://127.0.0.1:4319/extension/dashboard.html` (sample data only).

Browser fixtures: `/tests/compose.html?provider=gmail`, `?provider=outlook`, `/tests/sent.html?provider=gmail`, and `/mail/sentitems/?provider=outlook`. Choose **Run integration checks**. They exercise the actual content script and send no mail. See [VERIFICATION.md](VERIFICATION.md) for coverage and practical limits.

## Data and permissions

The extension uses mailbox host access for compose/list integration, local storage for configuration and native associations, alarms for commit retries, and declarative request rules for sender-preview suppression. Collector access and Google proxy access are granted separately. The access token stays in trusted extension contexts and is not returned to mailbox content scripts.

The collector stores random message IDs, subjects, extracted recipient addresses, provider, timestamps, event classifications and short self-view windows. It stores no email bodies, raw IP addresses or full user-agent strings. Host infrastructure may retain its own request logs. Settings are local to the browser. The dashboard and Sent matching use the most recent 1,000 records.

## Supported scope

Gmail at `mail.google.com`; Outlook at `outlook.live.com`, `outlook.office.com`, `outlook.office365.com`, and `outlook.cloud.microsoft`. The adapters target recognized English web controls and depend on provider DOM structure. Provider UI changes can require updates.

Mobile/native apps, scheduled send, plain-text mode, encrypted mail and alternate sending paths are unsupported. Proxies may cache repeat loads; same-source requests within 15 seconds are deduplicated and image traffic is capped at 120 requests per message per hour. No signal does not mean unread.

## References

- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome request rules](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)
- [Chrome cross-origin requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Gmail image proxies](https://gmail.googleblog.com/2013/12/images-now-showing.html)
- [Apple Mail privacy protection](https://www.apple.com/legal/privacy/data/en/mail-privacy-protection/)
- [Mailtrack group tracking](https://mailsuite.com/hc/en-us/articles/360005926418-Tracking-group-emails-with-Mailtrack)
- [Mailtrack self-open coverage](https://mailsuite.com/hc/en-us/articles/360005927358-Self-open-notifications-Emails-to-yourself-are-NOT-tracked)

MIT licensed. No third-party extension code is included.
