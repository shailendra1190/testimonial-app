import assert from "node:assert/strict";
import { test } from "node:test";
import {
  QUERIES,
  TestimonialError,
  ensureStorefrontBinding,
  diagnoseMissingDefinition,
  listTestimonials,
  mutateTestimonial,
  validateTestimonial,
} from "../app/models/testimonials.server.ts";

const id = "gid://shopify/Metaobject/1";
const type = "app--123--testimonial";
const entry = {
  id,
  type,
  handle: "existing",
  values: { customer_name: "Ada", review: "Excellent!", rating: 5 },
  capabilities: { publishable: { status: "ACTIVE" } },
};
function client(responses) {
  const calls = [];
  return {
    calls,
    async graphql(document, options) {
      calls.push({ document, variables: options.variables });
      const response = responses.shift();
      assert.ok(response, "Unexpected GraphQL call");
      if (response instanceof Error) throw response;
      return { json: async () => response };
    },
  };
}
function form(intent, extra = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ intent, ...extra }))
    result.set(key, String(value));
  return result;
}
const content = {
  customerName: " Ada ",
  review: " Great product! ",
  rating: 4,
};
test("missing-definition diagnostics log identifiers only and tolerate API failures", async (t) => {
  const warnings = [];
  t.mock.method(console, "warn", (...args) => warnings.push(args));
  const admin = client([{ data: {
    currentAppInstallation: { app: { id: "gid://shopify/App/123", apiKey: "public-key" } },
    metaobjectDefinitions: {
      nodes: [{ type: "app--123--example" }], pageInfo: { hasNextPage: false },
    },
    accessToken: "must-not-log",
  } }]);
  await diagnoseMissingDefinition(admin);
  assert.equal(admin.calls[0].document, QUERIES.diagnostics);
  const logged = JSON.parse(warnings[0][1]);
  assert.equal(logged.authenticatedApp.apiKey, "public-key");
  assert.deepEqual(logged.visibleDefinitionTypes, ["app--123--example"]);
  assert.equal(JSON.stringify(warnings).includes("must-not-log"), false);
  await diagnoseMissingDefinition(client([new Error("secret-error-details")]));
  assert.deepEqual(warnings[1], ["Testimonial definition diagnostic unavailable"]);
});
const owned = {
  data: { metaobject: entry, metaobjectDefinitionByType: { type } },
};
const saved = {
  data: { metaobjectUpsert: { metaobject: { id }, userErrors: [] } },
};

