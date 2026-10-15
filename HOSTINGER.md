# Hostinger production deployment

Permanent domain: https://testimonials.relieverit.com

## Current testing address

Use `https://green-barracuda-892142.hostingersite.com` for the current test deployment. In hPanel set `SHOPIFY_APP_URL` to this exact origin (no trailing path). Set the other required variables from `.env.hostinger-test.example`, including the actual app secret and MySQL connection URL. The backend allows this exact temporary origin and the existing permanent origin; it does not allow arbitrary Hostinger domains.

Push the updated code and redeploy Hostinger first. Once Runtime logs report **Easy Testimonials is ready**, release the matching Shopify URL/callback with `npm run deploy:hostinger-test`. That command changes the live URL for the same Shopify app; it is not a separate Shopify app identity. Until then, editing the local TOML file has not updated Shopify.

The remaining numbered steps describe the permanent-domain deployment. When migrating later, attach the permanent domain, set `SHOPIFY_APP_URL=https://testimonials.relieverit.com`, restart the backend and run `npm run deploy:production`.

1. In hPanel create a **Node.js Web App**, using your GitHub repository or a ZIP of the source project. Select Node.js 22 (22.12 or later) or 24. This needs a server-side Node deployment; the React Router server build is not a static website.
2. Use these settings:
   - Framework: **Other** (server-side), or **Express** with a custom entry file.
   - Project root: repository root.
   - Build command: `npm run build:hostinger`.
   - Output directory: `.` (repository root, retaining the entry, build, and Prisma runtime files).
   - Entry file: `server.cjs` (at the project root).
   - Start command, if requested: `npm run start:hostinger`.
   - Install all dependencies during build, including development dependencies.
3. Create a **new, dedicated MySQL/MariaDB database and user** in Hostinger. Set `DATABASE_URL` using the connection host shown by Hostinger. Do not use an existing website's database. URL-encode special characters in the username/password. The production schema and migrations are in `prisma/hostinger`; local development continues using SQLite in `prisma/schema.prisma`.
4. Add the variables listed in `.env.production.example` directly in hPanel. Retrieve `SHOPIFY_API_SECRET` from your app's Shopify Dev Dashboard and enter it there. Never commit an actual `.env` file or send secrets in chat. Hostinger supplies `PORT`; the startup process preserves it.
5. Attach `testimonials.relieverit.com` to the Node.js app in hPanel and follow Hostinger's displayed DNS instructions. Wait for HTTPS to become active. The hostname alone is not enough to determine the correct DNS destination.
6. Deploy the backend. The CommonJS entry opens an HTTP listener immediately in the managed process, then validates the environment, applies the MySQL session migration, and loads the official React Router Express adapter. Requests receive HTTP 503 until initialization finishes; initialization failure closes the listener. Build-time Prisma generation selects the MySQL client. The database must be reachable at runtime for startup to complete.
7. Confirm the HTTPS site responds. Then run `npm run deploy:production` locally to release `shopify.app.production.toml` and the Theme App Extension to Shopify. This changes the live app URL to the Hostinger domain; it does not upload the backend to Hostinger.
8. Open the app in Shopify Admin, authorize any requested permissions, add a draft, edit it, publish it, confirm it appears in an App dashboard theme block, then unpublish it and confirm it disappears. Existing testimonials are in Shopify metaobjects and need no transfer. Local SQLite sessions are not uploaded; installation/authentication establishes production sessions.

The production configuration currently uses your existing Shopify app client ID. It is separate from the local config, but is not a separate Shopify app identity. If you later create a separate production app, update its client ID and hPanel credentials together. Continue local development with `npm run dev`; do not run dev against the production config.

If you run `build:hostinger` locally, it switches the generated Prisma client to MySQL. Run `npm run setup` to restore the SQLite client before resuming local development.

The Dockerfile is for a separate Docker hosting workflow; Hostinger's managed Node deployment uses the build command and `server.cjs` above.

Verification performed locally does not prove Hostinger database connectivity or DNS. Those checks require the actual hPanel deployment and its database settings.

Sources: [Hostinger Node deployment](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/), [Hostinger database connection](https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/), [Shopify hosting deployment](https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service).


## Audit update ? 15 October 2026

See [AUDIT.md](AUDIT.md) for confirmed fixes and remaining App Store blockers. After building, run `npm run test:dashboard` and `npm run test:routes`. The earlier upload ZIP predates these fixes: deploy the current source or regenerate the ZIP. `.env.production.example` is now allowed by Git; add it along with your code changes. Actual secret files remain ignored.


## Fix for ?App did not call listen() within 3 seconds?

Use **Other** (server-side) or **Express** and entry file **server.cjs**. Do not set the entry to `build/server/index.js`: that is a React Router request-handler bundle, not an HTTP listener. The earlier startup guarded against being imported and launched the HTTP server in a child process; that is incompatible with managed loaders which observe listen() in their own process. `server.cjs` starts unconditionally when imported, and `hosting/bootstrap.cjs` calls listen() before migrations or loading the app. Ensure root `server.cjs`, `server.js`, the `hosting` directory, `prisma/hostinger`, `build`, `public`, and dependencies are included in the deployed server application. If hPanel resolves the entry relative to output, use repository-root output (`.`) so the entry and runtime files stay together. Keep this a server-side application with proxy routing, not a static source-file deployment.

Push the updated source and lockfile before redeploying. Build with `npm run build:hostinger`, set production environment variables in hPanel, and check Runtime logs for both ?Hostinger HTTP listener started? and ?Easy Testimonials is ready?. A started listener alone is not readiness.
