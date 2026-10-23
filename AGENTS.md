# Trace maintenance

Work from this repository's root. Treat `extension/` and `server/` as the canonical source. A browser installation configured in the ignored `.trace-local.json` is only a runtime mirror; run `npm run install:local` after extension changes, then reload its browser card and mailbox tabs.

Use Node.js 24 or later. Run `npm run check` and `npm test` for behavior changes. Use the compose/Sent browser fixtures for mailbox integration and inspect actual mailbox UI for layout changes. Never send real email without explicit user instruction.

Keep credentials, databases, personal mail metadata, operational notes and mailbox screenshots out of Git. Do not claim image-load signals prove reading or reading duration. Do not claim per-recipient attribution for shared-message pixels. Preserve native Send behavior and keep message bodies out of collector requests.

Production updates must preserve the data volume and existing token. Machine-specific deployment details belong in ignored local documentation.
