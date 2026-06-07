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
  },
]);
