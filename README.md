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

Scaffolding. Engine algorithms and host wiring are stubs marked `// TODO (spec §x.y)`.
See `docs/superpowers/plans/` for the implementation plan.
