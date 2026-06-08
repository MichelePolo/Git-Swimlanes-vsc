package io.github.michelepolo.gitswimlanes

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.jcef.JBCefApp
import javax.swing.JLabel
import javax.swing.SwingConstants

class SwimlanesToolWindowFactory : ToolWindowFactory, DumbAware {
  override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
    val factory = ContentFactory.getInstance()
    val content = if (JBCefApp.isSupported()) {
      val panel = SwimlanesPanel(project, toolWindow.disposable)
      factory.createContent(panel.component, "", false)
    } else {
      factory.createContent(
        JLabel("JCEF non è disponibile in questo IDE: impossibile mostrare Git Swimlanes.", SwingConstants.CENTER),
        "",
        false,
      )
    }
    toolWindow.contentManager.addContent(content)
  }
}
