import { describe, it, expect } from "vitest";
import type { Wv2Host } from "@michelepolo/git-swimlanes-contract";
import { createController } from "../src/webviewController.js";

function setup() {
  const posted: Wv2Host[] = [];
  const states: unknown[] = [];
  const ctrl = createController({ post: (m) => posted.push(m) }, (s) => states.push(s));
  return { ctrl, posted, states };
}

describe("webview controller (host↔engine routing)", () => {
  it("posts a requestDiff and resolves on the matching diffResult", async () => {
    const { ctrl, posted } = setup();
    const p = ctrl.requestDiff({ hash: "abc1234", path: "a.ts" });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ type: "requestDiff", hash: "abc1234", path: "a.ts" });
    const reqId = (posted[0] as { reqId: string }).reqId;
    ctrl.receive({ type: "diffResult", reqId, unified: "DIFF" });
    await expect(p).resolves.toEqual({ unified: "DIFF" });
  });

  it("rejects the pending diff on a matching diffError", async () => {
    const { ctrl, posted } = setup();
    const p = ctrl.requestDiff({ hash: "abc1234", path: "a.ts" });
    ctrl.receive({ type: "diffError", reqId: (posted[0] as { reqId: string }).reqId, message: "boom" });
    await expect(p).rejects.toThrow("boom");
  });

  it("ignores a diffResult whose reqId is unknown (request stays pending)", async () => {
    const { ctrl } = setup();
    const p = ctrl.requestDiff({ hash: "abc1234", path: "a.ts" });
    let settled = false;
    void p.then(() => (settled = true));
    ctrl.receive({ type: "diffResult", reqId: "nope", unified: "X" });
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it("uses a distinct reqId per request", () => {
    const { ctrl, posted } = setup();
    void ctrl.requestDiff({ hash: "a", path: "x" });
    void ctrl.requestDiff({ hash: "b", path: "y" });
    const ids = posted.map((m) => (m as { reqId: string }).reqId);
    expect(new Set(ids).size).toBe(2);
  });

  it("pushes new state to onState on setLog", () => {
    const { ctrl, states } = setup();
    ctrl.receive({ type: "setLog", log: "LOG" });
    expect(states.at(-1)).toMatchObject({ log: "LOG" });
  });

  it("stores commits and theme on init", () => {
    const { ctrl, states } = setup();
    const theme = { laneSaturation: 68, laneLightness: 45 };
    ctrl.receive({ type: "init", commits: [], theme });
    expect(states.at(-1)).toMatchObject({ commits: [], theme });
  });

  it("updates the theme on a theme message", () => {
    const { ctrl, states } = setup();
    ctrl.receive({ type: "theme", theme: { laneSaturation: 68, laneLightness: 60 } });
    expect((states.at(-1) as { theme: { laneLightness: number } }).theme).toMatchObject({ laneLightness: 60 });
  });

  it("stores repos and current on a repos message", () => {
    const { ctrl, states } = setup();
    ctrl.receive({ type: "repos", repos: [{ id: "/a", label: "a" }, { id: "/b", label: "b" }], current: "/a" });
    expect(states.at(-1)).toMatchObject({ repos: [{ id: "/a", label: "a" }, { id: "/b", label: "b" }], currentRepo: "/a" });
  });

  it("preserves repos across a setLog (a refresh must not drop the selector)", () => {
    const { ctrl, states } = setup();
    ctrl.receive({ type: "repos", repos: [{ id: "/a", label: "a" }], current: "/a" });
    ctrl.receive({ type: "setLog", log: "LOG" });
    expect(states.at(-1)).toMatchObject({ log: "LOG", repos: [{ id: "/a", label: "a" }], currentRepo: "/a" });
  });

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
});
