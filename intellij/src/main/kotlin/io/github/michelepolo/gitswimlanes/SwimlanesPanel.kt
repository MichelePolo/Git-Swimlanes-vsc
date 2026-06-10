package io.github.michelepolo.gitswimlanes

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.ui.JBColor
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import com.intellij.util.ui.UIUtil
import git4idea.repo.GitRepository
import git4idea.repo.GitRepositoryChangeListener
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

  private fun hex(c: java.awt.Color): String = "#%02x%02x%02x".format(c.red, c.green, c.blue)

  /** Inline the synced engine bundle so loadHTML needs no relative-path resolution. */
  private fun loadEngine() {
    val css = readResource("/web/engine.css")
    val js = readResource("/web/engine.js")
    browser.loadHTML(buildEngineHtml(css, js))
  }

  fun refresh(onDone: (() -> Unit)? = null) = runOnPooled {
    try {
      val log = git.log()
      val dark = !JBColor.isBright()
      val repos = git.repos()
      val status = try { git.status() } catch (e: Exception) { null }
      onEdt {
        postToWebview(mapOf("type" to "setLog", "log" to log))
        // Lane lightness + base colors follow the IDE theme (JCEF inherits nothing).
        postToWebview(
          mapOf(
            "type" to "theme",
            "theme" to mapOf(
              "laneSaturation" to 68,
              "laneLightness" to if (dark) 60 else 45,
              "bg" to hex(UIUtil.getPanelBackground()),
              "panel" to hex(UIUtil.getPanelBackground()),
              "panel2" to hex(UIUtil.getTextFieldBackground()),
              "txt" to hex(UIUtil.getLabelForeground()),
              "dim" to hex(UIUtil.getInactiveTextColor()),
              "line" to hex(JBColor.border()),
              "accent" to hex(JBColor.link()),
            ),
          ),
        )
        if (repos.size > 1) {
          postToWebview(
            mapOf(
              "type" to "repos",
              "repos" to repos.map { mapOf("id" to it.first, "label" to it.second) },
              "current" to git.currentRootPath(),
            ),
          )
        }
        val (pinned, hidden) = ViewConfigStore.of(project).load(git.currentRootPath())
        postToWebview(
          mapOf("type" to "viewConfig", "config" to mapOf("pinned" to pinned, "hidden" to hidden)),
        )
        if (status != null) postToWebview(mapOf("type" to "status", "porcelain" to status))
        onDone?.invoke()
      }
    } catch (e: Exception) {
      onEdt { notifyWarn("Aggiornamento fallito: ${e.message}") }
    }
  }

  private fun handleFromWebview(request: String) {
    val msg = Json.decode(request)
    when (msg.type) {
      "ready" -> refresh()
      "requestDiff" -> runOnPooled {
        try {
          val unified = git.show(msg.hash!!, msg.path!!, msg.oldPath)
          onEdt { postToWebview(mapOf("type" to "diffResult", "reqId" to msg.reqId, "unified" to unified)) }
        } catch (e: Exception) {
          onEdt { postToWebview(mapOf("type" to "diffError", "reqId" to msg.reqId, "message" to (e.message ?: "git error"))) }
        }
      }
      "openFile" -> onEdt { openInEditor(msg.path!!) }
      "commitSelected" -> Unit // handled (no host action defined yet); the engine shows it
      "selectRepo" -> {
        git.setRepo(msg.id!!)
        refresh()
      }
      "fetchPullRefs" -> runOnPooled {
        try {
          git.fetchPullRefs()
          refresh()
          onEdt { notify("Ref delle pull request scaricati.", NotificationType.INFORMATION) }
        } catch (e: Exception) {
          onEdt { notify("Fetch PR fallito: ${e.message}", NotificationType.WARNING) }
        }
      }
      "pull" -> runGitAction("Pull") { git.pull() }
      "fetch" -> runGitAction("Fetch") { git.fetch() }
      "createBranch" -> onEdt {
        val name = Messages.showInputDialog(project, "Nuovo branch dal commit ${msg.hash!!.take(8)}", "Crea branch", null)
        if (!name.isNullOrBlank()) runGitAction("Crea branch") { git.createBranch(name.trim(), msg.hash) }
      }
      "createTag" -> onEdt {
        val name = Messages.showInputDialog(project, "Nuovo tag dal commit ${msg.hash!!.take(8)}", "Crea tag", null)
        if (!name.isNullOrBlank()) runGitAction("Crea tag") { git.createTag(name.trim(), msg.hash) }
      }
      "deleteBranch" -> onEdt {
        if (Messages.showYesNoDialog(project, "Eliminare il branch \"${msg.name}\"?", "Elimina branch", null) == Messages.YES) {
          runGitAction("Elimina branch") { git.deleteBranch(msg.name!!) }
        }
      }
      "deleteTag" -> onEdt {
        if (Messages.showYesNoDialog(project, "Eliminare il tag \"${msg.name}\"?", "Elimina tag", null) == Messages.YES) {
          runGitAction("Elimina tag") { git.deleteTag(msg.name!!) }
        }
      }
      "checkout" -> onEdt {
        val proceed = msg.detach != true || Messages.showOkCancelDialog(
          project, "Checkout del commit ${msg.target!!.take(8)} — passerai a HEAD detached.", "Checkout", "Continua", "Annulla", null,
        ) == Messages.OK
        if (proceed) runGitAction("Checkout") { git.switchRef(msg.target!!, msg.detach == true) }
      }
      "push" -> handlePush()
      "revert" -> onEdt {
        if (Messages.showOkCancelDialog(
            project, "Revert del commit ${msg.hash!!.take(8)}? Creerà un commit che annulla le sue modifiche.",
            "Revert", "Revert", "Annulla", null,
          ) == Messages.OK) {
          runMutation("Revert") { git.revert(msg.hash) }
        }
      }
      "cherryPick" -> onEdt {
        if (Messages.showOkCancelDialog(
            project, "Cherry-pick del commit ${msg.hash!!.take(8)} sul branch corrente?",
            "Cherry-pick", "Cherry-pick", "Annulla", null,
          ) == Messages.OK) {
          runMutation("Cherry-pick") { git.cherryPick(msg.hash) }
        }
      }
      "resetTo" -> onEdt {
        when (Messages.showDialog(
          project, "Reset del branch corrente al commit ${msg.hash!!.take(8)}:", "Reset",
          arrayOf("Soft (mantieni staged)", "Mixed (mantieni unstaged)", "Annulla"), 0, null,
        )) {
          0 -> runMutation("Reset") { git.resetTo(msg.hash!!, "soft") }
          1 -> runMutation("Reset") { git.resetTo(msg.hash!!, "mixed") }
        }
      }
      "setViewConfig" -> {
        val cfg = msg.config ?: ViewConfigDto()
        ViewConfigStore.of(project).save(git.currentRootPath(), cfg.pinned, cfg.hidden)
        onEdt {
          postToWebview(
            mapOf("type" to "viewConfig", "config" to mapOf("pinned" to cfg.pinned, "hidden" to cfg.hidden)),
          )
        }
      }
    }
  }

  private fun runGitAction(label: String, block: () -> Unit) = runOnPooled {
    try {
      block()
      // Notify only after refresh() has pushed the updated graph/status to the webview,
      // so the success balloon never precedes the visible update (parity with the VS Code host).
      refresh { notify("$label completato.", NotificationType.INFORMATION) }
    } catch (e: Exception) {
      onEdt { notify("$label fallito: ${e.message}", NotificationType.WARNING) }
    }
  }

  private fun runMutation(label: String, block: () -> Unit) = runOnPooled {
    try {
      block()
      refresh { notify("$label completato. Stato precedente in git reflog (HEAD@{1}).", NotificationType.INFORMATION) }
    } catch (e: Exception) {
      val seq = git.sequencerState()
      if (seq == null) {
        onEdt { notify("$label fallito: ${e.message}", NotificationType.WARNING) }
        return@runOnPooled
      }
      // Show the conflict dialog only AFTER refresh has pushed the conflicted state to the
      // webview (the onDone callback fires inside refresh's EDT block) — parity with the
      // awaited VS Code host, so the dialog never precedes the visible conflict files.
      refresh {
        val abort = Messages.showYesNoDialog(
          project, "$label: conflitto. Annullare l'operazione? (No = risolvi nell'IDE)", "Conflitto",
          "Annulla operazione", "Risolvi nell'IDE", null,
        ) == Messages.YES
        if (abort) runOnPooled {
          try {
            if (seq == "revert") git.revertAbort() else git.cherryPickAbort()
            refresh { notify("Operazione annullata.", NotificationType.INFORMATION) }
          } catch (e2: Exception) {
            onEdt { notify("Annullamento fallito: ${e2.message}", NotificationType.WARNING) }
          }
        }
      }
    }
  }

  private fun handlePush() = runOnPooled {
    val info = try {
      git.currentBranchInfo()
    } catch (e: Exception) {
      onEdt { notify("Push non disponibile: ${e.message}", NotificationType.WARNING) }
      return@runOnPooled
    }
    onEdt {
      if (info.branch == "HEAD") {
        notify("HEAD detached, nessun branch da pushare.", NotificationType.WARNING)
        return@onEdt
      }
      val label = if (info.hasUpstream) "Push del branch \"${info.branch}\"?"
        else "Push di \"${info.branch}\" e imposta upstream?"
      val choice = Messages.showDialog(project, label, "Push", arrayOf("Push", "Push + tag", "Annulla"), 0, null)
      if (choice == 0 || choice == 1) {
        runGitAction("Push") { git.push(!info.hasUpstream, info.remote, info.branch, choice == 1) }
      }
    }
  }

  private fun notifyWarn(message: String) = notify(message, NotificationType.WARNING)

  private fun notify(message: String, type: NotificationType) {
    NotificationGroupManager.getInstance()
      .getNotificationGroup("Git Swimlanes")
      .createNotification(message, type)
      .notify(project)
  }

  /**
   * Open the current working-tree file in the editor (engine "openFile").
   *
   * The path is untrusted (derived from git log content): reject absolute paths and `..`
   * segments, and confirm the resolved file is a descendant of the repo root before opening.
   */
  private fun openInEditor(relPath: String) {
    val normalized = relPath.replace('\\', '/')
    if (normalized.startsWith("/") || normalized.split("/").contains("..")) return
    val root = git.currentRepoRoot() ?: return
    val file = root.findFileByRelativePath(normalized) ?: return
    // Resolve symlinks before the containment check, so an in-repo symlink pointing outside
    // the root cannot open an external file (parity with the VS Code realpath guard).
    val realFile = file.canonicalFile ?: file
    val realRoot = root.canonicalFile ?: root
    if (!VfsUtilCore.isAncestor(realRoot, realFile, false)) return
    FileEditorManager.getInstance(project).openFile(realFile, true)
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
      GitRepositoryChangeListener { refresh() },
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
