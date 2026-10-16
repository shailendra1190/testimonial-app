import { randomUUID } from "node:crypto";

export const TESTIMONIAL_TYPE = "$app:testimonial";
export interface GraphqlClient {
  graphql(
    query: string,
    options?: { variables: Record<string, unknown> },
  ): Promise<{ json(): Promise<unknown>; status?: number }>;
}
export interface Testimonial {
  id: string;
  handle: string;
  customerName: string;
  review: string;
  rating: number;
  published: boolean;
}
interface Metaobject {
  id: string;
  handle: string;
  type?: string;
  values: { customer_name: string; review: string; rating: number };
  capabilities: { publishable: { status: "ACTIVE" | "DRAFT" } | null };
}
export class TestimonialError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const QUERIES = {
  diagnostics: `#graphql
    query TestimonialDefinitionDiagnostics {
      currentAppInstallation { app { id apiKey } }
      metaobjectDefinitions(first: 50) {
        nodes { type }
        pageInfo { hasNextPage }
      }
    }`,
  setup: `#graphql
    query TestimonialSetup {
      metaobjectDefinitionByType(type: "$app:testimonial") { type }
      currentAppInstallation {
        id
        binding: metafield(namespace: "easy_testimonials", key: "metaobject_type") { value }
      }
    }`,
  bind: `#graphql
    mutation BindTestimonials($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { field message }
      }
    }`,
  list: `#graphql
    query Testimonials($after: String) {
      metaobjects(type: "$app:testimonial", first: 25, after: $after, sortKey: "updated_at", reverse: true) {
        nodes { id handle values capabilities { publishable { status } } }
        pageInfo { hasNextPage endCursor }
      }
    }`,
  get: `#graphql
    query Testimonial($id: ID!) {
      metaobject(id: $id) { id handle type values capabilities { publishable { status } } }
      metaobjectDefinitionByType(type: "$app:testimonial") { type }
    }`,
  save: `#graphql
    mutation SaveTestimonial($handle: MetaobjectHandleInput!, $values: JSON!) {
      metaobjectUpsert(handle: $handle, values: $values) {
        metaobject { id }
        userErrors { field message }
      }
    }`,
  status: `#graphql
    mutation PublishTestimonial($id: ID!, $metaobject: MetaobjectUpdateInput!) {
      metaobjectUpdate(id: $id, metaobject: $metaobject) {
        metaobject { id }
        userErrors { field message }
      }
    }`,
  delete: `#graphql
    mutation DeleteTestimonial($id: ID!) {
      metaobjectDelete(id: $id) { deletedId userErrors { field message } }
    }`,
};

// Only definition identifiers are logged; never tokens, reviews or customer data.
export async function diagnoseMissingDefinition(admin: GraphqlClient) {
  try {
    const result = await query<{
      currentAppInstallation: { app: { id: string; apiKey: string } };
      metaobjectDefinitions: {
        nodes: { type: string }[];
        pageInfo: { hasNextPage: boolean };
      };
    }>(admin, QUERIES.diagnostics);
    console.warn("Testimonial definition diagnostic", JSON.stringify({
      requestedType: TESTIMONIAL_TYPE,
      authenticatedApp: result.currentAppInstallation.app,
      visibleDefinitionTypes: result.metaobjectDefinitions.nodes.map(({ type }) => type),
      moreDefinitions: result.metaobjectDefinitions.pageInfo.hasNextPage,
    }));
  } catch {
    console.warn("Testimonial definition diagnostic unavailable");
  }
}

async function query<T>(
  admin: GraphqlClient,
  document: string,
  variables: Record<string, unknown> = {},
  supportContext?: { shop: string; apiVersion: string },
): Promise<T> {
  const requestedAtUtc = new Date().toISOString();
  const response = await admin.graphql(document, { variables });
  const result = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
    extensions?: unknown;
    headers?: Record<string, string | string[]>;
  };
  if (supportContext && document === QUERIES.setup &&
      (result.errors?.length || (result.data as { metaobjectDefinitionByType?: unknown })?.metaobjectDefinitionByType === null)) {
    // The Shopify React Router SDK puts upstream headers in the JSON payload,
    // rather than on the synthetic Response returned by admin.graphql.
    const responseHeaders = Object.fromEntries(
      Object.entries(result.headers ?? {}).filter(([key]) =>
        ["x-request-id", "x-shopify-api-version", "date", "content-type"].includes(key.toLowerCase()),
      ),
    );
    console.warn("Testimonial definition support capture", JSON.stringify({
      requestedAtUtc,
      receivedAtUtc: new Date().toISOString(),
      timezone: "UTC",
      configuredApiVersion: supportContext.apiVersion,
      request: {
        method: "POST",
        url: `https://${supportContext.shop}/admin/api/${supportContext.apiVersion}/graphql.json`,
        headers: { "Content-Type": "application/json" },
        body: { query: document, variables },
      },
      response: {
        headers: responseHeaders,
        body: { data: result.data, errors: result.errors, extensions: result.extensions },
      },
    }));
  }
  if (result.errors?.length || !result.data) {
    throw new TestimonialError(
      "Shopify could not complete the request. Please retry.",
      502,
    );
  }
  return result.data;
}
function checkErrors(
  payload: { userErrors: { message: string }[] } | null | undefined,
) {
  if (!payload)
    throw new TestimonialError(
      "Shopify returned an incomplete response. Please retry.",
      502,
    );
  if (payload.userErrors.length)
    throw new TestimonialError(
      payload.userErrors.map((e) => e.message).join(" "),
    );
}
function fromMetaobject(node: Metaobject): Testimonial {
  return {
    id: node.id,
    handle: node.handle,
    customerName: node.values.customer_name,
    review: node.values.review,
    rating: Number(node.values.rating),
    published: node.capabilities.publishable?.status === "ACTIVE",
  };
}

