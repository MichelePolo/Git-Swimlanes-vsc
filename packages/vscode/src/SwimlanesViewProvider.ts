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

  /** Open the current working-tree file in the editor (engine "openFile"). */
  private async openFile(relPath: string): Promise<void> {
    const uri = vscode.Uri.joinPath(vscode.Uri.file(this.repoRoot), relPath);
    try {
      await vscode.window.showTextDocument(uri, { preview: false });
    } catch {
      void vscode.window.showWarningMessage(`Git Swimlanes: impossibile aprire ${relPath}`);
    }
  }

  private post(msg: Host2Wv): void {
    void this.view?.webview.postMessage(msg);
  }
}