test("validates and trims text while preserving line breaks in reviews", () => {
  assert.deepEqual(validateTestimonial(form("create", content)), {
    customer_name: "Ada",
    review: "Great product!",
    rating: 4,
  });
  assert.equal(
    validateTestimonial(
      form("create", { ...content, review: "Line 1\nLine 2" }),
    ).review,
    "Line 1\nLine 2",
  );
});
test("rejects invalid ratings, blank and oversized text before making API calls", async () => {
  for (const extra of [
    { rating: 0 },
    { rating: 6 },
    { rating: 2.5 },
    { rating: "hello" },
    { rating: "" },
    { customerName: " " },
    { customerName: "a".repeat(101) },
    { customerName: "A\nB" },
    { review: " " },
    { review: "a".repeat(5001) },
  ]) {
    const admin = client([]);
    await assert.rejects(
      mutateTestimonial(admin, form("create", { ...content, ...extra })),
      TestimonialError,
    );
    assert.equal(admin.calls.length, 0);
  }
});
test("creates app-owned entries as drafts without a publish mutation", async () => {
  const admin = client([saved]);
  assert.equal(
    await mutateTestimonial(admin, form("create", content)),
    "Testimonial added as draft.",
  );
  assert.equal(admin.calls.length, 1);
  assert.equal(admin.calls[0].document, QUERIES.save);
  assert.equal(admin.calls[0].variables.handle.type, "$app:testimonial");
  assert.match(admin.calls[0].variables.handle.handle, /^testimonial-/);
  assert.deepEqual(admin.calls[0].variables.values, {
    customer_name: "Ada",
    review: "Great product!",
    rating: 4,
  });
});
test("edits a verified entry using its existing handle and preserves publishing status", async () => {
  const admin = client([owned, saved]);
  await mutateTestimonial(admin, form("edit", { ...content, id }));
  assert.equal(admin.calls[1].variables.handle.handle, "existing");
  assert.equal(admin.calls.length, 2);
});
test("publish and unpublish patch only capabilities", async () => {
  for (const [intent, status] of [
    ["publish", "ACTIVE"],
    ["unpublish", "DRAFT"],
  ]) {
    const admin = client([
      owned,
      { data: { metaobjectUpdate: { metaobject: { id }, userErrors: [] } } },
    ]);
    await mutateTestimonial(admin, form(intent, { id }));
    assert.deepEqual(admin.calls[1].variables, {
      id,
      metaobject: { capabilities: { publishable: { status } } },
    });
  }
});
test("deletes a verified entry and checks Shopify confirmation", async () => {
  const admin = client([
    owned,
    { data: { metaobjectDelete: { deletedId: id, userErrors: [] } } },
  ]);
  assert.equal(
    await mutateTestimonial(admin, form("delete", { id })),
    "Testimonial deleted.",
  );
  assert.equal(admin.calls[1].document, QUERIES.delete);
});
test("rejects missing, foreign-type and cross-shop IDs for every existing-entry action", async () => {
  for (const intent of ["edit", "publish", "unpublish", "delete"]) {
    for (const metaobject of [null, { ...entry, type: "another_app" }]) {
      const admin = client([
        { data: { metaobject, metaobjectDefinitionByType: { type } } },
      ]);
      await assert.rejects(
        mutateTestimonial(admin, form(intent, { ...content, id })),
        (error) => error.status === 404,
      );
      assert.equal(admin.calls.length, 1);
    }
    const admin = client([]);
    await assert.rejects(
      mutateTestimonial(admin, form(intent, { ...content, id: "invalid" })),
      TestimonialError,
    );
    assert.equal(admin.calls.length, 0);
  }
});
test("rejects unknown actions", async () => {
  await assert.rejects(
    mutateTestimonial(client([]), form("unknown")),
    /Unknown action/,
  );
});
test("reports user errors and rejects GraphQL errors and incomplete responses", async () => {
  for (const response of [
    { errors: [{ message: "Access denied" }] },
    { data: { metaobjectUpsert: null } },
    { data: { metaobjectUpsert: { metaobject: null, userErrors: [] } } },
    {
      data: {
        metaobjectUpsert: {
          metaobject: null,
          userErrors: [{ message: "Rating is invalid" }],
        },
      },
    },
  ]) {
    await assert.rejects(
      mutateTestimonial(client([response]), form("create", content)),
      TestimonialError,
    );
  }
});
test("lists a bounded page with cursor and maps publish status", async () => {
  const admin = client([
    {
      data: {
        metaobjects: {
          nodes: [
            entry,
            {
              ...entry,
              id: "gid://shopify/Metaobject/2",
              capabilities: { publishable: { status: "DRAFT" } },
            },
          ],
          pageInfo: { hasNextPage: true, endCursor: "next" },
        },
      },
    },
  ]);
  const result = await listTestimonials(admin, "previous");
  assert.equal(result.testimonials[0].published, true);
  assert.equal(result.testimonials[1].published, false);
  assert.deepEqual(result.pageInfo, { hasNextPage: true, endCursor: "next" });
  assert.equal(admin.calls[0].variables.after, "previous");
});
test("binds Liquid to resolved app-owned type, only when necessary", async () => {
  const setup = (binding) => ({
    data: {
      metaobjectDefinitionByType: { type },
      currentAppInstallation: {
        id: "gid://shopify/AppInstallation/10",
        binding,
      },
    },
  });
  const admin = client([
    setup(null),
    { data: { metafieldsSet: { userErrors: [] } } },
  ]);
  assert.equal(await ensureStorefrontBinding(admin), true);
  assert.equal(admin.calls[1].variables.metafields[0].value, type);
  const alreadyBound = client([setup({ value: type })]);
  assert.equal(await ensureStorefrontBinding(alreadyBound), true);
  assert.equal(alreadyBound.calls.length, 1);
  assert.equal(
    await ensureStorefrontBinding(
      client([
        {
          data: {
            metaobjectDefinitionByType: null,
            currentAppInstallation: { id: "1", binding: null },
          },
        },
      ]),
    ),
    false,
  );
});
