import path from "node:path";
import { defineConfig } from "vitest/config";

// Default environment stays "node" for pure-logic tests.
// Component tests that need a DOM opt in per-file via:
//   // @vitest-environment jsdom
// rather than flipping the project-wide default — keeps the fast, node
// environment for everything that doesn't actually render React.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./src/test-setup.ts"],
  },
});
