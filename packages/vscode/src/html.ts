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
  script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${uri("engine.css")}">
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${uri("engine.js")}"></script>
  <script nonce="${nonce}" src="${uri("bridge.js")}"></script>
</body>
</html>`;
}

function makeNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
