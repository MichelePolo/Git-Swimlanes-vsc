# Phase 2 — Read extensions + action convention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `pull`/`fetch` action convention (toolbar buttons → host runs git → notify + refresh) and a read-only working-tree status shown as a pinned pseudo-row atop the graph.

**Architecture:** Typed `pull`/`fetch` messages handled by a shared `runGitAction` host helper. The host runs `git status --porcelain` in `refresh()` and sends the raw text in a `status` message; the engine parses it with a pure `parseStatus` and renders a `WorkingTreeRow` band (dashed node on HEAD's lane) above the scroll. Read-only — no diff/stage/commit.

**Tech Stack:** TypeScript/React engine (vitest + jsdom), npm workspaces, Kotlin/Gradle IntelliJ host, VS Code extension. Spec: `docs/superpowers/specs/2026-06-09-phase2-readonly-actions-design.md`. Branches from `main` (Phase 1 already merged).

**Conventions:** `npm`/`git` from repo root. IntelliJ build: `export JAVA_HOME="$HOME/.sdkman/candidates/java/current"`. Run `npm run sync` after engine changes a host must load. Status uses newline `git status --porcelain` (v1) — consistent with the existing newline-based `git log` parsing and `core.quotepath=false`.

---

### Task 0: Branch

- [ ] **Step 1**

```bash
git checkout main && git pull --ff-only && git checkout -b phase2-read-actions
```

---

### Task 1: Contract — WorkingTreeFile + messages

**Files:** Modify `packages/contract/src/index.ts`

- [ ] **Step 1: Add the `WorkingTreeFile` type** after the `ViewConfig` interface

```ts
/** A changed file in the working tree (`git status --porcelain`). */
export interface WorkingTreeFile {
  path: string;
  index: string;    // staged code (X): ' ' M A D R C U ?
  worktree: string; // unstaged code (Y): ' ' M A D R C U ?
  old?: string;     // previous path, for rename/copy
}
```

- [ ] **Step 2: Add the messages.** In `Wv2Host`, after the `setViewConfig` member:
```ts
  | { type: "setViewConfig"; config: ViewConfig }
  | { type: "pull" }
  | { type: "fetch" };
```
In `Host2Wv`, after the `viewConfig` member:
```ts
  | { type: "viewConfig"; config: ViewConfig }
  | { type: "status"; porcelain: string };
```

- [ ] **Step 3: Build**

Run: `npm run build --workspace @michelepolo/git-swimlanes-contract`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/contract/src/index.ts
git commit -m "feat(contract): WorkingTreeFile + pull/fetch/status messages"
```

---

### Task 2: `parseStatus` (TDD)

**Files:** Create `packages/engine/src/model/parseStatus.ts`; Test `packages/engine/test/parseStatus.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/engine/test/parseStatus.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { parseStatus } from "../src/model/parseStatus.js";

describe("parseStatus (git status --porcelain)", () => {
  it("returns [] for empty input", () => {
    expect(parseStatus("")).toEqual([]);
    expect(parseStatus("\n\n")).toEqual([]);
  });

  it("parses staged vs unstaged codes (X=index, Y=worktree)", () => {
    expect(parseStatus("M  src/a.ts")).toEqual([{ index: "M", worktree: " ", path: "src/a.ts" }]);
    expect(parseStatus(" M src/b.ts")).toEqual([{ index: " ", worktree: "M", path: "src/b.ts" }]);
    expect(parseStatus("MM src/c.ts")).toEqual([{ index: "M", worktree: "M", path: "src/c.ts" }]);
  });

  it("parses added, deleted, and untracked", () => {
    expect(parseStatus("A  new.ts")).toEqual([{ index: "A", worktree: " ", path: "new.ts" }]);
    expect(parseStatus(" D gone.ts")).toEqual([{ index: " ", worktree: "D", path: "gone.ts" }]);
    expect(parseStatus("?? junk.log")).toEqual([{ index: "?", worktree: "?", path: "junk.log" }]);
  });

  it("parses a rename with old -> new", () => {
    expect(parseStatus("R  old.ts -> new.ts")).toEqual([
      { index: "R", worktree: " ", old: "old.ts", path: "new.ts" },
    ]);
  });

  it("parses multiple lines", () => {
    expect(parseStatus("M  a\n?? b")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/parseStatus.test.ts --root packages/engine`
Expected: FAIL — `Cannot find module '../src/model/parseStatus.js'`.

- [ ] **Step 3: Implement `packages/engine/src/model/parseStatus.ts`**

```ts
import type { WorkingTreeFile } from "@michelepolo/git-swimlanes-contract";

/**
 * Parse `git status --porcelain` (v1) output. Each line is `XY<space><path>`, where X is the
 * staged (index) code and Y the unstaged (worktree) code; renames/copies use `old -> new`.
 */
export function parseStatus(text: string): WorkingTreeFile[] {
  const files: WorkingTreeFile[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    if (raw.length < 4) continue; // need at least "XY p"
    const index = raw[0];
    const worktree = raw[1];
    const rest = raw.slice(3);
    if (index === "R" || index === "C" || worktree === "R" || worktree === "C") {
      const [old, path] = rest.split(" -> ");
      files.push({ index, worktree, old, path: path ?? old });
    } else {
      files.push({ index, worktree, path: rest });
    }
  }
  return files;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/parseStatus.test.ts --root packages/engine`
Expected: PASS (5).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/model/parseStatus.ts packages/engine/test/parseStatus.test.ts
git commit -m "feat(engine): parseStatus — git status --porcelain parser"
```

---

### Task 3: `WorkingTreeRow` component (TDD)

**Files:** Create `packages/engine/src/ui/WorkingTreeRow.tsx`; Test `packages/engine/test/WorkingTreeRow.test.tsx`

- [ ] **Step 1: Write the failing test** — `packages/engine/test/WorkingTreeRow.test.tsx`

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { WorkingTreeFile } from "@michelepolo/git-swimlanes-contract";
import { WorkingTreeRow } from "../src/ui/WorkingTreeRow.js";

afterEach(cleanup);

const files: WorkingTreeFile[] = [
  { index: "M", worktree: " ", path: "src/app.ts" },
  { index: " ", worktree: "M", path: "src/b.ts" },
  { index: "?", worktree: "?", path: "junk.log" },
];

function renderRow(over: Partial<Parameters<typeof WorkingTreeRow>[0]> = {}) {
  const onToggle = vi.fn();
  render(<WorkingTreeRow files={files} expanded={false} onToggle={onToggle} graphW={100} nodeX={30} {...over} />);
  return { onToggle };
}

describe("WorkingTreeRow", () => {
  it("shows the uncommitted-changes summary with the file count", () => {
    renderRow();
    expect(screen.getByText(/Modifiche non committate \(3\)/)).toBeInTheDocument();
  });

  it("hides the file list when collapsed and shows it when expanded", () => {
    renderRow({ expanded: false });
    expect(screen.queryByText("src/app.ts")).not.toBeInTheDocument();
    cleanup();
    renderRow({ expanded: true });
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(screen.getByText("staged")).toBeInTheDocument();
    expect(screen.getByText("unstaged")).toBeInTheDocument();
    expect(screen.getByText("untracked")).toBeInTheDocument();
  });

  it("toggles on row click", () => {
    const { onToggle } = renderRow();
    fireEvent.click(screen.getByText(/Modifiche non committate/));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("draws a dashed HEAD-lane node", () => {
    const { container } = render(
      <WorkingTreeRow files={files} expanded={false} onToggle={() => {}} graphW={100} nodeX={30} />,
    );
    const node = container.querySelector("circle");
    expect(node).not.toBeNull();
    expect(node!.getAttribute("stroke-dasharray")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/WorkingTreeRow.test.tsx --root packages/engine`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `packages/engine/src/ui/WorkingTreeRow.tsx`**

```tsx
import type { WorkingTreeFile } from "@michelepolo/git-swimlanes-contract";
import { LAYOUT } from "../layout.js";

export interface WorkingTreeRowProps {
  files: WorkingTreeFile[];
  expanded: boolean;
  onToggle: () => void;
  graphW: number;
  nodeX: number; // x of the dashed node (HEAD lane)
}

/** Color + label for a working-tree status code. */
function fileStatus(code: string): { label: string; color: string } {
  switch (code) {
    case "A": return { label: "aggiunto", color: "#5fc77f" };
    case "M": return { label: "modificato", color: "#e8b04b" };
    case "D": return { label: "eliminato", color: "#e06c75" };
    case "R": return { label: "rinominato", color: "#b48ead" };
    case "C": return { label: "copiato", color: "#56b6c2" };
    case "?": return { label: "non tracciato", color: "#8a96a8" };
    default: return { label: "modifica", color: "#8a96a8" };
  }
}

/**
 * Pinned pseudo-row for the uncommitted working tree: a dashed node on HEAD's lane plus an
 * expandable list of changed files (staged/unstaged/untracked). Read-only — see Phase 2 spec.
 */
export function WorkingTreeRow({ files, expanded, onToggle, graphW, nodeX }: WorkingTreeRowProps): JSX.Element {
  const cy = LAYOUT.rowH / 2;
  return (
    <div className="wt-band">
      <svg className="wt-graph" width={graphW} height={LAYOUT.rowH}>
        <line x1={nodeX} y1={cy} x2={nodeX} y2={LAYOUT.rowH} stroke="#8a96a8" strokeWidth={2} strokeDasharray="3 3" />
        <circle cx={nodeX} cy={cy} r={LAYOUT.dotR} fill="var(--bg)" stroke="#8a96a8" strokeWidth={2} strokeDasharray="3 2" />
      </svg>
      <div className="wt-rows">
        <div
          className="crow wt-row"
          role="button"
          tabIndex={0}
          style={{ height: LAYOUT.rowH }}
          onClick={onToggle}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggle()}
        >
          <span className="caret">{expanded ? "▾" : "▸"}</span>
          <span className="subj">Modifiche non committate ({files.length})</span>
        </div>
        {expanded && (
          <div className="files">
            {files.map((f) => {
              const staged = f.index !== " " && f.index !== "?";
              const code = f.index === "?" ? "?" : staged ? f.index : f.worktree;
              const st = fileStatus(code);
              const where = f.index === "?" ? "untracked" : staged ? "staged" : "unstaged";
              return (
                <div key={f.path} className="frow" data-path={f.path}>
                  <span className="fbadge" style={{ color: st.color, borderColor: st.color }} title={st.label}>
                    {code}
                  </span>
                  <span className="fpath">
                    {f.old ? <>{f.old} <span className="arr">→</span> {f.path}</> : f.path}
                  </span>
                  <span className="fopen">{where}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/WorkingTreeRow.test.tsx --root packages/engine`
Expected: PASS (4).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/ui/WorkingTreeRow.tsx packages/engine/test/WorkingTreeRow.test.tsx
git commit -m "feat(engine): WorkingTreeRow — uncommitted-changes pseudo-row"
```

---

### Task 4: GitSwimlanes integration (TDD)

**Files:** Modify `packages/engine/src/ui/GitSwimlanes.tsx`; Test `packages/engine/test/GitSwimlanes.test.tsx`

- [ ] **Step 1: Add the failing tests** — append inside the describe block in `packages/engine/test/GitSwimlanes.test.tsx`

```tsx
  it("shows the working-tree row when status is non-empty and hides it when empty", () => {
    const { rerender, container } = render(<GitSwimlanes commits={commits} status="M  src/x.ts" />);
    expect(screen.getByText(/Modifiche non committate \(1\)/)).toBeInTheDocument();
    rerender(<GitSwimlanes commits={commits} status="" />);
    expect(container.querySelector(".wt-band")).toBeNull();
  });

  it("calls onPull / onFetch from the toolbar buttons", () => {
    const onPull = vi.fn();
    const onFetch = vi.fn();
    render(<GitSwimlanes commits={commits} onPull={onPull} onFetch={onFetch} />);
    fireEvent.click(screen.getByRole("button", { name: /^pull$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^fetch$/i }));
    expect(onPull).toHaveBeenCalledTimes(1);
    expect(onFetch).toHaveBeenCalledTimes(1);
  });
```
(`rerender` is from Testing Library's `render` return — destructure it; `screen`/`fireEvent`/`vi` are already imported.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/GitSwimlanes.test.tsx --root packages/engine`
Expected: the two new tests FAIL (no `status` prop, no Pull/Fetch buttons).

- [ ] **Step 3: Edit `packages/engine/src/ui/GitSwimlanes.tsx`** — read it first, then:

(a) **Imports:** add `import { WorkingTreeRow } from "./WorkingTreeRow.js";`, `import { parseStatus } from "../model/parseStatus.js";`, add `laneX` to the existing `../layout.js` import (currently `{ computeOffsets, visibleRange }`), and add `WorkingTreeFile` is not needed directly (parseStatus returns it).

(b) **Props** (after `onViewConfigChange?(config: ViewConfig): void;`):
```tsx
  /** Raw `git status --porcelain` text; a working-tree row shows when non-empty. */
  status?: string;
  onPull?(): void;
  onFetch?(): void;
```

(c) **Destructure** `status`, `onPull`, `onFetch` with the other props.

(d) After the `model` memo, derive the status files, the HEAD-lane node x, and an expand state:
```tsx
  const statusFiles = useMemo(() => (status ? parseStatus(status) : []), [status]);
  const headLane = model.laneOf[model.commits.find((c) => c.head)?.hash ?? ""] ?? 0;
  const [wtExpanded, setWtExpanded] = useState(false);
```

(e) **Toolbar:** broaden the guard to include the new actions, and add two buttons inside `.sw-toolbar`. Change the guard line to:
```tsx
      {(onFetchPullRefs || onViewConfigChange || onPull || onFetch || (repos && repos.length > 1)) && (
```
Add (next to the other `.sw-btn` buttons):
```tsx
          {onPull && (
            <button type="button" className="sw-btn" aria-label="Pull" title="git pull" onClick={onPull}>
              ⟳ Pull
            </button>
          )}
          {onFetch && (
            <button type="button" className="sw-btn" aria-label="Fetch" title="git fetch --all --prune" onClick={onFetch}>
              ⤓ Fetch
            </button>
          )}
```

(f) **Render the band** between `.sw-head` and `.sw-scroll` — immediately after the closing `</div>` of the `.sw-head` block, add:
```tsx
      {statusFiles.length > 0 && (
        <WorkingTreeRow
          files={statusFiles}
          expanded={wtExpanded}
          onToggle={() => setWtExpanded((v) => !v)}
          graphW={model.graphW}
          nodeX={laneX(headLane)}
        />
      )}
```

- [ ] **Step 4: Run suite + typecheck**

Run: `npx vitest run test/GitSwimlanes.test.tsx --root packages/engine && npm run typecheck --workspace @michelepolo/git-swimlanes-engine`
Expected: all pass; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/ui/GitSwimlanes.tsx packages/engine/test/GitSwimlanes.test.tsx
git commit -m "feat(engine): working-tree row + Pull/Fetch toolbar actions"
```

---

### Task 5: webview routing (TDD)

**Files:** Modify `packages/engine/src/webviewController.ts`, `packages/engine/src/webview.ts`; Test `packages/engine/test/webviewController.test.ts`

- [ ] **Step 1: Add the failing tests** — append inside the describe block in `packages/engine/test/webviewController.test.ts`

```ts
  it("stores status from a status message", () => {
    const { ctrl, states } = setup();
    ctrl.receive({ type: "status", porcelain: "M  a.ts" });
    expect(states.at(-1)).toMatchObject({ status: "M  a.ts" });
  });

  it("preserves status across a setLog", () => {
    const { ctrl, states } = setup();
    ctrl.receive({ type: "status", porcelain: "M  a.ts" });
    ctrl.receive({ type: "setLog", log: "LOG" });
    expect(states.at(-1)).toMatchObject({ log: "LOG", status: "M  a.ts" });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/webviewController.test.ts --root packages/engine`
Expected: the two new tests FAIL.

- [ ] **Step 3: Edit `packages/engine/src/webviewController.ts`** — add `status?: string;` to the `ViewState` interface (next to `viewConfig?`), and add a case to the `receive` switch (next to `case "viewConfig":`):
```ts
        case "status":
          emit({ ...state, status: msg.porcelain });
          break;
```
(The other cases already spread `...state`, so `status` is preserved automatically.)

- [ ] **Step 4: Edit `packages/engine/src/webview.ts`** — in the `mount(...)` `createElement(GitSwimlanes, { ... })` props, add:
```ts
        status: state.status,
        onPull: () => host.post({ type: "pull" }),
        onFetch: () => host.post({ type: "fetch" }),
```

- [ ] **Step 5: Run engine suite + build**

Run: `npm test --workspace @michelepolo/git-swimlanes-engine && npm run build --workspace @michelepolo/git-swimlanes-engine`
Expected: all engine tests pass; `dist/engine.js` emitted.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/webviewController.ts packages/engine/src/webview.ts packages/engine/test/webviewController.test.ts
git commit -m "feat(engine): route status + pull/fetch in the webview controller"
```

---

### Task 6: VS Code host

**Files:** Modify `packages/vscode/src/GitService.ts`, `packages/vscode/src/SwimlanesViewProvider.ts`

- [ ] **Step 1: Add git methods** to `packages/vscode/src/GitService.ts` (next to `fetchPullRefs`)

```ts
  async fetch(): Promise<void> {
    await run("git", ["fetch", "--all", "--prune"], { cwd: this.cwd, maxBuffer: 16 * 1024 * 1024 });
  }

  async pull(): Promise<void> {
    await run("git", ["pull", "--ff"], { cwd: this.cwd, maxBuffer: 16 * 1024 * 1024 });
  }

  async status(): Promise<string> {
    const { stdout } = await run("git", ["-c", "core.quotepath=false", "status", "--porcelain"], {
      cwd: this.cwd, maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  }
```

- [ ] **Step 2: Wire the provider** — `packages/vscode/src/SwimlanesViewProvider.ts`

(a) In `refresh()`, after the `viewConfig` post (still inside the `try`), add a guarded status post:
```ts
      try {
        this.post({ type: "status", porcelain: await this.git.status() });
      } catch {
        /* status is optional; a failure must not blank the log */
      }
```

(b) Add a `runGitAction` helper (near `openFile`):
```ts
  private async runGitAction(label: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
      await this.refresh();
      void vscode.window.showInformationMessage(`Git Swimlanes: ${label} completato.`);
    } catch (e) {
      void vscode.window.showWarningMessage(`Git Swimlanes: ${label} fallito — ${String(e)}`);
    }
  }
```

(c) Add cases to `onMessage` (next to `fetchPullRefs`):
```ts
      case "pull":
        await this.runGitAction("Pull", () => this.git.pull());
        break;
      case "fetch":
        await this.runGitAction("Fetch", () => this.git.fetch());
        break;
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck --workspace git-swimlanes-vscode && npm run build --workspace git-swimlanes-vscode`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/vscode/src/GitService.ts packages/vscode/src/SwimlanesViewProvider.ts
git commit -m "feat(vscode): pull/fetch actions + working-tree status in refresh"
```

---

### Task 7: IntelliJ host

**Files:** Modify `intellij/.../GitService.kt`, `intellij/.../SwimlanesPanel.kt`

- [ ] **Step 1: Add git methods** to `intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/GitService.kt` (next to `fetchPullRefs`)

```kotlin
  fun fetch() {
    rawGit(listOf("fetch", "--all", "--prune"))
  }

  fun pull() {
    rawGit(listOf("pull", "--ff"))
  }

  fun status(): String = rawGit(listOf("-c", "core.quotepath=false", "status", "--porcelain"))
```

- [ ] **Step 2: Wire the panel** — `intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/SwimlanesPanel.kt`

(a) In `refresh()`: compute status on the pooled thread (where `git.log()` runs) and post it in the `onEdt { … }` block. After `val repos = git.repos()` add `val status = try { git.status() } catch (e: Exception) { null }`, and inside the `onEdt { … }` block, after the `viewConfig` post, add:
```kotlin
        if (status != null) postToWebview(mapOf("type" to "status", "porcelain" to status))
```

(b) Add a `runGitAction` helper (near `notify`):
```kotlin
  private fun runGitAction(label: String, block: () -> Unit) = runOnPooled {
    try {
      block()
      refresh()
      onEdt { notify("$label completato.", NotificationType.INFORMATION) }
    } catch (e: Exception) {
      onEdt { notify("$label fallito: ${e.message}", NotificationType.WARNING) }
    }
  }
```

(c) Add cases to the `when (msg.type)` in `handleFromWebview` (next to `fetchPullRefs`):
```kotlin
      "pull" -> runGitAction("Pull") { git.pull() }
      "fetch" -> runGitAction("Fetch") { git.fetch() }
```

- [ ] **Step 3: Sync + compile**

```bash
npm run build --workspace @michelepolo/git-swimlanes-engine && npm run sync
cd intellij && export JAVA_HOME="$HOME/.sdkman/candidates/java/current" && ./gradlew compileKotlin --console=plain 2>&1 | tail -4 && cd ..
```
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Commit**

```bash
git add intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/GitService.kt intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/SwimlanesPanel.kt
git commit -m "feat(intellij): pull/fetch actions + working-tree status in refresh"
```

---

### Task 8: CSS + end-to-end browser verification

**Files:** Modify `packages/engine/src/engine.css`

- [ ] **Step 1: Style the band** — append to `packages/engine/src/engine.css`

```css
/* ── Working-tree pseudo-row ─────────────────────────────────────────── */
.wt-band { display: flex; align-items: stretch; border-bottom: 1px dashed var(--line); }
.wt-graph { flex: none; display: block; }
.wt-rows { flex: 1; min-width: 440px; }
.wt-row { background: rgba(232, 176, 75, .05); }
```

- [ ] **Step 2: Build + sync + full suite**

Run: `npm run build && npm run sync && npm test`
Expected: build OK; all engine tests pass (parseStatus 5, WorkingTreeRow 4, GitSwimlanes incl. 2 new, controller incl. 2 new, plus existing).

- [ ] **Step 3: Browser-verify**

Serve `packages/engine/dist` and drive a harness whose `__host` logs every `post` and, on `ready`, sends a `setLog` plus `{ type:"status", porcelain:"M  src/app.ts\n?? new.ts" }`. Verify (Playwright/console):
- the "Modifiche non committate (2)" row appears with a dashed HEAD-lane node; expanding shows `M src/app.ts (unstaged)` + `?? new.ts (untracked)`;
- clicking **⟳ Pull** / **⤓ Fetch** posts `{type:"pull"}` / `{type:"fetch"}`;
- sending `{ type:"status", porcelain:"" }` removes the row.
Remove the harness after.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/engine.css
git commit -m "style(engine): working-tree band; Phase 2 verified end-to-end"
```

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-06-09-phase2-readonly-actions-design.md`):
- §2 action convention (`runGitAction` helper) → Task 6 (VS Code) + Task 7 (IntelliJ). ✓
- §3 pull/fetch (messages, toolbar, git methods) → Task 1 (messages), Task 4 (buttons), Task 5 (post), Tasks 6/7 (git + handlers). ✓
- §4 working-tree status (porcelain message, `parseStatus`, pseudo-row, HEAD-lane dashed node, read-only) → Task 1 (type/message), Task 2 (`parseStatus`), Task 3 (`WorkingTreeRow`), Task 4 (render + HEAD lane), Tasks 6/7 (status in refresh). ✓
- §5 error UX (notifications; status optional) → Tasks 6/7 (`runGitAction` notify, guarded status). ✓
- §6 edge cases (clean tree → no row; no HEAD → headLane defaults; rename; untracked; repo switch) → Task 2 (rename/untracked), Task 4 (`?? ` and empty-status guard, `?.hash ?? ""` → `?? 0` for missing HEAD), refresh re-sends per repo. ✓
- §7 testing → Tasks 2,3,4,5 (unit) + Tasks 6,7,8 (compile + browser). ✓
- §8 files → Tasks 1-8 touch exactly those. ✓

**Placeholder scan:** No TBD/vague steps. Task 8 Step 3 is a prose verification harness (manual/Playwright), consistent with prior phases — not a code deliverable.

**Type consistency:** `WorkingTreeFile {path, index, worktree, old?}` defined in Task 1, produced by `parseStatus` (Task 2), consumed by `WorkingTreeRow` (Task 3) and via `GitSwimlanes` (Task 4). Messages `pull`/`fetch` (Wv2Host) and `status{porcelain}` (Host2Wv) consistent across contract (T1), controller `ViewState.status` (T5), webview posts (T5), and both hosts (T6/T7). `runGitAction(label, fn)` signature consistent in both hosts. `status` prop is raw porcelain string end-to-end; only `parseStatus` turns it into files.
```
