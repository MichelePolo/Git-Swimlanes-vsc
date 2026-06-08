import { randomBytes } from "node:crypto";
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
  worker-src blob:;
  script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${uri("engine.css")}">
<style>
  /* Map the engine's neutral tokens to VS Code theme colors (dark values as fallback),
     so the panel follows the active editor theme. Lane hues are handled by the engine. */
  :root {
    --bg: var(--vscode-editor-background, #0d1117);
    --panel: var(--vscode-sideBar-background, #11161f);
    --panel2: var(--vscode-editorWidget-background, #0a0e14);
    --line: var(--vscode-panel-border, #222b38);
    --txt: var(--vscode-foreground, #c9d4e3);
    --dim: var(--vscode-descriptionForeground, #6f7d92);
    --accent: var(--vscode-textLink-foreground, #e8b04b);
  }
</style>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${uri("engine.js")}"></script>
  <script nonce="${nonce}" src="${uri("bridge.js")}"></script>
</body>
</html>`;
}

function makeNonce(): string {
  // CSP nonce must be unpredictable: use a CSPRNG, not Math.random().
  // 16 bytes → 128 bits of entropy, base64-encoded (CSP-safe charset).
  return randomBytes(16).toString("base64");
}
