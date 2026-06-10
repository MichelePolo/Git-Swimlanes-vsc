# Phase 3 — Non-destructive operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add create/delete branch & tag, checkout/switch, and push — the first operations that write to local refs and the working tree, without rewriting history.

**Architecture:** Extends Phase 2's `runGitAction(label, block)` convention with typed `Wv2Host` messages carrying args. A hybrid trigger UI (right-click context menu on commit rows + lane labels, toolbar for global actions) emits engine callbacks; the host collects names/confirmations via **native** IDE dialogs and runs git. No new `Host2Wv` messages — the existing `refresh()` reflects every change. Engine stays deterministic.

**Tech Stack:** TypeScript/React engine (vitest + jsdom), npm workspaces, VS Code extension, Kotlin/Gradle IntelliJ host. Spec: `docs/superpowers/specs/2026-06-10-phase3-nondestructive-ops-design.md`.

**Conventions:** `npm`/`git` from repo root. IntelliJ build: `export JAVA_HOME="$HOME/.sdkman/candidates/java/current"`. Run `npm run sync` after engine changes a host loads. Italian user-facing strings (matches the codebase).

---

### Task 0: Branch

- [ ] **Step 1**

Base depends on Phase 2 (PR #2) status — Phase 3 builds on Phase 2's `runGitAction`:
- If PR #2 is **merged** to `main`: `git checkout main && git pull --ff-only && git checkout -b phase3-nondestructive-ops`
- If PR #2 is **still open**: stack on it — `git checkout phase2-read-actions && git checkout -b phase3-nondestructive-ops`

(Resolved at execution handoff. The plan's code is identical either way.)

---

### Task 1: Contract — six action messages

**Files:** Modify `packages/contract/src/index.ts`

- [ ] **Step 1: Add the messages.** In the `Wv2Host` union, replace the final two members (`| { type: "pull" }` / `| { type: "fetch" }`) so the union ends:

```ts
  | { type: "pull" }
  | { type: "fetch" }
  | { type: "createBranch"; hash: string }
  | { type: "createTag"; hash: string }
  | { type: "deleteBranch"; name: string }
  | { type: "deleteTag"; name: string }
  | { type: "checkout"; target: string; detach: boolean }
  | { type: "push" };
```
(No `Host2Wv` change — results flow through the existing `refresh()`.)

- [ ] **Step 2: Build**

Run: `npm run build --workspace @michelepolo/git-swimlanes-contract`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/contract/src/index.ts
git commit -m "feat(contract): create/delete branch+tag, checkout, push messages"
```

---

### Task 2: `ContextMenu` component (TDD)

**Files:** Create `packages/engine/src/ui/ContextMenu.tsx`; Test `packages/engine/test/ContextMenu.test.tsx`

- [ ] **Step 1: Write the failing test** — `packages/engine/test/ContextMenu.test.tsx`

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ContextMenu, type MenuItem } from "../src/ui/ContextMenu.js";

afterEach(cleanup);

const items: MenuItem[] = [
  { label: "Crea branch qui", onSelect: () => {} },
  { label: 'Elimina tag "v1"', onSelect: () => {}, danger: true },
];

describe("ContextMenu", () => {
  it("renders each item label", () => {
    render(<ContextMenu x={10} y={20} items={items} onClose={() => {}} />);
    expect(screen.getByText("Crea branch qui")).toBeInTheDocument();
    expect(screen.getByText('Elimina tag "v1"')).toBeInTheDocument();
  });

  it("marks danger items with the danger class", () => {
    const { container } = render(<ContextMenu x={0} y={0} items={items} onClose={() => {}} />);
    expect(container.querySelector(".ctx-item.danger")).not.toBeNull();
  });

  it("invokes onSelect and onClose when an item is clicked", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={[{ label: "Go", onSelect }]} onClose={onClose} />);
    fireEvent.click(screen.getByText("Go"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={items} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on an outside click", () => {
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={items} onClose={onClose} />);
    fireEvent.click(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/ContextMenu.test.tsx --root packages/engine`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/engine/src/ui/ContextMenu.tsx`**

```tsx
import { useEffect } from "react";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

/**
 * A small positioned popup menu for ref actions. Closes on Escape or any outside click.
 * `x`/`y` are viewport coordinates (the menu is `position: fixed`). Clicks inside the menu
 * are stopped so they don't trigger the outside-click close before the item handler runs.
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    const onDocClick = (): void => onClose();
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onDocClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onDocClick);
    };
  }, [onClose]);

  return (
    <div className="ctx-menu" style={{ left: x, top: y }} role="menu" onClick={(e) => e.stopPropagation()}>
      {items.map((it, i) => (
        <button
          key={i}
          type="button"
          role="menuitem"
          className={`ctx-item${it.danger ? " danger" : ""}`}
          onClick={() => {
            it.onSelect();
            onClose();
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/ContextMenu.test.tsx --root packages/engine`
Expected: PASS (5).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/ui/ContextMenu.tsx packages/engine/test/ContextMenu.test.tsx
git commit -m "feat(engine): ContextMenu — positioned popup for ref actions"
```

---

### Task 3: `LaneHeader` context-menu hook (TDD)

**Files:** Modify `packages/engine/src/ui/LaneHeader.tsx`; Test `packages/engine/test/LaneHeader.test.tsx`

- [ ] **Step 1: Add the failing test.** Create `packages/engine/test/LaneHeader.test.tsx` (if the file already exists, append the test inside its describe block, reusing its imports):

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import type { LaneModel } from "@michelepolo/git-swimlanes-contract";
import { LaneHeader } from "../src/ui/LaneHeader.js";

afterEach(cleanup);

const model = { laneNames: ["main", "feature"], graphW: 120 } as unknown as LaneModel;

describe("LaneHeader context-menu hook", () => {
  it("calls onLaneContextMenu with the lane name on right-click", () => {
    const onLaneContextMenu = vi.fn();
    const { container } = render(<LaneHeader model={model} onLaneContextMenu={onLaneContextMenu} />);
    const label = container.querySelector('.lane-label[data-lane-label="feature"]');
    fireEvent.contextMenu(label!);
    expect(onLaneContextMenu).toHaveBeenCalledTimes(1);
    expect(onLaneContextMenu.mock.calls[0][0]).toBe("feature");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/LaneHeader.test.tsx --root packages/engine`
Expected: FAIL — `onLaneContextMenu` is not wired (handler never called).

- [ ] **Step 3: Edit `packages/engine/src/ui/LaneHeader.tsx`** — add the prop and wire it to each label.

In `LaneHeaderProps`, after `color?`:
```ts
  /** Right-click on a lane label (the branch name). */
  onLaneContextMenu?(name: string, e: React.MouseEvent): void;
```
Add `import type { MouseEvent } from "react";` is unnecessary — use `React.MouseEvent` via the existing React types; if the file has no React import for types, change the signature to `onLaneContextMenu?(name: string, e: { preventDefault(): void }): void` to avoid importing. (Pick whichever compiles; the engine uses the automatic JSX runtime, so prefer the structural `{ preventDefault(): void }` type to avoid a React namespace import.)

Update the function signature to destructure it:
```ts
export function LaneHeader({ model, color = colorFor, onLaneContextMenu }: LaneHeaderProps): JSX.Element {
```
On the `.lane-label` span, add the handler:
```tsx
            <span
              className="lane-label"
              data-lane-label={name}
              style={{ left: x, color: c }}
              title={name}
              onContextMenu={(e) => onLaneContextMenu?.(name, e)}
            >
              {short}
            </span>
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/LaneHeader.test.tsx --root packages/engine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/ui/LaneHeader.tsx packages/engine/test/LaneHeader.test.tsx
git commit -m "feat(engine): LaneHeader onLaneContextMenu hook"
```

---

### Task 4: GitSwimlanes integration (TDD)

**Files:** Modify `packages/engine/src/ui/GitSwimlanes.tsx`; Test `packages/engine/test/GitSwimlanes.test.tsx`

- [ ] **Step 1: Add the failing tests** — append inside the top-level describe block in `packages/engine/test/GitSwimlanes.test.tsx` (the file already imports `render`, `screen`, `fireEvent`, `vi`, `parseLog`, `GitSwimlanes`):

```tsx
  const LOG_T = [
    "m1|m0|HEAD -> main, tag: v1.0|Ann|2024-01-03|main tip",
    "f1|m0|feature|Ann|2024-01-02|feature tip",
    "m0|||Ann|2024-01-01|base",
  ].join("\n");
  const commitsT = parseLog(LOG_T).commits;

  it("opens a commit context menu (create/checkout + delete-tag) on right-click", () => {
    const onCreateBranch = vi.fn();
    const { container } = render(
      <GitSwimlanes
        commits={commitsT}
        onCreateBranch={onCreateBranch}
        onCreateTag={vi.fn()}
        onCheckout={vi.fn()}
        onDeleteTag={vi.fn()}
      />,
    );
    fireEvent.contextMenu(container.querySelector(".sw-rowpos")!); // first row = m1 (tagged HEAD)
    expect(screen.getByText("Crea branch qui")).toBeInTheDocument();
    expect(screen.getByText("Crea tag qui")).toBeInTheDocument();
    expect(screen.getByText("Checkout questo commit")).toBeInTheDocument();
    expect(screen.getByText('Elimina tag "v1.0"')).toBeInTheDocument();
    fireEvent.click(screen.getByText("Crea branch qui"));
    expect(onCreateBranch).toHaveBeenCalledWith("m1");
  });

  it("opens a lane-label menu (switch + delete) for a real branch", () => {
    const onDeleteBranch = vi.fn();
    const { container } = render(
      <GitSwimlanes commits={commitsT} onCheckout={vi.fn()} onDeleteBranch={onDeleteBranch} />,
    );
    fireEvent.contextMenu(container.querySelector('.lane-label[data-lane-label="main"]')!);
    expect(screen.getByText('Switch a "main"')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Elimina branch "main"'));
    expect(onDeleteBranch).toHaveBeenCalledWith("main");
  });

  it("does not open a menu on the hidden pseudo-lane", () => {
    const { container } = render(
      <GitSwimlanes
        commits={parseLog(LOG_T).commits}
        viewConfig={{ pinned: [], hidden: ["feature"] }}
        onCheckout={vi.fn()}
        onDeleteBranch={vi.fn()}
      />,
    );
    const hidden = container.querySelector('.lane-label[data-lane-label="hidden"]');
    expect(hidden).not.toBeNull(); // feature's commit falls into the grey 'hidden' lane (Phase 1)
    fireEvent.contextMenu(hidden!);
    expect(screen.queryByText(/^Switch a/)).toBeNull();
  });

  it("fires onCreateBranch(headHash) and onPush from the toolbar", () => {
    const onCreateBranch = vi.fn();
    const onPush = vi.fn();
    render(<GitSwimlanes commits={commitsT} onCreateBranch={onCreateBranch} onPush={onPush} />);
    fireEvent.click(screen.getByRole("button", { name: /nuovo branch/i }));
    expect(onCreateBranch).toHaveBeenCalledWith("m1"); // m1 is HEAD
    fireEvent.click(screen.getByRole("button", { name: /^push$/i }));
    expect(onPush).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/GitSwimlanes.test.tsx --root packages/engine`
Expected: the four new tests FAIL.

- [ ] **Step 3: Edit `packages/engine/src/ui/GitSwimlanes.tsx`.** Read the file first, then apply:

(a) **Imports** — add `ContextMenu` + its type:
```ts
import { ContextMenu, type MenuItem } from "./ContextMenu.js";
```

(b) **Props interface** — after `onFetch?(): void;`:
```ts
  onCreateBranch?(hash: string): void;
  onCreateTag?(hash: string): void;
  onDeleteBranch?(name: string): void;
  onDeleteTag?(name: string): void;
  onCheckout?(target: string, detach: boolean): void;
  onPush?(): void;
```

(c) **Destructure** them in the function body (next to `onFetch`):
```ts
    onCreateBranch,
    onCreateTag,
    onDeleteBranch,
    onDeleteTag,
    onCheckout,
    onPush,
```

(d) **Derived HEAD hash + menu state + builders** — after the existing `const headLane = …` line, add:
```ts
  const headHash = model.commits.find((c) => c.head)?.hash;
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const PSEUDO_LANES = new Set(["hidden", "(no branch ref)"]);

  function openCommitMenu(e: { preventDefault(): void; clientX: number; clientY: number }, c: CommitNode): void {
    const items: MenuItem[] = [];
    if (onCreateBranch) items.push({ label: "Crea branch qui", onSelect: () => onCreateBranch(c.hash) });
    if (onCreateTag) items.push({ label: "Crea tag qui", onSelect: () => onCreateTag(c.hash) });
    if (onCheckout) items.push({ label: "Checkout questo commit", onSelect: () => onCheckout(c.hash, true) });
    if (onDeleteTag) for (const t of c.tags) items.push({ label: `Elimina tag "${t}"`, onSelect: () => onDeleteTag(t), danger: true });
    if (!items.length) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, items });
  }

  function openLaneMenu(e: { preventDefault(): void; clientX: number; clientY: number }, name: string): void {
    if (PSEUDO_LANES.has(name)) return;
    const items: MenuItem[] = [];
    if (onCheckout) items.push({ label: `Switch a "${name}"`, onSelect: () => onCheckout(name, false) });
    if (onDeleteBranch) items.push({ label: `Elimina branch "${name}"`, onSelect: () => onDeleteBranch(name), danger: true });
    if (!items.length) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, items });
  }
```

(e) **Toolbar guard** — extend it to include the new global actions. Change:
```tsx
      {(onFetchPullRefs || onViewConfigChange || onPull || onFetch || (repos && repos.length > 1)) && (
```
to:
```tsx
      {(onFetchPullRefs || onViewConfigChange || onPull || onFetch || onCreateBranch || onPush || (repos && repos.length > 1)) && (
```

(f) **Toolbar buttons** — inside `.sw-toolbar`, after the Fetch button block, add:
```tsx
          {onCreateBranch && headHash && (
            <button
              type="button"
              className="sw-btn"
              aria-label="Nuovo branch"
              title="Crea un branch da HEAD"
              onClick={() => onCreateBranch(headHash)}
            >
              ⎇ Nuovo branch
            </button>
          )}
          {onPush && (
            <button type="button" className="sw-btn" aria-label="Push" title="git push" onClick={onPush}>
              ⇡ Push
            </button>
          )}
```

(g) **Lane-label menu** — pass the handler to `LaneHeader`:
```tsx
        <LaneHeader model={model} color={color} onLaneContextMenu={(name, e) => openLaneMenu(e, name)} />
```

(h) **Commit-row trigger** — on the `.sw-rowpos` wrapper div, add `onContextMenu`:
```tsx
                <div
                  key={c.hash}
                  className="sw-rowpos"
                  style={{ position: "absolute", top: offsets.top[i], left: 0, right: 0 }}
                  onContextMenu={(e) => openCommitMenu(e, c)}
                >
```

(i) **Render the menu** — just before the final closing `</div>` of the component (after the `{diff && (…)}` block), add:
```tsx
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
```

- [ ] **Step 4: Run the suite + typecheck**

Run: `npx vitest run test/GitSwimlanes.test.tsx --root packages/engine && npm run typecheck --workspace @michelepolo/git-swimlanes-engine`
Expected: all pass; typecheck exit 0. (If the `hidden`-lane test fails because the lane label is absent, verify Phase 1 hide behavior is present on this branch and adjust the fixture; the menu-exclusion assertion must hold.)

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/ui/GitSwimlanes.tsx packages/engine/test/GitSwimlanes.test.tsx
git commit -m "feat(engine): ref-action context menus + New branch/Push toolbar"
```

---

### Task 5: webview wiring + CSS

**Files:** Modify `packages/engine/src/webview.ts`, `packages/engine/src/engine.css`

- [ ] **Step 1: Map callbacks to posts** — in `packages/engine/src/webview.ts`, in the `createElement(GitSwimlanes, { … })` props (next to `onPull`/`onFetch`), add:
```ts
        onCreateBranch: (hash) => host.post({ type: "createBranch", hash }),
        onCreateTag: (hash) => host.post({ type: "createTag", hash }),
        onDeleteBranch: (name) => host.post({ type: "deleteBranch", name }),
        onDeleteTag: (name) => host.post({ type: "deleteTag", name }),
        onCheckout: (target, detach) => host.post({ type: "checkout", target, detach }),
        onPush: () => host.post({ type: "push" }),
```

- [ ] **Step 2: Style the menu** — append to `packages/engine/src/engine.css`:
```css
/* ── Context menu (ref actions) ─────────────────────────────────────── */
.ctx-menu {
  position: fixed; z-index: 50; min-width: 184px;
  background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
  padding: 4px; box-shadow: 0 6px 22px #0009;
}
.ctx-item {
  display: block; width: 100%; text-align: left;
  background: none; border: none; color: var(--txt);
  font: inherit; font-size: 12.5px; padding: 6px 10px; border-radius: 5px; cursor: pointer;
}
.ctx-item:hover { background: rgba(120, 150, 255, .14); }
.ctx-item.danger { color: #f0a8ad; }
.ctx-item.danger:hover { background: rgba(224, 108, 117, .16); }
```

- [ ] **Step 3: Build + typecheck + full engine suite**

Run: `npm run typecheck --workspace @michelepolo/git-swimlanes-engine && npm test --workspace @michelepolo/git-swimlanes-engine && npm run build --workspace @michelepolo/git-swimlanes-engine`
Expected: typecheck 0; all engine tests pass; `dist/engine.js` emitted.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/webview.ts packages/engine/src/engine.css
git commit -m "feat(engine): wire ref-action posts + context-menu styles"
```

---

### Task 6: VS Code host

**Files:** Modify `packages/vscode/src/GitService.ts`, `packages/vscode/src/SwimlanesViewProvider.ts`

- [ ] **Step 1: Add git methods** to `packages/vscode/src/GitService.ts` (after `show(...)`, before the closing brace):
```ts
  async createBranch(name: string, hash: string): Promise<void> {
    await run("git", ["branch", name, hash], { cwd: this.cwd });
  }

  async createTag(name: string, hash: string): Promise<void> {
    await run("git", ["tag", name, hash], { cwd: this.cwd });
  }

  async deleteBranch(name: string): Promise<void> {
    await run("git", ["branch", "-d", name], { cwd: this.cwd });
  }

  async deleteTag(name: string): Promise<void> {
    await run("git", ["tag", "-d", name], { cwd: this.cwd });
  }

  async switchRef(target: string, detach: boolean): Promise<void> {
    const args = detach ? ["switch", "--detach", target] : ["switch", target];
    await run("git", args, { cwd: this.cwd });
  }

  async currentBranchInfo(): Promise<{ branch: string; hasUpstream: boolean; remote: string }> {
    const { stdout: branch } = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: this.cwd });
    let hasUpstream = false;
    try {
      await run("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { cwd: this.cwd });
      hasUpstream = true;
    } catch {
      hasUpstream = false;
    }
    return { branch: branch.trim(), hasUpstream, remote: await this.remoteName() };
  }

  async push(opts: { setUpstream: boolean; remote: string; branch: string; tags: boolean }): Promise<void> {
    if (opts.setUpstream) await run("git", ["push", "-u", opts.remote, opts.branch], { cwd: this.cwd });
    else await run("git", ["push"], { cwd: this.cwd });
    if (opts.tags) await run("git", ["push", opts.remote, "--tags"], { cwd: this.cwd });
  }
```

- [ ] **Step 2: Add message handlers** to `packages/vscode/src/SwimlanesViewProvider.ts` — in the `onMessage` switch, after `case "fetch":`:
```ts
      case "createBranch": {
        const name = await vscode.window.showInputBox({
          prompt: `Nuovo branch dal commit ${msg.hash.slice(0, 8)}`,
          placeHolder: "nome-branch",
          validateInput: (v) => (v.trim() && !/\s/.test(v.trim()) ? null : "Nome non valido"),
        });
        if (name?.trim()) await this.runGitAction("Crea branch", () => this.git.createBranch(name.trim(), msg.hash));
        break;
      }
      case "createTag": {
        const name = await vscode.window.showInputBox({
          prompt: `Nuovo tag dal commit ${msg.hash.slice(0, 8)}`,
          placeHolder: "nome-tag",
          validateInput: (v) => (v.trim() && !/\s/.test(v.trim()) ? null : "Nome non valido"),
        });
        if (name?.trim()) await this.runGitAction("Crea tag", () => this.git.createTag(name.trim(), msg.hash));
        break;
      }
      case "deleteBranch": {
        const ok = await vscode.window.showWarningMessage(`Eliminare il branch "${msg.name}"?`, { modal: true }, "Elimina");
        if (ok === "Elimina") await this.runGitAction("Elimina branch", () => this.git.deleteBranch(msg.name));
        break;
      }
      case "deleteTag": {
        const ok = await vscode.window.showWarningMessage(`Eliminare il tag "${msg.name}"?`, { modal: true }, "Elimina");
        if (ok === "Elimina") await this.runGitAction("Elimina tag", () => this.git.deleteTag(msg.name));
        break;
      }
      case "checkout": {
        if (msg.detach) {
          const ok = await vscode.window.showWarningMessage(
            `Checkout del commit ${msg.target.slice(0, 8)} — passerai a HEAD detached.`,
            { modal: true },
            "Continua",
          );
          if (ok !== "Continua") break;
        }
        await this.runGitAction("Checkout", () => this.git.switchRef(msg.target, msg.detach));
        break;
      }
      case "push":
        await this.handlePush();
        break;
```

- [ ] **Step 3: Add the push helper** to `SwimlanesViewProvider.ts` (next to `runGitAction`):
```ts
  private async handlePush(): Promise<void> {
    let info: { branch: string; hasUpstream: boolean; remote: string };
    try {
      info = await this.git.currentBranchInfo();
    } catch (e) {
      void vscode.window.showWarningMessage(`Git Swimlanes: Push non disponibile — ${String(e)}`);
      return;
    }
    if (info.branch === "HEAD") {
      void vscode.window.showWarningMessage("Git Swimlanes: HEAD detached, nessun branch da pushare.");
      return;
    }
    const label = info.hasUpstream
      ? `Push del branch "${info.branch}"?`
      : `Push di "${info.branch}" e imposta upstream?`;
    const choice = await vscode.window.showWarningMessage(label, { modal: true }, "Push", "Push + tag");
    if (choice !== "Push" && choice !== "Push + tag") return;
    const tags = choice === "Push + tag";
    await this.runGitAction("Push", () =>
      this.git.push({ setUpstream: !info.hasUpstream, remote: info.remote, branch: info.branch, tags }),
    );
  }
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck --workspace git-swimlanes-vscode && npm run build --workspace git-swimlanes-vscode`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/vscode/src/GitService.ts packages/vscode/src/SwimlanesViewProvider.ts
git commit -m "feat(vscode): create/delete ref, checkout, push handlers (native dialogs)"
```

---

### Task 7: IntelliJ host

**Files:** Modify `intellij/.../Json.kt`, `intellij/.../GitService.kt`, `intellij/.../SwimlanesPanel.kt`

- [ ] **Step 1: Extend the message DTO** — in `intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/Json.kt`, add fields to `WvMessage` (after `id`):
```kotlin
  val name: String? = null,
  val target: String? = null,
  val detach: Boolean? = null,
```

- [ ] **Step 2: Add git methods** to `intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/GitService.kt` (after `status()`):
```kotlin
  fun createBranch(name: String, hash: String) {
    rawGit(listOf("branch", name, hash))
  }

  fun createTag(name: String, hash: String) {
    rawGit(listOf("tag", name, hash))
  }

  fun deleteBranch(name: String) {
    rawGit(listOf("branch", "-d", name))
  }

  fun deleteTag(name: String) {
    rawGit(listOf("tag", "-d", name))
  }

  fun switchRef(target: String, detach: Boolean) {
    rawGit(if (detach) listOf("switch", "--detach", target) else listOf("switch", target))
  }

  data class BranchInfo(val branch: String, val hasUpstream: Boolean, val remote: String)

  fun currentBranchInfo(): BranchInfo {
    val branch = rawGit(listOf("rev-parse", "--abbrev-ref", "HEAD")).trim()
    val hasUpstream = try {
      rawGit(listOf("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")); true
    } catch (e: Exception) {
      false
    }
    return BranchInfo(branch, hasUpstream, remoteName())
  }

  fun push(setUpstream: Boolean, remote: String, branch: String, tags: Boolean) {
    if (setUpstream) rawGit(listOf("push", "-u", remote, branch)) else rawGit(listOf("push"))
    if (tags) rawGit(listOf("push", remote, "--tags"))
  }
```

- [ ] **Step 3: Add the Messages import + handlers** to `intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/SwimlanesPanel.kt`.

Add the import (with the other `com.intellij.openapi.*` imports):
```kotlin
import com.intellij.openapi.ui.Messages
```
In `handleFromWebview`'s `when (msg.type)`, after `"fetch" -> …`:
```kotlin
      "createBranch" -> onEdt {
        val name = Messages.showInputDialog(project, "Nuovo branch dal commit ${msg.hash!!.take(8)}", "Crea branch", null)
        if (!name.isNullOrBlank()) runGitAction("Crea branch") { git.createBranch(name.trim(), msg.hash) }
      }
      "createTag" -> onEdt {
        val name = Messages.showInputDialog(project, "Nuovo tag dal commit ${msg.hash!!.take(8)}", "Crea tag", null)
        if (!name.isNullOrBlank()) runGitAction("Crea tag") { git.createTag(name.trim(), msg.hash) }
      }
      "deleteBranch" -> onEdt {
        if (Messages.showYesNoDialog(project, "Eliminare il branch \"${msg.name}\"?", "Elimina branch", null) == Messages.YES) {
          runGitAction("Elimina branch") { git.deleteBranch(msg.name!!) }
        }
      }
      "deleteTag" -> onEdt {
        if (Messages.showYesNoDialog(project, "Eliminare il tag \"${msg.name}\"?", "Elimina tag", null) == Messages.YES) {
          runGitAction("Elimina tag") { git.deleteTag(msg.name!!) }
        }
      }
      "checkout" -> onEdt {
        val proceed = msg.detach != true || Messages.showOkCancelDialog(
          project, "Checkout del commit ${msg.target!!.take(8)} — passerai a HEAD detached.", "Checkout", "Continua", "Annulla", null,
        ) == Messages.OK
        if (proceed) runGitAction("Checkout") { git.switchRef(msg.target!!, msg.detach == true) }
      }
      "push" -> handlePush()
```

- [ ] **Step 4: Add the push helper** to `SwimlanesPanel.kt` (next to `runGitAction`). It reads branch info off the EDT, then prompts on the EDT, then pushes off the EDT:
```kotlin
  private fun handlePush() = runOnPooled {
    val info = try {
      git.currentBranchInfo()
    } catch (e: Exception) {
      onEdt { notify("Push non disponibile: ${e.message}", NotificationType.WARNING) }
      return@runOnPooled
    }
    onEdt {
      if (info.branch == "HEAD") {
        notify("HEAD detached, nessun branch da pushare.", NotificationType.WARNING)
        return@onEdt
      }
      val label = if (info.hasUpstream) "Push del branch \"${info.branch}\"?"
        else "Push di \"${info.branch}\" e imposta upstream?"
      val choice = Messages.showDialog(project, label, "Push", arrayOf("Push", "Push + tag", "Annulla"), 0, null)
      if (choice == 0 || choice == 1) {
        runGitAction("Push") { git.push(!info.hasUpstream, info.remote, info.branch, choice == 1) }
      }
    }
  }
```

- [ ] **Step 5: Sync + compile**

```bash
npm run build --workspace @michelepolo/git-swimlanes-engine && npm run sync
cd intellij && export JAVA_HOME="$HOME/.sdkman/candidates/java/current" && ./gradlew compileKotlin --console=plain 2>&1 | tail -5 && cd ..
```
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 6: Commit**

```bash
git add intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/Json.kt intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/GitService.kt intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/SwimlanesPanel.kt
git commit -m "feat(intellij): create/delete ref, checkout, push handlers (native dialogs)"
```

---

### Task 8: Browser verification + full suite

**Files:** none (verification only)

- [ ] **Step 1: Build + sync + full suite**

Run: `npm run build && npm run sync && npm test`
Expected: build OK; all engine tests pass (ContextMenu 5, LaneHeader, GitSwimlanes incl. 4 new, plus existing).

- [ ] **Step 2: Browser-verify** the built IIFE bundle. Serve `packages/engine/dist` and drive a harness whose `__host` logs every `post` and, on `ready`, sends a `setLog` with a tagged HEAD plus a second branch, e.g.:
```
m1|m0|HEAD -> main, tag: v1.0|Ann|2024-01-03|main tip
f1|m0|feature|Ann|2024-01-02|feature tip
m0|||Ann|2024-01-01|base
```
Verify (Playwright/console):
- right-click a commit row → menu with *Crea branch qui / Crea tag qui / Checkout questo commit* (+ *Elimina tag "v1.0"* on m1); clicking *Crea branch qui* posts `{type:"createBranch", hash:"m1"}`;
- right-click the `main` lane label → *Switch a "main"* / *Elimina branch "main"*; clicking delete posts `{type:"deleteBranch", name:"main"}`;
- toolbar *⎇ Nuovo branch* posts `{type:"createBranch", hash:"m1"}`; *⇡ Push* posts `{type:"push"}`;
- Escape and an outside click both dismiss the menu.
Remove the harness + scratch artifacts after; stop the static server.

- [ ] **Step 3: Commit (if any verification-only fixups were needed; otherwise skip)**

```bash
git commit -am "test(engine): Phase 3 verified end-to-end" --allow-empty
```

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-06-10-phase3-nondestructive-ops-design.md`):
- §3 six `Wv2Host` messages → Task 1. ✓
- §4 triggers: commit menu (create/checkout/delete-tag) → Task 4 (h, openCommitMenu); lane-label menu (switch/delete, pseudo-lane excluded) → Task 3 + Task 4 (g, openLaneMenu, PSEUDO_LANES); toolbar New branch/Push → Task 4 (f). ✓
- §5 engine UI: `ContextMenu` → Task 2; LaneHeader hook → Task 3; GitSwimlanes wiring → Task 4; webview map → Task 5. ✓
- §6 host handlers: GitService methods + native prompt/confirm + push-with-tags + currentBranchInfo → Tasks 6 (VS Code), 7 (IntelliJ). ✓
- §7 error UX via `runGitAction` (info/warning), native dialogs → Tasks 6/7. ✓
- §6/§9 detached heads-up; delete confirm; push confirm with tag option; HEAD-detached push guard → Tasks 6/7 handlers + handlePush. ✓
- §9 edge cases: no-tags commit (loop over `c.tags`), pseudo-lane (PSEUDO_LANES), empty repo (`headHash &&` guards the toolbar button), invalid name (validateInput + git), delete current/unmerged branch (`-d`, surfaced), push no remote (`remoteName()` throws → caught) → Tasks 4/6/7. ✓
- §10 testing → Tasks 2,3,4 (unit) + 6,7 (compile) + 8 (browser). ✓
- §11 files → Tasks 1–7 touch exactly those (commit trigger placed at `.sw-rowpos`, so `Graph.tsx`/`Row.tsx` are NOT modified — a cleaner refinement of the spec's estimate). ✓

**Placeholder scan:** No TBD/vague steps. Task 8 Step 2 is a prose browser harness (consistent with Phases 1-2). Task 3 Step 3 notes a small type choice (structural `{preventDefault}` vs `React.MouseEvent`) — concrete guidance, not a placeholder.

**Type consistency:** `MenuItem {label,onSelect,danger?}` defined in Task 2, consumed in Task 4. Messages `createBranch{hash}`/`createTag{hash}`/`deleteBranch{name}`/`deleteTag{name}`/`checkout{target,detach}`/`push` consistent across contract (T1), engine posts (T5), VS Code handlers (T6), IntelliJ DTO+handlers (T7). `GitService` signatures (`createBranch(name,hash)`, `switchRef(target,detach)`, `push({setUpstream,remote,branch,tags})` / Kotlin `push(setUpstream,remote,branch,tags)`, `currentBranchInfo()→{branch,hasUpstream,remote}`) consistent between plan tasks and call sites. `onLaneContextMenu(name,e)` consistent between Task 3 (LaneHeader) and Task 4 (GitSwimlanes).
