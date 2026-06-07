# Git Swimlanes — Workspace Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a single npm-workspaces monorepo that hosts the three Git Swimlanes projects (engine, VS Code extension, IntelliJ plugin) with a shared message contract and a synced engine bundle — scaffolding only, no engine/host logic.

**Architecture:** `packages/contract` holds shared TypeScript types (data model + host↔webview messages). `packages/engine` is the platform-agnostic visualizer, built by `tsup` into two outputs: an ESM React library and a self-mounting IIFE webview bundle (`engine.js`/`engine.css`). `packages/vscode` is the VS Code host shell; `intellij/` is a separate Gradle/Kotlin host module (outside npm). `scripts/sync-engine.mjs` copies the webview bundle into both hosts.

**Tech Stack:** TypeScript 6, npm workspaces, tsup 8 (esbuild), vitest 4, React 19; Kotlin + Gradle + IntelliJ Platform Gradle Plugin 2.x (JDK 17).

**Convention used throughout:** all `npm` commands run from the repo root unless stated. Stub source bodies intentionally contain `// TODO (spec §x.y)` markers — that is scaffold content, not a plan placeholder. The follow-up implementation cycle converts vitest `it.todo` into red→green TDD.

---

### Task 1: Root monorepo skeleton + relocate specs

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Move: `git-swimlanes-spec.md` → `docs/git-swimlanes-spec.md`
- Move: `git-swimlanes-vscode-spec.md` → `docs/git-swimlanes-vscode-spec.md`
- Move: `git-swimlanes-intellij-spec.md` → `docs/git-swimlanes-intellij-spec.md`

- [ ] **Step 1: Move the three spec files under docs/**

```bash
git mv git-swimlanes-spec.md docs/git-swimlanes-spec.md
git mv git-swimlanes-vscode-spec.md docs/git-swimlanes-vscode-spec.md
git mv git-swimlanes-intellij-spec.md docs/git-swimlanes-intellij-spec.md
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "git-swimlanes-workspace",
  "version": "0.0.0",
  "private": true,
  "description": "Monorepo for the Git Swimlanes engine and host plugins (VS Code, IntelliJ).",
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "npm run build --workspace @michelepolo/git-swimlanes-contract && npm run build --workspace @michelepolo/git-swimlanes-engine && npm run build --workspace @michelepolo/git-swimlanes-vscode",
    "sync": "node scripts/sync-engine.mjs",
    "test": "npm run test --workspace @michelepolo/git-swimlanes-engine --workspace @michelepolo/git-swimlanes-contract --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  },
  "devDependencies": {
    "typescript": "6.0.3",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Create `.gitignore`**

```gitignore
# dependencies
node_modules/

# build output
dist/
*.tsbuildinfo
packages/vscode/media/engine.js
packages/vscode/media/engine.css
intellij/src/main/resources/web/engine.js
intellij/src/main/resources/web/engine.css

# vscode extension package
*.vsix

# intellij / gradle
intellij/.gradle/
intellij/build/
.idea/

# os
.DS_Store
```

- [ ] **Step 5: Verify install resolves the (empty) workspace set**

Run: `npm install`
Expected: completes without error; creates root `node_modules/` and `package-lock.json`. (Workspace packages don't exist yet — npm warns but succeeds; the next tasks add them.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: root npm-workspaces skeleton; relocate specs under docs/"
```

---

### Task 2: `contract` package (shared types)

**Files:**
- Create: `packages/contract/package.json`
- Create: `packages/contract/tsconfig.json`
- Create: `packages/contract/src/index.ts`

- [ ] **Step 1: Create `packages/contract/package.json`**

```json
{
  "name": "@michelepolo/git-swimlanes-contract",
  "version": "0.0.0",
  "description": "Shared types: Git data model and host↔webview message contract.",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "tsup": "8.5.1",
    "vitest": "4.1.8"
  }
}
```

- [ ] **Step 2: Create `packages/contract/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/contract/src/index.ts`**

This is the canonical source of the data model (engine spec §2.2) and the message protocol (vscode spec §2 / intellij spec §2). It is consumed by `engine` and `vscode`; `intellij/.../Json.kt` mirrors it by hand.

```ts
// ─── Git data model (engine spec §2.2) ───────────────────────────────────────

/** File status code from `git --name-status` (R/C carry a similarity score). */
export type FileStatusCode =
  | "A" | "M" | "D" | "T" | "U" | "B"
  | `R${number}` | `C${number}`;

export interface FileChange {
  code: FileStatusCode;
  path: string;
  old?: string; // previous path, only for R/C
}

