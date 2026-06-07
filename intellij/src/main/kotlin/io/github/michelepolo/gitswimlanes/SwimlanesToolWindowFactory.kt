package io.github.michelepolo.gitswimlanes

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.jcef.JBCefApp

class SwimlanesToolWindowFactory : ToolWindowFactory, DumbAware {
  override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
    SwimlanesPanel(project, toolWindow.disposable)
    // TODO (spec §4.1): wrap panel.component in Content and add to contentManager.
  }

  override fun isApplicable(project: Project): Boolean = JBCefApp.isSupported()
}
