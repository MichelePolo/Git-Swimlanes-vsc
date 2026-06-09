# Phase 1 — Pin & Hide Branches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pin branches to fixed leftmost lanes and hide branches (their commits collapse into one grey "hidden" lane), persisted per-repo and IDE-local — zero git mutations.

**Architecture:** Make `assignLanes` config-driven (`ViewConfig {pinned, hidden}`); add a Branches panel in the engine; route `viewConfig`/`setViewConfig` messages; persist in each host (VS Code `workspaceState`, IntelliJ `PersistentStateComponent`). Follows the existing "new contract message → handler in both hosts" pattern used for `repos`/`fetchPullRefs`.

**Tech Stack:** TypeScript/React engine (vitest + jsdom), npm workspaces, Kotlin/Gradle IntelliJ host, VS Code extension. Spec: `docs/superpowers/specs/2026-06-09-phase1-pin-hide-design.md`.

**Conventions:** all `npm`/`git` from repo root unless noted. IntelliJ build needs `export JAVA_HOME="$HOME/.sdkman/candidates/java/current"`. After any engine change that a host must see, run `npm run sync`. Start each task on the branch created in Task 0.

---

### Task 0: Branch

- [ ] **Step 1: Create the feature branch**

```bash
git checkout main && git pull --ff-only 2>/dev/null; git checkout -b phase1-pin-hide
```

---

### Task 1: Contract — ViewConfig, allBranches, messages

**Files:**
- Modify: `packages/contract/src/index.ts`

- [ ] **Step 1: Add the `ViewConfig` type** after the `RepoRef` interface

```ts
/** Per-repo view configuration (pin/hide branches). Names are normalized (no `origin/`). */
export interface ViewConfig {
  pinned: string[]; // branch names, in pin order (leftmost → right)
  hidden: string[]; // branch names to collapse into the "hidden" lane
}
```

- [ ] **Step 2: Add `allBranches` to `LaneModel`** (after `graphW`)

```ts
  graphW: number;
  /** All branch names present (visible + hidden), for the Branches panel. */
  allBranches: string[];
```

- [ ] **Step 3: Add the two messages**

In `Wv2Host`, after the `fetchPullRefs` line:
```ts
  | { type: "fetchPullRefs" }
  | { type: "setViewConfig"; config: ViewConfig };
```
In `Host2Wv`, after the `repos` line:
```ts
  | { type: "repos"; repos: RepoRef[]; current: string }
  | { type: "viewConfig"; config: ViewConfig };
```

- [ ] **Step 4: Build the contract**