/** A parsed commit — node of the DAG. */
export interface CommitNode {
  hash: string;
  parents: string[]; // parents[0] = first-parent
  author: string;
  date: string; // ISO short, e.g. "2024-01-18"
  subject: string;
  branches: string[];
  tags: string[];
  head: boolean;
  files: FileChange[];
}

/** Result of the topological computation (independent of UI expansion). */
export interface LaneModel {
  commits: CommitNode[];
  byHash: Record<string, CommitNode>;
  laneOf: Record<string, number>;
  branchOf: Record<string, string>;
  laneNames: string[];
  nLanes: number;
  rowOf: Record<string, number>;
  graphW: number;
}

export interface DiffRequest { hash: string; path: string; oldPath?: string; }
export interface DiffResult { unified: string; }

export interface PullRequestRef {
  id: string;
  src: "Azure DevOps" | "GitHub" | "GitLab" | "Bitbucket" | "squash";
}

/** Theme overrides (engine spec §8). laneSaturation/laneLightness drive lane colors. */
export interface Theme {
  bg?: string; panel?: string; panel2?: string; line?: string;
  txt?: string; dim?: string; accent?: string;
  laneSaturation: number; laneLightness: number;
}

export interface SwimlanesOptions {
  newestFirst?: boolean;
  showLaneGuides?: boolean;
  detectPullRequests?: boolean;
  multiExpand?: boolean;
}

// ─── Host ↔ webview message protocol (vscode §2 / intellij §2) ────────────────

/** Webview → Host. */
export type Wv2Host =
  | { type: "ready" }
  | { type: "requestDiff"; reqId: string; hash: string; path: string; oldPath?: string }
  | { type: "commitSelected"; hash: string }
  | { type: "openFile"; path: string; hash: string };

/** Host → Webview. */
export type Host2Wv =
  | { type: "init"; commits: CommitNode[]; theme: Theme }
  | { type: "setLog"; log: string }
  | { type: "diffResult"; reqId: string; unified: string }
  | { type: "diffError"; reqId: string; message: string }
  | { type: "theme"; theme: Theme };
```

- [ ] **Step 4: Build and typecheck**

Run: `npm run build --workspace @michelepolo/git-swimlanes-contract`
Expected: produces `packages/contract/dist/index.js` and `index.d.ts`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/contract
git commit -m "feat(contract): shared data model and host↔webview message types"
```

---

### Task 3: `engine` package configuration

**Files:**
- Create: `packages/engine/package.json`
- Create: `packages/engine/tsconfig.json`
- Create: `packages/engine/tsup.config.ts`
- Create: `packages/engine/vitest.config.ts`

- [ ] **Step 1: Create `packages/engine/package.json`**

The IIFE bundle must self-contain React (webviews have no module loader), so React is a normal dependency; the library output marks it external via tsup config.

```json
{
  "name": "@michelepolo/git-swimlanes-engine",
  "version": "0.0.0",
  "description": "Platform-agnostic deterministic Git history visualizer (React component + webview bundle).",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@michelepolo/git-swimlanes-contract": "*",
    "react": "19.2.7",
    "react-dom": "19.2.7"
  },
  "devDependencies": {
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "tsup": "8.5.1",
    "vitest": "4.1.8"
  }
}
```

- [ ] **Step 2: Create `packages/engine/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/engine/tsup.config.ts`**

Two build configs from one source: library (ESM + d.ts, React external) and webview (IIFE, React bundled, CSS emitted as `engine.css`).

```ts
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
    dts: false,
    sourcemap: true,
    clean: false,
    noExternal: [/.*/], // bundle React + everything for a standalone <script>
    injectStyle: false, // emit engine.css as a sibling file, loaded via <link>
  },
]);
```

- [ ] **Step 4: Create `packages/engine/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 5: Commit**

```bash
git add packages/engine/package.json packages/engine/tsconfig.json packages/engine/tsup.config.ts packages/engine/vitest.config.ts
git commit -m "chore(engine): package config, dual tsup build, vitest setup"
```

---

### Task 4: `engine` model stubs + characterization-test placeholders

**Files:**
- Create: `packages/engine/src/layout.ts`
- Create: `packages/engine/src/model/color.ts`
- Create: `packages/engine/src/model/parseLog.ts`
- Create: `packages/engine/src/model/assignLanes.ts`
- Create: `packages/engine/src/model/detectPR.ts`
- Test: `packages/engine/test/parseLog.test.ts`
- Test: `packages/engine/test/assignLanes.test.ts`
- Test: `packages/engine/test/detectPR.test.ts`
- Test: `packages/engine/test/color.test.ts`

- [ ] **Step 1: Create `packages/engine/src/layout.ts`** (layout constants, fully defined — engine spec §2.3)

```ts
export const LAYOUT = {
  LP: 16,      // graph left padding
  laneW: 28,   // column width
  RP: 10,      // right padding
  rowH: 46,    // commit row height
  dotR: 6,     // normal node radius
  mergeR: 7.5, // merge node radius
} as const;

