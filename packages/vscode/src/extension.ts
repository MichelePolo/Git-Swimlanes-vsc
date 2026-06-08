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
  const provider = new SwimlanesViewProvider(ctx, git, root);

  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SwimlanesViewProvider.viewId, provider),
    vscode.commands.registerCommand("gitSwimlanes.refresh", () => provider.refresh()),
  );
}

export function deactivate(): void {}
