# Easy Testimonials audit — 15 October 2026

## Outcome

The existing app is functional locally and both build workflows succeed. It is **not ready for App Store submission**: mandatory privacy webhook handling is missing, privacy/support/listing details need completion, and live installation and production database behavior remain unverified. No app release, Hostinger upload, database migration against a real database, or Shopify store mutation was performed during this audit.

## Implemented features

| Area | Evidence and current behavior |
| --- | --- |
| Embedded Admin app | React Router/TypeScript, official Shopify authentication, App Bridge and Polaris through AppProvider. Admin loaders/actions authenticate requests. |
| Testimonials | Add, edit, delete with confirmation, publish/unpublish; drafts by default; integer ratings 1–5; trimmed name/review validation; GraphQL errors and mutation userErrors handled. |
| Storage | App-owned `$app:testimonial` Shopify metaobjects. No testimonial rows or duplicate storefront JSON snapshot in Prisma. Existing-entry mutations verify type ownership in the authenticated shop. |
| Dashboard | Published/draft badges, status filter, 25-entry forward cursor pages, first-page navigation, empty/error states, setup instructions. Counts and filters apply to the current page, not the entire store. |
| Storefront | Theme App Extension retains its UID, existing CSS and settings. Manual mode keeps three theme-editor reviews. Dashboard mode reads published metaobjects using an app-installation type binding; configurable maximum 1–50. Text is escaped; drafts are excluded by Shopify's publishable capability. |
| Sessions | Prisma adapter; local SQLite schema/migration, separate Hostinger MySQL schema/migration, expiring offline-token support. |
| Hostinger preparation | `build:hostinger` generates the MySQL client and builds React Router. `server.js` validates required environment variables, applies production migrations, preserves PORT, binds the official server to all interfaces. |
| Shopify configuration | API and webhooks pinned to 2026-10, production URL and OAuth callback configured for testimonials.relieverit.com. |

## Confirmed issues fixed

1. **Production landing page was template content with manual shop-domain login** (`app/routes/_index/route.tsx`). Replaced placeholders with factual feature text. Production now instructs merchants to open the installed app through Shopify, hides the form and rejects manual login POSTs. The local development login and Shopify `shop` parameter redirect remain available. This addresses requirement 2.3.1 without removing development login functionality.
2. **Uninstall cleanup depended on finding a session** (`webhooks.app.uninstalled.tsx`). Cleanup now deletes sessions by the authenticated shop even on retries or when no offline session is returned. The delete is idempotent and remains protected by Shopify HMAC validation.
3. **Scope-change webhook could throw after concurrent session deletion** (`webhooks.app.scopes_update.tsx`). Replaced `update` with `updateMany` constrained to the same session ID. Zero matching rows is now harmless.
4. **Hostinger environment example was ignored by Git** (`.gitignore`). Added a narrow exception for `.env.production.example`; actual secret files remain ignored. The example contains placeholders, not a real app secret or database password.
5. **Legacy Star Rating block image used a deprecated URL filter and lacked alt text** (`extensions/testimonials/blocks/star_rating.liquid`). Uses `asset_url` and an empty decorative alt attribute. Product selection and rating behavior are preserved.

Added `scripts/verify-routes.mjs` and `npm run test:routes` for the production login and webhook regression checks. This script uses real Shopify HMAC validation and an in-memory session adapter; it neither contacts a store nor modifies a local database.

## Missing functionality and remaining risks

### Must resolve before App Store submission

- **Mandatory compliance webhooks are absent** from both TOML files and routes: `customers/data_request`, `customers/redact`, `shop/redact`. Implement authenticated endpoints, subscription configuration and an actual data-export/deletion process. Current uninstall cleanup does not replace these webhooks. Shopify requires them even for apps that do not collect personal data.
- **A privacy fulfillment design is needed.** Testimonials contain merchant-entered display names but no Shopify customer IDs, email addresses or order links. They cannot safely be matched to a privacy request using a display name alone. Determine how the merchant will identify relevant testimonials and how requests will be completed, including externally stored sessions/backups. Returning success without implementing that process would hide a real gap; no placeholder compliance handler was added.
- **Privacy policy, support contact, listing, review instructions and distribution status** cannot be verified from this repository. Add real operator-specific information; confirm in Shopify Dev Dashboard. No policy text or contact address was invented.
- **Pricing decision:** no Shopify billing/subscription enforcement exists. This is fine for a genuinely free app. Paid plans require Shopify App Pricing/Billing and appropriate approval/plan-change behavior; do not advertise paid features as already implemented.