export const laneX = (i: number): number =>
  LAYOUT.LP + i * LAYOUT.laneW + LAYOUT.laneW / 2;
```

- [ ] **Step 2: Create `packages/engine/src/model/color.ts`** (pure, fully defined — engine spec §4.2)

```ts
export function hueFromName(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

export function colorFor(name: string): string {
  if (name === "(no branch ref)") return "hsl(215 10% 50%)";
  return `hsl(${hueFromName(name)} 68% 60%)`;
}
```

- [ ] **Step 3: Create `packages/engine/src/model/parseLog.ts`** (signature + TODO — engine spec §4.1)

```ts
import type { CommitNode } from "@michelepolo/git-swimlanes-contract";

/** Parse `git log --name-status` output into commit nodes. See engine spec §4.1. */
export function parseLog(
  _text: string,
): { commits: CommitNode[]; byHash: Record<string, CommitNode> } {
  // TODO (spec §4.1): implement line classification (file line vs header) and parsing.
  throw new Error("parseLog: not implemented (see git-swimlanes-spec.md §4.1)");
}
```

- [ ] **Step 4: Create `packages/engine/src/model/assignLanes.ts`** (signature + TODO — engine spec §4.3)

```ts
import type { CommitNode, LaneModel } from "@michelepolo/git-swimlanes-contract";

/** Assign stable swimlane columns via first-parent claiming. See engine spec §4.3. */
export function assignLanes(
  _commits: CommitNode[],
  _byHash: Record<string, CommitNode>,
): LaneModel {
  // TODO (spec §4.3): tip dedup, deterministic ordering, first-parent claim, fallback lane.
  throw new Error("assignLanes: not implemented (see git-swimlanes-spec.md §4.3)");
}
```

- [ ] **Step 5: Create `packages/engine/src/model/detectPR.ts`** (signature + TODO — engine spec §4.4)

```ts
import type { PullRequestRef } from "@michelepolo/git-swimlanes-contract";

/** Infer a pull/merge request reference from a commit subject. See engine spec §4.4. */
export function detectPR(_subject: string): PullRequestRef | null {
  // TODO (spec §4.4): match Azure DevOps / GitHub / Bitbucket / GitLab / squash patterns.
  throw new Error("detectPR: not implemented (see git-swimlanes-spec.md §4.4)");
}
```

- [ ] **Step 6: Create `packages/engine/test/color.test.ts`** (real test — `color.ts` is implemented)

```ts
import { describe, it, expect } from "vitest";
import { colorFor, hueFromName } from "../src/model/color.js";

describe("colorFor", () => {
  it("is deterministic for the same branch name", () => {
    expect(colorFor("feature/login")).toBe(colorFor("feature/login"));
  });

  it("maps the no-branch sentinel to the fixed gray", () => {
    expect(colorFor("(no branch ref)")).toBe("hsl(215 10% 50%)");
  });

  it("keeps hue within [0, 360)", () => {
    const h = hueFromName("main");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });
});
```

- [ ] **Step 7: Create `packages/engine/test/parseLog.test.ts`** (todo — documents intent for the implementation cycle)

```ts
import { describe, it } from "vitest";

describe("parseLog (spec §4.1)", () => {
  it.todo("parses a header line into a CommitNode");
  it.todo("attaches file-status lines to the current commit");
  it.todo("handles rename lines R100 old\\tnew");
  it.todo("parses refs: HEAD, branches, and tag: entries");
});
```

- [ ] **Step 8: Create `packages/engine/test/assignLanes.test.ts`** (todo)

```ts
import { describe, it } from "vitest";

describe("assignLanes (spec §4.3)", () => {
  it.todo("gives main lane 0 and develop lane 1");
  it.todo("keeps feature commits in their own lane across a merge (first-parent)");
  it.todo("routes commits with no claiming ref into the (no branch ref) lane");
  it.todo("dedups origin/<name> against local <name>, preferring local");
});
```

- [ ] **Step 9: Create `packages/engine/test/detectPR.test.ts`** (todo)

```ts
import { describe, it } from "vitest";

describe("detectPR (spec §4.4)", () => {
  it.todo("detects Azure DevOps 'Merged PR 1042:'");
  it.todo("detects GitHub 'Merge pull request #42'");
  it.todo("detects squash '(#42)' at end of subject");
  it.todo("returns null for an ordinary subject");
});
```

- [ ] **Step 10: Run the test suite**

Run: `npm run test --workspace @michelepolo/git-swimlanes-engine`
Expected: `color.test.ts` passes (3 passed); the others report as todo. Exit code 0.

- [ ] **Step 11: Commit**

```bash
git add packages/engine/src packages/engine/test
git commit -m "feat(engine): layout + color implemented; model stubs and test placeholders"
```

---

### Task 5: `engine` UI stub + library/webview entry points

**Files:**
- Create: `packages/engine/src/ui/GitSwimlanes.tsx`
- Create: `packages/engine/src/engine.css`
- Create: `packages/engine/src/index.ts`
- Create: `packages/engine/src/webview.ts`

- [ ] **Step 1: Create `packages/engine/src/ui/GitSwimlanes.tsx`** (component stub — engine spec §6.1)

```tsx
import type {
  CommitNode,
  DiffRequest,
  DiffResult,
  SwimlanesOptions,
  Theme,
} from "@michelepolo/git-swimlanes-contract";

export interface GitSwimlanesProps {
  log?: string;
  commits?: CommitNode[];
  options?: SwimlanesOptions;
  theme?: Partial<Theme>;
  onCommitToggle?(hash: string, expanded: boolean): void;
  onCommitSelect?(commit: CommitNode): void;
  onFileSelect?(req: DiffRequest): void;
  onRequestDiff?(req: DiffRequest): Promise<DiffResult>;
}

/** Deterministic Git history visualizer. TODO (spec §5,§6): full SVG graph + rows + diff. */
export function GitSwimlanes(_props: GitSwimlanesProps): JSX.Element {
  // TODO (spec §3-§6): parse → assignLanes → layout → render SVG graph and HTML rows.
  return <div className="git-swimlanes" data-stub="true">Git Swimlanes (stub)</div>;
}
```

- [ ] **Step 2: Create `packages/engine/src/engine.css`** (minimal theme variables — engine spec §8)

```css
:root {
  --bg: #0d1117; --panel: #11161f; --panel2: #0a0e14; --line: #222b38;
  --txt: #c9d4e3; --dim: #6f7d92; --accent: #e8b04b;
}
.git-swimlanes {
  font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--txt); background: var(--bg);
}
```

- [ ] **Step 3: Create `packages/engine/src/index.ts`** (library entry — re-exports public API)

```ts
export { GitSwimlanes } from "./ui/GitSwimlanes.js";
export type { GitSwimlanesProps } from "./ui/GitSwimlanes.js";
export { parseLog } from "./model/parseLog.js";
export { assignLanes } from "./model/assignLanes.js";
export { detectPR } from "./model/detectPR.js";
export { colorFor, hueFromName } from "./model/color.js";
export { LAYOUT, laneX } from "./layout.js";
export type * from "@michelepolo/git-swimlanes-contract";
```

- [ ] **Step 4: Create `packages/engine/src/webview.ts`** (IIFE entry — installs the host bridge surface)

Implements the contract the hosts rely on (vscode §2, intellij §2): a global `GitSwimlanes.receive(...)` to take Host→Webview messages and an optional `onReady` callback the bridge invokes once mounted.

```ts
import { createRoot } from "react-dom/client";
import { createElement } from "react";
import type { Host2Wv } from "@michelepolo/git-swimlanes-contract";
import { GitSwimlanes } from "./ui/GitSwimlanes.js";
import "./engine.css";

