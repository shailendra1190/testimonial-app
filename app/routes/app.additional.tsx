import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};
export default function StorefrontSetup() {
  return (
    <s-page heading="Storefront setup">
      <s-section heading="Show published testimonials">
        <s-ordered-list>
          <s-list-item>
            Open Online Store → Themes → Customize in Shopify admin.
          </s-list-item>
          <s-list-item>
            Open the template where you want customer reviews to appear.
          </s-list-item>
          <s-list-item>
            Add a section, choose Apps, and select Easy Testimonials.
          </s-list-item>
          <s-list-item>
            Set Testimonial source to App dashboard. Choose a heading and the
            maximum number of reviews, then save your theme.
          </s-list-item>
          <s-list-item>
            Return to Testimonials and publish the reviews you want to display.
          </s-list-item>
        </s-ordered-list>
        <s-paragraph>
          Existing blocks keep their manual theme editor reviews until you
          change their source. Dashboard mode displays up to 50 published
          reviews; drafts stay hidden.
        </s-paragraph>
        <s-link href="/app">Manage testimonials</s-link>
      </s-section>
    </s-page>
  );
}
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
export const headers: HeadersFunction = (args) => boundary.headers(args);
