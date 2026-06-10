# Phase 4 — Guarded mutations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add revert, cherry-pick, and reset (soft/mixed) — graph-anchored history mutations, each guarded by an explicit confirmation, with conflict surfacing + Abort and a reflog undo hint.

**Architecture:** Extends the Phase 3 pattern: typed `Wv2Host` messages carrying the commit `hash` + host handlers that confirm via native dialogs and run git through a new conflict-aware `runMutation` helper (success → refresh + reflog hint; on failure it checks the git sequencer state and offers Abort, else surfaces the error). No new `Host2Wv`. Engine stays deterministic; the context menu is reused.

**Tech Stack:** TypeScript/React engine (vitest + jsdom), npm workspaces, VS Code extension, Kotlin/Gradle IntelliJ host. Spec: `docs/superpowers/specs/2026-06-10-phase4-guarded-mutations-design.md`. Branches from `main` (Phase 3 merged).

**Conventions:** `npm`/`git` from repo root. IntelliJ build: `export JAVA_HOME="$HOME/.sdkman/candidates/java/current"`. Run `npm run sync` after engine changes a host loads. Italian user-facing strings. Reuse the Phase 3 security pattern: validate every hash `^[0-9a-f]{4,40}$`.

---

### Task 0: Branch

- [ ] **Step 1**

```bash
git checkout main && git pull --ff-only && git checkout -b phase4-guarded-mutations
```

---

### Task 1: Contract — three mutation messages

**Files:** Modify `packages/contract/src/index.ts`

- [ ] **Step 1: Add the messages.** The `Wv2Host` union currently ends with `| { type: "push" };`. Change that to:
```ts
  | { type: "push" }
  | { type: "revert"; hash: string }
  | { type: "cherryPick"; hash: string }
  | { type: "resetTo"; hash: string };
```
(No `Host2Wv` change — reset mode is collected host-side; results flow through `refresh()`.)

- [ ] **Step 2: Build**

