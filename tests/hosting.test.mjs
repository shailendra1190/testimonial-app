import assert from "node:assert/strict";
import { test } from "node:test";
import { validateProductionEnvironment } from "../server.js";
const valid = {
  SHOPIFY_API_KEY: "test",
  SHOPIFY_API_SECRET: "test",
  SHOPIFY_APP_URL: "https://testimonials.relieverit.com",
  DATABASE_URL: "mysql://user:password@localhost:3306/test",
};
test("Hostinger environment accepts the production domain and MySQL", () => {
  assert.doesNotThrow(() => validateProductionEnvironment(valid));
});
test("Hostinger startup rejects missing settings, insecure URLs, wrong hosts and SQLite", () => {
  for (const key of Object.keys(valid))
    assert.throws(
      () => validateProductionEnvironment({ ...valid, [key]: "" }),
      /Missing required/,
    );
  for (const url of [
    "http://testimonials.relieverit.com",
    "https://example.com",
    "https://testimonials.relieverit.com/app",
    "https://testimonials.relieverit.com?foo=bar",
  ])
    assert.throws(() =>
      validateProductionEnvironment({ ...valid, SHOPIFY_APP_URL: url }),
    );
  assert.throws(
    () =>
      validateProductionEnvironment({
        ...valid,
        DATABASE_URL: "file:dev.sqlite",
      }),
    /MySQL/,
  );
});
