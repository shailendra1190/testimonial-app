import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createStaticRouter, StaticRouterProvider } from "react-router";

// Dummy configuration permits importing the build; no authenticated request runs.
process.env.SHOPIFY_API_KEY ||= "test-key";
process.env.SHOPIFY_API_SECRET ||= "test-secret";
process.env.SHOPIFY_APP_URL ||= "https://example.com";
const build = await import("../build/server/index.js");
function render(routeId, loaderData) {
  const route = {
    id: "dashboard",
    path: "/app",
    Component: build.routes[routeId].module.default,
  };
  const context = {
    basename: "/",
    location: {
      pathname: "/app",
      search: "",
      hash: "",
      state: null,
      key: "default",
    },
    matches: [{ params: {}, pathname: "/app", pathnameBase: "/app", route }],
    loaderData: { dashboard: loaderData },
    actionData: null,
    errors: null,
    statusCode: 200,
    loaderHeaders: {},
    actionHeaders: {},
  };
  return renderToStaticMarkup(
    React.createElement(StaticRouterProvider, {
      router: createStaticRouter([route], context),
      context,
      hydrate: false,
    }),
  );
}
const empty = {
  ready: true,
  error: null,
  testimonials: [],
  pageInfo: { hasNextPage: false, endCursor: null },
};
const html = render("routes/app._index", {
  ...empty,
  testimonials: [
    {
      id: "gid://shopify/Metaobject/1",
      handle: "test",
      customerName: "Ada <script>",
      review: "<img src=x onerror=alert(1)>",
      rating: 5,
      published: true,
    },
    {
      id: "gid://shopify/Metaobject/2",
      handle: "draft",
      customerName: "Lin",
      review: "Draft review",
      rating: 3,
      published: false,
    },
  ],
  pageInfo: { hasNextPage: true, endCursor: "next" },
});
assert.ok(html.includes("Ada &lt;script&gt;"));
assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
assert.ok(!html.includes("<img src=x"));
for (const action of ["Edit", "Delete", "Unpublish", "Publish", "Next page"])
  assert.ok(html.includes(action));
assert.ok(
  !/<s-button[^>]*disabled/.test(html),
  "Ready dashboard buttons must be enabled",
);
assert.ok(
  render("routes/app._index", empty).includes("Add your first testimonial"),
);
assert.ok(
  render("routes/app._index", { ...empty, ready: false }).includes(
    "Finish app setup",
  ),
);
assert.ok(
  render("routes/app._index", {
    ...empty,
    ready: false,
    error: "Please retry",
  }).includes("Unable to load testimonials"),
);
const setup = render("routes/app.additional", null);
assert.ok(setup.includes("App dashboard"));
fs.mkdirSync("node_modules/.cache", { recursive: true });
fs.writeFileSync("node_modules/.cache/dashboard-validation.html", html);
fs.writeFileSync("node_modules/.cache/setup-validation.html", setup);
console.log(
  "Dashboard rendering passed: escaping, actions, enabled buttons, pagination, empty/error/setup states.",
);