// App-data stores only the resolved type, so Liquid never needs a hardcoded app ID.
export async function ensureStorefrontBinding(
  admin: GraphqlClient,
  supportContext?: { shop: string; apiVersion: string },
): Promise<boolean> {
  const result = await query<{
    metaobjectDefinitionByType: { type: string } | null;
    currentAppInstallation: { id: string; binding: { value: string } | null };
  }>(admin, QUERIES.setup, {}, supportContext);
  if (!result.metaobjectDefinitionByType) return false;
  const type = result.metaobjectDefinitionByType.type;
  if (result.currentAppInstallation.binding?.value !== type) {
    const bound = await query<{
      metafieldsSet: { userErrors: { message: string }[] };
    }>(admin, QUERIES.bind, {
      metafields: [
        {
          ownerId: result.currentAppInstallation.id,
          namespace: "easy_testimonials",
          key: "metaobject_type",
          type: "single_line_text_field",
          value: type,
        },
      ],
    });
    checkErrors(bound.metafieldsSet);
  }
  return true;
}
export async function listTestimonials(
  admin: GraphqlClient,
  after: string | null = null,
) {
  const result = await query<{
    metaobjects: {
      nodes: Metaobject[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  }>(admin, QUERIES.list, { after });
  return {
    testimonials: result.metaobjects.nodes.map(fromMetaobject),
    pageInfo: result.metaobjects.pageInfo,
  };
}
async function ownedTestimonial(admin: GraphqlClient, id: string) {
  if (!/^gid:\/\/shopify\/Metaobject\/\d+$/.test(id))
    throw new TestimonialError("Invalid testimonial ID.");
  const result = await query<{
    metaobject: Metaobject | null;
    metaobjectDefinitionByType: { type: string } | null;
  }>(admin, QUERIES.get, { id });
  if (
    !result.metaobject ||
    result.metaobject.type !== result.metaobjectDefinitionByType?.type
  ) {
    throw new TestimonialError("Testimonial not found.", 404);
  }
  return result.metaobject;
}
export function validateTestimonial(form: FormData) {
  const customerName = String(form.get("customerName") ?? "").trim();
  const review = String(form.get("review") ?? "").trim();
  const rating = Number(form.get("rating"));
  if (
    !customerName ||
    customerName.length > 100 ||
    /[\r\n]/.test(customerName)
  ) {
    throw new TestimonialError(
      "Enter a customer name of 1–100 characters on a single line.",
    );
  }
  if (!review || review.length > 5000)
    throw new TestimonialError("Enter a review of 1–5,000 characters.");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    throw new TestimonialError("Select a whole star rating from 1 to 5.");
  return { customer_name: customerName, review, rating };
}
export async function mutateTestimonial(admin: GraphqlClient, form: FormData) {
  const intent = String(form.get("intent") ?? "");
  if (!["create", "edit", "publish", "unpublish", "delete"].includes(intent))
    throw new TestimonialError("Unknown action.");
  if (intent === "create" || intent === "edit") {
    const values = validateTestimonial(form);
    const existing =
      intent === "edit"
        ? await ownedTestimonial(admin, String(form.get("id") ?? ""))
        : null;
    const result = await query<{
      metaobjectUpsert: {
        metaobject: { id: string } | null;
        userErrors: { message: string }[];
      };
    }>(admin, QUERIES.save, {
      handle: {
        type: TESTIMONIAL_TYPE,
        handle: existing?.handle ?? `testimonial-${randomUUID()}`,
      },
      values,
    });
    checkErrors(result.metaobjectUpsert);
    if (!result.metaobjectUpsert.metaobject)
      throw new TestimonialError("Shopify did not save the testimonial.", 502);
    // Publishable definitions create entries as DRAFT; edits preserve the existing status.
    return intent === "create"
      ? "Testimonial added as draft."
      : "Testimonial updated.";
  }
  const existing = await ownedTestimonial(admin, String(form.get("id") ?? ""));
  if (intent === "delete") {
    const result = await query<{
      metaobjectDelete: {
        deletedId: string | null;
        userErrors: { message: string }[];
      };
    }>(admin, QUERIES.delete, { id: existing.id });
    checkErrors(result.metaobjectDelete);
    if (!result.metaobjectDelete.deletedId)
      throw new TestimonialError(
        "Shopify did not delete the testimonial.",
        502,
      );
    return "Testimonial deleted.";
  }
  const result = await query<{
    metaobjectUpdate: {
      metaobject: { id: string } | null;
      userErrors: { message: string }[];
    };
  }>(admin, QUERIES.status, {
    id: existing.id,
    metaobject: {
      capabilities: {
        publishable: { status: intent === "publish" ? "ACTIVE" : "DRAFT" },
      },
    },
  });
  checkErrors(result.metaobjectUpdate);
  if (!result.metaobjectUpdate.metaobject)
    throw new TestimonialError(
      "Shopify did not update publishing status.",
      502,
    );
  return intent === "publish"
    ? "Testimonial published."
    : "Testimonial unpublished.";
}
