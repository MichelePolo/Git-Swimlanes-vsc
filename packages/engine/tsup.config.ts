import { defineConfig } from "tsup";
import { build, type Plugin } from "esbuild";

/**
 * Inline the Web Worker as a string so it can run via a Blob URL with no separate file
 * (required for JCEF, which loads the bundle inline with no file URLs). `import code from
 * "inline:worker"` resolves to the self-contained, bundled worker source. See spec §9.
 */
const inlineWorker: Plugin = {
  name: "inline-worker",
  setup(b) {
    b.onResolve({ filter: /^inline:worker$/ }, () => ({ path: "inline:worker", namespace: "inline-worker" }));
    b.onLoad({ filter: /^inline:worker$/, namespace: "inline-worker" }, async () => {
      const res = await build({
        entryPoints: ["src/worker.ts"],
        bundle: true,
        write: false,
        format: "iife",
        target: "es2020",
        platform: "browser",
      });
      return { contents: `export default ${JSON.stringify(res.outputFiles[0].text)};`, loader: "js" };
    });
  },
};

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
    esbuildPlugins: [inlineWorker],
    // Webviews have no Node globals: inline NODE_ENV so React's process.env
    // checks don't throw "process is not defined" at runtime.
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  },
]);