declare global {
  interface Window {
    __host?: { post(msg: unknown): void };
    GitSwimlanes: {
      receive(msg: Host2Wv): void;
      onReady?: () => void;
    };
  }
}

function boot(): void {
  const el = document.getElementById("app");
  if (!el) throw new Error("git-swimlanes: #app mount point not found");
  const root = createRoot(el);
  root.render(createElement(GitSwimlanes, {}));

  window.GitSwimlanes = {
    receive(_msg: Host2Wv): void {
      // TODO (spec §6.3): route init/setLog/diffResult/diffError/theme into React state.
    },
  };

  // Signal the host bridge that the engine is mounted and ready for messages.
  window.GitSwimlanes.onReady?.();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
```

- [ ] **Step 5: Build both engine outputs**

Run: `npm run build --workspace @michelepolo/git-swimlanes-engine`
Expected: creates `packages/engine/dist/index.js`, `dist/index.d.ts`, `dist/engine.js` (IIFE), and `dist/engine.css`. Exit 0.

- [ ] **Step 6: Verify the four expected artifacts exist**

Run: `ls packages/engine/dist/index.js packages/engine/dist/index.d.ts packages/engine/dist/engine.js packages/engine/dist/engine.css`
Expected: all four paths listed, no "No such file" error.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src
git commit -m "feat(engine): UI stub, library and webview IIFE entry points"
```

---

### Task 6: `vscode` extension host shell

**Files:**
- Create: `packages/vscode/package.json`
- Create: `packages/vscode/tsconfig.json`
- Create: `packages/vscode/tsup.config.ts`
- Create: `packages/vscode/src/extension.ts`
- Create: `packages/vscode/src/GitService.ts`
- Create: `packages/vscode/src/html.ts`
- Create: `packages/vscode/src/SwimlanesViewProvider.ts`
- Create: `packages/vscode/media/bridge.js`
- Create: `packages/vscode/media/.gitkeep`

- [ ] **Step 1: Create `packages/vscode/package.json`** (extension manifest — vscode spec §3.1)

VS Code loads extensions as CommonJS, so the bundle format is `cjs` and `main` points at `dist/extension.js`. `@types/vscode` is pinned to the `engines.vscode` floor.

```json
{
  "name": "git-swimlanes-vscode",
  "displayName": "Git Swimlanes",
  "description": "Deterministic Git history swimlanes.",
  "version": "0.0.0",
  "publisher": "michelepolo",
  "private": true,
  "engines": { "vscode": "^1.85.0" },
  "categories": ["SCM Providers", "Visualization"],
  "activationEvents": [],
  "main": "./dist/extension.js",
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        { "id": "gitSwimlanes", "title": "Git Swimlanes", "icon": "media/icon.svg" }
      ]
    },
    "views": {
      "gitSwimlanes": [
        { "type": "webview", "id": "gitSwimlanes.graph", "name": "History" }
      ]
    },
    "commands": [
      { "command": "gitSwimlanes.refresh", "title": "Git Swimlanes: Refresh", "icon": "$(refresh)" }
    ],
    "menus": {
      "view/title": [
        { "command": "gitSwimlanes.refresh", "when": "view == gitSwimlanes.graph", "group": "navigation" }
      ]
    }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@michelepolo/git-swimlanes-contract": "*"
  },
  "devDependencies": {
    "@types/vscode": "1.85.0",
    "tsup": "8.5.1"
  }
}
```

- [ ] **Step 2: Create `packages/vscode/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "lib": ["ES2022"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/vscode/tsup.config.ts`** (`vscode` is provided by the host, so it stays external)

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { extension: "src/extension.ts" },
  format: ["cjs"],
  target: "node18",
  external: ["vscode"],
  sourcemap: true,
  clean: true,
});
```

- [ ] **Step 4: Create `packages/vscode/src/GitService.ts`** (git execution — vscode spec §5)

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);

const LOG_ARGS = [
  "-c", "core.quotepath=false", "--no-pager", "log",
  "--all", "--date-order", "--name-status",
  "--pretty=format:%H|%P|%D|%an|%ad|%s", "--date=short",
];

export class GitService {
  constructor(private readonly cwd: string) {}

  async log(): Promise<string> {
    const { stdout } = await run("git", LOG_ARGS, {
      cwd: this.cwd, maxBuffer: 64 * 1024 * 1024,
    });
    return stdout;
  }

  async show(hash: string, path: string): Promise<string> {
    if (!/^[0-9a-f]{7,40}$/.test(hash)) throw new Error("invalid hash");
    const { stdout } = await run("git", ["show", "-M", hash, "--", path], {
      cwd: this.cwd, maxBuffer: 32 * 1024 * 1024,
    });
    return stdout;
  }
}
```

