# Git Swimlanes — Monorepo

Deterministic Git history visualizer: one platform-agnostic **engine** embedded by two host plugins.

| Path | What it is |
|---|---|
| `packages/engine` | The visualizer. Builds an ESM React library **and** a self-mounting webview bundle (`engine.js`/`engine.css`). |
| `packages/contract` | Shared types: Git data model + host↔webview message protocol. |
| `packages/vscode` | VS Code extension host (webview + `acquireVsCodeApi` bridge). |
| `intellij/` | IntelliJ plugin host (JCEF). Separate Gradle/Kotlin module, not part of npm workspaces. |
| `scripts/sync-engine.mjs` | Copies the engine webview bundle into both hosts. |
| `docs/` | Functional specs (`git-swimlanes-*.md`) and design/plan docs under `docs/superpowers/`. |

## Build (JS side)

```bash
npm install        # link the three JS workspaces
npm run build      # contract → engine (library + webview bundle) → vscode extension
npm run sync       # copy engine.js/.css into packages/vscode/media and intellij/.../web
npm test           # vitest (engine + contract)
```

## VS Code extension

The engine bundle must be present in `packages/vscode/media/` (run `npm run build && npm run sync`).

```bash
# Run it from source in a sandbox VS Code window (Extension Development Host):
code --extensionDevelopmentPath="$PWD/packages/vscode" .
# Then open the "Git Swimlanes" view from the activity bar.

# Or package and install a .vsix:
npm run package --workspace git-swimlanes-vscode   # → packages/vscode/git-swimlanes-vscode-0.0.0.vsix
code --install-extension packages/vscode/git-swimlanes-vscode-0.0.0.vsix
```

The extension is fully bundled by `tsup`, so packaging uses `vsce package --no-dependencies`
(it must not walk the npm workspace tree). The webview loads `media/engine.js` + `media/engine.css`
under a strict CSP; `media/bridge.js` connects it to the extension host via `acquireVsCodeApi`.

## IntelliJ plugin (one-time bootstrap)

Requires **JDK 17** (e.g. Eclipse Temurin). The Gradle wrapper jar is not committed; generate it once:

```bash
cd intellij
gradle wrapper --gradle-version 8.10   # needs a system Gradle once; afterwards use ./gradlew
./gradlew buildPlugin                   # build the plugin zip
./gradlew runIde                        # launch a sandbox IDE for testing
```

The plugin loads the engine bundle from `src/main/resources/web/`, populated by `npm run sync`.

## Status

- **Engine** — complete and tested (67 tests, TDD): model layer (parse, swimlanes, PR
  detection, colors, layout, diff classification), React UI (graph, rows, accordion, diff
  modal), and the webview message controller. Browser-verified.
- **VS Code host** — wired end-to-end: builds, syncs the engine bundle, packages to `.vsix`.
  Webview integration (ready handshake + diff round-trip) verified against the real `bridge.js`.
- **IntelliJ host** — scaffolded (Kotlin/JCEF), not yet implemented; needs JDK 17 (see above).

See `docs/superpowers/plans/` for the original implementation plan and
`docs/git-swimlanes-*.md` for the functional specs.
