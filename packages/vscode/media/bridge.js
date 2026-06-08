// VS Code transport: postMessage in both directions.
// This file runs before the engine has booted (scripts at end of <body> run while
// the document is still parsing), so it must not assume window.GitSwimlanes exists.
const vscode = acquireVsCodeApi();
window.__host = {
  post: (msg) => vscode.postMessage(msg),
  // UI-state persistence across hide/show (the webview is destroyed when hidden).
  getState: () => vscode.getState(),
  setState: (state) => vscode.setState(state),
};

// Create the surface defensively; the engine's boot merges its receive() into it
// and then calls onReady(), regardless of which script ran first.
window.GitSwimlanes = window.GitSwimlanes || {};
window.GitSwimlanes.onReady = () => window.__host.post({ type: "ready" });

// Host -> webview messages arrive as window 'message' events.
window.addEventListener("message", (e) => window.GitSwimlanes.receive(e.data));
