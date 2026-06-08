import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import type { Host2Wv, Theme, Wv2Host } from "@michelepolo/git-swimlanes-contract";
import { GitService } from "./GitService.js";
import { buildHtml } from "./html.js";

export class SwimlanesViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "gitSwimlanes.graph";
  private view?: vscode.WebviewView;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly git: GitService,
    private readonly repoRoot: string,
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
    this.postTheme();
  }

  /** Lane lightness follows the editor theme: lighter (dimmer) on light themes. */
  postTheme(): void {
    const kind = vscode.window.activeColorTheme.kind;
    const dark = kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast;
    const theme: Theme = { laneSaturation: 68, laneLightness: dark ? 60 : 45 };
    this.post({ type: "theme", theme });
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
      case "openFile":
        await this.openFile(msg.path);
        break;
      case "commitSelected":
        // No host-side action defined yet; the engine already shows the selection.
        // Wired so the message is handled rather than silently dropped (hook point).
        break;
    }
  }

  /**
   * Open the current working-tree file in the editor (engine "openFile").
   *
   * The path comes from the webview (derived from git log content), so it is treated as
   * untrusted: reject absolute paths and `..` segments, then confirm the resolved realpath
   * stays inside the repo root before opening (defends against traversal and symlink escape).
   */
  private async openFile(relPath: string): Promise<void> {
    const normalized = path.normalize(relPath);
    if (path.isAbsolute(normalized) || normalized.split(path.sep).includes("..")) return;
    try {
      const full = path.resolve(this.repoRoot, normalized);
      const [real, realRoot] = await Promise.all([fs.promises.realpath(full), fs.promises.realpath(this.repoRoot)]);
      if (real !== realRoot && !real.startsWith(realRoot + path.sep)) return;
      await vscode.window.showTextDocument(vscode.Uri.file(real), { preview: false });
    } catch {
      void vscode.window.showWarningMessage(`Git Swimlanes: impossibile aprire ${relPath}`);
    }
  }

  private post(msg: Host2Wv): void {
    void this.view?.webview.postMessage(msg);
  }
}