Run: `npm run build --workspace @michelepolo/git-swimlanes-contract`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/contract/src/index.ts
git commit -m "feat(contract): revert/cherryPick/resetTo messages"
```

---

### Task 2: `ContextMenu` separator (TDD)

**Files:** Modify `packages/engine/src/ui/ContextMenu.tsx`; Test `packages/engine/test/ContextMenu.test.tsx`

- [ ] **Step 1: Add the failing test** — append inside the describe block in `packages/engine/test/ContextMenu.test.tsx`:
```tsx
  it("renders a divider above a separator item", () => {
    const { container } = render(
      <ContextMenu
        x={0}
        y={0}
        items={[
          { label: "A", onSelect: () => {} },
          { label: "B", onSelect: () => {}, separator: true },
        ]}
        onClose={() => {}}
      />,
    );
    expect(container.querySelector(".ctx-sep")).not.toBeNull();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/ContextMenu.test.tsx --root packages/engine`
Expected: the new test FAILS (no `.ctx-sep`; `separator` not in the type).

- [ ] **Step 3: Edit `packages/engine/src/ui/ContextMenu.tsx`**

Change the import:
```ts
import { useEffect, Fragment } from "react";
```
Add `separator?` to `MenuItem`:
```ts
export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  /** Render a divider above this item (groups menu sections). */
  separator?: boolean;
}
```
Replace the `items.map(...)` block with one that renders the divider:
```tsx
      {items.map((it, i) => (
        <Fragment key={i}>
          {it.separator && <div className="ctx-sep" role="separator" />}
          <button
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
        </Fragment>
      ))}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/ContextMenu.test.tsx --root packages/engine`
Expected: all pass (the prior 5 + this one).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/ui/ContextMenu.tsx packages/engine/test/ContextMenu.test.tsx
git commit -m "feat(engine): ContextMenu separator (menu section divider)"
```

---

### Task 3: `WorkingTreeRow` conflict badge (TDD)

**Files:** Modify `packages/engine/src/ui/WorkingTreeRow.tsx`; Test `packages/engine/test/WorkingTreeRow.test.tsx`

- [ ] **Step 1: Add the failing test** — append inside the describe block in `packages/engine/test/WorkingTreeRow.test.tsx` (reuse the file's existing imports — `render`, `screen`):
```tsx
  it("labels an unmerged (U) file as a conflict", () => {
    render(
      <WorkingTreeRow
        files={[{ index: "U", worktree: "U", path: "src/c.ts" }]}
        expanded
        onToggle={() => {}}
        graphW={100}
        nodeX={30}
      />,
    );
    expect(screen.getByText("conflitto")).toBeInTheDocument(); // the staged/unstaged-style label
    expect(screen.getByText("U")).toBeInTheDocument(); // the badge
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/WorkingTreeRow.test.tsx --root packages/engine`
Expected: FAIL — the `where` label reads "staged", not "conflitto".

- [ ] **Step 3: Edit `packages/engine/src/ui/WorkingTreeRow.tsx`**

(a) In the `fileStatus` switch, add a `U` case (before the `default`):
```ts
    case "U": return { label: "conflitto", color: "#e06c75" };
```
(b) In the file map, change the `where` derivation to flag conflicts. Replace:
```ts
              const where = f.index === "?" ? "untracked" : staged ? "staged" : "unstaged";
```
with:
```ts
              const where = code === "U" ? "conflitto" : f.index === "?" ? "untracked" : staged ? "staged" : "unstaged";
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/WorkingTreeRow.test.tsx --root packages/engine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/ui/WorkingTreeRow.tsx packages/engine/test/WorkingTreeRow.test.tsx
git commit -m "feat(engine): WorkingTreeRow conflict (U) badge"
```

---

### Task 4: GitSwimlanes mutation menu (TDD)

**Files:** Modify `packages/engine/src/ui/GitSwimlanes.tsx`; Test `packages/engine/test/GitSwimlanes.test.tsx`

- [ ] **Step 1: Add the failing test** — append inside the top-level describe block in `packages/engine/test/GitSwimlanes.test.tsx` (reuse the existing `commitsT` fixture added in Phase 3 — `m1` tagged HEAD, first `.sw-rowpos`; the file already imports `render`, `screen`, `fireEvent`, `vi`):
```tsx
  it("opens revert/cherry-pick/reset on the commit menu and fires callbacks", () => {
    const onRevert = vi.fn();
    const onCherryPick = vi.fn();
    const onResetTo = vi.fn();
    const { container } = render(
      <GitSwimlanes commits={commitsT} onRevert={onRevert} onCherryPick={onCherryPick} onResetTo={onResetTo} />,
    );
    fireEvent.contextMenu(container.querySelector(".sw-rowpos")!); // first row = m1
    expect(screen.getByText("Revert questo commit")).toBeInTheDocument();
    expect(screen.getByText("Cherry-pick su HEAD")).toBeInTheDocument();
    expect(screen.getByText("Reset HEAD a questo commit")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Revert questo commit"));
    expect(onRevert).toHaveBeenCalledWith("m1");
  });
```
(If `commitsT` is not defined in the file, add `const commitsT = parseLog(["m1|m0|HEAD -> main|Ann|2024-01-03|tip","m0|||Ann|2024-01-01|base"].join("\n")).commits;` — but Phase 3 already defines it.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/GitSwimlanes.test.tsx --root packages/engine`
Expected: the new test FAILS (no such props/menu items).

- [ ] **Step 3: Edit `packages/engine/src/ui/GitSwimlanes.tsx`**

(a) In `GitSwimlanesProps`, after `onPush?(): void;`:
```ts
  onRevert?(hash: string): void;
  onCherryPick?(hash: string): void;
  onResetTo?(hash: string): void;
```
(b) In the destructuring block, after `onPush,`:
```ts
    onRevert,
    onCherryPick,
    onResetTo,
```
(c) In `openCommitMenu`, after the Phase 3 items (the `onDeleteTag` loop), before the `if (!items.length) return;` line, add the separated mutation group:
```ts
    const mut: MenuItem[] = [];
    if (onRevert) mut.push({ label: "Revert questo commit", onSelect: () => onRevert(c.hash) });
    if (onCherryPick) mut.push({ label: "Cherry-pick su HEAD", onSelect: () => onCherryPick(c.hash) });
    if (onResetTo) mut.push({ label: "Reset HEAD a questo commit", onSelect: () => onResetTo(c.hash) });
    if (mut.length) {
      if (items.length) mut[0].separator = true; // divider only when ref ops sit above
      items.push(...mut);
    }
```

- [ ] **Step 4: Run the suite + typecheck**

Run: `npx vitest run test/GitSwimlanes.test.tsx --root packages/engine && npm run typecheck --workspace @michelepolo/git-swimlanes-engine`
Expected: all pass; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/ui/GitSwimlanes.tsx packages/engine/test/GitSwimlanes.test.tsx
git commit -m "feat(engine): revert/cherry-pick/reset commit-menu group"
```

---

### Task 5: webview wiring + CSS

**Files:** Modify `packages/engine/src/webview.ts`, `packages/engine/src/engine.css`

- [ ] **Step 1: Map callbacks to posts** — in `packages/engine/src/webview.ts`, in the `createElement(GitSwimlanes, { … })` props (next to the Phase 3 `onCheckout`/`onPush` posts), add:
```ts
        onRevert: (hash) => host.post({ type: "revert", hash }),
        onCherryPick: (hash) => host.post({ type: "cherryPick", hash }),
        onResetTo: (hash) => host.post({ type: "resetTo", hash }),
```

- [ ] **Step 2: Style the divider** — append to `packages/engine/src/engine.css` (next to the `.ctx-menu` rules):
```css
.ctx-sep { height: 1px; background: var(--line); margin: 4px 2px; }
```

- [ ] **Step 3: Build + typecheck + full engine suite**

Run: `npm run typecheck --workspace @michelepolo/git-swimlanes-engine && npm test --workspace @michelepolo/git-swimlanes-engine && npm run build --workspace @michelepolo/git-swimlanes-engine`
Expected: typecheck 0; all engine tests pass; `dist/engine.js` emitted.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/webview.ts packages/engine/src/engine.css
git commit -m "feat(engine): wire revert/cherry-pick/reset posts + divider style"
```

---

### Task 6: VS Code host

**Files:** Modify `packages/vscode/src/GitService.ts`, `packages/vscode/src/SwimlanesViewProvider.ts`

- [ ] **Step 1: Add git methods** to `packages/vscode/src/GitService.ts` (after `push(...)`, before the class closing brace):
```ts
  private static assertHash(h: string): void {
    if (!/^[0-9a-f]{4,40}$/.test(h)) throw new Error(`hash non valido: ${h}`);
  }

  async revert(hash: string): Promise<void> {
    GitService.assertHash(hash);
    await run("git", ["revert", "--no-edit", hash], { cwd: this.cwd });
  }

  async cherryPick(hash: string): Promise<void> {
    GitService.assertHash(hash);
    await run("git", ["cherry-pick", hash], { cwd: this.cwd });
  }

  async resetTo(hash: string, mode: "soft" | "mixed"): Promise<void> {
    GitService.assertHash(hash);
    await run("git", ["reset", `--${mode}`, hash], { cwd: this.cwd });
  }

  async revertAbort(): Promise<void> {
    await run("git", ["revert", "--abort"], { cwd: this.cwd });
  }

  async cherryPickAbort(): Promise<void> {
    await run("git", ["cherry-pick", "--abort"], { cwd: this.cwd });
  }

  /** Which sequencer (if any) is mid-operation, so the host can offer Abort. */
  async sequencerState(): Promise<"revert" | "cherryPick" | null> {
    if (await this.refExists("REVERT_HEAD")) return "revert";
    if (await this.refExists("CHERRY_PICK_HEAD")) return "cherryPick";
    return null;
  }

  private async refExists(name: string): Promise<boolean> {
    try {
      await run("git", ["rev-parse", "--verify", "--quiet", name], { cwd: this.cwd });
      return true;
    } catch {
      return false;
    }
  }
```

- [ ] **Step 2: Add the conflict-aware helper** to `packages/vscode/src/SwimlanesViewProvider.ts` (next to `runGitAction`):
```ts
  /**
   * Run a guarded history mutation. On success: refresh + a reflog undo hint. On failure: if a
   * sequencer is mid-operation (conflict), refresh to show it and offer Abort; otherwise warn.
   */
  private async runMutation(label: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
      await this.refresh();
      void vscode.window.showInformationMessage(
        `Git Swimlanes: ${label} completato. Stato precedente in git reflog (HEAD@{1}).`,
      );
    } catch (e) {
      const seq = await this.git.sequencerState();
      if (!seq) {
        void vscode.window.showWarningMessage(`Git Swimlanes: ${label} fallito — ${String(e)}`);
        return;
      }
      await this.refresh();
      const choice = await vscode.window.showWarningMessage(
        `Git Swimlanes: ${label} — conflitto. Risolvi nell'IDE e completa, oppure annulla.`,
        "Annulla operazione",
      );
      if (choice !== "Annulla operazione") return;
      try {
        await (seq === "revert" ? this.git.revertAbort() : this.git.cherryPickAbort());
        await this.refresh();
        void vscode.window.showInformationMessage("Git Swimlanes: operazione annullata.");
      } catch (e2) {
        void vscode.window.showWarningMessage(`Git Swimlanes: annullamento fallito — ${String(e2)}`);
      }
    }
  }
```

- [ ] **Step 3: Add message handlers** — in the `onMessage` switch, after `case "push":`:
```ts
      case "revert": {
        const ok = await vscode.window.showWarningMessage(
          `Revert del commit ${msg.hash.slice(0, 8)}? Creerà un commit che annulla le sue modifiche.`,
          { modal: true },
          "Revert",
        );
        if (ok === "Revert") await this.runMutation("Revert", () => this.git.revert(msg.hash));
        break;
      }
      case "cherryPick": {
        const ok = await vscode.window.showWarningMessage(
          `Cherry-pick del commit ${msg.hash.slice(0, 8)} sul branch corrente?`,
          { modal: true },
          "Cherry-pick",
        );
        if (ok === "Cherry-pick") await this.runMutation("Cherry-pick", () => this.git.cherryPick(msg.hash));
        break;
      }
      case "resetTo": {
        const mode = await vscode.window.showWarningMessage(
          `Reset del branch corrente al commit ${msg.hash.slice(0, 8)}:`,
          { modal: true },
          "Soft (mantieni staged)",
          "Mixed (mantieni unstaged)",
        );
        if (mode === "Soft (mantieni staged)") await this.runMutation("Reset", () => this.git.resetTo(msg.hash, "soft"));
        else if (mode === "Mixed (mantieni unstaged)") await this.runMutation("Reset", () => this.git.resetTo(msg.hash, "mixed"));
        break;
      }
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck --workspace git-swimlanes-vscode && npm run build --workspace git-swimlanes-vscode`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/vscode/src/GitService.ts packages/vscode/src/SwimlanesViewProvider.ts
git commit -m "feat(vscode): revert/cherry-pick/reset handlers (guarded, conflict-aware)"
```

---

### Task 7: IntelliJ host

**Files:** Modify `intellij/.../GitService.kt`, `intellij/.../SwimlanesPanel.kt`

- [ ] **Step 1: Add git methods** to `intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/GitService.kt` (after the Phase 3 `push(...)`):
```kotlin
  private fun assertHash(h: String) {
    require(h.matches(Regex("^[0-9a-f]{4,40}$"))) { "hash non valido: $h" }
  }

  fun revert(hash: String) {
    assertHash(hash)
    rawGit(listOf("revert", "--no-edit", hash))
  }

  fun cherryPick(hash: String) {
    assertHash(hash)
    rawGit(listOf("cherry-pick", hash))
  }

  fun resetTo(hash: String, mode: String) {
    assertHash(hash)
    rawGit(listOf("reset", "--$mode", hash))
  }

  fun revertAbort() {
    rawGit(listOf("revert", "--abort"))
  }

  fun cherryPickAbort() {
    rawGit(listOf("cherry-pick", "--abort"))
  }

  /** Which sequencer (if any) is mid-operation, so the panel can offer Abort. */
  fun sequencerState(): String? = when {
    refExists("REVERT_HEAD") -> "revert"
    refExists("CHERRY_PICK_HEAD") -> "cherryPick"
    else -> null
  }

  private fun refExists(name: String): Boolean = try {
    rawGit(listOf("rev-parse", "--verify", "--quiet", name)); true
  } catch (e: Exception) {
    false
  }
```

- [ ] **Step 2: Add the conflict-aware helper** to `intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/SwimlanesPanel.kt` (next to `runGitAction`; `Messages` is already imported from Phase 3):
```kotlin
  private fun runMutation(label: String, block: () -> Unit) = runOnPooled {
    try {
      block()
      refresh { notify("$label completato. Stato precedente in git reflog (HEAD@{1}).", NotificationType.INFORMATION) }
    } catch (e: Exception) {
      val seq = git.sequencerState()
      if (seq == null) {
        onEdt { notify("$label fallito: ${e.message}", NotificationType.WARNING) }
        return@runOnPooled
      }
      refresh()
      onEdt {
        val abort = Messages.showYesNoDialog(
          project, "$label: conflitto. Annullare l'operazione? (No = risolvi nell'IDE)", "Conflitto",
          "Annulla operazione", "Risolvi nell'IDE", null,
        ) == Messages.YES
        if (abort) runOnPooled {
          try {
            if (seq == "revert") git.revertAbort() else git.cherryPickAbort()
            refresh { notify("Operazione annullata.", NotificationType.INFORMATION) }
          } catch (e2: Exception) {
            onEdt { notify("Annullamento fallito: ${e2.message}", NotificationType.WARNING) }
          }
        }
      }
    }
  }
```

- [ ] **Step 3: Add the `when` branches** — in `handleFromWebview`'s `when (msg.type)`, after the Phase 3 `"push" -> handlePush()`:
```kotlin
      "revert" -> onEdt {
        if (Messages.showOkCancelDialog(
            project, "Revert del commit ${msg.hash!!.take(8)}? Creerà un commit che annulla le sue modifiche.",
            "Revert", "Revert", "Annulla", null,
          ) == Messages.OK) {
          runMutation("Revert") { git.revert(msg.hash) }
        }
      }
      "cherryPick" -> onEdt {
        if (Messages.showOkCancelDialog(
            project, "Cherry-pick del commit ${msg.hash!!.take(8)} sul branch corrente?",
            "Cherry-pick", "Cherry-pick", "Annulla", null,
          ) == Messages.OK) {
          runMutation("Cherry-pick") { git.cherryPick(msg.hash) }
        }
      }
      "resetTo" -> onEdt {
        when (Messages.showDialog(
          project, "Reset del branch corrente al commit ${msg.hash!!.take(8)}:", "Reset",
          arrayOf("Soft (mantieni staged)", "Mixed (mantieni unstaged)", "Annulla"), 0, null,
        )) {
          0 -> runMutation("Reset") { git.resetTo(msg.hash!!, "soft") }
          1 -> runMutation("Reset") { git.resetTo(msg.hash!!, "mixed") }
        }
      }
```

- [ ] **Step 4: Sync + compile**

```bash
npm run build --workspace @michelepolo/git-swimlanes-engine && npm run sync
cd intellij && export JAVA_HOME="$HOME/.sdkman/candidates/java/current" && ./gradlew compileKotlin --console=plain 2>&1 | tail -5 && cd ..
```
Expected: `BUILD SUCCESSFUL` (the pre-existing `JBColor.link()` deprecation warning is acceptable).

- [ ] **Step 5: Commit**

```bash
git add intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/GitService.kt intellij/src/main/kotlin/io/github/michelepolo/gitswimlanes/SwimlanesPanel.kt
git commit -m "feat(intellij): revert/cherry-pick/reset handlers (guarded, conflict-aware)"
```

---

### Task 8: Browser verification + full suite

**Files:** none (verification only)

- [ ] **Step 1: Build + sync + full suite**

Run: `npm run build && npm run sync && npm test`
Expected: build OK; all engine tests pass (ContextMenu incl. separator, WorkingTreeRow incl. conflict, GitSwimlanes incl. mutation menu, plus existing).

- [ ] **Step 2: Browser-verify** the built IIFE bundle. Serve `packages/engine/dist` and drive a harness whose `__host` logs every `post` and, on `ready`, sends a `setLog` with a couple of commits (e.g. `m1|m0|HEAD -> main|Ann|2024-01-03|tip` / `m0|||Ann|2024-01-01|base`). Verify (Playwright/console):
- right-click a commit row → the menu shows the Phase 3 ref ops, then a **divider** (`.ctx-sep`), then **Revert questo commit / Cherry-pick su HEAD / Reset HEAD a questo commit**;
- clicking **Revert questo commit** posts `{type:"revert", hash:"m1"}`; **Cherry-pick su HEAD** posts `{type:"cherryPick", hash:"m1"}`; **Reset HEAD a questo commit** posts `{type:"resetTo", hash:"m1"}`;
- (conflict badge) send `{type:"status", porcelain:"UU src/c.ts"}` and confirm the working-tree row shows the file with a "conflitto" label.
Remove the harness + scratch artifacts after; stop the static server.

- [ ] **Step 3: Commit (only if a verification-only fixup was needed; otherwise skip)**

```bash
git commit -am "test(engine): Phase 4 verified end-to-end" --allow-empty
```

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-06-10-phase4-guarded-mutations-design.md`):
- §3 three `Wv2Host` messages (revert/cherryPick/resetTo, hash only) → Task 1. ✓
- §4 triggers: commit-menu mutation group with a divider → Task 2 (separator) + Task 4 (items, `mut[0].separator`). ✓
- §5 confirmations + flow: revert/cherry-pick confirm; reset soft/mixed dialog; success + reflog hint; conflict → Abort; plain error → warning → Tasks 6 (VS Code) + 7 (IntelliJ) handlers + `runMutation`. ✓
- §6 host handlers: `revert`/`cherryPick`/`resetTo`/`revertAbort`/`cherryPickAbort`/`sequencerState`, hash validation → Tasks 6/7. ✓
- §7 engine UI: ContextMenu separator (T2), GitSwimlanes callbacks+items (T4), webview map (T5), WorkingTreeRow `U` badge (T3), `.ctx-sep` css (T5). ✓
- §8 determinism: engine only emits callbacks; mutations reflected via refresh → T4 (no model change). ✓
- §9 edge cases: clean (refresh+hint), conflict (sequencer→abort), merge-revert/empty-cherry-pick (no sequencer→warning), reset-any-commit, invalid hash (assertHash), `U` badge → Tasks 3/6/7. ✓
- §10 testing → Tasks 2,3,4 (unit) + 6,7 (compile) + 8 (browser). ✓
- §11 files → Tasks 1–7 touch exactly those; `Json.kt` needs no change (messages carry only `hash`, already in `WvMessage`). ✓

**Placeholder scan:** No TBD/vague steps. Task 8 Step 2 is a prose browser harness (consistent with Phases 1-3). Task 4 Step 1 notes the `commitsT` fixture is reused from Phase 3 (with a fallback definition) — concrete, not a placeholder.

**Type consistency:** `MenuItem.separator?` defined in Task 2, used in Task 4. Messages `revert{hash}`/`cherryPick{hash}`/`resetTo{hash}` consistent across contract (T1), engine posts (T5), and both hosts (T6/T7). `GitService` signatures (`revert(hash)`, `cherryPick(hash)`, `resetTo(hash, mode)`, `revertAbort()`, `cherryPickAbort()`, `sequencerState()→"revert"|"cherryPick"|null`) consistent between definition (T6/T7) and call sites (`runMutation`). `runMutation(label, fn)` signature consistent in both hosts.
