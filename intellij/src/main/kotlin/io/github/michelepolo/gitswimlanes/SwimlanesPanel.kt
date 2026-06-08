package io.github.michelepolo.gitswimlanes

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.util.Disposer
import com.intellij.ui.JBColor
import git4idea.repo.GitRepositoryManager
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import git4idea.repo.GitRepository
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLoadHandlerAdapter
import java.util.Base64
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
      "openFile" -> onEdt { openInEditor(msg.path!!) }
      "commitSelected" -> Unit // handled (no host action defined yet); the engine shows it
    }
  }

  /** Open the current working-tree file in the editor (engine "openFile"). */
  private fun openInEditor(relPath: String) {
    val root = GitRepositoryManager.getInstance(project).repositories.firstOrNull()?.root ?: return
    val file = root.findFileByRelativePath(relPath) ?: return
    FileEditorManager.getInstance(project).openFile(file, true)
  }

  /**
   * Java -> JS: deliver a message to the engine.
   *
   * The JSON is base64-encoded rather than escaped into a JS string literal: the base64
   * alphabet is ASCII-safe (no quotes, no line terminators such as U+2028/U+2029), so it
   * cannot break out of the literal or inject code. TextDecoder reconstructs the UTF-8
   * string (preserving accented authors/paths) before JSON.parse.
   */
  private fun postToWebview(msg: Any) {
    val json = Json.encode(msg)
    val b64 = Base64.getEncoder().encodeToString(json.toByteArray(Charsets.UTF_8))
    browser.cefBrowser.executeJavaScript(
      "window.GitSwimlanes && window.GitSwimlanes.receive(" +
        "JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('$b64'), function(c){return c.charCodeAt(0);}))));",
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
