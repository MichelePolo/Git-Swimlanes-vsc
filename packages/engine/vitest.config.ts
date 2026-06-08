import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // .ts for pure-function tests, .tsx for component tests.
    include: ["test/**/*.test.{ts,tsx}"],
    // Node by default (fast); component test files opt into jsdom via
    // a `// @vitest-environment jsdom` pragma at the top of the file.
    environment: "node",
    setupFiles: ["./test/setup.ts"],
  },
});
