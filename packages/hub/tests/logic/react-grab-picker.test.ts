// @vitest-environment node

import { test } from "vitest";

test("passes the React Grab picker regression suite", async () => {
  await import("../react-grab-picker-regression.mjs");
}, 30_000);
