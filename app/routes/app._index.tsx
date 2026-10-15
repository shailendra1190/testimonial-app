import { useEffect, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  data,
  useFetcher,
  useLoaderData,
  useNavigate,
  useRouteError,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  ensureStorefrontBinding,
  listTestimonials,
  mutateTestimonial,
  TestimonialError,
} from "../models/testimonials.server";
import type { Testimonial } from "../models/testimonials.server";
import "../styles/dashboard.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const after = new URL(request.url).searchParams.get("after");
  try {
    const ready = await ensureStorefrontBinding(admin);
    if (!ready)
      return {
        ready,
        testimonials: [],
        pageInfo: { hasNextPage: false, endCursor: null },
        error: null,
      };
    return { ready, ...(await listTestimonials(admin, after)), error: null };
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error(
      "Failed to load testimonials",
      error instanceof TestimonialError
        ? error.message
        : "Shopify request failed",
    );
    return data(
      {
        ready: false,
        testimonials: [],
        pageInfo: { hasNextPage: false, endCursor: null },
        error: "Testimonials could not be loaded. Please reload and try again.",
      },
      { status: 502 },
    );
  }
};
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  try {
    const message = await mutateTestimonial(admin, await request.formData());
    return data({ ok: true as const, message });
  } catch (error) {
    if (error instanceof Response) throw error;
    return data(
      {
        ok: false as const,
        message:
          error instanceof TestimonialError
            ? error.message
            : "Shopify could not save your changes. Please retry.",
      },
      { status: error instanceof TestimonialError ? error.status : 502 },
    );
  }
};

