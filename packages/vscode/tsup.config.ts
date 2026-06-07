import { defineConfig } from "tsup";

export default defineConfig({
  entry: { extension: "src/extension.ts" },
  format: ["cjs"],
  target: "node18",
  external: ["vscode"],
  sourcemap: true,
  clean: true,
});
