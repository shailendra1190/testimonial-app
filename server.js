/* eslint-env node */
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);

export function validateProductionEnvironment(env) {
  for (const key of [
    "SHOPIFY_API_KEY",
    "SHOPIFY_API_SECRET",
    "SHOPIFY_APP_URL",
    "DATABASE_URL",
  ]) {
    if (!env[key]?.trim())
      throw new Error(`Missing required environment variable: ${key}`);
  }
  const appUrl = new URL(env.SHOPIFY_APP_URL);
  if (
    ![
      "https://testimonials.relieverit.com",
      "https://green-barracuda-892142.hostingersite.com",
    ].includes(appUrl.origin) ||
    appUrl.username ||
    appUrl.password
  ) {
    throw new Error(
      "SHOPIFY_APP_URL must match the configured permanent or temporary Hostinger HTTPS origin",
    );
  }
  if (appUrl.pathname !== "/" || appUrl.search || appUrl.hash)
    throw new Error(
      "SHOPIFY_APP_URL must be the site origin without a path or query.",
    );
  if (!env.DATABASE_URL.startsWith("mysql://"))
    throw new Error(
      "DATABASE_URL must use the Hostinger MySQL database (mysql://).",
    );
}

export async function createProductionHandler() {
  validateProductionEnvironment(process.env);
  process.env.NODE_ENV = "production";
  const root = dirname(fileURLToPath(import.meta.url));
  const [{ default: express }, { createRequestHandler }, build] =
    await Promise.all([
      import("express"),
      import("@react-router/express"),
      import("./build/server/index.js"),
    ]);
  const app = express();
  app.disable("x-powered-by");
  app.use(
    "/assets",
    express.static(join(root, "build/client/assets"), {
      immutable: true,
      maxAge: "1y",
    }),
  );
  app.use(express.static(join(root, "build/client")));
  app.use(express.static(join(root, "public"), { maxAge: "1h" }));
  app.all("*", createRequestHandler({ build, mode: "production" }));
  return app;
}

export function startProduction() {
  const { startServer } = require("./hosting/bootstrap.cjs");
  return startServer({ initialize: createProductionHandler });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  startProduction().ready.catch((error) => {
    console.error("Easy Testimonials startup failed:", error.message);
    process.exitCode = 1;
  });
}