- [ ] **Step 5: Create `packages/vscode/src/html.ts`** (CSP + nonce webview HTML — vscode spec §4.2)

```ts
import * as vscode from "vscode";

export function buildHtml(webview: vscode.Webview, root: vscode.Uri): string {
  const nonce = makeNonce();
  const uri = (p: string) =>
    webview.asWebviewUri(vscode.Uri.joinPath(root, "media", p));

  return /* html */ `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="
  default-src 'none';
  img-src ${webview.cspSource} data:;
  style-src ${webview.cspSource} 'unsafe-inline';
  font-src ${webview.cspSource};
  script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${uri("engine.css")}">
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${uri("engine.js")}"></script>
  <script nonce="${nonce}" src="${uri("bridge.js")}"></script>
</body>
</html>`;
}

function makeNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
```

- [ ] **Step 6: Create `packages/vscode/src/SwimlanesViewProvider.ts`** (webview provider + router — vscode spec §4.1)

```ts
import * as vscode from "vscode";
import type { Host2Wv, Wv2Host } from "@michelepolo/git-swimlanes-contract";
import { GitService } from "./GitService.js";
import { buildHtml } from "./html.js";

export class SwimlanesViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "gitSwimlanes.graph";
  private view?: vscode.WebviewView;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly git: GitService,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, "media")],
    };
    view.webview.html = buildHtml(view.webview, this.ctx.extensionUri);
    view.webview.onDidReceiveMessage((msg: Wv2Host) => void this.onMessage(msg));
  }

  async refresh(): Promise<void> {
    if (!this.view) return;
    const log = await this.git.log();
    this.post({ type: "setLog", log });
  }

  private async onMessage(msg: Wv2Host): Promise<void> {
    switch (msg.type) {
      case "ready":
        await this.refresh();
        break;
      case "requestDiff":
        try {
          const unified = await this.git.show(msg.hash, msg.path);
          this.post({ type: "diffResult", reqId: msg.reqId, unified });
        } catch (e) {
          this.post({ type: "diffError", reqId: msg.reqId, message: String(e) });
        }
        break;
      // TODO (spec §4.1): commitSelected, openFile.
    }
  }

  private post(msg: Host2Wv): void {
    void this.view?.webview.postMessage(msg);
  }
}
```

