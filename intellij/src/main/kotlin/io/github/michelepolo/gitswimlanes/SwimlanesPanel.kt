package io.github.michelepolo.gitswimlanes

import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project

/**
 * JCEF panel hosting the engine. Owns the JBCefBrowser, the JBCefJSQuery bridge,
 * and the host↔webview message router. See git-swimlanes-intellij-spec.md §4.2.
 */
class SwimlanesPanel(private val project: Project, parent: Disposable) {
  private val git = GitService(project)

  // TODO (spec §4.2): JBCefBrowser + JBCefJSQuery, inject window.__host on onLoadEnd,
  //   load /web/index.html, route ready/requestDiff/openFile, push diffResult/theme.

  fun refresh() {
    // TODO (spec §4.2): runOnPooled { git.log() } then invokeLater { postToWebview(setLog) }.
    throw NotImplementedError("SwimlanesPanel.refresh — see spec §4.2")
  }
}
