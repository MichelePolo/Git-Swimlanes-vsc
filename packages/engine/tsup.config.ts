import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ["react", "react-dom", "react/jsx-runtime"],
  },
  {
    entry: { engine: "src/webview.ts" },
    format: ["iife"],
    globalName: "GitSwimlanesBundle",
    outExtension: () => ({ js: ".js" }), // override tsup's default ".global.js" for IIFE
    dts: false,
    sourcemap: true,
    clean: false,
    noExternal: [/.*/], // bundle React + everything for a standalone <script>
    injectStyle: false, // emit engine.css as a sibling file, loaded via <link>
    // Webviews have no Node globals: inline NODE_ENV so React's process.env
    // checks don't throw "process is not defined" at runtime.
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  },
]);
