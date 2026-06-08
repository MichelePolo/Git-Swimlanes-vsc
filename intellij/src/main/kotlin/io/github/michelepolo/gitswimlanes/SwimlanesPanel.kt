package io.github.michelepolo.gitswimlanes

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.ui.JBColor
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import git4idea.repo.GitRepository
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLoadHandlerAdapter
import javax.swing.JComponent

/**
 * JCEF panel hosting the engine. Owns the JBCefBrowser, the JBCefJSQuery bridge, and the
 * host↔webview message router. See git-swimlanes-intellij-spec.md §4.2.
 *
 * JCEF handshake differs from VS Code: there is no bridge.js. The engine boots at
 * DOMContentLoaded and exposes window.GitSwimlanes.receive; once the page has loaded
 * (onLoadEnd) the host installs window.__host and pushes the log directly — it does not
 * rely on the engine's onReady callback (which has already fired as a no-op by then).
 */
class SwimlanesPanel(private val project: Project, parent: Disposable) {
  private val git = GitService(project)
  private val browser = JBCefBrowser()
  private val query = JBCefJSQuery.create(browser as JBCefBrowserBase)

  val component: JComponent get() = browser.component

  init {
    Disposer.register(parent, browser)
    Disposer.register(parent, query)

    // JS -> Java: window.__host.post(msg) arrives here as a JSON string.
    query.addHandler { request ->
      handleFromWebview(request)
      null
    }

    browser.jbCefClient.addLoadHandler(object : CefLoadHandlerAdapter() {
      override fun onLoadEnd(b: CefBrowser, frame: CefFrame, httpStatusCode: Int) {
        if (!frame.isMain) return
        browser.cefBrowser.executeJavaScript(
          "window.__host = { post: function(msg){ ${query.inject("JSON.stringify(msg)")} } };",
          browser.cefBrowser.url, 0,
        )
        refresh()
      }
    }, browser.cefBrowser)

    loadEngine()
    subscribeRepoChanges(parent)
  }

  /** Inline the synced engine bundle so loadHTML needs no relative-path resolution. */
  private fun loadEngine() {
    val css = readResource("/web/engine.css")
    val js = readResource("/web/engine.js")
    browser.loadHTML(
      """
      <!DOCTYPE html>
      <html lang="it"><head><meta charset="utf-8"><style>$css</style></head>
      <body><div id="app"></div><script>$js</script></body></html>
      """.trimIndent(),
    )
  }

  fun refresh() = runOnPooled {
    try {
      val log = git.log()
      val dark = !JBColor.isBright()
      onEdt {
        postToWebview(mapOf("type" to "setLog", "log" to log))
        postToWebview(
          mapOf(
            "type" to "theme",
            "theme" to mapOf("laneSaturation" to 68, "laneLightness" to if (dark) 60 else 45),
          ),
        )
      }
    } catch (e: Exception) {
      onEdt { postToWebview(mapOf("type" to "diffError", "reqId" to "*", "message" to (e.message ?: "git error"))) }
    }
  }

  private fun handleFromWebview(request: String) {
    val msg = Json.decode(request)
    when (msg.type) {
      "ready" -> refresh()
      "requestDiff" -> runOnPooled {
        try {
          val unified = git.show(msg.hash!!, msg.path!!)
          onEdt { postToWebview(mapOf("type" to "diffResult", "reqId" to msg.reqId, "unified" to unified)) }
        } catch (e: Exception) {
          onEdt { postToWebview(mapOf("type" to "diffError", "reqId" to msg.reqId, "message" to (e.message ?: "git error"))) }
        }
      }
      // "openFile", "commitSelected": TODO (spec §4.2)
    }
  }

  /** Java -> JS: deliver a message to the engine. */
  private fun postToWebview(msg: Any) {
    val json = Json.encode(msg)
    val esc = json.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "")
    browser.cefBrowser.executeJavaScript(
      "window.GitSwimlanes && window.GitSwimlanes.receive(JSON.parse('$esc'));",
      browser.cefBrowser.url, 0,
    )
  }

  private fun subscribeRepoChanges(parent: Disposable) {
    project.messageBus.connect(parent).subscribe(
      GitRepository.GIT_REPO_CHANGE,
      git4idea.repo.GitRepositoryChangeListener { refresh() },
    )
  }

  private fun readResource(path: String): String =
    javaClass.getResourceAsStream(path)?.bufferedReader()?.use { it.readText() }
      ?: throw IllegalStateException("risorsa non trovata: $path")

  private fun runOnPooled(block: () -> Unit) {
    ApplicationManager.getApplication().executeOnPooledThread { block() }
  }

  private fun onEdt(block: () -> Unit) {
    ApplicationManager.getApplication().invokeLater(block)
  }
}
