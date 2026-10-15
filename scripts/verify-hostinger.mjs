/* eslint-env node */
import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import { startProduction } from "../server.js";
process.env.NODE_ENV = "production";
process.env.SHOPIFY_API_KEY = "hostinger-smoke-key";
process.env.SHOPIFY_API_SECRET = "hostinger-smoke-secret";
process.env.SHOPIFY_APP_URL =
  "https://green-barracuda-892142.hostingersite.com";
process.env.DATABASE_URL = "mysql://unused:unused@localhost:3306/unused";
process.env.PORT = "0";
// No real database is contacted. Startup must not try to launch migrations.
globalThis.prismaGlobal = {
  session: { count: async () => 0, findUnique: async () => null },
};
const running = startProduction();
if (!running.server.listening) await once(running.server, "listening");
try {
  await running.ready;
  const origin = `http://127.0.0.1:${running.server.address().port}`;
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes("Easy Testimonials"));
  const asset = fs
    .readdirSync("build/client/assets")
    .find((file) => file.endsWith(".css"));
  assert.ok(asset);
  assert.equal((await fetch(`${origin}/assets/${asset}`)).status, 200);
  const webhook = await fetch(`${origin}/webhooks/app/uninstalled`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Topic": "app/uninstalled",
      "X-Shopify-Shop-Domain": "smoke.myshopify.com",
      "X-Shopify-Hmac-Sha256": "invalid",
    },
    body: "{}",
  });
  assert.equal(webhook.status, 401);
  console.log(
    "Hostinger runtime smoke passed: ready without migration subprocess, real SSR page, static assets, and invalid webhook HMAC rejection.",
  );
} finally {
  await new Promise((resolve) => running.server.close(resolve));
}