- [ ] **Step 7: Create `packages/vscode/src/extension.ts`** (activation — vscode spec §7)

```ts
import * as vscode from "vscode";
import { GitService } from "./GitService.js";
import { SwimlanesViewProvider } from "./SwimlanesViewProvider.js";

export function activate(ctx: vscode.ExtensionContext): void {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    void vscode.window.showWarningMessage("Git Swimlanes: no workspace folder found.");
    return;
  }
  const git = new GitService(root);
  const provider = new SwimlanesViewProvider(ctx, git);

  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SwimlanesViewProvider.viewId, provider),
    vscode.commands.registerCommand("gitSwimlanes.refresh", () => provider.refresh()),
  );
}

export function deactivate(): void {}
```

- [ ] **Step 8: Create `packages/vscode/media/bridge.js`** (VS Code transport — vscode spec §4.3)

```js
// VS Code transport: postMessage in both directions.
const vscode = acquireVsCodeApi();
window.__host = { post: (msg) => vscode.postMessage(msg) };
window.addEventListener("message", (e) => window.GitSwimlanes.receive(e.data));
// Tell the host the engine is ready to receive init/setLog.
window.GitSwimlanes.onReady = () => window.__host.post({ type: "ready" });
```

- [ ] **Step 9: Create `packages/vscode/media/.gitkeep`** (keep the dir; engine.js/.css are gitignored and arrive via sync)

```text
```

- [ ] **Step 10: Build the extension bundle**

Run: `npm run build --workspace git-swimlanes-vscode`
Expected: creates `packages/vscode/dist/extension.js` (CJS), exit 0.

- [ ] **Step 11: Commit**

```bash
git add packages/vscode
git commit -m "feat(vscode): extension host shell — provider, GitService, CSP html, bridge"
```

---

### Task 7: Engine→hosts sync script

**Files:**
- Create: `scripts/sync-engine.mjs`

- [ ] **Step 1: Create `scripts/sync-engine.mjs`**

