import path from "node:path";
import { defineConfig } from "vitest/config";

// Default environment stays "node" for pure-logic tests.
// Component tests that need a DOM opt in per-file via:
//   // @vitest-environment jsdom
// rather than flipping the project-wide default — keeps the fast, node
// environment for everything that doesn't actually render React.
export default defineConfig({
  // Components under test use the automatic JSX runtime, so no `import React`.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // konva's "main" is ./lib/index-node.js, which does require("canvas") —
      // a native module that is not installed. Point at the "browser" entry
      // the app actually ships, so canvas logic is reachable from a test.
      //
      // This does NOT make a Konva.Stage constructible: jsdom's
      // getContext("2d") returns null and Stage throws on it. Container-level
      // work (find, moveToTop, getAttrs/setAttrs, remove/add, draggable) needs
      // no canvas at all, which is why helpers should be typed against
      // Konva.Container rather than Konva.Layer — a test can then pass a bare
      // Konva.Group. Anything that genuinely needs a Stage belongs in
      // frontend/e2e/ under Playwright.
      konva: path.resolve(__dirname, "./node_modules/konva/lib/index.js"),
    },
  },
  test: {
    // setupFiles loads @testing-library/jest-dom, which calls expect.extend at
    // module scope. Without globals every test file dies before collection
    // with "expect is not defined" — invisible until now because
    // --passWithNoTests kept `npm test` green with zero tests.
    globals: true,
    // Playwright owns e2e/. Without this, `vitest run` also collects
    // e2e/*.spec.ts, which import @playwright/test and cannot run here.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    environment: "node",
    setupFiles: ["./src/test-setup.ts"],
  },
});
