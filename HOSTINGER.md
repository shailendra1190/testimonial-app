# Hostinger production deployment

Domain: https://testimonials.relieverit.com

1. In hPanel create a **Node.js Web App**, using your GitHub repository or a ZIP of the source project. Select Node.js 22 (22.12 or later) or 24. This needs a server-side Node deployment; the React Router server build is not a static website.
2. Use these settings:
   - Framework: React Router if offered, otherwise **Other** (server-side).
   - Project root: repository root.
   - Build command: `npm run build:hostinger`.
   - Build output: `build`.
   - Entry file: `server.js` (at the project root).
   - Start command, if requested: `npm run start:hostinger`.
   - Install all dependencies during build, including development dependencies.
3. Create a **new, dedicated MySQL/MariaDB database and user** in Hostinger. Set `DATABASE_URL` using the connection host shown by Hostinger. Do not use an existing website's database. URL-encode special characters in the username/password. The production schema and migrations are in `prisma/hostinger`; local development continues using SQLite in `prisma/schema.prisma`.
4. Add the variables listed in `.env.production.example` directly in hPanel. Retrieve `SHOPIFY_API_SECRET` from your app's Shopify Dev Dashboard and enter it there. Never commit an actual `.env` file or send secrets in chat. Hostinger supplies `PORT`; the startup process preserves it.
5. Attach `testimonials.relieverit.com` to the Node.js app in hPanel and follow Hostinger's displayed DNS instructions. Wait for HTTPS to become active. The hostname alone is not enough to determine the correct DNS destination.
6. Deploy the backend. Startup validates the environment, applies the MySQL session migration, then runs the official React Router production server. Build-time Prisma generation selects the MySQL client. The database must be reachable at runtime for startup to complete.
7. Confirm the HTTPS site responds. Then run `npm run deploy:production` locally to release `shopify.app.production.toml` and the Theme App Extension to Shopify. This changes the live app URL to the Hostinger domain; it does not upload the backend to Hostinger.
8. Open the app in Shopify Admin, authorize any requested permissions, add a draft, edit it, publish it, confirm it appears in an App dashboard theme block, then unpublish it and confirm it disappears. Existing testimonials are in Shopify metaobjects and need no transfer. Local SQLite sessions are not uploaded; installation/authentication establishes production sessions.

The production configuration currently uses your existing Shopify app client ID. It is separate from the local config, but is not a separate Shopify app identity. If you later create a separate production app, update its client ID and hPanel credentials together. Continue local development with `npm run dev`; do not run dev against the production config.

If you run `build:hostinger` locally, it switches the generated Prisma client to MySQL. Run `npm run setup` to restore the SQLite client before resuming local development.

The Dockerfile is for a separate Docker hosting workflow; Hostinger's managed Node deployment uses the build command and `server.js` above.

Verification performed locally does not prove Hostinger database connectivity or DNS. Those checks require the actual hPanel deployment and its database settings.

Sources: [Hostinger Node deployment](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/), [Hostinger database connection](https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/), [Shopify hosting deployment](https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service).