### Product limits, not broken implementations

- There is no customer-facing review submission form, email request system, verified-purchase check, image/video upload, product-specific testimonial association, import/export or bulk operations.
- The separate **Star Rating** block reads the legacy `product.metafields.demo.avg_rating` field. The dashboard does not populate it; it is not an aggregate of managed testimonials. It was preserved rather than silently repurposed.
- There is no guaranteed merchant-controlled ordering for dashboard-driven storefront testimonials. Admin lists sort by update time; Liquid's collection order is separate.
- Genuine source/consent for merchant-entered testimonials must be established operationally. The code does not fabricate reviews or mark them as verified purchases.

### Deployment issues to review

- Both Shopify configs share the same app client ID. They are different configurations of **one app**, not two isolated app identities. Deploying production changes that app's live URL.
- `write_products` remains because of the retained template `product.metafields.app.demo_info` definition, not testimonial management. Retained demo definitions/scopes should be reviewed before submission. Removing definitions can affect existing Shopify data, so no definitions were deleted.
- Hostinger must run this as a server-side Node application using root `server.js`, not serve `build/client` as a static website. Build dependencies must be installed before `build:hostinger` runs.
- The MySQL client replaces the default generated Prisma client. After a local Hostinger build, regenerate the SQLite client before local development. This audit did restore it.
- Production startup applies migrations and needs database connectivity and schema-change permissions. The schema and generated migration are present, but migration execution against Hostinger MySQL has not been tested.
- Current SQL schemas pass Prisma validation. The Hostinger session tokens use TEXT columns. Backups, retention, database credentials, restart behavior and deployment logs need checking on the real host.
- HTTPS GET to `https://testimonials.relieverit.com/` returned 200 during this audit. This verifies public HTTPS reachability only; it does not identify the deployed revision, prove Shopify embedding/OAuth works, or verify MySQL connectivity.
- The earlier `artifacts/easy-testimonial-hostinger.zip` predates these audit fixes. Use the updated repository or regenerate the archive before upload; that old ZIP was not silently replaced.
- Docker remains a separate SQLite workflow and requires a persistent database volume. The managed Hostinger path uses MySQL instead.

## Verification results

| Check | Result |
| --- | --- |
| Existing unit suite (`npm test`) | 13/13 passing before and after changes; GraphQL is mocked. |
| `npm run build` | Passing before and after changes. React Router reports future-v8 opt-in notices, not build errors. |
| `npm run build:hostinger` | Passing with MySQL client generation and dummy DATABASE_URL; no database connection attempted. SQLite client restored afterward. |
| `npm run typecheck` | Passing. |
| `npm run lint` | Passing. |
| `npm run test:dashboard` | Passing against the production build: escaping, actions, enabled buttons, pagination, empty/error/setup states. Not browser interaction testing. |
| `npm run test:routes` | Passing: real invalid-HMAC rejection, repeated uninstall cleanup without a session, scope update after a simulated concurrent deletion, production manual-login rejection and Shopify-entry redirect. |
| Shopify CLI config validation | Development and production configurations both valid with no issues. Does not release definitions or prove remote behavior. |
| Toolkit GraphQL validation | All seven existing operations valid against 2026-10. |
| Toolkit Liquid validation | Main block, card snippet, legacy rating block, stars snippet and locale pass. |
| Prisma schemas | SQLite and MySQL schema validation pass. |
| Live-store smoke test | Not performed: install/reinstall, expiring-token refresh, iframe/incognito operation, real CRUD, publish/unpublish and actual storefront rendering still need verification. |
| Hostinger deployment/runtime | Not performed. Public HTTP 200 alone is insufficient evidence. |

Some Windows sandbox executions initially failed with `spawn EPERM`, or the Liquid cache was unwritable. The affected checks were rerun with the required permission and passed. Those were environment restrictions rather than application test failures.

## Shopify local App Store self-review

The current checklist was fetched from Shopify with `shopify doc fetch` on 15 October 2026. The following is a local source review of Shopify's selected checkable criteria, not official approval or a complete App Store review.

**Likely passing: 29. Likely failing: 0 in the fetched applicable subset after fixes. Needs review: 5. Groups skipped: 9.** The additional mandatory privacy failure above is outside that fetched subset and still blocks submission.