Copies the built webview bundle into both host locations. Fails loudly if the engine has not been built (the spec's single-source-of-truth rule).

```js
import { copyFile, mkdir, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "packages/engine/dist");
const assets = ["engine.js", "engine.css"];
const targets = [
  join(root, "packages/vscode/media"),
  join(root, "intellij/src/main/resources/web"),
];

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

for (const asset of assets) {
  const src = join(distDir, asset);
  if (!(await exists(src))) {
    console.error(`✗ Missing ${src}. Run "npm run build" for the engine first.`);
    process.exit(1);
  }
}

for (const dir of targets) {
  await mkdir(dir, { recursive: true });
  for (const asset of assets) {
    await copyFile(join(distDir, asset), join(dir, asset));
    console.log(`✓ ${asset} → ${dir.replace(root + "/", "")}`);
  }
}
console.log("Engine bundle synced to both hosts.");
```

- [ ] **Step 2: Run the sync (engine dist exists from Task 5)**

Run: `npm run sync`
Expected: prints four `✓` lines and "Engine bundle synced to both hosts."

- [ ] **Step 3: Verify the bundle landed in both hosts**

Run: `ls packages/vscode/media/engine.js intellij/src/main/resources/web/engine.js`
Expected: both paths listed (note: `intellij/.../web/` is created here even before Task 8 writes its other files).

- [ ] **Step 4: Commit**

```bash
git add scripts/sync-engine.mjs
git commit -m "feat: sync-engine script copies the webview bundle into both hosts"
```

---

### Task 8: `intellij` Gradle/Kotlin host module (scaffold only — not compiled)

**Files:**
- Create: `intellij/settings.gradle.kts`
- Create: `intellij/build.gradle.kts`
- Create: `intellij/gradle.properties`
- Create: `intellij/gradle/wrapper/gradle-wrapper.properties`
- Create: `intellij/src/main/resources/META-INF/plugin.xml`
- Create: `intellij/src/main/resources/web/index.html`
- Create: `intellij/src/main/resources/web/.gitkeep`
- Create: `intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/SwimlanesToolWindowFactory.kt`
- Create: `intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/SwimlanesPanel.kt`
- Create: `intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/GitService.kt`
- Create: `intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/Json.kt`

- [ ] **Step 1: Create `intellij/settings.gradle.kts`**

```kotlin
rootProject.name = "git-swimlanes-intellij"
```

- [ ] **Step 2: Create `intellij/build.gradle.kts`** (intellij spec §3.2; targets IDEA 2024.1, needs JDK 17)

```kotlin
plugins {
  kotlin("jvm") version "1.9.25"
  id("org.jetbrains.intellij.platform") version "2.1.0"
}

group = "io.github.michelepolo"
version = "0.0.0"

repositories {
  mavenCentral()
  intellijPlatform { defaultRepositories() }
}

dependencies {
  intellijPlatform {
    intellijIdeaCommunity("2024.1")
    bundledPlugin("Git4Idea")
  }
}

kotlin {
  jvmToolchain(17)
}
```

- [ ] **Step 3: Create `intellij/gradle.properties`**

```properties
kotlin.code.style=official
org.gradle.jvmargs=-Xmx2g
org.gradle.configuration-cache=true
```

- [ ] **Step 4: Create `intellij/gradle/wrapper/gradle-wrapper.properties`** (Gradle 8.10 — compatible with the platform plugin 2.x)

```properties
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-8.10-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
```

- [ ] **Step 5: Create `intellij/src/main/resources/META-INF/plugin.xml`** (intellij spec §3.1)

```xml
<idea-plugin>
  <id>io.github.michelepolo.gitswimlanes</id>
  <name>Git Swimlanes</name>
  <vendor email="michele.polo@gmail.com">michelepolo</vendor>

  <depends>com.intellij.modules.platform</depends>
  <depends>Git4Idea</depends>

  <idea-version since-build="233"/>

  <extensions defaultExtensionNs="com.intellij">
    <toolWindow id="Git Swimlanes"
                anchor="bottom"
                icon="AllIcons.Vcs.Branch"
                factoryClass="io.github.michelepolo.gitswimlanes.SwimlanesToolWindowFactory"/>
  </extensions>
</idea-plugin>
```

- [ ] **Step 6: Create `intellij/src/main/resources/web/index.html`** (JCEF entry — loads the synced bundle)

```html
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="engine.css">
</head>
<body>
  <div id="app"></div>
  <script src="engine.js"></script>
</body>
</html>
```

- [ ] **Step 7: Create `intellij/src/main/resources/web/.gitkeep`**

```text
```

- [ ] **Step 8: Create `intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/Json.kt`** (message shapes mirror — points to canonical contract)

```kotlin
package io.github.michelepolo.gitswimlanes

// Mirror of packages/contract/src/index.ts (canonical source).
// Kept by hand: a JVM host cannot import TypeScript types.

/** Decoded Webview → Host message (only fields used by the host). */
data class WvMessage(
  val type: String,
  val reqId: String? = null,
  val hash: String? = null,
  val path: String? = null,
  val oldPath: String? = null,
)

object Json {
  // TODO (intellij spec §3): decode(request) / encode(msg) via the platform JSON util.
  fun decode(@Suppress("UNUSED_PARAMETER") request: String): WvMessage =
    throw NotImplementedError("Json.decode — see git-swimlanes-intellij-spec.md §3")

  fun encode(@Suppress("UNUSED_PARAMETER") msg: Any): String =
    throw NotImplementedError("Json.encode — see git-swimlanes-intellij-spec.md §3")
}
```

- [ ] **Step 9: Create `intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/GitService.kt`** (git4idea — intellij spec §5)

```kotlin
package io.github.michelepolo.gitswimlanes

import com.intellij.openapi.project.Project

/** Reads git log/show via git4idea. See git-swimlanes-intellij-spec.md §5. */
class GitService(private val project: Project) {

  fun log(): String {
    // TODO (spec §5): GitLineHandler(LOG) with --all --name-status pretty=format...
    throw NotImplementedError("GitService.log — see spec §5")
  }

  fun show(hash: String, path: String): String {
    require(hash.matches(Regex("^[0-9a-f]{7,40}$"))) { "invalid hash" }
    // TODO (spec §5): GitLineHandler(SHOW) with -M <hash> -- <path>.
    throw NotImplementedError("GitService.show — see spec §5")
  }
}
```

- [ ] **Step 10: Create `intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/SwimlanesPanel.kt`** (JCEF panel + bridge — intellij spec §4.2)

```kotlin
package io.github.michelepolo.gitswimlanes

import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project

/**
 * JCEF panel hosting the engine. Owns the JBCefBrowser, the JBCefJSQuery bridge,
 * and the host↔webview message router. See git-swimlanes-intellij-spec.md §4.2.
 */
class SwimlanesPanel(private val project: Project, parent: Disposable) {
  private val git = GitService(project)

  // TODO (spec §4.2): JBCefBrowser + JBCefJSQuery, inject window.__host on onLoadEnd,
  //   load /web/index.html, route ready/requestDiff/openFile, push diffResult/theme.

  fun refresh() {
    // TODO (spec §4.2): runOnPooled { git.log() } then invokeLater { postToWebview(setLog) }.
    throw NotImplementedError("SwimlanesPanel.refresh — see spec §4.2")
  }
}
```

- [ ] **Step 11: Create `intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/SwimlanesToolWindowFactory.kt`** (intellij spec §4.1)

```kotlin
package io.github.michelepolo.gitswimlanes

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.jcef.JBCefApp

class SwimlanesToolWindowFactory : ToolWindowFactory, DumbAware {
  override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
    SwimlanesPanel(project, toolWindow.disposable)
    // TODO (spec §4.1): wrap panel.component in Content and add to contentManager.
  }

  override fun isApplicable(project: Project): Boolean = JBCefApp.isSupported()
}
```

- [ ] **Step 12: Verify the intellij tree is complete (no compilation — JDK absent)**

Run: `find intellij -type f -not -path '*/web/engine.*' | sort`
Expected: lists all 11 created files plus `web/index.html` and `web/.gitkeep`. (No `gradlew` yet — that is the documented bootstrap step in Task 9's README.)

- [ ] **Step 13: Commit**

```bash
git add intellij
git commit -m "feat(intellij): Gradle/Kotlin host module scaffold (not yet compiled)"
```

---

### Task 9: Root README + end-to-end verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

````markdown
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
````

- [ ] **Step 2: Clean end-to-end run from a fresh install**

Run:
```bash
npm install && npm run build && npm run sync && npm test
```
Expected: build produces engine + extension artifacts; sync prints four `✓` lines; vitest exits 0 (color tests pass, others todo).

- [ ] **Step 3: Verify the full workspace tree**

Run: `git status --short && npm ls --workspaces --depth=0`
Expected: working tree clean after the next commit; `npm ls` lists the three `@michelepolo/git-swimlanes-*` / `git-swimlanes-vscode` workspaces with no missing-dependency errors.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: root README with build, sync, and IntelliJ bootstrap instructions"
```

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-06-08-workspace-scaffolding-design.md`):
- §2 tooling/identity → Tasks 1–3, 6, 8 (npm workspaces, tsup, vitest, naming). ✓
- §3 tree → every directory/file created across Tasks 1–9. ✓
- §4 dependency graph → contract←engine←vscode wired via `"*"` workspace deps (Tasks 3, 6); intellij consumes synced artifact only (Tasks 7, 8). ✓
- §5 dual engine output → Task 3 (tsup config) + Task 5 (entries) + Task 5 Step 6 (artifact check). ✓
- §6 build flow → root scripts (Task 1), sync (Task 7), README (Task 9). ✓
- §7 limits → IntelliJ scaffold not compiled (Task 8), TODO stubs throughout, manual TS↔Kotlin mirror (Task 8 Json.kt). ✓
- §8 completion criteria → covered by Task 9 end-to-end run + per-task verification steps. ✓

**Placeholder scan:** No "TBD/implement later" in plan steps. `// TODO (spec §x.y)` markers are intended scaffold content (stated in the header). vitest `it.todo` blocks are deliberate, documented intent. ✓

**Type consistency:** `CommitNode`, `LaneModel`, `DiffRequest`, `DiffResult`, `PullRequestRef`, `Theme`, `Wv2Host`, `Host2Wv` defined once in Task 2 and imported unchanged by engine (Tasks 4–5) and vscode (Task 6). `parseLog`/`assignLanes`/`detectPR`/`colorFor`/`hueFromName`/`LAYOUT`/`laneX` signatures defined in Task 4 match the re-exports in Task 5 `index.ts`. Package names consistent: `@michelepolo/git-swimlanes-{contract,engine}` and `git-swimlanes-vscode`. ✓
```
