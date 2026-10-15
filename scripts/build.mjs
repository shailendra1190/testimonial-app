/* eslint-env node */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);

export function getBuildSteps(env) {
  const databaseUrl = env.DATABASE_URL || "";
  const mysql = databaseUrl.startsWith("mysql://");
  if (
    (databaseUrl && !mysql && !databaseUrl.startsWith("file:")) ||
    (!databaseUrl && env.NODE_ENV === "production")
  ) {
    throw new Error(
      "Set DATABASE_URL to a MySQL URL in Hostinger before building. Local development may use SQLite.",
    );
  }
  const schema = mysql
    ? "prisma/hostinger/schema.prisma"
    : "prisma/schema.prisma";
  const steps = [
    { tool: "prisma", args: ["generate", "--schema", schema] },
    { tool: "react-router", args: ["build"] },
  ];
  if (mysql)
    steps.push({
      tool: "prisma",
      args: ["migrate", "deploy", "--schema", schema],
    });
  return steps;
}

function executeStep(step, env) {
  const cli =
    step.tool === "prisma"
      ? join(dirname(require.resolve("prisma/package.json")), "build/index.js")
      : join(
          dirname(require.resolve("@react-router/dev/package.json")),
          "bin.js",
        );
  const result = spawnSync(process.execPath, [cli, ...step.args], {
    stdio: "inherit",
    env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${step.tool} ${step.args[0]} failed (${result.signal ?? result.status}).`,
    );
}

export function runBuild(env = process.env, execute = executeStep) {
  const steps = getBuildSteps(env);
  console.log(
    `Building Easy Testimonials with ${steps.length === 3 ? "Hostinger MySQL" : "local SQLite"} configuration.`,
  );
  for (const step of steps) execute(step, env);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    runBuild();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
