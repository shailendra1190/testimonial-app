import assert from "node:assert/strict";
import { test } from "node:test";
import { getBuildSteps, runBuild } from "../scripts/build.mjs";

test("Hostinger default build generates MySQL before compiling and migrates after success", () => {
  const steps = [];
  runBuild(
    {
      NODE_ENV: "production",
      DATABASE_URL: "mysql://dummy:dummy@localhost:3306/dummy",
    },
    (step) => steps.push(step),
  );
  assert.deepEqual(steps, [
    {
      tool: "prisma",
      args: ["generate", "--schema", "prisma/hostinger/schema.prisma"],
    },
    { tool: "react-router", args: ["build"] },
    {
      tool: "prisma",
      args: ["migrate", "deploy", "--schema", "prisma/hostinger/schema.prisma"],
    },
  ]);
});
test("Local default build restores SQLite and does not deploy migrations", () => {
  assert.deepEqual(getBuildSteps({}), [
    { tool: "prisma", args: ["generate", "--schema", "prisma/schema.prisma"] },
    { tool: "react-router", args: ["build"] },
  ]);
});
test("Failed compilation stops before migration deployment", () => {
  const steps = [];
  assert.throws(
    () =>
      runBuild(
        { DATABASE_URL: "mysql://dummy:dummy@localhost:3306/dummy" },
        (step) => {
          steps.push(step);
          if (step.tool === "react-router") throw new Error("compile failed");
        },
      ),
    /compile failed/,
  );
  assert.equal(steps.length, 2);
});
test("Production missing or unsupported database configuration fails before running commands", () => {
  assert.throws(
    () => getBuildSteps({ NODE_ENV: "production" }),
    /DATABASE_URL/,
  );
  assert.throws(
    () => getBuildSteps({ DATABASE_URL: "postgres://dummy" }),
    /DATABASE_URL/,
  );
});
