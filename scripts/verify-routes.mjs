/* eslint-env node */
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
process.env.NODE_ENV = "production";
process.env.SHOPIFY_API_KEY = "audit-key";
process.env.SHOPIFY_API_SECRET = "audit-secret";
process.env.SHOPIFY_APP_URL = "https://testimonials.relieverit.com";
const shop = "audit-test.myshopify.com";
const calls = [];
let row = null;
// Route integration uses the actual Shopify HMAC validator, with in-memory session storage.
globalThis.prismaGlobal = {
  session: {
    count: async () => 0,
    findUnique: async () => row,
    deleteMany: async (args) => {
      calls.push(["deleteMany", args]);
      return { count: 0 };
    },
    updateMany: async (args) => {
      calls.push(["updateMany", args]);
      return { count: 0 };
    },
  },
};
const { routes } = await import("../build/server/index.js");
const uninstall = routes["routes/webhooks.app.uninstalled"].module.action;
const scopes = routes["routes/webhooks.app.scopes_update"].module.action;
function request(topic, valid = true) {
  const body = JSON.stringify({ current: ["write_metaobjects"] });
  const hmac = createHmac("sha256", process.env.SHOPIFY_API_SECRET)
    .update(body)
    .digest("base64");
  return new Request("https://testimonials.relieverit.com/webhooks", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Topic": topic,
      "X-Shopify-Shop-Domain": shop,
      "X-Shopify-API-Version": "2026-10",
      "X-Shopify-Webhook-Id": randomUUID(),
      "X-Shopify-Hmac-Sha256": valid ? hmac : "invalid",
    },
  });
}
for (const action of [uninstall, scopes]) {
  await assert.rejects(
    action({ request: request("app/uninstalled", false) }),
    (error) => error instanceof Response && error.status === 401,
  );
}
assert.equal(calls.length, 0);
for (let attempt = 0; attempt < 2; attempt++)
  assert.equal(
    (await uninstall({ request: request("app/uninstalled") })).status,
    200,
  );
assert.deepEqual(calls, [
  ["deleteMany", { where: { shop } }],
  ["deleteMany", { where: { shop } }],
]);
row = {
  id: `offline_${shop}`,
  shop,
  state: "",
  isOnline: false,
  scope: "write_metaobjects",
  expires: null,
  accessToken: "audit-token",
};
assert.equal(
  (await scopes({ request: request("app/scopes_update") })).status,
  200,
);
assert.deepEqual(calls.at(-1), [
  "updateMany",
  { where: { id: row.id }, data: { scope: "write_metaobjects" } },
]);
const landing = routes["routes/_index"].module;
assert.equal(
  (
    await landing.loader({
      request: new Request("https://testimonials.relieverit.com"),
    })
  ).showForm,
  false,
);
await assert.rejects(
  landing.action({
    request: new Request("https://testimonials.relieverit.com", {
      method: "POST",
    }),
  }),
  (error) => error instanceof Response && error.status === 403,
);
await assert.rejects(
  landing.loader({
    request: new Request(`https://testimonials.relieverit.com?shop=${shop}`),
  }),
  (error) =>
    error instanceof Response &&
    error.status === 302 &&
    error.headers.get("Location") === `/app?shop=${shop}`,
);
console.log(
  "Route checks passed: invalid HMAC rejected; uninstall retries clean missing sessions; scope updates tolerate concurrent deletion; production login is Shopify-initiated.",
);
