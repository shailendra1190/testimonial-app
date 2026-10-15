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
  assert.doesNotThrow(() =>
    validateProductionEnvironment({
      ...valid,
      SHOPIFY_APP_URL: "https://green-barracuda-892142.hostingersite.com",
    }),
  );
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
    "http://green-barracuda-892142.hostingersite.com",
    "https://different.hostingersite.com",
    "https://green-barracuda-892142.hostingersite.com:444",
    "https://user:password@green-barracuda-892142.hostingersite.com",
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
import { once } from "node:events";
import { startServer } from "../hosting/bootstrap.cjs";

test("Hostinger listens before initialization finishes and then serves the app in-process", async () => {
  let finish;
  const initializing = new Promise((resolve) => {
    finish = resolve;
  });
  const running = startServer({
    port: 0,
    host: "127.0.0.1",
    logger: { log() {} },
    initialize: () => initializing,
  });
  await once(running.server, "listening");
  const url = `http://127.0.0.1:${running.server.address().port}`;
  try {
    const waiting = await fetch(url);
    assert.equal(waiting.status, 503);
    assert.equal(waiting.headers.get("retry-after"), "5");
    finish((request, response) => {
      response.end("app ready");
    });
    await running.ready;
    const ready = await fetch(url);
    assert.equal(ready.status, 200);
    assert.equal(await ready.text(), "app ready");
  } finally {
    await new Promise((resolve) => running.server.close(resolve));
  }
});

test("Hostinger initialization failure closes the listener instead of reporting readiness", async () => {
  let fail;
  const initializing = new Promise((resolve, reject) => {
    fail = reject;
  });
  const running = startServer({
    port: 0,
    host: "127.0.0.1",
    logger: { log() {} },
    initialize: () => initializing,
  });
  await once(running.server, "listening");
  fail(new Error("Migration failed"));
  await assert.rejects(running.ready, /Migration failed/);
  assert.equal(running.server.listening, false);
});
