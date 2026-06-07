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
