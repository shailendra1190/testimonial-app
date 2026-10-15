/* eslint-env node */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, Form, useActionData, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  // Public-app installation must start from Shopify. Keep template login for local development.
  return { showForm: process.env.NODE_ENV !== "production" && Boolean(login) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (process.env.NODE_ENV === "production") {
    throw new Response(
      "Open Easy Testimonials from your Shopify admin after installing it through Shopify.",
      { status: 403 },
    );
  }
  const errors = loginErrorMessage(await login(request));

  return { errors };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors = actionData?.errors;

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Easy Testimonials</h1>
        <p className={styles.text}>
          Manage customer testimonials and publish selected reviews on your
          storefront.
        </p>
        {!showForm && (
          <p className={styles.text}>
            Open Easy Testimonials from Apps in your Shopify admin. New
            installations must start from Shopify.
          </p>
        )}
        {showForm && (
          <Form className={styles.form} method="post">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>{errors?.shop ?? "e.g: my-shop-domain.myshopify.com"}</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Manage reviews</strong>. Add, edit, and delete customer
            testimonials.
          </li>
          <li>
            <strong>Control publishing</strong>. Keep drafts private until you
            choose to publish.
          </li>
          <li>
            <strong>Theme integration</strong>. Display ratings and reviews
            using the Easy Testimonials app block.
          </li>
        </ul>
      </div>
    </div>
  );
}