Run: `npm run build --workspace @michelepolo/git-swimlanes-contract`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/contract/src/index.ts
git commit -m "feat(contract): ViewConfig + allBranches + viewConfig/setViewConfig messages"
```

---

### Task 2: `assignLanes` config-driven (TDD)

**Files:**
- Modify: `packages/engine/src/model/assignLanes.ts`
- Test: `packages/engine/test/assignLanes.test.ts`

- [ ] **Step 1: Add the failing tests** — append inside the existing `describe("assignLanes (spec §4.3)", …)` block in `packages/engine/test/assignLanes.test.ts`

```ts
  it("pins branches to the leftmost lanes in pin order", () => {
    const m = assignLanes(parseLog(LOG).commits, parseLog(LOG).byHash, {
      pinned: ["feature/login", "develop"],
      hidden: [],
    });
    expect(m.laneNames[0]).toBe("feature/login");
    expect(m.laneNames[1]).toBe("develop");
    expect(m.laneNames[2]).toBe("main"); // unpinned follow the default order
  });

  it("collapses hidden branches into a single 'hidden' lane", () => {
    const m = assignLanes(parseLog(LOG).commits, parseLog(LOG).byHash, {
      pinned: [],
      hidden: ["feature/login"],
    });
    expect(m.laneNames).not.toContain("feature/login");
    expect(m.laneNames).toContain("hidden");
    expect(m.branchOf["f1"]).toBe("hidden");
  });

  it("keeps the 'hidden' lane distinct from '(no branch ref)'", () => {
    const m = assignLanes(parseLog(LOG).commits, parseLog(LOG).byHash, {
      pinned: [],
      hidden: ["feature/login"],
    });
    // LOG's x1 is an orphan → (no branch ref); f1 is hidden → hidden. Two distinct lanes.
    expect(m.laneNames).toContain("hidden");
    expect(m.laneNames).toContain("(no branch ref)");
    expect(m.laneNames.indexOf("hidden")).not.toBe(m.laneNames.indexOf("(no branch ref)"));
  });

  it("lets hide win when a branch is both pinned and hidden", () => {
    const m = assignLanes(parseLog(LOG).commits, parseLog(LOG).byHash, {
      pinned: ["feature/login"],
      hidden: ["feature/login"],
    });
    expect(m.laneNames).not.toContain("feature/login");
    expect(m.branchOf["f1"]).toBe("hidden");
  });

  it("ignores config names absent from the log", () => {
    const m = assignLanes(parseLog(LOG).commits, parseLog(LOG).byHash, {
      pinned: ["does/not/exist"],
      hidden: ["also/absent"],
    });
    expect(m.laneNames[0]).toBe("main"); // unchanged default order
  });

  it("exposes every branch name in allBranches", () => {
    const m = assignLanes(parseLog(LOG).commits, parseLog(LOG).byHash, { pinned: [], hidden: ["feature/login"] });
    expect(m.allBranches).toEqual(expect.arrayContaining(["main", "develop", "feature/login"]));
  });

  it("is identical to the default when no config is passed (regression)", () => {
    const { commits, byHash } = parseLog(LOG);
    const a = assignLanes(commits, byHash);
    const b = assignLanes(commits, byHash, { pinned: [], hidden: [] });
    expect(a.laneNames).toEqual(b.laneNames);
    expect(a.branchOf).toEqual(b.branchOf);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/assignLanes.test.ts --root packages/engine`
Expected: FAIL — the new tests throw/assert (current `assignLanes` ignores a 3rd arg and has no `allBranches`).

- [ ] **Step 3: Rewrite `assignLanes`** — replace the whole file `packages/engine/src/model/assignLanes.ts`

```ts
import type { CommitNode, LaneModel, ViewConfig } from "@michelepolo/git-swimlanes-contract";
import { LAYOUT } from "../layout.js";

/** Deterministic default ordering: main/master first, then develop/dev, then alphabetical. */
function priority(name: string): [number, string] {
  if (name === "main" || name === "master") return [0, name];
  if (name === "develop" || name === "dev") return [1, name];
  return [2, name];
}

/**
 * Assign stable swimlane columns via first-parent claiming, honoring the view config.
 * Pinned branches take the leftmost lanes (in pin order); hidden branches don't claim a lane
 * of their own — their commits collapse into one shared "hidden" lane. Commits no branch
 * reaches fall back to "(no branch ref)". With the default empty config the result is
 * identical to the previous behavior. See engine spec §4.3 / Phase 1 spec.
 */
export function assignLanes(
  commits: CommitNode[],
  byHash: Record<string, CommitNode>,
  config: ViewConfig = { pinned: [], hidden: [] },
): LaneModel {
  const { pinned, hidden } = config;

  // 1. Branch tips, deduping remote/local by base name (prefer local).
  const tips: Record<string, { name: string; tip: string; remote: boolean }> = {};
  for (const c of commits)
    for (const b of c.branches) {
      const norm = b.replace(/^origin\//, "");
      if (!(norm in tips)) tips[norm] = { name: norm, tip: c.hash, remote: b !== norm };
      else if (tips[norm].remote && b === norm) tips[norm] = { name: norm, tip: c.hash, remote: false };
    }
  const allTips = Object.values(tips);

  // 2. Partition: hidden branches never get their own lane.
  const visible = allTips.filter((b) => !hidden.includes(b.name));
  const hiddenTips = allTips.filter((b) => hidden.includes(b.name));

  // 3. Order visible: pinned first (by pin index), then the default priority.
  const orderKey = (name: string): [number, number, number, string] => {
    const pi = pinned.indexOf(name);
    if (pi !== -1) return [0, pi, 0, name];
    const [tier, n] = priority(name);
    return [1, 0, tier, n];
  };
  visible.sort((a, b) => {
    const ka = orderKey(a.name);
    const kb = orderKey(b.name);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || ka[3].localeCompare(kb[3]);
  });

  // 4. Claim visible lanes by first-parent walk.
  const laneOf: Record<string, number> = {};
  const branchOf: Record<string, string> = {};
  visible.forEach((b, lane) => {
    let cur: string | undefined = b.tip;
    while (cur && byHash[cur] && laneOf[cur] === undefined) {
      laneOf[cur] = lane;
      branchOf[cur] = b.name;
      cur = byHash[cur].parents[0];
    }
  });
  const laneNames = visible.map((b) => b.name);

  // 5. Hidden branches claim the remaining commits into ONE shared "hidden" lane.
  let hiddenLane: number | null = null;
  for (const b of hiddenTips) {
    let cur: string | undefined = b.tip;
    while (cur && byHash[cur] && laneOf[cur] === undefined) {
      if (hiddenLane === null) {
        hiddenLane = laneNames.length;
        laneNames.push("hidden");
      }
      laneOf[cur] = hiddenLane;
      branchOf[cur] = "hidden";
      cur = byHash[cur].parents[0];
    }
  }

  // 6. Fallback lane for commits no branch reaches.
  let extra: number | null = null;
  for (const c of commits) {
    if (laneOf[c.hash] === undefined) {
      if (extra === null) {
        extra = laneNames.length;
        laneNames.push("(no branch ref)");
      }
      laneOf[c.hash] = extra;
      branchOf[c.hash] = "(no branch ref)";
    }
  }

  const allBranches = [
    ...visible.map((b) => b.name),
    ...hiddenTips.map((b) => b.name).sort((a, b) => a.localeCompare(b)),
  ];

  const rowOf: Record<string, number> = {};
  commits.forEach((c, i) => (rowOf[c.hash] = i));

  return {
    commits,
    byHash,
    laneOf,
    branchOf,
    laneNames,
    nLanes: laneNames.length,
    rowOf,
    graphW: LAYOUT.LP + laneNames.length * LAYOUT.laneW + LAYOUT.RP,
    allBranches,
  };
}
```

- [ ] **Step 4: Run the full assignLanes suite**

Run: `npx vitest run test/assignLanes.test.ts --root packages/engine`
Expected: PASS (6 original + 7 new = 13).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/model/assignLanes.ts packages/engine/test/assignLanes.test.ts
git commit -m "feat(engine): config-driven assignLanes (pin/hide) + allBranches"
```

---

### Task 3: Branches panel component (TDD)

**Files:**
- Create: `packages/engine/src/ui/BranchPanel.tsx`
- Test: `packages/engine/test/BranchPanel.test.tsx`

- [ ] **Step 1: Write the failing test** — `packages/engine/test/BranchPanel.test.tsx`

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BranchPanel } from "../src/ui/BranchPanel.js";

afterEach(cleanup);

const present = ["main", "develop", "feature/login"];

describe("BranchPanel", () => {
  it("lists each branch with pin and hide toggles", () => {
    render(<BranchPanel allBranches={present} config={{ pinned: [], hidden: [] }} onChange={() => {}} />);
    expect(screen.getByText("feature/login")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /pin/i })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /nascondi|hide/i })).toHaveLength(3);
  });

  it("pins a branch (append) on pin-toggle", () => {
    const onChange = vi.fn();
    render(<BranchPanel allBranches={present} config={{ pinned: [], hidden: [] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "pin feature/login" }));
    expect(onChange).toHaveBeenCalledWith({ pinned: ["feature/login"], hidden: [] });
  });

  it("un-pins a branch already pinned", () => {
    const onChange = vi.fn();
    render(<BranchPanel allBranches={present} config={{ pinned: ["main"], hidden: [] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "pin main" }));
    expect(onChange).toHaveBeenCalledWith({ pinned: [], hidden: [] });
  });

  it("hides a branch on hide-toggle", () => {
    const onChange = vi.fn();
    render(<BranchPanel allBranches={present} config={{ pinned: [], hidden: [] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "nascondi feature/login" }));
    expect(onChange).toHaveBeenCalledWith({ pinned: [], hidden: ["feature/login"] });
  });

  it("marks a configured branch absent from the current log", () => {
    render(<BranchPanel allBranches={present} config={{ pinned: ["gone/branch"], hidden: [] }} onChange={() => {}} />);
    expect(screen.getByText("gone/branch")).toBeInTheDocument();
    expect(screen.getByText(/assente/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/BranchPanel.test.tsx --root packages/engine`
Expected: FAIL — `Cannot find module '../src/ui/BranchPanel.js'`.

- [ ] **Step 3: Implement `packages/engine/src/ui/BranchPanel.tsx`**

```tsx
import type { ViewConfig } from "@michelepolo/git-swimlanes-contract";
import { colorFor } from "../model/color.js";

export interface BranchPanelProps {
  /** Branch names present in the current log. */
  allBranches: string[];
  config: ViewConfig;
  onChange: (next: ViewConfig) => void;
}

function toggle(list: string[], name: string): string[] {
  return list.includes(name) ? list.filter((n) => n !== name) : [...list, name];
}

/** Per-branch pin/hide controls. Lists present branches plus any configured-but-absent ones. */
export function BranchPanel({ allBranches, config, onChange }: BranchPanelProps): JSX.Element {
  const configured = [...config.pinned, ...config.hidden];
  const absent = configured.filter((n) => !allBranches.includes(n));
  const rows = [...allBranches, ...Array.from(new Set(absent))];

  return (
    <div className="branch-panel">
      {rows.map((name) => {
        const isAbsent = !allBranches.includes(name);
        return (
          <div key={name} className={`brow${isAbsent ? " absent" : ""}`}>
            <span className="bname" style={{ color: isAbsent ? "var(--dim)" : colorFor(name) }}>
              {name}
            </span>
            {isAbsent && <span className="babsent">assente</span>}
            <button
              type="button"
              className={`btoggle${config.pinned.includes(name) ? " on" : ""}`}
              aria-label={`pin ${name}`}
              title="Fissa la corsia (pin)"
              onClick={() => onChange({ ...config, pinned: toggle(config.pinned, name) })}
            >
              📌
            </button>
            <button
              type="button"
              className={`btoggle${config.hidden.includes(name) ? " on" : ""}`}
              aria-label={`nascondi ${name}`}
              title="Nascondi il branch (hide)"
              onClick={() => onChange({ ...config, hidden: toggle(config.hidden, name) })}
            >
              🙈
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/BranchPanel.test.tsx --root packages/engine`
Expected: PASS (5).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/ui/BranchPanel.tsx packages/engine/test/BranchPanel.test.tsx
git commit -m "feat(engine): BranchPanel — per-branch pin/hide toggles"
```

---

### Task 4: GitSwimlanes integration (TDD)

**Files:**
- Modify: `packages/engine/src/ui/GitSwimlanes.tsx`
- Test: `packages/engine/test/GitSwimlanes.test.tsx`

- [ ] **Step 1: Add the failing tests** — append inside the `describe` block in `packages/engine/test/GitSwimlanes.test.tsx`

```tsx
  it("applies viewConfig: hiding a branch removes its lane label", () => {
    const { container } = render(
      <GitSwimlanes commits={commits} viewConfig={{ pinned: [], hidden: ["feature/login"] }} />,
    );
    expect(container.querySelector('.lane-label[data-lane-label="feature/login"]')).toBeNull();
    expect(container.querySelector('.lane-label[data-lane-label="hidden"]')).not.toBeNull();
  });

  it("toggles the Branches panel from the toolbar and reports config changes", () => {
    const onViewConfigChange = vi.fn();
    render(<GitSwimlanes commits={commits} onViewConfigChange={onViewConfigChange} />);
    fireEvent.click(screen.getByRole("button", { name: /branches/i })); // open panel
    fireEvent.click(screen.getByRole("button", { name: "nascondi feature/login" }));
    expect(onViewConfigChange).toHaveBeenCalledWith({ pinned: [], hidden: ["feature/login"] });
  });
```

(The fixture's `commits` already contains the `feature/login` branch on `9a0b1c2` and the `f1`-style commit; the existing tests in this file use it. Reuse the same `commits` constant.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/GitSwimlanes.test.tsx --root packages/engine`
Expected: FAIL — no `viewConfig` prop, no Branches button.

- [ ] **Step 3: Wire `GitSwimlanes`** — three edits to `packages/engine/src/ui/GitSwimlanes.tsx`

(a) Import the panel and the type. Add to the imports:
```tsx
import { BranchPanel } from "./BranchPanel.js";
```
and add `ViewConfig` to the contract type import list.

(b) Extend `GitSwimlanesProps` (after `onFetchPullRefs?(): void;`):
```tsx
  /** Pin/hide view config; drives lane ordering and the Branches panel. */
  viewConfig?: ViewConfig;
  onViewConfigChange?(config: ViewConfig): void;
```

(c) In the component body: destructure the two props, build the model with the config, add panel open-state, and render the panel. Add a module-level stable default near the `DEFAULTS` const so the model `useMemo` is not invalidated every render:
```tsx
const EMPTY_VIEW_CONFIG: ViewConfig = { pinned: [], hidden: [] };
```
Then replace the model `useMemo` and add state:
```tsx
  // (add to the destructured props)
  // …, onFetchPullRefs, viewConfig, onViewConfigChange,

  const cfg = viewConfig ?? EMPTY_VIEW_CONFIG;
  const model = useMemo(() => {
    const parsed = commitsProp
      ? { commits: commitsProp, byHash: Object.fromEntries(commitsProp.map((c) => [c.hash, c])) }
      : parseLog(log ?? "");
    return assignLanes(parsed.commits, parsed.byHash, cfg);
  }, [log, commitsProp, cfg]);

  const [branchPanelOpen, setBranchPanelOpen] = useState(false);
```

(d) In the toolbar (the `.sw-toolbar` block) add a Branches toggle button and render the panel when open. The toolbar currently renders only when `onFetchPullRefs || repos>1`; broaden the condition to also show when `onViewConfigChange` exists, and add:
```tsx
          {onViewConfigChange && (
            <button
              type="button"
              className="sw-btn"
              aria-label="Branches"
              title="Pin / nascondi branch"
              onClick={() => setBranchPanelOpen((v) => !v)}
            >
              ⛋ Branches
            </button>
          )}
```
and, immediately after the `.sw-toolbar` div, render the panel:
```tsx
      {branchPanelOpen && onViewConfigChange && (
        <BranchPanel allBranches={model.allBranches} config={cfg} onChange={onViewConfigChange} />
      )}
```
Update the toolbar visibility guard to:
```tsx
      {(onFetchPullRefs || onViewConfigChange || (repos && repos.length > 1)) && (
```

- [ ] **Step 4: Run the GitSwimlanes suite**

Run: `npx vitest run test/GitSwimlanes.test.tsx --root packages/engine && npm run typecheck --workspace @michelepolo/git-swimlanes-engine`
Expected: PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/ui/GitSwimlanes.tsx packages/engine/test/GitSwimlanes.test.tsx
git commit -m "feat(engine): GitSwimlanes consumes viewConfig + renders Branches panel"
```

---

### Task 5: webview routing for viewConfig (TDD)

**Files:**
- Modify: `packages/engine/src/webviewController.ts`
- Modify: `packages/engine/src/webview.ts`
- Test: `packages/engine/test/webviewController.test.ts`

- [ ] **Step 1: Add the failing tests** — append inside the describe block in `packages/engine/test/webviewController.test.ts`

```ts
  it("stores viewConfig from a viewConfig message", () => {
    const { ctrl, states } = setup();
    ctrl.receive({ type: "viewConfig", config: { pinned: ["main"], hidden: ["x"] } });
    expect(states.at(-1)).toMatchObject({ viewConfig: { pinned: ["main"], hidden: ["x"] } });
  });

  it("preserves viewConfig across a setLog", () => {
    const { ctrl, states } = setup();
    ctrl.receive({ type: "viewConfig", config: { pinned: ["main"], hidden: [] } });
    ctrl.receive({ type: "setLog", log: "LOG" });
    expect(states.at(-1)).toMatchObject({ log: "LOG", viewConfig: { pinned: ["main"], hidden: [] } });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/webviewController.test.ts --root packages/engine`
Expected: FAIL (viewConfig not stored).

- [ ] **Step 3: Update the controller** — `packages/engine/src/webviewController.ts`

Add `viewConfig?: ViewConfig` to the `ViewState` interface (and `ViewConfig` to the contract import). Add a case in `receive`:
```ts
        case "viewConfig":
          emit({ ...state, viewConfig: msg.config });
          break;
```

- [ ] **Step 4: Wire `webview.ts`** — pass `viewConfig` and the change handler into the component

In `packages/engine/src/webview.ts`, in the `mount(...)` call to `createElement(GitSwimlanes, {...})`, add:
```ts
        viewConfig: state.viewConfig,
        onViewConfigChange: (config) => host.post({ type: "setViewConfig", config }),
```
(`mount` receives the latest `state`; `state.viewConfig` is already preserved by the controller.)

- [ ] **Step 5: Run the controller suite + engine build**

Run: `npm test --workspace @michelepolo/git-swimlanes-engine && npm run build --workspace @michelepolo/git-swimlanes-engine`
Expected: all engine tests pass; build emits `dist/engine.js`.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/webviewController.ts packages/engine/src/webview.ts packages/engine/test/webviewController.test.ts
git commit -m "feat(engine): route viewConfig/setViewConfig in the webview controller"
```

---

### Task 6: VS Code host persistence

**Files:**
- Modify: `packages/vscode/src/SwimlanesViewProvider.ts`

- [ ] **Step 1: Add view-config persistence + handler** to `packages/vscode/src/SwimlanesViewProvider.ts`

(a) Import `ViewConfig` from the contract type import.

(b) Add helpers and a post in `refresh()` (after the `repos` post):
```ts
    this.post({ type: "viewConfig", config: this.loadViewConfig() });
```

(c) Add the methods (near `openFile`):
```ts
  private viewConfigKey(): string {
    return `gitSwimlanes.viewConfig::${this.currentRoot}`;
  }

  private loadViewConfig(): import("@michelepolo/git-swimlanes-contract").ViewConfig {
    return this.ctx.workspaceState.get(this.viewConfigKey(), { pinned: [], hidden: [] });
  }
```

(d) Add a case in `onMessage`:
```ts
      case "setViewConfig":
        await this.ctx.workspaceState.update(this.viewConfigKey(), msg.config);
        this.post({ type: "viewConfig", config: msg.config });
        break;
```

- [ ] **Step 2: Typecheck + build the extension**

Run: `npm run typecheck --workspace git-swimlanes-vscode && npm run build --workspace git-swimlanes-vscode`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/vscode/src/SwimlanesViewProvider.ts
git commit -m "feat(vscode): persist pin/hide view config per repo (workspaceState)"
```

---

### Task 7: IntelliJ host persistence

**Files:**
- Create: `intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/ViewConfigStore.kt`
- Modify: `intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/Json.kt`
- Modify: `intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/SwimlanesPanel.kt`

- [ ] **Step 1: Create the persistent store** — `intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/ViewConfigStore.kt`

```kotlin
package io.github.michelepolo.gitswimlanes

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project

/** Per-repo pin/hide view config, persisted in the project's workspace file. */
@Service(Service.Level.PROJECT)
@State(name = "GitSwimlanesViewConfig", storages = [Storage("gitSwimlanesViewConfig.xml")])
class ViewConfigStore : PersistentStateComponent<ViewConfigStore.State> {
  class Entry {
    var pinned: MutableList<String> = mutableListOf()
    var hidden: MutableList<String> = mutableListOf()
  }
  class State {
    var byRepo: MutableMap<String, Entry> = mutableMapOf()
  }

  private var state = State()
  override fun getState() = state
  override fun loadState(s: State) {
    state = s
  }

  /** Returns (pinned, hidden) for a repo root. */
  fun load(repoRoot: String): Pair<List<String>, List<String>> {
    val e = state.byRepo[repoRoot] ?: return emptyList<String>() to emptyList()
    return e.pinned.toList() to e.hidden.toList()
  }

  fun save(repoRoot: String, pinned: List<String>, hidden: List<String>) {
    state.byRepo[repoRoot] = Entry().apply {
      this.pinned = pinned.toMutableList()
      this.hidden = hidden.toMutableList()
    }
  }

  companion object {
    fun of(project: Project): ViewConfigStore = project.service()
  }
}
```

- [ ] **Step 2: Add `config` fields to `WvMessage`** — `intellij/.../Json.kt`

The `setViewConfig` message carries `config: { pinned, hidden }`. Add a nested holder + field to `WvMessage`:
```kotlin
data class ViewConfigDto(
  val pinned: List<String> = emptyList(),
  val hidden: List<String> = emptyList(),
)

data class WvMessage(
  val type: String,
  val reqId: String? = null,
  val hash: String? = null,
  val path: String? = null,
  val oldPath: String? = null,
  val id: String? = null,
  val config: ViewConfigDto? = null,
)
```

- [ ] **Step 3: Send viewConfig on refresh + handle setViewConfig** — `intellij/.../SwimlanesPanel.kt`

(a) In `refresh()` inside the `onEdt { … }` block, after the `repos` post, add:
```kotlin
        val (pinned, hidden) = ViewConfigStore.of(project).load(git.currentRootPath())
        postToWebview(
          mapOf("type" to "viewConfig", "config" to mapOf("pinned" to pinned, "hidden" to hidden)),
        )
```

(b) In `handleFromWebview`'s `when (msg.type)`, add a case:
```kotlin
      "setViewConfig" -> {
        val cfg = msg.config ?: ViewConfigDto()
        ViewConfigStore.of(project).save(git.currentRootPath(), cfg.pinned, cfg.hidden)
        onEdt {
          postToWebview(
            mapOf("type" to "viewConfig", "config" to mapOf("pinned" to cfg.pinned, "hidden" to cfg.hidden)),
          )
        }
      }
```

- [ ] **Step 4: Sync the engine bundle + compile**

```bash
npm run build --workspace @michelepolo/git-swimlanes-engine && npm run sync
cd intellij && export JAVA_HOME="$HOME/.sdkman/candidates/java/current" && ./gradlew compileKotlin && cd ..
```
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Commit**

```bash
git add intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/ViewConfigStore.kt intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/Json.kt intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/SwimlanesPanel.kt
git commit -m "feat(intellij): persist pin/hide view config per repo (PersistentStateComponent)"
```

---

### Task 8: CSS + end-to-end browser verification

**Files:**
- Modify: `packages/engine/src/engine.css`

- [ ] **Step 1: Style the panel** — append to `packages/engine/src/engine.css`

```css
/* ── Branches panel (pin/hide) ──────────────────────────────────────── */
.branch-panel {
  flex: none;
  max-height: 220px;
  overflow-y: auto;
  border-bottom: 1px solid var(--line);
  background: var(--panel2);
  padding: 4px 8px;
}
.brow { display: flex; align-items: center; gap: 8px; padding: 2px 0; font-size: 12px; }
.brow .bname { flex: 1; font-family: "IBM Plex Mono", ui-monospace, monospace; white-space: nowrap; }
.brow.absent .bname { font-style: italic; }
.babsent { font-size: 10px; color: var(--dim); text-transform: uppercase; letter-spacing: .06em; }
.btoggle {
  border: 1px solid var(--line); background: transparent; border-radius: 5px;
  padding: 0 5px; cursor: pointer; opacity: .55; line-height: 1.6;
}
.btoggle.on { opacity: 1; border-color: #7b93ff; background: #7b93ff22; }
```

- [ ] **Step 2: Build, sync, run the full engine suite**

Run: `npm run build && npm test`
Expected: build OK; all engine tests pass (assignLanes 13, BranchPanel 5, GitSwimlanes incl. 2 new, controller incl. 2 new, others unchanged).

- [ ] **Step 3: Browser-verify the flow**

Create a throwaway harness that feeds a multi-branch log and a `__host` backed by an in-memory config, then drive it:
```bash
# build is done; serve dist and open packages/engine/dist/harness.html with a script that
# (1) sends setLog with a 3-branch log, (2) sends an initial viewConfig {pinned:[],hidden:[]},
# (3) logs every host.post. Verify in the browser console / via Playwright that:
#   - opening "⛋ Branches" lists the branches with 📌/🙈,
#   - clicking 🙈 on a branch posts setViewConfig and the lane collapses into "hidden",
#   - clicking 📌 reorders the lane to the left,
#   - a re-sent viewConfig re-renders without a setLog.
```
Expected: lane changes match the toggles; `setViewConfig` is posted with the correct config. (This mirrors the verification done for the repo selector and openFile.) Remove the harness after.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/engine.css
git commit -m "style(engine): Branches panel; Phase 1 pin/hide verified end-to-end"
```

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-06-09-phase1-pin-hide-design.md`):
- §2 model (ViewConfig, allBranches) → Task 1. ✓
- §3 algorithm (pin front-order, hidden lane, distinct fallback, hide-wins, absent ignored, default-identical, allBranches) → Task 2 (7 tests). ✓
- §4 Branches panel (list, toggles, absent marker, onChange) → Task 3 + rendered in Task 4. ✓
- §5 messages + persistence → Task 1 (messages), Task 5 (controller/webview routing + preservation), Task 6 (VS Code workspaceState), Task 7 (IntelliJ PersistentStateComponent). ✓
- §6 edge cases → covered by Task 2 tests (pin+hide, absent, default) and the per-repo key in Tasks 6/7. ✓
- §7 testing → assignLanes (T2), BranchPanel (T3), controller (T5), host compile + browser (T6-T8). ✓
- §8 files → Tasks 1-8 touch exactly those files. ✓

**Placeholder scan:** No TBD/"add error handling"/vague steps. Task 8 Step 3 describes a verification harness in prose (not production code) — acceptable as it's a manual/Playwright check mirroring prior verifications, not a code deliverable.

**Type consistency:** `ViewConfig {pinned, hidden}` used identically in contract (T1), assignLanes (T2), BranchPanel (T3), GitSwimlanes (T4), controller `ViewState.viewConfig` (T5), and both hosts (T6/T7). Messages `setViewConfig`/`viewConfig` carry `config: ViewConfig` consistently. `allBranches` defined in `LaneModel` (T1) and produced by assignLanes (T2), consumed by BranchPanel via GitSwimlanes (T4). Lane label `hidden` / `(no branch ref)` strings consistent between T2 and the T4 assertion.