export default function TestimonialsDashboard() {
  const { testimonials, pageInfo, ready, error } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const bridge = useAppBridge();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Testimonial | null | undefined>(
    undefined,
  );
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const formRef = useRef<HTMLFormElement>(null);
  const busy = fetcher.state !== "idle";
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      bridge.toast.show(fetcher.data.message);
      setEditing(undefined);
      setDeleting(null);
    }
  }, [fetcher.state, fetcher.data, bridge]);
  useEffect(() => {
    if (editing !== undefined)
      formRef.current
        ?.querySelector<HTMLInputElement>("input[name=customerName]")
        ?.focus();
  }, [editing]);
  const visible = testimonials.filter(
    (item) => filter === "all" || item.published === (filter === "published"),
  );
  function submit(intent: string, id: string) {
    fetcher.submit({ intent, id }, { method: "POST" });
  }
  return (
    <s-page heading="Easy Testimonials">
      <s-button
        slot="primary-action"
        variant="primary"
        {...(!ready || busy ? { disabled: true } : {})}
        onClick={() => setEditing(null)}
      >
        Add testimonial
      </s-button>
      {error && (
        <s-banner heading="Unable to load testimonials" tone="critical">
          {error}
        </s-banner>
      )}
      {!ready && !error && (
        <s-banner heading="Finish app setup" tone="warning">
          The testimonial definition is not installed yet. Apply the updated app
          configuration with Shopify CLI, then reload this page.
        </s-banner>
      )}
      {fetcher.data && !fetcher.data.ok && (
        <s-banner heading="Changes were not saved" tone="critical">
          {fetcher.data.message}
        </s-banner>
      )}
      {editing !== undefined && (
        <s-section heading={editing ? "Edit testimonial" : "Add testimonial"}>
          <fetcher.Form
            method="post"
            ref={formRef}
            key={editing?.id ?? "new"}
            className="testimonial-form"
          >
            <input
              type="hidden"
              name="intent"
              value={editing ? "edit" : "create"}
            />
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <label htmlFor="customer-name">Customer name</label>
            <input
              id="customer-name"
              name="customerName"
              defaultValue={editing?.customerName ?? ""}
              maxLength={100}
              required
              {...(busy ? { disabled: true } : {})}
            />
            <label htmlFor="review">Review</label>
            <textarea
              id="review"
              name="review"
              defaultValue={editing?.review ?? ""}
              maxLength={5000}
              rows={5}
              required
              {...(busy ? { disabled: true } : {})}
            />
            <fieldset
              {...(busy ? { disabled: true } : {})}
              className="testimonial-rating"
            >
              <legend>Star rating</legend>
              {[1, 2, 3, 4, 5].map((rating) => (
                <label key={rating}>
                  <input
                    type="radio"
                    name="rating"
                    value={rating}
                    defaultChecked={rating === (editing?.rating ?? 5)}
                    required
                  />
                  {rating} <span aria-hidden="true">★</span>
                </label>
              ))}
            </fieldset>
            <s-paragraph color="subdued">
              {editing
                ? "Saving keeps the current publishing status."
                : "New testimonials are saved as drafts. Publish them when they are ready."}
            </s-paragraph>
            <s-stack direction="inline" gap="base">
              <s-button
                type="submit"
                variant="primary"
                {...(busy ? { loading: true } : {})}
                {...(busy ? { disabled: true } : {})}
              >
                Save testimonial
              </s-button>
              <s-button
                {...(busy ? { disabled: true } : {})}
                onClick={() => setEditing(undefined)}
              >
                Cancel
              </s-button>
            </s-stack>
          </fetcher.Form>
        </s-section>
      )}
      <s-section heading="Your testimonials">
        <div className="testimonial-toolbar">
          <p>
            {testimonials.length} testimonials on this page ·{" "}
            {testimonials.filter((item) => item.published).length} published
          </p>
          <label htmlFor="status-filter">
            Show{" "}
            <select
              id="status-filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="published">Published</option>
              <option value="draft">Drafts</option>
            </select>
          </label>
        </div>
        {!visible.length && (
          <s-paragraph>
            {testimonials.length
              ? "No testimonials match this filter."
              : "Add your first testimonial, then publish it to display it on your storefront."}
          </s-paragraph>
        )}
        <div className="testimonial-list">
          {visible.map((item) => (
            <article className="testimonial-item" key={item.id}>
              <s-stack direction="inline" gap="base" alignItems="center">
                <s-heading>{item.customerName}</s-heading>
                <s-badge tone={item.published ? "success" : "neutral"}>
                  {item.published ? "Published" : "Draft"}
                </s-badge>
              </s-stack>
              <p
                className="testimonial-stars"
                aria-label={`${item.rating} out of 5 stars`}
              >
                <span aria-hidden="true">
                  {"★".repeat(item.rating)}
                  {"☆".repeat(5 - item.rating)}
                </span>
              </p>
              <p className="testimonial-review">{item.review}</p>
              <s-stack direction="inline" gap="base">
                <s-button
                  {...(busy ? { disabled: true } : {})}
                  onClick={() => setEditing(item)}
                >
                  Edit
                </s-button>
                <s-button
                  {...(busy ? { disabled: true } : {})}
                  onClick={() =>
                    submit(item.published ? "unpublish" : "publish", item.id)
                  }
                >
                  {item.published ? "Unpublish" : "Publish"}
                </s-button>
                <s-button
                  tone="critical"
                  {...(busy ? { disabled: true } : {})}
                  onClick={() => setDeleting(item.id)}
                >
                  Delete
                </s-button>
              </s-stack>
              {deleting === item.id && (
                <div className="testimonial-delete" role="alert">
                  <p>
                    Delete the testimonial from {item.customerName}? This
                    permanently removes it from your storefront and app.
                  </p>
                  <s-stack direction="inline" gap="base">
                    <s-button
                      tone="critical"
                      variant="primary"
                      {...(busy ? { disabled: true } : {})}
                      onClick={() => submit("delete", item.id)}
                    >
                      Confirm delete
                    </s-button>
                    <s-button
                      {...(busy ? { disabled: true } : {})}
                      onClick={() => setDeleting(null)}
                    >
                      Cancel
                    </s-button>
                  </s-stack>
                </div>
              )}
            </article>
          ))}
        </div>
        <s-stack direction="inline" gap="base">
          <s-button
            {...(busy ? { disabled: true } : {})}
            onClick={() => navigate("/app")}
          >
            First page
          </s-button>
          {pageInfo.hasNextPage && pageInfo.endCursor && (
            <s-button
              {...(busy ? { disabled: true } : {})}
              onClick={() =>
                navigate(
                  `/app?after=${encodeURIComponent(pageInfo.endCursor!)}`,
                )
              }
            >
              Next page
            </s-button>
          )}
        </s-stack>
      </s-section>
      <s-section slot="aside" heading="Display on your storefront">
        <s-paragraph>
          Add the Easy Testimonials app block in your theme editor and set
          Testimonial source to App dashboard. Only published testimonials
          appear.
        </s-paragraph>
        <s-link href="/app/additional">Storefront setup instructions</s-link>
      </s-section>
    </s-page>
  );
}
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
export const headers: HeadersFunction = (args) => boundary.headers(args);