### Requirements needing review

- **1.1.4 Use only factual information:** app generates no fake reviews; authenticity/permission for merchant-entered text and eventual listing claims require human verification.
- **1.2.1 Shopify App Pricing/Billing:** no external or Shopify billing found. Confirm the app is truly free; implement Shopify billing if charging.
- **2.3.3 Redirect after installation:** official Shopify library and authenticated `/app` routes are present; actual installation callback must be tested on the deployed app.
- **2.3.4 Authenticate after reinstall:** official session adapter/token flow is present and uninstall cleanup was hardened; a real uninstall/reinstall test remains necessary.
- **3.1.1 Valid TLS:** production configuration requires HTTPS and a public GET succeeded; confirm the actual deployment, certificate renewal and all callbacks use valid HTTPS.

### Likely passing requirement IDs

Evaluated in separate source-review passes by requirement:

- Policy: 1.1.1, 1.1.2, 1.1.3, 1.1.6, 1.1.7, 1.1.8, 1.1.9, 1.1.10, 1.1.13, 1.1.14, 1.1.15, 1.1.16. Authentication uses the official session-token flow; no prohibited checkout, gateway, marketplace, POS, fee, shipping, product-copying, agency marketplace, refund or lending functionality found.
- Billing: 1.2.2, 1.2.3 (no charges or plan tiers currently offered).
- Platform: 2.2.1, 2.2.3, 2.2.4, 2.2.6, 2.2.7. Admin GraphQL is used; installed official AppProvider loads current CDN App Bridge before Polaris and app UI. No promotional Admin extensions or automatic Max modal launch found.
- Installation: 2.3.1 after the production-login fix; 2.3.2 authenticated admin routes precede testimonial access.
- Restricted scopes: 3.2.1–3.2.5. None of the five restricted scope families in this group is requested.
- Online store: 5.1.1, 5.1.3, 5.1.5. Theme blocks with setup instructions, no theme-code editing, and managed testimonials accessible in Shopify/Admin.

### Skipped groups

- 5.2 Payment — no payment extension or gateway scopes.
- 5.3 Payment facilitator — opt-in only; not requested.
- 5.4 Purchase option — no subscription/payment-method/mandate scope signal.
- 5.5 Product sourcing — opt-in only; not requested.
- 5.6 Checkout customization — no checkout UI extension target.
- 5.7 Sales channel — no channel_config extension.
- 5.8 Post purchase — no checkout_post_purchase extension.
- 5.9 Mobile app builders — opt-in only; not requested.
- 5.10 Donation — opt-in only; not requested.

## Next release sequence

1. Implement and test privacy-webhook fulfillment; finalize pricing, privacy policy, support details and genuine-testimonial rules.
2. Review retained demo permissions without deleting live data unintentionally.
3. Deploy updated source to Hostinger with MySQL and secrets set in hPanel, then verify migrations/restart behavior and the deployed revision.
4. Release the appropriate Shopify config/extension only after the backend is reachable.
5. Run a real store install/reinstall and theme-block smoke test, including mobile/incognito, then prepare App Store listing and reviewer instructions.

## Resources

- [Current local-check requirements](https://shopify.dev/docs/apps/launch/app-store-review/app-store-ai-self-review-requirements)
- [Mandatory privacy compliance webhooks](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance)
- [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)
- [Best practices for apps](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices)
- [App billing](https://shopify.dev/docs/apps/launch/billing)
- [Submitting for review](https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review)
- [Hostinger Node hosting](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)
- [Hostinger MySQL](https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/)


## Follow-up: managed runtime startup failure

Hostinger runtime logs later showed that no listen() call was observed within three seconds. The startup design above was replaced: `server.cjs` is now the managed entry, `hosting/bootstrap.cjs` opens the HTTP listener immediately in the parent process, and `server.js` initializes migrations and the React Router Express handler behind an HTTP 503 readiness gate. No require.main guard is used on the managed entry. Express and the pinned official React Router Express adapter are direct dependencies. Tests cover real HTTP before/after initialization and listener shutdown on failure (15 total unit tests pass), and lint/build pass. This is a local fix and still requires pushing code and redeploying Hostinger with the new entry setting. The dependency installation reported 45 high-severity advisory findings; their impact was not assessed or force-upgraded as part of this startup fix.
