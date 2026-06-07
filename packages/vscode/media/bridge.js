// VS Code transport: postMessage in both directions.
const vscode = acquireVsCodeApi();
window.__host = { post: (msg) => vscode.postMessage(msg) };
window.addEventListener("message", (e) => window.GitSwimlanes.receive(e.data));
// Tell the host the engine is ready to receive init/setLog.
window.GitSwimlanes.onReady = () => window.__host.post({ type: "ready" });
