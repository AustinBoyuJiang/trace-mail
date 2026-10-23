# Verification

Version 0.4.0 beta · October 23, 2026

## Automated coverage

`npm run check` verifies manifest references and JavaScript syntax. `npm test` runs 20 tests covering:

- Private API authentication, lifecycle, persistence, retention and validation.
- No body uploads, reading pages or fabricated duration metrics.
- Deduplication, HEAD suppression, sender cookies, before-send and scanner exclusions.
- Auditable self-view overlaps and historical-event migration.
- Scoped mailbox RPC, trusted credentials and permission-gated proxy rules.
- Conservative Sent association and missing legacy metadata recovery.

Browser fixtures use the actual content script: Gmail compose (12 checks), Outlook compose (11), and Sent lists (8 each). They cover native Send preservation, opt-out, failure fallback, shortcut handling, tracking payload, collisions, hidden cached lists and exact proxy-image association. They send no mail.

## Manual checks

The installed build was checked in real Gmail and Outlook. Gmail Sent displayed the status for an existing tracked test after exact image-ID association recovered its missing subject/recipient metadata. Its narrow compose layout was checked for control overlap and working on/off interaction. The native Send/dropdown controls remain intact.

Chrome's rule matcher verified optional Gmail proxy suppression. Recognized own tracking images were stripped from real mailbox previews. Public HTTPS health and authenticated collector operations were checked. No real email was sent by the agent during these checks.

## Limits

Controlled fixtures cannot guarantee every provider layout or sending path. Delivery, Undo Send, scheduled sending, mobile/native clients, per-recipient group attribution and reading duration are not verified or provided. Self-view overlap classification is deliberately uncertain. Image requests remain signals, not proof of a human read.
